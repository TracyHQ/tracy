#!/usr/bin/env node
// Destructive emergency cleanup helper. It runs from a temporary directory because
// the gateway and the dsh-passwords package are part of the deletion set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const planPath = process.argv[2];
let cleanupPlanDir = null;
const receipt = {
  ok: false,
  finished: false,
  ready: false,
  transactionId: null,
  startedAt: new Date().toISOString(),
  stopped: false,
  dryRun: false,
  planned: [],
  deleted: [],
  residual: [],
  errors: [],
};

function fail(message) {
  receipt.errors.push(message);
  receipt.finished = true;
  console.error(`[dsh-passwords purge] ${message}`);
  writeReceipt();
  process.exitCode = 1;
}

function writeReceipt() {
  if (typeof receipt.receiptPath !== 'string' || receipt.receiptPath === '') return;
  try {
    const output = receipt.finished
      ? { ...receipt, finishedAt: new Date().toISOString() }
      : receipt;
    const temporaryPath = `${receipt.receiptPath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporaryPath, receipt.receiptPath);
    } finally {
      try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
    }
  } catch (error) {
    receipt.errors.push(`receipt: ${String(error)}`);
  }
}

function absolute(value, name) {
  if (typeof value !== 'string' || value === '' || !path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  const normalized = path.normalize(value);
  const root = path.parse(normalized).root;
  return same(normalized, root) ? root : normalized.replace(/[\\/]+$/, '');
}

function same(a, b) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  const relative = path.relative(p, c);
  return same(c, p) || (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function uniquePaths(values) {
  const out = [];
  for (const value of values) {
    if (!out.some((existing) => same(existing, value))) out.push(value);
  }
  return out;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio ?? 'ignore',
    windowsHide: true,
    timeout: options.timeout ?? 20_000,
    encoding: 'utf8',
  });
}

const PROTECTED_SYSTEM_PATHS = process.platform === 'win32'
  ? [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData].filter((value) => typeof value === 'string' && value !== '')
  : ['/etc', '/usr', '/var', '/home', '/root', '/boot', '/bin', '/sbin', '/lib', '/lib64', '/proc', '/sys', '/dev', '/run', '/snap'];
const SYSTEMD_UNIT_DIRECTORIES = ['/etc/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system'];

function isNpmPackagePath(value, packageName) {
  const normalized = path.resolve(value);
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    return name !== undefined && path.basename(normalized).toLowerCase() === name.toLowerCase() &&
      path.basename(path.dirname(normalized)).toLowerCase() === scope.toLowerCase() &&
      path.basename(path.dirname(path.dirname(normalized))).toLowerCase() === 'node_modules';
  }
  return path.basename(normalized).toLowerCase() === packageName.toLowerCase() &&
    path.basename(path.dirname(normalized)).toLowerCase() === 'node_modules';
}

function isProtectedSystemPath(value, allowedPackageName = null) {
  const normalized = path.resolve(value);
  const insideProtectedPath = PROTECTED_SYSTEM_PATHS.some((protectedPath) =>
    isInside(normalized, path.resolve(protectedPath)),
  );
  const isAllowedPackage = allowedPackageName !== null && isNpmPackagePath(normalized, allowedPackageName);
  return insideProtectedPath && !isAllowedPackage;
}

function systemdUnitFragmentPath(serviceName) {
  const result = run('systemctl', ['show', serviceName, '--property=FragmentPath', '--value'], { timeout: 10_000, stdio: 'pipe' });
  const fragmentPath = String(result.stdout ?? '').trim();
  const expectedFile = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
  if (result.error !== undefined || result.status !== 0 || !path.isAbsolute(fragmentPath) ||
    path.basename(fragmentPath) !== expectedFile ||
    !SYSTEMD_UNIT_DIRECTORIES.some((directory) => same(path.dirname(fragmentPath), directory))) {
    throw new Error(`systemd unit has no removable fragment in an approved system directory: ${serviceName}`);
  }
  return fragmentPath;
}

function isDeepEnoughToDelete(value) {
  const relative = path.relative(path.parse(value).root, value);
  return relative !== '' && relative.split(path.sep).filter(Boolean).length >= 2;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform === 'win32') {
    const result = run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 5_000, stdio: 'pipe' });
    if (result.error !== undefined || result.status === null || result.status !== 0) {
      throw new Error(`unable to verify process ${pid} with tasklist`);
    }
    const match = /^"[^"]*","(\d+)"/m.exec(String(result.stdout ?? ''));
    return match !== null && Number(match[1]) === pid;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ESRCH') return false;
      if (error.code === 'EPERM') return true;
    }
    throw new Error(`unable to verify process ${pid}: ${String(error)}`);
  }
}

function windowsCommandLine(pid) {
  const result = run('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\" | Select-Object -ExpandProperty CommandLine`,
  ], { timeout: 8_000, stdio: 'pipe' });
  if (result.error !== undefined || result.status === null || result.status !== 0) {
    throw new Error(`unable to read command line for process ${pid}`);
  }
  return String(result.stdout ?? '').trim().toLowerCase();
}

function isOfficialDshCommand(commandLine) {
  return commandLine.includes('dsh') &&
    !commandLine.includes('dsh-passwords') &&
    (commandLine.includes('bin.js') || commandLine.includes('\\dsh.ps1') || commandLine.includes('/dsh')) &&
    /(?:^|[\s"'\/-])web(?:[\s"'-]|$)/.test(commandLine);
}

function processCommandLine(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return '';
  if (process.platform === 'win32') return windowsCommandLine(pid);
  const result = run('ps', ['-p', String(pid), '-o', 'args='], { timeout: 5_000, stdio: 'pipe' });
  return String(result.stdout ?? '').trim().toLowerCase();
}

function isConfiguredDshCommand(commandLine, dshRoot) {
  const normalizedRoot = path.resolve(dshRoot).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const normalizedCommand = commandLine.replace(/\\/g, '/').toLowerCase();
  if (!isOfficialDshCommand(commandLine)) return false;
  if (normalizedCommand.includes(`${normalizedRoot}/`)) return true;
  if (process.platform === 'win32') return false;
  const shim = /^(?:node\s+)?(\/[^\s"']+\/dsh)\s+web(?:\s|$)/.exec(commandLine.trim());
  if (shim === null) return false;
  try {
    return same(fs.realpathSync(shim[1]), path.join(dshRoot, 'lib', 'bin.js'));
  } catch {
    return false;
  }
}

function hasPackageName(packageRoot, expectedName) {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    return metadata !== null && typeof metadata === 'object' && metadata.name === expectedName;
  } catch {
    return false;
  }
}

function isDshPackageRoot(dshRoot) {
  return path.basename(dshRoot).toLowerCase() === 'dsh' &&
    path.basename(path.dirname(dshRoot)).toLowerCase() === '@deepseek-ai' &&
    hasPackageName(dshRoot, '@deepseek-ai/dsh');
}

function isSqliteDatabase(dbPath) {
  try {
    const stat = fs.lstatSync(dbPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 16) return false;
    const fd = fs.openSync(dbPath, 'r');
    try {
      const header = Buffer.alloc(16);
      return fs.readSync(fd, header, 0, header.length, 0) === header.length && header.toString('binary') === 'SQLite format 3\0';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function dshPidFromPort(port, dshRoot) {
  if (process.platform !== 'win32' || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  const script = `$c=Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue; if ($null -ne $c) { $c | Select-Object -ExpandProperty OwningProcess -Unique }`;
  const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 8_000, stdio: 'pipe' });
  if (result.error !== undefined || result.status === null || result.status !== 0) {
    throw new Error(`unable to resolve the DSH process listening on port ${port}`);
  }
  const pids = [...new Set(String(result.stdout ?? '').trim().split(/\s+/)
    .map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  if (pids.length === 0) return null;
  if (pids.length !== 1) throw new Error(`multiple processes are listening on DSH port ${port}`);
  const [pid] = pids;
  if (!isConfiguredDshCommand(windowsCommandLine(pid), dshRoot)) return null;
  return pid;
}

function validateStopTarget(plan) {
  if (typeof plan.serviceName === 'string' && plan.serviceName !== '' && process.platform !== 'win32') {
    const unit = run('systemctl', ['cat', plan.serviceName], { timeout: 10_000, stdio: 'pipe' });
    const unitText = String(unit.stdout ?? '').toLowerCase();
    const mainPid = Number(String(run('systemctl', ['show', plan.serviceName, '--property=MainPID', '--value'], { timeout: 10_000, stdio: 'pipe' }).stdout ?? '').trim());
    if (unit.status !== 0 || !unitText.includes('/dsh') ||
      !Number.isInteger(mainPid) || mainPid <= 0 ||
      !isConfiguredDshCommand(processCommandLine(mainPid), plan.dshRoot) ||
      (Number.isInteger(plan.parentPid) && plan.parentPid > 0 && mainPid !== plan.parentPid)) {
      throw new Error(`refusing to stop a non-matching DSH systemd unit: ${plan.serviceName}`);
    }
    return;
  }
  if (process.platform === 'win32') {
    const hostPid = Number.isInteger(plan.parentPid) && plan.parentPid > 0
      ? plan.parentPid
      : dshPidFromPort(plan.upstreamPort, plan.dshRoot);
    if (hostPid === null || hostPid <= 0 || !processAlive(hostPid) ||
      !isConfiguredDshCommand(windowsCommandLine(hostPid), plan.dshRoot)) {
      throw new Error('official DSH process was not found or did not match the configured DSH root');
    }
    return;
  }
  if (typeof plan.serviceName !== 'string' || plan.serviceName === '') {
    if (!Number.isInteger(plan.parentPid) || plan.parentPid <= 0 || !processAlive(plan.parentPid) ||
      !isConfiguredDshCommand(processCommandLine(plan.parentPid), plan.dshRoot)) {
      throw new Error('official DSH parent process was not found or did not match the configured DSH root');
    }
  }
}

function stopPlan(plan) {
  let systemdUnitPath = null;
  if (typeof plan.serviceName === 'string' && plan.serviceName !== '' && process.platform !== 'win32') {
    systemdUnitPath = systemdUnitFragmentPath(plan.serviceName);
    if (receipt.dryRun) receipt.planned.push(systemdUnitPath);
  }
  if (receipt.dryRun) return systemdUnitPath;
  validateStopTarget(plan);
  const stoppedPids = [];
  if (typeof plan.serviceName === 'string' && plan.serviceName !== '' && process.platform !== 'win32') {
    const mainPid = Number(String(run('systemctl', ['show', plan.serviceName, '--property=MainPID', '--value'], { timeout: 10_000, stdio: 'pipe' }).stdout ?? '').trim());
    if (!Number.isInteger(mainPid) || mainPid <= 0) throw new Error(`refusing to stop a non-matching DSH systemd unit: ${plan.serviceName}`);
    stoppedPids.push(mainPid);
    const result = run('systemctl', ['stop', plan.serviceName], { timeout: 30_000, stdio: 'pipe' });
    if (result.status !== 0) throw new Error(`systemctl stop failed: ${String(result.stderr ?? '').slice(-1000)}`);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && processAlive(mainPid)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    if (processAlive(mainPid)) throw new Error('DSH systemd main process did not stop; service definition was preserved');

  }
  if (process.platform === 'win32') {
    const hostPid = Number.isInteger(plan.parentPid) && plan.parentPid > 0
      ? plan.parentPid
      : dshPidFromPort(plan.upstreamPort, plan.dshRoot);
    if (hostPid === null || hostPid <= 0) throw new Error('official DSH process was not found or did not match the configured DSH root');
    stoppedPids.push(hostPid);
    const result = run('taskkill', ['/PID', String(hostPid), '/F'], { timeout: 20_000, stdio: 'pipe' });
    if (result.status !== 0 && processAlive(hostPid)) throw new Error(`taskkill failed for host pid ${hostPid}`);
    const gatewayDeadline = Date.now() + 8_000;
    while (Date.now() < gatewayDeadline && processAlive(plan.gatewayPid)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    if (Number.isInteger(plan.gatewayPid) && plan.gatewayPid > 0 && processAlive(plan.gatewayPid)) {
      const gatewayResult = run('taskkill', ['/PID', String(plan.gatewayPid), '/F'], { timeout: 20_000, stdio: 'pipe' });
      if (gatewayResult.status !== 0 && processAlive(plan.gatewayPid)) throw new Error(`taskkill failed for gateway pid ${plan.gatewayPid}`);
    }
  } else if (typeof plan.serviceName !== 'string' || plan.serviceName === '') {
    if (!Number.isInteger(plan.parentPid) || plan.parentPid <= 0) throw new Error('official DSH parent process was not found or did not match the configured DSH root');
    stoppedPids.push(plan.parentPid);
    process.kill(plan.parentPid, 'SIGTERM');
    if (Number.isInteger(plan.gatewayPid) && plan.gatewayPid > 0 && processAlive(plan.gatewayPid)) process.kill(plan.gatewayPid, 'SIGTERM');
  }
  const deadline = Date.now() + 30_000;
  let stopped = false;
  while (Date.now() < deadline) {
    if (!processAlive(plan.gatewayPid) && !processAlive(plan.parentPid) && stoppedPids.every((pid) => !processAlive(pid))) {
      stopped = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  if (!stopped) throw new Error('processes did not stop within 30 seconds; service definition and data were preserved');
  return systemdUnitPath;
}

function removeSystemdUnit(plan, unitPath) {
  if (unitPath === null || typeof plan.serviceName !== 'string' || plan.serviceName === '') return;
  try {
    const dropIns = run('systemctl', ['show', plan.serviceName, '--property=DropInPaths', '--value'], { timeout: 10_000, stdio: 'pipe' });
    if (dropIns.error !== undefined || dropIns.status !== 0) throw new Error(`systemctl could not list unit drop-ins: ${String(dropIns.stderr ?? '').slice(-1000)}`);
    const dropInPaths = String(dropIns.stdout ?? '').trim().split(/\s+/).filter(Boolean);
    const disable = run('systemctl', ['disable', plan.serviceName], { timeout: 30_000, stdio: 'pipe' });
    if (disable.status !== 0) throw new Error(`systemctl disable failed: ${String(disable.stderr ?? '').slice(-1000)}`);
    removePathBestEffort(unitPath);
    const unitFile = path.basename(unitPath);
    for (const dropInPath of dropInPaths) {
      const dropInDirectory = path.dirname(dropInPath);
  const isOwnedDropIn = path.basename(dropInPath).startsWith('dsh-passwords') &&
        path.basename(dropInPath).endsWith('.conf') &&
        SYSTEMD_UNIT_DIRECTORIES.some((directory) => same(dropInDirectory, path.join(directory, `${unitFile}.d`)));
      if (isOwnedDropIn) removePathBestEffort(dropInPath, { fileOnly: true });
    }
    const dropInDirectory = `${unitPath}.d`;
    if (fs.existsSync(dropInDirectory) && fs.readdirSync(dropInDirectory).length === 0) {
      try { fs.rmdirSync(dropInDirectory); } catch { /* non-empty or concurrently updated */ }
    }
    const reload = run('systemctl', ['daemon-reload'], { timeout: 30_000, stdio: 'pipe' });
    if (reload.status !== 0) throw new Error(`systemctl daemon-reload failed: ${String(reload.stderr ?? '').slice(-1000)}`);
    const reset = run('systemctl', ['reset-failed', plan.serviceName], { timeout: 30_000, stdio: 'pipe' });
    if (reset.status !== 0) throw new Error(`systemctl reset-failed failed: ${String(reset.stderr ?? '').slice(-1000)}`);
  } catch (error) {
    receipt.errors.push(`systemd unit ${plan.serviceName}: ${String(error)}`);
    console.error(`[dsh-passwords purge] systemd unit ${plan.serviceName}: ${String(error)}`);
  }
}

function removePath(target, options = {}) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (options.fileOnly && stat.isDirectory()) {
    receipt.residual.push(target);
    return;
  }
  if (receipt.dryRun) {
    receipt.planned.push(target);
    return;
  }
  fs.rmSync(target, { recursive: !options.fileOnly, force: true, maxRetries: 10, retryDelay: 200 });
  if (fs.existsSync(target)) throw new Error(`path remains after deletion: ${target}`);
  receipt.deleted.push(target);
}

function removePathBestEffort(target, options = {}) {
  try {
    removePath(target, options);
  } catch (error) {
    receipt.errors.push(`${target}: ${String(error)}`);
    console.error(`[dsh-passwords purge] ${target}: ${String(error)}`);
  }
}

function validatePlan(plan, planDirStat) {
  const required = ['packageRoot', 'configuredRoot', 'dshHome', 'dshRoot', 'envFile', 'dbPath', 'receiptPath', 'startSignalPath'];
  for (const key of required) plan[key] = absolute(plan[key], key);
  if (typeof plan.transactionId !== 'string' || !/^[A-Za-z0-9-]{8,160}$/.test(plan.transactionId)) throw new Error('invalid transaction id');
  const expectedReceiptPath = path.join(os.tmpdir(), `dsh-passwords-purge-${plan.transactionId}.receipt.json`);
  if (!same(plan.receiptPath, expectedReceiptPath)) throw new Error('receipt path does not match the purge transaction');
  if (!same(path.dirname(plan.startSignalPath), path.dirname(planPath))) throw new Error('start signal must be inside the private purge plan directory');
  if (typeof plan.serviceName !== 'string' || !/^[A-Za-z0-9_.@-]*$/.test(plan.serviceName)) throw new Error('invalid service name');
  if (process.platform !== 'win32') {
    if (!Number.isInteger(plan.creatorUid) || plan.creatorUid < 0 || plan.creatorUid !== planDirStat.uid) throw new Error('purge plan owner does not match its creator');
    if (!Number.isInteger(plan.creatorGid) || plan.creatorGid < 0 || plan.creatorGid !== planDirStat.gid) throw new Error('purge plan group does not match its creator');
  }
  if (plan.upstreamPort !== null && (!Number.isInteger(plan.upstreamPort) || plan.upstreamPort <= 0 || plan.upstreamPort > 65535)) throw new Error('invalid upstream port');
  if ([plan.packageRoot, plan.configuredRoot, plan.dshHome, plan.dshRoot, plan.dbPath, plan.envFile].some((value) => value === path.parse(value).root)) throw new Error('refusing to delete a filesystem root');
  if ([plan.packageRoot, plan.configuredRoot, plan.dshHome, plan.dshRoot].some((value) => !isDeepEnoughToDelete(value))) throw new Error('refusing to delete a path that is too shallow');
  const dbDirectory = path.dirname(plan.dbPath);
  const dbInsidePackage = isInside(dbDirectory, plan.packageRoot);
  if (!hasPackageName(plan.packageRoot, 'dsh-passwords')) throw new Error('package root is not a dsh-passwords installation');
  if (!isDshPackageRoot(plan.dshRoot)) throw new Error('DSH root is not the official @deepseek-ai/dsh package');
  const dshHomeInUserTree = ['/home', '/root'].some((homeRoot) => {
    if (!isInside(plan.dshHome, homeRoot) || same(plan.dshHome, homeRoot)) return false;
    const depth = path.relative(homeRoot, plan.dshHome).split(path.sep).filter(Boolean).length;
    return homeRoot === '/root' ? depth === 1 && path.basename(plan.dshHome) === '.dsh' : depth >= 2;
  });
  const dshHomeInVarLib = same(plan.dshHome, '/var/lib/dsh') || same(plan.dshHome, '/var/lib/.dsh');
  const dbInVarLib = isInside(dbDirectory, '/var/lib/dsh-passwords') && !same(dbDirectory, '/var/lib/dsh-passwords');
  if (isProtectedSystemPath(plan.packageRoot, 'dsh-passwords') ||
    !same(plan.configuredRoot, plan.packageRoot) && isProtectedSystemPath(plan.configuredRoot) ||
    isProtectedSystemPath(plan.dshHome) && !dshHomeInUserTree && !dshHomeInVarLib ||
    isProtectedSystemPath(plan.dshRoot, '@deepseek-ai/dsh') ||
    !dbInsidePackage && !dbInVarLib && isProtectedSystemPath(dbDirectory)) throw new Error('refusing to delete a protected system path');
  const webProfile = path.join(plan.dshHome, 'profiles', 'web');
  if (!fs.existsSync(webProfile) || !fs.lstatSync(webProfile).isDirectory()) throw new Error('DSH home does not contain the active web profile');
  if (isInside(plan.dshRoot, plan.dshHome) || isInside(plan.dshHome, plan.dshRoot)) throw new Error('DSH root and DSH home overlap');
  if (same(plan.dshHome, os.homedir()) || isInside(os.homedir(), plan.dshHome)) throw new Error('refusing to delete the user home or its ancestor');
  if (same(plan.packageRoot, os.homedir()) || isInside(os.homedir(), plan.packageRoot)) throw new Error('refusing to delete the package root home or its ancestor');
  if (isInside(plan.packageRoot, plan.dshHome) || isInside(plan.configuredRoot, plan.dshHome) ||
    isInside(plan.dshHome, plan.packageRoot) || isInside(plan.dshHome, plan.configuredRoot)) {
    throw new Error('DSH home overlaps another deletion root');
  }
  if (plan.deleteConfiguredRoot && !same(plan.configuredRoot, plan.packageRoot)) throw new Error('configured root deletion must target the package root');

  if (!same(path.dirname(plan.envFile), plan.configuredRoot) || path.basename(plan.envFile) !== '.env') {
    throw new Error('environment file must be the .env file inside the configured root');
  }
  if (!isSqliteDatabase(plan.dbPath)) throw new Error('database path must be a regular SQLite database');
  if (dbDirectory === path.parse(dbDirectory).root || same(dbDirectory, os.homedir()) || isInside(os.homedir(), dbDirectory)) {
    throw new Error('refusing to delete database data in the user home or its ancestor');
  }
  return plan;
}

function globalDshPaths(plan) {
  const dshRoot = path.resolve(plan.dshRoot);
  const scopeDir = path.dirname(dshRoot);
  const globalNodeModules = path.basename(path.dirname(scopeDir)) === 'node_modules' ? path.dirname(scopeDir) : null;
  const globalParent = globalNodeModules === null ? null : path.dirname(globalNodeModules);
  const prefix = globalParent === null ? null : path.basename(globalParent).toLowerCase() === 'lib' ? path.dirname(globalParent) : globalParent;
  const shims = [];
  if (prefix !== null) {
    for (const directory of process.platform === 'win32' ? [prefix] : [path.join(prefix, 'bin'), prefix]) {
      for (const name of ['dsh', 'dsh.cmd', 'dsh.ps1', 'dsh-passwords', 'dsh-passwords.cmd', 'dsh-passwords.ps1']) shims.push(path.join(directory, name));
    }
  }
  return { shims };
}

try {
  if (!planPath || !path.isAbsolute(planPath)) throw new Error('missing absolute purge plan');
  const planDir = path.dirname(planPath);
  if (!isInside(planDir, os.tmpdir()) || same(planDir, os.tmpdir()) || !/^dsh-passwords-purge-/.test(path.basename(planDir))) {
    console.error('[dsh-passwords purge] invalid purge plan directory');
    throw new Error('purge plan must live in a private temporary purge directory');
  }
  const planDirStat = fs.lstatSync(planDir);
  if (!planDirStat.isDirectory() || planDirStat.isSymbolicLink() ||
    (process.platform !== 'win32' && ((planDirStat.mode & 0o077) !== 0 ||
      (planDirStat.uid !== process.getuid() && process.getuid() !== 0)))) {
    throw new Error('purge plan directory must be a private directory owned by the current user');
  }
  const planFileStat = fs.lstatSync(planPath);
  if (!planFileStat.isFile() || planFileStat.isSymbolicLink() ||
    (process.platform !== 'win32' && planFileStat.uid !== planDirStat.uid)) throw new Error('purge plan must be a regular file owned by the plan directory owner');
  cleanupPlanDir = planDir;
  const rawPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  receipt.dryRun = rawPlan !== null && typeof rawPlan === 'object' && rawPlan.dryRun === true;
  if (rawPlan !== null && typeof rawPlan === 'object' && !Array.isArray(rawPlan) &&
    typeof rawPlan.transactionId === 'string' && /^[A-Za-z0-9-]{8,160}$/.test(rawPlan.transactionId)) {
    receipt.transactionId = rawPlan.transactionId;
    receipt.receiptPath = path.join(os.tmpdir(), `dsh-passwords-purge-${rawPlan.transactionId}.receipt.json`);
    writeReceipt();
  }
  const plan = validatePlan(rawPlan, planDirStat);
  receipt.transactionId = plan.transactionId;
  receipt.receiptPath = plan.receiptPath;
  receipt.dryRun = plan.dryRun === true;
  if (!receipt.dryRun) validateStopTarget(plan);
  receipt.ready = true;
  writeReceipt();

  if (!receipt.dryRun) {
    const signalDeadline = Date.now() + 30_000;
    while (!fs.existsSync(plan.startSignalPath) && Date.now() < signalDeadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
    if (!fs.existsSync(plan.startSignalPath)) throw new Error('request delivery was not confirmed; cleanup was not started');
    const signal = fs.readFileSync(plan.startSignalPath, 'utf8').trim();
    if (signal !== plan.transactionId) throw new Error('invalid cleanup start signal');
  }

  const systemdUnitPath = stopPlan(plan);
  receipt.stopped = !receipt.dryRun;
  writeReceipt();

  const paths = globalDshPaths(plan);
  const roots = uniquePaths([
    plan.dshHome,
    ...(plan.deleteConfiguredRoot ? [plan.configuredRoot] : []),
    plan.packageRoot,
    plan.dshRoot,
  ]);
  for (const target of roots) removePathBestEffort(target);

  const dbDirectory = path.dirname(plan.dbPath);
  for (const target of [plan.dbPath, `${plan.dbPath}-wal`, `${plan.dbPath}-shm`]) removePathBestEffort(target);
  for (const directoryName of ['message-media', 'acme', 'update']) {
    removePathBestEffort(path.join(dbDirectory, directoryName));
  }
  removePathBestEffort(plan.envFile, { fileOnly: true });
  removePathBestEffort(path.join(plan.configuredRoot, 'setup-key.txt'), { fileOnly: true });
  for (const shim of paths.shims) removePathBestEffort(shim, { fileOnly: true });
  if (!receipt.dryRun) removeSystemdUnit(plan, systemdUnitPath);
  receipt.ok = receipt.errors.length === 0 && receipt.residual.length === 0;
  receipt.finished = true;
  writeReceipt();
} catch (error) {
  fail(String(error));
} finally {
  if (cleanupPlanDir !== null) {
    try { fs.rmSync(cleanupPlanDir, { recursive: true, force: true }); } catch { /* Windows may still hold this helper */ }
  }
}
