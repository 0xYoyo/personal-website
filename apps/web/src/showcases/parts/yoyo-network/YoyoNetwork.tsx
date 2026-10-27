import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, out, prog, spring } from '../../lib/ease';
import './yoyo-network.css';

const D = 9;
const KEY = 6.2;

/** Illustrative feed: posts land in the home feed, one gets a like, and a follow goes through. */
const POSTS = [
  { who: 'dana', text: 'first post on here. hi.', likes: 3 },
  { who: 'guest', text: 'demo profile, just looking around', likes: 0 },
  { who: 'yoyo', text: 'shipped comments today', likes: 11 },
] as const;
const PEOPLE = [
  { who: 'dana', posts: 12 },
  { who: 'noa', posts: 5 },
] as const;

export function YoyoNetwork(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const post = (i: number) => out(prog(t, 0.8 + i * 0.55, 1.4 + i * 0.55));
  const liked = t >= 3.4;
  const likePop = spring(prog(t, 3.4, 4.1), 6.5, 9);
  const side = out(prog(t, 1.2, 1.8));
  const followed = (i: number) => t >= 4.4 + i * 0.9;

  return (
    <div ref={ref} className="sc-root sc-yoyo-network">
      <p className="sc-sr">
        yoyo-network: a social network. Posts appear in the home feed, one gets a like, and you follow two people.
      </p>
      <div className="sc-yn-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-yn-feed">
          <div className="sc-yn-head">
            <span className="sc-yn-logo">yoyo network</span>
            <span className="sc-yn-tab">home</span>
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
        <div className="sc-yn-people" style={{ opacity: side }}>
          <span className="sc-yn-label">people</span>
          {PEOPLE.map((p, i) => (
            <div key={p.who} className="sc-yn-person">
              <span className={'sc-yn-av is-' + p.who} />
              <span className="sc-yn-body">
                <span className="sc-yn-name">@{p.who}</span>
                <span className="sc-yn-who">{p.posts} posts</span>
              </span>
              <span className={'sc-yn-follow' + (followed(i) ? ' is-on' : '')}>{followed(i) ? 'following' : 'follow'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default YoyoNetwork;
export const yoyoNetworkMeta = { duration: D, keyTime: KEY } as const;
