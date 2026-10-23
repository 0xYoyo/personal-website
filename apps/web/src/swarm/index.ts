// The body. Integration swaps `./stub` for the real engine; the UI only ever
// imports from here and only relies on `createSwarm(canvas): SwarmHandle`.
export { createSwarm } from './stub';
export type { SwarmHandle } from '@yoyo/protocol';
