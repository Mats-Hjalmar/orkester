import { Track } from './types';

// The fictional Noira catalogue. Covers are drawn, not photographed: a warm
// pastel field (coverBg) with a single circle/arc "motif" shape (coverShape).
export const LIBRARY: Track[] = [
  { id: 't1', title: 'Amber Hours', artist: 'Lena Sorel', album: 'Amber Hours', year: '2024', cat: 'NOI-114', dur: 218, coverBg: '#F9D8A6', coverShape: '#C99A6E' },
  { id: 't2', title: 'Soft Static', artist: 'Hiro Tanaka', album: 'Soft Static', year: '2023', cat: 'NOI-088', dur: 252, coverBg: '#C3ECFD', coverShape: '#6E96A4' },
  { id: 't3', title: 'Quiet Rooms', artist: 'The Morning Editions', album: 'Quiet Rooms', year: '2025', cat: 'NOI-201', dur: 196, coverBg: '#D0E0C9', coverShape: '#7E9170' },
  { id: 't4', title: 'Paper Light', artist: 'Esi Mensah', album: 'Paper Light', year: '2022', cat: 'NOI-076', dur: 234, coverBg: '#FDF787', coverShape: '#A89A4E' },
  { id: 't5', title: 'Long Exhale', artist: 'Nils Berg Trio', album: 'Long Exhale', year: '2024', cat: 'NOI-130', dur: 305, coverBg: '#D4C7E6', coverShape: '#8A7BA2' },
  { id: 't6', title: 'Field Notes', artist: 'Mara Vidal', album: 'Field Notes', year: '2023', cat: 'NOI-095', dur: 188, coverBg: '#FAE1F0', coverShape: '#C9919A' },
  { id: 't7', title: 'Low Sun', artist: 'Coriander', album: 'Low Sun', year: '2025', cat: 'NOI-210', dur: 271, coverBg: '#ECE7DC', coverShape: '#C99A6E' },
  { id: 't8', title: 'Held Breath', artist: 'Anouk Rey', album: 'Held Breath', year: '2024', cat: 'NOI-142', dur: 224, coverBg: '#D4C7E6', coverShape: '#8A7BA2' },
];

export const ROOMS = [
  { id: 'living', name: 'Living Room' },
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'studio', name: 'Studio' },
  { id: 'bedroom', name: 'Bedroom' },
  { id: 'patio', name: 'Patio' },
  { id: 'bath', name: 'Bath' },
];

export const HOME_MORNING = ['t1', 't3', 't4', 't6', 't2'];
export const HOME_RECENT = ['t5', 't7', 't8', 't2', 't6'];
