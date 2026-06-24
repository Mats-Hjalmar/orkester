export type Motif = 'sun' | 'arc';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  cat: string; // catalogue number, e.g. NOI-114
  dur: number; // seconds
  coverBg: string;
  coverShape: string;
}

export interface Room {
  id: string;
  name: string;
}

// A group is an independent playback session: its own rooms, track, queue,
// transport and volume. Rooms in no group are idle.
export interface Group {
  id: string;
  roomIds: string[];
  trackId: string;
  isPlaying: boolean;
  progress: number; // seconds into the current track
  shuffle: boolean;
  repeat: boolean;
  muted: boolean;
  queueIds: string[];
}

export interface Config {
  accentColor: string;
  coverMotif: Motif;
  mobileNowDark: boolean;
}

export type MView = 'nowplaying' | 'home' | 'rooms' | 'search';
