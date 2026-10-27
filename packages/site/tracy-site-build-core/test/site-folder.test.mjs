/**
 * Which site folder a path belongs to.
 *
 * The question this answers used to be answered by `process.cwd()`, which names the PROCESS and
 * not the site. One dsh serves many sites since ADR 0014, and a dev lane starts dsh from the
 * repository root — so the check stage looked for `<repo>/.webroot/wp-config.php` and every build
 * stopped at "This site's CMS could not be read from its working copy", a sentence naming no path.
 * Measured 08/09; three fixes aimed at the workspace, at `/site` and at `sitesRoot` all missed,
 * because none of them is the value that was read.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { siteFolderFrom } from '../src/host/host.ts'

/** A site folder with a working copy in it, plus whatever extra directories are asked for. */
function siteAt(...extra) {
  const root = mkdtempSync(path.join(tmpdir(), 'site-folder-'))
  mkdirSync(path.join(root, '.webroot'), { recursive: true })
  writeFileSync(path.join(root, '.webroot', 'wp-config.php'), '<?php')
  for (const dir of extra) mkdirSync(path.join(root, dir), { recursive: true })
  return root
}

test('the site folder is itself', () => {
  const root = siteAt()
  assert.equal(siteFolderFrom(root), root)
})

test('a workspace INSIDE the site still names the site', () => {
  // The shape that broke a real run: the customer made `33333` inside their site folder and
  // opened the session there, so an exact-match check reported no CMS on a site that had one.
  const root = siteAt('33333')
  assert.equal(siteFolderFrom(path.join(root, '33333')), root)
})

test('deeper still, because a customer folder can nest', () => {
  const root = siteAt(path.join('a', 'b', 'c'))
  assert.equal(siteFolderFrom(path.join(root, 'a', 'b', 'c')), root)
})

test('a path with no site above it answers null, not a guess', () => {
  // Null is the point: the caller then falls back to what it was configured with, rather than
  // silently working on a directory that is not a site.
  const bare = mkdtempSync(path.join(tmpdir(), 'no-site-'))
  assert.equal(siteFolderFrom(bare), null)
})

test('the working-copy name is a parameter, because Joomla lanes may differ', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'site-folder-'))
  mkdirSync(path.join(root, 'public'), { recursive: true })
  assert.equal(siteFolderFrom(root, 'public'), root)
  assert.equal(siteFolderFrom(root), null)
})

/**
 * Which chip the first take is written onto.
 *
 * A chip is a REAL page of the site (read off it by the agent in step 1 of tracy-design-system) or
 * one of the design system's own sample products, which every inspiration carries. A site built
 * from nothing has no real pages, so asking for `/` gets 404 NO_SUCH_CHIP from a door answering
 * correctly — measured 08/09 on a fresh WordPress build.
 */
test('a site nobody has read writes onto the design system own landing', async () => {
  const { firstChip } = await import('../src/host/stages-shared.mjs')
  assert.equal(firstChip([]), 'landing')
  assert.equal(firstChip(undefined), 'landing')
})

test('a site that HAS been read writes onto its own home page', async () => {
  const { firstChip } = await import('../src/host/stages-shared.mjs')
  assert.equal(
    firstChip([
      { path: '/', type: 'home' },
      { path: '/pricing', type: 'pricing' }
    ]),
    '/'
  )
})

test('pages without a home row still fall back to the landing artifact', async () => {
  const { firstChip } = await import('../src/host/stages-shared.mjs')
  assert.equal(firstChip([{ path: '/pricing', type: 'pricing' }]), 'landing')
})
