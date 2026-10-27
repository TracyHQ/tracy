/**
 * `media.scan` lists this site's pictures only (survey 08/10/2026): a media root that www-data
 * turned into a link to another customer's folder (`wp-content/uploads` → `/site/<other>/…`) listed
 * that customer's pictures, because the roots were opened by name. It drives the shipped
 * `lib/index.js`, as `handler.test.mjs` does.
 *
 *   node --test packages/tools/tracy-site-tools/test/media-scan-fence.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'

/** A PNG header that `imageSize` reads as 4×3. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000040000000308060000000000000000', 'hex')

/** Two WordPress sites under one sites root; `mine` is the session's. */
function twoSites() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tch-media-')))
  for (const label of ['mine', 'other']) {
    mkdirSync(path.join(root, label, '.webroot', 'wp-includes'), { recursive: true })
    writeFileSync(path.join(root, label, '.webroot', 'wp-includes', 'version.php'), '<?php')
  }
  mkdirSync(path.join(root, 'other', '.webroot', 'wp-content', 'uploads'), { recursive: true })
  writeFileSync(path.join(root, 'other', '.webroot', 'wp-content', 'uploads', 'private-photo.png'), PNG)
  mkdirSync(path.join(root, 'mine', '.webroot', 'wp-content'), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return root
}

function scan(root) {
  const tools = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => (tools.set(t.name, t), () => {}) },
      effect: (setup) => setup(),
      on: () => {},
      get: () => undefined
    },
    {}
  )
  return tools
    .get('tracy_site')
    .execute(
      { action: 'media.scan' },
      { agent: { session: { id: 'session-x', header: { cwd: path.join(root, 'mine') } } } }
    )
}

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test("an uploads folder linked into another site lists none of that site's pictures", async () => {
  const root = twoSites()
  symlinkSync(
    path.join(root, 'other', '.webroot', 'wp-content', 'uploads'),
    path.join(root, 'mine', '.webroot', 'wp-content', 'uploads')
  )
  const answer = JSON.stringify(await scan(root))
  assert.doesNotMatch(answer, /private-photo/)
})

test('the site’s own uploads are still listed', async () => {
  const root = twoSites()
  mkdirSync(path.join(root, 'mine', '.webroot', 'wp-content', 'uploads'), { recursive: true })
  writeFileSync(path.join(root, 'mine', '.webroot', 'wp-content', 'uploads', 'hero.png'), PNG)
  const answer = JSON.stringify(await scan(root))
  assert.match(answer, /wp-content\/uploads\/hero\.png/)
})
