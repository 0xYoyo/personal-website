import { describe, expect, it } from 'vitest';
import { reichmanSemester } from '../time';

describe('reichmanSemester', () => {
  it('counts semesters from Oct 2025', () => {
    expect(reichmanSemester(new Date('2025-10-20T00:00:00Z'))).toBe(1);
    expect(reichmanSemester(new Date('2026-04-01T00:00:00Z'))).toBe(2);
    expect(reichmanSemester(new Date('2026-10-23T00:00:00Z'))).toBe(3);
    expect(reichmanSemester(new Date('2028-05-01T00:00:00Z'))).toBe(6);
    expect(reichmanSemester(new Date('2030-01-01T00:00:00Z'))).toBe(6);
  });
});
