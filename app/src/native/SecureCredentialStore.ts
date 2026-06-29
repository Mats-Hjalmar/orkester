// RN CredentialStore for the Spotify SMAPI token — the mobile counterpart of the
// Node host's NodeCredentialStore. Without this injected into SonosApi, every
// Spotify method throws "Spotify support is not configured", which is why search
// did nothing on a device. The token carries a privateKey (a secret), so it lives
// in the OS keychain/keystore via expo-secure-store, not AsyncStorage/plaintext.

import * as SecureStore from 'expo-secure-store';
import type { CredentialStore, SpotifyAuth } from '@orkester/core/api';

// SecureStore keys allow only [A-Za-z0-9._-].
const KEY = 'orkester_spotify_auth';

export class SecureCredentialStore implements CredentialStore {
  async load(): Promise<SpotifyAuth | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as SpotifyAuth;
    } catch (e) {
      // A corrupt entry would otherwise wedge isSpotifyLinked() forever with no
      // recovery. Clear it and surface the problem (not a silent swallow) so the
      // user simply re-links rather than being stuck.
      // eslint-disable-next-line no-console
      console.warn('[spotify] stored auth was unreadable; clearing it to allow re-link:', e);
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
  }

  async save(auth: SpotifyAuth): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(auth));
  }
}
