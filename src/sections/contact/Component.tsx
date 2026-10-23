import { hireMailto, profile } from '../../content/profile';
import { buildLine } from './footer';
import { useCopy } from './useCopy';
import './contact.css';

const cvHref = `${import.meta.env.BASE_URL}${profile.links.cv}`;

// Big typographic list, in the order a recruiter reaches for them.
const LINKS = [
  { label: profile.email, href: hireMailto },
  { label: 'GitHub', href: profile.links.github },
  { label: 'LinkedIn', href: profile.links.linkedin },
  { label: 'Download CV (PDF)', href: cvHref, download: 'Yoav_Zrihan_CV.pdf' },
];

export default function ContactSection() {
  const { copied, copy } = useCopy();

  return (
    <div className="contact">
      <p className="lede">If you're hiring a student engineer who ships, open a PR.</p>

      <ul className="contact-links">
        {LINKS.map((link) => (
          <li key={link.label}>
            <a className="contact-link" href={link.href} download={link.download}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      <p className="contact-copy mono">
        <span className="contact-address">{profile.email}</span>
        <button type="button" className="contact-copy-btn" onClick={() => copy(profile.email)}>
          <span aria-live="polite">{copied ? 'Copied' : 'Copy email'}</span>
        </button>
      </p>

      <footer className="contact-footer">
        <p>{buildLine()}</p>
        <p>
          v0.1 (Aug 2023, hand-written during The Odin Project) still lives at{' '}
          <a href={profile.links.v01}>0xyoyo.github.io/personal-portfolio-0xYoyo</a>
        </p>
        <p className="mono contact-colophon">
          Built with React, Vite and motion. Commit Mono and Bricolage Grotesque. No analytics, no cookies.
        </p>
      </footer>
    </div>
  );
}
