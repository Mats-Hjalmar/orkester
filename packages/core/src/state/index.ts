// @orkester/core/state — the engine-backed store + Api implementations.
//
// RN-safe: the provider imports only `react` (a peerDependency; tsup external)
// and the Api adapters import only the node-free engine. No node:* anywhere, so
// the RN-no-node guard stays green. The host picks an Api (SonosApi on a runtime
// with transports, MockApi for demo/web) and injects it into StoreProvider.

// Stable UI-facing state types.
export type { Motif, Track, Room, QueueItem, Group, Config, TopologyStatus } from './types';

// The store provider + hook + helpers (keeps the mock store's useStore surface).
export { StoreProvider, useStore, fmt, type Store } from './store';

// Shared Spotify catalog-search behavior (link state machine + search/enqueue/
// play), consumed by the desktop pane and the mobile Search screen.
export {
  useSpotifySearch,
  SPOTIFY_SEARCH_KINDS,
  type SpotifySearch,
  type SpotifySearchTarget,
  type LinkState,
} from './useSpotifySearch';

// The reducer + state shape (exported for adapter/unit tests).
export {
  type State,
  type Action,
  reducer,
  initialState,
  placeholderTrack,
  PLACEHOLDER_TRACK_ID,
} from './reducer';

// Deterministic cover-art synthesis.
export { synthesizeArt, hashString, COVER_PALETTE } from './art';

// Api implementations.
export { SonosApi } from './sonosApi';
export { MockApi } from './mockApi';
export { MOCK_LIBRARY, MOCK_ROOMS, type MockTrack } from './mockLibrary';
