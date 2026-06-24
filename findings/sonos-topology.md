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
