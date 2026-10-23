import * as THREE from 'three/webgpu';
import * as TSLTyped from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Engine, EngineInit, Scene } from './types';
import { COLORS } from './types';
import type { SimParams } from './params';
import { BOX_TURN, defaultParams, FAR_DIM, FAR_SIZE, FAR_Z, FIELD_H, FIELD_MARGIN, FIELD_VEL_SCALE, FIELD_W, KO_PUSH, KO_TURN, MAX_KEEPOUT, TRANSIT_DIP } from './params';
import { FLOW_WAVES, WAVE_K, WAVE_W } from './flow';
import type { Targets } from '../shapes';
import { makeSeeds } from '../hash';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL node types are too loose to annotate usefully */
type N = any;
// TSL's generic typings fight swizzles/selects in a kernel this size; the kernel is verified at runtime instead.
const TSL: N = TSLTyped;
const {
  Fn, If, instancedArray, instanceIndex, uniform, float, vec2, vec3, vec4, texture, uv, sin, cos, atan, length,
  clamp, smoothstep, mix, max, min, select, step, exp, pow, cameraViewMatrix, pass, PI, textureLoad, ivec2, fract, sqrt, abs, sign,
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
  private buf: Record<'pos' | 'vel' | 'col' | 'seed', N> = {} as never;
  /**
   * Read-only inputs of the kernel live in float data textures, not storage buffers: three's WebGL2 backend
   * runs compute as transform feedback and binds every storage buffer the kernel touches as a feedback
   * varying (max 4), so only pos/vel/col may be storage. Same layout on WebGPU keeps one code path.
   */
  private tex: Record<'seed' | 'ta' | 'tb' | 'ca' | 'cb', THREE.DataTexture> = {} as never;
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
    for (const k of ['seed', 'ta', 'tb', 'ca', 'cb'] as const) this.tex[k] = mkTex();
    (this.tex.seed.image.data as Float32Array).set(seeds);
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
      // flow
      const fl = flowTSL(p.xy, U.time, U.flowFreq).toVar();
      const fa = U.flowAmp.mul(U.wild.mul(2.5).add(1));
      acc.addAssign(vec3(fl.xy.mul(fa), fl.z.mul(fa).mul(0.5)).sub(v).mul(free.mul(U.flowRate).mul(U.wild.mul(3).add(1))));
      If(U.wild.greaterThan(0), () => { // celebrate: every particle chases its own spinning heading
        const ja = S.x.mul(6.2832).add(U.time.mul(S.y.mul(4).add(1.5)));
        acc.xy.addAssign(vec2(cos(ja), sin(ja)).mul(U.wild.mul(750).mul(free)));
      });
      // boids via field
      const f0 = sampleField(p.xy).toVar();
      If(f0.w.greaterThan(0.001), () => {
        const avg = f0.xyz.div(f0.w).div(FIELD_VEL_SCALE);
        acc.addAssign(avg.sub(v).mul(min(f0.w.div(2), 1).mul(U.align).mul(fb)));
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
      const ck0 = U.coh.mul(float(1).sub(smoothstep(0.2, 0.9, dens))).add(U.restK.mul(rest)).sub(U.capK.mul(max(dens.sub(U.densCap), 0))).mul(fb);
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
      const ld = goalP.sub(p.xy).toVar();
      const ll = max(length(ld), 1e-3);
      const r0 = min(U.halfW, U.halfH).mul(U.leadR);
      acc.xy.addAssign(ld.div(ll).mul(smoothstep(r0, r0.mul(2.2), ll).mul(U.leaderW).mul(260).mul(free)));
      const lim = vec2(U.boundHw, U.boundHh);
      const bq = p.xy.sub(vec2(U.boundCx, U.boundCy));
      const over = max(bq.abs().sub(lim), 0).mul(bq.sign()).toVar();
      acc.xy.subAssign(over.mul(free.mul(8)));
      // past the box, outward velocity is turned back
      acc.xy.subAssign(sign(over).mul(max(v.xy.mul(sign(over)), 0)).mul(min(abs(over).div(40), 1)).mul(free.mul(BOX_TURN)));
      const far = step(fract(S.z.mul(7.77)), U.farFrac.sub(1e-4)).mul(step(1e-4, U.farFrac));
      acc.z.addAssign(p.z.sub(far.mul(FAR_Z)).mul(-1.2).sub(v.z.mul(0.6)).mul(free));
      // keep-outs: soft push out + inward velocity turned around; a held shape barely feels it
      If(U.koOn.greaterThan(0), () => {
        const kk = U.koOn.mul(float(1).sub(wEff.mul(0.85)));
        for (let k = 0; k < MAX_KEEPOUT; k++) {
          const hw = UU[`ko${k}w`], hh = UU[`ko${k}h`];
          If(hw.greaterThan(0), () => {
            const q = p.xy.sub(vec2(UU[`ko${k}x`], UU[`ko${k}y`])).toVar();
            const dd = abs(q).sub(vec2(hw, hh)).toVar();
            const oo = max(dd, 0);
            const outside = length(oo);
            const sd = outside.add(min(max(dd.x, dd.y), 0));
            If(sd.lessThan(U.koMargin), () => {
              const sq = step(0, q).mul(2).sub(1);
              // inside: leave through the face that points home (box centre), see keepOutForce
              const hm = vec2(U.boundCx, U.boundCy).sub(p.xy);
              const hs = step(0, hm).mul(2).sub(1);
              const nIn = select(abs(hm.x).mul(hh).greaterThan(abs(hm.y).mul(hw)), vec2(hs.x, 0), vec2(0, hs.y));
              const n = select(outside.greaterThan(1e-3), sq.mul(oo).div(max(outside, 1e-3)), nIn).toVar();
              const t = min(float(1).sub(sd.div(U.koMargin)), 2.5);
              const vn = min(v.xy.dot(n), 0);
              acc.xy.addAssign(n.mul(t.mul(t).mul(KO_PUSH).sub(vn.mul(KO_TURN).mul(t))).mul(kk));
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
        const kk = U.vortexW.mul(free).mul(4);
        acc.xy.addAssign(dv.sub(v.xy).mul(kk));
        acc.z.addAssign(p.z.mul(-3).mul(U.vortexFlat).sub(v.z).mul(kk.mul(0.5)));
      });
      // target attraction (+ swoop so paths curve instead of lerping)
      const toT = T.sub(p).toVar();
      const dist = length(toT);
      const dl = dist.mul(6);
      const des = toT.mul(6).mul(min(float(1800).div(max(dl, 1e-3)), 1));
      acc.addAssign(des.sub(v).mul(wEff.mul(9)));
      acc.xy.addAssign(fl.xy.mul(min(dist.div(250), 1).mul(wEff).mul(1.8).mul(U.flowAmp)));
      // pointer: soft repulsion sphere + drag along fast motion
      const q = p.xy.sub(vec2(U.pointerX, U.pointerY)).toVar();
      const qr = max(length(q), 1e-3);
      const push = pow(max(float(1).sub(qr.div(U.pointerR)), 0), 2).mul(5200).mul(U.pointerOn).mul(float(1).sub(wEff.mul(0.5)));
      acc.xy.addAssign(q.div(qr).mul(push));
      const pv = vec2(U.pointerVx, U.pointerVy);
      const fall = exp(qr.div(U.pointerR.mul(2.2)).pow(2).negate()).mul(min(length(pv).div(900), 1)).mul(4).mul(U.pointerOn).mul(float(1).sub(wEff.mul(0.6)));
      acc.xy.addAssign(pv.mul(fall));
      // burst (one-frame impulse)
      If(U.burst.greaterThan(0), () => {
        const b = p.xy.sub(vec2(U.burstX, U.burstY)).add(vec2(S.y.sub(0.5), S.z.sub(0.5)).mul(60)).toVar();
        const bn = b.div(max(length(b), 1e-3));
        const kb = U.burst.mul(S.x.add(0.4));
        v.addAssign(vec3(bn.mul(kb), S.z.sub(0.5).mul(U.burst).mul(0.5)));
      });
      v.addAssign(acc.mul(U.dt).mul(float(1).sub(U.freeze.mul(0.97))));
      // agitation waves: cruise speed modulated by a travelling wave → density bands roll through the flock
      const sp0 = max(length(v), 1e-3);
      const wd = vec2(cos(U.time.mul(0.21)), sin(U.time.mul(0.21)));
      const wa = p.xy.dot(wd).mul(WAVE_K).sub(U.time.mul(WAVE_W));
      const cruise = U.cruise.mul(sin(wa).mul(U.waveAmp).add(1));
      v.addAssign(v.mul(cruise.sub(sp0).div(sp0).mul(min(U.dt.mul(1.6), 1)).mul(free).mul(float(1).sub(U.freeze))));
      // speed limits
      const sp = length(v);
      const maxS = U.speedMax.mul(U.wild.mul(1.5).add(1)).mul(free).add(float(2200).mul(float(1).sub(free)));
      const minS = U.speedMin.mul(free).mul(float(1).sub(U.freeze));
      If(sp.greaterThan(maxS), () => { v.mulAssign(maxS.div(sp)); }).ElseIf(sp.lessThan(minS), () => { v.mulAssign(minS.div(max(sp, 1e-3))); });
      v.mulAssign(exp(U.freeze.mul(-8).mul(U.dt)));
      const np = p.add(v.mul(U.dt)).toVar();
      If(U.snap.greaterThan(0).and(wDes.greaterThan(0.5)), () => { np.assign(T); v.assign(vec3(0)); w.assign(1); });
      pos.element(i).assign(vec4(np, P.w));
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
    const st = smoothstep(110, 720, speed);
    const held = clamp(V.w, 0, 1);
    // far particles (20 % in free flight): dimmer, smaller, set back in z — a depth cue in the flock
    const farFree = step(fract(S.z.mul(7.77)), U.farFrac.sub(1e-4)).mul(step(1e-4, U.farFrac)).mul(float(1).sub(held));
    const size = mix(1.7, 3.3, S.y).mul(U.sizeScale).mul(mix(float(1.45), float(1), L.dark)).mul(mix(float(1), float(FAR_SIZE), farFree)).mul(U.frameGlow.mul(0.3).mul(held).add(1)); // ink dots need more coverage on paper
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
    const look = mix(U.freeDim.mul(mix(float(1), float(FAR_DIM), farFree)), U.shapeExpo.mul(U.frameGlow.mul(0.6).add(1)), held);
    const bright = mix(0.5, 1.0, S.z).mul(U.pulse.mul(0.15).add(1)).mul(U.brightness).mul(mix(float(1), expo, this.uLook.dark)).mul(look);
    // dark: additive, brightness in colour; light: ink over paper, brightness only nudges opacity
    m.fragmentNode = vec4(color.mul(mix(float(1), bright, L.dark)), disc.mul(L.alpha).mul(mix(mix(0.8, 1.0, S.z), float(1), L.dark)));
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
    this.material.dispose();
    (this.splatSprite.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
