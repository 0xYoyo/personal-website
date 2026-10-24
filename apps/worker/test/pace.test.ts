import { describe, expect, it } from 'vitest';
import { paceChat } from '../src/app';
import { balanceTurn, countWords, createPacer, paceReply, TURN_MAX_WORDS } from '../src/pace';
import { chatBody, events, setup } from './helpers';

// POLISH2 C4: the Worker paces replies the model didn't.

const UNPACED =
  '[[become:loop]] He runs a factory of agents that build and review code. He writes the spec first, always. ' +
  'Agents open the pull requests, another agent reviews them, and only he merges. ' +
  'It shipped forty-four pull requests in four days. Ask me how. [[chips:How fast is it?|What has he built?]]';

const turns = (s: string) =>
  s
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .split('||')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

describe('pacer', () => {
  it('a reply over 32 words with no || gets || at sentence boundaries, ≤ 22 words a turn', () => {
    expect(countWords(UNPACED)).toBeGreaterThan(32);
    const out = paceReply(UNPACED);
    expect(out).not.toBe(UNPACED);
    expect(turns(out).length).toBeGreaterThan(1);
    for (const t of turns(out)) {
      expect(t.split(' ').length).toBeLessThanOrEqual(TURN_MAX_WORDS);
      expect(t).toMatch(/[.!?]$/);
    }
    // only marks were added; the tags are untouched
    expect(out.replace(/ \|\| /g, ' ')).toBe(UNPACED);
    expect(out).toContain('[[chips:How fast is it?|What has he built?]]');
  });

  it('leaves short replies and well-paced replies alone', () => {
    const short = '[[become:🚀]] [[mood:excited]] obviously.';
    expect(paceReply(short)).toBe(short);
    const thirty = `${'word '.repeat(29)}end.`;
    expect(paceReply(thirty)).toBe(thirty);
    const paced = 'Three reasons. No adjectives. || He ships: 917 public commits this year, a real game, a published connector, a search engine. || And he tells the truth.';
    expect(paceReply(paced)).toBe(paced);
  });

  it('splits a paced turn that still runs long, evenly', () => {
    expect(balanceTurn('He wrote the brief. One model planned it. A swarm of agents built the particles, the showcases, the builder and me. He merged.')).toBe(
      'He wrote the brief. One model planned it. || A swarm of agents built the particles, the showcases, the builder and me. He merged.',
    );
  });

  it('gives the same result however the stream is cut, and lets a leading tag through at once', () => {
    const p = createPacer();
    expect(p.push('[[become:lo')).toBe('');
    let out = p.push('op]] He');
    expect(out).toBe('[[become:loop]] ');
    for (const ch of UNPACED.slice(out.length + 'He'.length)) out += p.push(ch);
    out += p.end();
    expect(out).toBe(paceReply(UNPACED));
  });

  it('never cuts inside a tag', () => {
    const s = `${'One two three four five six seven eight. '.repeat(5)}[[build:a timer. big digits. keyboard]] on it.`;
    expect(paceReply(s)).toContain('[[build:a timer. big digits. keyboard]] on it.');
  });

  it('paceChat flushes what it holds before passing an upstream error on', async () => {
    async function* src() {
      yield 'half a';
      throw new Error('upstream');
    }
    const got: string[] = [];
    await expect(
      (async () => {
        for await (const x of paceChat(src())) got.push(x);
      })(),
    ).rejects.toThrow('upstream');
    expect(got).toEqual(['half a']);
  });
});

describe('/chat', () => {
  it('streams an unpaced long reply out paced', async () => {
    const { post } = setup({ reply: UNPACED.match(/[\s\S]{1,5}/g)! });
    const ev = await events(await post('/chat', chatBody('agents?')));
    expect(ev.at(-1)).toEqual({ type: 'done' });
    const text = ev.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(text).toBe(paceReply(UNPACED));
    // the leading tag goes out first, before the text it precedes is known
    expect(ev[0]).toMatchObject({ type: 'token', text: expect.stringMatching(/^\[\[become:loop\]\]\s*$/) });
  });
});
