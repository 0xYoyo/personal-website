import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant } from '../../lib/fit';
import { accel, out, prog, spring } from '../../lib/ease';
import './yoyo-network.css';

const D = 9;
const KEY = 7.4;

/** Illustrative profile page: a header with a follow button, and four posts (one with a photo). */
const POSTS = [
  { text: 'first post on here. hi.', when: '3d', likes: 8, comments: 2 },
  { text: 'sunset at the beach tonight', when: '1d', likes: 23, comments: 5, photo: true },
  { text: 'any good coffee spots in Tel Aviv?', when: '20h', likes: 4, comments: 9 },
  { text: 'you can comment on posts now. try it', when: '2h', likes: 12, comments: 3 },
] as const;
const LIKED = 1;

const T_LIKE = 1.6;
const T_FOLLOW = 3.2;
const T_COMMENT = 4.6;

export function YoyoNetwork(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.2)), 1 - accel(prog(t, D - 0.5, D - 0.05)));
  const liked = t >= T_LIKE;
  const likePop = spring(prog(t, T_LIKE, T_LIKE + 0.7), 6.5, 9);
  const burst = prog(t, T_LIKE, T_LIKE + 0.6);
  const followed = t >= T_FOLLOW;
  const followPop = spring(prog(t, T_FOLLOW, T_FOLLOW + 0.5));
  const commented = t >= T_COMMENT;

  return (
    <div ref={ref} className="sc-root sc-yoyo-network">
      <p className="sc-sr">
        yoyo-network, a social network: a profile page with four posts, one with a photo. A post gets a like, you follow the profile, and a
        comment comes in.
      </p>
      <Fit v={v} style={{ opacity: stage }}>
        <div className="sc-yn-stage" aria-hidden="true">
          <div className="sc-yn-profile">
            <span className="sc-yn-av is-big">D</span>
            <span className="sc-yn-id">
              <span className="sc-yn-name">Dana Cohen</span>
              <span className="sc-yn-meta sc-mono">
                @dana · 4 posts · {followed ? 49 : 48} followers
              </span>
            </span>
            <span className={'sc-yn-follow' + (followed ? ' is-on' : '')} style={followed ? { transform: `scale(${0.9 + 0.1 * followPop})` } : undefined}>
              {followed ? 'Following' : 'Follow'}
            </span>
          </div>
          <div className="sc-yn-grid">
            {POSTS.map((p, i) => {
              const isLiked = i === LIKED && liked;
              const comments = p.comments + (i === 3 && commented ? 1 : 0);
              return (
                <div key={p.text} className={'sc-yn-post' + ('photo' in p ? ' has-photo' : '')}>
                  <span className="sc-yn-line">
                    <span className="sc-yn-av">D</span>
                    <span className="sc-yn-who">@dana</span>
                    <span className="sc-yn-when sc-mono">{p.when}</span>
                  </span>
                  <span className="sc-yn-text">{p.text}</span>
                  {'photo' in p && (
                    <span className="sc-yn-photo">
                      <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice">
                        <defs>
                          <linearGradient id="yn-sky" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#3b4d9e" />
                            <stop offset="0.6" stopColor="#f08a5d" />
                            <stop offset="1" stopColor="#f7c66b" />
                          </linearGradient>
                        </defs>
                        <rect width="60" height="30" fill="url(#yn-sky)" />
                        <circle cx="38" cy="19" r="5" fill="#ffe2a0" />
                        <rect y="20" width="60" height="10" fill="#1f3a63" />
                        <path d="M0 22 Q15 20.5 30 22 T60 22 V30 H0Z" fill="#2c4f80" />
                        <path d="M0 26 Q20 24 40 26 T60 26 V30 H0Z" fill="#d9b98a" />
                      </svg>
                    </span>
                  )}
                  <span className="sc-yn-acts sc-mono">
                    <span
                      className={'sc-yn-like' + (isLiked ? ' is-on' : '')}
                      style={isLiked ? { transform: `scale(${0.8 + 0.2 * likePop})` } : undefined}
                    >
                      {isLiked && burst < 1 && <i className="sc-yn-burst" style={{ opacity: 1 - burst, transform: `scale(${0.6 + burst * 1.6})` }} />}
                      ♥ {p.likes + (isLiked ? 1 : 0)}
                    </span>
                    <span className={'sc-yn-com' + (i === 3 && commented ? ' is-on' : '')}>{comments} comments</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Fit>
    </div>
  );
}

export default YoyoNetwork;
export const yoyoNetworkMeta = { duration: D, keyTime: KEY } as const;
