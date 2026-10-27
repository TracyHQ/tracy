/**
 * Two local packs of one template element (`tracy-base/j6`, `tracy-apple/j6`: both name the template
 * `tracy`) are two cards, each pressed installs its own pack; a pack that carries no card (Tracy Apple's
 * release has none) gets a stand-in one. Without local packs, a published card keeps the id its card names.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { readLocalPacks } from '../src/lib/local-releases.js'
import { templateCards, templateRelease } from '../src/lib/quickstart-releases.js'

const sha = (text) => createHash('sha256').update(text).digest('hex')

/** A pack whose card names the template `tracy`, as both Tracy Base and Tracy Apple do. */
function writePack(dir, slug, label, { card = true } = {}) {
  const at = join(dir, slug, 'j6')
  mkdirSync(at, { recursive: true })
  const files = { 'w.tar.gz': `${slug} webroot`, 'd.sql.gz': `${slug} dump` }
  for (const [name, body] of Object.entries(files)) writeFileSync(join(at, name), body)
  writeFileSync(
    join(at, 'tracy_setting.json'),
    JSON.stringify({
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label,
      version: '1.0.0',
      cms: '6.1.1',
      install: {
        webroot: { file: 'w.tar.gz', sha256: sha(files['w.tar.gz']) },
        database: { file: 'd.sql.gz', sha256: sha(files['d.sql.gz']) }
      },
      template: 'tracy'
    })
  )
  if (!card) return
  writeFileSync(
    join(at, 'tracy_design_inspiration.json'),
    JSON.stringify({
      schemaVersion: 'tracy-design-inspiration/v1',
      template: 'tracy',
      provider: 'Tracy',
      category: 'Professional & Corporate',
      blurb: `${label}.`,
      image: 'home-1440.png',
      layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'home-1440.png' } }]
    })
  )
  writeFileSync(join(at, 'home-1440.png'), 'png bytes')
}

/** The row `readReleases` would hand out for a pack. */
const rowOf = (pack) => ({
  tag: pack.release.tag_name,
  choosable: true,
  platform: pack.setting.platform,
  setting: pack.setting,
  inspiration: pack.inspiration,
  inspirationHidden: false,
  local: pack.release.local
})

test('two local packs of one template element are two cards, each installing its own pack', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'local-card-per-pack-'))
  writePack(dir, 'tracy-base', 'Tracy Base')
  writePack(dir, 'tracy-apple', 'Tracy Apple', { card: false })
  const packs = await readLocalPacks(dir)
  assert.deepEqual(packs.map((p) => p.inspiration.template).sort(), ['local-tracy-apple', 'local-tracy-base'])
  assert.deepEqual(
    packs.map((p) => p.cardReason),
    [null, null]
  )
  // the stand-in card names no picture, so only the pack carrying its own card has shots
  assert.deepEqual(
    packs.flatMap((p) => p.shots.map((s) => s.templateId)),
    ['local-tracy-base']
  )

  const releases = packs.map(rowOf)
  const cards = templateCards(releases)
  assert.deepEqual(cards.map((t) => [t.id, t.label, t.platforms.map((p) => p.tag)]).sort(), [
    ['local-tracy-apple', 'Tracy Apple (local)', ['local/tracy-apple/j6']],
    ['local-tracy-base', 'Tracy Base (local)', ['local/tracy-base/j6']]
  ])
  assert.equal(templateRelease(releases, 'joomla', 'local-tracy-apple'), 'local/tracy-apple/j6')
  assert.equal(templateRelease(releases, 'joomla', 'local-tracy-base'), 'local/tracy-base/j6')
})

test('without local packs, a published card keeps the id its card names', () => {
  const published = (tag, label) => ({
    tag,
    choosable: true,
    platform: 'joomla',
    setting: { platform: 'joomla', label, version: '1.0.0', template: 'tracy' },
    inspiration: { template: 'tracy', image: 'home-1440.png' },
    inspirationHidden: false,
    local: null
  })
  const releases = [published('tracy-base/j6', 'Tracy Base')]
  assert.deepEqual(
    templateCards(releases).map((t) => [t.id, t.label, t.local ?? false]),
    [['tracy', 'Tracy Base', false]]
  )
  assert.equal(templateRelease(releases, 'joomla', 'tracy'), 'tracy-base/j6')
})
