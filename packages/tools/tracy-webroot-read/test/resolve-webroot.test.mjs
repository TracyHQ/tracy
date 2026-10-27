#!/usr/bin/env node
/**
 * Where `tracy_site_profile` looks for the CMS.
 *
 *   node --test packages/tools/tracy-webroot-read/test/resolve-webroot.test.mjs
 *
 * Measured 02/09 in a real session on `tchwp2.tracy.ai`: the tool answered `platform: "unknown"`,
 * `"No WordPress or Joomla install found here."` — on a WordPress site that was serving visitors —
 * because it read the directory dsh was standing in rather than the `.webroot/` mounted inside it.
 * A confident wrong answer, no error, no warning. See the header of `resolveWebroot`.
 *
 * The second half of this file is the SESSION fence (06/09). Until then the tool started from the
 * dsh process directory, which the fleet image pins to `/site` — the parent of every customer's
 * folder on a host dsh. It imports `src/webroot.mjs`, not `index.js`: index.js pulls in
 * `@deepseek-ai/dsh-tools`, a peer dependency this package's own tree does not have, so every test
 * that went through index.js failed at import on a developer machine.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { resolveWebroot, sessionWebroot, WEBROOT_DIR } from '../src/webroot.mjs'

async function siteFolder({ withWebroot }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'webroot-'))
  await writeFile(path.join(dir, 'AGENTS.md'), '# site\n', 'utf8')
  if (withWebroot) {
    await mkdir(path.join(dir, WEBROOT_DIR, 'wp-includes'), { recursive: true })
    await writeFile(path.join(dir, WEBROOT_DIR, 'wp-includes/version.php'), '<?php', 'utf8')
  }
  return dir
}

test('inside a lane site folder, the CMS is `.webroot/`, not the folder itself', async () => {
  const dir = await siteFolder({ withWebroot: true })
  assert.equal(await resolveWebroot(undefined, dir), path.join(dir, WEBROOT_DIR))
})

test('a plain webroot still resolves to itself — the old fleet shape keeps working', async () => {
  // `fleet/dsh/Dockerfile` sets `WORKDIR /var/www/html`, and lanes that have not been migrated
  // still stand directly in the webroot. Breaking those to fix the new shape would trade one
  // silent wrong answer for another.
  const dir = await siteFolder({ withWebroot: false })
  assert.equal(await resolveWebroot(undefined, dir), dir)
})

test('an explicit config wins over both — someone who states it means it', async () => {
  const dir = await siteFolder({ withWebroot: true })
  assert.equal(await resolveWebroot('/somewhere/else', dir), '/somewhere/else')
})

test('a `.webroot` that is a FILE is not a webroot', async () => {
  // Fails closed: reading a file as a directory would throw somewhere further in, at a point that
  // says nothing about the cause.
  const dir = await mkdtemp(path.join(tmpdir(), 'webroot-'))
  await writeFile(path.join(dir, WEBROOT_DIR), 'not a directory', 'utf8')
  assert.equal(await resolveWebroot(undefined, dir), dir)
})

/** Two site folders side by side, the way a host dsh sees `/site`. */
async function twoSites() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sites-')))
  for (const label of ['wpdemo', 'fijitrips']) {
    await mkdir(path.join(root, label, WEBROOT_DIR, 'wp-includes'), { recursive: true })
    await writeFile(path.join(root, label, WEBROOT_DIR, 'wp-includes/version.php'), '<?php', 'utf8')
  }
  return root
}

const session = (cwd) => ({ agent: { session: { header: { cwd } } } })

test('sessionWebroot: the webroot comes from the SESSION, not from where dsh stands', async () => {
  const root = await twoSites()
  assert.equal(
    await sessionWebroot(undefined, session(path.join(root, 'wpdemo'))),
    path.join(root, 'wpdemo', WEBROOT_DIR)
  )
  // The other seat, in the same dsh process, gets its own site — not the parent, not the neighbour.
  assert.equal(
    await sessionWebroot(undefined, session(path.join(root, 'fijitrips'))),
    path.join(root, 'fijitrips', WEBROOT_DIR)
  )
})

test('sessionWebroot: no session workspace is a refusal, never the process directory', async () => {
  // This is the C1-shaped failure for this tool: on a host dsh the process stands in `/site`, so
  // "fall back to where we are" answers about every customer at once.
  await assert.rejects(() => sessionWebroot(undefined, {}), /no session workspace/)
  await assert.rejects(() => sessionWebroot(undefined, undefined), /no session workspace/)
  await assert.rejects(() => sessionWebroot(undefined, session('')), /no session workspace/)
})

test('sessionWebroot: a configured webroot pointing at another site is refused', async () => {
  const root = await twoSites()
  await assert.rejects(
    () => sessionWebroot(path.join(root, 'fijitrips', WEBROOT_DIR), session(path.join(root, 'wpdemo'))),
    /is outside the session's workspace/
  )
  // Configured AND inside: still honoured, that is what the option is for.
  assert.equal(
    await sessionWebroot(path.join(root, 'wpdemo', WEBROOT_DIR), session(path.join(root, 'wpdemo'))),
    path.join(root, 'wpdemo', WEBROOT_DIR)
  )
})

test('sessionWebroot: a `.webroot` SYMLINKED into another site is refused', async () => {
  // Every path segment says `wpdemo`; only realpath sees where it lands. The same escape the
  // subprocess provider's path fence resolves for read/write/glob.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sites-')))
  await mkdir(path.join(root, 'fijitrips', WEBROOT_DIR), { recursive: true })
  await mkdir(path.join(root, 'wpdemo'), { recursive: true })
  await symlink(path.join(root, 'fijitrips', WEBROOT_DIR), path.join(root, 'wpdemo', WEBROOT_DIR))
  await assert.rejects(
    () => sessionWebroot(undefined, session(path.join(root, 'wpdemo'))),
    /is outside the session's workspace/
  )
})

test('sessionWebroot: a site folder with no `.webroot` reads the folder itself, still fenced', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sites-')))
  await mkdir(path.join(root, 'wpdemo'), { recursive: true })
  assert.equal(await sessionWebroot(undefined, session(path.join(root, 'wpdemo'))), path.join(root, 'wpdemo'))
})

/** Two sites whose labels share a prefix (`wpdemo`, `wpdemo2`), plus a nested folder in the first. */
async function prefixSites(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sites-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const label of ['wpdemo', 'wpdemo2']) {
    await mkdir(path.join(root, label, WEBROOT_DIR, 'wp-includes'), { recursive: true })
    await writeFile(path.join(root, label, WEBROOT_DIR, 'wp-includes/version.php'), '<?php', 'utf8')
  }
  await mkdir(path.join(root, 'wpdemo', 'staging', 'public'), { recursive: true })
  return root
}

test('sessionWebroot: a sibling site whose label only STARTS with this one is another site', async (t) => {
  // `/site/wpdemo2` begins with `/site/wpdemo`: a comparison without the path separator reads the
  // neighbour as part of this workspace.
  const root = await prefixSites(t)
  const own = session(path.join(root, 'wpdemo'))
  for (const configured of [path.join(root, 'wpdemo2', WEBROOT_DIR), path.join(root, 'wpdemo2')]) {
    await assert.rejects(() => sessionWebroot(configured, own), /is outside the session's workspace/)
  }
  // The longer label is fenced from the shorter one too.
  await assert.rejects(
    () => sessionWebroot(path.join(root, 'wpdemo', WEBROOT_DIR), session(path.join(root, 'wpdemo2'))),
    /is outside the session's workspace/
  )
})

test('sessionWebroot: a `.webroot` SYMLINKED into the prefix-sharing sibling is refused', async (t) => {
  const root = await prefixSites(t)
  await rm(path.join(root, 'wpdemo', WEBROOT_DIR), { recursive: true })
  await symlink(path.join(root, 'wpdemo2', WEBROOT_DIR), path.join(root, 'wpdemo', WEBROOT_DIR))
  await assert.rejects(
    () => sessionWebroot(undefined, session(path.join(root, 'wpdemo'))),
    /is outside the session's workspace/
  )
})

test('sessionWebroot: beside a prefix-sharing sibling, the workspace itself and a nested folder stay readable', async (t) => {
  const root = await prefixSites(t)
  const own = session(path.join(root, 'wpdemo'))
  assert.equal(await sessionWebroot(path.join(root, 'wpdemo'), own), path.join(root, 'wpdemo'))
  assert.equal(await sessionWebroot(undefined, own), path.join(root, 'wpdemo', WEBROOT_DIR))
  assert.equal(
    await sessionWebroot(path.join(root, 'wpdemo', 'staging', 'public'), own),
    path.join(root, 'wpdemo', 'staging', 'public')
  )
})
