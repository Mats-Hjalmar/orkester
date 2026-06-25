import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/theme/tokens.ts',
    'src/sonos/index.ts',
    // Pure Sonos protocol engine (RN-safe; consumes injected transports).
    'src/engine/index.ts',
    'src/state/index.ts',
    'src/api/index.ts',
    // Node platform adapters — the only entry that pulls in node:* builtins.
    'src/node/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // RN-free package with no external deps. Bundling (tsup default) inlines the
  // relative barrel re-exports so the emitted ESM has no extensionless imports
  // that native Node ESM resolution would reject.
  target: 'node18',
});
