// H9: what the Tracy layer imports at run time is a declared dependency.
//
// The image installs with `--omit=dev`. `yaml` (read by `src/tracy/i18n/gateway-langs.ts`) was only
// reachable through a devDependency of upstream's, so a production install would have no `yaml` and
// the gateway would fail to start on its first import. This pins the rule for every bare import
// under `src/tracy/`, not just that one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** `yaml`, `@scope/pkg` — the package name of a bare runtime import, or null for relative/node:/type-only. */
function packagesImportedBy(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^'.][^']*)'/gm)) {
    if (m[1] !== undefined || m[2]!.startsWith('node:')) continue;
    const parts = m[2]!.split('/');
    out.push(parts[0]!.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!);
  }
  return out;
}

test('H9: every package src/tracy imports at run time is in `dependencies`, and shipped as non-dev', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  const lock = JSON.parse(readFileSync(path.join(root, 'npm-shrinkwrap.json'), 'utf8')) as {
    packages: Record<string, { dependencies?: Record<string, string>; dev?: boolean }>;
  };
  const imported = new Set(filesUnder(path.join(root, 'src', 'tracy')).flatMap((file) => packagesImportedBy(readFileSync(file, 'utf8'))));
  assert.ok(imported.has('yaml'), 'the i18n layer reads settings.yaml with `yaml`');
  for (const name of imported) {
    assert.ok(Object.hasOwn(pkg.dependencies, name), `${name}: imported by src/tracy but not a dependency`);
    assert.ok(Object.hasOwn(lock.packages['']!.dependencies ?? {}, name), `${name}: not a dependency in npm-shrinkwrap.json`);
    assert.notEqual(lock.packages[`node_modules/${name}`]?.dev, true, `${name}: still marked dev in npm-shrinkwrap.json`);
  }
});
