import React from 'react';
import { View } from 'react-native';
import TopBar from './TopBar';
import DesktopRooms from './Rooms';
import DesktopNowPlaying from './NowPlaying';
import { colors } from '../theme/tokens';
import { useStore } from '../state/store';

// Rooms-first controller. The HOME surface is the rooms grid — every group is a
// card controlled in place. Opening a card focuses that group's full Now Playing.
//
// Routing is LOCAL desktop state (a focused groupId), deliberately decoupled from
// the shared `mView`/`activeGroupId` the mobile UI uses — there is no global
// active-group singleton here. `focusGroup` tells the store to poll the open
// group at the fast cadence.
export default function DesktopApp() {
  const { state, focusGroup } = useStore();
  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  // The focused group, resolved fresh from topology each render. If it vanished
  // (ungrouped, speaker dropped), fall back to the rooms grid rather than a
  // stale/empty screen.
  const focusedGroup = focusedId ? state.groups.find((g) => g.id === focusedId) : undefined;
  const showFocus = focusedId !== null;

  const openGroup = (gid: string) => {
    setFocusedId(gid);
    focusGroup(gid);
  };
  const back = () => setFocusedId(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <View style={{ flex: 1, minHeight: 0 }}>
        {showFocus ? (
          <DesktopNowPlaying group={focusedGroup} onBack={back} />
        ) : (
          <DesktopRooms onOpenGroup={openGroup} />
        )}
      </View>
    </View>
  );
}
