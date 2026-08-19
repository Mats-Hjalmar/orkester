# Sonos topology / discovery findings

- 2026-06-24: Any single speaker's `GetZoneGroupState` returns the *entire*
  household topology — verified by querying several speakers directly and getting
  the identical room set back from each. So `DiscoverOne` → fetch-topology-from-
  one-speaker is sound; one responder is enough to map the whole household.
- 2026-06-24: A speaker on a **different subnet** from the rest can **flicker in
  and out** of the zone-group state / SSDP responses, so `orkester list`
  intermittently shows one fewer group on back-to-back runs. This is
  environmental cross-subnet multicast/topology instability, NOT a parser bug —
  the CLI faithfully reflects whatever the queried speaker reports at that moment.
  If complete/stable topology ever matters, merge `GetZoneGroupState` from several
  responders rather than trusting one.
- 2026-06-24: Local UPnP SOAP control works fully on S2 speakers (firmware 86.x
  and 95.x). Verified end-to-end: RenderingControl `GetVolume`/`SetVolume`
  (absolute + relative round-trip), AVTransport `GetTransportInfo`/
  `GetPositionInfo` now-playing incl. DIDL-Lite metadata. Control URLs are the
  standard `/MediaRenderer/AVTransport/Control` and
  `/MediaRenderer/RenderingControl/Control`; hardcoding them (no per-call device
  fetch) works across all models tested.
- 2026-08-19: **Every visible room is always in a group**, so a "rooms in no group"
  list can never populate. `parseZoneGroupState` reports a standalone speaker as its
  own one-member `ZoneGroup`; engine `rooms()` derives every `RoomRef` by walking
  `household.groups`; and `SonosApi.index()` builds each group's `roomIds` from those
  same refs. So every room handle lands in exactly one group — a code proof, not a
  hardware observation. Both clients carried a dead "Not playing / Play here" section
  fed by that empty list (and with it the only caller of `Api.startGroup`, itself a
  pure alias of `leaveGroup`); all three are removed. The invariant is now pinned by
  `sonosApi.test.ts` ("puts every room in exactly one group"). An idle group is an
  ordinary row whose detail offers "Play something here".
- 2026-08-19: `refreshTopology()` no longer re-discovers. It remembers a member base
  URL from the last successful load and calls `fetchTopology` against it directly,
  escalating to a full discovery only when that speaker stops answering. Any single
  speaker returns the whole household, so the sweep was pure cost — and the store
  polls topology every 10s, which on a phone meant a 3-second mDNS scan every 10
  seconds, forever.
