import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cleanDistScript = path.join(projectRoot, 'scripts', 'clean-dist.mjs');

type PackageJson = { scripts?: Record<string, string> };
const readPackageJson = (): PackageJson =>
  JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as PackageJson;

// 与 scripts/clean-dist.mjs 相同的判定：只有同时存在 .js 与 .d.ts 的成对产物，
// 且 src/ 下已无同名 .ts，才算陈旧编译产物（client.js 之类无 .d.ts 的打包产物保留）。
function obsoleteCompiledOutputs(distDir: string, srcDir: string): string[] {
  const sourceBases = new Set(
    readdirSync(srcDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name.slice(0, -'.ts'.length)),
  );
  const distFiles = readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const distSet = new Set(distFiles);
  return distFiles
    .filter((name) => name.endsWith('.d.ts'))
    .map((name) => name.slice(0, -'.d.ts'.length))
    .filter((base) => distSet.has(`${base}.js`) && !sourceBases.has(base))
    .sort();
}

test('prepack cleans obsolete dist outputs before the build', () => {
  const prepack = readPackageJson().scripts?.prepack ?? '';
  assert.match(prepack, /clean-dist/, 'prepack must invoke the clean-dist script');
  assert.ok(
    prepack.indexOf('clean-dist') < prepack.indexOf('build'),
    'prepack must clean stale outputs before building',
  );
});

test('clean-dist removes orphaned compiled outputs and keeps live artifacts', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'dshpw-clean-dist-'));
  try {
    const srcDir = path.join(fixture, 'src');
    const distDir = path.join(fixture, 'dist');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    // 仍有源码的编译产物：必须保留
    writeFileSync(path.join(srcDir, 'gateway.ts'), 'export const gateway = 1;\n');
    writeFileSync(path.join(srcDir, 'index.ts'), 'export const index = 1;\n');
    writeFileSync(path.join(distDir, 'gateway.js'), 'live\n');
    writeFileSync(path.join(distDir, 'gateway.d.ts'), 'live\n');
    writeFileSync(path.join(distDir, 'index.js'), 'live\n');
    writeFileSync(path.join(distDir, 'index.d.ts'), 'live\n');
    // 无 .d.ts 的 esbuild 打包产物（dist/client.js）：必须保留
    writeFileSync(path.join(distDir, 'client.js'), 'bundle\n');
    // 旧构建残留：必须删除
    const staleBases = ['gateway-admin', 'gateway-media', 'gateway-messages', 'gateway-proxy', 'plugin-compat'];
    for (const base of staleBases) {
      writeFileSync(path.join(distDir, `${base}.js`), 'stale\n');
      writeFileSync(path.join(distDir, `${base}.d.ts`), 'stale\n');
    }

    const result = spawnSync(process.execPath, [cleanDistScript], { cwd: fixture, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    assert.deepEqual(obsoleteCompiledOutputs(distDir, srcDir), []);
    for (const kept of ['gateway.js', 'gateway.d.ts', 'index.js', 'index.d.ts', 'client.js']) {
      assert.equal(existsSync(path.join(distDir, kept)), true, `${kept} must be preserved`);
    }
    for (const base of staleBases) {
      assert.equal(existsSync(path.join(distDir, `${base}.js`)), false, `${base}.js must be removed`);
      assert.equal(existsSync(path.join(distDir, `${base}.d.ts`)), false, `${base}.d.ts must be removed`);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('the packed dist tree carries no obsolete compiled outputs', () => {
  const distDir = path.join(projectRoot, 'dist');
  // pretest 会先构建出 dist；无 dist 时（例如直接跑 node --test）不臆断。
  if (!existsSync(distDir)) return;
  assert.deepEqual(
    obsoleteCompiledOutputs(distDir, path.join(projectRoot, 'src')),
    [],
    'run `node scripts/clean-dist.mjs` and rebuild; stale dist outputs would be packed',
  );
});
