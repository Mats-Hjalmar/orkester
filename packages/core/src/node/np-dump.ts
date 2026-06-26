#!/usr/bin/env -S node --experimental-strip-types
//
// ============================================================================
//  NOW-PLAYING DUMP — USER-RUN, READ-ONLY. HITS A REAL SONOS NETWORK.
// ============================================================================
//
//  Diagnostic for the "shows Nothing playing while it IS playing" bug: it
//  discovers your household and, for each group's coordinator, prints the
//  transport state, what our parser extracts, and the RAW <TrackMetaData>
//  DIDL-Lite the speaker returned. Paste the output back so the parser can be
//  fixed for your streaming source's metadata shape.
//
//  READ-ONLY: it only issues GetTransportInfo + GetPositionInfo. It never
//  changes playback/volume/grouping. Run it while something is playing:
//
//      pnpm --filter @orkester/core build
//      pnpm --filter @orkester/core dump:np
//
import { SonosClient } from '../engine/client';
import {
  avTransport,
  instanceArg,
  SOAPCall,
  extractResponseArg,
  parseTrackMetadata,
  coordinatorMember,
  memberBaseURL,
} from '../engine';
import { NodeHttpTransport } from './httpTransport';
import { NodeDiscoveryTransport } from './discoveryTransport';

const http = new NodeHttpTransport();
const discovery = new NodeDiscoveryTransport();
const client = new SonosClient({ http, discovery });

const household = await client.loadHousehold(3000);
console.log(`Discovered ${household.groups.length} group(s).`);

for (const g of household.groups) {
  const coord = coordinatorMember(g);
  const base = memberBaseURL(coord);
  console.log(`\n=== group ${g.id} · coordinator "${coord.zoneName}" (${base}) ===`);
  try {
    const ti = await SOAPCall(http, base, avTransport(), 'GetTransportInfo', [instanceArg()]);
    let state = '(?)';
    try { state = extractResponseArg(ti, 'CurrentTransportState'); } catch { /* leave (?) */ }
    console.log('transportState:', state);

    const pi = await SOAPCall(http, base, avTransport(), 'GetPositionInfo', [instanceArg()]);
    let raw = '';
    try { raw = extractResponseArg(pi, 'TrackMetaData'); } catch { raw = '(no TrackMetaData element)'; }
    let trackUri = '';
    try { trackUri = extractResponseArg(pi, 'TrackURI'); } catch { /* ignore */ }
    const parsed = parseTrackMetadata(raw);

    console.log('PARSED:', JSON.stringify(parsed));
    console.log('TrackURI:', trackUri);
    console.log('RAW TrackMetaData:', raw.slice(0, 1200));
  } catch (e) {
    console.log('error reading group:', (e as Error).message);
  }
}
process.exit(0);
