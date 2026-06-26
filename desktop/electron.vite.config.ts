import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import reactNativeWeb from 'vite-plugin-react-native-web';

// electron-vite splits the build into three Vite configs: main + preload run in
// Node (externalize node_modules so @orkester/core/node keeps its node:* deps),
// renderer is a browser bundle that reuses the app's react-native-web desktop UI.
//
// The renderer MUST NOT contain node:* — it talks to the engine only over the
// IPC bridge. vite-plugin-react-native-web aliases react-native -> react-native-web
// and strips Flow; `@app` resolves the unedited UI from app/src.
const appSrc = resolve(__dirname, '../app/src');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [reactNativeWeb()],
    resolve: {
      alias: {
        // Reuse the app's desktop UI verbatim.
        '@app': appSrc,
      },
      // RN packages ship "react-native" condition exports; prefer browser/web.
      extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    },
    // In dev, Vite prebundles deps with esbuild, whose scanner ignores the
    // `.web.js` priority above and would crawl react-native-svg's Fabric files
    // (which import RN internals the RNW alias can't map). Make the esbuild
    // optimizer prefer `.web.*`, and don't prebundle the RN packages — let
    // Vite's own resolver (with the plugin + `.web` extensions) handle them,
    // the same path the production rollup build already takes successfully.
    optimizeDeps: {
      // Only react-native-svg needs excluding (its Fabric files break the
      // esbuild prebundle scan). react-native-web is the renderer substrate and
      // must NOT be external; @orkester/core is a workspace dep (not prebundled).
      exclude: ['react-native-svg'],
      esbuildOptions: {
        resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
