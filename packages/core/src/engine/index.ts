// @orkester/core/engine — the pure Sonos protocol engine.
//
// EVERYTHING re-exported here is RN-safe: it consumes injected transports
// (HttpTransport / DiscoveryTransport from ../sonos) and imports NO node:*
// builtin. The concrete Node adapters live under ../node and are the ONLY
// node:* entry point; callers inject them (or MOCK transports) into the
// SonosClient facade. This barrel is what the RN-facing app imports as
// `@orkester/core/engine`.

// SonosClient facade — the rich entry point.
export {
  SonosClient,
  type SonosTransports,
  type ResolvedRoom,
} from './client';

// SOAP envelope / fault / call primitives.
export {
  parserOptions,
  makeParser,
  instanceArg,
  buildEnvelope,
  SonosFault,
  parseFault,
  SOAPCall,
  extractResponseArg,
  type Arg,
  type SOAPService,
} from './soap';

// Device description parsing + S1/S2 generation.
export {
  HTTPPort,
  rincon,
  baseURL,
  generation,
  firmwareMajor,
  shortServiceName,
  parseDescription,
  fetchDevice,
  fetchDeviceFromLocation,
  type Device,
} from './device';

// Zone-group topology: parse, slug, rooms, resolve.
export {
  ZONE_GROUP_TOPOLOGY_TYPE,
  ZONE_GROUP_TOPOLOGY_CONTROL_URL,
  memberBaseURL,
  coordinatorMember,
  groupName,
  coordinatorIP,
  rooms,
  AmbiguousError,
  resolve,
  slug,
  fetchTopology,
  parseZoneGroupState,
  ipFromLocation,
  type Member,
  type Group,
  type Household,
  type RoomRef,
} from './topology';

// AVTransport / RenderingControl request descriptors + now-playing parse.
export {
  AV_TRANSPORT_TYPE,
  AV_TRANSPORT_CONTROL_URL,
  RENDERING_CONTROL_TYPE,
  RENDERING_CONTROL_CONTROL_URL,
  avTransport,
  renderingControl,
  playRequest,
  pauseRequest,
  nextRequest,
  previousRequest,
  getTransportInfoRequest,
  getPositionInfoRequest,
  getVolumeRequest,
  setVolumeRequest,
  getMuteRequest,
  setMuteRequest,
  setAVTransportURIRequest,
  becomeCoordinatorRequest,
  seekTrackRequest,
  seekRelTimeRequest,
  getTransportSettingsRequest,
  setPlayModeRequest,
  parseTrackMetadata,
  parseStreamContent,
  playModeToSettings,
  settingsToPlayMode,
  formatRelTime,
  parseRelTime,
  play,
  pause,
  next,
  previous,
  getTransportState,
  getNowPlaying,
  getVolume,
  setVolume,
  getMute,
  setMute,
  setAVTransportURI,
  joinGroup,
  leaveGroup,
  seekTrack,
  seek,
  getTransportSettings,
  setPlayMode,
  addURIToQueueRequest,
  addURIToQueue,
  playFromQueue,
  playItem,
  DIRECT_STREAM_SCHEMES,
  type ControlService,
  type BaseTarget,
  type ControlRequest,
  type NowPlaying,
  type TrackMetadata,
  type PlayMode,
  type RepeatMode,
  type PlaySettings,
  type EnqueueItem,
} from './control';

// MusicServices discovery + household id (local UPnP).
export {
  MUSIC_SERVICES_TYPE,
  MUSIC_SERVICES_CONTROL_URL,
  DEVICE_PROPERTIES_TYPE,
  DEVICE_PROPERTIES_CONTROL_URL,
  serviceSeed,
  parseAvailableServices,
  listAvailableServices,
  findService,
  getHouseholdId,
  type MusicServiceInfo,
} from './musicservices';

// SMAPI device-link auth + catalog search + enqueue conversion.
export {
  SMAPI_NAMESPACE,
  SMAPI_DEVICE_ID,
  SMAPIFault,
  LinkPendingError,
  NotLinkedError,
  buildSMAPIEnvelope,
  parseSMAPIFault,
  smapiCall,
  getAppLink,
  getDeviceAuthToken,
  search,
  parseSearchResult,
  encodeServiceId,
  spotifyEnqueueItem,
  type SMAPICredentials,
  type SMAPIService,
  type AppLink,
  type SMAPIItem,
} from './smapi';

// SSDP discovery parsing (the byte-level protocol; UDP socket lives in ../node).
export {
  zonePlayerST,
  parseSSDPResponse,
  searchProbe,
  type ParseSSDPResult,
} from './ssdp';
