// Speech in and out (SPEC §6). Voice output is off by default; the mic is
// hidden when SpeechRecognition is missing.

// ---- output -----------------------------------------------------------------

export interface Voice {
  readonly supported: boolean;
  speak(text: string, onWord?: () => void): void;
  cancel(): void;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  if (!all.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 8 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (v.localService ? 1 : 0) +
    (/en-(US|GB)/i.test(v.lang) ? 1 : 0);
  return [...all].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function createVoice(): Voice {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let voice: SpeechSynthesisVoice | null = null;
  if (supported) {
    voice = pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', () => (voice = pickVoice()));
  }
  return {
    supported,
    speak(text, onWord) {
      if (!supported || !text.trim()) return;
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onboundary = (e) => {
        if (e.name === 'word') onWord?.();
      };
      speechSynthesis.speak(u);
    },
    cancel() {
      if (supported) speechSynthesis.cancel();
    },
  };
}

// ---- input ------------------------------------------------------------------

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

export const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export interface Mic {
  readonly supported: boolean;
  start(): void;
  /** Stop listening; `send` false discards the transcript */
  stop(send?: boolean): void;
  readonly listening: boolean;
}

export function createMic(h: { onText(partial: string): void; onFinal(text: string): void; onLevel(l: number): void; onState(listening: boolean): void }): Mic {
  const Ctor = recognitionCtor();
  let rec: RecognitionLike | null = null;
  let listening = false;
  let transcript = '';
  let sendOnEnd = true;
  let stream: MediaStream | null = null;
  let actx: AudioContext | null = null;
  let raf = 0;

  const stopLevel = () => {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    void actx?.close().catch(() => undefined);
    actx = null;
    h.onLevel(0);
  };

  const startLevel = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      actx = new AudioContext();
      const an = actx.createAnalyser();
      an.fftSize = 512;
      actx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        h.onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* no level meter; recognition may still work */
    }
  };

  return {
    supported: !!Ctor,
    get listening() {
      return listening;
    },
    start() {
      if (!Ctor || listening) return;
      transcript = '';
      sendOnEnd = true;
      rec = new Ctor();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (e) => {
        let s = '';
        for (let i = 0; i < e.results.length; i++) s += e.results[i]![0]!.transcript;
        transcript = s.trim();
        h.onText(transcript);
      };
      rec.onerror = () => undefined;
      rec.onend = () => {
        listening = false;
        h.onState(false);
        stopLevel();
        if (sendOnEnd && transcript) h.onFinal(transcript);
      };
      try {
        rec.start();
        listening = true;
        h.onState(true);
        void startLevel();
      } catch {
        listening = false;
      }
    },
    stop(send = true) {
      sendOnEnd = send;
      try {
        rec?.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
