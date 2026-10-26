import * as THREE from 'three/webgpu';
import * as TSLTyped from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Engine, EngineInit, Scene } from './types';
import { COLORS } from './types';
import type { SimParams } from './params';
import {
  BOUND_REFLECT, BOUND_ZONE, BOX_TURN, CURIOUS_REACH, defaultParams, FAR_DIM, FAR_SIZE, FAR_Z, FIELD_H, FIELD_MARGIN, FIELD_VEL_SCALE, FIELD_W,
  CULL_INSET, HOLE_KICK, HOLE_PUSH, HOLE_TURN, STILL_HOLE, KO_PUSH, KO_TURN, MAX_KEEPOUT, STEER_M, TRANSIT_DIP,
} from './params';
import { FLOW_WAVES, WAVE_K, WAVE_W } from './flow';
import type { Targets } from '../shapes';
import { makeSeeds } from '../hash';
import { GROUP_FLOATS, GROUP_ROWS, GROUP_TEXELS, HIST, T_HIST, T_LOOK, T_POSE, T_PREV, T_PREV_LOOK } from '../perform';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL node types are too loose to annotate usefully */
type N = any;
// TSL's generic typings fight swizzles/selects in a kernel this size; the kernel is verified at runtime instead.
const TSL: N = TSLTyped;
const {
  Fn, If, instancedArray, instanceIndex, uniform, float, vec2, vec3, vec4, texture, uv, sin, cos, atan, length,
  clamp, smoothstep, mix, max, min, select, step, exp, pow, cameraViewMatrix, pass, PI, textureLoad, ivec2, fract, sqrt, abs, floor,
} = TSL;

/** Width of the data textures that hold read-only per-particle data for the compute kernel. */
const TEX_W = 256;

/**
 * The field target is rendered at FIELD_RES pixels per cell so the splat kernel (radius 1.5 cells = 4.5 px) is
 * well sampled. With 1 px per cell the rasterised kernel is quantised to texel centres and the density
 * gradient grows a lattice of worm-like filaments (seen in QA). Values are normalised to "particles per cell"
 * like the CPU simulator: ∫(1-r/R)² over a disc = πR²/6 px², and a cell is FIELD_RES² px.
 */
const BLOOM_STRENGTH = 0.28;
/** Share of the speed hue removed for particles attracted to a shape (V.w). */
const HELD_HUE_CUT = 0.75;
const FIELD_RES = 3;
/**
 * Splat radius 2 cells (was 1.5): the field must not hold density waves shorter than ~2 cells, because a
 * central difference over ±h reads a wave of wavelength λ with the sign of sin(2πh/λ) — inverted for
 * h < λ < 2h. With 1.5-cell splats and ±1-cell differences, separation became attraction at λ ≈ 2 cells
 * (≈ 40 px) and the flock grew horizontal stripes (QA v3 A-desktop-webgpu idle11s).
 */
const SPLAT_CELLS = 2;
const SPLAT_R_PX = SPLAT_CELLS * FIELD_RES;
const KERNEL_NORM = (FIELD_RES * FIELD_RES) / ((Math.PI * SPLAT_R_PX * SPLAT_R_PX) / 6);

function flowTSL(xy: N, t: N, freq: N): N {
  let vx: N = float(0), vy: N = float(0), vz: N = float(0);
  for (const [kx, ky, fm, om, ph, w] of FLOW_WAVES) {
    const a = xy.x.mul(kx).add(xy.y.mul(ky)).mul(freq.mul(fm)).add(t.mul(om)).add(ph);
    const c = cos(a);
    vx = vx.add(c.mul(w * ky));
    vy = vy.sub(c.mul(w * kx));
    vz = vz.add(sin(a.mul(0.7).add(ph)).mul(w * 0.35));
  }
  return vec3(vx, vy, vz);
}

/** TSL mirror of params.exitByX. */
const exitByXT = (nearer: N, vx: N, vy: N): N => vx.and(vy).and(nearer).or(vx.and(vy.not())).or(vx.not().and(vy.not()).and(nearer));

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * three.js WebGPURenderer engine. Runs on the WebGPU backend, or on three's WebGL2 backend (forceWebGL).
 * Simulation is a TSL compute kernel (transform feedback under WebGL2). Neighbourhood for boids is a
 * low-res velocity/density field: particles are splatted additively into a half-float render target,
 * then the kernel samples it (alignment = local mean velocity, separation/cohesion = density gradient).
 * Works on both backends because it needs no atomics and no random-access buffer reads.
 */
export class GpuEngine implements Engine {
  readonly backend: 'webgpu' | 'webgl2';
  readonly count: number;
  private canvas: HTMLCanvasElement;
  private o: EngineInit;
  private renderer!: THREE.WebGPURenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);
  private splatScene = new THREE.Scene();
  private splatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  private fieldRT!: THREE.RenderTarget;
  private pipeline: THREE.RenderPipeline | null = null;
  private bloomNode: N = null;
  private material!: THREE.SpriteNodeMaterial;
  private sprite!: THREE.Sprite;
  private splatSprite!: THREE.Sprite;
  private simNode!: N;
  private U: Record<keyof SimParams, N> = {} as never;
  private uField = { min: uniform(new THREE.Vector2()), size: uniform(new THREE.Vector2(1, 1)), cell: uniform(10), densRef: uniform(1) };
  private uLook = { base: uniform(new THREE.Color()), fast: uniform(new THREE.Color()), alpha: uniform(0.6), dark: uniform(1) };
  /** the camera's distance to the z = 0 plane (CSS px): the keep-out cull projects each dot with it */
  private uDepth = uniform(1);
  private buf: Record<'pos' | 'vel' | 'col' | 'seed', N> = {} as never;
  /**
   * Read-only inputs of the kernel live in float data textures, not storage buffers: three's WebGL2 backend
   * runs compute as transform feedback and binds every storage buffer the kernel touches as a feedback
   * varying (max 4), so only pos/vel/col may be storage. Same layout on WebGPU keeps one code path.
   */
  private tex: Record<'seed' | 'ta' | 'tb' | 'ca' | 'cb' | 'tg', THREE.DataTexture> = {} as never;
  /** a performed scene's groups (wave 3 show): poses / looks / trail history, one row per group (engine/perform.ts) */
  private grpTex!: THREE.DataTexture;
  private sceneMode: Scene;
  private cssW = 1; private cssH = 1;
  private shot: ((b: Blob | null) => void) | null = null;

  constructor(o: EngineInit, backend: 'webgpu' | 'webgl2') {
    this.o = o; this.canvas = o.canvas; this.count = o.count; this.backend = backend; this.sceneMode = o.scene;
  }

  get actualBackend(): 'webgpu' | 'webgl2' {
    return (this.renderer?.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend ? 'webgpu' : 'webgl2';
  }

  async init(): Promise<void> {
    const r = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: false, alpha: false, forceWebGL: this.backend === 'webgl2', powerPreference: 'high-performance' });
    await r.init();
    this.renderer = r;
    const n = this.count;
    const mk = (a?: Float32Array): N => (a ? instancedArray(a, 'vec4') : instancedArray(n, 'vec4'));
    this.buf.pos = mk(new Float32Array(n * 4)); this.buf.vel = mk(new Float32Array(n * 4)); this.buf.col = mk(new Float32Array(n * 4));
    const seeds = makeSeeds(n);
    this.buf.seed = mk(seeds);
    const H = Math.ceil(n / TEX_W);
    const mkTex = (): THREE.DataTexture => {
      const t = new THREE.DataTexture(new Float32Array(TEX_W * H * 4), TEX_W, H, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      return t;
    };
    for (const k of ['seed', 'ta', 'tb', 'ca', 'cb', 'tg'] as const) this.tex[k] = mkTex();
    (this.tex.seed.image.data as Float32Array).set(seeds);
    this.setGroups(null);
    this.grpTex = new THREE.DataTexture(new Float32Array(GROUP_FLOATS), GROUP_TEXELS, GROUP_ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.grpTex.minFilter = THREE.NearestFilter; this.grpTex.magFilter = THREE.NearestFilter; this.grpTex.generateMipmaps = false; this.grpTex.needsUpdate = true;
    for (const k of Object.keys(defaultParams()) as (keyof SimParams)[]) this.U[k] = uniform(0);

    this.fieldRT = new THREE.RenderTarget(FIELD_W * FIELD_RES, FIELD_H * FIELD_RES, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.buildSplat();
    this.buildSim();
    this.buildRender();
    this.setScene(this.sceneMode);
  }

  private buildSplat(): void {
    const { pos, vel } = this.buf;
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor;
    m.blendEquation = THREE.AddEquation; m.blendEquationAlpha = THREE.AddEquation;
    m.premultipliedAlpha = false;
    const P = pos.toAttribute(), V = vel.toAttribute();
    m.positionNode = vec3(P.x, P.y, 0);
    m.scaleNode = vec2(this.uField.cell.mul(SPLAT_CELLS * 2)); // diameter 2 × SPLAT_CELLS cells
    const d = length(uv().sub(0.5)).mul(2);
    const k = pow(max(float(1).sub(d), 0), 2).mul(KERNEL_NORM);
    m.fragmentNode = vec4(V.xyz.mul(FIELD_VEL_SCALE).mul(k), k);
    this.splatSprite = new THREE.Sprite(m);
    this.splatSprite.count = this.count;
    this.splatSprite.frustumCulled = false;
    this.splatScene.add(this.splatSprite);
  }

  private buildSim(): void {
    const U = this.U, F = this.uField;
    const UU = U as Record<string, N>;
    // the dim frame's slot: the last used keep-out slot while koFrame is on (see controller / cpu.ts)
    const frameSlot = (k: number): N => U.koFrame.greaterThan(0).and(UU[`ko${k}w`].greaterThan(0)).and(k + 1 < MAX_KEEPOUT ? UU[`ko${k + 1}w`].lessThanEqual(0) : float(1).greaterThan(0));
    // its faces blocked by a neighbouring keep-out (s = the face's side: +1 right / top, −1 left / bottom)
    const blockedX = (sx: N): N => select(sx.greaterThan(0), U.koFbR, U.koFbL).greaterThan(0.5);
    const blockedY = (sy: N): N => select(sy.greaterThan(0), U.koFbT, U.koFbB).greaterThan(0.5);
    const { pos, vel, col } = this.buf;
    const X = this.tex;
    const fieldTex = this.fieldRT.texture;
    // The splat camera renders world +y to the top of the target, which texture space (in three, on both
    // backends) reads at v = 0 — so world y maps to 1 - v. Verified with qa/knot.mjs: without the flip the
    // density gradient is mirrored and separation turns into attraction (the flock collapses into knots).
    const fieldUV = (xy: N): N => { const u = xy.sub(F.min).div(F.size); return vec2(u.x, float(1).sub(u.y)); };
    const sampleField = (xy: N): N => texture(fieldTex, fieldUV(xy), 0);
    this.simNode = Fn(() => {
      const i = instanceIndex;
      const P = pos.element(i), V = vel.element(i);
      const tc = ivec2(i.mod(TEX_W).toInt(), i.div(TEX_W).toInt()).toVar();
      const S = textureLoad(X.seed, tc).toVar();
      const A = textureLoad(X.ta, tc).toVar(), B = textureLoad(X.tb, tc).toVar();
      const p = P.xyz.toVar(), v = V.xyz.toVar();
      const elapsed = U.time.sub(U.phaseStart);
      const dly = B.w.mul(U.spread);
      const switched = elapsed.greaterThanEqual(dly);
      const T = select(switched, B.xyz, A.xyz).toVar();
      const TC = select(switched, textureLoad(X.cb, tc), textureLoad(X.ca, tc)).toVar();
      const sel = step(S.w, U.selectFrac);
      const wDes = select(switched, U.goal, U.prevGoal).mul(sel).toVar();
      const w = V.w.toVar();
      const stepW = U.dt.div(U.ramp);
      w.addAssign(clamp(wDes.sub(w), stepW.negate(), stepW));
      const local = clamp(elapsed.sub(dly).div(U.ramp), 0, 1);
      // shape → shape: a shallow mid-flight dip only (paths swoop, nothing disperses; POLISH1 B4)
      const wEff = w.mul(float(1).sub(U.transit.mul(sin(local.mul(PI))).mul(TRANSIT_DIP))).toVar();
      // a performed scene's group (wave 3 show): pose the local target, and feed the shape's own motion forward
      // (trail particles take their pose from the group's recent history instead, and fade along it)
      const GI = textureLoad(X.tg, tc).toVar();
      const GT = this.grpTex;
      const inG = U.grpOn.greaterThan(0).and(GI.x.greaterThan(-0.5)).and(switched);
      const ff = vec3(0).toVar();
      const visG = float(0).toVar();
      If(inG, () => {
        const gy = GI.x.add(0.5).toInt();
        const pose = textureLoad(GT, ivec2(T_POSE, gy)).toVar();
        const look = textureLoad(GT, ivec2(T_LOOK, gy));
        const prev = textureLoad(GT, ivec2(T_PREV, gy));
        const plook = textureLoad(GT, ivec2(T_PREV_LOOK, gy));
        const sxN = look.x.toVar();
        const trail = GI.y.greaterThan(0);
        If(trail, () => {
          const k = GI.y.mul(HIST - 1);
          const i0 = floor(k);
          const h0 = textureLoad(GT, ivec2(i0.toInt().add(T_HIST), gy));
          const h1 = textureLoad(GT, ivec2(min(i0.add(1), HIST - 1).toInt().add(T_HIST), gy));
          const h = mix(h0, h1, k.sub(i0));
          pose.assign(vec4(h.x, h.y, h.z, pose.w));
          sxN.assign(h.w.div(max(abs(pose.w), 1e-4)));
        });
        const posed = (q: N, sxv: N): N => {
          const c = cos(q.z), sn = sin(q.z);
          const lx = T.x.mul(q.w).mul(sxv), ly = T.y.mul(q.w);
          return vec3(q.x.add(lx.mul(c)).sub(ly.mul(sn)), q.y.add(lx.mul(sn)).add(ly.mul(c)), T.z.mul(q.w));
        };
        const now = posed(pose, sxN).toVar();
        // the feed-forward is the group's own motion now (for a trail particle too: it rides the path just behind,
        // at about the same speed — without it the trail lagged a gap behind the shape)
        const cur = textureLoad(GT, ivec2(T_POSE, gy));
        const before = posed(prev, plook.x);
        ff.assign(select(U.dt.greaterThan(1e-5), posed(cur, look.x).sub(before).div(max(U.dt, 1e-5)), vec3(0)));
        T.assign(now);
        visG.assign(step(GI.z.add(1e-5), look.z).mul(look.y).mul(select(trail, float(1).sub(GI.y.mul(0.85)), float(1))).sub(1));
      });
      // target transform: Y sway (3D), breathing scale, listening ring pulse
      If(U.spinOn.greaterThan(0), () => {
        const dx = T.x.sub(U.shapeCx).toVar();
        const c = cos(U.rotY), sn = sin(U.rotY);
        const nz = dx.mul(sn).add(T.z.mul(c)).toVar();
        T.x.assign(U.shapeCx.add(dx.mul(c)).sub(T.z.mul(sn)));
        T.z.assign(nz);
      });
      const ctr = vec2(U.shapeCx, U.shapeCy);
      T.xy.assign(ctr.add(T.xy.sub(ctr).mul(U.targetScale)));
      If(U.ringOn.greaterThan(0), () => {
        const rr = T.xy.sub(ctr).toVar();
        const ang = atan(rr.y, rr.x);
        const k = float(1).add(U.ringLevel.mul(float(0.34).add(sin(ang.mul(5).add(U.time.mul(6))).mul(0.16))));
        T.xy.assign(ctr.add(rr.mul(k)));
      });
      const free = float(1).sub(wEff.mul(0.94)).toVar();
      const fb = float(1).sub(wEff).pow(2).toVar(); // flocking forces vanish inside a held shape (keeps counters open)
      const acc = vec3(0).toVar();
      // pointer geometry; curious particles (B2, see cpu.ts) leave the flock for a still cursor nearby
      const q = p.xy.sub(vec2(U.pointerX, U.pointerY)).toVar();
      const qr = max(length(q), 1e-3).toVar();
      const cuSel = step(fract(S.x.mul(31.7).add(S.z.mul(3.1))), U.curiousFrac.sub(1e-4)).mul(step(1e-4, U.curiousFrac));
      const cu = cuSel.mul(U.curious).mul(clamp(float(CURIOUS_REACH).sub(qr).div(80), 0, 1)).mul(free).mul(step(1e-4, U.pointerOn)).toVar();
      const keep = float(1).sub(cu).toVar();
      // flow
      const fl = flowTSL(p.xy, U.time, U.flowFreq).toVar();
      const fa = U.flowAmp.mul(U.wild.mul(2.5).add(1));
      acc.addAssign(vec3(fl.xy.mul(fa), fl.z.mul(fa).mul(0.5)).sub(v).mul(free.mul(U.flowRate).mul(U.wild.mul(3).add(1)).mul(keep)));
      If(U.wild.greaterThan(0), () => { // celebrate: every particle chases its own spinning heading
        const ja = S.x.mul(6.2832).add(U.time.mul(S.y.mul(4).add(1.5)));
        acc.xy.addAssign(vec2(cos(ja), sin(ja)).mul(U.wild.mul(750).mul(free)));
      });
      // boids via field
      const f0 = sampleField(p.xy).toVar();
      If(f0.w.greaterThan(0.001), () => {
        const avg = f0.xyz.div(f0.w).div(FIELD_VEL_SCALE);
        acc.addAssign(avg.sub(v).mul(min(f0.w.div(2), 1).mul(U.align).mul(fb).mul(keep)));
      });
      // separation: density gradient over ±1 cell (local pressure); cohesion: over ±3 cells, only at the
      // flock's thin edge. Two scales stop a single-scale gradient from feeding stripe/worm patterns.
      // separation differences over ±½ cell: sign-correct for every wavelength the 2-cell splat leaves in the field
      const ex = vec2(F.cell, 0), ey = vec2(0, F.size.y.div(FIELD_H));
      const hx = ex.mul(0.5), hy = ey.mul(0.5);
      const dens = min(f0.w.div(F.densRef), 24);
      const sg = vec2(
        sampleField(p.xy.add(hx)).w.sub(sampleField(p.xy.sub(hx)).w),
        sampleField(p.xy.add(hy)).w.sub(sampleField(p.xy.sub(hy)).w),
      ).div(F.densRef);
      const cg = vec2(
        sampleField(p.xy.add(ex.mul(3))).w.sub(sampleField(p.xy.sub(ex.mul(3))).w),
        sampleField(p.xy.add(ey.mul(3))).w.sub(sampleField(p.xy.sub(ey.mul(3))).w),
      ).div(6).div(F.densRef);
      // edge cohesion + rest-density pull below densCap − cap push above it, all on the smooth (±3 cell) gradient
      const rest = clamp(U.densCap.sub(dens).div(U.densCap), 0, 1);
      const ck0 = U.coh.mul(float(1).sub(smoothstep(0.2, 0.9, dens))).add(U.restK.mul(rest)).sub(U.capK.mul(max(dens.sub(U.densCap), 0))).mul(fb).mul(keep);
      const sk0 = U.sep.mul(dens).mul(fb);
      acc.xy.addAssign(cg.mul(ck0).sub(sg.mul(sk0)));
      // individual jitter: breaks the cell-scale lattice the field would otherwise imprint
      const jja = S.x.mul(6.2832).add(U.time.mul(S.y.mul(3).add(2.1)));
      acc.xy.addAssign(vec2(cos(jja), sin(jja)).mul(fb.mul(140)));
      // leader, bounds, slab
      // leader = a roost the flock is steered toward only when it strays (dead zone), not a spring
      // idle: each sub-flock follows its leader's trail (see SimParams.snake); otherwise one point leader
      const goalP = vec2(U.leaderX, U.leaderY).toVar();
      If(U.snake.greaterThan(0), () => {
        const gu = fract(S.x.mul(13.37));
        const g1 = step(0.5, gu).sub(step(0.8, gu)), g2 = step(0.8, gu), g0 = float(1).sub(g1).sub(g2);
        const pick = (k: string): N => UU[`g0${k}`].mul(g0).add(UU[`g1${k}`].mul(g1)).add(UU[`g2${k}`].mul(g2));
        const gax = pick('ax'), gay = pick('ay'), gwx = pick('wx'), gwy = pick('wy'), gpx = pick('px'), gpy = pick('py');
        const su = fract(S.y.mul(5.31)), soff = fract(S.y.mul(17.17)).mul(2).sub(1);
        const tau = U.time.sub(su.mul(U.snakeLag));
        const ox = gax.mul(sin(gwx.mul(tau).add(gpx))), oy = gay.mul(sin(gwy.mul(tau).add(gpy)));
        const tg = vec2(gax.mul(gwx).mul(cos(gwx.mul(tau).add(gpx))), gay.mul(gwy).mul(cos(gwy.mul(tau).add(gpy))));
        const tn = tg.div(max(length(tg), 1e-3));
        const wd = U.snakeW.mul(sqrt(sin(PI.mul(min(su.mul(1.08), 1))))).mul(soff);
        const tgt = vec2(U.snakeCx.add(pick('ox')).add(ox).sub(tn.y.mul(wd)), U.snakeCy.add(pick('oy')).add(oy).add(tn.x.mul(wd)));
        goalP.assign(mix(goalP, tgt, U.snake));
      });
      // B1/B3: free-flight goals are projected out of keep-outs and routed around them (see params.steerGoal);
      // a face only counts as an exit if it lies inside the bounds box (params.exitByX)
      const tun = float(0).toVar();
      If(U.steerOn.greaterThan(0), () => {
        const m = U.koMargin.mul(STEER_M);
        const limS = vec2(U.boundHw, U.boundHh), bcS = vec2(U.boundCx, U.boundCy);
        const inBoxX = (x: N): N => abs(x.sub(bcS.x)).lessThanEqual(limS.x);
        const inBoxY = (y: N): N => abs(y.sub(bcS.y)).lessThanEqual(limS.y);
        If(UU.ko0w.greaterThan(0), () => {
          const c = vec2(UU.ko0x, UU.ko0y), hs = vec2(UU.ko0w, UU.ko0h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(0);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        If(UU.ko1w.greaterThan(0), () => {
          const c = vec2(UU.ko1x, UU.ko1y), hs = vec2(UU.ko1w, UU.ko1h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(1);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        If(UU.ko2w.greaterThan(0), () => {
          const c = vec2(UU.ko2x, UU.ko2y), hs = vec2(UU.ko2w, UU.ko2h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(2);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        If(UU.ko3w.greaterThan(0), () => {
          const c = vec2(UU.ko3x, UU.ko3y), hs = vec2(UU.ko3w, UU.ko3h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(3);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        If(UU.ko4w.greaterThan(0), () => {
          const c = vec2(UU.ko4x, UU.ko4y), hs = vec2(UU.ko4w, UU.ko4h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(4);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        If(UU.ko5w.greaterThan(0), () => {
          const c = vec2(UU.ko5x, UU.ko5y), hs = vec2(UU.ko5w, UU.ko5h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(5);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        If(UU.ko6w.greaterThan(0), () => {
          const c = vec2(UU.ko6x, UU.ko6y), hs = vec2(UU.ko6w, UU.ko6h).add(m);
          const gq = goalP.sub(c).toVar();
          If(abs(gq.x).lessThan(hs.x).and(abs(gq.y).lessThan(hs.y)), () => {
            const sq = step(0, gq).mul(2).sub(1);
            const ex = c.x.add(sq.x.mul(hs.x)), ey = c.y.add(sq.y.mul(hs.y));
            const fs = frameSlot(6);
            If(exitByXT(hs.x.sub(abs(gq.x)).lessThan(hs.y.sub(abs(gq.y))), inBoxX(ex).and(fs.and(blockedX(sq.x)).not()), inBoxY(ey).and(fs.and(blockedY(sq.y)).not())), () => { goalP.x.assign(ex); }).Else(() => { goalP.y.assign(ey); });
          });
        });
        const done = float(0).toVar();
        If(UU.ko0w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko0x, UU.ko0y), h0 = vec2(UU.ko0w, UU.ko0h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(0);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
        If(UU.ko1w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko1x, UU.ko1y), h0 = vec2(UU.ko1w, UU.ko1h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(1);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
        If(UU.ko2w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko2x, UU.ko2y), h0 = vec2(UU.ko2w, UU.ko2h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(2);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
        If(UU.ko3w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko3x, UU.ko3y), h0 = vec2(UU.ko3w, UU.ko3h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(3);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
        If(UU.ko4w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko4x, UU.ko4y), h0 = vec2(UU.ko4w, UU.ko4h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(4);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
        If(UU.ko5w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko5x, UU.ko5y), h0 = vec2(UU.ko5w, UU.ko5h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(5);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
        If(UU.ko6w.greaterThan(0).and(done.lessThan(0.5)), () => {
          const c = vec2(UU.ko6x, UU.ko6y), h0 = vec2(UU.ko6w, UU.ko6h), hs = h0.add(m);
          const r = p.xy.sub(c).toVar();
          const sr = step(0, r).mul(2).sub(1);
          If(abs(r.x).greaterThanEqual(h0.x).or(abs(r.y).greaterThanEqual(h0.y)), () => {
            const d = goalP.sub(p.xy).toVar();
            const dx = select(abs(d.x).lessThan(1e-3), float(1e-3), d.x), dy = select(abs(d.y).lessThan(1e-3), float(1e-3), d.y);
            const tx1 = c.x.sub(hs.x).sub(p.x).div(dx), tx2 = c.x.add(hs.x).sub(p.x).div(dx);
            const ty1 = c.y.sub(hs.y).sub(p.y).div(dy), ty2 = c.y.add(hs.y).sub(p.y).div(dy);
            const t0 = max(min(tx1, tx2), min(ty1, ty2)), t1 = min(max(tx1, tx2), max(ty1, ty2));
            If(t0.lessThanEqual(t1).and(t1.greaterThanEqual(0)).and(t0.lessThanEqual(1)), () => {
              const sd = step(0, vec2(dx, dy)).mul(2).sub(1);
              If(abs(dx).mul(hs.y).greaterThanEqual(abs(dy).mul(hs.x)), () => {
                const sy = select(inBoxY(c.y.add(sr.y.mul(hs.y))), sr.y, sr.y.negate());
                If(inBoxY(c.y.add(sy.mul(hs.y))), () => {
                  const past = step(hs.y.sub(1), sy.mul(r.y));
                  goalP.assign(vec2(c.x.add(mix(sd.x.negate(), sd.x, past).mul(hs.x)), c.y.add(sy.mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); });
                });
                done.assign(1);
              }).Else(() => {
                const sx = select(inBoxX(c.x.add(sr.x.mul(hs.x))), sr.x, sr.x.negate());
                If(inBoxX(c.x.add(sx.mul(hs.x))), () => {
                  const past = step(hs.x.sub(1), sx.mul(r.x));
                  goalP.assign(vec2(c.x.add(sx.mul(hs.x)), c.y.add(mix(sd.y.negate(), sd.y, past).mul(hs.y))));
                }).Else(() => { // no way round: stay on this side (gathering: fly behind it)
                  If(U.tunnel.greaterThan(0), () => { tun.assign(1); }).Else(() => { goalP.assign(vec2(clamp(goalP.x, c.x.sub(h0.x), c.x.add(h0.x)), c.y.add(sr.y.mul(hs.y)))); });
                });
                done.assign(1);
              });
            });
          }).Else(() => { // inside the rect itself: aim at the nearest valid face's exit (the keep-out force pushes the same way)
            // (gathering, with no way round this rect toward the goal: keep flying behind it)
            const gd = goalP.sub(p.xy);
            const noWay = select(abs(gd.x).mul(hs.y).greaterThanEqual(abs(gd.y).mul(hs.x)), inBoxY(c.y.add(hs.y)).or(inBoxY(c.y.sub(hs.y))).not(), inBoxX(c.x.add(hs.x)).or(inBoxX(c.x.sub(hs.x))).not());
            If(U.tunnel.greaterThan(0).and(noWay), () => { tun.assign(1); });
            const fs = frameSlot(6);
            If(tun.lessThan(0.5).and(exitByXT(h0.x.sub(abs(r.x)).lessThan(h0.y.sub(abs(r.y))), inBoxX(c.x.add(sr.x.mul(h0.x))).and(fs.and(blockedX(sr.x)).not()), inBoxY(c.y.add(sr.y.mul(h0.y))).and(fs.and(blockedY(sr.y)).not()))), () => { goalP.assign(vec2(c.x.add(sr.x.mul(hs.x)), p.y)); })
              .ElseIf(tun.lessThan(0.5), () => { goalP.assign(vec2(p.x, c.y.add(sr.y.mul(hs.y)))); });
            done.assign(1);
          });
        });
      });
      const ld = goalP.sub(p.xy).toVar();
      const ll = max(length(ld), 1e-3);
      const r0 = min(U.halfW, U.halfH).mul(U.leadR);
      acc.xy.addAssign(ld.div(ll).mul(smoothstep(r0, r0.mul(2.2), ll).mul(U.leaderW).mul(260).mul(free).mul(keep)));
      // bounds (B1): the viewport inset; outward velocity turns within BOUND_ZONE of the edge, a spring past it
      const lim = vec2(U.boundHw, U.boundHh);
      const bc = vec2(U.boundCx, U.boundCy);
      const bq = p.xy.sub(bc).toVar();
      const bs = step(0, bq).mul(2).sub(1);
      const over = max(bq.abs().sub(lim), 0).mul(bs);
      acc.xy.subAssign(over.mul(free.mul(8)));
      const zone = clamp(abs(bq).sub(max(lim.sub(BOUND_ZONE), 1)).div(BOUND_ZONE), 0, 1.5);
      acc.xy.subAssign(bs.mul(max(v.xy.mul(bs), 0)).mul(zone).mul(free.mul(BOX_TURN)));
      const far = step(fract(S.z.mul(7.77)), U.farFrac.sub(1e-4)).mul(step(1e-4, U.farFrac));
      acc.z.addAssign(p.z.sub(far.mul(FAR_Z)).mul(-1.2).sub(v.z.mul(0.6)).mul(free));
      // keep-outs: soft push out + inward velocity turned around; a held shape barely feels it
      If(U.koOn.greaterThan(0).and(tun.lessThan(0.5)), () => {
        const kk0 = U.koOn.mul(float(1).sub(wEff.mul(0.85)));
        // the dim frame (B3) is the last used slot when koFrame is on: held border particles ignore it; inside its
        // rect only the frame acts (exits skip blocked faces); outside it, any other keep-out acting wins over it
        const other = float(0).toVar();
        const inFr = float(0).toVar();
        for (let k = 0; k < MAX_KEEPOUT; k++) {
          If(frameSlot(k).and(abs(p.x.sub(UU[`ko${k}x`])).lessThan(UU[`ko${k}w`])).and(abs(p.y.sub(UU[`ko${k}y`])).lessThan(UU[`ko${k}h`])), () => { inFr.assign(1); });
        }
        for (let k = 0; k < MAX_KEEPOUT; k++) {
          const hw = UU[`ko${k}w`], hh = UU[`ko${k}h`];
          const isFrame = frameSlot(k);
          const kk = select(isFrame, U.koOn.mul(float(1).sub(wEff)).mul(max(inFr, float(1).sub(other))), kk0.mul(float(1).sub(inFr)));
          const margin = select(isFrame, U.koFrameMargin, U.koMargin);
          If(hw.greaterThan(0), () => {
            const q = p.xy.sub(vec2(UU[`ko${k}x`], UU[`ko${k}y`])).toVar();
            const dd = abs(q).sub(vec2(hw, hh)).toVar();
            const oo = max(dd, 0);
            const outside = length(oo);
            const sd = outside.add(min(max(dd.x, dd.y), 0));
            If(sd.lessThan(margin), () => {
              const sq = step(0, q).mul(2).sub(1);
              // inside: leave through the face that points home (box centre), see keepOutForce
              // (when home is inside the rect too — a dim frame around the stage — leave through the nearest face)
              const hc = vec2(U.homeX, U.homeY).sub(vec2(UU[`ko${k}x`], UU[`ko${k}y`]));
              const homeIn = abs(hc.x).lessThan(hw).and(abs(hc.y).lessThan(hh)).or(U.steerOn.greaterThan(0));
              const hm = select(homeIn, q, vec2(U.homeX, U.homeY).sub(p.xy));
              const hs = step(0, hm).mul(2).sub(1);
              const okX = abs(UU[`ko${k}x`].add(sq.x.mul(hw)).sub(U.boundCx)).lessThanEqual(U.boundHw).and(isFrame.and(blockedX(sq.x)).not());
              const okY = abs(UU[`ko${k}y`].add(sq.y.mul(hh)).sub(U.boundCy)).lessThanEqual(U.boundHh).and(isFrame.and(blockedY(sq.y)).not());
              const byX = select(homeIn, exitByXT(dd.x.negate().lessThan(dd.y.negate()), okX, okY), abs(hm.x).mul(hh).greaterThan(abs(hm.y).mul(hw)));
              const nIn = select(byX, vec2(hs.x, 0), vec2(0, hs.y));
              const n = select(outside.greaterThan(1e-3), sq.mul(oo).div(max(outside, 1e-3)), nIn).toVar();
              const t = min(float(1).sub(sd.div(margin)), 2.5);
              const vn = min(v.xy.dot(n), 0);
              acc.xy.addAssign(n.mul(t.mul(t).mul(KO_PUSH).sub(vn.mul(KO_TURN).mul(t))).mul(kk));
              If(isFrame.not(), () => { other.assign(1); });
            });
          });
        }
      });
      // vortex
      If(U.vortexW.greaterThan(0), () => {
        const rv = p.xy.sub(vec2(U.vortexCx, U.vortexCy)).toVar();
        const rl = max(length(rv), 1);
        const dir = rv.div(rl);
        const tang = vec2(dir.y.negate(), dir.x);
        // per-particle orbit speed (±30 %) shears any clump into a full ring; per-particle radius gives the ring body
        const vs = U.vortexSpeed.mul(S.y.mul(0.6).add(0.7)), vr = U.vortexR.mul(S.z.mul(0.4).add(0.8));
        const dv = tang.mul(vs).add(dir.mul(vr.sub(rl).mul(3)));
        const kk = U.vortexW.mul(free).mul(4).mul(keep);
        acc.xy.addAssign(dv.sub(v.xy).mul(kk));
        acc.z.addAssign(p.z.mul(-3).mul(U.vortexFlat).sub(v.z).mul(kk.mul(0.5)));
      });
      // target attraction (+ swoop so paths curve instead of lerping)
      const toT = T.sub(p).toVar();
      const dist = length(toT);
      const dl = dist.mul(6);
      const des = toT.mul(6).mul(min(float(1800).div(max(dl, 1e-3)), 1)).add(ff);
      acc.addAssign(des.sub(v).mul(wEff.mul(9)));
      acc.xy.addAssign(fl.xy.mul(min(dist.div(250), 1).mul(wEff).mul(1.8).mul(U.flowAmp)));
      // pointer (B2): a soft hole around the cursor stretched into a short wake behind fast motion (capsule
      // cursor → wake tail, radius tapering to 60 %), drag along fast motion, and the curious orbit
      const hV = float(0).toVar(), hN = vec2(0).toVar(), hK = float(0).toVar();
      If(U.pointerOn.greaterThan(0), () => {
        const wv = vec2(U.wakeX, U.wakeY).sub(vec2(U.pointerX, U.pointerY)).toVar();
        const s = clamp(q.dot(wv).div(max(wv.dot(wv), 1e-6)), 0, 1);
        const cq = q.sub(wv.mul(s)).toVar();
        const d = max(length(cq), 1e-3);
        const R = U.pointerR.mul(float(1).sub(s.mul(0.4))).mul(S.z.mul(0.44).add(0.78)); // per-particle radius: soft edge
        If(d.lessThan(R), () => {
          const t = float(1).sub(d.div(R));
          const nrm = cq.div(d);
          const vn = min(v.xy.dot(nrm), 0);
          const hk = U.pointerOn.mul(keep).mul(U.pointerHole.mul(float(1).sub(wEff.mul(0.5))).add(float(1).sub(U.pointerHole).mul(STILL_HOLE).mul(float(1).sub(wEff))));
          acc.xy.addAssign(nrm.mul(t.mul(t).mul(HOLE_PUSH).sub(vn.mul(HOLE_TURN).mul(t))).mul(hk));
          hV.assign(R.sub(d).mul(HOLE_KICK).mul(hk)); hN.assign(nrm); hK.assign(hk);
        });
        const pv = vec2(U.pointerVx, U.pointerVy);
        const fall = exp(qr.div(U.pointerR.mul(2.2)).pow(2).negate()).mul(min(length(pv).div(900), 1)).mul(4).mul(U.pointerOn).mul(float(1).sub(wEff.mul(0.6)));
        acc.xy.addAssign(pv.mul(fall));
        If(cu.greaterThan(0), () => {
          const u = q.div(qr);
          const dir = select(S.y.lessThan(0.5), float(1), float(-1));
          const vs = S.z.mul(90).add(140).mul(dir), rr = U.curiousR.mul(S.y.mul(0.6).add(0.7));
          const cv0 = vec2(u.y.negate().mul(vs).add(u.x.mul(rr.sub(qr)).mul(2.4)), u.x.mul(vs).add(u.y.mul(rr.sub(qr)).mul(2.4)));
          const cv = cv0.mul(min(float(560).div(max(length(cv0), 1e-3)), 1));
          acc.xy.addAssign(cv.sub(v.xy).mul(cu.mul(3.4)));
          acc.z.addAssign(p.z.mul(-2).sub(v.z).mul(cu));
        });
      });
      // burst (one-frame impulse)
      If(U.burst.greaterThan(0), () => {
        const b = p.xy.sub(vec2(U.burstX, U.burstY)).add(vec2(S.y.sub(0.5), S.z.sub(0.5)).mul(60)).toVar();
        const bn = b.div(max(length(b), 1e-3));
        const kb = U.burst.mul(S.x.add(0.4));
        v.addAssign(vec3(bn.mul(kb), S.z.sub(0.5).mul(U.burst).mul(0.5)));
      });
      v.addAssign(acc.mul(U.dt).mul(float(1).sub(U.freeze.mul(0.97))));
      // the hole's direct outward velocity (see cpu.ts)
      const hvr = v.xy.dot(hN);
      // (in proportion to the hole's strength: a nearly-off hole must not cancel a held shape's pull — cpu.ts)
      v.xy.addAssign(hN.mul(max(hV.sub(hvr), 0).mul(min(U.dt.mul(22), 1)).mul(min(hK.mul(4), 1))));
      // agitation waves: cruise speed modulated by a travelling wave → density bands roll through the flock
      const sp0 = max(length(v), 1e-3);
      const wd = vec2(cos(U.time.mul(0.21)), sin(U.time.mul(0.21)));
      const wa = p.xy.dot(wd).mul(WAVE_K).sub(U.time.mul(WAVE_W));
      const cruise = U.cruise.mul(sin(wa).mul(U.waveAmp).add(1));
      v.addAssign(v.mul(cruise.sub(sp0).div(sp0).mul(min(U.dt.mul(1.6), 1)).mul(free).mul(float(1).sub(U.freeze)).mul(keep)));
      // speed limits
      const sp = length(v);
      const maxS = U.speedMax.mul(U.wild.mul(1.5).add(1)).mul(free).add(float(2200).mul(float(1).sub(free))).add(hV);
      const minS = U.speedMin.mul(free).mul(float(1).sub(U.freeze)).mul(keep);
      If(sp.greaterThan(maxS), () => { v.mulAssign(maxS.div(sp)); }).ElseIf(sp.lessThan(minS), () => { v.mulAssign(minS.div(max(sp, 1e-3))); });
      v.mulAssign(exp(U.freeze.mul(-8).mul(U.dt)));
      const np = p.add(v.mul(U.dt)).toVar();
      // never cut off at the screen edge: a free particle that gets BOUND_REFLECT past the inset box reflects inward
      If(free.greaterThan(0.5), () => {
        const l2 = lim.add(BOUND_REFLECT);
        const rq = np.xy.sub(bc);
        If(rq.x.greaterThan(l2.x).and(v.x.greaterThan(0)), () => { np.x.assign(bc.x.add(l2.x)); v.x.assign(v.x.mul(-0.5)); })
          .ElseIf(rq.x.lessThan(l2.x.negate()).and(v.x.lessThan(0)), () => { np.x.assign(bc.x.sub(l2.x)); v.x.assign(v.x.mul(-0.5)); });
        If(rq.y.greaterThan(l2.y).and(v.y.greaterThan(0)), () => { np.y.assign(bc.y.add(l2.y)); v.y.assign(v.y.mul(-0.5)); })
          .ElseIf(rq.y.lessThan(l2.y.negate()).and(v.y.lessThan(0)), () => { np.y.assign(bc.y.sub(l2.y)); v.y.assign(v.y.mul(-0.5)); });
      });
      If(U.snap.greaterThan(0).and(wDes.greaterThan(0.5)), () => { np.assign(T); v.assign(vec3(0)); w.assign(1); });
      // group visibility (mult − 1 in pos.w): eased; outside a scene back to 1; not yet handed off: as it was
      const visGoal = select(inG, visG, select(U.grpOn.greaterThan(0).and(switched.not()), P.w, float(0)));
      const visK = max(min(U.dt.mul(12), 1), U.snap);
      pos.element(i).assign(vec4(np, mix(P.w, visGoal, visK)));
      vel.element(i).assign(vec4(v, w));
      const C = col.element(i);
      const ck = max(min(U.dt.mul(6), 1), U.snap);
      col.element(i).assign(vec4(mix(C.xyz, TC.xyz, ck), mix(C.w, TC.w.mul(wEff), ck)));
    })().compute(this.count);
  }

  private buildRender(): void {
    const { pos, vel, col, seed } = this.buf;
    const L = this.uLook, U = this.U;
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
    const P = pos.toAttribute(), V = vel.toAttribute(), C = col.toAttribute(), S = seed.toAttribute();
    m.positionNode = P.xyz;
    const speed = length(V.xyz);
    // particles flying to a shape keep most of their warm colour: a full speed hue there read as a blue burst
    const st = smoothstep(110, 720, speed).mul(float(1).sub(clamp(V.w, 0, 1).mul(HELD_HUE_CUT)));
    const held = clamp(V.w, 0, 1);
    // far particles (20 % in free flight): dimmer, smaller, set back in z — a depth cue in the flock
    const farFree = step(fract(S.z.mul(7.77)), U.farFrac.sub(1e-4)).mul(step(1e-4, U.farFrac)).mul(float(1).sub(held));
    const size = mix(1.7, 3.3, S.y).mul(U.sizeScale).mul(mix(float(1.45), float(1), L.dark)).mul(mix(float(1), float(FAR_SIZE), farFree)).mul(U.frameGlow.mul(0.3).mul(held).add(1)).mul(float(1).sub(float(1).sub(U.heldDim).mul(0.35).mul(held))); // ink dots need more coverage on paper
    m.scaleNode = vec2(size.mul(st.mul(3.2).add(1)), size.mul(float(1).sub(st.mul(0.35))));
    const vv = cameraViewMatrix.mul(vec4(V.xyz, 0)).xy;
    m.rotationNode = atan(vv.y, vv.x.add(1e-5));
    const d = length(uv().sub(0.5)).mul(2);
    const disc = float(1).sub(smoothstep(0.25, 1.0, d));
    const baseC = mix(L.base, L.fast, st.mul(0.85));
    const emo = max(C.xyz, vec3(0.05).mul(L.dark));
    const color = mix(baseC, emo, clamp(C.w, 0, 1));
    // density-aware exposure for free-flying particles: knots in the flock don't blow out under additive blending
    const fu = P.xy.sub(this.uField.min).div(this.uField.size);
    const fd = texture(this.fieldRT.texture, vec2(fu.x, float(1).sub(fu.y))).w.div(this.uField.densRef);
    const expo = mix(clamp(float(1.5).div(fd.add(0.4).sqrt()), 0.3, 1), float(1), clamp(V.w, 0, 1));
    // idle flies at freeDim (~65 %); held shapes at shapeExpo (dense shapes dimmed so edges stay readable) + frame glow
    const look = mix(U.freeDim.mul(mix(float(1), float(FAR_DIM), farFree)), U.shapeExpo.mul(U.frameGlow.mul(0.6).add(1)).mul(U.heldDim), held);
    const bright = mix(0.5, 1.0, S.z).mul(U.pulse.mul(0.15).add(1)).mul(U.brightness).mul(mix(float(1), expo, this.uLook.dark)).mul(look);
    // dark: additive, brightness in colour; light: ink over paper, brightness only nudges opacity
    // dots inside a keep-out (not the dim frame's own) are never drawn: nothing visibly crosses the words
    const UU = U as Record<string, N>;
    let cull: N = float(1);
    // test where the dot lands on screen, not its x/y: a dot off the z = 0 plane (or under the parallax camera,
    // which looks at a quarter of its offset) projects away from them and could cross the words (WAVE3 S5)
    const pk = this.uDepth.div(max(this.uDepth.sub(P.z), 50));
    const sxy = vec2(P.x.sub(U.camX).mul(pk).add(U.camX.mul(0.75)), P.y.sub(U.camY).mul(pk).add(U.camY.mul(0.75)));
    for (let k = 0; k < MAX_KEEPOUT; k++) {
      const isFrame = U.koFrame.greaterThan(0).and(k + 1 < MAX_KEEPOUT ? UU[`ko${k + 1}w`].lessThanEqual(0) : float(1).greaterThan(0));
      const inside = abs(sxy.x.sub(UU[`ko${k}x`])).lessThan(UU[`ko${k}w`].sub(CULL_INSET)).and(abs(sxy.y.sub(UU[`ko${k}y`])).lessThan(UU[`ko${k}h`].sub(CULL_INSET))).and(UU[`ko${k}w`].greaterThan(0)).and(isFrame.not());
      cull = cull.mul(select(inside, float(0), float(1)));
    }
    // a performed scene's group visibility (pos.w = mult − 1): dims through opacity, brightens through colour
    const vis = P.w.add(1);
    m.fragmentNode = vec4(color.mul(mix(float(1), bright, L.dark)).mul(cull).mul(max(vis, 1)), disc.mul(L.alpha).mul(mix(mix(0.8, 1.0, S.z), float(1), L.dark)).mul(cull).mul(clamp(vis, 0, 1)));
    this.material = m;
    this.sprite = new THREE.Sprite(m);
    this.sprite.count = this.count;
    this.sprite.frustumCulled = false;
    this.scene.add(this.sprite);
  }

  private setupPipeline(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    if (!this.o.bloom || this.sceneMode !== 'dark') return;
    const pl = new THREE.RenderPipeline(this.renderer);
    const sp = pass(this.scene, this.camera);
    const col = sp.getTextureNode('output');
    this.bloomNode = bloom(col, BLOOM_STRENGTH, 0.22, 0.5);
    pl.outputNode = col.add(this.bloomNode);
    this.pipeline = pl;
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = cssW; this.cssH = cssH;
    const dpr = Math.min(window.devicePixelRatio || 1, this.o.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
    const fw = cssW * FIELD_MARGIN, fh = cssH * FIELD_MARGIN;
    this.splatCam.left = -fw / 2; this.splatCam.right = fw / 2; this.splatCam.top = fh / 2; this.splatCam.bottom = -fh / 2;
    this.splatCam.position.set(0, 0, 1000); this.splatCam.lookAt(0, 0, 0);
    this.splatCam.updateProjectionMatrix();
    this.uField.min.value.set(-fw / 2, -fh / 2);
    this.uField.size.value.set(fw, fh);
    this.uField.cell.value = fw / FIELD_W;
    this.uField.densRef.value = Math.max(0.5, (this.count / (FIELD_W * FIELD_H)) * 3.2);
    // alpha keeps total brightness roughly constant across counts/viewports
    this.uLook.alpha.value = this.sceneMode === 'dark'
      ? Math.min(0.85, 0.62 * Math.sqrt((20000 / this.count) * ((cssW * cssH) / (1440 * 900))))
      : Math.min(1, 1.5 * Math.sqrt((20000 / this.count) * ((cssW * cssH) / (1440 * 900))));
  }

  private upload(b: N, data: Float32Array): void {
    const attr = b.value as THREE.StorageInstancedBufferAttribute;
    (attr.array as Float32Array).set(data.subarray(0, attr.array.length));
    attr.needsUpdate = true;
  }

  private uploadTex(t: THREE.DataTexture, data: Float32Array, linearize = false): void {
    const arr = t.image.data as Float32Array;
    const n = Math.min(arr.length, data.length);
    if (linearize) {
      for (let i = 0; i < n; i += 4) {
        arr[i] = srgbToLinear(data[i]!); arr[i + 1] = srgbToLinear(data[i + 1]!); arr[i + 2] = srgbToLinear(data[i + 2]!); arr[i + 3] = data[i + 3]!;
      }
    } else arr.set(data.subarray(0, n));
    t.needsUpdate = true;
  }

  setTargets(a: Targets, b: Targets): void {
    this.uploadTex(this.tex.ta, a.pos); this.uploadTex(this.tex.tb, b.pos);
    this.uploadTex(this.tex.ca, a.col, true); this.uploadTex(this.tex.cb, b.col, true);
  }

  setGroups(info: Float32Array | null): void {
    const t = this.tex.tg;
    const arr = t.image.data as Float32Array;
    if (info) arr.set(info.subarray(0, Math.min(arr.length, info.length)));
    else for (let i = 0; i < arr.length; i += 4) { arr[i] = -1; arr[i + 1] = 0; arr[i + 2] = 0; arr[i + 3] = 0; }
    t.needsUpdate = true;
  }

  setGroupData(data: Float32Array): void {
    (this.grpTex.image.data as Float32Array).set(data.subarray(0, GROUP_FLOATS));
    this.grpTex.needsUpdate = true;
  }

  setState(pos: Float32Array, vel: Float32Array): void {
    this.upload(this.buf.pos, pos); this.upload(this.buf.vel, vel);
  }

  setScene(s: Scene): void {
    this.sceneMode = s;
    const pal = COLORS[s];
    this.renderer.setClearColor(new THREE.Color(pal.bg), 1);
    this.uLook.base.value.set(pal.base); this.uLook.fast.value.set(pal.fast);
    this.uLook.dark.value = s === 'dark' ? 1 : 0;
    this.material.blending = s === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.material.needsUpdate = true;
    this.setupPipeline();
    if (this.cssW > 1) this.resize(this.cssW, this.cssH);
  }

  frame(p: SimParams, draw = true): void {
    for (const k in p) { const u = this.U[k as keyof SimParams]; if (u) u.value = p[k as keyof SimParams]; }
    if (this.bloomNode?.strength) this.bloomNode.strength.value = BLOOM_STRENGTH * p.bloomK;
    const r = this.renderer;
    const D = this.cssH / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this.uDepth.value = D;
    this.camera.position.set(p.camX, p.camY, D);
    this.camera.lookAt(p.camX * 0.25, p.camY * 0.25, 0);
    // 1. splat neighbourhood field
    r.setRenderTarget(this.fieldRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.splatScene, this.splatCam);
    r.setRenderTarget(null);
    r.setClearColor(new THREE.Color(COLORS[this.sceneMode].bg), 1);
    // 2. simulate
    r.compute(this.simNode);
    // 3. draw
    if (!draw) return;
    if (this.pipeline) this.pipeline.render(); else r.render(this.scene, this.camera);
    if (this.shot) { const cb = this.shot; this.shot = null; this.canvas.toBlob((b) => cb(b), 'image/png'); }
  }

  screenshot(): Promise<Blob> {
    return new Promise((res, rej) => { this.shot = (b) => (b ? res(b) : rej(new Error('toBlob failed'))); });
  }

  /** Debug (QA): sum of the splatted density field (should equal the in-field particle count). */
  async debugFieldSum(): Promise<{ sum: number; max: number; nonzero: number }> {
    const px = await this.renderer.readRenderTargetPixelsAsync(this.fieldRT, 0, 0, FIELD_W * FIELD_RES, FIELD_H * FIELD_RES) as ArrayLike<number>;
    const half = px instanceof Uint16Array;
    const f = (h: number): number => {
      if (!half) return h;
      const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
      return e === 0 ? s * 2 ** -14 * (m / 1024) : e === 31 ? NaN : s * 2 ** (e - 15) * (1 + m / 1024);
    };
    let sum = 0, max = 0, nonzero = 0;
    for (let i = 3; i < px.length; i += 4) { const w = f(px[i]!); sum += w; if (w > max) max = w; if (w > 0) nonzero++; }
    return { sum: sum / (FIELD_RES * FIELD_RES), max, nonzero };
  }

  /** Debug: read back particle buffers (positions) — used by QA/tests. */
  async readPositions(): Promise<Float32Array> {
    return new Float32Array(await this.renderer.getArrayBufferAsync(this.buf.pos.value));
  }

  destroy(): void {
    this.pipeline?.dispose();
    this.fieldRT.dispose();
    for (const t of Object.values(this.tex)) t.dispose();
    this.grpTex.dispose();
    this.material.dispose();
    (this.splatSprite.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
