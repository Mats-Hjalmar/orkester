import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Asserts every target in package.json `exports` resolves to a real emitted file
// AFTER the build, per the chunk-9 invariant: "every path resolves to a real
// emitted file (derived post-build)". Paths are DERIVED from the exports map,
// never hardcoded — this is the guard the findings notebook calls for (build
// first, then point the map at the real filenames; tests derive, never hardcode).
//
// This test reads the dist tree, so it requires `pnpm --filter @orkester/core
// build` to have run first (the integration step + CI run build before test).

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolvePath(__dirname, '..', '..');
const require = createRequire(import.meta.url);

interface ConditionalExport {
  types?: string;
  import?: string;
  require?: string;
}

const pkg = require(resolvePath(pkgRoot, 'package.json')) as {
  main: string;
  module: string;
  types: string;
  exports: Record<string, ConditionalExport>;
};

describe('package.json exports resolve to emitted files', () => {
  it('top-level main/module/types point at real files', () => {
    for (const rel of [pkg.main, pkg.module, pkg.types]) {
      const abs = resolvePath(pkgRoot, rel);
      expect(existsSync(abs), `${rel} should exist`).toBe(true);
    }
  });

  // One assertion per exports subpath × condition, derived from the map.
  const entries = Object.entries(pkg.exports);
  for (const [subpath, conditions] of entries) {
    for (const cond of ['types', 'import', 'require'] as const) {
      const rel = conditions[cond];
      if (rel === undefined) continue;
      it(`exports["${subpath}"].${cond} -> ${rel} exists`, () => {
        const abs = resolvePath(pkgRoot, rel);
        expect(existsSync(abs), `${rel} should exist`).toBe(true);
      });
    }
  }

  it('exposes both ./engine (RN-safe) and ./node subpaths', () => {
    expect(pkg.exports['./engine']).toBeDefined();
    expect(pkg.exports['./node']).toBeDefined();
  });

  it('the ./engine entry emits a non-empty runtime module (it carries the engine VALUES)', () => {
    const rel = pkg.exports['./engine'].import!;
    const abs = resolvePath(pkgRoot, rel);
    // Unlike the types-only ./sonos barrel (0-byte ESM), the engine entry must
    // emit real runtime code (SonosClient, SOAPCall, ...).
    expect(statSync(abs).size).toBeGreaterThan(0);
  });
});
