import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, out, prog, spring } from '../../lib/ease';
import './yoyo-network.css';

const D = 9;
const KEY = 6.2;

/** Illustrative feed: a guest logs in, posts land in the home feed, a like and a follow go through the API. */
const POSTS = [
  { who: 'dana', text: 'first post on here. hi.', likes: 3 },
  { who: 'guest', text: 'demo profile, just looking around', likes: 0 },
  { who: 'yoyo', text: 'shipped comments today', likes: 11 },
] as const;
const CALLS = ['POST /api/login', 'GET /api/feed', 'POST /api/posts/3/likes', 'POST /api/users/dana/follow'] as const;

export function YoyoNetwork(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const post = (i: number) => out(prog(t, 1.0 + i * 0.55, 1.6 + i * 0.55));
  const liked = t >= 3.6;
  const likePop = spring(prog(t, 3.6, 4.3), 6.5, 9);
  const followed = t >= 4.8;
  const call = (i: number) => out(prog(t, 0.5 + i * 1.35, 0.9 + i * 1.35));

  return (
    <div ref={ref} className="sc-root sc-yoyo-network">
      <p className="sc-sr">
        yoyo-network: a social network with its own REST API. A guest logs in, posts appear in the home feed, a like and a follow go
        through the API.
      </p>
      <div className="sc-yn-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-yn-feed">
          <div className="sc-yn-head">
            <span className="sc-yn-logo">yoyo network</span>
            <span className={'sc-yn-follow' + (followed ? ' is-on' : '')}>{followed ? 'following dana' : 'follow dana'}</span>
          </div>
          {POSTS.map((p, i) => {
            const k = post(i);
            const isLiked = i === 2 && liked;
            return (
              <div key={p.who} className="sc-yn-post" style={{ opacity: k, transform: `translateY(${(1 - k) * 2}cqw)` }}>
                <span className={'sc-yn-av is-' + p.who} />
                <span className="sc-yn-body">
                  <span className="sc-yn-who">@{p.who}</span>
                  <span className="sc-yn-text">{p.text}</span>
                </span>
                <span className={'sc-yn-like' + (isLiked ? ' is-on' : '')} style={isLiked ? { transform: `scale(${0.8 + 0.2 * likePop})` } : undefined}>
                  ♥ <span className="sc-mono">{p.likes + (isLiked ? 1 : 0)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="sc-yn-api sc-mono">
          {CALLS.map((c, i) => (
            <div key={c} className="sc-yn-call" style={{ opacity: call(i) }}>
              <span>{c}</span>
              <span className="sc-yn-ok">{i === 0 ? '200 · jwt' : '200'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default YoyoNetwork;
export const yoyoNetworkMeta = { duration: D, keyTime: KEY } as const;
