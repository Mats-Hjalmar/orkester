// NodeCredentialStore — a CredentialStore backed by ~/.config/orkester/auth.json.
//
// Node-only (it imports node:fs/node:path/node:os); lives under src/node/** so
// the RN-no-node guard never sees it. It deliberately reads/writes the SAME file
// the Go CLI uses (config/store.go), so linking via the CLI and searching via a
// Node host (Electron, scripts) share one token.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CredentialStore, SpotifyAuth } from '../api';

/** ~/.config/orkester, honoring XDG_CONFIG_HOME like Go's os.UserConfigDir. */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'orkester');
}

function authPath(): string {
  return join(configDir(), 'auth.json');
}

/** A config file's text, or null when it doesn't exist. Any other read error propagates. */
export function readConfigFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Writes pretty-printed JSON via tmp + rename, so a crash never leaves a half-written file. */
export function writeConfigJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

export class NodeCredentialStore implements CredentialStore {
  async load(): Promise<SpotifyAuth | null> {
    // Absent file => "not linked yet" (null), not an error.
    const data = readConfigFile(authPath());
    if (data === null) return null;
    const auth = JSON.parse(data) as SpotifyAuth;
    if (!auth.accountSn) auth.accountSn = '1';
    return auth;
  }

  async save(auth: SpotifyAuth): Promise<void> {
    writeConfigJson(authPath(), auth);
  }
}
