// The entrance → show hand-off (WAVE6 T1). On an automatic first presentation (the show not yet seen in this tab,
// FIX4 W10) the YOYO entrance flows straight into the show's first scene: no greeting and no chip row in between,
// and no wait after it. The hand-off is armed before the entrance starts; anything the visitor does before the
// show starts (a click or tap, a key, the wheel, a card or panel they opened, a message they sent) calls it off
// for good, and the page lands on the greeting instead, as a visit that already saw the show does.

/** What the hand-off needs to know about the page at the entrance's end. */
export interface HandoffState {
  /** an overlay is up (a shared build, a card or panel the visitor opened) */
  overlay: string;
  /** something already used the page's first moment (a message sent, a shared build opened) */
  idleSpent: boolean;
}

export interface Handoff {
  /** the show will not start by itself any more (never eligible, the visitor acted, or it was taken) */
  readonly cancelled: boolean;
  /**
   * At the entrance's end: whether the show starts now, straight from it. True at most once; after the call
   * the hand-off is spent either way (the show never starts by itself later).
   */
  take(s: HandoffState): boolean;
  /** Stop listening (the page is going away, or the boot ran again). */
  disarm(): void;
}

/** The visitor's input that calls the hand-off off. Modifier keys alone do not (Cmd held to switch apps). */
const INPUTS = ['pointerdown', 'keydown', 'wheel'] as const;
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

export function armHandoff(o: { eligible: boolean; target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> }): Handoff {
  const target = o.target ?? globalThis;
  let off = !o.eligible;
  const onInput = (e: Event) => {
    if (e.type === 'keydown' && MODIFIERS.has((e as KeyboardEvent).key)) return;
    cancel();
  };
  const disarm = () => {
    for (const t of INPUTS) target.removeEventListener(t, onInput, true);
  };
  const cancel = () => {
    off = true;
    disarm();
  };
  if (!off) for (const t of INPUTS) target.addEventListener(t, onInput, { capture: true, passive: true });
  return {
    get cancelled() {
      return off;
    },
    take(s) {
      const go = !off && s.overlay === 'none' && !s.idleSpent;
      cancel();
      return go;
    },
    disarm,
  };
}
