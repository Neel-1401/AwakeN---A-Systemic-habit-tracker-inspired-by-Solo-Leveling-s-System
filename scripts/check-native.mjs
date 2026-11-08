// Checks that better-sqlite3 loads in both runtimes this project uses:
// plain Node (Vitest) and Electron (the app). No build step is needed because
// better-sqlite3 13 is a Node-API module: one prebuilt binary works in both.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron'); // in Node, this is the path to electron.exe

const probe = `
  const Database = require('better-sqlite3');
  const { v } = new Database(':memory:').prepare('select sqlite_version() as v').get();
  const runtime = process.versions.electron ? 'Electron ' + process.versions.electron : 'Node ' + process.version;
  console.log('  ok  ' + runtime + ' (ABI ' + process.versions.modules + '), SQLite ' + v);
`;

const runtimes = [
  ['Node', process.execPath, {}],
  // ELECTRON_RUN_AS_NODE makes Electron behave like plain Node, with its own ABI.
  ['Electron', electronBinary, { ELECTRON_RUN_AS_NODE: '1' }],
];

for (const [name, command, env] of runtimes) {
  const result = spawnSync(command, ['-e', probe], {
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`better-sqlite3 failed to load in ${name}.`);
    process.exit(1);
  }
}
