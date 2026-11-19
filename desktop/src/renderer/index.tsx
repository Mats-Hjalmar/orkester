// Electron RENDERER entry — reuses the app's react-native-web desktop layout.
//
// It imports the UNCHANGED DesktopApp from app/src/desktop (resolved via the
// `@app` alias in electron.vite.config; `react-native` is aliased to
// `react-native-web` by vite-plugin-react-native-web) and wraps it in the
// engine-backed StoreProvider, injecting the IPC-backed Api. The store's polling
// loop then drives the real engine living in the main process.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from '@orkester/core/state';
// The desktop UI, owned by the app package — imported, never edited.
import DesktopApp from '@app/desktop/DesktopApp';
import { loadSettings } from '@app/desktop/settings';
import { colors } from '@app/theme/tokens';
import { getIpcApi } from './ipcApi';

const api = getIpcApi();
// Applies the theme's CSS variables, so the first frame is already in its colours.
const settings = await loadSettings();

const container = document.getElementById('root');
if (!container) throw new Error('renderer root element missing');

createRoot(container).render(
  <React.StrictMode>
    {/* The store's default accent is a literal; the CSS-variable one follows the theme. */}
    <StoreProvider api={api} config={{ accentColor: colors.primary }}>
      <DesktopApp settings={settings} />
    </StoreProvider>
  </React.StrictMode>,
);
