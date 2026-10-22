// @orkester/sonos-api — typed clients for every UPnP service a Sonos device
// exposes, plus the SOAP and GENA primitives underneath them. RN-safe: it
// imports no platform builtin and reaches the network only through an injected
// HttpTransport.

export type { HttpRequest, HttpResponse, HttpTransport } from './transport';

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
  parseResponseArgs,
  type Arg,
  type SOAPService,
} from './soap';

export { textOf, asArray } from './xml';

export {
  stringArg,
  booleanArg,
  integerArg,
  readString,
  readInteger,
  readBoolean,
  type IntegerType,
} from './codec';

export {
  subscribe,
  renewSubscription,
  unsubscribe,
  parsePropertySet,
  parseLastChange,
  type EventSubscription,
  type LastChangeValues,
} from './events';

export { SonosService, DEFAULT_SUBSCRIPTION_SECONDS, type ServiceDescriptor } from './service';

export * from './services';

export { SonosDevice } from './device';
