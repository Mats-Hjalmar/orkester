// @orkester/core — shared, RN-free building blocks.
// Theme tokens are VALUE re-exports; everything else is types-only.

export { colors, ink, paper, radii, shadow, space, FRAME } from './theme/tokens';

export type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
  SSDPResult,
  Service,
  DiscoverOptions,
  DiscoveryTransport,
} from './sonos';

export type { Motif, Track, Room, Group, Config, TopologyStatus } from './state';

export type {
  Api,
  ApiRoom,
  ApiGroup,
  ApiTopology,
  ApiNowPlaying,
  ApiSearchItem,
  ApiSpotifyLink,
  SpotifySearchKind,
} from './api';

// The Sonos protocol engine — RN-safe (consumes injected transports, no node:*).
// Re-exported here as VALUES so `@orkester/core` callers get SonosClient and the
// engine helpers directly; `@orkester/core/engine` exposes the same surface.
export {
  SonosClient,
  type SonosTransports,
  type ResolvedRoom,
} from './engine';
export type { Device, Member, Group as SonosGroup, Household, RoomRef } from './engine';
export type { NowPlaying } from './engine';
export { SonosFault } from './engine';
