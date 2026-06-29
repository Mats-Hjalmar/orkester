import React from 'react';
import { View } from 'react-native';
import TopBar from './TopBar';
import RoomList from './RoomList';
import DesktopNowPlaying from './NowPlaying';
import SpotifySearch from './SpotifySearch';
import { colors } from '../theme/tokens';
import { useStore } from '../state/store';

// Rooms-first controller, master–DETAIL. The left rail is a STABLE list of the
// household (groups then idle rooms); selecting a row sticks and the right pane
// shows that group's full Now Playing. The list never jumps under the cursor
// (RoomList sorts by name), so a poll update can't move what you just clicked.
//
// Selection is LOCAL desktop state (a selected groupId), decoupled from the
// shared mView/activeGroupId the mobile UI uses. `focusGroup(gid)` tells the
// store to ATOMICALLY load that group and then poll it at the fast cadence.
export default function DesktopApp() {
  const { state, focusGroup } = useStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // The right pane shows either the selected group's Now Playing or, when the
  // user opens it from the TopBar, the Spotify catalog search (which plays onto
  // whichever group is selected in the left rail).
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Resolve the selection fresh from topology each render. Default to the first
  // group, and re-default if the selected group vanished (ungrouped / dropped).
  const selected = selectedId ? state.groups.find((g) => g.id === selectedId) : undefined;
  const effectiveId = selected ? selectedId : state.groups[0]?.id ?? null;

  // Focus whichever group is effectively selected so it loads atomically + polls
  // fast — including the auto-default when groups first arrive or selection drops.
  React.useEffect(() => {
    if (effectiveId) focusGroup(effectiveId);
    // focusGroup is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveId]);

  const onSelect = (gid: string) => setSelectedId(gid);
  const selectedGroup = effectiveId ? state.groups.find((g) => g.id === effectiveId) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar searchOpen={searchOpen} onToggleSearch={() => setSearchOpen((v) => !v)} />
      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
        <RoomList selectedId={effectiveId} onSelect={onSelect} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {searchOpen ? (
            <SpotifySearch group={selectedGroup} onClose={() => setSearchOpen(false)} />
          ) : (
            <DesktopNowPlaying group={selectedGroup} />
          )}
        </View>
      </View>
    </View>
  );
}
