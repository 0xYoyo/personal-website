// @yoyo/agent-client — the mind's client. Framework-free.
//
//   const brain = createBrain({ agentUrl: import.meta.env.VITE_AGENT_URL, swarmGlyphs: GLYPH_IDS, onEvent });
//   await brain.send('who is yoyo?');      // start → token… / action… → end
//   await brain.build('a pomodoro timer'); // buildStart → buildChunk… → buildDone
//   const { url } = await brain.share(html);

export { createBrain, cleanHtml, LIMITS } from './brain';
export type { Brain, BrainEvent, BrainErrorReason, BrainMode, BrainOptions, ChatMessage } from './brain';

export { createTagStream, extractActions, resolveTag, shapeFromArg, isEmojiOnly, leadingEmoji } from './tags';
export type { TagStream, ParseOut, ResolveOptions } from './tags';

export { classify, rankIntents, captureName, tokenize } from './intents';
export type { Classification } from './intents';
export { scriptedReply, RESTING_LINE, ADDED_LINES } from './scripted';
export { EXTRA_INTENTS } from './extras';
export type { ExtraIntent } from './extras';
export { FAQ_INTENTS, FAQ_UNKNOWN, EMOJI_BEATS } from './faq';
export type { FaqIntent } from './faq';

export { createMemory, KEYS as MEMORY_KEYS } from './memory';
export type { Memory, MemorySnapshot, StoredBuild, StorageLike } from './memory';

export { decodeShareHash, hashUrl, INLINE_SHARE_BYTES, MAX_SHARE_BYTES } from './share';
export type { ShareResult } from './share';

export { createRecognizer, speak, pickVoice, speechRecognitionSupported, speechSynthesisSupported } from './speech';
export type { Recognizer, RecognizerOptions, SpeakOptions, Speaking, VoiceLike } from './speech';

export { DEFAULT_TIMING } from './timing';
export type { Timing } from './timing';

