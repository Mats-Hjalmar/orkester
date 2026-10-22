// SOAP envelope construction + UPnP fault/response parsing, owned by
// @orkester/sonos-api and re-exported here so the engine modules keep one
// import site. parseTagValue:false is frozen in that package's parserOptions.

export {
  parserOptions,
  makeParser,
  instanceArg,
  escapeXMLText,
  buildEnvelope,
  SonosFault,
  parseFault,
  SOAPCall,
  extractResponseArg,
  type Arg,
  type SOAPService,
} from '@orkester/sonos-api';
