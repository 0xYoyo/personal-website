/**
 * The merge, as one continuous ~1 s move with no blank frame (POLISH_WAVE B):
 *
 *   0 ms        press: the button reads "Merged" in ink (CSS)
 *   0–320 ms    the card folds: its diff pane closes upward; its header row
 *               flies to rest as the section's commit line
 *   120–720 ms  the title flies, as one element, from the card into the h2
 *   120–760 ms  the section content, mounted at 0 ms, prints in top to bottom
 *   320–700 ms  what is left of the card (its footer) fades out
 *   450 ms      per-section draw animations start (MOUNT_ANIM_DELAY)
 *
 * The card stays exactly where it was (same left/top/width) while it is pinned
 * over the section. Everything runs on the Web Animations API from a layout
 * effect, so the first painted frame after the merge already has every element
 * in place.
 */

export const CHOREO = {
  // Eases out late rather than early, so the diff is still on screen while the wipe starts printing.
  fold: { duration: 320, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
  cardFade: { delay: 320, duration: 380 },
  sideFade: { delay: 320, duration: 380 },
  commitLine: { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  commitTail: { delay: 200, duration: 240 },
  title: { delay: 120, duration: 600, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  wipe: { delay: 120, duration: 640, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  /** The folded card is removed from the DOM after this. */
  overlayMs: 720,
} as const;

/** When per-section mount animations (diagram draw, spine, graph, typing) start, ms after the merge. */
export const MOUNT_ANIM_DELAY = 450;

export interface FoldTargets {
  section: HTMLElement;
  /** Wrapper around the slot (dashed outline + PR card) */
  holder: HTMLElement;
  commit: HTMLElement | null;
  titleText: HTMLElement | null;
  body: HTMLElement;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const fontSize = (el: Element) => parseFloat(getComputedStyle(el).fontSize) || 1;

/** Runs the merge. Returns the animations so a re-render or replay can cancel them. */
export function runMergeFold({ section, holder, commit, titleText, body }: FoldTargets): Animation[] {
  const anims: Animation[] = [];
  if (typeof holder.animate !== 'function') return anims;

  // 1. Measure the card where the visitor saw it, against the box its absolute position resolves
  //    in (the section's container: its padding box, so subtract its border).
  const hRect = holder.getBoundingClientRect();
  const base = (holder.offsetParent as HTMLElement | null) ?? section;
  const bRect = base.getBoundingClientRect();
  const cardNum = holder.querySelector<HTMLElement>('.pr-num');
  const cardMeta = holder.querySelector<HTMLElement>('.pr-meta');
  const cardTitle = holder.querySelector<HTMLElement>('.pr-title-text');
  const numRect = cardNum?.getBoundingClientRect();
  const titleRect = cardTitle?.getBoundingClientRect();
  const numSize = cardNum ? fontSize(cardNum) : 0;
  const titleSize = cardTitle ? fontSize(cardTitle) : 0;

  // 2. Pin it there, out of flow: the merged section now lays out beneath it at its real height.
  Object.assign(holder.style, {
    position: 'absolute',
    top: px(hRect.top - bRect.top - base.clientTop),
    left: px(hRect.left - bRect.left - base.clientLeft),
    width: px(hRect.width),
    margin: '0',
    zIndex: '1',
    pointerEvents: 'none',
  });
  holder.setAttribute('aria-hidden', 'true');
  holder.inert = true;
  // The header row and the title travel as the section's own elements; hide the card's copies.
  if (cardMeta) cardMeta.style.visibility = 'hidden';
  if (cardTitle) cardTitle.style.visibility = 'hidden';

  // 3. The card folds: the diff pane closes upward (its last lines scroll out), the card fades.
  const fold = holder.querySelector<HTMLElement>('.pr-fold');
  if (fold) {
    fold.style.overflow = 'hidden';
    anims.push(fold.animate([{ height: px(fold.offsetHeight) }, { height: '0px' }], { ...CHOREO.fold, fill: 'forwards' }));
    const lines = fold.querySelector<HTMLElement>('.diff-table');
    if (lines) anims.push(lines.animate([{ transform: 'none' }, { transform: 'translateY(-56px)' }], { ...CHOREO.fold, fill: 'forwards' }));
  }
  // The header's own space closes too (its title and #N already left), so the footer with the
  // pressed "Merged" button rides up to where the commit line was born.
  const head = holder.querySelector<HTMLElement>('.pr-head');
  if (head) {
    head.style.overflow = 'hidden';
    anims.push(
      head.animate([{ height: px(head.offsetHeight), opacity: 1 }, { height: '0px', opacity: 0 }], { ...CHOREO.fold, fill: 'forwards' }),
    );
  }
  const card = holder.querySelector<HTMLElement>('.pr');
  if (card) anims.push(card.animate([{ opacity: 1 }, { opacity: 0 }], { ...CHOREO.cardFade, easing: 'ease-in', fill: 'both' }));
  const slot = holder.querySelector<HTMLElement>('.slot');
  if (slot) {
    anims.push(slot.animate([{ borderColor: getComputedStyle(slot).borderTopColor }, { borderColor: 'transparent' }], { delay: 320, duration: 380, fill: 'both' }));
  }
  const side = holder.querySelector<HTMLElement>('.slot-side');
  if (side) anims.push(side.animate([{ opacity: 1 }, { opacity: 0 }], { ...CHOREO.sideFade, fill: 'both' }));

  // 4. The header row becomes the commit line: fly it from the card's "#N" to its resting place.
  if (commit && numRect) {
    const restNum = commit.querySelector<HTMLElement>('.cl-num') ?? commit;
    const r = restNum.getBoundingClientRect();
    const k = numSize / fontSize(restNum);
    commit.style.transformOrigin = '0 0';
    anims.push(
      commit.animate(
        [{ transform: `translate(${px(numRect.left - r.left)}, ${px(numRect.top - r.top)}) scale(${k})` }, { transform: 'none' }],
        { ...CHOREO.commitLine },
      ),
    );
    const tail = commit.querySelector<HTMLElement>('.cl-meta');
    if (tail) anims.push(tail.animate([{ opacity: 0 }, { opacity: 1 }], { ...CHOREO.commitTail, fill: 'backwards' }));
  }

  // 5. The title, as one element (same face, weight and tracking; only the size differs).
  if (titleText && titleRect) {
    const r = titleText.getBoundingClientRect();
    const k = titleSize / fontSize(titleText);
    titleText.style.transformOrigin = '0 0';
    anims.push(
      titleText.animate(
        [{ transform: `translate(${px(titleRect.left - r.left)}, ${px(titleRect.top - r.top)}) scale(${k})` }, { transform: 'none' }],
        { ...CHOREO.title, fill: 'backwards' },
      ),
    );
  }

  // 6. The ink wipe: content is already laid out; it prints in from just below the heading.
  anims.push(body.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { ...CHOREO.wipe, fill: 'backwards' }));

  // Anchor every animation to the click, not to the first frame painted after it: mounting the
  // section is a long task (~80 ms), and without this the whole timeline would slip by that much.
  const now = document.timeline?.currentTime;
  if (typeof now === 'number') for (const a of anims) a.startTime = now;

  return anims;
}
