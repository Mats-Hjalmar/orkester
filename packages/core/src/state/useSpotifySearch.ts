// Shared Spotify catalog-search behavior — the link state machine + search /
// enqueue / play-now handlers — lifted out of the desktop SpotifySearch pane so
// the desktop component AND the mobile Search screen drive identical logic. The
// presentation differs per platform (desktop hover/master-detail vs mobile
// touch/active-group); this hook owns only the behavior.
//
// RN-safe: imports ONLY `react` (a peerDependency; tsup external) and TYPE-ONLY
// api shapes — no `react-native`, no node:*. `Linking.openURL` is intentionally
// NOT called here (that would pull react-native into core); `beginLink()` returns
// the ApiSpotifyLink and the PLATFORM component opens the URL.

import { useEffect, useRef, useState } from 'react';
import type { ApiSearchItem, ApiSpotifyLink, SpotifySearchKind } from '../api';
import { useStore } from './store';

export const SPOTIFY_SEARCH_KINDS: SpotifySearchKind[] = ['tracks', 'albums', 'artists', 'playlists'];
const POLL_MS = 2500;

export type LinkState =
  | { status: 'checking' }
  | { status: 'unlinked' }
  | { status: 'linking'; regUrl: string; linkCode: string; showLinkCode: boolean }
  | { status: 'linked' };

/** Targeting + label the caller resolves from its own selection model. */
export interface SpotifySearchTarget {
  /** Group id to enqueue/play onto (desktop: selected group; mobile: active group). "" when none. */
  groupId: string;
  /** A real room id to drive the one-time device link (the token is household-wide). "" when none. */
  roomIdForLink: string;
  /** Human label for the notices ("Plays on …"). */
  groupLabel: string;
}

export interface SpotifySearch {
  link: LinkState;
  query: string;
  setQuery: (q: string) => void;
  kind: SpotifySearchKind;
  setKind: (k: SpotifySearchKind) => void;
  results: ApiSearchItem[];
  busy: boolean;
  error: string;
  notice: string;
  /**
   * Starts the device link and flips state to `linking`; RETURNS the link info
   * (regUrl/linkCode) so the caller can open the URL with the platform's Linking,
   * or null when it couldn't start (error already surfaced on `error`).
   */
  beginLink: () => Promise<ApiSpotifyLink | null>;
  /** Runs the search; pass a kind to re-search the current query in a new category. */
  runSearch: (searchKind?: SpotifySearchKind) => Promise<void>;
  /** Appends a hit to the target group's queue. */
  addToQueue: (item: ApiSearchItem) => Promise<void>;
  /** Plays a hit now (replaces the queue) on the target group. */
  playNow: (item: ApiSearchItem) => Promise<void>;
}

export function useSpotifySearch({ groupId, roomIdForLink, groupLabel }: SpotifySearchTarget): SpotifySearch {
  const store = useStore();
  // The store's method identities change on every poll tick (its value is
  // re-memoized whenever state changes — e.g. the 1s progress tick of a playing
  // group). They all delegate to the stable underlying `api`, so we read them
  // through a ref and DON'T list them as effect deps — otherwise the init-check
  // effect below would re-run every second and reset the link state mid-flow,
  // stranding the linking poll forever.
  const apiRef = useRef(store);
  apiRef.current = store;

  const [link, setLink] = useState<LinkState>({ status: 'checking' });
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<SpotifySearchKind>('tracks');
  const [results, setResults] = useState<ApiSearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Initial link check — runs ONCE on mount (see apiRef note above).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const linked = await apiRef.current.isSpotifyLinked();
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
  }, []);

  // While linking, poll until the user authorizes in the browser. Pending polls
  // resolve false (keep waiting); only a definitive failure throws. Bounded by a
  // ~3-minute budget so a stuck link surfaces instead of spinning forever. (On
  // mobile the budget counts TICKS, which the OS throttles while the app is
  // backgrounded for auth — so the bound is approximate, not a hard wall clock.)
  useEffect(() => {
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
          const done = await apiRef.current.pollSpotifyLink();
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
  }, [link.status]);

  const beginLink = async (): Promise<ApiSpotifyLink | null> => {
    setError('');
    if (roomIdForLink === '') {
      setError('No room available to link through — wait for speakers to appear.');
      return null;
    }
    try {
      const info = await apiRef.current.startSpotifyLink(roomIdForLink);
      setLink({ status: 'linking', regUrl: info.regUrl, linkCode: info.linkCode, showLinkCode: info.showLinkCode });
      return info;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[spotify] startSpotifyLink failed:', messageOf(e));
      setError(messageOf(e));
      return null;
    }
  };

  // searchKind defaults to the current selection, but a kind chip passes the
  // newly-picked kind so switching categories re-searches the same query without
  // waiting for the (async) state update.
  const runSearch = async (searchKind: SpotifySearchKind = kind): Promise<void> => {
    const q = query.trim();
    if (q === '') return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const hits = await apiRef.current.searchSpotify(q, searchKind);
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

  const addToQueue = async (item: ApiSearchItem): Promise<void> => {
    setError('');
    try {
      await apiRef.current.enqueueSearchItem(groupId, item);
      setNotice(`Added "${item.title}" to the queue on ${groupLabel}.`);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const playNow = async (item: ApiSearchItem): Promise<void> => {
    setError('');
    try {
      await apiRef.current.playSearchItem(groupId, item);
      setNotice(`Playing "${item.title}"${item.artist ? ` — ${item.artist}` : ''} on ${groupLabel}.`);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return {
    link,
    query,
    setQuery,
    kind,
    setKind,
    results,
    busy,
    error,
    notice,
    beginLink,
    runSearch,
    addToQueue,
    playNow,
  };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
