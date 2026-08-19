import * as Haptics from 'expo-haptics';

// PHONE ONLY — expo-haptics is not in the Electron renderer bundle. Called from
// screens, never from a component shared with app/src/desktop.
//
// Every call is fire-and-forget: the Taptic Engine is unavailable in Low Power
// Mode, while the camera is active, and when the user has disabled it, so a
// rejection here is normal and must not surface as an error.

/** A control was committed to the speaker (transport, mute, grouping). */
export function tapCommit(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A slider drag ended and the value was written. */
export function tapSelection(): void {
  void Haptics.selectionAsync().catch(() => {});
}

/** A destructive action landed (queue cleared). */
export function tapWarn(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
