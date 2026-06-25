// @orkester/core/node — Node.js platform adapters.
//
// This subpath is the ONLY part of @orkester/core that imports node:* builtins.
// Import it from Node hosts (CLI, scripts, tests); never from the React Native
// surface, which must stay node-free.

export { NodeHttpTransport } from './httpTransport';
export {
  NodeDiscoveryTransport,
  makeDatagramHandler,
  multicastInterfaceAddresses,
} from './discoveryTransport';
