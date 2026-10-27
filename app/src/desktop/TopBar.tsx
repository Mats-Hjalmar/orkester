import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { OrkesterMark, Refresh, Search } from '../icons';
import { radii } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { useTone } from './tone';
import { QUEUE_DESIGNS, type QueueDesign } from './queueDesign';

// Wordmark + a Spotify-search toggle + a manual refresh (the Sonos connection drifts).
export default function TopBar({
  searchOpen,
  onToggleSearch,
  design,
  onDesign,
}: {
  searchOpen?: boolean;
  onToggleSearch?: () => void;
  design?: QueueDesign;
  onDesign?: (design: QueueDesign) => void;
}) {
  const tone = useTone();
  const { refresh, refreshing } = useStore();
  return (
    <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: tone.line(0.07) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <OrkesterMark size={26} />
        <Text style={[type.wordmark, { fontSize: 24, color: tone.fg }]}>orkester</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: tone.subtle, paddingBottom: 1 }}>multi-room sound</Text>
      </View>
      <View style={{ flex: 1 }} />
      {/* Trial switch between the queue designs; the active one is filled. */}
      {design && onDesign && (
        <View
          testID="design-switch"
          style={{ flexDirection: 'row', alignItems: 'center', height: 38, padding: 3, gap: 2, borderRadius: radii.pill, borderWidth: 1, borderColor: tone.line(0.12), backgroundColor: tone.surface }}
        >
          {QUEUE_DESIGNS.map((d) => {
            const on = d.id === design;
            return (
              <Pressable
                key={d.id}
                onPress={() => onDesign(d.id)}
                accessibilityRole="button"
                accessibilityLabel={`Queue design ${d.id.toUpperCase()}: ${d.name}`}
                {...{ title: d.name }}
                style={({ pressed }) => ({
                  minWidth: 34, height: 30, paddingHorizontal: 10, borderRadius: radii.pill,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? tone.fg : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: font.bodySemiBold, fontSize: 13, color: on ? tone.surface : tone.fg }}>{d.id.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {/* Toggle the Spotify search pane. Highlighted (filled) while open. */}
      {onToggleSearch && (
        <Pressable
          testID="search-toggle"
          onPress={onToggleSearch}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8,
            height: 38, paddingHorizontal: 14, borderRadius: radii.pill,
            borderWidth: 1, borderColor: searchOpen ? 'transparent' : tone.line(0.12),
            backgroundColor: searchOpen ? tone.fg : tone.surface,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Search size={17} color={searchOpen ? tone.surface : tone.fg} />
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: searchOpen ? tone.surface : tone.fg }}>
            Search
          </Text>
        </Pressable>
      )}
      {/* Manual reconnect + reload. Disabled (with a spinner) while in flight. */}
      <Pressable
        testID="refresh-button"
        onPress={refresh}
        disabled={refreshing}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 8,
          height: 38, paddingHorizontal: 14, borderRadius: radii.pill,
          borderWidth: 1, borderColor: tone.line(0.12), backgroundColor: tone.surface,
          opacity: refreshing ? 0.6 : pressed ? 0.7 : 1,
        })}
      >
        {refreshing ? <ActivityIndicator size="small" color={tone.muted} /> : <Refresh size={17} color={tone.fg} />}
        <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: tone.fg }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Text>
      </Pressable>
    </View>
  );
}
