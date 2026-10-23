// The mind. Integration swaps `./stub` for the real brain (live SSE with the
// scripted fallback); the UI relies only on `createBrain()` and ./types.
export { createBrain } from './stub';
export { BrainError } from './types';
export type { Brain, BrainOptions, BuildHandlers, BuildResult, Memory, Reply, ReplyHandlers, StoredBuild } from './types';
export { readSharedFromHash } from './share';
