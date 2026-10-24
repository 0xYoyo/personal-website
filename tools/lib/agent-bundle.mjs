// Loads the site's real scripted brain (TypeScript, apps/web/src/agent/client) into Node by
// bundling it in memory with esbuild (already installed with Vite). Used by the mock worker and
// by tools/eval-brain.mjs so both answer exactly like the scripted brain the site ships.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const client = join(root, 'apps', 'web', 'src', 'agent', 'client');
const content = join(root, 'apps', 'web', 'src', 'content');
const workerPace = join(root, 'apps', 'worker', 'src', 'pace.ts');

const ENTRY = `
export { classify, rankIntents, captureName } from './intents';
export { scriptedReply, replyFor, withRestingLine, ADDED_LINES, RESTING_LINE } from './scripted';
export { paceReply, countWords, TURN_MAX_WORDS, AUTO_PACE_WORDS } from './pace';
export { createTurnSplitter } from './turns';
export { paceReply as workerPaceReply } from ${JSON.stringify(workerPace)};
export { EXTRA_INTENTS } from './extras';
export { FAQ_INTENTS, FAQ_UNKNOWN, EMOJI_BEATS } from './faq';
export { extractActions, createTagStream } from './tags';
export { pickExampleId, EXAMPLE_RULES } from './pick-example';
export { EXAMPLE_DONE_LINE, CHANGE_RESTING_LINE, CHANGE_SAME_LINE, liveDoneLine } from './lines';
export * as chips from ${JSON.stringify(join(content, 'chips.ts'))};
export { GLYPH_IDS, PROJECT_IDS, STORY_IDS } from '@yoyo/protocol';
`;

let cached = null;

/** @returns {Promise<Record<string, any>>} the bundled module */
export function loadAgent() {
  cached ??= (async () => {
    const { build } = await import('esbuild');
    const out = await build({
      stdin: { contents: ENTRY, resolveDir: client, loader: 'ts', sourcefile: 'agent-entry.ts' },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      logLevel: 'silent',
    });
    const code = out.outputFiles[0].text;
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  })();
  return cached;
}
