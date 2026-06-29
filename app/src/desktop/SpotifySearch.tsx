import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronRight, Play, Plus, Search, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf } from '../state/selectors';
import type { Group } from '../state/types';
import type { ApiSearchItem, SpotifySearchKind } from '@orkester/core';

// Spotify catalog search, desktop pane. All domain logic lives in @orkester/core
// (shared by desktop + app); this is purely the UI, driven through useStore():
//   - isSpotifyLinked / startSpotifyLink / pollSpotifyLink  (one-time device link)
//   - searchSpotify(query, kind)                            (catalog search)
//   - enqueueSearchItem(groupId, item)                      (play on a group)
// It owns its own result/link state — search is imperative request/response,
// not part of the polled store state.

const KINDS: SpotifySearchKind[] = ['tracks', 'albums', 'artists', 'playlists'];
const POLL_MS = 2500;

type LinkState =
  | { status: 'checking' }
  | { status: 'unlinked' }
  | { status: 'linking'; regUrl: string; linkCode: string; showLinkCode: boolean }
  | { status: 'linked' };

export default function SpotifySearch({ group, onClose }: { group?: Group; onClose?: () => void }) {
  const {
    isSpotifyLinked,
    startSpotifyLink,
    pollSpotifyLink,
    searchSpotify,
    enqueueSearchItem,
    playSearchItem,
    roomName,
    config,
  } = useStore();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);

  const [link, setLink] = React.useState<LinkState>({ status: 'checking' });
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState<SpotifySearchKind>('tracks');
  const [results, setResults] = React.useState<ApiSearchItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const playRoomId = group?.roomIds[0] ?? '';
  const groupLabel = group ? group.roomIds.map(roomName).join(' · ') || 'this group' : 'this group';

  // Initial link check.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const linked = await isSpotifyLinked();
        if (!cancelled) setLink({ status: linked ? 'linked' : 'unlinked' });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[spotify] isSpotifyLinked failed:', messageOf(e));
        if (!cancelled) setError(messageOf(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSpotifyLinked]);

  // While linking, poll until the user authorizes in the browser. Pending polls
  // resolve false (keep waiting); only a definitive failure throws. Bounded by a
  // ~3-minute timeout so a stuck link surfaces instead of spinning forever.
  React.useEffect(() => {
    if (link.status !== 'linking') return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = Math.ceil((3 * 60 * 1000) / POLL_MS);
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        if (!cancelled) {
          setError('Timed out waiting for Spotify authorization. Try linking again.');
          setLink({ status: 'unlinked' });
        }
        return;
      }
      void (async () => {
        try {
          const done = await pollSpotifyLink();
          if (!cancelled && done) setLink({ status: 'linked' });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[spotify] pollSpotifyLink failed:', messageOf(e));
          if (!cancelled) {
            setError(messageOf(e));
            setLink({ status: 'unlinked' });
          }
        }
      })();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [link.status, pollSpotifyLink]);

  const beginLink = async () => {
    setError('');
    if (playRoomId === '') {
      setError('No room available to link through — wait for speakers to appear.');
      return;
    }
    try {
      const info = await startSpotifyLink(playRoomId);
      setLink({ status: 'linking', regUrl: info.regUrl, linkCode: info.linkCode, showLinkCode: info.showLinkCode });
      void Linking.openURL(info.regUrl).catch(() => {});
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[spotify] startSpotifyLink failed:', messageOf(e));
      setError(messageOf(e));
    }
  };

  // searchKind defaults to the current selection, but a kind chip passes the
  // newly-picked kind so switching categories re-searches the same query without
  // waiting for the (async) state update.
  const runSearch = async (searchKind: SpotifySearchKind = kind) => {
    const q = query.trim();
    if (q === '') return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const hits = await searchSpotify(q, searchKind);
      setResults(hits);
      if (hits.length === 0) setNotice(`No ${searchKind} match "${q}".`);
    } catch (e) {
      // NotLinkedError surfaces as a re-link prompt; everything else is shown.
      if (e instanceof Error && e.name === 'NotLinkedError') {
        setLink({ status: 'unlinked' });
      } else {
        setError(messageOf(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const addToQueue = async (item: ApiSearchItem) => {
    setError('');
    try {
      await enqueueSearchItem(group?.id ?? '', item);
      setNotice(`Added "${item.title}" to the queue on ${groupLabel}.`);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const playNow = async (item: ApiSearchItem) => {
    setError('');
    try {
      await playSearchItem(group?.id ?? '', item);
      setNotice(`Playing "${item.title}"${item.artist ? ` — ${item.artist}` : ''} on ${groupLabel}.`);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, gap: 18 }} showsVerticalScrollIndicator={false}>
        {onClose && (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <ChevronRight size={16} color={colors.fgMuted} />
            </View>
            <Text style={type.bodyMuted}>Back to {groupLabel}</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Search size={22} color={colors.fg} />
          <Text style={[type.displaySm]}>Search Spotify</Text>
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
              onPress={() => void beginLink()}
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

        {link.status === 'linked' && (
          <View style={{ gap: 16 }}>
            {/* Search input + kind selector. */}
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  height: 46,
                  paddingHorizontal: 14,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: ink(0.12),
                  backgroundColor: colors.bgPaper,
                }}
              >
                <Search size={18} color={colors.fgSubtle} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void runSearch()}
                  placeholder="Artists, tracks, albums, playlists…"
                  placeholderTextColor={colors.fgSubtle}
                  returnKeyType="search"
                  style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: colors.fg, outlineStyle: 'none' } as object}
                />
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
                        paddingVertical: 6,
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
            </View>

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
                  onAddQueue={() => void addToQueue(r)}
                  onPlay={() => void playNow(r)}
                />
              ))}
            </View>
          </View>
        )}

        {notice !== '' && <Text style={[type.small, { color: colors.fgMuted }]}>{notice}</Text>}
        {error !== '' && <Text style={[type.small, { color: colors.danger }]}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function ResultRow({
  item,
  accent,
  accentText,
  onAddQueue,
  onPlay,
}: {
  item: ApiSearchItem;
  accent: string;
  accentText: string;
  onAddQueue: () => void;
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
      {/* Two explicit actions: add to the end of the queue, or play now (replace). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActionButton
          label="Add to queue"
          onPress={onAddQueue}
          icon={<Plus size={14} color={colors.fg} />}
          bg={colors.bgPaper}
          border
        />
        <ActionButton
          label="Play now"
          onPress={onPlay}
          icon={<Play size={13} fill={accentText} />}
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

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
