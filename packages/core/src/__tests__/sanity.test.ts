import { describe, expect, it } from 'vitest';

// Placeholder test that proves the vitest runner is wired into @orkester/core
// before any Sonos engine code exists. Replaced/augmented by real fixture and
// mock-transport tests in later chunks.
describe('sanity', () => {
  it('runs the vitest harness', () => {
    expect(1 + 1).toBe(2);
  });
});
