import React from 'react';
import { View } from 'react-native';
import TopBar from './TopBar';
import RoomList from './RoomList';
import DesktopNowPlaying from './NowPlaying';
import SpotifySearch from './SpotifySearch';
import MiniPlayer from './MiniPlayer';
import GroupPanel from './GroupPanel';
import ErrorToast from './ErrorToast';
import { useStore } from '../state/store';
import { readLastSelection, writeLastSelection } from './lastSelection';
import { groupForRooms } from '../state/selectors';
import { synthesizeArt } from '@orkester/core/state';
import { baseTone, ToneProvider, toneFrom, useCoverTone } from './tone';
import { readQueueDesign, writeQueueDesign, type QueueDesign } from './queueDesign';

// Rooms-first controller, master–DETAIL. The left rail is a STABLE list of the
// household (groups then idle rooms); selecting a row sticks and the right pane
// shows that group's full Now Playing. The list never jumps under the cursor
// (RoomList sorts by name), so a poll update can't move what you just clicked.
//
// Selection is LOCAL desktop state (a selected groupId). `focusGroup(gid)` tells
// the store to ATOMICALLY load that group and then poll it at the fast cadence;
// the phone addresses groups the same way, by id, through a route param.
export default function DesktopApp() {
  const { state, focusGroup, queueFor, getTrack } = useStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // The right pane shows either the selected group's Now Playing or, when the
  // user opens it from the TopBar, the Spotify catalog search (which plays onto
  // whichever group is selected in the left rail).
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [groupsOpen, setGroupsOpen] = React.useState(false);
  const [design, setDesign] = React.useState<QueueDesign>(readQueueDesign);
  const pickDesign = (next: QueueDesign) => {
    setDesign(next);
    writeQueueDesign(next);
  };
  const closeGroups = React.useCallback(() => setGroupsOpen(false), []);

  // Resolve the selection fresh from topology each render. With no live selection
  // — first launch, or the selected group vanished (ungrouped / dropped) — fall
  // back to the group holding the speakers we were last on, then to the first group.
  const selected = selectedId ? state.groups.find((g) => g.id === selectedId) : undefined;
  const restored = selected ? undefined : groupForRooms(state.groups, readLastSelection());
  const effectiveId = (selected ?? restored ?? state.groups[0])?.id ?? null;

  // Focus whichever group is effectively selected so it loads atomically + polls
  // fast — including the auto-default when groups first arrive or selection drops.
  React.useEffect(() => {
    if (effectiveId) focusGroup(effectiveId);
    // focusGroup is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveId]);

  const onSelect = (gid: string) => setSelectedId(gid);
  const selectedGroup = effectiveId ? state.groups.find((g) => g.id === effectiveId) : undefined;

  // Persist the speakers behind the current selection so the next launch opens on
  // them. Keyed on the room set, so a regroup of the selected group re-records it.
  const roomKey = selectedGroup ? selectedGroup.roomIds.join('\n') : '';
  React.useEffect(() => {
    if (roomKey !== '') writeLastSelection(roomKey.split('\n'));
  }, [roomKey]);

  // The whole window takes its colour from the selected group's playing cover.
  const queue = selectedGroup ? queueFor(selectedGroup.id) : [];
  const shown = selectedGroup && queue.length > 0 ? queue[Math.max(0, selectedGroup.queueIndex)] : selectedGroup ? getTrack(selectedGroup.trackId) : undefined;
  const coverColor = useCoverTone(shown?.artUrl, shown?.title ? synthesizeArt(shown.title, shown.artist).coverBg : '');
  const tone = React.useMemo(() => (coverColor ? toneFrom(coverColor) : baseTone), [coverColor]);

  return (
    <ToneProvider value={tone}>
      <View style={{ flex: 1, backgroundColor: tone.bg, transitionProperty: 'background-color', transitionDuration: '700ms' } as object}>
        <TopBar searchOpen={searchOpen} onToggleSearch={() => setSearchOpen((v) => !v)} design={design} onDesign={pickDesign} />
        <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
          <RoomList selectedId={effectiveId} onSelect={onSelect} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {searchOpen ? (
              <SpotifySearch group={selectedGroup} onClose={() => setSearchOpen(false)} />
            ) : (
              <DesktopNowPlaying group={selectedGroup} design={design} onSearch={() => setSearchOpen(true)} />
            )}
          </View>
        </View>
        {selectedGroup && (
          <MiniPlayer group={selectedGroup} groupsOpen={groupsOpen} onToggleGroups={() => setGroupsOpen((v) => !v)} />
        )}
        {selectedGroup && groupsOpen && <GroupPanel group={selectedGroup} onClose={closeGroups} />}
        <ErrorToast />
      </View>
    </ToneProvider>
  );
}
