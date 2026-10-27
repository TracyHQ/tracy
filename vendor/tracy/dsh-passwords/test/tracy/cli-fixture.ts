// Spawn helpers for `dist/cli.js serve-gateway`, shaped like upstream's test/cli-startup.test.ts.
// `npm test` builds dist/ first (pretest); `npm run test:tracy` alone expects a built tree.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const cli = path.join(projectRoot, 'dist', 'cli.js');

/** A gateway .env; `overrides` with value `undefined` removes the key. */
export function writeConfig(root: string, dshRoot: string, overrides: Record<string, string | undefined> = {}): string {
  const envFile = path.join(root, '.env');
  const values: Record<string, string | undefined> = {
    SETUP_KEY: 'test-setup-key',
    MCP_DB_ENC_KEY: 'test-encryption-key',
    MCP_GATEWAY_AUTO_TLS: '0',
    MCP_GATEWAY_PORT: '19443',
    MCP_GATEWAY_REDIRECT_PORT: '0',
    MCP_DB_PATH: path.join(root, 'gateway.db'),
    MCP_DSH_ROOT: dshRoot,
    ...overrides,
  };
  const lines = Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${value}`);
  writeFileSync(envFile, lines.join('\n') + '\n');
  return envFile;
}

/**
 * A DSH install whose settings bundle takes the host-mode patch but whose connection bundle has no
 * Cookie bridge: a gateway that clears every earlier gate exits 33 there, before any listener.
 */
export function makeDshRoot(root: string, version: string): string {
  const dshRoot = path.join(root, 'dsh');
  const settingsPath = path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings', 'lib', 'client.js');
  const connectionPath = path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-connection', 'lib', 'index.js');
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  mkdirSync(path.dirname(connectionPath), { recursive: true });
  writeFileSync(path.join(dshRoot, 'package.json'), JSON.stringify({ version }) + '\n');
  writeFileSync(settingsPath, 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";\n');
  writeFileSync(connectionPath, 'export class Connection {}\n');
  return dshRoot;
}

/** Start the gateway with a scrubbed environment: only the .env file and the keys given here. */
export function startGateway(envFile: string, env: Record<string, string> = {}) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('MCP_') && key !== 'SETUP_KEY'),
  );
  return spawnSync(process.execPath, [cli, 'serve-gateway'], {
    cwd: projectRoot,
    env: { ...inherited, DSH_PASSWORDS_ENV_FILE: envFile, LANG: 'en_US.UTF-8', ...env },
    encoding: 'utf8',
    timeout: 20_000,
  });
}
