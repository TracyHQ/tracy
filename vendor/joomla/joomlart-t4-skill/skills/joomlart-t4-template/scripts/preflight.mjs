#!/usr/bin/env node
// Read-only capability inventory. A binary's presence never proves a service works.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('preflight.sh [--root <Joomla root>]'); process.exit(0); }
if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Use --root <Joomla root>');
const root = args[1] ? resolve(args[1]) : null;
const binaries = Object.fromEntries(['node','php','npm','git','sass','ddev','docker'].map(name => {
  const r = spawnSync('sh', ['-c', 'command -v "$1"', 'probe', name], { encoding: 'utf8', timeout: 3000 });
  return [name, r.status === 0 ? r.stdout.trim() : null];
}));
const require = createRequire(join(skill, 'package.json'));
const dependencies = Object.fromEntries(['jsdom','playwright','sass'].map(name => {
  try { return [name, require.resolve(name)]; } catch { return [name, null]; }
}));
const resources = Object.fromEntries(['references','scripts'].map(name => [name, existsSync(join(skill, name))]));
const assetRoots = [join(skill, 'assets'), resolve(skill, '../../assets')];
const assets = assetRoots.find(p => existsSync(join(p, 't4/t4-framework-for-joomla-6.zip'))) ?? null;
const joomla = root ? existsSync(join(root, 'configuration.php')) && existsSync(join(root, 'includes/defines.php')) : false;
const t4 = joomla && existsSync(join(root, 'plugins/system/t4/t4.xml'));
let chromium = null;
if (dependencies.playwright) {
  const pw = await import(dependencies.playwright);
  const executable = (pw.chromium ?? pw.default.chromium).executablePath();
  chromium = existsSync(executable) ? executable : null;
}
const phase = (ready, missing) => ({ status: ready ? 'ready' : 'blocked', missing: ready ? [] : missing });
console.log(JSON.stringify({
  scope: 'current execution environment only', skill, version: JSON.parse(readFileSync(join(skill,'package.json'))).version,
  cwd: process.cwd(), root, binaries, dependencies, resources, assets,
  target: { joomla, t4Manifest: t4, enabledInDatabase: 'not checked' },
  phases: {
    analysis: { status: 'ready' },
    ingest: phase(dependencies.jsdom, ['jsdom: run npm ci in the skill directory']),
    compile: phase(dependencies.sass || binaries.sass, ['Sass']),
    render: phase(chromium, ['Playwright Chromium executable; an available browser tool is an alternative']),
    editInstalledSite: phase(joomla && t4 && binaries.php, ['authorized Joomla root, T4 manifest and PHP']),
    provision: { status: 'needs-review', note: 'Use the selected quickstart and authorized target. Docker/DDEV presence alone proves no running service.' }
  },
  browserExecutable: chromium,
  note: 'Ready means local prerequisites exist, not that the build or browser has passed verification. No services were started.'
}, null, 2));
