import { describe, expect, it } from 'vitest';
import { GLYPH_IDS } from '@yoyo/protocol';
import { createBrain } from '../brain';
import { balanceTurn, countWords, createPacer, paceReply, sentenceEnds, TURN_MAX_WORDS } from '../pace';
import { createTurnSplitter, type TurnOut } from '../turns';
import { FAQ_INTENTS } from '../faq';
import { ZERO_TIMING } from '../timing';
import { MemStorage, hang, mockFetch, recorder, sseResponse, tokens } from './helpers';

// POLISH2 C1: replies arrive as turns.

const LONG =
  '[[become:loop]] He runs a factory of agents that build and review code. He writes the spec first, always. ' +
  'Agents open the pull requests, another agent reviews them, and only he merges. ' +
  'It shipped forty-four pull requests in four days. Ask me how. [[chips:How fast is it?|What has he built?]]';

const turnsOf = (paced: string) =>
  paced
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .split('||')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

describe('pacer', () => {
  it('leaves a short unpaced reply alone', () => {
    const s = '[[become:Dana]] nice to meet you, Dana. [[chips:Spell my name|Who is Yoyo?]]';
    expect(paceReply(s)).toBe(s);
  });

  it('leaves a reply the model already paced alone when every turn fits', () => {
    const s = LONG.replace('always. ', 'always. || ').replace('merges. ', 'merges. || ');
    expect(paceReply(s)).toBe(s);
  });

  it('splits a paced turn that still runs past 22 words, at its sentences, evenly', () => {
    const s = LONG.replace('always. ', 'always. || ');
    const paced = paceReply(s);
    expect(paced).toBe(s.replace('merges. ', 'merges. || '));
    for (const t of turnsOf(paced)) expect(t.split(' ').length).toBeLessThanOrEqual(TURN_MAX_WORDS);
  });

  it('splits a long unpaced reply at sentence boundaries into turns of ≤ 22 words', () => {
    expect(countWords(LONG)).toBeGreaterThan(32);
    const paced = paceReply(LONG);
    const turns = turnsOf(paced);
    expect(turns.length).toBeGreaterThan(1);
    for (const t of turns) expect(t.split(' ').length).toBeLessThanOrEqual(TURN_MAX_WORDS);
    for (const t of turns) expect(t).toMatch(/[.!?]$/);
    // nothing lost, tags untouched
    expect(paced.replace(/ \|\| /g, ' ')).toBe(LONG);
  });

  it('streams the same result however the text is cut, and lets leading tags through at once', () => {
    const p = createPacer();
    let out = p.push('[[become:loop]] He runs');
    expect(out).toBe('[[become:loop]] ');
    for (const ch of LONG.slice(out.length + 'He runs'.length)) out += p.push(ch);
    out += p.end();
    expect(out).toBe(paceReply(LONG));
  });

  it('balances: as few turns as possible, the longest as short as possible', () => {
    const s = 'He wrote the brief. One model planned it. A swarm of agents built the particles, the showcases, the builder and me. He merged.';
    expect(balanceTurn(s)).toBe('He wrote the brief. One model planned it. || A swarm of agents built the particles, the showcases, the builder and me. He merged.');
    expect(balanceTurn('Short. Fits.')).toBe('Short. Fits.');
  });

  it('a quote closing mid-sentence is not a sentence end', () => {
    expect(sentenceEnds('ask "what\'s due?" and get it. Next')).toEqual(['ask "what\'s due?" and get it.'.length]);
  });

  it('never breaks inside a tag', () => {
    const s = `${'One two three four five six seven eight. '.repeat(5)}[[build:a timer. big digits. keyboard]] on it.`;
    const paced = paceReply(s);
    expect(paced).toContain('[[build:a timer. big digits. keyboard]]');
  });
});

describe('turn splitter', () => {
  const run = (pieces: string[]) => {
    const out: TurnOut[] = [];
    const t = createTurnSplitter((o) => out.push(o));
    for (const p of pieces) t.text(p);
    t.end();
    const turns = [''];
    for (const o of out) {
      if (o.type === 'turn') turns.push('');
      else if (o.type === 'token') turns[turns.length - 1] += o.text;
    }
    return { out, turns };
  };

  it('strips the marks and emits one boundary between turns', () => {
    expect(run(['a b. || c d.']).turns).toEqual(['a b.', 'c d.']);
  });

  it('copes with a mark split across chunks', () => {
    expect(run(['a b. |', '| c d.']).turns).toEqual(['a b.', 'c d.']);
    expect(run(['a b.', ' ', '|', '|', ' c']).turns).toEqual(['a b.', 'c']);
  });

  it('never makes an empty turn (leading, trailing, doubled marks)', () => {
    const { out, turns } = run(['|| a. || || b. ||']);
    expect(turns).toEqual(['a.', 'b.']);
    expect(out[0]?.type).toBe('token');
    expect(out.at(-1)?.type).toBe('token');
  });

  it('a single pipe is just text', () => {
    expect(run(['a | b']).turns).toEqual(['a | b']);
    expect(run(['a |']).turns).toEqual(['a |']);
  });
});

describe('brain: turns', () => {
  function make(handler: Parameters<typeof mockFetch>[0], agentUrl = 'https://agent.example') {
    const rec = recorder();
    const { fetch } = mockFetch(handler);
    const brain = createBrain({
      agentUrl,
      swarmGlyphs: GLYPH_IDS,
      onEvent: rec.onEvent,
      fetch,
      storage: new MemStorage(),
      sessionStorage: new MemStorage(),
      timing: ZERO_TIMING,
      random: () => 0,
      device: 'desktop',
      firstTokenTimeoutMs: 120,
    });
    return { brain, rec };
  }

  it('every paced faq reply arrives as turns of ≤ 22 words, marks stripped', async () => {
    const { brain, rec } = make(hang, '');
    const paced = FAQ_INTENTS.filter((i) => i.reply.includes('||'));
    expect(paced.length).toBeGreaterThan(10);
    for (const intent of paced) {
      rec.clear();
      await brain.send(intent.hints[0]!);
      const turns = rec.turns();
      expect(rec.text()).not.toContain('||');
      for (const t of turns) expect(t.split(/\s+/).length, `${intent.id}: ${t}`).toBeLessThanOrEqual(TURN_MAX_WORDS);
    }
  });

  it('live text with || is split the same way', async () => {
    const { brain, rec } = make(() => sseResponse(tokens('[[become:btc]] Since 2021. |', '| He still reads the market.')));
    await brain.send('what do you make of memecoins lately?'); // routed (WAVE4 A3)
    expect(rec.turns()).toEqual(['Since 2021.', 'He still reads the market.']);
    // after the listening ring (and its release when the stream opens)
    expect(rec.actions().filter((x) => x.type !== 'mood')[0]).toEqual({ type: 'become', shape: { kind: 'glyph', id: 'btc' } });
  });

  it('a long live reply without || is paced at sentence boundaries', async () => {
    const { brain, rec } = make(() => sseResponse(tokens(...(LONG.match(/[\s\S]{1,4}/g) ?? []))));
    await brain.send('so how does your setup actually work day to day?');
    const turns = rec.turns();
    expect(turns.length).toBeGreaterThan(1);
    for (const t of turns) expect(t.split(/\s+/).length).toBeLessThanOrEqual(TURN_MAX_WORDS);
    // become first (it was at the start), chips last
    expect(rec.types()[1]).toBe('action');
    expect(rec.events.filter((e) => e.type === 'action').at(-1)).toMatchObject({ action: { type: 'chips' } });
    expect(brain.history().at(-1)?.text).toBe(LONG);
  });

  it('a short live reply without || stays one turn', async () => {
    const { brain, rec } = make(() => sseResponse(tokens('[[become:🚀]] obviously.')));
    await brain.send('show me something that flies please');
    expect(rec.turns()).toEqual(['obviously.']);
    expect(rec.types()).not.toContain('turn');
  });
});
