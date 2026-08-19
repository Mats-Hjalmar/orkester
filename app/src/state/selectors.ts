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
  const { state, config, groupName, toggleRoomInGroup, groupingPending } = store;
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
      busy: groupingPending(r.id) !== null,
      onPress: () => toggleRoomInGroup(g.id, r.id),
    };
  });
}

// "+2" style suffix when a group spans multiple rooms.
export function groupCount(g: Group): string {
  return g.roomIds.length > 1 ? '+' + (g.roomIds.length - 1) : '';
}

/**
 * The group that best matches a remembered set of speakers — the one sharing the
 * most rooms with them. undefined when nothing is remembered or those speakers are
 * gone, so the caller decides its own default.
 *
 * Selections are remembered as ROOM ids, never a group id: a Sonos group id carries
 * a membership counter and goes stale the first time the group changes.
 */
export function groupForRooms<T extends { id: string; roomIds: string[] }>(
  groups: T[],
  roomIds: string[],
): T | undefined {
  if (roomIds.length === 0) return undefined;
  const remembered = new Set(roomIds);
  let best: T | undefined;
  let bestOverlap = 0;
  for (const g of groups) {
    const overlap = g.roomIds.filter((r) => remembered.has(r)).length;
    if (overlap > bestOverlap) {
      best = g;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * Groups in a STABLE display order: by name, with the id as tiebreak. The engine
 * can return groups in a different order across topology polls, and an unsorted
 * list lets a poll move a row out from under a thumb mid-tap.
 */
export function sortedGroups(store: Store): Group[] {
  const { state, groupName } = store;
  return [...state.groups].sort((a, b) => {
    const n = groupName(a).localeCompare(groupName(b));
    return n !== 0 ? n : a.id.localeCompare(b.id);
  });
}
