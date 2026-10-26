import { describe, expect, it } from 'vitest';
import { EXTRA_INTENTS } from '../extras';
import { FAQ_EGGS } from '../faq';

describe('easter eggs', () => {
  it('serve exactly the lines in the last section of faq.md', () => {
    expect(Object.keys(FAQ_EGGS).sort()).toEqual(EXTRA_INTENTS.map((x) => x.id).sort());
    for (const x of EXTRA_INTENTS) expect(x.reply, x.id).toBe(FAQ_EGGS[x.id]);
  });
});
