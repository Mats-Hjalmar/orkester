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

/**
 * The single fast-xml-parser configuration shared by all engine parsers.
 * Frozen so no downstream module can mutate the shared options object.
 */
export const parserOptions: Readonly<
  Pick<X2jOptions, 'removeNSPrefix' | 'ignoreAttributes' | 'parseTagValue'>
> = Object.freeze({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
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
