// Runs `electron-vite dev`. On macOS it first points it at a renamed copy of the
// stock Electron.app: the menu bar, dock and ⌘-Tab take a dev run's name from the
// bundle (its folder name and Info.plist), which the app can't change at runtime.
// The copy is an APFS clone with its own bundle id, so LaunchServices doesn't mix
// it up with Electron.app; it is rebuilt whenever the Electron version changes.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

const plist = (app) => join(app, 'Contents', 'Info.plist');
const read = (app, key) => execFileSync('plutil', ['-extract', key, 'raw', plist(app)], { encoding: 'utf8' }).trim();
const write = (app, key, value) => execFileSync('plutil', ['-replace', key, '-string', value, plist(app)]);

function devBundle() {
  // require('electron') resolves to .../Electron.app/Contents/MacOS/Electron.
  const binary = createRequire(import.meta.url)('electron');
  const stock = join(dirname(binary), '..', '..');
  const dir = join(here, '..', 'node_modules', '.cache', 'orkester-dev');
  const app = join(dir, `${pkg.productName}.app`);

  if (!existsSync(app) || read(app, 'CFBundleVersion') !== read(stock, 'CFBundleVersion')) {
    rmSync(app, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync('cp', ['-Rc', stock, app]);
    write(app, 'CFBundleName', pkg.productName);
    write(app, 'CFBundleDisplayName', pkg.productName);
    write(app, 'CFBundleIdentifier', 'com.orkester.desktop.dev');
    // Editing Info.plist breaks the bundle's seal; re-sign ad hoc so macOS accepts it.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
  }
  return join(app, 'Contents', 'MacOS', 'Electron');
}

const env = { ...process.env };
if (process.platform === 'darwin') env.ELECTRON_EXEC_PATH = devBundle();

const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', env });
child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
