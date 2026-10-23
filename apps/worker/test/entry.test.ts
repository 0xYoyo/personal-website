import { expect, it } from 'vitest';
import * as entry from '../src/index';

it('the entry module has only a default export (workerd treats named exports as entrypoints)', () => {
  expect(Object.keys(entry)).toEqual(['default']);
  expect(typeof entry.default.fetch).toBe('function');
});
