// ContentDirectory browse results and AlarmClock alarm lists.
//
// Pure parsing over the strings the device returns: a Browse `Result` is a
// DIDL-Lite document, a ListAlarms `CurrentAlarmList` is an `<Alarms>` XML
// document. node-free: part of the RN-facing engine surface.

import type { AlarmClockCreateAlarmRequest } from '@orkester/sonos-api';
import { makeParser, escapeXMLText } from './soap';
import { asArray, textOf } from './xml';
import { resolveAlbumArt } from './control';

/** One entry of a ContentDirectory browse: a playable item or a browsable container. */
export interface BrowseItem {
  /** ContentDirectory object id, e.g. `FV:2/12`, `SQ:3`, `A:ALBUM/Abbey Road`. */
  id: string;
  /** Object id of the container this entry lives in. */
  parentId: string;
  /** Display title (track, album, station, playlist or favorite name). */
  title: string;
  /** Artist or creator, "" if none. */
  artist: string;
  /** Album name, "" if none. */
  album: string;
  /** Absolute album-art URL resolved against the browsed device, "" if none. */
  albumArtUrl: string;
  /** The DIDL `upnp:class`, e.g. `object.container.playlistContainer`. */
  upnpClass: string;
  /** True for a DIDL `<container>` (browsable into). */
  isContainer: boolean;
  /** The playable `res` URI, "" when the entry carries none. */
  uri: string;
  /** DIDL-Lite metadata to send alongside `uri` when playing or enqueuing. */
  metadata: string;
}

/** One page of a browse, plus how many entries the container holds in total. */
export interface BrowseResult {
  /** The entries of this page, containers first. */
  items: BrowseItem[];
  /** How many entries the container holds in total, across all pages. */
  total: number;
}

/** An alarm's recurrence: a named schedule or `ON_` followed by weekday digits (0 = Sunday). */
export type AlarmRecurrence = AlarmClockCreateAlarmRequest['Recurrence'] | `ON_${string}`;

/** An alarm's play mode. */
export type AlarmPlayMode = AlarmClockCreateAlarmRequest['PlayMode'];

/** One household alarm as the AlarmClock service stores it. */
export interface Alarm {
  /** The alarm's id in the AlarmClock service. */
  id: number;
  /** Local start time, `HH:MM:SS`. */
  startTime: string;
  /** How long the alarm plays, `HH:MM:SS`. */
  duration: string;
  /** Which days the alarm fires on. */
  recurrence: AlarmRecurrence;
  /** Whether the alarm is armed. */
  enabled: boolean;
  /** RINCON UUID of the player the alarm sounds on. */
  roomUuid: string;
  /** What plays: `x-rincon-buzzer:0` for the chime, or a content URI. */
  programUri: string;
  /** DIDL-Lite metadata for `programUri`, "" for the chime. */
  programMetadata: string;
  /** Shuffle/repeat mode the alarm plays in. */
  playMode: AlarmPlayMode;
  /** Volume the alarm plays at, 0–100. */
  volume: number;
  /** Whether the players grouped with the room also sound. */
  includeLinkedZones: boolean;
}

/**
 * Builds the minimal DIDL-Lite metadata Sonos accepts for enqueuing a local
 * ContentDirectory object (library track/album, Sonos playlist).
 */
export function browseItemDIDL(item: Pick<BrowseItem, 'id' | 'parentId' | 'title' | 'upnpClass'>): string {
  return (
    DIDL_OPEN +
    `<item id="${escapeXMLText(item.id)}" parentID="${escapeXMLText(item.parentId)}" restricted="true">` +
    `<dc:title>${escapeXMLText(item.title)}</dc:title>` +
    `<upnp:class>${escapeXMLText(item.upnpClass)}</upnp:class>` +
    '<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">RINCON_AssociatedZPUDN</desc>' +
    '</item></DIDL-Lite>'
  );
}

/**
 * Parses a Browse `Result` DIDL-Lite document into its containers then items.
 * Album art is resolved against `deviceBase`. THROWS on malformed DIDL.
 */
export function parseBrowseResult(didl: string, deviceBase: string): BrowseItem[] {
  if (didl.trim() === '') return [];
  const parsed = makeParser().parse(didl) as Record<string, unknown>;
  const root = parsed['DIDL-Lite'] as Record<string, unknown> | undefined;
  if (root === undefined) {
    throw new Error('browse result is not a DIDL-Lite document');
  }
  return [
    ...asArray(root.container).map((n) => browseItem(n as Record<string, unknown>, true, deviceBase)),
    ...asArray(root.item).map((n) => browseItem(n as Record<string, unknown>, false, deviceBase)),
  ];
}

/** Parses a ListAlarms `CurrentAlarmList` document. THROWS on a malformed list. */
export function parseAlarmList(xml: string): Alarm[] {
  const parsed = makeParser().parse(xml) as { Alarms?: { Alarm?: unknown } | string };
  if (parsed.Alarms === undefined) {
    throw new Error('alarm list has no Alarms element');
  }
  if (typeof parsed.Alarms !== 'object') return [];
  return asArray(parsed.Alarms.Alarm).map((raw) => {
    const a = raw as Record<string, unknown>;
    const attr = (name: string) => textOf(a[`@_${name}`]);
    return {
      id: Number(attr('ID')),
      startTime: attr('StartTime'),
      duration: attr('Duration'),
      recurrence: attr('Recurrence') as AlarmRecurrence,
      enabled: attr('Enabled') === '1',
      roomUuid: attr('RoomUUID'),
      programUri: attr('ProgramURI'),
      programMetadata: attr('ProgramMetaData'),
      playMode: attr('PlayMode') as AlarmPlayMode,
      volume: Number(attr('Volume')),
      includeLinkedZones: attr('IncludeLinkedZones') === '1',
    };
  });
}

/** Projects one parsed DIDL `<item>`/`<container>` node to a BrowseItem. */
function browseItem(node: Record<string, unknown>, isContainer: boolean, deviceBase: string): BrowseItem {
  const artist = textOf(node.artist).trim() || textOf(node.creator).trim();
  const base = {
    id: textOf(node['@_id']),
    parentId: textOf(node['@_parentID']),
    title: textOf(node.title).trim(),
    upnpClass: textOf(node.class).trim(),
  };
  const resMD = textOf(node.resMD).trim();
  return {
    ...base,
    artist,
    album: textOf(node.album).trim(),
    albumArtUrl: resolveAlbumArt(deviceBase, textOf(asArray(node.albumArtURI)[0])),
    isContainer,
    uri: textOf(asArray(node.res)[0]).trim(),
    metadata: resMD !== '' ? resMD : browseItemDIDL(base),
  };
}

/** Opening tag of a DIDL-Lite document with every namespace Sonos uses. */
const DIDL_OPEN =
  '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">';
