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
  // `react` is a peerDependency (the store provider imports it); never bundle it
  // — the host app supplies its single React copy. Its jsx-runtime subpath must
  // stay external too.
  external: ['react', 'react/jsx-runtime'],
  // Bundling (tsup default) inlines the relative barrel re-exports so the emitted
  // ESM has no extensionless imports that native Node ESM resolution would reject.
  target: 'node18',
});
