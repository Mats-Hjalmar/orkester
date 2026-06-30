// Shared XML-normalisation helpers for the fast-xml-parser output across the
// engine's parsers (device / topology / control / soap / smapi / musicservices).
// fast-xml-parser is configured with parseTagValue:false (see soap.ts), so every
// tag value arrives as a string, an attribute-bearing object ({ '#text', ... }),
// or — for a tag that may repeat — either a single value or an array. These two
// helpers collapse those shapes so callers don't each reimplement them.

/** Coerce a parsed node to its text content (unwrapping `#text`), else ''. */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return textOf((value as { '#text': unknown })['#text']);
  }
  return '';
}

/** Normalise a maybe-single / maybe-missing repeated tag to an array. */
export function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
