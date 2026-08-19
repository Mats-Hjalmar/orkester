# Volume control

- 2026-06-30: "Volume maxing sometimes" — hardware volume is ONLY ever written by `api.setVolume`, whose sole caller is `setVolForRooms` (store.tsx), reached only from a `TrackBar` `onScrub` (a tap/drag on a volume bar). Nothing on launch, connect, play, seek, or reconcile writes volume; `optimistic()` does a single dispatch+call with no replay queue. So a "max" can only come from a touch computing `x/w ≈ 1`.
- 2026-06-30: Root cause was the **fabricated fallback**. `groupVol` returned `?? 33` (earlier `|| 0`) for rooms with no real reading yet, and the slider stayed interactive. Dragging a slider whose position is a *guess* writes an absolute volume from where you tapped relative to that fake baseline → can jump to max.
- 2026-06-30: Fix — `groupVol(g)` now returns `number | null`: null unless EVERY member room has a real reading (`state.roomVol[r] !== undefined`; a genuine 0 stays 0). All four volume bars (RoomGroupCard, Speakers, mobile + desktop NowPlaying) render only when `groupVol !== null`; otherwise the control is hidden, not guessed. Removed `DEFAULT_ROOM_VOLUME`. `state.roomVol` is `{}` at launch, so the bar appears only after the 2.5s volume poll / `refreshGroup` snapshot fills in real values.
- 2026-08-19: "Slider unreliable" had three independent causes, all in the write/read
  race rather than in the gesture math. (1) Writes were paced by a 120ms timer but not
  serialized, so two `setVolume` SOAP calls could be in flight at once and the speaker
  applied whichever landed last — the volume settled on a value the user only dragged
  past. (2) The stale-read guard was checked *before* `getVolume`, so a read already in
  flight when the drag started still dispatched its old value; `refreshGroup`'s atomic
  `groupSnapshot` (fired by `focusGroup`, so by any click on another room) ignored the
  guard entirely and always clobbered `roomVol`. (3) `TrackBar` drew from the store
  prop only, so every one of those clobbers moved the thumb mid-drag.
- 2026-08-19: Fix — `state/volumeWrite.ts`, a pure coalescing writer: at most ONE write
  per room in flight, only the newest requested value kept behind it, so the last
  position always wins and writes can't overtake. It also owns the busy/quiet-window
  predicate; `pollVolumes` re-checks it *after* the await and `refreshGroup` keeps the
  local volume for busy rooms, so no read can win against a write. `TrackBar` now holds
  the drag position locally (cleared on release/terminate), blocks responder
  termination for `grabThumbOnly` bars (a ScrollView could steal the drag partway), and
  keeps the thumb drawn while the spinner shows — the spinner used to REPLACE the thumb,
  removing the only grab target for most of a drag.
- 2026-08-19: Still true, deliberately unchanged: a muted group renders the slider at 0
  and dragging it writes volume without unmuting; and a group slider writes one absolute
  volume to every member, flattening the relative balance between rooms.
