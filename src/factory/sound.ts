// A soft synthesized click for merges. No audio files; off by default.
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Two short layers: a filtered noise tick and a low sine thump. */
export function playMergeClick(): void {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime;

  const len = Math.floor(ac.sampleRate * 0.03);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400;
  band.Q.value = 1.2;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0.18;
  noise.connect(band).connect(noiseGain).connect(ac.destination);
  noise.start(t);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.0001, t);
  oscGain.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(oscGain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}
