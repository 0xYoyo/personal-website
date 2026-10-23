// Speech in and out. Recognition uses the Web Speech API where it exists (Chrome,
// Edge, Safari 17+); output uses speechSynthesis and is only ever started by an
// explicit speak() call (the site keeps voice off until the visitor turns it on).

// Minimal Web Speech typings (not in lib.dom for every TS version).
interface SpeechRecognitionAlternativeLike { transcript: string; confidence: number }
interface SpeechRecognitionResultLike { readonly length: number; readonly isFinal: boolean; [i: number]: SpeechRecognitionAlternativeLike }
interface SpeechRecognitionEventLike { readonly resultIndex: number; readonly results: { readonly length: number; [i: number]: SpeechRecognitionResultLike } }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const g = globalThis as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export const speechRecognitionSupported = (): boolean => recognitionCtor() !== null;

export interface RecognizerOptions {
  lang?: string;
  /** interim transcript while speaking */
  onInterim?(text: string): void;
  /** final transcript when the visitor stops (or stop() is called) */
  onFinal?(text: string): void;
  /** mic loudness 0..1 at ~60 Hz while listening (needs mic permission; silently absent otherwise) */
  onLevel?(level01: number): void;
  onError?(error: string): void;
  onEnd?(): void;
}

export interface Recognizer {
  readonly supported: boolean;
  readonly listening: boolean;
  /** begin listening (call from a user gesture: hold mic / hold space) */
  start(): void;
  /** stop and deliver the final transcript */
  stop(): void;
  /** stop without delivering anything */
  abort(): void;
}

export function createRecognizer(opts: RecognizerOptions = {}): Recognizer {
  const Ctor = recognitionCtor();
  let rec: SpeechRecognitionLike | null = null;
  let listening = false;
  let finalText = '';
  let interimText = '';
  let delivered = false;
  let aborted = false;
  let level: { stop(): void } | null = null;

  const deliver = () => {
    if (delivered || aborted) return;
    delivered = true;
    const text = (finalText + ' ' + interimText).replace(/\s+/g, ' ').trim();
    if (text) opts.onFinal?.(text);
  };

  const cleanup = () => {
    listening = false;
    level?.stop();
    level = null;
    opts.onLevel?.(0);
  };

  return {
    supported: !!Ctor,
    get listening() {
      return listening;
    },
    start() {
      if (!Ctor || listening) return;
      finalText = '';
      interimText = '';
      delivered = false;
      aborted = false;
      rec = new Ctor();
      rec.lang = opts.lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US') ?? 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const t = r?.[0]?.transcript ?? '';
          if (r?.isFinal) finalText += ` ${t}`;
          else interim += t;
        }
        interimText = interim;
        opts.onInterim?.((finalText + ' ' + interim).replace(/\s+/g, ' ').trim());
      };
      rec.onerror = (e) => {
        if (e.error !== 'aborted' && e.error !== 'no-speech') opts.onError?.(e.error);
      };
      rec.onend = () => {
        deliver();
        cleanup();
        opts.onEnd?.();
      };
      try {
        rec.start();
        listening = true;
      } catch (err) {
        opts.onError?.(err instanceof Error ? err.message : 'start-failed');
        return;
      }
      if (opts.onLevel) {
        void startLevelMeter(opts.onLevel).then((m) => {
          if (listening) level = m;
          else m?.stop();
        });
      }
    },
    stop() {
      if (!rec || !listening) return;
      try {
        rec.stop(); // onend delivers the transcript
      } catch {
        deliver();
        cleanup();
      }
    },
    abort() {
      aborted = true;
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      cleanup();
    },
  };
}

/** RMS level of the mic through an AnalyserNode. Resolves null without permission or support. */
async function startLevelMeter(onLevel: (l: number) => void): Promise<{ stop(): void } | null> {
  try {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!md?.getUserMedia || !AC) return null;
    const stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.6;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += (buf[i] ?? 0) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      // Speech RMS sits around 0.02–0.2; map to 0..1 with a soft knee.
      const l = Math.min(1, Math.max(0, (Math.log10(rms + 1e-4) + 3.2) / 2.4));
      smooth = smooth * 0.7 + l * 0.3;
      onLevel(smooth);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      stop() {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/**
 * Ranks voices: English first (en-US/en-GB slightly preferred), local over
 * network, and "natural"-sounding engines (Siri, Natural, Neural, Premium,
 * Enhanced, and macOS's better named voices) over the robotic defaults.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang = 'en'): V | null {
  const want = lang.toLowerCase().slice(0, 2);
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const vl = v.lang.toLowerCase().replace('_', '-');
    if (!vl.startsWith(want)) continue;
    let s = 0;
    if (v.localService) s += 30;
    if (/natural|neural|premium|enhanced|siri/i.test(v.name)) s += 40;
    if (/^(samantha|daniel|karen|moira|serena|alex|ava|evan|zoe|allison|tom)\b/i.test(v.name)) s += 15;
    if (/google/i.test(v.name)) s += 10;
    if (/compact|espeak|novelty|whisper|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|zarvox|albert|fred|junior|ralph|kathy/i.test(v.name)) s -= 60;
    if (vl === 'en-us' || vl === 'en-gb') s += 5;
    if (v.default) s += 2;
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

export interface SpeakOptions {
  lang?: string;
  /** default 1.05 (SPEC §6) */
  rate?: number;
  pitch?: number;
  /** word boundary callback (drive the swarm's speaking pulse) */
  onBoundary?(charIndex: number): void;
  onEnd?(): void;
}

export interface Speaking {
  cancel(): void;
  done: Promise<void>;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!ss) return Promise.resolve([]);
  const now = ss.getVoices();
  if (now.length) return Promise.resolve((cachedVoices = now));
  return new Promise((resolve) => {
    const done = () => resolve((cachedVoices = ss.getVoices()));
    ss.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

export const speechSynthesisSupported = (): boolean => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

/** Speaks one line. Cancels anything already speaking. No-op (resolved) where unsupported. */
export function speak(text: string, opts: SpeakOptions = {}): Speaking {
  if (!speechSynthesisSupported() || !text.trim()) {
    return { cancel() {}, done: Promise.resolve() };
  }
  let cancelled = false;
  const done = (async () => {
    const voices = cachedVoices.length ? cachedVoices : await loadVoices();
    if (cancelled) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voices, opts.lang ?? 'en');
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = opts.rate ?? 1.05;
    u.pitch = opts.pitch ?? 1;
    await new Promise<void>((resolve) => {
      u.onboundary = (e) => {
        if (e.name === 'word' || !e.name) opts.onBoundary?.(e.charIndex);
      };
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
    opts.onEnd?.();
  })();
  return {
    cancel() {
      cancelled = true;
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    },
    done,
  };
}
