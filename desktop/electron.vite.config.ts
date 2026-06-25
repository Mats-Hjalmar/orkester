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
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
