#!/usr/bin/env node
// Safely remove this installation from a DSH web profile. The package directory,
// .env, database, certificates, and all unrelated plugins are intentionally kept.
import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, lstatSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * 运行 pnpm。Windows 上 pnpm 只是 `.cmd` shim，Node >=22（含 24）为修复
 * CVE-2024-27980 已拒绝 shell:false 直接执行 .cmd/.bat，而 shell:true 又会触发
 * DEP0190 且存在参数拼接注入面。因此用 cmd.exe 显式启动 shim：
 * `cmd /d /s /c pnpm.cmd install`（不经 shell:true）。
 * 注意不能给命令串再加一层引号：Node 会把内层引号转义成 \"，cmd /s 剥壳后
 * 得到非法命令，因此这里只接受不含引号/百分号/空白的固定字面量参数，否则 fail-closed。
 */
function runPnpm(args, cwd) {
  if (process.platform !== 'win32') return spawnSync('pnpm', args, { cwd, stdio: 'inherit' });
  if (args.some((arg) => /["%\s]/.test(arg))) {
    return { error: new Error('pnpm 参数不安全，已拒绝执行'), status: null };
  }
  const line = ['pnpm.cmd', ...args].join(' ');
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line], { cwd, stdio: 'inherit' });
}

const installRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const dshHome = process.env.DSH_HOME?.trim() || path.join(homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', 'web');
const manifestPath = path.join(profileDir, 'package.json');

if (!existsSync(manifestPath)) {
  console.log('[dsh-passwords] profile is already absent');
  process.exit(0);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`[dsh-passwords] invalid profile manifest: ${String(error)}`);
  process.exit(1);
}

const dependency = manifest?.dependencies?.['dsh-passwords'];
if (typeof dependency === 'string' && dependency.startsWith('link:')) {
  const linked = dependency.slice('link:'.length);
  try {
    if (realpathSync(linked) !== installRoot) {
      console.error('[dsh-passwords] profile points to a different installation; refusing to remove it');
      process.exit(1);
    }
  } catch {
    console.error('[dsh-passwords] profile link is stale or unreadable; remove it manually after verifying its owner');
    process.exit(1);
  }
}

const transactionId = `${process.pid}-${Date.now()}`;
const manifestBackup = `${manifestPath}.bak-dshpw-uninstall-${transactionId}`;
const lockPath = path.join(profileDir, 'pnpm-lock.yaml');
const lockBackup = `${lockPath}.bak-dshpw-uninstall-${transactionId}`;
const modulesPath = path.join(profileDir, 'node_modules');
const modulesBackup = `${modulesPath}.bak-dshpw-uninstall-${transactionId}`;

// Move the old materialized state out of the way before reconciliation. This makes
// a failed pnpm run recoverable without relying on pnpm to reconstruct the old tree.
writeFileSync(manifestBackup, readFileSync(manifestPath));
if (existsSync(lockPath)) renameSync(lockPath, lockBackup);
if (existsSync(modulesPath)) renameSync(modulesPath, modulesBackup);

function replaceFile(source, target) {
  const displaced = `${target}.displaced-${transactionId}`;
  if (existsSync(target)) renameSync(target, displaced);
  renameSync(source, target);
  if (existsSync(displaced)) unlinkSync(displaced);
}

function restoreMaterializedState() {
  if (existsSync(manifestBackup)) replaceFile(manifestBackup, manifestPath);
  if (existsSync(lockBackup)) replaceFile(lockBackup, lockPath);
  else if (existsSync(lockPath)) unlinkSync(lockPath);
  if (existsSync(modulesBackup)) {
    if (existsSync(modulesPath)) rmSync(modulesPath, { recursive: true, force: true });
    renameSync(modulesBackup, modulesPath);
  } else if (existsSync(modulesPath)) {
    rmSync(modulesPath, { recursive: true, force: true });
  }
}

function discardMaterializedBackup() {
  if (existsSync(manifestBackup)) unlinkSync(manifestBackup);
  if (existsSync(lockBackup)) unlinkSync(lockBackup);
  if (existsSync(modulesBackup)) {
    // The backup is a directory or symlink; avoid recursive deletion here. It is
    // removed only after pnpm has successfully created the replacement tree.
    if (lstatSync(modulesBackup).isSymbolicLink()) unlinkSync(modulesBackup);
    else rmSync(modulesBackup, { recursive: true, force: true });
  }
}
if (manifest.dependencies?.['dsh-passwords'] !== undefined) delete manifest.dependencies['dsh-passwords'];
const bundles = manifest?.dsh?.profile?.bundles;
if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== 'dsh-passwords');
writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n');

const installed = runPnpm(['install'], profileDir);
if (installed.status !== 0 || installed.error !== undefined) {
  try {
    restoreMaterializedState();
    console.error('[dsh-passwords] profile dependency reconciliation failed; restored package.json, pnpm-lock.yaml, and node_modules');
  } catch (restoreError) {
    console.error(`[dsh-passwords] profile reconciliation failed and state restoration failed: ${String(restoreError)}`);
  }
  process.exit(installed.status ?? 1);
}

const rollback = spawnSync(process.execPath, [path.join(installRoot, 'dist', 'cli.js'), 'patch', 'off', '--no-restart'], {
  cwd: installRoot,
  stdio: 'pipe',
  encoding: 'utf8',
});
const rollbackOutput = `${rollback.stdout ?? ''}${rollback.stderr ?? ''}`;
// cli patch uses stable exit code 34 when DSH is already absent. Do not parse
// localized output here: LANG must not change uninstall behavior.
const noDshRoot = rollback.status === 34;
if (rollback.status !== 0 && !noDshRoot) {
  try {
    restoreMaterializedState();
  } catch (restoreError) {
    process.stderr.write(rollbackOutput);
    console.error(`[dsh-passwords] patch rollback failed and profile restoration failed: ${String(restoreError)}`);
    process.exit(rollback.status ?? 1);
  }
  process.stderr.write(rollbackOutput);
  console.error('[dsh-passwords] patch rollback failed; restored the original profile materialized state');
  process.exit(rollback.status ?? 1);
}
if (rollback.status === 0 || noDshRoot) process.stdout.write(rollbackOutput);

discardMaterializedBackup();
console.log('[dsh-passwords] unregistered from the web profile; restart dsh-web to load the restored bundles');
