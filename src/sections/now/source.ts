// The excerpt streamed in this PR's diff: the live-data hooks, which are the
// part of "Now" worth reading (how each source fails silently).
import raw from './useLive.ts?raw';
import { excerpt } from '../excerpt';

export const source = excerpt(raw, 70);
