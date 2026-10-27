/**
 * One seat, one site: the Files tab (`/sidebar/api/fs.*`, `/sidebar/upload`) never reaches another
 * customer's webroot (#811 F-S3-003, SEC-1).
 *
 * One dsh serves every site on a host (ADR 0014), so `/site/<label>` of EVERY customer is mounted
 * in the process that answers the Files tab. Two layers stand between a seat of site A and the
 * webroot of site B, and this file holds both, end to end, on a real directory tree:
 *
 * 1. the gateway (`vendor/tracy/dsh-passwords`, `checkSeatBody`): every session a Files-tab body
 *    names must be one the seat holds — so a seat cannot borrow site B's session;
 * 2. the plugin (`vendor/tracy/dsh-better-sidebar`, `path-security.ts` + `fs-operations.ts`): the
 *    session's OWN workspace is the root, and every path — absolute, `..`, a symlink, a prefix
 *    sibling like `/site/alphabeta` — is resolved on disk and refused outside it.
 *
 * Measured sealed on the shared stand 11/10/2026 (tasks/evidence/tracy-site-bugs-1110/seat-isolation/);
 * this test keeps it that way. It lives here, not in either vendor tree, because it holds the
 * CONTRACT between the two, and because `pnpm test` runs `scripts/test/*.test.ts` (the sidebar's
 * own vitest suite is not in CI).
 *
 *   node --import tsx --test scripts/test/seat-isolation-files-tab.test.ts
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import {
  checkSeatBody,
  classifySeatHttp,
  seatMayReadFile
} from '../../vendor/tracy/dsh-passwords/src/tracy/routes.js'

// The sidebar fork's fs modules pull its React client into the import graph, which
// tsconfig.scripts.json cannot type (CSS modules, React 19 types). Load them at runtime
// through a non-literal specifier so `tsc` checks this file without walking into the fork.
const sidebarModule = (name: string): Promise<Record<string, any>> =>
  import(new URL(`../../vendor/tracy/dsh-better-sidebar/src/${name}`, import.meta.url).href)
// biome-ignore lint/suspicious/noExplicitAny: runtime-loaded fork modules are untyped here
type Fn = (...args: any[]) => any
let mkdirWorkspaceEntry: Fn
let removeWorkspaceEntry: Fn
let renameWorkspaceEntry: Fn
let writeWorkspaceUpload: Fn
let searchFiles: Fn
let listDirectory: Fn
let ensureWorkspacePath: Fn
let ensureWorkspaceWritePath: Fn
let workspaceCwd: Fn
before(async () => {
  ;({ mkdirWorkspaceEntry, removeWorkspaceEntry, renameWorkspaceEntry, writeWorkspaceUpload } =
    await sidebarModule('fs-operations.ts'))
  ;({ searchFiles } = await sidebarModule('fs-search.ts'))
  ;({ listDirectory } = await sidebarModule('fs-tree.ts'))
  ;({ ensureWorkspacePath, ensureWorkspaceWritePath, workspaceCwd } = await sidebarModule('path-security.ts'))
})

/** The Files-tab routes a seat may call at all (`SEAT_SIDEBAR_API` in routes.ts). */
const FILES_ROUTES = [
  'fs.tree',
  'fs.trees',
  'fs.read',
  'fs.search',
  'fs.write',
  'fs.rename',
  'fs.remove',
  'fs.mkdir'
]

let root = ''
let sites = ''
let alpha = ''
let beta = ''
let alphabeta = ''
const BETA_SECRET = "define('DB_PASSWORD', 'beta-secret');"

before(() => {
  // realpath: macOS hands out /var/... for /private/var/...; the fence compares canonical paths.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seat-isolation-')))
  sites = join(root, 'site')
  alpha = join(sites, 'alpha')
  beta = join(sites, 'beta')
  alphabeta = join(sites, 'alphabeta')
  for (const dir of [alpha, beta, alphabeta]) mkdirSync(join(dir, 'webroot'), { recursive: true })
  writeFileSync(join(alpha, 'webroot', 'index.php'), '<?php echo "alpha";')
  writeFileSync(join(beta, 'webroot', 'wp-config.php'), BETA_SECRET)
  writeFileSync(join(alphabeta, 'webroot', 'wp-config.php'), BETA_SECRET)
  // What an agent of site A could plant in its own webroot: links into site B.
  symlinkSync(join(beta, 'webroot'), join(alpha, 'webroot', 'leak-dir'))
  symlinkSync(join(beta, 'webroot', 'wp-config.php'), join(alpha, 'webroot', 'leak-file'))
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Run a fenced call and say whether it was refused by the fence (403 `forbidden`). */
async function refused(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call()
    return false
  } catch (error) {
    const e = error as { code?: string; status?: number }
    return e.code === 'forbidden' && e.status === 403
  }
}

test('gateway: a Files-tab body naming a session the seat does not hold is refused, on every route', () => {
  const held = new Set(['session-alpha'])
  const holdsSession = (id: unknown): boolean => typeof id === 'string' && held.has(id)
  for (const route of FILES_ROUTES) {
    assert.equal(classifySeatHttp('POST', `/sidebar/api/${route}`).kind, 'seat-route', route)
    const own = checkSeatBody({ route, body: { sessionId: 'session-alpha', path: alpha }, holdsSession })
    assert.equal(own.kind, 'pass', `${route}: own session`)
    const foreign = checkSeatBody({ route, body: { sessionId: 'session-beta', path: beta }, holdsSession })
    assert.equal(foreign.kind, 'deny', `${route}: another site's session`)
    // Riding a foreign session along with an owned one does not help either.
    const smuggled = checkSeatBody({
      route,
      body: { sessionId: 'session-alpha', nested: { sessionId: 'session-beta' } },
      holdsSession
    })
    assert.equal(smuggled.kind, 'deny', `${route}: smuggled foreign session`)
    const missing = checkSeatBody({ route, body: { path: beta }, holdsSession })
    assert.equal(missing.kind, 'deny', `${route}: no session named`)
  }
})

test("gateway: dsh's own file door reads only inside the folders of held sessions, symlinks resolved", () => {
  const folders = [alpha]
  assert.equal(seatMayReadFile(join(alpha, 'webroot', 'index.php'), folders), true)
  assert.equal(seatMayReadFile(join(beta, 'webroot', 'wp-config.php'), folders), false)
  assert.equal(seatMayReadFile(join(alpha, '..', 'beta', 'webroot', 'wp-config.php'), folders), false)
  assert.equal(seatMayReadFile(join(alphabeta, 'webroot', 'wp-config.php'), folders), false)
  const viaLink = join(alpha, 'webroot', 'leak-file')
  assert.equal(seatMayReadFile(viaLink, folders, realpathSync(viaLink)), false)
})

test('plugin: a client cwd never moves the root to another site', async () => {
  assert.equal(workspaceCwd(alpha, join(alpha, 'webroot')), join(alpha, 'webroot'))
  assert.equal(await refused(async () => workspaceCwd(alpha, beta)), true)
  assert.equal(await refused(async () => workspaceCwd(alpha, alphabeta)), true)
  assert.equal(await refused(async () => workspaceCwd(alpha, `${alpha}/../beta`)), true)
})

test('plugin: reads and listings (fs.tree, fs.trees, fs.read, file door) stay in the site', async () => {
  const ownFile = join(alpha, 'webroot', 'index.php')
  assert.equal(await ensureWorkspacePath(alpha, ownFile), ownFile)
  const outside = [
    join(beta, 'webroot', 'wp-config.php'), // absolute path into site B
    `${alpha}/../beta/webroot/wp-config.php`, // `..` out of site A
    join(alphabeta, 'webroot', 'wp-config.php'), // prefix sibling of site A
    join(alpha, 'webroot', 'leak-file'), // file symlink into site B
    join(alpha, 'webroot', 'leak-dir', 'wp-config.php'), // through a directory symlink
    join(alpha, 'webroot', 'leak-dir'), // listing the linked directory
    sites, // the sites root itself
    '/etc/passwd'
  ]
  for (const target of outside) {
    assert.equal(await refused(() => ensureWorkspacePath(alpha, target)), true, target)
  }
  // fs.trees accepts session-relative levels; a relative `..` lands outside the same way.
  assert.equal(await refused(() => ensureWorkspacePath(alpha, `${alpha}/../beta`)), true)
  // The root listing of site A shows the link rows but never site B's file names.
  const listing = await listDirectory(join(alpha, 'webroot'))
  assert.deepEqual(listing.entries.map((entry: { name: string }) => entry.name).sort(), [
    'index.php',
    'leak-dir',
    'leak-file'
  ])
  assert.ok(!JSON.stringify(listing).includes('wp-config'))
})

test('plugin: the fence is no existence oracle — a missing file in site B is refused like an existing one (SEC-2)', async () => {
  /** What a client sees of a refusal, with the probed path itself taken out. */
  const seen = async (call: () => Promise<unknown>, path: string) => {
    try {
      await call()
      return { ok: true }
    } catch (error) {
      const e = error as { code?: string; status?: number; message?: string }
      return { code: e.code, status: e.status, message: e.message?.split(path).join('<path>') }
    }
  }
  const pairs: Array<[string, string]> = [
    [join(beta, 'webroot', 'wp-config.php'), join(beta, 'webroot', 'no-such-file.php')],
    [join(beta, 'webroot', 'wp-config.php'), join(beta, 'no-such-dir', 'x.php')],
    [
      join(alpha, 'webroot', 'leak-dir', 'wp-config.php'),
      join(alpha, 'webroot', 'leak-dir', 'no-such-file.php')
    ]
  ]
  for (const [existing, missing] of pairs) {
    const a = await seen(() => ensureWorkspacePath(alpha, existing), existing)
    assert.equal(a.status, 403, existing)
    assert.deepEqual(await seen(() => ensureWorkspacePath(alpha, missing), missing), a, `read ${missing}`)
    assert.deepEqual(
      await seen(() => ensureWorkspaceWritePath(alpha, missing), missing),
      a,
      `write ${missing}`
    )
    assert.deepEqual(
      await seen(() => removeWorkspaceEntry({ cwd: alpha, path: missing }), missing),
      await seen(() => removeWorkspaceEntry({ cwd: alpha, path: existing }), existing),
      `remove ${missing}`
    )
  }
  // Inside site A a missing file still says so.
  const own = await seen(() => ensureWorkspacePath(alpha, join(alpha, 'webroot', 'no-such-file.php')), '')
  assert.equal(own.status, 400)
})

test('plugin: fs.search walks site A only and never follows a link into site B', async () => {
  const found = await searchFiles(alpha, 'wp-config')
  assert.deepEqual(found.matches, [])
})

test('plugin: writes, uploads, renames, deletes and new folders cannot touch site B', async () => {
  const writeTargets = [
    join(beta, 'webroot', 'owned.php'),
    `${alpha}/../beta/webroot/owned.php`,
    join(alphabeta, 'webroot', 'owned.php'),
    join(alpha, 'webroot', 'leak-dir', 'owned.php'),
    join(alpha, 'webroot', 'leak-file')
  ]
  for (const target of writeTargets) {
    assert.equal(await refused(() => ensureWorkspaceWritePath(alpha, target)), true, target)
  }
  const chunks = async function* () {
    yield 'owned'
  }
  assert.equal(
    await refused(() =>
      writeWorkspaceUpload({
        cwd: alpha,
        dir: join(alpha, 'webroot', 'leak-dir'),
        relativePath: 'up.php',
        chunks: chunks(),
        limit: 1024
      })
    ),
    true
  )
  assert.equal(
    await refused(() =>
      writeWorkspaceUpload({
        cwd: alpha,
        dir: join(beta, 'webroot'),
        relativePath: 'up.php',
        chunks: chunks(),
        limit: 1024
      })
    ),
    true
  )
  const entryTargets = [
    join(beta, 'webroot', 'wp-config.php'),
    `${alpha}/../beta/webroot/wp-config.php`,
    join(alphabeta, 'webroot', 'wp-config.php'),
    join(alpha, 'webroot', 'leak-dir', 'wp-config.php')
  ]
  for (const path of entryTargets) {
    assert.equal(
      await refused(() => renameWorkspaceEntry({ cwd: alpha, path, name: 'moved.php' })),
      true,
      `rename ${path}`
    )
    assert.equal(await refused(() => removeWorkspaceEntry({ cwd: alpha, path })), true, `remove ${path}`)
  }
  assert.equal(
    await refused(() => mkdirWorkspaceEntry({ cwd: alpha, path: join(beta, 'webroot'), name: 'x' })),
    true
  )
  assert.equal(
    await refused(() =>
      mkdirWorkspaceEntry({ cwd: alpha, path: join(alpha, 'webroot', 'leak-dir'), name: 'x' })
    ),
    true
  )

  // Deleting the link row removes the LINK, never what it points at in site B.
  await removeWorkspaceEntry({ cwd: alpha, path: join(alpha, 'webroot', 'leak-dir') })
  assert.equal(existsSync(join(alpha, 'webroot', 'leak-dir')), false)
  // Site B is byte-for-byte what it was, and nothing new appeared in it.
  assert.equal(readFileSync(join(beta, 'webroot', 'wp-config.php'), 'utf8'), BETA_SECRET)
  assert.deepEqual(
    (await listDirectory(join(beta, 'webroot'))).entries.map((entry: { name: string }) => entry.name),
    ['wp-config.php']
  )
  assert.deepEqual(
    (await listDirectory(join(alphabeta, 'webroot'))).entries.map((entry: { name: string }) => entry.name),
    ['wp-config.php']
  )
})
