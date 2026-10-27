/**
 * Quickstart packs read off `TRACY_LOCAL_RELEASES_DIR` (`src/lib/local-releases.js`): held to the
 * validators a release is held to, offered as a card of their own beside the published one, and
 * installed from a `file:` address the host checks — without replacing anything published.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, after, before, beforeEach } from 'node:test'

import { contractFor, readContracts, coworkPinFor } from '../src/lib/contracts.js'
import { defaultDemoLabel } from '../src/lib/demo-domain.js'
import { isLocalTag, localTemplateId, publishedTagOf, readLocalPacks } from '../src/lib/local-releases.js'
import {
  isTemplateId,
  pagesOf,
  readReleases,
  resolveInstall,
  syncLocalReleases,
  templateCards,
  templateRelease
} from '../src/lib/quickstart-releases.js'
import { getShot } from '../src/lib/template-shots.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const sha = (text) => createHash('sha256').update(text).digest('hex')

/** A pack folder as a release would carry it: setting, card, picture and the files it installs. */
function writePack(
  dir,
  { slug = 'tracy-business', cms = 'j6', version = '1.2.0', over = {}, card = true } = {}
) {
  const at = join(dir, slug, cms)
  mkdirSync(at, { recursive: true })
  const files = { 'w.tar.gz': 'webroot bytes', 'd.sql.gz': 'dump bytes', 'r.zip': 'cowork bytes' }
  for (const [name, body] of Object.entries(files)) writeFileSync(join(at, name), body)
  writeFileSync(
    join(at, 'tracy_setting.json'),
    JSON.stringify({
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'Tracy Business',
      version,
      cms: '6.1.1',
      install: {
        webroot: { file: 'w.tar.gz', sha256: sha(files['w.tar.gz']) },
        database: { file: 'd.sql.gz', sha256: sha(files['d.sql.gz']) },
        cowork: { file: 'r.zip', sha256: sha(files['r.zip']) }
      },
      template: 'tracy_business',
      ...over
    })
  )
  if (card) {
    writeFileSync(
      join(at, 'tracy_design_inspiration.json'),
      JSON.stringify({
        schemaVersion: 'tracy-design-inspiration/v1',
        template: 'tracy-business',
        provider: 'JoomlArt',
        category: 'Professional & Corporate',
        blurb: 'Not published yet.',
        image: 'business-home-1440.png',
        layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'business-home-1440.png' } }]
      })
    )
    writeFileSync(join(at, 'business-home-1440.png'), 'png bytes')
  }
  return at
}

const scratch = () => mkdtempSync(join(tmpdir(), 'local-releases-'))

test('a local tag names the release it stands for, and its card an id of its own', () => {
  assert.equal(isLocalTag('local/tracy-business/j6'), true)
  assert.equal(isLocalTag('tracy-business/j6'), false)
  assert.equal(publishedTagOf('local/tracy-business/j6'), 'tracy-business/j6')
  assert.equal(publishedTagOf('quickstart/ja-kinetic/j6'), 'quickstart/ja-kinetic/j6')
  assert.equal(localTemplateId('tracy_business'), 'local-tracy-business')
  // A local demo never proposes the published release's address.
  assert.equal(defaultDemoLabel('tracy-business/j6', 'joomla'), 'business-joomla')
  assert.equal(defaultDemoLabel('local/tracy-business/j6', 'joomla'), 'local-business-joomla')
})

test('a pack is read with the release validators: ready, prerelease-like, its card renamed', async () => {
  const dir = scratch()
  const at = writePack(dir)
  const [pack] = await readLocalPacks(dir)
  assert.equal(pack.release.tag_name, 'local/tracy-business/j6')
  assert.equal(pack.release.prerelease, true)
  assert.equal(pack.release.published_at, null, 'sorts after every release, never a default base')
  assert.deepEqual(pack.release.local, { dir: at })
  assert.equal(pack.reason, null)
  assert.equal(pack.setting.version, '1.2.0')
  assert.equal(pack.inspiration.template, 'local-tracy-business')
  assert.deepEqual(
    pack.shots.map((s) => [s.templateId, s.file]),
    [['local-tracy-business', 'business-home-1440.png']]
  )
})

test('a pack missing a file, or whose file is not the one pinned, says why in its own words', async () => {
  const dir = scratch()
  writePack(dir, {
    slug: 'missing',
    over: {
      install: {
        webroot: { file: 'gone.tar.gz', sha256: sha('x') },
        database: { file: 'd.sql.gz', sha256: sha('dump bytes') }
      }
    }
  })
  writePack(dir, {
    slug: 'replaced',
    over: {
      install: {
        webroot: { file: 'w.tar.gz', sha256: sha('other bytes') },
        database: { file: 'd.sql.gz', sha256: sha('dump bytes') }
      }
    }
  })
  mkdirSync(join(dir, 'empty', 'j6'), { recursive: true })
  const packs = await readLocalPacks(dir)
  const by = Object.fromEntries(packs.map((p) => [p.release.tag_name, p]))
  assert.match(by['local/missing/j6'].reason, /gone\.tar\.gz" is not an asset of this release/)
  assert.match(
    by['local/replaced/j6'].reason,
    /must match w\.tar\.gz in this local pack — the file hashes to/
  )
  assert.doesNotMatch(by['local/replaced/j6'].reason, /GitHub/, 'GitHub never saw these files')
  assert.match(by['local/empty/j6'].reason, /No tracy_setting\.json in this local pack/)
  assert.equal(by['local/empty/j6'].setting, null)
})

test('a local pack is sealed as the release it stands for, at the same version', () => {
  const index = readContracts()
  const published = contractFor(index, 'tracy-business/j6', '1.2.0')
  assert.ok(published, 'the repository seals tracy-business/j6 1.2.0')
  assert.deepEqual(contractFor(index, 'local/tracy-business/j6', '1.2.0'), published)
  // A slug no release uses has no profile: installed as released, as a template card is.
  assert.equal(contractFor(index, 'local/tracy-business-next/j6', '1.2.0'), null)
})

test('a JoomlArt pack sits under quickstart/ and is sealed and pinned as its release is', async () => {
  const dir = scratch()
  writePack(dir, {
    slug: 'quickstart/ja-essence',
    version: '1.0.2',
    over: { label: 'JA Essence', template: 'ja_essence' }
  })
  // The bare spelling stands for a release that does not exist: read, but sealed by nothing.
  writePack(dir, { slug: 'ja-essence', version: '1.0.2' })
  const by = Object.fromEntries((await readLocalPacks(dir)).map((p) => [p.release.tag_name, p]))
  assert.deepEqual(Object.keys(by).sort(), ['local/ja-essence/j6', 'local/quickstart/ja-essence/j6'])
  const pack = by['local/quickstart/ja-essence/j6']
  assert.equal(pack.reason, null)
  assert.equal(publishedTagOf(pack.release.tag_name), 'quickstart/ja-essence/j6')
  // Still a card of its own beside the published one.
  assert.match(pack.release.name, /\(local\)$/)
  assert.match(pack.inspiration.template, /^local-/)
  const index = readContracts()
  const published = contractFor(index, 'quickstart/ja-essence/j6', '1.0.2')
  assert.ok(published, 'the repository seals quickstart/ja-essence/j6 1.0.2')
  assert.deepEqual(contractFor(index, pack.release.tag_name, pack.setting.version), published)
  assert.equal(contractFor(index, 'local/ja-essence/j6', '1.0.2'), null)
  // The Claude Cowork pin is looked up the same way.
  const kinetic = coworkPinFor('quickstart/ja-kinetic/j6', '1.0.0')
  assert.ok(kinetic, 'quickstarts.json pins a Claude Cowork plugin for quickstart/ja-kinetic/j6')
  assert.deepEqual(coworkPinFor('local/quickstart/ja-kinetic/j6', '1.0.0'), kinetic)
})

/** A published `tracy-business/j6` with its card, as `seedTemplateReleases` writes one. */
async function seedPublished(pool) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ('tracy-business/j6', $1::jsonb, $2::jsonb, 'ready', null)`,
    [
      JSON.stringify({
        name: 'tracy-business/j6',
        kind: 'quickstart',
        github: 'published',
        publishedAt: '2026-09-20T00:00:00Z',
        assets: [
          { name: 'w.tar.gz', id: 4011, size: 40 },
          { name: 'd.sql.gz', id: 4012, size: 20 }
        ]
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label: 'Tracy Business',
        version: '1.2.0',
        cms: '6.1.1',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        },
        template: 'tracy_business',
        card: { template: 'tracy-business', image: 'business-home-1440.png' }
      })
    ]
  )
}

test(
  'the published card and the local card are two cards, and each press installs its own',
  opts,
  async () => {
    const { pool } = db
    const dir = scratch()
    await seedPublished(pool)
    const at = writePack(dir)
    const read = await syncLocalReleases(pool, dir, { log: {} })
    assert.deepEqual(read, { ok: true, count: 1 })

    const releases = await readReleases(pool)
    const local = releases.find((r) => r.tag === 'local/tracy-business/j6')
    assert.equal(local.choosable, true)
    assert.equal(local.github, 'prerelease')
    assert.equal(local.name, 'Tracy Business 1.2.0 (local)')
    assert.equal(releases.at(-1).tag, 'local/tracy-business/j6', 'after every published release')

    const cards = templateCards(releases)
    assert.deepEqual(
      cards.map((t) => [t.id, t.label, t.local ?? false, t.platforms.map((p) => p.tag)]),
      [
        ['tracy-business', 'Tracy Business', false, ['tracy-business/j6']],
        ['local-tracy-business', 'Tracy Business (local)', true, ['local/tracy-business/j6']]
      ]
    )
    assert.equal(templateRelease(releases, 'joomla', 'tracy-business'), 'tracy-business/j6')
    assert.equal(templateRelease(releases, 'joomla', 'local-tracy-business'), 'local/tracy-business/j6')
    assert.equal(isTemplateId(releases, 'local-tracy-business'), true)

    // The install: file addresses inside the pack, sized now, no asset id — and the seal the
    // published release of that version carries.
    const entry = await resolveInstall(pool, 'local/tracy-business/j6')
    assert.equal(entry.webroot.url, `file://${join(at, 'w.tar.gz')}`)
    assert.equal(entry.webroot.bytes, 'webroot bytes'.length)
    assert.equal(entry.webroot.githubAssetId, null)
    // The Claude Cowork plugin is decided as for the published release: a pin that overrides the release
    // (`overridesRelease`, quickstarts.json) overrides the pack too, else the pack's own stands.
    const pin = coworkPinFor('tracy-business/j6', '1.2.0')
    if (pin?.overridesRelease) assert.equal(entry.cowork.githubAssetId, pin.githubAssetId)
    else assert.equal(entry.cowork.url, `file://${join(at, 'r.zip')}`)
    assert.equal(entry.contract, contractFor(readContracts(), 'tracy-business/j6', '1.2.0').id)
    assert.deepEqual(entry.template, { id: 'tracy_business' })
    assert.equal((await resolveInstall(pool, 'tracy-business/j6')).webroot.githubAssetId, 4011)

    // A file edited after the read is refused by the host before it downloads, with the reason.
    writeFileSync(join(at, 'w.tar.gz'), 'edited bytes')
    const stale = await resolveInstall(pool, 'local/tracy-business/j6')
    assert.equal(stale.webroot.bytes, null)
    assert.match(stale.webroot.pending, /changed after the pack was read/)

    // The card's picture is in the store every card is drawn from.
    const shot = await getShot(pool, 'local-tracy-business', 'business-home-1440.png')
    assert.equal(shot.bytes.toString(), 'png bytes')

    // A pack removed from the folder leaves the list; a stand with no folder keeps no local row.
    rmSync(join(dir, 'tracy-business'), { recursive: true })
    writePack(dir, { slug: 'tracy-business-next' })
    await syncLocalReleases(pool, dir, { log: {} })
    assert.deepEqual((await readReleases(pool)).map((r) => r.tag).sort(), [
      'local/tracy-business-next/j6',
      'tracy-business/j6'
    ])
    await syncLocalReleases(pool, null, { log: {} })
    assert.deepEqual(
      (await readReleases(pool)).map((r) => r.tag),
      ['tracy-business/j6']
    )
  }
)

test('a folder that cannot be read keeps the last reading', opts, async () => {
  const { pool } = db
  const dir = scratch()
  writePack(dir)
  await syncLocalReleases(pool, dir, { log: {} })
  const failed = await syncLocalReleases(pool, join(dir, 'nowhere'), { log: {} })
  assert.equal(failed.ok, false)
  assert.match(failed.reason, /could not be read/)
  assert.deepEqual(
    (await readReleases(pool)).map((r) => r.tag),
    ['local/tracy-business/j6']
  )
})

const PAGES = [
  { id: 'home', label: 'Home', home: true },
  { id: 'about', label: 'About' }
]

test('a pack carrying tracy_site_pages.json has its pages read; a bad one is a reason, not a lost pack', async () => {
  const dir = scratch()
  writeFileSync(
    join(writePack(dir, { slug: 'good' }), 'tracy_site_pages.json'),
    JSON.stringify({ pages: PAGES })
  )
  writeFileSync(
    join(writePack(dir, { slug: 'twohomes' }), 'tracy_site_pages.json'),
    JSON.stringify({ pages: PAGES.map((p) => ({ ...p, home: true })) })
  )
  writePack(dir, { slug: 'none' })
  const by = Object.fromEntries((await readLocalPacks(dir)).map((p) => [p.release.tag_name, p]))
  assert.deepEqual(by['local/good/j6'].pages, PAGES)
  assert.equal(by['local/good/j6'].pagesReason, null)
  assert.equal(by['local/twohomes/j6'].pages, null)
  assert.match(by['local/twohomes/j6'].pagesReason, /tracy_site_pages\.json: .*home/)
  assert.ok(by['local/twohomes/j6'].setting, 'the pack itself still reads')
  assert.equal(by['local/none/j6'].pages, null)
  assert.equal(by['local/none/j6'].pagesReason, null)
})

test(
  "a local pack's pages reach its release row, and a refused file says so in the reason",
  opts,
  async () => {
    const { pool } = db
    const dir = scratch()
    writeFileSync(
      join(writePack(dir, { slug: 'good' }), 'tracy_site_pages.json'),
      JSON.stringify({ pages: PAGES })
    )
    writeFileSync(
      join(writePack(dir, { slug: 'bad', card: false }), 'tracy_site_pages.json'),
      '{"pages": []}'
    )
    await syncLocalReleases(pool, dir, { log: {} })
    const rows = await readReleases(pool)
    assert.deepEqual(pagesOf(rows.find((r) => r.tag === 'local/good/j6')), PAGES)
    const bad = rows.find((r) => r.tag === 'local/bad/j6')
    assert.equal(pagesOf(bad), null)
    assert.equal(bad.choosable, true)
    assert.match(bad.reason, /tracy_site_pages\.json/)
  }
)
