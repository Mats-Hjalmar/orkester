import { colors } from '../theme/tokens';
import { ChipModel } from '../components/SpeakerChip';
import { Group } from './types';
import { Store } from './store';

// Text colour that sits on the accent fill: dark-on-lime by default, otherwise
// the standard ink (matches the mockup's accentText rule).
export function accentTextOf(accent: string): string {
  return accent === colors.accent ? colors.accentText : colors.fg;
}

// Speaker chips for a group: each room is a member (filled), in another group
// (muted + "in X" tag), or free (plain). Tapping moves it into this group.
export function chipsFor(store: Store, g: Group): ChipModel[] {
  const { state, config, roomName, groupName, toggleRoomInGroup } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  return store.rooms.map((r) => {
    const member = g.roomIds.includes(r.id);
    const otherGroup = !member ? state.groups.find((x) => x.id !== g.id && x.roomIds.includes(r.id)) : undefined;
    const other = !!otherGroup;
    return {
      id: r.id,
      name: r.name,
      member,
      other,
      tag: otherGroup ? 'in ' + groupName(otherGroup) : '',
      bg: member ? accent : 'transparent',
      fg: member ? accentText : other ? colors.fgMuted : colors.fg,
      border: member ? accent : 'rgba(26,24,20,0.18)',
      onPress: () => toggleRoomInGroup(g.id, r.id),
    };
  });
}

// Rooms not in any group.
export function idleRooms(store: Store) {
  const { state } = store;
  return store.rooms.filter((r) => !state.groups.some((g) => g.roomIds.includes(r.id)));
}

// "+2" style suffix when a group spans multiple rooms.
export function groupCount(g: Group): string {
  return g.roomIds.length > 1 ? '+' + (g.roomIds.length - 1) : '';
}
