import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '..');
const repoRoot = resolve(apiRoot, '../..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(apiRoot, '.env'));
loadEnvFile(resolve(apiRoot, '.env.local'));

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/prisma-with-env.mjs <prisma command...>');
  process.exit(1);
}

const workspacePrismaCli = resolve(apiRoot, 'node_modules/prisma/build/index.js');
const rootPrismaCli = resolve(repoRoot, 'node_modules/prisma/build/index.js');
const prismaCli = existsSync(workspacePrismaCli) ? workspacePrismaCli : rootPrismaCli;

function ensureWorkspaceClientLink() {
  const workspaceClientDir = resolve(apiRoot, 'node_modules/@prisma/client');
  const rootClientDir = resolve(repoRoot, 'node_modules/@prisma/client');

  if (existsSync(workspaceClientDir) || !existsSync(rootClientDir)) {
    return;
  }

  // Prisma generate resolves the client from the API workspace in compose builds.
  mkdirSync(resolve(apiRoot, 'node_modules/@prisma'), { recursive: true });
  symlinkSync(rootClientDir, workspaceClientDir, 'dir');
}

ensureWorkspaceClientLink();

const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: apiRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
