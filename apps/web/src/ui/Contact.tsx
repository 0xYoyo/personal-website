// Contact (SPEC §2.7): the swarm forms an envelope that opens; three large links + CV.
import { useRef } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useDialog } from './useDialog';

export function Contact() {
  const ref = useRef<HTMLElement>(null);
  useDialog(ref, { initial: ref });
  const c = copy.contact;
  return (
    <div className="y-contact-wrap">
      <section ref={ref} className="y-contact" role="dialog" aria-modal="true" aria-labelledby="y-contact-line" tabIndex={-1}>
        <p className="y-contact-line" id="y-contact-line">
          {c.line}
        </p>
        <ul className="y-contact-links">
          <li>
            <a className="y-link y-contact-big y-contact-email" href={c.mailto}>
              {c.email}
            </a>
          </li>
          <li>
            <a className="y-link y-contact-big" href={c.githubHref} target="_blank" rel="noreferrer">
              {c.github}
            </a>
          </li>
          <li>
            <a className="y-link y-contact-big" href={c.linkedinHref} target="_blank" rel="noreferrer">
              {c.linkedin}
            </a>
          </li>
        </ul>
        <div className="y-contact-foot">
          <a className="y-link y-mono" href={c.cvHref} target="_blank" rel="noreferrer">
            {c.cv}
          </a>
          <button className="y-textbtn" onClick={() => ctl.closeOverlay()}>
            {c.close}
          </button>
        </div>
      </section>
    </div>
  );
}
