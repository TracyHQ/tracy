// H9 (K1, #561): `serve-gateway` keeps the write fence's ledger beside its database before it takes
// a request, naming the dsh process it serves (the plugin passes DSH_GATEWAY_PARENT_PID and
// DSH_GATEWAY_PARENT_BOOT). Without it a gateway restarted while dsh still makes a create would
// forget that doubt, and the archive door could move a site folder under a running write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { projectRoot, writeConfig } from './cli-fixture.js';

/** A dsh install every startup gate accepts: Tracy's dsh version, host-mode settings, a native Cookie bridge. */
function acceptedDshRoot(root: string): string {
  const dshRoot = path.join(root, 'dsh');
  const settings = path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings', 'lib', 'client.js');
  const connection = path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-connection', 'lib', 'index.js');
  mkdirSync(path.dirname(settings), { recursive: true });
  mkdirSync(path.dirname(connection), { recursive: true });
  writeFileSync(path.join(dshRoot, 'package.json'), JSON.stringify({ version: '0.2.0-rc.2-tracy.22' }) + '\n');
  writeFileSync(settings, 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";\n');
  writeFileSync(connection, 'export class Connection { authenticatedCookie(baseUrl) {} }\n');
  return dshRoot;
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test('H9/K1: serve-gateway writes its fence marker beside the database, naming the dsh boot and PID it serves', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-fence-boot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const envFile = writeConfig(root, acceptedDshRoot(root), {
    MCP_GATEWAY_PORT: String(await freePort()),
    MCP_GATEWAY_HOST: '127.0.0.1',
  });
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('MCP_') && key !== 'SETUP_KEY'));
  const child = spawn(process.execPath, [path.join(projectRoot, 'dist', 'cli.js'), 'serve-gateway'], {
    cwd: projectRoot,
    env: {
      ...inherited,
      DSH_PASSWORDS_ENV_FILE: envFile,
      LANG: 'en_US.UTF-8',
      DSH_GATEWAY_PARENT_PID: String(process.pid),
      DSH_GATEWAY_PARENT_BOOT: 'boot-of-this-dsh',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  t.after(() => child.kill('SIGKILL'));

  const dir = path.join(root, 'write-fence');
  const deadline = Date.now() + 15_000;
  let markers: string[] = [];
  while (Date.now() < deadline && child.exitCode === null) {
    markers = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
    if (markers.length > 0 && /listening|监听|0\.0\.0\.0|127\.0\.0\.1/.test(output)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(child.exitCode, null, `the gateway exited: ${output}`);
  assert.equal(markers.length, 1, `one marker for this process in ${dir}: ${output}`);
  const marker = JSON.parse(readFileSync(path.join(dir, markers[0]!), 'utf8')) as { boot: string | null; parentPid: number | null };
  assert.deepEqual(marker, { boot: 'boot-of-this-dsh', parentPid: process.pid });
  child.kill('SIGTERM');
  await exited;
});
