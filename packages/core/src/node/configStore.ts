// NodeCredentialStore — a CredentialStore backed by ~/.config/orkester/auth.json.
//
// Node-only (it imports node:fs/node:path/node:os); lives under src/node/** so
// the RN-no-node guard never sees it. It deliberately reads/writes the SAME file
// the Go CLI uses (config/store.go), so linking via the CLI and searching via a
// Node host (Electron, scripts) share one token.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CredentialStore, SpotifyAuth } from '../api';

/** ~/.config/orkester, honoring XDG_CONFIG_HOME like Go's os.UserConfigDir. */
function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'orkester');
}

function authPath(): string {
  return join(configDir(), 'auth.json');
}

export class NodeCredentialStore implements CredentialStore {
  async load(): Promise<SpotifyAuth | null> {
    let data: string;
    try {
      data = readFileSync(authPath(), 'utf8');
    } catch (err) {
      // Absent file => "not linked yet" (null), not an error. Anything else
      // (permissions, corruption) propagates.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    const auth = JSON.parse(data) as SpotifyAuth;
    if (!auth.accountSn) auth.accountSn = '1';
    return auth;
  }

  async save(auth: SpotifyAuth): Promise<void> {
    const dir = configDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = authPath();
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(auth, null, 2), { mode: 0o600 });
    renameSync(tmp, path);
  }
}
