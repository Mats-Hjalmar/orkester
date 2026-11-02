import React from 'react';
import { ActivityIndicator, Animated, Easing, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronRight, Close, Play, Plus, Queue, Search, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { useSpotifySearch, SPOTIFY_SEARCH_KINDS, type OpenedContainer, type PendingSearchOp } from '@orkester/core/state';
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
const TITLE_ROW_H = 24;
const GAP = 18;
const SEARCH_H = 46;
const CHIPS_GAP = 12;
const CHIP_H = 30;
const PAD_BOTTOM = 12;
const DOCKED_TOP = 20;
const SEARCH_TOP = PAD + TITLE_ROW_H + GAP;
const COLLAPSE = SEARCH_TOP - DOCKED_TOP;
const HEADER_H = SEARCH_TOP + SEARCH_H + CHIPS_GAP + CHIP_H + PAD_BOTTOM;
const LINK_HEADER_H = PAD + TITLE_ROW_H;

export default function SpotifySearch({ group }: { group?: Group }) {
  const { roomName, config, reportError } = useStore();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);

  const groupLabel = group ? group.roomIds.map(roomName).join(' · ') || 'this group' : 'this group';

  const {
    link, query, setQuery, kind, setKind, results, busy, error, notice, beginLink, runSearch, addToQueue, playNow, pending,
    opened, openContainer, closeContainer,
  } = useSpotifySearch({ groupId: group?.id ?? '', roomIdForLink: group?.roomIds[0] ?? '', groupLabel });

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
  const { headerH, searchTop, chipsTop, titleOpacity, titleScale, titleLift, hairline } = React.useMemo(() => {
    const at = (outputRange: number[]) => progress.interpolate({ inputRange: [0, 1], outputRange });
    const headerH = linked ? at([HEADER_H, HEADER_H - COLLAPSE]) : LINK_HEADER_H;
    const searchTop = at([SEARCH_TOP, DOCKED_TOP]);
    const chipsTop = at([SEARCH_TOP + SEARCH_H + CHIPS_GAP, DOCKED_TOP + SEARCH_H + CHIPS_GAP]);
    const titleOpacity = progress.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: 'clamp' });
    const titleScale = at([1, 0.92]);
    const titleLift = at([0, -8]);
    const hairline = progress.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: 'clamp' });
    return { headerH, searchTop, chipsTop, titleOpacity, titleScale, titleLift, hairline };
  }, [linked, progress]);

  const scrollRef = React.useRef<ScrollView>(null);
  // Opening a playlist (or backing out of one) is a new page: start it at the top.
  const openedId = opened?.item.id ?? null;
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [openedId]);
  const headerRef = React.useRef<View>(null);
  React.useEffect(() => {
    const header = headerRef.current as unknown as HTMLElement | null;
    const scroller = scrollRef.current?.getScrollableNode() as HTMLElement | undefined;
    if (!header || !scroller) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scroller.scrollBy({ top: e.deltaY });
    };
    header.addEventListener('wheel', onWheel, { passive: false });
    return () => header.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg }}>
      <Animated.ScrollView
        ref={scrollRef}
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

            {opened ? (
              <PlaylistView
                opened={opened}
                accent={accent}
                accentText={accentText}
                pending={pending}
                onBack={closeContainer}
                onRetry={() => void openContainer(opened.item)}
                onEnqueue={(item, where) => void addToQueue(item, where)}
                onPlay={(item) => void playNow(item)}
              />
            ) : (
              /* Results. */
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
                    onOpen={r.browsable ? () => void openContainer(r) : undefined}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {notice !== '' && <Text style={[type.small, { color: colors.fgMuted }]}>{notice}</Text>}
      </Animated.ScrollView>

      <Animated.View
        ref={headerRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH, overflow: 'hidden', backgroundColor: colors.bg }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: PAD,
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
            <Animated.View style={{ position: 'absolute', top: searchTop, left: PAD, right: PAD }}>
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

        <Animated.View
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: ink(0.08), opacity: hairline }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * An opened playlist: a header row that acts on the whole playlist (same three
 * actions as in the results), then every track, each individually queueable.
 */
function PlaylistView({
  opened,
  accent,
  accentText,
  pending,
  onBack,
  onRetry,
  onEnqueue,
  onPlay,
}: {
  opened: OpenedContainer;
  accent: string;
  accentText: string;
  pending: { id: string; op: PendingSearchOp } | null;
  onBack: () => void;
  onRetry: () => void;
  onEnqueue: (item: ApiSearchItem, where: QueuePosition) => void;
  onPlay: (item: ApiSearchItem) => void;
}) {
  const { item } = opened;
  const pendingFor = (id: string) => (pending && pending.id === id ? pending.op : null);
  const count =
    opened.status === 'ready'
      ? `${opened.total} ${opened.total === 1 ? 'track' : 'tracks'}`
      : opened.status === 'loading'
        ? 'Loading tracks…'
        : 'Couldn’t load tracks';
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        onPress={onBack}
        accessibilityLabel="Back to search results"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <ChevronRight size={14} color={colors.fgMuted} />
        </View>
        <Text style={type.bodyMuted}>Results</Text>
      </Pressable>

      <ResultRow
        item={item}
        subtitle={[item.artist, count].filter(Boolean).join(' · ')}
        artSize={72}
        accent={accent}
        accentText={accentText}
        pendingOp={pendingFor(item.id)}
        anyPending={pending !== null}
        onEnqueue={(where) => onEnqueue(item, where)}
        onPlay={() => onPlay(item)}
      />

      <View style={{ height: 1, backgroundColor: ink(0.08), marginHorizontal: 10 }} />

      {opened.status === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}>
          <ActivityIndicator size="small" color={colors.fgMuted} />
          <Text style={type.bodyMuted}>Loading tracks…</Text>
        </View>
      )}

      {opened.status === 'error' && (
        <Pressable onPress={onRetry} style={({ pressed }) => ({ alignSelf: 'flex-start', paddingHorizontal: 10, opacity: pressed ? 0.6 : 1 })}>
          <Text style={type.bodyMuted}>Couldn’t load this playlist. Try again</Text>
        </Pressable>
      )}

      {opened.status === 'ready' && (
        <View style={{ gap: 4 }}>
          {opened.tracks.length === 0 && (
            <Text style={[type.bodyMuted, { paddingHorizontal: 10 }]}>This playlist has no playable tracks.</Text>
          )}
          {opened.tracks.map((t, i) => (
            <ResultRow
              // A playlist can hold the same track twice.
              key={`${t.id}#${i}`}
              item={t}
              accent={accent}
              accentText={accentText}
              pendingOp={pendingFor(t.id)}
              anyPending={pending !== null}
              onEnqueue={(where) => onEnqueue(t, where)}
              onPlay={() => onPlay(t)}
            />
          ))}
          {opened.total > opened.tracks.length && (
            <Text style={[type.small, { color: colors.fgMuted, paddingHorizontal: 10, paddingTop: 6 }]}>
              Showing the first {opened.tracks.length} of {opened.total} tracks. Adding the playlist adds all of them.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function ResultRow({
  item,
  subtitle,
  artSize = 44,
  accent,
  accentText,
  pendingOp,
  anyPending,
  onEnqueue,
  onPlay,
  onOpen,
}: {
  item: ApiSearchItem;
  /** Overrides the secondary line. */
  subtitle?: string;
  artSize?: number;
  accent: string;
  accentText: string;
  pendingOp: PendingSearchOp | null;
  anyPending: boolean;
  onEnqueue: (where: QueuePosition) => void;
  onPlay: () => void;
  /** Set for a browsable hit: clicking the art/title opens it. */
  onOpen?: () => void;
}) {
  // Secondary line: the artist/curator. Fall back to the kind only when there is
  // no artist at all (so we never show the redundant "Playlist · …").
  const line = subtitle ?? (item.artist || capitalizeKind(item));
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
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={onOpen ? `Open ${item.title}` : undefined}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, cursor: onOpen ? 'pointer' : 'auto' } as object}
      >
        {item.artUrl !== '' ? (
          <Image
            source={{ uri: item.artUrl }}
            style={{ width: artSize, height: artSize, borderRadius: item.isContainer ? radii.sm : radii.pill, backgroundColor: ink(0.06) }}
          />
        ) : (
          <View
            style={{
              width: artSize,
              height: artSize,
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
        {onOpen && (
          <View style={{ opacity: hovered ? 1 : 0.5 }}>
            <ChevronRight size={16} color={colors.fgMuted} />
          </View>
        )}
      </Pressable>
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
