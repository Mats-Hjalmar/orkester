import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ============================================================================
// LOAD-BEARING RN-SAFETY GUARD.
//
// This test is the ONLY automated check that catches a node:* builtin leaking
// into the React-Native-facing core surface. `npx expo export --platform web`
// does NOT bundle @orkester/core (the app imports it by name and Metro/web does
// not transitively pull the engine in the Feature-1 invariant run), so an
// expo-export green does NOT prove the engine is node-free. THIS guard does.
//
// It statically scans the TS import graph reachable from every RN-facing entry
// (src/index.ts, src/sonos/index.ts, src/engine/**, src/api/**, src/state/**,
// src/theme/**) and asserts NONE of them — transitively — import a Node builtin
// (whether `node:`-prefixed like `node:fs` or bare like `fs`/`dgram`/`crypto`).
// Only src/node/** is allowed to import builtins, and src/node/** is NOT an RN
// entry, so it is never walked here.
//
// REGRESSION CONTRACT: adding `import 'node:dgram'` (or `import 'fs'`) anywhere
// in src/engine/* — or any other RN-facing module — makes this test go RED.
// A negative-control test below proves that by scanning a synthetic file.
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolvePath(__dirname, '..'); // packages/core/src

// The RN-facing entry points. The Node adapters under src/node/** are
// deliberately EXCLUDED — they are the only place node:* is allowed, and they
// are never imported by these entries.
const RN_ENTRIES = [
  'index.ts',
  'sonos/index.ts',
  'engine/index.ts',
  'api/index.ts',
  'state/index.ts',
  'theme/tokens.ts',
];

// The full set of bare Node builtin names (fs, dgram, crypto, ...). We treat a
// bare specifier matching one of these as a Node builtin too, not just the
// `node:`-prefixed form.
const BARE_BUILTINS = new Set(
  builtinModules.flatMap((m) => [m, m.replace(/^node:/, '')]),
);

/** True if an import specifier targets a Node builtin (prefixed or bare). */
function isNodeBuiltin(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  // Strip any subpath (e.g. `fs/promises` -> `fs`).
  const head = spec.split('/')[0];
  return BARE_BUILTINS.has(spec) || BARE_BUILTINS.has(head);
}

/** Extracts every static + dynamic import specifier from TS source text. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  // static: import ... from '...' / import '...'
  const staticRe = /\bimport\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
  // dynamic: import('...')
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // re-export: export ... from '...'
  const reexportRe = /\bexport\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
  for (const re of [staticRe, dynRe, reexportRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1] ?? m[2];
      if (spec) specs.push(spec);
    }
  }
  return specs;
}

/** Resolves a relative import specifier to an on-disk .ts file, or null. */
function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // package / builtin — not walked
  const base = resolvePath(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolvePath(base, 'index.ts'),
    resolvePath(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && c.endsWith('.ts')) return c;
    if (existsSync(c) && c.endsWith('.tsx')) return c;
  }
  return null;
}

/**
 * Walks the transitive import graph from the given entries. Returns the set of
 * { file, spec } pairs where a reachable module imports a Node builtin.
 */
function findNodeBuiltinLeaks(entries: string[]): Array<{ file: string; spec: string }> {
  const visited = new Set<string>();
  const queue = entries.map((e) => resolvePath(srcRoot, e));
  const leaks: Array<{ file: string; spec: string }> = [];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (!existsSync(file)) continue;

    const source = readFileSync(file, 'utf8');
    for (const spec of importSpecifiers(source)) {
      if (isNodeBuiltin(spec)) {
        leaks.push({ file: relative(srcRoot, file), spec });
        continue;
      }
      const resolved = resolveRelative(file, spec);
      if (resolved) queue.push(resolved);
    }
  }
  return leaks;
}

describe('RN-no-node import-graph guard (load-bearing)', () => {
  it('no Node builtin is reachable from any RN-facing entry', () => {
    const leaks = findNodeBuiltinLeaks(RN_ENTRIES);
    expect(
      leaks,
      `RN-facing modules must not import node:* builtins. Leaks:\n${leaks
        .map((l) => `  ${l.file} imports "${l.spec}"`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('the walk actually reaches the engine (sanity: graph is non-empty)', () => {
    // If resolution silently failed and walked nothing, the guard above would be
    // a false-green. Prove the engine modules ARE in the reachable set by
    // confirming the engine barrel resolves the client + soap + ssdp files.
    const engineBarrel = resolvePath(srcRoot, 'engine/index.ts');
    const source = readFileSync(engineBarrel, 'utf8');
    const resolved = importSpecifiers(source)
      .map((s) => resolveRelative(engineBarrel, s))
      .filter((x): x is string => x !== null)
      .map((p) => relative(srcRoot, p));
    expect(resolved).toContain('engine/client.ts');
    expect(resolved).toContain('engine/soap.ts');
    expect(resolved).toContain('engine/ssdp.ts');
  });

  it('NEGATIVE CONTROL: the scanner flags a synthetic node:* import (proves it can go red)', () => {
    // Both forms must be caught: `node:`-prefixed and the bare builtin name.
    expect(importSpecifiers(`import 'node:dgram';`).some(isNodeBuiltin)).toBe(true);
    expect(importSpecifiers(`import dgram from 'dgram';`).some(isNodeBuiltin)).toBe(true);
    expect(importSpecifiers(`import { readFile } from 'node:fs/promises';`).some(isNodeBuiltin)).toBe(true);
    expect(importSpecifiers(`export * from 'crypto';`).some(isNodeBuiltin)).toBe(true);
    // ...and a relative import is NOT a builtin.
    expect(importSpecifiers(`import { x } from './topology';`).some(isNodeBuiltin)).toBe(false);
  });

  it('REGRESSION: simulating a node:* import inside src/engine/* would flip the guard red', () => {
    // We do NOT mutate the real engine source. Instead we run the SAME leak
    // detector over a synthetic in-memory engine module and assert it reports a
    // leak — i.e. if someone adds `import 'node:dgram'` to src/engine/*, the
    // top-of-file guard fails. (The detector is the load-bearing function;
    // this proves its contract on engine-shaped input.)
    const synthetic = `import { resolve } from './topology';\nimport dgram from 'node:dgram';\nexport const x = dgram;`;
    const flagged = importSpecifiers(synthetic).filter(isNodeBuiltin);
    expect(flagged).toEqual(['node:dgram']);
  });
});
