#!/usr/bin/env -S node --experimental-strip-types
//
// ============================================================================
//  LIVE SMOKE — USER-RUN ONLY. HITS A REAL SONOS NETWORK.
// ============================================================================
//
//  This script connects to ACTUAL Sonos speakers on your LAN over SSDP + SOAP.
//  It is DELIVERED for the human to run manually and is DELIBERATELY EXCLUDED
//  from every automated step:
//
//    * vitest never imports it      (it lives under src/node/ and is not a
//                                     *.test.ts; no test references it).
//    * CI / build never runs it     (the package "smoke:live" script is the
//                                     ONLY invocation path, and that script is
//                                     never wired into test / build / typecheck
//                                     / the import-graph guard).
//
//  Do NOT call this from coder, tests, or CI. Run it yourself when you want to
//  verify against real hardware:
//
//      pnpm --filter @orkester/core smoke:live
//      # or, with optional args:
//      pnpm --filter @orkester/core smoke:live -- <roomQuery> <waitMs>
//
//  It discovers one speaker, loads the household topology, resolves the first
//  room (or the room you name), prints its now-playing, then prints volume +
//  mute (with a per-room timing) for EVERY room. It is read-only: it issues
//  GetTransportInfo / GetPositionInfo / GetVolume / GetMute and does NOT change
//  playback, volume, or mute.
// ============================================================================

import { NodeDiscoveryTransport } from './discoveryTransport';
import { NodeHttpTransport } from './httpTransport';
import { NodeCredentialStore } from './configStore';
import { SonosClient } from '../engine/client';
import { SonosApi } from '../state/sonosApi';
import { rooms } from '../engine/topology';

async function main(): Promise<void> {
  // Optional `--search <term>` runs a Spotify catalog search (read-only) using
  // the token written by `orkester spotify-link`. Positional args keep working.
  const argv = process.argv.slice(2);
  const searchAt = argv.indexOf('--search');
  const searchTerm = searchAt >= 0 ? argv[searchAt + 1] : undefined;
  const positional = searchAt >= 0 ? argv.slice(0, searchAt) : argv;
  const roomQuery = positional[0];
  const waitMs = positional[1] ? Number(positional[1]) : 3000;
  if (Number.isNaN(waitMs)) {
    throw new Error(`invalid waitMs: ${positional[1]}`);
  }

  const client = new SonosClient({
    http: new NodeHttpTransport(),
    discovery: new NodeDiscoveryTransport(),
  });

  console.log(`[live-smoke] discovering (waitMs=${waitMs}) ...`);
  const responder = await client.discoverOne(waitMs);
  console.log(`[live-smoke] responder: ${responder.address} (${responder.usn})`);

  console.log('[live-smoke] loading household topology ...');
  const household = await client.loadHousehold(waitMs);
  const allRooms = rooms(household);
  console.log(
    `[live-smoke] ${household.groups.length} group(s), rooms: ${allRooms
      .map((r) => r.handle)
      .join(', ')}`,
  );

  // Resolve the room the user named, else the first room in the household.
  const query = roomQuery ?? allRooms[0]?.handle;
  if (query === undefined) {
    throw new Error('no visible rooms found in the household');
  }
  const room = client.resolveRoom(household, query);
  console.log(`[live-smoke] resolved room: ${room.member.zoneName} (${room.member.ip})`);

  const np = await client.getNowPlaying(room);
  console.log('[live-smoke] now playing:', JSON.stringify(np, null, 2));

  // Read volume + mute for EVERY room, the way the app's 2.5s poll does — one
  // unreachable or slow player is the difference between "the sliders are stale"
  // and "the engine can't read them at all".
  for (const r of allRooms) {
    const target = client.resolveRoom(household, r.handle);
    const t0 = Date.now();
    try {
      const [vol, muted] = await Promise.all([
        client.getVolume(target),
        client.getMute(target),
      ]);
      console.log(
        `[live-smoke] ${r.handle}: volume=${vol} muted=${muted} (${Date.now() - t0}ms)`,
      );
    } catch (err) {
      console.error(
        `[live-smoke] ${r.handle}: READ FAILED after ${Date.now() - t0}ms:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (searchTerm !== undefined) {
    const api = new SonosApi(client, new NodeCredentialStore());
    if (!(await api.isSpotifyLinked())) {
      console.log('[live-smoke] Spotify not linked — run `orkester spotify-link <room>` first.');
    } else {
      console.log(`[live-smoke] searching Spotify tracks for "${searchTerm}" ...`);
      const hits = await api.searchSpotify(searchTerm, 'tracks');
      for (const h of hits.slice(0, 10)) {
        console.log(`  - ${h.title} — ${h.artist}  [${h.uri}]`);
      }
      console.log(`[live-smoke] ${hits.length} hit(s).`);
    }
  }

  console.log('[live-smoke] done.');
}

main().catch((err: unknown) => {
  console.error('[live-smoke] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
