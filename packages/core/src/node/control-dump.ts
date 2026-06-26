#!/usr/bin/env -S node --experimental-strip-types
//
// ============================================================================
//  CONTROL DUMP — USER-RUN, READ-ONLY. HITS A REAL SONOS NETWORK.
// ============================================================================
//
//  Diagnoses the "UPnP 402 on GetMute/GetVolume" and "empty now-playing" bugs by
//  showing the EXACT request and the speaker's RAW response/fault for each call.
//  It only issues read actions (GetTransportInfo / GetPositionInfo / GetVolume /
//  GetMute) — it NEVER changes playback, volume, mute, or grouping.
//
//      pnpm --filter @orkester/core build
//      pnpm --filter @orkester/core dump:control
//
//  Run it while something is playing, then paste the output back.
//
import { SonosClient } from '../engine/client';
import {
  buildEnvelope,
  avTransport,
  renderingControl,
  instanceArg,
  coordinatorMember,
  memberBaseURL,
  type SOAPService,
  type Arg,
} from '../engine';
import { NodeHttpTransport } from './httpTransport';
import { NodeDiscoveryTransport } from './discoveryTransport';

const http = new NodeHttpTransport();
const client = new SonosClient({ http, discovery: new NodeDiscoveryTransport() });

// Issue ONE SOAP read straight through the transport (bypassing SOAPCall) so a
// 500 fault is captured RAW instead of being turned into a thrown SonosFault.
async function call(base: string, svc: SOAPService, action: string, args: Arg[]): Promise<void> {
  const body = buildEnvelope(svc.type, action, args);
  const soapAction = `"${svc.type}#${action}"`;
  const url = base + svc.controlURL;
  console.log(`\n--- ${action}  POST ${url}`);
  console.log(`    SOAPACTION: ${soapAction}`);
  console.log(`    REQUEST: ${body}`);
  try {
    const resp = await http.request({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: soapAction },
      body,
      timeoutMs: 8000,
    });
    console.log(`    STATUS: ${resp.status}`);
    console.log(`    RESPONSE: ${(resp.body || '').slice(0, 1800)}`);
  } catch (e) {
    console.log(`    TRANSPORT ERROR: ${(e as Error).message}`);
  }
}

const household = await client.loadHousehold(3000);
console.log(`Discovered ${household.groups.length} group(s).`);
const inst: Arg[] = [instanceArg()];
const rc: Arg[] = [instanceArg(), { name: 'Channel', value: 'Master' }];

for (const g of household.groups) {
  const coord = coordinatorMember(g);
  const coordBase = memberBaseURL(coord);
  console.log(`\n======== group ${g.id} · coordinator "${coord.zoneName}" (${coordBase}) ========`);
  // AVTransport (coordinator) — these power now-playing; raw GetPositionInfo
  // response contains the TrackMetaData DIDL we need for the title parse.
  await call(coordBase, avTransport(), 'GetTransportInfo', inst);
  await call(coordBase, avTransport(), 'GetPositionInfo', inst);
  // RenderingControl (each member's own player) — the GetMute/GetVolume 402s.
  for (const m of g.members) {
    const pbase = memberBaseURL(m);
    console.log(`\n  -- member "${m.zoneName}" (${pbase}) invisible=${m.invisible} --`);
    await call(pbase, renderingControl(), 'GetVolume', rc);
    await call(pbase, renderingControl(), 'GetMute', rc);
  }
}
process.exit(0);
