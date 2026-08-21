#!/usr/bin/env node
/**
 * Installs the packaged Orkester.app into the Applications folder (APPS_DIR,
 * default /Applications). Pass --uninstall to remove it again.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'Orkester';
const BUNDLE = `${APP}.app`;

if (process.platform !== 'darwin') {
  throw new Error(`Only macOS is supported here; this is ${process.platform}.`);
}

const appsDir = (process.env.APPS_DIR ?? '/Applications').replace(/^~(?=$|\/)/, homedir());
const dest = join(resolve(appsDir), BUNDLE);
const uninstall = process.argv.includes('--uninstall');

const isRunning = () => spawnSync('pgrep', ['-x', APP]).status === 0;

if (isRunning()) {
  console.log(`Quitting the running ${APP}…`);
  execFileSync('osascript', ['-e', `quit app "${APP}"`]);
  const deadline = Date.now() + 10_000;
  while (isRunning()) {
    if (Date.now() > deadline) throw new Error(`${APP} did not quit; quit it and re-run.`);
    spawnSync('sleep', ['0.25']);
  }
}

if (uninstall) {
  if (!existsSync(dest)) throw new Error(`Nothing to uninstall: ${dest} does not exist.`);
  rmSync(dest, { recursive: true });
  console.log(`Removed ${dest}`);
  process.exit(0);
}

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archDir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const source = join(desktopDir, 'release', archDir, BUNDLE);
if (!existsSync(source)) throw new Error(`No packaged app at ${source} — build it first (app:mac).`);

rmSync(dest, { recursive: true, force: true });
// ditto, not cp -R: it preserves the symlinks, xattrs and resource forks a signed
// bundle's code signature is computed over.
execFileSync('ditto', [source, dest]);
console.log(`Installed ${dest} — launch it from Launchpad or: open -a ${APP}`);
