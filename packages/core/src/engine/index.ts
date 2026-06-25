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
  parseTrackMetadata,
  parseStreamContent,
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
  type ControlService,
  type BaseTarget,
  type ControlRequest,
  type NowPlaying,
  type TrackMetadata,
} from './control';

// SSDP discovery parsing (the byte-level protocol; UDP socket lives in ../node).
export {
  zonePlayerST,
  parseSSDPResponse,
  searchProbe,
  type ParseSSDPResult,
} from './ssdp';
