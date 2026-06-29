import { describe, expect, it } from 'vitest';
import { parseAvailableServices, findService, serviceSeed } from '../musicservices';

// A trimmed AvailableServiceDescriptorList (unescaped) as ListAvailableServices
// would hand to the parser. Spotify carries the SecureUri and an AppLink policy.
const servicesXML = `<Services>
  <Service Id="9" Name="Spotify" Version="1.1" Uri="http://spotify.ws.sonos.com/smapi" SecureUri="https://spotify.ws.sonos.com/smapi" ContainerType="MService" Capabilities="2563">
    <Policy Auth="AppLink" PollInterval="30"/>
  </Service>
  <Service Id="204" Name="Apple Music" Uri="http://apple.example/smapi" SecureUri="https://apple.example/smapi">
    <Policy Auth="DeviceLink" PollInterval="30"/>
  </Service>
</Services>`;

describe('parseAvailableServices', () => {
  it('parses services and prefers the secure endpoint', () => {
    const svcs = parseAvailableServices(servicesXML);
    expect(svcs).toHaveLength(2);

    const spotify = findService(svcs, 'spotify'); // case-insensitive
    expect(spotify.id).toBe(9);
    expect(spotify.endpoint).toBe('https://spotify.ws.sonos.com/smapi');
    expect(spotify.auth).toBe('AppLink');
    expect(serviceSeed(spotify)).toBe(9 * 256 + 7);
  });

  it('throws (listing what is available) for an absent service', () => {
    const svcs = parseAvailableServices(servicesXML);
    expect(() => findService(svcs, 'Tidal')).toThrow(/Spotify, Apple Music/);
  });
});
