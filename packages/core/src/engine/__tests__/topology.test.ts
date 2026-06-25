import { describe, expect, it } from 'vitest';
import {
  AmbiguousError,
  coordinatorIP,
  groupName,
  parseZoneGroupState,
  resolve,
  rooms,
  slug,
  type Group,
  type Household,
  type Member,
} from '../topology';

// Ported from backend/internal/sonos/topology_test.go. Same fixtures, same
// expectations, adapted to the fast-xml-parser engine. parseTagValue:false
// keeps SoftwareVersion ("15.9") and the Invisible "1"/"0" flag as Go-faithful
// strings.

// Representative inner ZoneGroupState XML (already unescaped, as it appears
// after extracting the SOAP output arg). Two groups: a grouped pair coordinated
// by the Living Room, and a standalone Kitchen. Includes an invisible bonded
// surround to exercise the Invisible flag.
const sampleZoneGroupState = `<ZoneGroupState>
  <ZoneGroups>
    <ZoneGroup Coordinator="RINCON_AAAAAAAAAAAA01400" ID="RINCON_AAAAAAAAAAAA01400:42">
      <ZoneGroupMember UUID="RINCON_AAAAAAAAAAAA01400" Location="http://192.168.1.10:1400/xml/device_description.xml" ZoneName="Living Room" SoftwareVersion="15.9" Invisible="0"/>
      <ZoneGroupMember UUID="RINCON_BBBBBBBBBBBB01400" Location="http://192.168.1.11:1400/xml/device_description.xml" ZoneName="Bedroom" SoftwareVersion="15.9" Invisible="0"/>
      <ZoneGroupMember UUID="RINCON_CCCCCCCCCCCC01400" Location="http://192.168.1.12:1400/xml/device_description.xml" ZoneName="Living Room (Sub)" SoftwareVersion="15.9" Invisible="1"/>
    </ZoneGroup>
    <ZoneGroup Coordinator="RINCON_DDDDDDDDDDDD01400" ID="RINCON_DDDDDDDDDDDD01400:7">
      <ZoneGroupMember UUID="RINCON_DDDDDDDDDDDD01400" Location="http://192.168.1.13:1400/xml/device_description.xml" ZoneName="Kitchen" SoftwareVersion="15.9" Invisible="0"/>
    </ZoneGroup>
  </ZoneGroups>
  <VanishedDevices/>
</ZoneGroupState>`;

describe('parseZoneGroupState', () => {
  it('parses groups, members, coordinatorIP, name and invisible flag', () => {
    const hh = parseZoneGroupState(sampleZoneGroupState);
    expect(hh.groups).toHaveLength(2);

    let living: Group | undefined;
    let kitchen: Group | undefined;
    for (const g of hh.groups) {
      if (g.coordinator === 'RINCON_AAAAAAAAAAAA01400') living = g;
      if (g.coordinator === 'RINCON_DDDDDDDDDDDD01400') kitchen = g;
    }
    expect(living).toBeDefined();
    expect(kitchen).toBeDefined();

    // Grouped pair has 3 members (including the invisible Sub).
    expect(living!.members).toHaveLength(3);

    // Coordinator IP resolution.
    expect(coordinatorIP(living!)).toBe('192.168.1.10');

    // Group name: Bedroom is visible (+1); the Sub is invisible and excluded.
    expect(groupName(living!)).toBe('Living Room +1');
    expect(groupName(kitchen!)).toBe('Kitchen');

    // Invisible flag parsed correctly on the Sub.
    const sub = living!.members.find((m) => m.uuid === 'RINCON_CCCCCCCCCCCC01400');
    expect(sub).toBeDefined();
    expect(sub!.invisible).toBe(true);
  });
});

describe('slug', () => {
  it('matches the Go TestSlug table', () => {
    const cases: Record<string, string> = {
      'Living Room': 'living-room', // simple + space
      'Café Lärka': 'cafe-larka', // é, ä fold
      'Smörgås Åker': 'smorgas-aker', // ö, å fold
      'GUEST 5G': 'guest-5g', // uppercase + digit
      '  Spaced  Out  ': 'spaced-out', // collapse + trim
      '-Weird Room-': 'weird-room', // never leads/trails with '-'
      'Søndag Øl': 'sondag-ol', // ø fold
      'Café & Bar': 'cafe-bar',
      日本語: '', // all-unmapped -> empty (rooms adds fallback)
    };
    for (const [input, want] of Object.entries(cases)) {
      expect(slug(input)).toBe(want);
    }
  });
});

// roomHousehold builds a household: a stereo pair (Living Room, with an
// invisible secondary sharing the name) grouped with Bedroom, plus a standalone
// Kitchen.
function roomHousehold(): Household {
  const mk = (uuid: string, zoneName: string, ip: string, invisible = false): Member => ({
    uuid,
    zoneName,
    ip,
    location: '',
    softwareVersion: '',
    invisible,
  });
  return {
    groups: [
      {
        id: 'g1',
        coordinator: 'RINCON_LR01400',
        members: [
          mk('RINCON_LR01400', 'Living Room', '10.0.0.1'),
          mk('RINCON_BR01400', 'Bedroom', '10.0.0.2'),
          // Stereo-pair secondary: same ZoneName, invisible.
          mk('RINCON_LR201400', 'Living Room', '10.0.0.3', true),
        ],
      },
      {
        id: 'g2',
        coordinator: 'RINCON_K01400',
        members: [mk('RINCON_K01400', 'Kitchen', '10.0.0.4')],
      },
    ],
  };
}

describe('rooms()', () => {
  it('excludes invisible members and maps handles to zone names', () => {
    const refs = rooms(roomHousehold());

    const got: Record<string, string> = {};
    for (const r of refs) {
      expect(r.member.invisible).toBe(false);
      got[r.handle] = r.member.zoneName;
    }
    expect(got).toEqual({
      bedroom: 'Bedroom',
      kitchen: 'Kitchen',
      'living-room': 'Living Room',
    });
  });

  it('disambiguates handle collisions and avoids reserved names', () => {
    const hh: Household = {
      groups: [
        {
          id: 'g1',
          coordinator: 'RINCON_A01400',
          members: [
            { uuid: 'RINCON_A01400', zoneName: 'Office', ip: '', location: '', softwareVersion: '', invisible: false }, // -> office
          ],
        },
        {
          id: 'g2',
          coordinator: 'RINCON_B01400',
          members: [
            { uuid: 'RINCON_B01400', zoneName: 'Office', ip: '', location: '', softwareVersion: '', invisible: false }, // collision -> office-2
          ],
        },
        {
          id: 'g3',
          coordinator: 'RINCON_C01400',
          members: [
            { uuid: 'RINCON_C01400', zoneName: 'Play', ip: '', location: '', softwareVersion: '', invisible: false }, // reserved -> play-2
          ],
        },
      ],
    };

    const handles = new Set<string>();
    for (const r of rooms(hh)) {
      expect(handles.has(r.handle)).toBe(false); // no duplicates
      handles.add(r.handle);
    }
    expect(handles.has('office')).toBe(true);
    expect(handles.has('office-2')).toBe(true);
    expect(handles.has('play-2')).toBe(true);
    // Reserved handle "play" must never be assigned to a room.
    expect(handles.has('play')).toBe(false);
  });
});

describe('resolve()', () => {
  it('resolves exact/substring queries and throws on ambiguous/none', () => {
    const hh = roomHousehold(); // rooms: living-room, bedroom (grouped), kitchen

    // Exact handle -> the visible primary, never the invisible secondary.
    const lr = resolve(hh, 'living-room');
    expect(lr.member.uuid).toBe('RINCON_LR01400');
    expect(lr.member.invisible).toBe(false);

    // Exact name, case-insensitive.
    expect(resolve(hh, 'KITCHEN').member.uuid).toBe('RINCON_K01400');

    // Unique substring "just works".
    expect(resolve(hh, 'bed').member.uuid).toBe('RINCON_BR01400');
    expect(resolve(hh, 'kit').member.uuid).toBe('RINCON_K01400');

    // Ambiguous substring ("room" is in both living-room and bedroom).
    expect(() => resolve(hh, 'room')).toThrow(/matches/);
    expect(() => resolve(hh, 'room')).toThrow(AmbiguousError);

    // No match lists the rooms.
    expect(() => resolve(hh, 'garage')).toThrow(/bedroom/);
  });
});
