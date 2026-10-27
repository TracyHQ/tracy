// The tracy-web image carries the open Website Opportunities package as `node_modules/website-opportunities`
// (`apps/tracy-web/Dockerfile`), and `src/` imports it by name. A package module that reaches outside the package,
// a file the build context leaves out, or an npm dependency this app's lockfile does not install loads in a
// checkout and fails in the image. So this rebuilds the image layout in a temporary directory, with the app's
// installed dependencies linked where `pnpm install` puts them in the image, and imports the package from where
// `/opt/tracy-web/src/app.js` stands.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WO_CONTRACT_VERSION } from 'website-opportunities/src/domain-loader.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PKG_DIR = join(ROOT, 'packages/wo/website-opportunities')
const PKG = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))
const APP = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/package.json'), 'utf8'))
// What `.dockerignore` keeps out of the build context under the package (besides every `node_modules/`).
const IGNORED = ['test', 'docs', '.github']

test('the Dockerfile copies the package whole to node_modules/website-opportunities, after the install', () => {
  const dockerfile = readFileSync(join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
  const final = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))
  const copy = final.search(
    /^COPY packages\/wo\/website-opportunities \.\/node_modules\/website-opportunities$/m
  )
  assert.ok(copy > 0, 'no COPY of the package into node_modules/website-opportunities in the final stage')
  assert.ok(
    final.indexOf('pnpm install') < copy,
    'the package must be copied after pnpm install fills node_modules'
  )
  assert.doesNotMatch(dockerfile, /wo-domain/)
  const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8').split('\n')
  for (const name of IGNORED) assert.ok(ignore.includes(`packages/wo/website-opportunities/${name}`), name)
  assert.ok(!ignore.some((l) => /^packages\/wo\/?$|^packages\/wo\/website-opportunities\/?$/.test(l)))
})

test("every npm dependency of the package is one tracy-web's own lockfile installs, at the same version", () => {
  for (const [name, version] of Object.entries(PKG.dependencies ?? {}))
    assert.equal(
      APP.dependencies?.[name],
      version,
      `${name}@${version} missing from apps/tracy-web/package.json`
    )
})

test('the package and its domain import from the image layout alone', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tracy-web-wo-package-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = join(root, 'opt', 'tracy-web')
  const modules = join(app, 'node_modules')
  cpSync(PKG_DIR, join(modules, 'website-opportunities'), {
    recursive: true,
    filter: (src) => {
      const rel = relative(PKG_DIR, src)
      return !rel.split(sep).includes('node_modules') && !IGNORED.includes(rel.split(sep)[0])
    }
  })
  // Where the image's `pnpm install` puts the app's dependencies: linked from this checkout's install.
  for (const name of Object.keys(PKG.dependencies ?? {})) {
    const target = realpathSync(join(ROOT, 'apps/tracy-web/node_modules', name))
    mkdirSync(dirname(join(modules, name)), { recursive: true })
    symlinkSync(target, join(modules, name), 'dir')
  }
  mkdirSync(join(app, 'src'))
  const probe = join(app, 'src', 'probe.mjs')
  writeFileSync(
    probe,
    [
      "import { websiteOpportunitiesRoutes } from 'website-opportunities/src/route.js'",
      "import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'",
      "import * as domain from 'website-opportunities/domain'",
      "await import('website-opportunities/src/message-language.js')",
      "await import('website-opportunities/src/media-info.js')",
      "await import('website-opportunities/src/schema/index.js')",
      'const loaded = await websiteOpportunitiesDomain()',
      "if (typeof websiteOpportunitiesRoutes !== 'function' || loaded !== domain) throw new Error('not one domain')",
      'process.stdout.write(String(domain.CONTRACT?.version))'
    ].join('\n')
  )
  const run = spawnSync(process.execPath, [probe], { cwd: app, encoding: 'utf8' })
  assert.equal(run.status, 0, `the package does not load from the image layout:\n${run.stderr}`)
  assert.equal(run.stdout, String(WO_CONTRACT_VERSION))
})
