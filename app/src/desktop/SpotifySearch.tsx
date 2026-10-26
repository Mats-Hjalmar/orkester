import React from 'react';
import { ActivityIndicator, Animated, Easing, Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { ChevronRight, Close, Play, Plus, Queue, Search, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { useSpotifySearch, SPOTIFY_SEARCH_KINDS, type PendingSearchOp } from '@orkester/core/state';
import { accentTextOf } from '../state/selectors';
import type { Group } from '../state/types';
import type { ApiSearchItem, QueuePosition } from '@orkester/core';

// Spotify catalog search, desktop pane. All domain logic lives in the shared
// useSpotifySearch hook (@orkester/core/state) — the same one the mobile Search
// screen uses; this component is purely the desktop UI. The hook owns the link
// state machine + search/enqueue/play; the component owns presentation and the
// platform `Linking.openURL` (kept out of core so it imports only react).

const KINDS = SPOTIFY_SEARCH_KINDS;

const PAD = 28;
const BACK_ROW_H = 18;
const TITLE_ROW_H = 24;
const GAP = 18;
const SEARCH_H = 46;
const CHIPS_GAP = 12;
const CHIP_H = 30;
const PAD_BOTTOM = 12;
const DOCKED_TOP = 20;
const BACK_BTN = 36;
const SEARCH_TOP = PAD + BACK_ROW_H + GAP + TITLE_ROW_H + GAP;
const SEARCH_TOP_FOLDED = PAD + BACK_ROW_H + GAP;
const COLLAPSE = SEARCH_TOP - DOCKED_TOP;
const FOLDED = (SEARCH_TOP - SEARCH_TOP_FOLDED) / COLLAPSE;
const HEADER_H = SEARCH_TOP + SEARCH_H + CHIPS_GAP + CHIP_H + PAD_BOTTOM;
const LINK_HEADER_H = PAD + BACK_ROW_H + GAP + TITLE_ROW_H;
const BACK_TOP = PAD + BACK_ROW_H / 2 - BACK_BTN / 2;
const BACK_TOP_FOLDED = SEARCH_TOP_FOLDED + (SEARCH_H - BACK_BTN) / 2;
const BACK_TOP_DOCKED = DOCKED_TOP + (SEARCH_H - BACK_BTN) / 2;
const CHEVRON_INSET = (BACK_BTN - 16) / 2;

export default function SpotifySearch({ group, onClose }: { group?: Group; onClose?: () => void }) {
  const { roomName, config, reportError } = useStore();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);

  const groupLabel = group ? group.roomIds.map(roomName).join(' · ') || 'this group' : 'this group';

  const { link, query, setQuery, kind, setKind, results, busy, error, notice, beginLink, runSearch, addToQueue, playNow, pending } =
    useSpotifySearch({ groupId: group?.id ?? '', roomIdForLink: group?.roomIds[0] ?? '', groupLabel });

  // Errors go to the window-level toast instead of the bottom of the results.
  React.useEffect(() => {
    if (error !== '') reportError(error);
  }, [error, reportError]);

  // The hook starts the link + returns the URL; the desktop opens it in a browser.
  const onBeginLink = async () => {
    const info = await beginLink();
    if (info) void Linking.openURL(info.regUrl).catch(() => {});
  };

  const linked = link.status === 'linked';
  const inputRef = React.useRef<TextInput>(null);

  const hasQuery = query !== '';
  const clearIn = React.useRef(new Animated.Value(hasQuery ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(clearIn, {
      toValue: hasQuery ? 1 : 0,
      duration: hasQuery ? 180 : 140,
      easing: hasQuery ? Easing.out(Easing.back(1.6)) : Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [hasQuery, clearIn]);
  const clearOpacity = clearIn.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const clearScale = clearIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  const scrollY = React.useRef(new Animated.Value(0)).current;
  const progress = React.useMemo(
    () => (linked ? scrollY.interpolate({ inputRange: [0, COLLAPSE], outputRange: [0, 1], extrapolate: 'clamp' }) : new Animated.Value(0)),
    [linked, scrollY],
  );
  const at = (outputRange: number[]) =>
    progress.interpolate({ inputRange: outputRange.length === 3 ? [0, FOLDED, 1] : [0, 1], outputRange });

  const headerH = linked ? at([HEADER_H, HEADER_H - COLLAPSE]) : LINK_HEADER_H;
  const searchTop = at([SEARCH_TOP, SEARCH_TOP_FOLDED, DOCKED_TOP]);
  const chipsTop = at([SEARCH_TOP + SEARCH_H + CHIPS_GAP, SEARCH_TOP_FOLDED + SEARCH_H + CHIPS_GAP, DOCKED_TOP + SEARCH_H + CHIPS_GAP]);
  const backTop = at([BACK_TOP, BACK_TOP_FOLDED, BACK_TOP_DOCKED]);
  const backLeft = at([PAD - CHEVRON_INSET, PAD, PAD]);
  const labelOpacity = progress.interpolate({ inputRange: [0, FOLDED * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const ringOpacity = progress.interpolate({ inputRange: [FOLDED * 0.5, FOLDED], outputRange: [0, 1], extrapolate: 'clamp' });
  const searchLeft = progress.interpolate({ inputRange: [FOLDED * 0.4, FOLDED], outputRange: [PAD, PAD + BACK_BTN + 10], extrapolate: 'clamp' });
  const titleOpacity = progress.interpolate({ inputRange: [0, FOLDED * 0.7], outputRange: [1, 0], extrapolate: 'clamp' });
  const titleScale = progress.interpolate({ inputRange: [0, FOLDED], outputRange: [1, 0.92], extrapolate: 'clamp' });
  const titleLift = progress.interpolate({ inputRange: [0, FOLDED], outputRange: [0, -8], extrapolate: 'clamp' });
  const hairline = progress.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  const [labelGone, setLabelGone] = React.useState(false);
  React.useEffect(() => {
    const id = progress.addListener(({ value }) => setLabelGone(value >= FOLDED * 0.6));
    return () => progress.removeListener(id);
  }, [progress]);

  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg }}>
      <Animated.ScrollView
        contentContainerStyle={{
          paddingHorizontal: PAD,
          paddingBottom: PAD,
          paddingTop: linked ? HEADER_H + 4 : LINK_HEADER_H + GAP,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
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
                height: 40,
                paddingHorizontal: 16,
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
            <Pressable onPress={() => void Linking.openURL(link.regUrl).catch(() => {})}>
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

        {linked && (
          <View style={{ gap: 16 }}>
            {/* Where playback lands. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Speaker size={15} color={colors.fgSubtle} />
              <Text style={type.small}>Plays on {groupLabel}</Text>
            </View>

            {/* Results. */}
            <View style={{ gap: 4 }}>
              {results.map((r) => (
                <ResultRow
                  key={r.id}
                  item={r}
                  accent={accent}
                  accentText={accentText}
                  pendingOp={pending && pending.id === r.id ? pending.op : null}
                  anyPending={pending !== null}
                  onEnqueue={(where) => void addToQueue(r, where)}
                  onPlay={() => void playNow(r)}
                />
              ))}
            </View>
          </View>
        )}

        {notice !== '' && <Text style={[type.small, { color: colors.fgMuted }]}>{notice}</Text>}
      </Animated.ScrollView>

      <Animated.View
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH, overflow: 'hidden', backgroundColor: colors.bg }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: SEARCH_TOP_FOLDED,
            left: PAD,
            height: TITLE_ROW_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            opacity: titleOpacity,
            transform: [{ translateY: titleLift }, { scale: titleScale }],
            transformOrigin: 'left center',
          } as object}
        >
          <Search size={22} color={colors.fg} />
          <Text style={[type.displaySm]}>Search Spotify</Text>
        </Animated.View>

        {linked && (
          <>
            <Animated.View style={{ position: 'absolute', top: searchTop, left: searchLeft, right: PAD }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  height: SEARCH_H,
                  paddingHorizontal: 14,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: ink(0.12),
                  backgroundColor: colors.bgPaper,
                }}
              >
                <Search size={18} color={colors.fgSubtle} />
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void runSearch()}
                  placeholder="Artists, tracks, albums, playlists…"
                  placeholderTextColor={colors.fgSubtle}
                  returnKeyType="search"
                  autoFocus
                  style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: colors.fg, outlineStyle: 'none' } as object}
                />
                <Animated.View
                  pointerEvents={hasQuery ? 'auto' : 'none'}
                  style={{ opacity: clearOpacity, transform: [{ scale: clearScale }] }}
                >
                  <Pressable
                    onPress={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    accessibilityLabel="Clear search"
                    hitSlop={6}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                      width: 26,
                      height: 26,
                      borderRadius: radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? ink(0.1) : hovered ? ink(0.06) : 'transparent',
                    })}
                  >
                    <Close size={14} color={colors.fgSubtle} />
                  </Pressable>
                </Animated.View>
                <Pressable
                  onPress={() => void runSearch()}
                  disabled={busy || query.trim() === ''}
                  style={({ pressed }) => ({
                    height: 32,
                    paddingHorizontal: 14,
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
            </Animated.View>

            <Animated.View style={{ position: 'absolute', top: chipsTop, left: PAD, right: PAD }}>
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
                        height: CHIP_H,
                        justifyContent: 'center',
                        paddingHorizontal: 12,
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
            </Animated.View>
          </>
        )}

        {onClose && (
          <Animated.View style={{ position: 'absolute', top: backTop, left: backLeft }}>
            <Pressable
              onPress={onClose}
              accessibilityLabel={`Back to ${groupLabel}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: BACK_BTN, opacity: pressed ? 0.6 : 1 })}
            >
              {({ hovered }: { pressed: boolean; hovered?: boolean }) => (
                <>
                  <View style={{ width: BACK_BTN, height: BACK_BTN, alignItems: 'center', justifyContent: 'center' }}>
                    <Animated.View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: radii.pill,
                        borderWidth: 1,
                        borderColor: ink(0.12),
                        backgroundColor: hovered ? ink(0.06) : colors.bgPaper,
                        opacity: ringOpacity,
                      }}
                    />
                    <View style={{ transform: [{ rotate: '180deg' }] }}>
                      <ChevronRight size={16} color={colors.fgMuted} />
                    </View>
                  </View>
                  {!labelGone && (
                    <Animated.Text style={[type.bodyMuted, { marginLeft: 6 - CHEVRON_INSET, opacity: labelOpacity }]}>
                      Back to {groupLabel}
                    </Animated.Text>
                  )}
                </>
              )}
            </Pressable>
          </Animated.View>
        )}

        <Animated.View
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: ink(0.08), opacity: hairline }}
        />
      </Animated.View>
    </View>
  );
}

function ResultRow({
  item,
  accent,
  accentText,
  pendingOp,
  anyPending,
  onEnqueue,
  onPlay,
}: {
  item: ApiSearchItem;
  accent: string;
  accentText: string;
  pendingOp: PendingSearchOp | null;
  anyPending: boolean;
  onEnqueue: (where: QueuePosition) => void;
  onPlay: () => void;
}) {
  // Secondary line: the artist/curator. Fall back to the kind only when there is
  // no artist at all (so we never show the redundant "Playlist · …").
  const line = item.artist || capitalizeKind(item);
  const [hovered, setHovered] = React.useState(false);
  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radii.md,
        backgroundColor: hovered ? ink(0.04) : 'transparent',
      }}
    >
      {item.artUrl !== '' ? (
        <Image
          source={{ uri: item.artUrl }}
          style={{ width: 44, height: 44, borderRadius: item.isContainer ? radii.sm : radii.pill, backgroundColor: ink(0.06) }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: item.isContainer ? radii.sm : radii.pill,
            backgroundColor: ink(0.06),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Search size={16} color={colors.fgFaint} />
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
      {/* Three explicit actions: append to the queue, insert after the current
          track, or play now (which REPLACES the queue). One
          catalog request runs at a time; the rest dim while it does. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: anyPending && !pendingOp ? 0.45 : 1 }}>
        <ActionButton
          label="Add to queue"
          onPress={() => onEnqueue('end')}
          icon={pendingOp === 'end' ? <ActivityIndicator size="small" color={colors.fg} /> : <Plus size={14} color={colors.fg} />}
          bg={colors.bgPaper}
          border
        />
        <ActionButton
          label="Play next"
          onPress={() => onEnqueue('next')}
          icon={pendingOp === 'next' ? <ActivityIndicator size="small" color={colors.fg} /> : <Queue size={15} color={colors.fg} />}
          bg={colors.bgPaper}
          border
        />
        <ActionButton
          label="Play now"
          onPress={onPlay}
          icon={pendingOp === 'play' ? <ActivityIndicator size="small" color={accentText} /> : <Play size={13} fill={accentText} />}
          bg={accent}
        />
      </View>
    </View>
  );
}

/** A round icon button with a hover tooltip (web) explaining its action. */
function ActionButton({
  label,
  icon,
  bg,
  border,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  border?: boolean;
  onPress: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <View style={{ position: 'relative' }}>
      {hover && (
        <View
          style={{
            position: 'absolute',
            bottom: 38,
            right: 0,
            backgroundColor: colors.fg,
            paddingVertical: 4,
            paddingHorizontal: 8,
            borderRadius: radii.sm,
            zIndex: 10,
          }}
        >
          <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 11, color: colors.bgPaper }}>
            {label}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityLabel={label}
        onPress={onPress}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: radii.pill,
          backgroundColor: bg,
          borderWidth: border ? 1 : 0,
          borderColor: ink(0.12),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {icon}
      </Pressable>
    </View>
  );
}

function capitalizeKind(item: ApiSearchItem): string {
  // A container's id looks like "spotify:album:..." — derive a label from it.
  const parts = item.id.split(':');
  const kind = parts.length >= 2 ? parts[1] : 'item';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
