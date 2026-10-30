import { useEffect, useRef, useState } from 'react';
import { useOnscreen, type ShowcaseProps } from '../../lib/clock';
import { footageUrl } from '../../config';
import './prompt-racers.css';

/**
 * Real gameplay footage of Prompt Racers (captured from the shipped single-file build, see tools/capture-prompt-racers.mjs),
 * muted and looping, with the Hebrew title over it.
 */
export function PromptRacers({ reducedMotion, playing = true, seek }: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const onscreen = useOnscreen(ref);
  const [prefersRm, setPrefersRm] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersRm(mq.matches);
    const on = () => setPrefersRm(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const still = !!reducedMotion || prefersRm;
  const shouldPlay = !still && playing && onscreen && seek === undefined;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (seek !== undefined) {
      try {
        v.pause();
        if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = seek % v.duration;
        else v.addEventListener('loadedmetadata', () => (v.currentTime = seek % v.duration), { once: true });
      } catch {
        /* not a media-capable environment */
      }
      return;
    }
    if (shouldPlay) {
      try {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch {
        /* jsdom, or autoplay refused */
      }
    } else {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    }
  }, [shouldPlay, seek]);

  return (
    <div ref={ref} className="sc-root sc-prompt-racers">
      <p className="sc-sr">
        Prompt Racers: real gameplay from the shipped game, a kart race on the Data Oasis track. One HTML file, zero network calls.
      </p>
      {still ? (
        <img className="sc-prompt-racers-media" src={footageUrl('prompt-racers-poster.jpg')} alt="" aria-hidden="true" draggable={false} />
      ) : (
        <video
          ref={video}
          className="sc-prompt-racers-media"
          muted
          loop
          playsInline
          preload="auto"
          poster={footageUrl('prompt-racers-poster.jpg')}
          aria-hidden="true"
          disablePictureInPicture
        >
          <source src={footageUrl('prompt-racers.webm')} type="video/webm" />
          <source src={footageUrl('prompt-racers.mp4')} type="video/mp4" />
        </video>
      )}
      <div className="sc-prompt-racers-plate" aria-hidden="true">
        <span className="sc-prompt-racers-title" dir="rtl" lang="he">
          מרוץ הפרומפטים
        </span>
        <span className="sc-mono sc-prompt-racers-tag">one file · zero network calls</span>
      </div>
    </div>
  );
}

export default PromptRacers;
