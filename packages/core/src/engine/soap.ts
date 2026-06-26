// SOAP envelope construction + UPnP fault/response parsing.
//
// Ported from backend/internal/sonos/soap.go. Pure logic only — the networked
// SOAPCall lives in a later chunk on top of an injected HttpTransport. No
// node:* imports here: this module is part of the RN-facing core surface.
//
// fast-xml-parser config is established here and reused by every engine parser
// (chunks 2-6) via makeParser()/parserOptions. parseTagValue:false is
// MANDATORY: it keeps text nodes as strings (Go-faithful), so e.g. a UPnP
// errorCode arrives as the string "714" which parseFault converts to a number.

import { XMLParser, type X2jOptions } from 'fast-xml-parser';
import type { HttpTransport } from '../sonos';

/**
 * The single fast-xml-parser configuration shared by all engine parsers.
 * Frozen so no downstream module can mutate the shared options object.
 */
export const parserOptions: Readonly<
  Pick<X2jOptions, 'removeNSPrefix' | 'ignoreAttributes' | 'parseTagValue' | 'processEntities'>
> = Object.freeze({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
  // fast-xml-parser caps total entity expansions (default 1000) and expanded
  // size (default 100KB) to thwart billion-laughs attacks. A real Sonos queue
  // is large and legitimately escaped (every albumArtURI carries many &amp;),
  // so it trips those caps. The source is a trusted LAN device, so raise the
  // limits well past any real queue while keeping entity DECODING on.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 5_000_000,
    maxExpandedLength: 50_000_000,
  },
});

/** Constructs an XMLParser using the shared engine configuration. */
export function makeParser(): XMLParser {
  return new XMLParser(parserOptions);
}

/** A single SOAP action argument: an XML child element with a text value. */
export interface Arg {
  name: string;
  value: string;
}

/**
 * The InstanceID=0 argument that begins almost every Sonos AVTransport /
 * RenderingControl action.
 */
export function instanceArg(): Arg {
  return { name: 'InstanceID', value: '0' };
}

/**
 * Escapes a text value for inclusion as XML character data, matching Go's
 * encoding/xml.EscapeText: & < > ' " plus the control whitespace tab/newline/CR
 * (so multi-line DIDL metadata survives a round-trip intact).
 */
function escapeXMLText(value: string): string {
  let out = '';
  for (const ch of value) {
    switch (ch) {
      case '&':
        out += '&amp;';
        break;
      case '<':
        out += '&lt;';
        break;
      case '>':
        out += '&gt;';
        break;
      case "'":
        out += '&#39;';
        break;
      case '"':
        out += '&#34;';
        break;
      case '\t':
        out += '&#x9;';
        break;
      case '\n':
        out += '&#xA;';
        break;
      case '\r':
        out += '&#xD;';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/**
 * Builds a SOAP request envelope for a UPnP action via string concatenation
 * (NOT the XML builder), matching the Go reference byte-for-byte. Every arg is
 * emitted unconditionally as `<name>escapedValue</name>` — an empty value
 * renders `<name></name>`, never the self-closing `<name/>`.
 */
export function buildEnvelope(serviceType: string, action: string, args: Arg[]): string {
  let b = '';
  b += '<?xml version="1.0" encoding="utf-8"?>';
  b +=
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">';
  b += '<s:Body>';
  b += `<u:${action} xmlns:u="${serviceType}">`;
  for (const a of args) {
    b += `<${a.name}>${escapeXMLText(a.value)}</${a.name}>`;
  }
  b += `</u:${action}>`;
  b += '</s:Body></s:Envelope>';
  return b;
}

// --- fault parsing -------------------------------------------------------

/**
 * A parsed UPnP SOAP fault. Sonos returns these for invalid arguments, wrong
 * coordinator, bad metadata, etc. We surface them as thrown errors rather than
 * swallowing them.
 */
export class SonosFault extends Error {
  readonly faultCode: string;
  readonly faultString: string;
  /** Numeric UPnPError/errorCode, e.g. 714, 800. 0 when absent. */
  readonly upnpError: number;
  /** errorDescription if present. */
  readonly errorDesc: string;

  constructor(faultCode: string, faultString: string, upnpError: number, errorDesc: string) {
    super(SonosFault.formatMessage(faultCode, faultString, upnpError, errorDesc));
    this.name = 'SonosFault';
    this.faultCode = faultCode;
    this.faultString = faultString;
    this.upnpError = upnpError;
    this.errorDesc = errorDesc;
  }

  private static formatMessage(
    faultCode: string,
    faultString: string,
    upnpError: number,
    errorDesc: string,
  ): string {
    if (upnpError !== 0) {
      return `UPnP fault ${upnpError} (${errorDesc}): ${faultString}`;
    }
    return `SOAP fault ${faultCode}: ${faultString}`;
  }
}

interface FaultShape {
  faultcode?: unknown;
  faultstring?: unknown;
  detail?: {
    UPnPError?: {
      errorCode?: unknown;
      errorDescription?: unknown;
    };
  };
}

/** Coerces a text node to a string, treating absent/object values as empty. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return textOf((value as { '#text': unknown })['#text']);
  }
  return '';
}

/**
 * Parses a SOAP fault envelope. Reads faultcode + detail.UPnPError
 * errorCode/errorDescription. errorCode is Number()-converted (absent / empty /
 * NaN -> 0). Returns null when faultcode is empty AND the numeric errorCode is
 * 0 — i.e. the body is not a fault.
 */
export function parseFault(body: string): SonosFault | null {
  let parsed: unknown;
  try {
    parsed = makeParser().parse(body);
  } catch {
    return null;
  }
  const fault = findKey(parsed, 'Fault') as FaultShape | undefined;
  if (fault === undefined) return null;

  const faultCode = textOf(fault.faultcode);
  const faultString = textOf(fault.faultstring);
  const upnp = fault.detail?.UPnPError;
  const errorDesc = textOf(upnp?.errorDescription);

  const raw = textOf(upnp?.errorCode);
  const num = raw === '' ? 0 : Number(raw);
  const upnpError = Number.isNaN(num) ? 0 : num;

  if (faultCode === '' && upnpError === 0) return null;
  return new SonosFault(faultCode, faultString, upnpError, errorDesc);
}

// --- networked SOAP round-trip -------------------------------------------

/**
 * The minimal service descriptor SOAPCall needs: the UPnP service type URN
 * (used for the envelope xmlns and the SOAPACTION header) plus the control
 * endpoint path appended to the device base URL. Both the device-description
 * `Service` (../sonos) and the control-layer `ControlService` (./control)
 * structurally satisfy this — SOAPCall takes the two fields it actually uses.
 */
export interface SOAPService {
  type: string;
  controlURL: string;
}

/** Truncates a body for inclusion in an HTTP-error message (Go's truncate). */
function truncate(body: string, n: number): string {
  return body.length <= n ? body : body.slice(0, n) + '...';
}

/**
 * Performs a single SOAP action against a service on a device via the injected
 * HttpTransport and returns the raw response body (the SOAP envelope) for the
 * caller to parse. Ported from Go's SOAPCall.
 *
 * Builds the envelope, POSTs to base+svc.controlURL with Content-Type
 * `text/xml; charset="utf-8"` and SOAPACTION `"{serviceType}#{action}"`. On a
 * non-200 it parses the body as a UPnP fault and THROWS the resulting
 * SonosFault (so callers see the real error code); when the body is not a
 * fault it throws a bare HTTP error carrying the status and a truncated body.
 * No silent fallback — every non-200 surfaces as a thrown error.
 */
export async function SOAPCall(
  transport: HttpTransport,
  base: string,
  svc: SOAPService,
  action: string,
  args: Arg[],
): Promise<string> {
  const body = buildEnvelope(svc.type, action, args);
  const url = base + svc.controlURL;
  const soapAction = `"${svc.type}#${action}"`;

  const resp = await transport.request({
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPACTION: soapAction,
    },
    body,
  });

  if (resp.status !== 200) {
    // A 500 carries a SOAP fault body; parse it so the caller sees the real
    // UPnP error code instead of a bare HTTP status.
    const fault = parseFault(resp.body);
    if (fault !== null) {
      throw fault;
    }
    throw new Error(`SOAP ${action}: HTTP ${resp.status}: ${truncate(resp.body, 300)}`);
  }
  return resp.body;
}

// --- response extraction -------------------------------------------------

/**
 * Extracts a single named output element's decoded text from a SOAP response
 * envelope via depth-first search: returns the text of the first key whose
 * local name === name at any depth. fast-xml-parser has already decoded XML
 * entities, so a value like `&lt;ZoneGroupState&gt;...` comes back as the inner
 * XML string ready to re-parse. THROWS when the element is absent.
 */
export function extractResponseArg(body: string, name: string): string {
  const parsed = makeParser().parse(body);
  const found = findKey(parsed, name);
  if (found === undefined) {
    throw new Error(`response element "${name}" not found`);
  }
  return textOf(found);
}

/**
 * Depth-first search for the first value whose key (local name) === name at any
 * depth in a parsed-XML object tree. Attribute keys (prefixed `@_`) and the
 * `#text` key are skipped. Returns undefined when not found.
 */
function findKey(node: unknown, name: string): unknown {
  if (node === null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findKey(item, name);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key === name) return obj[key];
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_') || key === '#text') continue;
    const r = findKey(obj[key], name);
    if (r !== undefined) return r;
  }
  return undefined;
}
