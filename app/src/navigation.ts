// The mobile navigation graph — owned by React Navigation (native stack), which
// handles the back stack, the Android hardware back button, and iOS swipe-back
// automatically. No bespoke view-state machine.
//
// Drill-down: Rooms (root) → Room (a group's detail) → Search / Speakers (actions
// scoped to that room).

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type MobileStackParamList = {
  Rooms: undefined;
  Room: undefined;
  Search: undefined;
  Speakers: undefined;
};

/** Typed `useNavigation` for the mobile stack — `nav.navigate('Search')`, `nav.goBack()`. */
export function useNav() {
  return useNavigation<NativeStackNavigationProp<MobileStackParamList>>();
}
