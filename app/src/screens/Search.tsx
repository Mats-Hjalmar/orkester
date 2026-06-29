import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronRight, Play, Plus, Search as SearchIcon, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { useNav } from '../navigation';
import { useSpotifySearch, SPOTIFY_SEARCH_KINDS } from '@orkester/core/state';
import { accentTextOf } from '../state/selectors';
import type { ApiSearchItem } from '@orkester/core';

// Mobile Spotify catalog search — the touch counterpart of the desktop
// SpotifySearch pane. Behavior (link state machine + search/enqueue/play) is the
// SHARED useSpotifySearch hook; this screen is purely the phone UI.
//
// Targeting: the mobile UI has no master-detail selection, so search plays onto
// the ACTIVE group (activeGroup() — whatever the user last opened, else the first
// group). The "Plays on …" line is a passive indicator, NOT a picker; retargeting
// happens by opening a group from Rooms/Now Playing. When there is no group at
// all, search stays usable but Add/Play are disabled (the store throws on "").
const KINDS = SPOTIFY_SEARCH_KINDS;

export default function Search() {
  const { activeGroup, roomName, state, config } = useStore();
  const nav = useNav();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);

  const g = activeGroup();
  const hasTarget = g.id !== '';
  const groupLabel = g.roomIds.map(roomName).join(' · ') || 'this group';
  // The device link is household-wide, so any real room will do — fall back to
  // any discovered room when no group is active yet.
  const roomIdForLink = g.roomIds[0] ?? state.rooms[0]?.id ?? '';

  const { link, query, setQuery, kind, setKind, results, busy, error, notice, beginLink, runSearch, addToQueue, playNow } =
    useSpotifySearch({ groupId: g.id, roomIdForLink, groupLabel });

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 22, paddingBottom: 28, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back to this room's detail. */}
      <Pressable
        onPress={() => nav.goBack()}
        hitSlop={8}
        accessibilityLabel="Back to room"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <ChevronRight size={18} color={colors.fgMuted} />
        </View>
        <Text style={type.bodyMuted}>{groupLabel}</Text>
      </Pressable>
      <Text style={type.displayXL}>Search</Text>

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
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 44,
              paddingHorizontal: 18,
              borderRadius: radii.pill,
              backgroundColor: accent,
              opacity: pressed ? 0.8 : 1,
            })}
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
          <Pressable onPress={() => openLink(link.regUrl)} hitSlop={6}>
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
        <View style={{ gap: 16 }}>
          {/* Search input + kind selector. */}
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                height: 48,
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
                onSubmitEditing={() => void runSearch()}
                placeholder="Artists, tracks, albums, playlists…"
                placeholderTextColor={colors.fgSubtle}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: colors.fg }}
              />
              <Pressable
                onPress={() => void runSearch()}
                disabled={busy || query.trim() === ''}
                hitSlop={6}
                style={({ pressed }) => ({
                  height: 34,
                  paddingHorizontal: 16,
                  borderRadius: radii.pill,
                  backgroundColor: accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: busy || query.trim() === '' ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={accentText} />
                ) : (
                  <Text style={{ fontFamily: font.bodySemiBold, fontSize: 13, color: accentText }}>Search</Text>
                )}
              </Pressable>
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
                      if (query.trim() !== '') void runSearch(k);
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: 8,
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
          </View>

          {/* Where playback lands — a passive indicator of the active group. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Speaker size={15} color={colors.fgSubtle} />
            <Text style={type.small}>
              {hasTarget ? `Plays on ${groupLabel}` : 'Start a group in Rooms to play search results here'}
            </Text>
          </View>

          {/* Results. */}
          <View style={{ gap: 4 }}>
            {results.map((r) => (
              <ResultRow
                key={r.id}
                item={r}
                accent={accent}
                accentText={accentText}
                enabled={hasTarget}
                onAddQueue={() => void addToQueue(r)}
                onPlay={() => void playNow(r)}
              />
            ))}
          </View>
        </View>
      )}

      {notice !== '' && <Text style={[type.small, { color: colors.fgMuted }]}>{notice}</Text>}
      {openError !== '' && <Text style={[type.small, { color: colors.danger }]}>{openError}</Text>}
      {error !== '' && <Text style={[type.small, { color: colors.danger }]}>{error}</Text>}
    </ScrollView>
  );
}

function ResultRow({
  item,
  accent,
  accentText,
  enabled,
  onAddQueue,
  onPlay,
}: {
  item: ApiSearchItem;
  accent: string;
  accentText: string;
  enabled: boolean;
  onAddQueue: () => void;
  onPlay: () => void;
}) {
  // Secondary line: the artist/curator. Fall back to the kind only when there is
  // no artist at all (so we never show the redundant "Playlist · …").
  const line = item.artist || capitalizeKind(item);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 4,
      }}
    >
      {item.artUrl !== '' ? (
        <Image
          source={{ uri: item.artUrl }}
          style={{ width: 48, height: 48, borderRadius: item.isContainer ? radii.sm : radii.pill, backgroundColor: ink(0.06) }}
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: item.isContainer ? radii.sm : radii.pill,
            backgroundColor: ink(0.06),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
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
      {/* Two explicit touch actions: add to the end of the queue, or play now. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActionButton
          label="Add to queue"
          onPress={onAddQueue}
          enabled={enabled}
          icon={<Plus size={16} color={colors.fg} />}
          bg={colors.bgPaper}
          border
        />
        <ActionButton
          label="Play now"
          onPress={onPlay}
          enabled={enabled}
          icon={<Play size={14} fill={accentText} />}
          bg={accent}
        />
      </View>
    </View>
  );
}

/** A round touch button; greyed + inert when there is no group to act on. */
function ActionButton({
  label,
  icon,
  bg,
  border,
  enabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  border?: boolean;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: radii.pill,
        backgroundColor: bg,
        borderWidth: border ? 1 : 0,
        borderColor: ink(0.12),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !enabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
}

function capitalizeKind(item: ApiSearchItem): string {
  // A container's id looks like "spotify:album:..." — derive a label from it.
  const parts = item.id.split(':');
  const kind = parts.length >= 2 ? parts[1] : 'item';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
