/**
 * The tools-layer install script in `web/` — what the EmDash tools layer leaves in a quickstart's /app
 * (24/10/2026). The layer runs as root, and /app is a named volume seeded from the image with its
 * owners, so whatever it writes must end up the site user's:
 *   - the conditional Cowork support archive is unpacked without keeping its owners (`tar --no-same-owner`);
 *   - after the build, everything under /app not owned by the site user is handed back to it;
 *   - node_modules and the project's pnpm config name one store, so `pnpm add` as www-data does
 *     not stop on ERR_PNPM_UNEXPECTED_STORE (the build stage recorded root's store);
 *   - the site user's home exists and is theirs, and the project's pnpm is fetched into its
 *     Corepack cache as that user: `docker exec -u www-data` sets HOME=/var/www, which the base
 *     image lacks, so every `pnpm` stopped with EACCES before it read anything;
 *   - an image that is not a quickstart (bare tracy/emdash) is left alone.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-tools-layer-install.test.mjs
 *
 * `npm` and `find` are stubs on PATH that log their argv; `tar` logs and then runs the real tar.
 * The tree is a scratch dir; the script's paths come from TRACY_COWORK_SUPPORT_DIR / TRACY_APP_DIR.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../web/install-emdash-receiver.mjs', import.meta.url)) // vocabulary-allow: published artifact path, retained for compatibility.
const REAL_TAR = execFileSync('sh', ['-c', 'command -v tar'], { encoding: 'utf8' }).trim()
const ROOT_STORE = '/root/.local/share/pnpm/store/v11'
const WORKSPACE = 'packages: []\nallowBuilds:\n  esbuild: true\n'

/** A quickstart-shaped /app plus the conditional Cowork support files, in a scratch dir removed after the test. */
function tree(t, { emdash = '1.1.0', modules = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-tools-layer-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const app = path.join(dir, 'app')
  const core = path.join(app, 'node_modules/.pnpm/emdash@1.1.0/node_modules/emdash')
  mkdirSync(path.join(core, 'dist'), { recursive: true })
  writeFileSync(path.join(core, 'package.json'), JSON.stringify({ name: 'emdash', version: emdash }))
  writeFileSync(path.join(core, 'dist/stock.mjs'), 'stock\n')
  symlinkSync(core, path.join(app, 'node_modules/emdash'))
  writeFileSync(path.join(app, 'pnpm-workspace.yaml'), WORKSPACE)
  if (modules)
    writeFileSync(
      path.join(app, 'node_modules/.modules.yaml'),
      `${JSON.stringify({ packageManager: 'pnpm@11.9.0', storeDir: ROOT_STORE, virtualStoreDir: '.pnpm' }, null, 2)}\n`
    )

  // The archive holds dist/ only, like web/emdash-conditional-core.tar.gz.
  const src = path.join(dir, 'src')
  mkdirSync(path.join(src, 'dist'), { recursive: true })
  writeFileSync(path.join(src, 'dist/conditional.mjs'), 'conditional\n')
  const support = path.join(dir, 'cowork-support')
  mkdirSync(support)
  const archive = path.join(support, 'core.tar.gz')
  execFileSync(REAL_TAR, ['-czf', archive, '-C', src, 'dist'])
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
  writeFileSync(
    path.join(support, 'manifest.json'),
    JSON.stringify({ contract: 'emdash-conditional-writes/1', version: '1.1.0', commit: 'abc', sha256 })
  )
  writeFileSync(path.join(support, 'LICENSE'), 'MIT\n')

  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  const log = path.join(dir, 'calls.log')
  const stub = (name, body) => {
    writeFileSync(path.join(bin, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "$CALLS"\n${body}\n`)
    chmodSync(path.join(bin, name), 0o755)
  }
  stub('npm', 'exit 0')
  stub('find', 'exit 0')
  // Logs where it ran and with which HOME; exits with COREPACK_RC (a fetch that fails is a warning).
  stub('corepack', 'printf \'%s\\n\' "corepack-cwd $(pwd) HOME=$HOME" >> "$CALLS"; exit "${COREPACK_RC:-0}"')
  stub('tar', `exec ${JSON.stringify(REAL_TAR)} "$@"`)
  const home = path.join(dir, 'var/www')
  return { dir, app, core, support, bin, log, home }
}

function install(s, { owner = userInfo().username, env = {} } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${s.bin}:${process.env.PATH}`,
      CALLS: s.log,
      TRACY_COWORK_SUPPORT_DIR: s.support,
      TRACY_APP_DIR: s.app,
      TRACY_APP_OWNER: owner,
      TRACY_SITE_HOME: s.home,
      ...env
    }
  })
  const calls = existsSync(s.log) ? readFileSync(s.log, 'utf8').trim().split('\n') : []
  return { ...r, calls }
}

test('quickstart, compatible EmDash: unpacked without the archive owners, built, then handed back to the site user', (t) => {
  const s = tree(t)
  const owner = userInfo().username
  const r = install(s)
  assert.equal(r.status, 0, r.stderr)
  const tar = r.calls.findIndex((c) => c.startsWith('tar '))
  const npm = r.calls.indexOf('npm run build')
  const find = r.calls.indexOf(`find ${s.app} -xdev ! -user ${owner} -exec chown -h ${owner}:${owner} {} +`)
  assert.match(r.calls[tar], /^tar --no-same-owner -xzf /)
  assert.ok(npm > tar && find > npm, `order: ${r.calls.join(' | ')}`)
  assert.ok(existsSync(path.join(s.core, 'dist/conditional.mjs')))
  assert.equal(existsSync(path.join(s.core, 'dist/stock.mjs')), false)
  assert.ok(existsSync(path.join(s.core, 'TRACY-RECEIVER-LICENSE'))) // vocabulary-allow: published artifact path, retained for compatibility.
  assert.ok(existsSync(path.join(s.app, 'tracy-conditional-receiver.json'))) // vocabulary-allow: published artifact path, retained for compatibility.
})

test('quickstart: node_modules and pnpm-workspace.yaml name the same store, inside /app, idempotently', (t) => {
  const s = tree(t)
  const store = `${s.app}/node_modules/.pnpm-store`
  for (let run = 0; run < 2; run++) assert.equal(install(s).status, 0)
  const modules = JSON.parse(readFileSync(path.join(s.app, 'node_modules/.modules.yaml'), 'utf8'))
  assert.equal(modules.storeDir, `${store}/v11`)
  assert.equal(modules.virtualStoreDir, '.pnpm', 'the rest of .modules.yaml is kept')
  assert.equal(
    readFileSync(path.join(s.app, 'pnpm-workspace.yaml'), 'utf8'),
    `${WORKSPACE}storeDir: ${store}\n`
  )
})

test('quickstart on another EmDash version: store pinned and owners handed back, support not installed', (t) => {
  const s = tree(t, { emdash: '1.2.0' })
  const r = install(s)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /does not replace EmDash 1\.2\.0/)
  assert.ok(!r.calls.some((c) => c.startsWith('tar ') || c.startsWith('npm ')))
  assert.ok(r.calls.some((c) => c.startsWith('find ')))
  assert.ok(existsSync(path.join(s.core, 'dist/stock.mjs')))
  assert.match(readFileSync(path.join(s.app, 'node_modules/.modules.yaml'), 'utf8'), /\.pnpm-store\/v11/)
})

test('not a quickstart (no site user owns /app): no store rewrite, no chown', (t) => {
  const s = tree(t, { emdash: '1.2.0' })
  const r = install(s, { owner: 'tracy-no-such-user' })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.calls, [])
  assert.equal(readFileSync(path.join(s.app, 'pnpm-workspace.yaml'), 'utf8'), WORKSPACE)
  assert.match(readFileSync(path.join(s.app, 'node_modules/.modules.yaml'), 'utf8'), /\/root\/\.local/)
})

test('an archive that does not match its checksum fails the layer', (t) => {
  const s = tree(t)
  writeFileSync(path.join(s.support, 'core.tar.gz'), 'tampered')
  const r = install(s)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /checksum mismatch/)
})

test('quickstart: the site user gets a home and the pinned pnpm, fetched as that user in /app', (t) => {
  const s = tree(t, { emdash: '1.2.0' })
  const r = install(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(statSync(s.home).uid, userInfo().uid)
  assert.ok(statSync(path.join(s.home, '.cache')).isDirectory())
  assert.ok(r.calls.includes('corepack install'), r.calls.join(' | '))
  assert.ok(r.calls.includes(`corepack-cwd ${realpathSync(s.app)} HOME=${s.home}`), r.calls.join(' | '))
  const find = r.calls.findIndex((c) => c.startsWith('find '))
  assert.ok(find < r.calls.indexOf('corepack install'), 'the fetch runs after /app is handed back')
})

test('quickstart: a failed pnpm fetch is a warning, not a failed layer', (t) => {
  const s = tree(t, { emdash: '1.2.0' })
  const r = install(s, { env: { COREPACK_RC: '1' } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /warning: Corepack could not fetch/)
})

test('not a quickstart: no home is created and Corepack is not run', (t) => {
  const s = tree(t, { emdash: '1.2.0' })
  const r = install(s, { owner: 'tracy-no-such-user' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(s.home), false)
  assert.ok(!r.calls.some((c) => c.startsWith('corepack')))
})
