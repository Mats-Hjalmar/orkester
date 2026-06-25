// The mock catalogue + rooms behind MockApi (demo / web mode, no speakers).
// Lifted from the app's original mock library so `expo export --platform web`
// and offline dev keep working with zero hardware.

export interface MockTrack {
  title: string;
  artist: string;
  album: string;
  dur: number; // seconds
}

/** The fictional Noira catalogue (title/artist/album/duration only — art is synthesized). */
export const MOCK_LIBRARY: MockTrack[] = [
  { title: 'Amber Hours', artist: 'Lena Sorel', album: 'Amber Hours', dur: 218 },
  { title: 'Soft Static', artist: 'Hiro Tanaka', album: 'Soft Static', dur: 252 },
  { title: 'Quiet Rooms', artist: 'The Morning Editions', album: 'Quiet Rooms', dur: 196 },
  { title: 'Paper Light', artist: 'Esi Mensah', album: 'Paper Light', dur: 234 },
  { title: 'Long Exhale', artist: 'Nils Berg Trio', album: 'Long Exhale', dur: 305 },
  { title: 'Field Notes', artist: 'Mara Vidal', album: 'Field Notes', dur: 188 },
  { title: 'Low Sun', artist: 'Coriander', album: 'Low Sun', dur: 271 },
  { title: 'Held Breath', artist: 'Anouk Rey', album: 'Held Breath', dur: 224 },
];

export const MOCK_ROOMS = [
  { id: 'living', name: 'Living Room', uuid: 'RINCON_MOCKLIVING01400' },
  { id: 'kitchen', name: 'Kitchen', uuid: 'RINCON_MOCKKITCHEN01400' },
  { id: 'studio', name: 'Studio', uuid: 'RINCON_MOCKSTUDIO01400' },
  { id: 'bedroom', name: 'Bedroom', uuid: 'RINCON_MOCKBEDROOM01400' },
  { id: 'patio', name: 'Patio', uuid: 'RINCON_MOCKPATIO01400' },
  { id: 'bath', name: 'Bath', uuid: 'RINCON_MOCKBATH01400' },
] as const;
