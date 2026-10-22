// Typed encoding/decoding of UPnP action arguments.
//
// Every value crosses the wire as text. Inputs are validated against their
// UPnP data type before any request is sent (no silent clamp or truncation);
// outputs are converted explicitly from the string-only parser output and a
// missing or malformed value THROWS rather than defaulting.

import type { Arg } from './soap';

/** The UPnP integer data types Sonos services declare. */
export type IntegerType = 'ui1' | 'ui2' | 'ui4' | 'i1' | 'i2' | 'i4';

/** Encodes a string argument verbatim. */
export function stringArg(name: string, value: string): Arg {
  return { name, value };
}

/** Encodes a boolean argument as UPnP `1` / `0`. */
export function booleanArg(name: string, value: boolean): Arg {
  return { name, value: value ? '1' : '0' };
}

/**
 * Encodes an integer argument. THROWS when the value is not an integer or lies
 * outside the range of its UPnP data type.
 */
export function integerArg(name: string, value: number, type: IntegerType): Arg {
  const [min, max] = INTEGER_RANGES[type];
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer ${type} in [${min}, ${max}], got ${value}`);
  }
  return { name, value: String(value) };
}

/** Reads a string output argument. THROWS when it is absent. */
export function readString(out: Record<string, string>, name: string): string {
  const value = out[name];
  if (value === undefined) {
    throw new Error(`response argument "${name}" missing`);
  }
  return value;
}

/** Reads an integer output argument. THROWS when absent or not an integer. */
export function readInteger(out: Record<string, string>, name: string): number {
  const raw = readString(out, name);
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value)) {
    throw new Error(`response argument "${name}" is not an integer: "${raw}"`);
  }
  return value;
}

/** Reads a boolean output argument (`1`/`0`/`true`/`false`). THROWS otherwise. */
export function readBoolean(out: Record<string, string>, name: string): boolean {
  const raw = readString(out, name).toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  throw new Error(`response argument "${name}" is not a boolean: "${raw}"`);
}

/** Inclusive value range of each UPnP integer type. */
const INTEGER_RANGES: Record<IntegerType, readonly [number, number]> = {
  ui1: [0, 0xff],
  ui2: [0, 0xffff],
  ui4: [0, 0xffffffff],
  i1: [-0x80, 0x7f],
  i2: [-0x8000, 0x7fff],
  i4: [-0x80000000, 0x7fffffff],
};
