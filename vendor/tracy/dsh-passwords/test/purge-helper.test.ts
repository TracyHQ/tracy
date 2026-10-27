import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(projectRoot, 'scripts', 'purge.mjs');
const temporaryRoots: string[] = [];

function makePlan(): { planPath: string; receiptPath: string; paths: Record<string, string> } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-purge-test-'));
  temporaryRoots.push(root);
  const packageRoot = path.join(root, 'package');
  const configuredRoot = path.join(root, 'config');
  const dshHome = path.join(root, 'home');
  const dshRoot = path.join(root, 'node_modules', '@deepseek-ai', 'dsh');
  const dbPath = path.join(root, 'external-data', 'platform.db');
  const externalMedia = path.join(path.dirname(dbPath), 'message-media');
  const externalAcme = path.join(path.dirname(dbPath), 'acme');
  const envFile = path.join(configuredRoot, '.env');
  const receiptPath = path.join(os.tmpdir(), 'dsh-passwords-purge-purge-test-12345678.receipt.json');
  temporaryRoots.push(receiptPath);
  for (const directory of [packageRoot, configuredRoot, path.join(dshHome, 'profiles', 'web'), dshRoot, path.dirname(dbPath), externalMedia, externalAcme]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(packageRoot, 'sentinel.txt'), 'package');
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'dsh-passwords', version: '2.7.4' }));
  writeFileSync(path.join(configuredRoot, 'sentinel.txt'), 'config');
  writeFileSync(path.join(dshHome, 'sentinel.txt'), 'home');
  writeFileSync(path.join(dshRoot, 'sentinel.txt'), 'dsh');
  writeFileSync(path.join(dshRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.7-rc.2' }));
  writeFileSync(dbPath, Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.alloc(100)]));
  writeFileSync(path.join(externalMedia, 'sentinel.txt'), 'shared media');
  writeFileSync(path.join(externalAcme, 'sentinel.txt'), 'shared acme');
  writeFileSync(envFile, 'SECRET=not-printed');
  const planRoot = mkdtempSync(path.join(os.tmpdir(), 'dsh-passwords-purge-'));
  temporaryRoots.push(planRoot);
  const planPath = path.join(planRoot, 'plan.json');
  const startSignalPath = path.join(planRoot, 'start.signal');
  const plan = {
    transactionId: 'purge-test-12345678',
    gatewayPid: -1,
    parentPid: null,
    upstreamPort: null,
    serviceName: '',
    creatorUid: typeof process.getuid === 'function' ? process.getuid() : null,
    creatorGid: typeof process.getgid === 'function' ? process.getgid() : null,
    packageRoot,
    configuredRoot,
    dshHome,
    dshRoot,
    envFile,
    dbPath,
    receiptPath,
    startSignalPath,
    deleteConfiguredRoot: false,
    dryRun: true,
  };
  writeFileSync(planPath, `${JSON.stringify(plan)}\n`);
  writeFileSync(startSignalPath, `${plan.transactionId}\n`);
  return { planPath, receiptPath, paths: { packageRoot, configuredRoot, dshHome, dshRoot, dbPath, envFile, externalMedia, externalAcme } };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

test('purge helper dry-run plans explicit data and package paths without deleting anything', () => {
  const fixture = makePlan();
  execFileSync(process.execPath, [helper, fixture.planPath], { cwd: projectRoot, stdio: 'pipe' });
  const receipt = JSON.parse(readFileSync(fixture.receiptPath, 'utf8')) as {
    ok: boolean;
    ready: boolean;
    dryRun: boolean;
    stopped: boolean;
    planned: string[];
    deleted: string[];
  };
  assert.equal(receipt.ok, true);
  assert.equal(receipt.ready, true);
  assert.equal(receipt.dryRun, true);
  assert.equal(receipt.stopped, false);
  assert.ok(receipt.planned.includes(fixture.paths.packageRoot));
  assert.ok(receipt.planned.includes(fixture.paths.dshRoot));
  assert.ok(receipt.planned.includes(fixture.paths.dbPath));
  assert.equal(receipt.planned.includes(fixture.paths.externalMedia), true);
  assert.equal(receipt.planned.includes(fixture.paths.externalAcme), true);
  assert.deepEqual(receipt.deleted, []);
  for (const target of Object.values(fixture.paths)) assert.equal(existsSync(target), true, target);
});

test('purge helper accepts a configured root equal to the package root in dry-run', () => {
  const fixture = makePlan();
  const planDirectory = path.dirname(fixture.planPath);
  const plan = JSON.parse(readFileSync(fixture.planPath, 'utf8')) as Record<string, unknown>;
  plan.configuredRoot = fixture.paths.packageRoot;
  plan.envFile = path.join(fixture.paths.packageRoot, '.env');
  plan.deleteConfiguredRoot = true;
  writeFileSync(fixture.planPath, `${JSON.stringify(plan)}\n`);
  execFileSync(process.execPath, [helper, fixture.planPath], { cwd: projectRoot, stdio: 'pipe' });
  const receipt = JSON.parse(readFileSync(fixture.receiptPath, 'utf8')) as { ok: boolean; planned: string[] };
  assert.equal(receipt.ok, true);
  assert.ok(receipt.planned.includes(fixture.paths.packageRoot));
  assert.equal(existsSync(planDirectory), false, 'the validated private helper directory is cleaned up');
  assert.equal(existsSync(path.join(fixture.paths.packageRoot, 'sentinel.txt')), true, 'dry-run must not delete the root');
});

test('purge helper plans application-owned media, ACME and update data beside an external database', () => {
  const fixture = makePlan();
  const dataDirectory = path.join(fixture.paths.packageRoot, 'data');
  const mediaDirectory = path.join(dataDirectory, 'message-media');
  const acmeDirectory = path.join(dataDirectory, 'acme');
  const updateDirectory = path.join(dataDirectory, 'update');
  const databasePath = path.join(dataDirectory, 'custom.sqlite');
  mkdirSync(mediaDirectory, { recursive: true });
  mkdirSync(acmeDirectory, { recursive: true });
  mkdirSync(updateDirectory, { recursive: true });
  writeFileSync(databasePath, Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.alloc(100)]));
  const plan = JSON.parse(readFileSync(fixture.planPath, 'utf8')) as Record<string, unknown>;
  plan.configuredRoot = fixture.paths.packageRoot;
  plan.envFile = path.join(fixture.paths.packageRoot, '.env');
  plan.dbPath = databasePath;
  plan.deleteConfiguredRoot = true;
  writeFileSync(fixture.planPath, `${JSON.stringify(plan)}\n`);
  execFileSync(process.execPath, [helper, fixture.planPath], { cwd: projectRoot, stdio: 'pipe' });
  const receipt = JSON.parse(readFileSync(fixture.receiptPath, 'utf8')) as { planned: string[] };
  assert.ok(receipt.planned.includes(mediaDirectory));
  assert.ok(receipt.planned.includes(acmeDirectory));
  assert.ok(receipt.planned.includes(updateDirectory));
});

test('purge helper rejects a malformed plan after validating its private temp directory', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'dsh-passwords-purge-'));
  temporaryRoots.push(parent);
  const planPath = path.join(parent, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ receiptPath: path.join(parent, 'receipt.json') }));
  const result = (() => {
    try {
      execFileSync(process.execPath, [helper, planPath], { cwd: projectRoot, stdio: 'pipe' });
      return null;
    } catch (error) {
      return error as { status?: number; stderr?: Buffer };
    }
  })();
  assert.notEqual(result, null);
  assert.equal(result?.status, 1);
  assert.equal(existsSync(parent), false);
});

test('purge helper rejects a database path that is a directory without deleting it', () => {
  const fixture = makePlan();
  const dbDirectory = path.join(path.dirname(fixture.paths.dbPath), 'not-a-database');
  mkdirSync(dbDirectory);
  const plan = JSON.parse(readFileSync(fixture.planPath, 'utf8')) as Record<string, unknown>;
  plan.dbPath = dbDirectory;
  writeFileSync(fixture.planPath, `${JSON.stringify(plan)}\n`);
  const result = (() => {
    try {
      execFileSync(process.execPath, [helper, fixture.planPath], { cwd: projectRoot, stdio: 'pipe' });
      return null;
    } catch (error) {
      return error as { status?: number; stderr?: Buffer | string };
    }
  })();
  assert.notEqual(result, null);
  assert.equal(result?.status, 1);
  assert.match(String(result?.stderr ?? ''), /database path must be a regular SQLite database/);
  assert.equal(existsSync(dbDirectory), true);
});

test('purge helper rejects a DSH home inside a protected system subtree', () => {
  const fixture = makePlan();
  const protectedRoot = process.platform === 'win32'
    ? process.env.SystemRoot ?? 'C:\\Windows'
    : '/etc';
  const protectedHome = path.join(protectedRoot, 'dsh-passwords-test-home');
  const plan = JSON.parse(readFileSync(fixture.planPath, 'utf8')) as Record<string, unknown>;
  plan.dshHome = protectedHome;
  writeFileSync(fixture.planPath, `${JSON.stringify(plan)}\n`);
  const result = (() => {
    try {
      execFileSync(process.execPath, [helper, fixture.planPath], { cwd: projectRoot, stdio: 'pipe' });
      return null;
    } catch (error) {
      return error as { status?: number; stderr?: Buffer | string };
    }
  })();
  assert.equal(result?.status, 1);
  assert.match(String(result?.stderr ?? ''), /protected system path/);
  assert.equal(existsSync(protectedHome), false);
});

test('purge helper rejects a database under a protected system subtree', () => {
  const fixture = makePlan();
  const protectedRoot = process.platform === 'win32'
    ? process.env.SystemRoot ?? 'C:\\Windows'
    : '/etc';
  const protectedDatabase = path.join(protectedRoot, 'dsh-passwords-test-data', 'platform.db');
  const plan = JSON.parse(readFileSync(fixture.planPath, 'utf8')) as Record<string, unknown>;
  plan.dbPath = protectedDatabase;
  writeFileSync(fixture.planPath, `${JSON.stringify(plan)}\n`);
  const result = (() => {
    try {
      execFileSync(process.execPath, [helper, fixture.planPath], { cwd: projectRoot, stdio: 'pipe' });
      return null;
    } catch (error) {
      return error as { status?: number; stderr?: Buffer | string };
    }
  })();
  assert.equal(result?.status, 1);
  assert.match(String(result?.stderr ?? ''), /protected system path/);
  assert.equal(existsSync(protectedDatabase), false);
});
