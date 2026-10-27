import { describe, expect, it } from 'vitest';
import { ESC_MESSAGE, withEscRelay } from '../ui/BuildFrame';

describe('withEscRelay (FIX4 U7)', () => {
  it('goes in right after <head>, so the doctype stays first', () => {
    const html = '<!doctype html><html lang="en"><head><title>Today</title></head><body>hi</body></html>';
    const out = withEscRelay(html);
    expect(out.startsWith('<!doctype html><html lang="en"><head><script>')).toBe(true);
    expect(out).toContain(ESC_MESSAGE);
    expect(out.replace(/<script>.*?<\/script>/, '')).toBe(html);
  });
  it('falls back to after <html>, then after the doctype, then the very start', () => {
    expect(withEscRelay('<html><body>x</body></html>').startsWith('<html><script>')).toBe(true);
    expect(withEscRelay('<!DOCTYPE html><p>x</p>').startsWith('<!DOCTYPE html><script>')).toBe(true);
    expect(withEscRelay('<p>x</p>').startsWith('<script>')).toBe(true);
  });
  it('does not mistake <header> for <head>', () => {
    expect(withEscRelay('<!doctype html><header>x</header>').startsWith('<!doctype html><script>')).toBe(true);
  });
});
