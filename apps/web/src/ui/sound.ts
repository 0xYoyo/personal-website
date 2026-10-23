// Generative sound, Web Audio only (SPEC §3.3, §6). Off by default.
// - a soft pad whose brightness follows swarm energy
// - a granular whisper when particles move fast
// - a tick per streamed word
// - a chord on celebrate
// - a low thump when a frame locks

export interface Sound {
  enable(): Promise<void>;
  disable(): void;
  readonly on: boolean;
  /** 0..1 overall swarm energy (pointer speed, mood) */
  energy(e: number): void;
  tick(): void;
  chord(): void;
  thump(): void;
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let padFilter: BiquadFilterNode | null = null;
  let whisperGain: GainNode | null = null;
  let on = false;
  let lastTick = 0;
  let energyNow = 0;

  function build(a: AudioContext) {
    master = a.createGain();
    master.gain.value = 0;
    master.connect(a.destination);

    // Pad: three detuned saws through a lowpass; very quiet.
    padFilter = a.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 420;
    padFilter.Q.value = 0.7;
    const padGain = a.createGain();
    padGain.gain.value = 0.05;
    padFilter.connect(padGain).connect(master);
    const notes = [110, 164.81, 220.5, 277.18]; // A2 E3 A3 C#4
    for (const f of notes) {
      for (const det of [-6, 6]) {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = a.createGain();
        g.gain.value = 0.18;
        o.connect(g).connect(padFilter);
        o.start();
      }
    }
    // slow breathing LFO on the filter
    const lfo = a.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(padFilter.frequency);
    lfo.start();

    // Whisper: looped noise through a bandpass; gain follows energy.
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i / 700));
    const noise = a.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.9;
    whisperGain = a.createGain();
    whisperGain.gain.value = 0;
    noise.connect(bp).connect(whisperGain).connect(master);
    noise.start();
  }

  function env(a: AudioContext, node: AudioParam, peak: number, attack: number, decay: number) {
    const t = a.currentTime;
    node.cancelScheduledValues(t);
    node.setValueAtTime(0.0001, t);
    node.exponentialRampToValueAtTime(peak, t + attack);
    node.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function blip(freq: number, type: OscillatorType, peak: number, attack: number, decay: number, when = 0) {
    if (!ctx || !master || !on) return;
    const a = ctx;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = a.createGain();
    o.connect(g).connect(master);
    const t = a.currentTime + when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  return {
    get on() {
      return on;
    },
    async enable() {
      if (!ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        build(ctx);
      }
      await ctx.resume().catch(() => undefined);
      on = true;
      if (master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.9, t + 1.2);
      }
    },
    disable() {
      on = false;
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.3);
        setTimeout(() => {
          if (!on) void ctx?.suspend();
        }, 400);
      }
    },
    energy(e) {
      if (!ctx || !on) return;
      energyNow = energyNow * 0.85 + Math.max(0, Math.min(1, e)) * 0.15;
      const t = ctx.currentTime;
      padFilter?.frequency.setTargetAtTime(380 + energyNow * 1800, t, 0.25);
      whisperGain?.gain.setTargetAtTime(Math.max(0, energyNow - 0.25) * 0.07, t, 0.12);
    },
    tick() {
      if (!ctx || !on) return;
      const now = performance.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      blip(1800 + Math.random() * 300, 'sine', 0.025, 0.002, 0.04);
    },
    chord() {
      if (!ctx || !on) return;
      [261.63, 329.63, 392, 523.25].forEach((f, i) => blip(f, 'triangle', 0.06, 0.02, 1.6, i * 0.04));
    },
    thump() {
      if (!ctx || !on || !master) return;
      const a = ctx;
      const o = a.createOscillator();
      o.type = 'sine';
      const g = a.createGain();
      o.connect(g).connect(master);
      const t = a.currentTime;
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      env(a, g.gain, 0.22, 0.005, 0.35);
      o.start(t);
      o.stop(t + 0.45);
    },
  };
}
