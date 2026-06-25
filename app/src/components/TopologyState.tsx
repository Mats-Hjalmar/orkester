import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { font } from '../theme/fonts';
import type { TopologyStatus } from '../state/types';

// Discovery is a real lifecycle now: the store reports topologyStatus
// 'idle'|'loading'|'ready'|'error' and a topologyError message. While the
// household is being discovered (or fails, or finds nothing) the lists of
// rooms/groups are empty — so anywhere we render those we show one of these
// calm placeholder states instead of a blank panel.

export type TopologyPhase = 'loading' | 'empty' | 'error' | 'ready';

/**
 * Resolves what the room/group lists should show. `ready` means render the real
 * lists; anything else means render <TopologyNotice phase=...>. Treats a 'ready'
 * topology with zero groups AND zero idle rooms as 'empty' ("No speakers found").
 */
export function topologyPhase(status: TopologyStatus, hasAnyRoom: boolean): TopologyPhase {
  if (status === 'error') return 'error';
  if (status === 'idle' || status === 'loading') return 'loading';
  // status === 'ready'
  return hasAnyRoom ? 'ready' : 'empty';
}

export function TopologyNotice({
  phase,
  error,
  compact = false,
}: {
  phase: Exclude<TopologyPhase, 'ready'>;
  error?: string;
  compact?: boolean;
}) {
  const pad = compact ? 16 : 28;
  const titleSize = compact ? 13.5 : 15;

  let title: string;
  let body: string;
  if (phase === 'loading') {
    title = 'Finding your speakers';
    body = 'Listening for Sonos on this network…';
  } else if (phase === 'empty') {
    title = 'No speakers found';
    body = 'Make sure your Sonos system is powered on and on the same Wi-Fi.';
  } else {
    title = 'Couldn’t reach your speakers';
    body = error && error.trim() ? error : 'Discovery failed. Check the network and try again.';
  }

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 10,
        paddingVertical: pad,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: phase === 'error' ? colors.danger : ink(0.1),
        borderRadius: radii.lg,
        backgroundColor: colors.bgPaper,
      }}
    >
      {phase === 'loading' ? (
        <ActivityIndicator size="small" color={colors.fgMuted} />
      ) : (
        <Speaker size={compact ? 22 : 28} color={phase === 'error' ? colors.danger : colors.fgSubtle} />
      )}
      <Text style={{ fontFamily: font.bodySemiBold, fontSize: titleSize, color: phase === 'error' ? colors.danger : colors.fg, textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: colors.fgMuted, textAlign: 'center' }}>
        {body}
      </Text>
    </View>
  );
}
