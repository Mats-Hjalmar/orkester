// The mobile navigation graph — owned by React Navigation (native stack), which
// handles the back stack, the Android hardware back button, and iOS swipe-back
// automatically. No bespoke view-state machine.
//
// Drill-down: Rooms (root) → Room (a group's detail) → Search / Speakers, both
// presented OVER the room (a sheet and a modal) because they act on it.
//
// Every group-scoped route carries its groupId. Reading a global "active group"
// instead means a regroup — by us in the Speakers sheet, or by anyone in the
// official Sonos app — silently retargets the open screen at a different room
// while the user keeps pressing its controls.

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoute, type RouteProp } from '@react-navigation/native';

export type MobileStackParamList = {
  Rooms: undefined;
  Room: { groupId: string };
  Search: { groupId: string };
  Speakers: { groupId: string };
};

/** Typed `useNavigation` for the mobile stack — `nav.navigate('Search', {...})`. */
export function useNav() {
  return useNavigation<NativeStackNavigationProp<MobileStackParamList>>();
}

/** Typed route params for a group-scoped screen. */
export function useGroupRoute<T extends 'Room' | 'Search' | 'Speakers'>(): RouteProp<MobileStackParamList, T> {
  return useRoute<RouteProp<MobileStackParamList, T>>();
}
