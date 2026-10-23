import { describe, expect, it } from 'vitest';
import { createFenceStripper, stripFences } from '../src/fence';

const DOC = '<!doctype html><html><head></head><body><p>x</p></body></html>';

function streamed(pieces: string[]): string {
  const f = createFenceStripper();
  return pieces.map((p) => f.push(p)).join('') + f.end();
}

function charByChar(s: string) {
  return streamed([...s]);
}

describe('fence stripper', () => {
  it('passes raw HTML through unchanged', () => {
    expect(stripFences(DOC)).toBe(DOC);
    expect(charByChar(DOC)).toBe(DOC);
  });

  it('strips ```html fences even when split one char at a time', () => {
    const wrapped = '```html\n' + DOC + '\n```\n';
    expect(stripFences(wrapped)).toBe(DOC);
    expect(charByChar(wrapped)).toBe(DOC);
  });

  it('drops chatter before the document and anything after </html>', () => {
    expect(stripFences('Here is your app:\n\n```html\n' + DOC + '\n```\nEnjoy!')).toBe(DOC);
    expect(stripFences('Sure! ' + DOC + ' hope you like it')).toBe(DOC);
  });

  it('strips a trailing fence when there is no </html>', () => {
    expect(stripFences('```\n<div>hi</div>\n```')).toBe('<div>hi</div>');
  });

  it('keeps everything for a document that never closes and has no fence', () => {
    const partial = '<!doctype html><html><body>' + 'x'.repeat(100);
    expect(charByChar(partial)).toBe(partial);
  });
});
