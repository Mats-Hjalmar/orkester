import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapCommit } from '../components/phone/haptics';
import { Dots, Pause, Play, Plus, Search as SearchIcon, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { useGroupRoute, useNav } from '../navigation';
import { useSpotifySearch, SPOTIFY_SEARCH_KINDS } from '@orkester/core/state';
import { accentTextOf } from '../state/selectors';
import type { ApiSearchItem } from '@orkester/core';

// Mobile Spotify catalog search — the touch counterpart of the desktop
// SpotifySearch pane. Behaviour (link state machine + search/enqueue/play) is the
// SHARED useSpotifySearch hook; this screen is purely the phone UI.
//
// Presented as a MODAL over the room it plays onto, and it carries that room's
// transport in a context bar — so after "Play now" you can stop what you started
// without navigating back out.
const KINDS = SPOTIFY_SEARCH_KINDS;

export default function Search() {
  const store = useStore();
  const nav = useNav();
  const { groupId } = useGroupRoute<'Search'>().params;
  const { state, config, groupById, roomName, groupControls, transportPending, getTrack } = store;
  const insets = useSafeAreaInsets();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);

  const g = groupById(groupId);
  const hasTarget = !!g;
  const groupLabel = g ? g.roomIds.map(roomName).join(' · ') : 'this group';
  // The device link is household-wide, so any real room will do — fall back to any
  // discovered room when the target group has gone away.
  const roomIdForLink = g?.roomIds[0] ?? state.rooms[0]?.id ?? '';

  const { link, query, setQuery, kind, setKind, results, busy, error, notice, pending, beginLink, runSearch, addToQueue, playNow } =
    useSpotifySearch({ groupId: g?.id ?? '', roomIdForLink, groupLabel });

  // True once a search has come back, so "no results" is distinguishable from
  // "haven't searched yet" — the old screen rendered nothing for both.
  const [searched, setSearched] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const search = (k?: typeof kind) => {
    setSearched(true);
    void runSearch(k);
  };

  // Surface a browser-open failure rather than swallowing it (no silent fallback).
  const [openError, setOpenError] = React.useState('');
  const openLink = (url: string) => {
    setOpenError('');
    void Linking.openURL(url).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[spotify] Linking.openURL failed:', e);
      setOpenError('Couldn’t open the browser. Copy the link below to authorize Spotify.');
    });
  };
  const onBeginLink = async () => {
    const info = await beginLink();
    if (info) openLink(info.regUrl);
  };

  const header = (
    <View style={{ gap: 18, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text maxFontSizeMultiplier={1.6} style={type.displayMd}>Search</Text>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.12), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>Done</Text>
        </Pressable>
      </View>

      {link.status === 'checking' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator size="small" color={colors.fgMuted} />
          <Text style={type.bodyMuted}>Checking Spotify link…</Text>
        </View>
      )}

      {link.status === 'unlinked' && (
        <View style={{ gap: 12 }}>
          <Text style={type.body}>
            Connect the Spotify account on your Sonos system once. This opens a browser to log in;
            the token is stored locally and reused after that.
          </Text>
          <Pressable
            onPress={() => void onBeginLink()}
            accessibilityRole="button"
            style={({ pressed }) => ({ alignSelf: 'flex-start', height: 48, paddingHorizontal: 20, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: accentText }}>Link Spotify</Text>
          </Pressable>
        </View>
      )}

      {link.status === 'linking' && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color={colors.fgMuted} />
            <Text style={type.bodyMuted}>Waiting for you to approve access in the browser…</Text>
          </View>
          <Pressable onPress={() => openLink(link.regUrl)} hitSlop={8} accessibilityRole="link">
            <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.fgMuted }} selectable>
              {link.regUrl}
            </Text>
          </Pressable>
          {link.showLinkCode && link.linkCode !== '' && (
            <Text style={type.bodyMuted}>
              If asked for a code, enter <Text style={{ fontFamily: font.mono }}>{link.linkCode}</Text>.
            </Text>
          )}
        </View>
      )}

      {link.status === 'linked' && (
        <View style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              height: 50,
              paddingHorizontal: 14,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: ink(0.12),
              backgroundColor: colors.bgPaper,
            }}
          >
            <SearchIcon size={18} color={colors.fgSubtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => search()}
              placeholder="Artists, tracks, albums, playlists…"
              placeholderTextColor={colors.fgSubtle}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: colors.fg }}
            />
            {busy && <ActivityIndicator size="small" color={colors.fgMuted} />}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {KINDS.map((k) => {
              const on = k === kind;
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                    setKind(k);
                    // Re-run the current query against the new category.
                    if (query.trim() !== '') search(k);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({
                    minHeight: 36,
                    justifyContent: 'center',
                    paddingHorizontal: 13,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: on ? 'transparent' : ink(0.12),
                    backgroundColor: on ? colors.fg : pressed ? ink(0.04) : 'transparent',
                  })}
                >
                  <Text
                    style={{
                      fontFamily: font.bodyMedium,
                      fontSize: 12,
                      textTransform: 'capitalize',
                      color: on ? colors.bgPaper : colors.fgMuted,
                    }}
                  >
                    {k}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Speaker size={15} color={colors.fgSubtle} />
            <Text numberOfLines={1} style={[type.small, { flexShrink: 1 }]}>
              {hasTarget ? `Plays on ${groupLabel}` : 'That group is gone — close and pick another'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  const footer = (
    <View style={{ gap: 6, paddingTop: 14 }}>
      {link.status === 'linked' && searched && !busy && results.length === 0 && query.trim() !== '' && (
        <Text style={[type.bodyMuted, { textAlign: 'center', paddingVertical: 18 }]}>
          No {kind} matching “{query.trim()}”.
        </Text>
      )}
      {notice !== '' && <Text style={[type.small, { color: colors.fgMuted }]}>{notice}</Text>}
      {openError !== '' && <Text style={[type.small, { color: colors.danger }]}>{openError}</Text>}
      {error !== '' && <Text style={[type.small, { color: colors.danger }]}>{error}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={link.status === 'linked' ? results : []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 22, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <ResultRow
            item={item}
            accent={accent}
            accentText={accentText}
            enabled={hasTarget}
            pending={pending && pending.id === item.id ? pending.op : null}
            anyPending={pending !== null}
            expanded={expanded === item.id}
            onToggleExpand={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
            onAddQueue={() => void addToQueue(item)}
            onPlayNext={() => void addToQueue(item, true)}
            onPlay={() => void playNow(item)}
          />
        )}
      />

      {/* Context bar: what this search plays onto, and a way to stop it without
          leaving. Only once there is a real group to control. */}
      {g && (
        <ContextBar
          label={groupLabel}
          title={getTrack(g.trackId).title}
          isPlaying={g.isPlaying}
          pending={transportPending(g.id)}
          accent={accent}
          accentText={accentText}
          bottom={insets.bottom}
          onToggle={() => {
            groupControls(g.id).togglePlay();
            tapCommit();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function ContextBar({
  label,
  title,
  isPlaying,
  pending,
  accent,
  accentText,
  bottom,
  onToggle,
}: {
  label: string;
  title: string;
  isPlaying: boolean;
  pending: string | null;
  accent: string;
  accentText: string;
  bottom: number;
  onToggle: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: bottom + 12,
        borderTopWidth: 1,
        borderTopColor: ink(0.08),
        backgroundColor: colors.bgPaper,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>
          {label}
        </Text>
        {!!title && (
          <Text numberOfLines={1} style={[type.small, { marginTop: 1, color: colors.fgSubtle }]}>
            {title}
          </Text>
        )}
      </View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? `Pause ${label}` : `Play ${label}`}
        style={{ width: 44, height: 44, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}
      >
        {pending === 'play' || pending === 'pause' ? (
          <ActivityIndicator size="small" color={accentText} />
        ) : isPlaying ? (
          <Pause size={16} fill={accentText} />
        ) : (
          <Play size={16} fill={accentText} />
        )}
      </Pressable>
    </View>
  );
}

function ResultRow({
  item,
  accent,
  accentText,
  enabled,
  pending,
  anyPending,
  expanded,
  onToggleExpand,
  onAddQueue,
  onPlayNext,
  onPlay,
}: {
  item: ApiSearchItem;
  accent: string;
  accentText: string;
  enabled: boolean;
  pending: 'add' | 'next' | 'play' | null;
  anyPending: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddQueue: () => void;
  onPlayNext: () => void;
  onPlay: () => void;
}) {
  // Secondary line: the artist/curator. Fall back to the kind only when there is
  // no artist at all (so we never show the redundant "Playlist · …").
  const line = item.artist || capitalizeKind(item);
  // One catalog request at a time, so the other rows dim while any is in flight.
  const dimmed = anyPending && pending === null;
  const radius = item.isContainer ? radii.sm : radii.pill;

  return (
    <View style={{ paddingVertical: 6, opacity: dimmed ? 0.45 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {item.artUrl !== '' ? (
          <Image
            source={{ uri: item.artUrl }}
            style={{ width: 48, height: 48, borderRadius: radius, backgroundColor: ink(0.06) }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={140}
            recyclingKey={item.id}
          />
        ) : (
          <View style={{ width: 48, height: 48, borderRadius: radius, backgroundColor: ink(0.06), alignItems: 'center', justifyContent: 'center' }}>
            <SearchIcon size={16} color={colors.fgFaint} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: colors.fg }}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.fgSubtle, marginTop: 2 }}>
            {line}
          </Text>
        </View>
        {/* Play now is the primary action; the rest live behind "more" so the row
            stays readable at phone width and those actions can carry real labels
            instead of a third ambiguous glyph. */}
        <RoundButton
          label={`Play ${item.title} now`}
          enabled={enabled && !anyPending}
          spinning={pending === 'play'}
          bg={accent}
          icon={<Play size={14} fill={accentText} />}
          spinnerColor={accentText}
          onPress={onPlay}
        />
        <RoundButton
          label={expanded ? 'Hide more actions' : 'More actions'}
          enabled={enabled}
          spinning={pending === 'add' || pending === 'next'}
          bg={colors.bgPaper}
          border
          icon={<Dots size={16} color={colors.fg} />}
          spinnerColor={colors.fg}
          onPress={onToggleExpand}
        />
      </View>

      {expanded && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: 60 }}>
          <TextAction label="Play next" enabled={enabled && !anyPending} onPress={onPlayNext} />
          <TextAction label="Add to queue" enabled={enabled && !anyPending} icon onPress={onAddQueue} />
        </View>
      )}
    </View>
  );
}

function RoundButton({
  label,
  icon,
  bg,
  border,
  enabled,
  spinning,
  spinnerColor,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  border?: boolean;
  enabled: boolean;
  spinning: boolean;
  spinnerColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radii.pill,
        backgroundColor: bg,
        borderWidth: border ? 1 : 0,
        borderColor: ink(0.12),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !enabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      {spinning ? <ActivityIndicator size="small" color={spinnerColor} /> : icon}
    </Pressable>
  );
}

function TextAction({ label, enabled, icon, onPress }: { label: string; enabled: boolean; icon?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: ink(0.12),
        backgroundColor: colors.bgPaper,
        opacity: !enabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      {icon && <Plus size={14} color={colors.fg} />}
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 12.5, color: colors.fg }}>{label}</Text>
    </Pressable>
  );
}

function capitalizeKind(item: ApiSearchItem): string {
  // A container's id looks like "spotify:album:..." — derive a label from it.
  const parts = item.id.split(':');
  const kind = parts.length >= 2 ? parts[1] : 'item';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
