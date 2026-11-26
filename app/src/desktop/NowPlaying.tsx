import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import SpotifyConnectBadge from '../components/SpotifyConnectBadge';
import SpotifyUpNext from '../components/SpotifyUpNext';
import QueueRow from '../components/QueueRow';
import { showContextMenu } from './contextMenu';
import { useQueueDropTarget, usePressDrag, useSearchDrag, type DragPoint } from './drag';
import { BAR_W, HIT_W, QUEUE_SCROLL_ID, ScrollMarker } from './QueueScrollbar';
import { ChevronRight, Dots, Grip, Play, Queue, QueueBottom, QueueTop, Speaker, Trash } from '../icons';
import { colors, FIXED_DARK, ink, radii, shadow } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { onPrimaryOf, groupCount } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import { ON_PRIMARY_SECONDARY_OPACITY } from '@orkester/core/theme';
import type { Group, QueueItem } from '../state/types';
import type { Motif } from '../state/types';

// Centered guidance shown when there is nothing to control yet: still discovering,
// couldn't reach any speakers (connect instructions), or connected-but-idle
// (prompt to start playback, since picking tracks in-app is deferred).
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <View style={{ maxWidth: 460, alignItems: 'center', gap: 14 }}>{children}</View>
    </View>
  );
}

// A small back affordance to return to the rooms grid. Reuses the chevron motif.
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, marginLeft: 32, marginTop: 24, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.12), backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <ChevronRight size={16} color={colors.text} />
      </View>
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.text }}>Rooms</Text>
    </Pressable>
  );
}

// Fixed row height so the drag math (dy / ROW_H) maps cleanly to row offsets.
const QUEUE_ROW_H = 52;
const DRAG_SETTLE_MS = 150;
// A multi-row drag shows as a stack: this many cards peek out below the grabbed
// row, each one lower and narrower than the one above it.
const STACK_CARDS = 2;
const STACK_PEEK = 5;
const STACK_INSET = 0.04;

// A selectable, drag-to-reorder queue. Rows select like a desktop file list
// (click, Cmd/Ctrl-click to toggle, Shift-click for a range) so several tracks
// can be moved or removed at once; a plain click therefore only selects, and a
// track plays from its cover or a double-click instead. The selection is indices,
// so it is dropped whenever the queue array changes and they'd name other tracks.
//
// A whole row drags once the pointer passes DRAG_THRESHOLD (below it the press is
// a click), with W3C pointer events and pointer CAPTURE — PanResponder is
// unreliable under react-native-web. Dragging a selected row drags the whole
// selection as one block, and the other rows shift to preview the drop; on
// release we ask the SPEAKER to move them (the store re-reads from Sonos — no
// optimistic local splice). The fixed row height makes dy → row-offset exact.
// A search hit dragged over the list shows an insertion line at `insertAt`.
//
// Each row also has a menu (dots button or right-click), acting on the selection
// when the row is in it, for the moves that are tedious by drag: play now, play
// next, move to end, remove.
//
// The list is the WHOLE queue: rows before `currentIndex` have already played and
// are faded; the current row is filled with the accent.
function QueueList({ items, motif, accent, currentIndex, insertAt, listRef, onMove, onPlay, onRemove }: {
  items: QueueItem[];
  motif: Motif;
  accent: string;
  currentIndex: number;
  insertAt: number | null;
  listRef: React.Ref<View>;
  onMove: (indices: number[], toIndex: number) => void;
  onPlay: (index: number) => void;
  onRemove: (indices: number[]) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ of: QueueItem[]; indices: number[]; anchor: number }>({ of: items, indices: [], anchor: 0 });
  const live = selection.of === items;
  const selected = live ? selection.indices : [];
  const isSelected = new Set(selected);
  const select = (indices: number[], anchor: number) =>
    setSelection({ of: items, indices: [...indices].sort((a, b) => a - b), anchor });
  // The rows an action on `index` applies to: the selection when it holds the row, else the row alone.
  const targetsOf = (index: number) => {
    if (isSelected.has(index)) return selected;
    select([index], index);
    return [index];
  };

  const onRowClick = (index: number, e: MouseEvent) => {
    if (e.detail === 2) {
      onPlay(index);
    } else if (e.shiftKey) {
      const anchor = live ? selection.anchor : index;
      const lo = Math.min(anchor, index);
      select(Array.from({ length: Math.abs(index - anchor) + 1 }, (_, k) => lo + k), anchor);
    } else if (e.metaKey || e.ctrlKey) {
      select(isSelected.has(index) ? selected.filter((i) => i !== index) : [...selected, index], index);
    } else {
      select([index], index);
    }
  };

  // Move targets are a FINAL block position, so "already there" means the
  // targets are contiguous and start at `to`.
  const inPlace = (targets: number[], to: number) => targets.every((t, k) => t === to + k);
  const openMenu = (index: number) => {
    const targets = targetsOf(index);
    const count = targets.length;
    // Directly after the current track: past every unselected track up to and including it.
    const nextSlot = currentIndex + 1 - targets.filter((t) => t <= currentIndex).length;
    const end = items.length - count;
    void showContextMenu([
      ...(count === 1 ? [{ label: 'Play now', icon: <Play size={16} />, onPress: () => onPlay(index) }] : []),
      { label: 'Play next', icon: <QueueTop size={16} />, onPress: () => onMove(targets, nextSlot), enabled: !targets.includes(currentIndex) && !inPlace(targets, nextSlot) },
      { label: 'Move to end of queue', icon: <QueueBottom size={16} />, onPress: () => onMove(targets, end), enabled: !inPlace(targets, end) },
      { label: count === 1 ? 'Remove from queue' : `Remove ${count} tracks from queue`, icon: <Trash size={16} />, onPress: () => onRemove(targets) },
    ]);
  };

  const onPrimary = onPrimaryOf(accent);
  const [drag, setDrag] = useState<{ grabbed: number; indices: number[]; dy: number; settled: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const press = usePressDrag();
  // Where the dragged block would start if dropped now.
  const dropIndex = (d: { grabbed: number; indices: number[]; dy: number }) =>
    Math.max(0, Math.min(items.length - d.indices.length, Math.round(d.grabbed - d.indices.indexOf(d.grabbed) + d.dy / QUEUE_ROW_H)));

  // While dragging, the dragged rows collapse onto the grabbed one — a single
  // row under the cursor, so a big selection doesn't hide the list — and the
  // other rows close up around it, leaving a one-row gap at the drop slot. The
  // rows above shift down by `rank` so the gap starts out exactly under the cursor.
  let offsets: number[] | null = null;
  if (drag) {
    const to = dropIndex(drag);
    const rank = drag.indices.indexOf(drag.grabbed);
    let unselected = 0;
    offsets = items.map((_, i) => {
      if (drag.indices.includes(i)) return drag.dy + (drag.grabbed - i) * QUEUE_ROW_H;
      const slot = rank + unselected + (unselected < to ? 0 : 1);
      unselected += 1;
      return (slot - i) * QUEUE_ROW_H;
    });
  }

  return (
    <View ref={listRef}>
      {items.map((item, index) => {
        const isDragged = !!drag?.indices.includes(index);
        const isGrabbed = drag?.grabbed === index;
        // 0 for the grabbed row, 1.. for the rows stacked beneath it, -1 when not dragged.
        const stackDepth = !drag || !isDragged ? -1 : isGrabbed ? 0 : drag.indices.filter((i) => i !== drag.grabbed).indexOf(index) + 1;
        const card = Math.min(stackDepth, STACK_CARDS);
        const isCurrent = index === currentIndex;
        const translateY = offsets?.[index] ?? 0;

        const trailingIcon = isCurrent ? { color: onPrimary, opacity: ON_PRIMARY_SECONDARY_OPACITY } : { color: colors.textTertiary, opacity: 1 };

        // Only a visual affordance: the whole row is the drag handle.
        const grip = (
          <View style={{ padding: 6, opacity: trailingIcon.opacity }}>
            <Grip size={16} color={trailingIcon.color} />
          </View>
        );

        const dots = (
          // Pressing the menu button must not arm a row drag.
          <Pressable
            onPointerDown={(e) => e.stopPropagation()}
            accessibilityLabel={`More options for ${item.title || item.album}`}
            onPress={() => openMenu(index)}
            hitSlop={4}
            style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.5 : 1 })}
          >
            <View style={{ opacity: trailingIcon.opacity, transform: [{ rotate: '90deg' }] }}>
              <Dots size={16} color={trailingIcon.color} />
            </View>
          </Pressable>
        );

        return (
          <View
            key={`${index}:${item.title}:${item.artist}`}
            // RN's ViewProps lacks the mouse events; react-native-web forwards them to the DOM.
            {...{
              onContextMenu: (e: MouseEvent) => {
                e.preventDefault();
                openMenu(index);
              },
              onClick: (e: MouseEvent) => {
                if (!press.consumeDragClick()) onRowClick(index, e);
              },
            }}
            {...press.bind({
              onStart: () => {
                setDrag({ grabbed: index, indices: targetsOf(index), dy: 0, settled: false });
                setTimeout(() => setDrag((d) => d && { ...d, settled: true }), DRAG_SETTLE_MS);
              },
              onMove: (_, delta) => setDrag((d) => d && { ...d, dy: delta.y }),
              onEnd: (_, delta) => {
                const d = dragRef.current;
                setDrag(null);
                if (!d) return;
                const to = dropIndex({ ...d, dy: delta.y });
                if (!inPlace(d.indices, to)) onMove(d.indices, to);
              },
              onCancel: () => setDrag(null),
            })}
            onPointerEnter={() => setHovered(index)}
            onPointerLeave={() => setHovered((h) => (h === index ? null : h))}
            // The negative margin lets the tint extend past the content without shifting it.
            // The current row keeps its accent fill, so its selection shows as an inset ring.
            style={{
              height: QUEUE_ROW_H, justifyContent: 'center', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radii.md, cursor: isDragged ? 'grabbing' : 'grab',
              // Dragged rows are opaque cards, so the stack hides the rows sliding beneath it.
              backgroundColor: isCurrent && stackDepth <= 0 ? accent : isDragged ? colors.surface : isSelected.has(index) ? ink(0.08) : hovered === index ? ink(0.03) : 'transparent',
              boxShadow: isDragged ? `${shadow.md}, 0px 0px 0px 1px ${ink(0.12)}` : isCurrent && isSelected.has(index) ? `inset 0px 0px 0px 2px ${onPrimary}` : undefined,
              transform: isDragged ? [{ translateY: translateY + card * STACK_PEEK }, { scaleX: 1 - card * STACK_INSET }] : [{ translateY }],
              zIndex: isDragged ? 1 + STACK_CARDS + 1 - card : 1, opacity: stackDepth > STACK_CARDS ? 0 : isDragged ? 1 : index < currentIndex ? 0.5 : 1,
              // Only mid-drag, so a drop snaps instead of easing back to the old order
              // before the re-read; never on the grabbed row, which must track the cursor,
              // and on the cards beneath it only while they gather, so they don't trail it.
              ...(drag && !isGrabbed && !(isDragged && drag.settled) && { transitionProperty: 'transform, opacity', transitionDuration: `${DRAG_SETTLE_MS}ms` }),
            } as any}
          >
            {stackDepth <= 0 && <QueueRow
              item={item}
              motif={motif}
              fg={isCurrent ? onPrimary : colors.text}
              muted={isCurrent ? onPrimary : colors.textSecondary}
              current={isCurrent}
              onPressArt={() => onPlay(index)}
              trailing={isGrabbed && drag.indices.length > 1
                ? <Text style={{ fontFamily: font.bodySemiBold, fontSize: 12, color: trailingIcon.color, opacity: trailingIcon.opacity, paddingHorizontal: 6 }}>{drag.indices.length} tracks</Text>
                : <>{dots}{grip}</>}
            />}
          </View>
        );
      })}
      {insertAt !== null && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: insertAt * QUEUE_ROW_H - 1, height: 2, borderRadius: radii.pill, backgroundColor: colors.text, zIndex: 10 }} />
      )}
    </View>
  );
}

const COLUMN_W = 462;
const HERO_COVER = 96;
const PAD = 44;
const PAD_LEFT = 24;
// Narrower than PAD: just enough to hold the queue's scroll bar beside the rows.
const PAD_RIGHT = 28;
const SCROLLBAR_RIGHT = 10;
// The native scrollbar takes HIT_W inside the scroller: shift the scroller so the
// visible bar keeps its gap, and pad the rows by what is left so they keep their width.
const SCROLLER_MARGIN_RIGHT = SCROLLBAR_RIGHT - (HIT_W - BAR_W) / 2;
const QUEUE_PAD_RIGHT = PAD_RIGHT - SCROLLER_MARGIN_RIGHT - HIT_W;

// The FOCUSED Now Playing for ONE group. It takes the group (and, on narrow
// layouts, an optional onBack) rather than reading any global active-group
// singleton — every control here is routed through groupControls(group.id), so
// it drives exactly this group. In the desktop master–detail the list is always
// present, so onBack is omitted and no back button renders. `onShowArt` asks the
// app to open the full-size cover, which it draws above every column.
export default function DesktopNowPlaying({ group, onBack, onShowArt }: { group?: Group; onBack?: () => void; onShowArt?: () => void }) {
  const store = useStore();
  const { state, getTrack, roomName, config, queueFor, clearQueue, moveQueueItems, removeQueueItems, playQueueIndex } = store;
  const accent = config.accentColor;
  const status = state.topologyStatus;
  const connected = status === 'ready' && state.groups.length > 0;

  // A search hit dragged here is inserted where it is dropped. Under Spotify
  // Connect the queue is hidden, so nothing is offered; an empty queue isn't
  // rendered, so then the whole column takes the drop and appends.
  const canDrop = connected && !!group && !group.spotifyConnect;
  const dropQueue = canDrop ? queueFor(group.id) : [];
  const columnRef = useRef<View>(null);
  const queueViewRef = useRef<View>(null);
  const listRef = useRef<View>(null);
  const rectOf = (ref: React.RefObject<View | null>) => (ref.current as unknown as HTMLElement | null)?.getBoundingClientRect();
  const inside = (rect: DOMRect | undefined, at: DragPoint) =>
    !!rect && at.x >= rect.left && at.x <= rect.right && at.y >= rect.top && at.y <= rect.bottom;
  // The queue slot (0..length) a hit dropped at `at` would take, or null when it isn't over the queue.
  const dropSlot = (at: DragPoint): number | null => {
    if (dropQueue.length === 0) return inside(rectOf(columnRef), at) ? 0 : null;
    const list = rectOf(listRef);
    if (!list || !inside(rectOf(queueViewRef), at)) return null;
    return Math.max(0, Math.min(dropQueue.length, Math.round((at.y - list.top) / QUEUE_ROW_H)));
  };
  useQueueDropTarget(canDrop ? (at) => {
    const slot = dropSlot(at);
    return slot === null ? null : slot === dropQueue.length ? 'end' : slot;
  } : null);
  const searchDrag = useSearchDrag();
  const dropAt = canDrop && searchDrag ? dropSlot(searchDrag.at) : null;

  // --- Not connected: discovering / connect instructions ------------------
  if (!connected || !group) {
    const heading = status === 'loading' || status === 'idle' ? 'Finding your speakers' : 'No Sonos speakers found';
    return (
      <View style={{ flex: 1 }}>
        {onBack && <BackButton onPress={onBack} />}
        <Centered>
          <View style={{ width: 64, height: 64, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: ink(0.1), alignItems: 'center', justifyContent: 'center' }}>
            <Speaker size={30} color={colors.textSecondary} />
          </View>
          <Text style={[type.displaySm, { textAlign: 'center' }]}>{heading}</Text>
          {status === 'loading' || status === 'idle' ? (
            <Text style={[type.bodyMuted, { textAlign: 'center' }]}>Listening for Sonos on this network…</Text>
          ) : (
            <>
              <Text style={[type.bodyMuted, { textAlign: 'center', lineHeight: 20 }]}>
                Make sure this device is on the same Wi‑Fi network as your Sonos, and that
                Local Network access is allowed:
              </Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', fontFamily: font.mono, fontSize: 12 }]}>
                System Settings → Privacy & Security → Local Network → enable Orkester
              </Text>
              {!!state.topologyError && (
                <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.danger, textAlign: 'center' }}>
                  {state.topologyError}
                </Text>
              )}
              <Text style={[type.small, { textAlign: 'center', color: colors.textTertiary }]}>Retrying automatically…</Text>
            </>
          )}
        </Centered>
      </View>
    );
  }

  const g = group;
  const tr = getTrack(g.trackId);
  const idle = g.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const here = g.roomIds.length ? `${roomName(g.roomIds[0])} ${groupCount(g)}`.trim() : 'this group';
  // Under Spotify Connect the Sonos queue isn't what plays next — hide it.
  const queue = g.spotifyConnect ? [] : queueFor(g.id);
  const queueBusy = store.queuePending(g.id);

  // Transport, volume and grouping live in the MiniPlayer; this column is the
  // track and its queue. Fixed width so the search column beside it gets the rest.
  return (
    <View ref={columnRef} style={{ width: COLUMN_W, flex: 'none' as any, backgroundColor: dropAt !== null && queue.length === 0 ? ink(0.04) : 'transparent' }}>
      {onBack && <BackButton onPress={onBack} />}
      <View style={{ paddingTop: PAD, paddingLeft: PAD_LEFT, paddingRight: PAD_RIGHT }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Pressable
            onPress={onShowArt}
            disabled={idle || !onShowArt}
            accessibilityRole="button"
            accessibilityLabel="Show album art"
            style={{ cursor: idle || !onShowArt ? 'default' : 'zoom-in' } as any}
          >
            <CoverArt size={HERO_COVER} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} shadow={shadow.md} artUrl={idle ? undefined : tr.artUrl}>
              {idle && (
                // FIXED_DARK, not ink: the idle cover is a fixed light pastel, so the glyph must stay dark in every theme.
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
                  <Speaker size={32} color={FIXED_DARK} />
                </View>
              )}
            </CoverArt>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: idle ? colors.textHint : accent }} />
              <Text numberOfLines={1} style={[type.eyebrow, { flexShrink: 1 }]}>{here}</Text>
              {g.spotifyConnect && <SpotifyConnectBadge />}
            </View>
            {/* Title only when the speaker reports one — no fabricated label. */}
            {!idle && !!tr.title && (
              <Text testID="np-title" numberOfLines={2} style={[type.displaySm, { marginTop: 6 }]}>{tr.title}</Text>
            )}
            {!idle && !!tr.artist && <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>{tr.artist}</Text>}
            {!idle && !!tr.album && (
              <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{tr.album}</Text>
            )}
          </View>
        </View>

        {queue.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 8 }}>
            <Queue size={16} color={colors.textTertiary} />
            <Text style={[type.eyebrow, { flex: 1 }]}>Queue · {queue.length}</Text>
            <Pressable onPress={() => clearQueue(g.id)} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              {queueBusy ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={{ fontFamily: font.bodyMedium, fontSize: 12, color: colors.textSecondary }}>Clear</Text>
              )}
            </Pressable>
          </View>
        )}
        {g.spotifyConnect && (
          <View style={{ marginTop: 28 }}>
            <SpotifyUpNext upNext={g.upNext} />
          </View>
        )}
      </View>

      {/* The coordinator's queue. Hidden when empty (some streaming sources
          play without a queue) — no placeholder. */}
      {queue.length > 0 && (
        <QueueScroll viewRef={queueViewRef} groupId={g.id} currentIndex={g.queueIndex} count={queue.length} accent={accent}>
          <QueueList
            items={queue}
            motif={config.coverMotif}
            accent={accent}
            currentIndex={g.queueIndex}
            insertAt={dropAt}
            listRef={listRef}
            onMove={(indices, toIndex) => moveQueueItems(g.id, indices, toIndex)}
            onPlay={(index) => playQueueIndex(g.id, index)}
            onRemove={(indices) => removeQueueItems(g.id, indices)}
          />
        </QueueScroll>
      )}
    </View>
  );
}

// Keeps the current track at the top of the viewport, so the played tracks sit
// just above it — reachable by scrolling back. Re-aligns when the track or group
// changes; the jump is instant for a new group and animated for a track change.
// The scroll indicator sits in the right-hand padding and marks the current row.
function QueueScroll({ viewRef, groupId, currentIndex, count, accent, children }: { viewRef: React.Ref<View>; groupId: string; currentIndex: number; count: number; accent: string; children: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const lastGroup = useRef(groupId);
  const hasQueue = count > 0;
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  useEffect(() => {
    if (!hasQueue) return;
    const animated = lastGroup.current === groupId;
    lastGroup.current = groupId;
    ref.current?.scrollTo({ y: Math.max(0, currentIndex) * QUEUE_ROW_H, animated });
  }, [groupId, currentIndex, hasQueue]);

  return (
    <View ref={viewRef} style={{ flex: 1 }}>
      <ScrollView
        ref={ref}
        id={QUEUE_SCROLL_ID}
        style={{ flex: 1, marginRight: SCROLLER_MARGIN_RIGHT }}
        contentContainerStyle={{ paddingLeft: PAD_LEFT, paddingRight: QUEUE_PAD_RIGHT, paddingBottom: PAD }}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContent(h)}
      >
        {children}
      </ScrollView>
      {currentIndex >= 0 && (
        <ScrollMarker viewport={viewport} content={content} right={SCROLLBAR_RIGHT} y={(currentIndex + 0.5) * QUEUE_ROW_H} color={accent} />
      )}
    </View>
  );
}
