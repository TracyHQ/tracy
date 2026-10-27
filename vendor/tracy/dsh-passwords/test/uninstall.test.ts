import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const uninstallScript = path.join(projectRoot, 'scripts', 'uninstall.mjs');
const registerScript = path.join(projectRoot, 'scripts', 'register-plugin.mjs');

function commandEnvironment(binDir: string): NodeJS.ProcessEnv {
  const inheritedPath = process.env.Path ?? process.env.PATH ?? '';
  const nextPath = `${binDir}${path.delimiter}${inheritedPath}`;
  // Windows process environments are case-insensitive, but Node can retain both
  // spellings. Set both so cmd.exe resolves the test shim before global pnpm.
  return { ...process.env, PATH: nextPath, Path: nextPath };
}

test('uninstall restores manifest, lockfile, and node_modules when pnpm reconciliation fails', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-uninstall-'));
  const dshHome = path.join(root, 'dsh-home');
  const profile = path.join(dshHome, 'profiles', 'web');
  const bin = path.join(root, 'bin');
  const manifest = path.join(profile, 'package.json');
  const lock = path.join(profile, 'pnpm-lock.yaml');
  const modulesMarker = path.join(profile, 'node_modules', 'unrelated-plugin', 'marker.txt');
  mkdirSync(path.dirname(modulesMarker), { recursive: true });
  mkdirSync(bin, { recursive: true });

  const originalManifest = JSON.stringify({
    name: 'dsh-profile-web',
    dependencies: { 'dsh-passwords': `link:${projectRoot}`, 'unrelated-plugin': '1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-passwords', 'unrelated-plugin'] } },
  }, undefined, 2) + '\n';
  writeFileSync(manifest, originalManifest);
  writeFileSync(lock, 'lockfileVersion: 9.0\npackages: {}\n');
  writeFileSync(modulesMarker, 'must survive failed reconciliation\n');

  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'pnpm.cmd'), '@echo off\r\nexit /b 19\r\n');
  } else {
    writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 19\n', { mode: 0o755 });
  }

  try {
    const result = spawnSync(process.execPath, [uninstallScript], {
      env: { ...commandEnvironment(bin), DSH_HOME: dshHome },
      encoding: 'utf8',
    });
    assert.equal(result.status, 19, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /restored package\.json, pnpm-lock\.yaml, and node_modules/);
    assert.equal(readFileSync(manifest, 'utf8'), originalManifest);
    assert.equal(readFileSync(lock, 'utf8'), 'lockfileVersion: 9.0\npackages: {}\n');
    assert.equal(readFileSync(modulesMarker, 'utf8'), 'must survive failed reconciliation\n');
    assert.equal(
      readFileSync(manifest, 'utf8').includes('dsh-passwords'),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('register-plugin 经安全 cmd shim（非 shell:true）调用 pnpm 并传播退出码', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-register-'));
  const dshHome = path.join(root, 'dsh-home');
  const profile = path.join(dshHome, 'profiles', 'web');
  const bin = path.join(root, 'bin');
  const marker = path.join(root, 'pnpm-argv.txt');
  mkdirSync(bin, { recursive: true });
  // 假 pnpm shim 记录收到的参数并以 0 退出，证明脚本确实经由 pnpm shim 调用。
  // 若回退到 shell:true，Node 22+ 会在 stderr 打印 DEP0190 弃用警告。
  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'pnpm.cmd'), `@echo off\r\necho %* > "${marker}"\r\nexit /b 0\r\n`);
  } else {
    writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\necho "$@" > "${marker}"\nexit 0\n`, { mode: 0o755 });
  }
  try {
    const result = spawnSync(process.execPath, [registerScript], {
      env: { ...commandEnvironment(bin), DSH_HOME: dshHome },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /DEP0190/, '不得再以 shell:true 调用 pnpm');
    assert.equal(readFileSync(marker, 'utf8').trim().replace(/"/g, ''), 'install');
    const manifest = JSON.parse(readFileSync(path.join(profile, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies['dsh-passwords'], `link:${projectRoot}`);
    assert.ok(manifest.dsh.profile.bundles.includes('dsh-passwords'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uninstall succeeds in English when DSH is already absent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-uninstall-nodsh-'));
  const dshHome = path.join(root, 'dsh-home');
  const profile = path.join(dshHome, 'profiles', 'web');
  const bin = path.join(root, 'bin');
  mkdirSync(profile, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'dsh-passwords': `link:${projectRoot}` },
    dsh: { profile: { bundles: ['dsh-passwords'] } },
  }) + '\n');
  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'pnpm.cmd'), '@echo off\r\nexit /b 0\r\n');
  } else {
    writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  const envFile = path.join(root, '.env');
  writeFileSync(envFile, [
    'SETUP_KEY=test-setup-key',
    `MCP_DSH_ROOT=${path.join(root, 'absent-dsh')}`,
  ].join('\n') + '\n');
  try {
    const result = spawnSync(process.execPath, [uninstallScript], {
      env: {
        ...commandEnvironment(bin),
        DSH_HOME: dshHome,
        DSH_PASSWORDS_ENV_FILE: envFile,
        LANG: 'en_US.UTF-8',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const updated = JSON.parse(readFileSync(path.join(profile, 'package.json'), 'utf8'));
    assert.equal(updated.dependencies?.['dsh-passwords'], undefined);
    assert.deepEqual(updated.dsh.profile.bundles, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
