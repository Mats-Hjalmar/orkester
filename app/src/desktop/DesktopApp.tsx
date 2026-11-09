import React from 'react';
import { View } from 'react-native';
import TopBar from './TopBar';
import RoomList from './RoomList';
import DesktopNowPlaying from './NowPlaying';
import SpotifySearch from './SpotifySearch';
import MiniPlayer, { type MiniPanel } from './MiniPlayer';
import GroupPanel from './GroupPanel';
import SpeakerVolumes from './SpeakerVolumes';
import ErrorToast from './ErrorToast';
import { colors, ink } from '../theme/tokens';
import { useStore } from '../state/store';
import { readLastSelection, writeLastSelection } from './lastSelection';
import { groupForRooms } from '../state/selectors';

// Rooms-first controller, master–DETAIL. The left rail is a STABLE list of the
// household (groups then idle rooms); selecting a row sticks and the right pane
// shows that group's full Now Playing. The list never jumps under the cursor
// (RoomList sorts by name), so a poll update can't move what you just clicked.
//
// Selection is LOCAL desktop state (a selected groupId). `focusGroup(gid)` tells
// the store to ATOMICALLY load that group and then poll it at the fast cadence;
// the phone addresses groups the same way, by id, through a route param.
export default function DesktopApp() {
  const { state, focusGroup } = useStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<MiniPanel | null>(null);
  const closePanel = React.useCallback(() => setPanel(null), []);
  const togglePanel = (p: MiniPanel) => setPanel((open) => (open === p ? null : p));

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
        <RoomList selectedId={effectiveId} onSelect={onSelect} />
        {/* Search plays onto the selected group, so it only shows once there is one. */}
        {selectedGroup ? (
          <>
            <DesktopNowPlaying group={selectedGroup} />
            <View style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: ink(0.07) }}>
              <SpotifySearch group={selectedGroup} />
            </View>
          </>
        ) : (
          <View style={{ flex: 1, minWidth: 0 }}>
            <DesktopNowPlaying group={selectedGroup} />
          </View>
        )}
      </View>
      {selectedGroup && (
        <MiniPlayer group={selectedGroup} panel={panel} onTogglePanel={togglePanel} />
      )}
      {selectedGroup && panel === 'groups' && <GroupPanel group={selectedGroup} onClose={closePanel} />}
      {/* Hidden while the group is a single speaker, like its toggle. */}
      {selectedGroup && panel === 'volumes' && selectedGroup.roomIds.length > 1 && <SpeakerVolumes group={selectedGroup} onClose={closePanel} />}
      <ErrorToast />
    </View>
  );
}
