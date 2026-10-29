/**
 * Reading joomlart-products: what the list looks like when most releases say nothing about themselves,
 * what happens when GitHub does not answer, and how a changed questionnaire arrives.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generateKeyPairSync } from 'node:crypto'

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { designOfRelease, readContracts } from '../src/lib/contracts.js'
import { validateDesignInspiration, validateSetting } from '../src/lib/tracy-setting.mjs'
import {
  cardIdOf,
  cardSources,
  digestsOf,
  isTemplateId,
  joomlaAddresses,
  readReleases,
  pagesOf,
  readingOf,
  syncReleases,
  shownDesign,
  templateCards,
  templateDesign,
  templateOfTag,
  templateRelease
} from '../src/lib/quickstart-releases.js'

/** A throwaway key: the App path signs a JWT before it asks for anything. */
const KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
}).privateKey

const sha = (c) => c.repeat(64)
/** The two files an EmDash quickstart installs — an asset list that does not carry them is refused. */
const EMDASH_FILES = {
  'tracy-business-emdash-quickstart-1.0.0.zip': 'zip bytes',
  'tracy-business-emdash-state-1.0.0.tar.gz': 'tar bytes'
}
const setting = (over = {}) => ({
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.0.0',
  cms: '0.37.0',
  install: {
    source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: sha('a') },
    state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: sha('b') }
  },
  ...over
})
const questions = (label) => ({
  schemaVersion: 'tracy-questions/v1',
  owner: 'tracy-business/emdash-0.x',
  languages: ['en'],
  questions: [{ id: 'name', kind: 'text', step: 1, label: { en: label }, feeds: ['site.name'] }]
})

/** A release as the API gives it, with the files it carries served from the same object. */
function stub(releases) {
  const files = new Map()
  const list = releases.map((r) => {
    const assets = Object.entries(r.files ?? {}).map(([name, body]) => {
      const url = `https://api.github.invalid/${r.tag}/${name}`
      files.set(url, typeof body === 'string' ? body : JSON.stringify(body))
      return { name, url, browser_download_url: url }
    })
    return {
      tag_name: r.tag,
      name: r.name ?? r.tag,
      draft: r.draft ?? false,
      prerelease: r.prerelease ?? false,
      published_at: r.published_at ?? '2026-09-14T19:33:55Z',
      assets
    }
  })
  let calls = 0
  const fetchImpl = async (url) => {
    calls += 1
    if (String(url).includes('/releases')) return new Response(JSON.stringify(list), { status: 200 })
    const body = files.get(String(url))
    return body === undefined
      ? new Response('not found', { status: 404 })
      : new Response(body, { status: 200 })
  }
  return { fetchImpl, calls: () => calls }
}

/** A pool that remembers rows by table, enough for the three tables this module writes. */
function memoryPool() {
  const rows = { quickstart_releases: new Map(), question_set: new Map(), question_choice: new Map() }
  return {
    rows,
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ').trim()
      if (text.startsWith('insert into quickstart_releases')) {
        rows.quickstart_releases.set(params[0], {
          tag: params[0],
          release: params[1],
          setting: params[2],
          inspiration: params[3],
          tracy: params[4],
          reason: params[5],
          inspiration_hidden: params[6],
          pages: params[7],
          fetched_at: new Date().toISOString()
        })
        return { rows: [] }
      }
      if (text.startsWith('select tag')) return { rows: [...rows.quickstart_releases.values()] }
      if (text.startsWith('select id')) return { rows: [...rows.question_set.values()] }
      if (text.startsWith('insert into question_set')) {
        rows.question_set.set(params[0], {
          id: params[0],
          owner: params[1],
          name: params[2],
          source: params[3],
          version: params[4],
          sha256: params[5],
          doc: params[6]
        })
        return { rows: [] }
      }
      return { rows: [] }
    }
  }
}

test('a release with a valid setting is ready; one with none is listed and says why', async () => {
  const { fetchImpl } = stub([
    { tag: 'tracy-business/emdash-0.x', files: { ...EMDASH_FILES, 'tracy_setting.json': setting() } },
    {
      tag: 'quickstart/ja-kinetic/j6',
      prerelease: true,
      files: { 'ja-kinetic-j6-quickstart-1.0.0.zip': 'zip' }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })

  const read = await readReleases(pool)
  assert.equal(read.length, 2)
  const business = read.find((r) => r.tag === 'tracy-business/emdash-0.x')
  assert.equal(business.tracy, 'ready')
  assert.equal(business.kind, 'quickstart')
  assert.equal(business.github, 'published')
  assert.equal(business.setting.label, 'Tracy Business')

  const kinetic = read.find((r) => r.tag === 'quickstart/ja-kinetic/j6')
  assert.equal(kinetic.tracy, 'no-setting')
  assert.equal(kinetic.github, 'prerelease')
  assert.match(kinetic.reason, /tracy_setting\.json/)
})

test('a setting that names a file the release does not carry is invalid, with the sentence kept', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-apple/j6',
      files: {
        'tracy_setting.json': {
          ...setting({ platform: 'joomla', label: 'Tracy Apple', cms: '6.1.1' }),
          install: {
            webroot: { file: 'tracy-apple-j6-webroot-1.2.0.tar.gz', sha256: sha('c') },
            database: { file: 'tracy-apple-j6-database-1.2.0.sql.gz', sha256: sha('d') }
          }
        }
      }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [apple] = await readReleases(pool)
  assert.equal(apple.tracy, 'invalid')
  assert.match(apple.reason, /is not an asset of this release/)
  assert.equal(apple.setting, null)
})

test('a draft is read and kept, and it is not choosable', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-base/wp7',
      draft: true,
      files: {
        'w.tar.gz': 'webroot',
        'd.sql.gz': 'database',
        'tracy_setting.json': setting({
          platform: 'wordpress',
          install: {
            webroot: { file: 'w.tar.gz', sha256: sha('a') },
            database: { file: 'd.sql.gz', sha256: sha('b') }
          }
        })
      }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [wp] = await readReleases(pool)
  assert.equal(wp.github, 'draft')
  assert.equal(wp.tracy, 'ready')
  assert.equal(wp.choosable, false)
  assert.deepEqual(await readReleases(pool, { choosable: true }), [])
})

test('GitHub not answering leaves the last reading alone — the screen says how old it is', async () => {
  const pool = memoryPool()
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([
      { tag: 'tracy-business/emdash-0.x', files: { ...EMDASH_FILES, 'tracy_setting.json': setting() } }
    ]).fetchImpl
  })
  const before = await readReleases(pool)

  const result = await syncReleases(pool, {
    token: 't',
    fetchImpl: async () => new Response('bad gateway', { status: 502 })
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /502/)
  assert.deepEqual(
    (await readReleases(pool)).map((r) => r.tag),
    before.map((r) => r.tag)
  )
})

test('a released questionnaire arrives as a candidate, and a changed one ADDS a second', async () => {
  const pool = memoryPool()
  const one = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting(),
        'tracy_site_question.json': questions('Business name')
      }
    }
  ])
  await syncReleases(pool, { token: 't', fetchImpl: one.fetchImpl })
  assert.equal(pool.rows.question_set.size, 1)
  const [first] = [...pool.rows.question_set.values()]
  assert.equal(first.source, 'released')
  assert.equal(first.owner, 'tracy-business/emdash-0.x')

  const two = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting({ version: '1.1.0' }),
        'tracy_site_question.json': questions('What is the company called?')
      }
    }
  ])
  await syncReleases(pool, { token: 't', fetchImpl: two.fetchImpl })
  assert.equal(pool.rows.question_set.size, 2, 'the new file is another candidate, not a replacement')

  // Reading the same file again adds nothing: the sha is the identity.
  await syncReleases(pool, { token: 't', fetchImpl: two.fetchImpl })
  assert.equal(pool.rows.question_set.size, 2)
})

test('readingOf turns one release into the three axes a screen draws', () => {
  const r = readingOf(
    { tag_name: 'tracy-airbnb/j6', draft: false, prerelease: false, assets: [] },
    null,
    null
  )
  assert.equal(r.github, 'published')
  assert.equal(r.tracy, 'no-setting')
})

test('the token comes from the App when it is configured, and from a plain key when it is not', async () => {
  const { releasesToken } = await import('../src/lib/quickstart-releases.js')

  // No App and no key: the reading is off, and the reason says which of the two to set.
  const off = await releasesToken({ github: null, releasesToken: null })
  assert.equal(off.token, null)
  assert.match(off.reason, /TRACY_RELEASES_GITHUB_TOKEN|GitHub App/)

  // A plain key is used as it is — the way a developer's stand reads the same releases.
  const plain = await releasesToken({ github: null, releasesToken: 'ghp_x' })
  assert.deepEqual(plain, { token: 'ghp_x', reason: null })

  // With the App configured, a repo-scoped installation token is minted instead.
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    if (String(url).endsWith('/installation'))
      return new Response(JSON.stringify({ id: 42 }), { status: 200 })
    return new Response(JSON.stringify({ token: 'ghs_minted', expires_at: 'soon' }), { status: 201 })
  }
  const app = await releasesToken(
    { github: { appId: '1', privateKey: KEY, org: 'TracyHQ', webhookSecret: 's' }, releasesToken: null },
    fetchImpl
  )
  assert.equal(app.token, 'ghs_minted')
  assert.ok(calls.some((u) => u.includes('joomlart-products/installation')))
})

test('a release event on the releases repo triggers a read; anything else is ignored', async () => {
  const { releaseEventWanted } = await import('../src/lib/quickstart-releases.js')
  assert.equal(
    releaseEventWanted('release', {
      action: 'published',
      repository: { full_name: 'JoomlArt-Products/joomlart-products' }
    }),
    true
  )
  // An edit or a delete moves the list just as much as a publish does.
  assert.equal(
    releaseEventWanted('release', {
      action: 'edited',
      repository: { full_name: 'JoomlArt-Products/joomlart-products' }
    }),
    true
  )
  // Another repository's release says nothing about the quickstarts.
  assert.equal(
    releaseEventWanted('release', { action: 'published', repository: { full_name: 'TracyHQ/tch' } }),
    false
  )
  // A push is the OTHER webhook on this door; it must not start a read of GitHub.
  assert.equal(
    releaseEventWanted('push', { repository: { full_name: 'JoomlArt-Products/joomlart-products' } }),
    false
  )
})

// ── tracy_design_inspiration.json ──────────────────────────────────────────────────────────────
//
// The card left `tracy_setting.json` on 16/09. Until the three releases carrying the old `card`
// block are cut again, both shapes are on the shelf at once — so every test below says which shape
// it is about, and one of them says which wins when a release carries both.

const inspiration = (over = {}) => ({
  schemaVersion: 'tracy-design-inspiration/v1',
  template: 'tracy-business',
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'Industrial / B2B company site.',
  image: 'business-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'business-home-1440.png' } }],
  ...over
})

/** One release as `readReleases` hands it to `templateCards`, without going near a database. */
const reading = (over = {}) => ({
  tag: 'tracy-business/emdash-0.x',
  platform: 'emdash',
  choosable: true,
  setting: setting({ template: 'tracy-business' }),
  inspiration: null,
  ...over
})

/** The `card` block a release cut before 16/09 left inside its setting. */
const legacyCard = {
  provider: 'JoomlArt',
  template: 'tracy-business',
  blurb: 'The old block.',
  image: 'x.png'
}

test('a release carrying tracy_design_inspiration.json has its card read and written down', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting({ template: 'tracy-business' }),
        'tracy_design_inspiration.json': inspiration()
      }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [row] = await readReleases(pool)
  assert.equal(row.tracy, 'ready')
  assert.equal(row.reason, null)
  assert.equal(row.inspiration.blurb, 'Industrial / B2B company site.')
  assert.equal(row.inspiration.demo, undefined, 'the demo belongs to the serving environment')
})

test('a card that is refused does not spoil a good setting: still choosable, and the reason names the file', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting({ template: 'tracy-business' }),
        'tracy_design_inspiration.json': inspiration({ provider: 'Acme' })
      }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [row] = await readReleases(pool)
  assert.equal(row.tracy, 'ready')
  assert.equal(row.choosable, true, 'a wrong card is not a reason to refuse to build a site')
  assert.equal(row.inspiration, null, 'a card that cannot be trusted is dropped, never half-drawn')
  assert.match(row.reason, /tracy_design_inspiration\.json/)
  assert.match(row.reason, /provider must be one of/)
  assert.deepEqual(templateCards([row]), [])
})

test('templateCards reads the file when there is one', () => {
  const [card] = templateCards([reading({ inspiration: inspiration() })])
  assert.equal(card.id, 'tracy-business')
  assert.equal(card.card.blurb, 'Industrial / B2B company site.')
})

test('one template, three CMS cards: the first shown release supplies the card, and cardSources names it', () => {
  const rows = [
    reading({
      tag: 'tracy-business/wp7',
      platform: 'wordpress',
      inspiration: inspiration({ blurb: 'WordPress card.' })
    }),
    reading({
      tag: 'tracy-business/j6',
      platform: 'joomla',
      inspiration: inspiration({ blurb: 'Joomla card.' })
    }),
    reading({ inspiration: inspiration({ blurb: 'EmDash card.' }) })
  ]
  const [card] = templateCards(rows)
  assert.equal(card.card.blurb, 'WordPress card.', 'the other releases only add a platform')
  assert.deepEqual(
    card.platforms.map((p) => p.tag),
    ['tracy-business/wp7', 'tracy-business/j6', 'tracy-business/emdash-0.x']
  )
  assert.deepEqual([...cardSources(rows)], [['tracy-business', 'tracy-business/wp7']])

  // The first release hidden: the next shown one supplies the card, and cardSources moves with it.
  const hidden = [{ ...rows[0], inspirationHidden: true }, rows[1], rows[2]]
  assert.equal(templateCards(hidden)[0].card.blurb, 'Joomla card.')
  assert.deepEqual([...cardSources(hidden)], [['tracy-business', 'tracy-business/j6']])

  // Nothing shown: no card, and no release named as its source.
  const none = rows.map((r) => ({ ...r, inspirationHidden: true }))
  assert.deepEqual(templateCards(none), [])
  assert.equal(cardSources(none).size, 0)
})

test('templateCards still reads a card left inside tracy_setting.json — the releases not cut again yet', () => {
  const [card] = templateCards([
    reading({ setting: setting({ template: 'tracy-business', card: legacyCard }) })
  ])
  assert.equal(card.id, 'tracy-business')
  assert.equal(card.card.blurb, 'The old block.')
})

test('a release carrying both shapes shows the FILE — that is the one an administrator edits', () => {
  const [card] = templateCards([
    reading({
      setting: setting({ template: 'tracy-business', card: legacyCard }),
      inspiration: inspiration({ blurb: 'The file.' })
    })
  ])
  assert.equal(card.card.blurb, 'The file.')
  assert.equal(card.id, 'tracy-business')
})

test('a release with neither shape is no card at all, whatever template its setting names', () => {
  assert.deepEqual(templateCards([reading()]), [])
})

test('Create with resolves a template through either shape, so a re-cut release keeps working', () => {
  const fromFile = reading({ inspiration: inspiration() })
  const fromSetting = reading({
    tag: 'tracy-business/j6',
    platform: 'joomla',
    setting: setting({ platform: 'joomla', template: 'tracy-business', card: legacyCard })
  })
  assert.equal(templateRelease([fromFile], 'emdash', 'tracy-business'), 'tracy-business/emdash-0.x')
  assert.equal(templateRelease([fromSetting], 'joomla', 'tracy-business'), 'tracy-business/j6')
  assert.equal(templateRelease([reading()], 'emdash', 'tracy-business'), null)
  assert.equal(isTemplateId([fromFile], 'tracy-business'), true)
  assert.equal(isTemplateId([reading()], 'tracy-business'), false)
})

test("a card block that does not repeat the template id is filed under the setting's, for creation too", () => {
  // tracy-saas/emdash-0.x (1.4.0) carries its card inside tracy_setting.json WITHOUT card.template;
  // the id is the setting's own template. The gallery filed it under that id while creation by id
  // called it no template and silently built the default EmDash base instead (#1013).
  const { template: _omitted, ...cardWithoutId } = legacyCard
  const saas = reading({
    tag: 'tracy-saas/emdash-0.x',
    setting: setting({ template: 'tracy-saas', card: cardWithoutId })
  })
  assert.equal(templateCards([saas])[0]?.id, 'tracy-saas')
  assert.equal(isTemplateId([saas], 'tracy-saas'), true)
  assert.equal(templateRelease([saas], 'emdash', 'tracy-saas'), 'tracy-saas/emdash-0.x')
  assert.equal(templateOfTag([saas], 'tracy-saas/emdash-0.x'), 'tracy-saas')
})

test('the hidden mark on a release is read on refresh and takes its card off the listing only', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting({ template: 'tracy-business', card: legacyCard }),
        'tracy_design_inspiration_hidden.json': { hidden: true }
      }
    },
    {
      tag: 'tracy-business/j6',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting({ template: 'tracy-business', card: legacyCard })
      }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const rows = await readReleases(pool)
  const marked = rows.find((r) => r.tag === 'tracy-business/emdash-0.x')
  assert.equal(marked.inspirationHidden, true)
  assert.equal(rows.find((r) => r.tag === 'tracy-business/j6').inspirationHidden, false)
  assert.equal(
    marked.setting.card.blurb,
    'The old block.',
    'tracy_setting.json is read as it is, never edited'
  )

  // Off the shelf: the template's card now comes from the unmarked release alone.
  const [card] = templateCards(rows)
  assert.deepEqual(
    card.platforms.map((p) => p.tag),
    ['tracy-business/j6']
  )
  assert.deepEqual(templateCards([marked]), [])

  // Still a template: "Create with Tracy" on its demo and site creation from it are untouched.
  assert.equal(templateOfTag([marked], 'tracy-business/emdash-0.x'), 'tracy-business')
  assert.equal(isTemplateId([marked], 'tracy-business'), true)
  assert.equal(templateRelease([marked], 'emdash', 'tracy-business'), 'tracy-business/emdash-0.x')
})

test('a layout may say where it answers, and a card that says it wrongly is refused', () => {
  const withAddress = (address) =>
    validateDesignInspiration(
      inspiration({
        layouts: [
          {
            key: 'our-services',
            label: 'Our Services',
            path: '/our-services',
            ...(address === undefined ? {} : { address }),
            shots: { desktop: 'business-home-1440.png' }
          }
        ]
      })
    )

  // The shape every Joomla card needs: the path names the page, the address is where it answers.
  assert.deepEqual(withAddress('/index.php/our-services'), [])
  // 🔒 OPTIONAL, so every card published before this field existed is still a valid card.
  assert.deepEqual(withAddress(), [])

  // And refused when it is not a path at all — silently keeping a broken address is how a preview
  // ends up pointed at somebody else's origin.
  for (const bad of ['https://elsewhere.test/our-services', 'our-services', 7, null]) {
    const problems = withAddress(bad)
    assert.equal(problems.length, 1, JSON.stringify(bad))
    assert.match(problems[0], /layouts\[0\]\.address must be the path the page answers at/)
  }
})

test('a file replaced on the release is refused against the checksum the setting pinned, before any Install', () => {
  // ja-teline-v, 21/09: the zip was re-uploaded under the same name and size, the setting kept the
  // 17/09 hash, and every Redeploy died on the host with `quickstart checksum mismatch`.
  const assets = [
    { name: 'tracy-business-emdash-quickstart-1.0.0.zip', digest: `sha256:${sha('c')}` },
    { name: 'tracy-business-emdash-state-1.0.0.tar.gz', digest: `sha256:${sha('b')}` },
    { name: 'tracy_setting.json' }
  ]
  const digests = digestsOf(assets)
  assert.equal(digests.size, 2, 'an asset GitHub states no digest for is not checked')
  const problems = validateSetting(setting(), { assets: assets.map((a) => a.name), digests })
  assert.equal(problems.length, 1)
  assert.match(
    problems[0],
    /^install\.source\.sha256 must match tracy-business-emdash-quickstart-1\.0\.0\.zip/
  )
  assert.match(problems[0], new RegExp(sha('c')))
  assert.equal(readingOf({ tag_name: 't', assets: [] }, null, problems.join('; ')).tracy, 'invalid')
  // The same setting against the bytes it pinned is fine, and so is a release with no digests.
  const same = digestsOf([
    { name: 'tracy-business-emdash-quickstart-1.0.0.zip', digest: `sha256:${sha('a')}` }
  ])
  assert.deepEqual(validateSetting(setting(), { assets: assets.map((a) => a.name), digests: same }), [])
  assert.deepEqual(validateSetting(setting(), { assets: assets.map((a) => a.name) }), [])
})

test('a Joomla demo frames each sub-page at the front controller when its card names no address', () => {
  // ja-vogue on dev, 22/09: `/about` answered 404, `/index.php/about` 200, and the card had no address.
  const layouts = [
    { key: 'home', label: 'Home', path: '/' },
    { key: 'about', label: 'About', path: '/about' },
    { key: 'vital', label: 'Services', path: '/our-services', address: '/index.php/our-services' },
    { key: 'raw', label: 'Raw', path: '/index.php/raw' },
    { key: 'q', label: 'Article', path: '/?option=com_content&id=7' }
  ]
  const [card] = templateCards(
    [
      reading({
        tag: 'quickstart/ja-vogue/j6',
        platform: 'joomla',
        inspiration: inspiration({ template: 'tracy-business', layouts })
      })
    ],
    new Map([['quickstart/ja-vogue/j6', { url: 'https://ja-vogue-joomla.tracy.test/', version: '1.0.0' }]])
  )
  assert.deepEqual(
    card.card.layouts.map((l) => l.address ?? null),
    [null, '/index.php/about', '/index.php/our-services', null, '/index.php?option=com_content&id=7']
  )
  // Another CMS's pretty paths are real, and a card with no live demo frames nothing: both untouched.
  assert.equal(joomlaAddresses(layouts, 'wordpress'), layouts)
  const [noDemo] = templateCards([reading({ platform: 'joomla', inspiration: inspiration({ layouts }) })])
  assert.equal(noDemo.card.layouts[1].address, undefined)
})

// 25/09 on the dev machine (`capij1510`): `tracy-business/j6` carries its own Claude Cowork plugin (0.17.4), so the
// release candidate this repository pins never reached a site. A pin wins only when it says so —
// `main` pins j6 at 0.17.2 under a release carrying 0.17.4, and that pin must keep losing.
test('resolveInstall: a pin overrides the release Claude Cowork plugin only when it says overridesRelease', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const { resolveInstall } = await import('../src/lib/quickstart-releases.js')
  const tag = 'tracy-business/j6'
  const released = { file: 'pkg_claudecowork-0.17.4.zip', sha256: 'c'.repeat(64) }
  const pool = {
    query: async () => ({
      rows: [
        {
          tag,
          release: {
            name: tag,
            kind: 'quickstart',
            github: 'published',
            assets: [{ name: released.file, size: 10, id: 1 }]
          },
          setting: { platform: 'joomla', version: '1.2.0', install: { cowork: released } },
          inspiration: null,
          inspiration_hidden: false,
          tracy: null,
          reason: null,
          fetched_at: null
        }
      ]
    })
  }
  const pin = {
    file: 'pkg_claudecowork-0.18.0-rc.1.zip',
    version: '0.18.0-rc.1',
    bytes: 20,
    sha256: 'd'.repeat(64),
    githubAssetId: 2,
    url: 'https://example.test/pkg_claudecowork-0.18.0-rc.1.zip'
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'pins-'))
  try {
    const pinsFile = path.join(dir, 'quickstarts.json')
    writeFileSync(pinsFile, JSON.stringify({ [tag]: { platform: 'joomla', version: '1.2.0', cowork: pin } }))
    const kept = await resolveInstall(pool, tag, { pinsFile })
    assert.equal(kept.contract, 'tracy-business/j6/1.2.0', 'the repo seals this release')
    assert.equal(kept.cowork.file, released.file, 'a plain pin loses to the release Claude Cowork plugin')

    writeFileSync(
      pinsFile,
      JSON.stringify({
        [tag]: { platform: 'joomla', version: '1.2.0', cowork: { ...pin, overridesRelease: true } }
      })
    )
    const overridden = await resolveInstall(pool, tag, { pinsFile })
    assert.equal(overridden.cowork.file, pin.file)
    assert.equal(overridden.cowork.githubAssetId, pin.githubAssetId)
    assert.equal('overridesRelease' in overridden.cowork, false, 'the flag stays in the repository')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveInstall: a sealed release that carries no Claude Cowork plugin gets the public pin, with no asset id', async () => {
  const { resolveInstall } = await import('../src/lib/quickstart-releases.js')
  const { coworkPinFor } = await import('../src/lib/contracts.js')
  // Tracy Base and JA Kinetic: the release ships the site only, and the repository pins the
  // Claude Cowork plugin's own public release. Read against the catalogue the image carries.
  for (const [tag, install] of [
    ['tracy-base/j6', { bundle: { file: 'tracy-base-j6-quickstart-1.0.0.zip', sha256: 'a'.repeat(64) } }],
    [
      'quickstart/ja-kinetic/j6',
      {
        webroot: { file: 'ja-kinetic-j6-webroot-1.0.0.tar.gz', sha256: 'a'.repeat(64) },
        database: { file: 'ja-kinetic-j6-database-1.0.0.sql.gz', sha256: 'b'.repeat(64) }
      }
    ]
  ]) {
    const version = '1.0.0'
    const pool = {
      query: async () => ({
        rows: [
          {
            tag,
            release: {
              name: tag,
              kind: 'quickstart',
              github: 'published',
              assets: Object.values(install).map((part, i) => ({ name: part.file, size: 10, id: i + 1 }))
            },
            setting: { platform: 'joomla', version, install },
            inspiration: null,
            inspiration_hidden: false,
            tracy: null,
            reason: null,
            fetched_at: null
          }
        ]
      })
    }
    const entry = await resolveInstall(pool, tag)
    const pin = coworkPinFor(tag, version)
    assert.ok(entry.contract, `${tag}: the repo seals this release`)
    assert.ok(pin, `${tag}: the repo pins a Claude Cowork plugin for it`)
    assert.deepEqual(entry.cowork, pin, tag)
    assert.equal('githubAssetId' in entry.cowork, false, `${tag}: a public pin is fetched with no credential`)
    assert.match(
      entry.cowork.url,
      /^https:\/\/github\.com\/TracyHQ\/claude-cowork\/releases\/download\//,
      tag
    )
  }
})

/** A contract tree on disk, one profile per entry, so `templateCards` is joined the way the door joins it. */
function contractsWith(profiles) {
  const dir = mkdtempSync(path.join(tmpdir(), 'qs-contracts-'))
  for (const [at, { design, tokens, ...manifest }] of Object.entries(profiles)) {
    mkdirSync(path.join(dir, at), { recursive: true })
    writeFileSync(path.join(dir, at, 'manifest.json'), JSON.stringify(manifest))
    // A quickstart look carries its resolved tokens beside the name, at the file's top level (`contracts.js`).
    writeFileSync(
      `${path.join(dir, at)}.design.json`,
      JSON.stringify({ schemaVersion: 'tracy-contract-design/v1', design, ...(tokens ? { tokens } : {}) })
    )
  }
  return readContracts(dir)
}
const profile = (release, version, design) => ({
  schemaVersion: 'tracy-quickstart-contract/v1',
  id: `${release}/${version}`,
  platform: 'emdash',
  quickstart: { release, version },
  mode: 'content-recommendation',
  design
})

test('templateCards names the design system the sealing profile says the quickstart wears', () => {
  const row = reading({ inspiration: inspiration() })
  const version = row.setting.version
  const contracts = contractsWith({
    [`tracy-business/emdash-0.x/${version}`]: profile('tracy-business/emdash-0.x', version, {
      id: 'apple',
      source: 'catalog'
    })
  })
  const [card] = templateCards([row], new Map(), contracts)
  assert.deepEqual(card.design, { id: 'apple', source: 'catalog' })
})

test('templateCards: no contract, or a contract naming no design, is design null — never a guess from the card', () => {
  const row = reading({ inspiration: inspiration() })
  assert.equal(templateCards([row]).find((c) => c.id === 'tracy-business').design, null)
  const contracts = contractsWith({
    [`tracy-business/emdash-0.x/${row.setting.version}`]: profile(
      'tracy-business/emdash-0.x',
      row.setting.version,
      null
    )
  })
  assert.equal(templateCards([row], new Map(), contracts)[0].design, null)
})

test('templateCards: one card, two archives, two DIFFERENT designs is a conflict the card says out loud', () => {
  const emdash = reading({ inspiration: inspiration() })
  const joomla = reading({ tag: 'tracy-business/j6', platform: 'joomla', inspiration: inspiration() })
  const v = emdash.setting.version
  const contracts = contractsWith({
    [`tracy-business/emdash-0.x/${v}`]: profile('tracy-business/emdash-0.x', v, {
      id: 'apple',
      source: 'catalog'
    }),
    [`tracy-business/j6/${v}`]: {
      ...profile('tracy-business/j6', v, { id: 'airbnb', source: 'catalog' }),
      platform: 'joomla'
    }
  })
  const [card] = templateCards([emdash, joomla], new Map(), contracts)
  assert.equal(card.design, null)
  assert.equal(card.designConflict, true)
  // An archive with no contract does not contradict the one that names a design.
  const agreeing = contractsWith({
    [`tracy-business/emdash-0.x/${v}`]: profile('tracy-business/emdash-0.x', v, {
      id: 'apple',
      source: 'catalog'
    })
  })
  const [one] = templateCards([emdash, joomla], new Map(), agreeing)
  assert.deepEqual(one.design, { id: 'apple', source: 'catalog' })
  assert.equal(one.designConflict, undefined)
})

test('templateDesign: a press on a platform whose release nothing seals still wears what the card wears', () => {
  const emdash = reading({ inspiration: inspiration() })
  const joomla = reading({ tag: 'tracy-business/j6', platform: 'joomla', inspiration: inspiration() })
  const v = emdash.setting.version
  const contracts = contractsWith({
    [`tracy-business/j6/${v}`]: {
      ...profile('tracy-business/j6', v, { id: 'apple', source: 'catalog' }),
      platform: 'joomla'
    }
  })
  assert.deepEqual(templateDesign([emdash, joomla], 'tracy-business', contracts), {
    id: 'apple',
    source: 'catalog'
  })
  assert.equal(templateDesign([emdash, joomla], 'nowhere', contracts), null)
  assert.equal(templateDesign([emdash, joomla], undefined, contracts), null)
})

test('a quickstart look keeps its tokens for the build plan, and shows by id and source only on a card', () => {
  const row = reading({ inspiration: inspiration() })
  const v = row.setting.version
  const worn = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom: 'x',
    tokens: { '--bg': '#fff' }
  }
  const contracts = new Map([
    [
      `${row.tag}@${v}`,
      { id: 'p', dir: '', platform: 'emdash', coworkMinVersion: null, mode: null, design: worn }
    ]
  ])
  const [card] = templateCards([row], new Map(), contracts)
  // The card still names it; the fallback for another press does not carry it (next test).
  assert.deepEqual(card.design, worn)
  assert.equal(templateDesign([row], card.id, contracts), null)
  assert.deepEqual(shownDesign(card.design), { id: 'tracy-business', source: 'quickstart' })
  assert.deepEqual(shownDesign({ id: 'apple', source: 'catalog' }), { id: 'apple', source: 'catalog' })
  assert.equal(shownDesign(null), null)
})

// A `quickstart` look is ONE CMS's token values: tracy-business j6 and wp7 share the id and differ
// (`--surface` #EDEAE2 on Joomla, #ffffff on WordPress). The card-wide fallback must never hand one
// platform's values to a press on another — only a catalogue system is the same on every CMS.
test('templateDesign: a quickstart look never falls back onto a platform that did not declare it', () => {
  const emdash = reading({ inspiration: inspiration() })
  const joomla = reading({ tag: 'tracy-business/j6', platform: 'joomla', inspiration: inspiration() })
  const v = emdash.setting.version
  const joomlaLook = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom: 'x',
    tokens: { '--surface': '#EDEAE2' }
  }
  const contracts = new Map([
    [
      `tracy-business/j6@${v}`,
      { id: 'p', dir: '', platform: 'joomla', coworkMinVersion: null, mode: null, design: joomlaLook }
    ]
  ])
  // The Joomla press reads its own release (`designOfRelease`); the EmDash press, whose release
  // nothing seals, falls back to the card — and gets nothing rather than Joomla's values.
  assert.equal(templateDesign([emdash, joomla], 'tracy-business', contracts), null)
  assert.deepEqual(designOfRelease(contracts, [emdash, joomla], 'tracy-business/j6'), joomlaLook)
  assert.equal(designOfRelease(contracts, [emdash, joomla], 'tracy-business/emdash-0.x'), null)
  // The same card joined over a catalogue system still falls back: it looks the same everywhere.
  const catalog = new Map([
    [
      `tracy-business/j6@${v}`,
      {
        id: 'p',
        dir: '',
        platform: 'joomla',
        coworkMinVersion: null,
        mode: null,
        design: { id: 'apple', source: 'catalog' }
      }
    ]
  ])
  assert.deepEqual(templateDesign([emdash, joomla], 'tracy-business', catalog), {
    id: 'apple',
    source: 'catalog'
  })
})

const pagesFile = (pages) => ({ pages })
const NOVA_PAGES = [
  { id: 'home', label: 'Home', home: true },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'contact', label: 'Contact' }
]

test('a release carrying tracy_site_pages.json has its pages read and written down', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: {
        ...EMDASH_FILES,
        'tracy_setting.json': setting(),
        'tracy_site_pages.json': pagesFile(NOVA_PAGES)
      }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [row] = await readReleases(pool)
  assert.deepEqual(pagesOf(row), NOVA_PAGES)
  assert.equal(row.reason, null)
})

test('a release with no pages file has no pages, and that is not a fault', async () => {
  const { fetchImpl } = stub([
    { tag: 'tracy-business/emdash-0.x', files: { ...EMDASH_FILES, 'tracy_setting.json': setting() } }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [row] = await readReleases(pool)
  assert.equal(pagesOf(row), null)
  assert.equal(row.tracy, 'ready')
  assert.equal(row.reason, null)
})

test('a pages file without one home, or with a repeated id, flags the release with a reason and spoils nothing else', async () => {
  for (const pages of [
    NOVA_PAGES.map(({ home: _home, ...p }) => p),
    [...NOVA_PAGES, { id: 'contact', label: 'Contact again' }]
  ]) {
    const { fetchImpl } = stub([
      {
        tag: 'tracy-business/emdash-0.x',
        files: {
          ...EMDASH_FILES,
          'tracy_setting.json': setting({ template: 'tracy-business' }),
          'tracy_design_inspiration.json': inspiration(),
          'tracy_site_pages.json': pagesFile(pages)
        }
      },
      { tag: 'tracy-base/emdash-0.x', files: { ...EMDASH_FILES, 'tracy_setting.json': setting() } }
    ])
    const pool = memoryPool()
    const result = await syncReleases(pool, { token: 't', fetchImpl })
    assert.equal(result.ok, true, 'one bad file does not abort the read')
    const rows = await readReleases(pool)
    assert.equal(rows.length, 2)
    const row = rows.find((r) => r.tag === 'tracy-business/emdash-0.x')
    assert.equal(pagesOf(row), null)
    assert.equal(row.tracy, 'ready')
    assert.equal(row.choosable, true)
    assert.ok(row.inspiration, 'the card still reads')
    assert.match(row.reason, /tracy_site_pages\.json/)
  }
})

test('a pages file that is not JSON is a reason too', async () => {
  const { fetchImpl } = stub([
    {
      tag: 'tracy-business/emdash-0.x',
      files: { ...EMDASH_FILES, 'tracy_setting.json': setting(), 'tracy_site_pages.json': '{ not json' }
    }
  ])
  const pool = memoryPool()
  await syncReleases(pool, { token: 't', fetchImpl })
  const [row] = await readReleases(pool)
  assert.equal(pagesOf(row), null)
  assert.match(row.reason, /tracy_site_pages\.json could not be read/)
})

test('the pages are REPLACED on every read: a changed file wins, a removed file leaves none', async () => {
  const pool = memoryPool()
  const files = (extra) => ({ ...EMDASH_FILES, 'tracy_setting.json': setting(), ...extra })
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([
      { tag: 'tracy-business/emdash-0.x', files: files({ 'tracy_site_pages.json': pagesFile(NOVA_PAGES) }) }
    ]).fetchImpl
  })
  const fewer = NOVA_PAGES.slice(0, 2)
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([
      { tag: 'tracy-business/emdash-0.x', files: files({ 'tracy_site_pages.json': pagesFile(fewer) }) }
    ]).fetchImpl
  })
  assert.deepEqual(pagesOf((await readReleases(pool))[0]), fewer)
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([{ tag: 'tracy-business/emdash-0.x', files: files({}) }]).fetchImpl
  })
  assert.equal(pagesOf((await readReleases(pool))[0]), null)
})

test('cardIdOf: a release is keyed by the card customers see, not by its install file (Tracy Base, 10/10/2026)', () => {
  // The exact shape on dev: three releases fold into the customer card `tracy`, while the
  // WordPress and EmDash install files say `template: "tracy-base"`. Pictures, the "no picture"
  // check and every write must use the card id, or the admin page asks for /tracy-base/shots/…
  // that no store holds while customers read /tracy/shots/… fine.
  const card = inspiration({ template: 'tracy', image: 'tracy-home-1440.png' })
  const j6 = reading({
    tag: 'tracy-base/j6',
    platform: 'joomla',
    setting: setting({ platform: 'joomla', template: 'tracy' }),
    inspiration: card
  })
  const wp7 = reading({
    tag: 'tracy-base/wp7',
    platform: 'wordpress',
    setting: setting({ platform: 'wordpress', template: 'tracy-base' }),
    inspiration: card
  })
  const emdash = reading({ tag: 'tracy-base/emdash-0.x', setting: setting({ template: 'tracy-base' }) })
  const rows = [wp7, j6, emdash]
  assert.deepEqual([...cardSources(rows)], [['tracy', 'tracy-base/wp7']])
  assert.equal(templateCards(rows)[0].id, 'tracy')
  assert.equal(cardIdOf(wp7), 'tracy', 'the WordPress release resolves to the customer card id')
  assert.equal(cardIdOf(j6), 'tracy')
  // No card yet: the install file's template, normalised, is all there is to file one under.
  assert.equal(cardIdOf(emdash), 'tracy-base')
  assert.equal(cardIdOf(reading({ setting: setting({ template: 'JA_Voyara' }) })), 'ja-voyara')
  assert.equal(cardIdOf(reading({ setting: setting({ template: undefined }) })), null)
})

test('a passing GitHub refusal (403) keeps the setting the row already has', async () => {
  const pool = memoryPool()
  const good = stub([
    { tag: 'tracy-business/emdash-0.x', files: { ...EMDASH_FILES, 'tracy_setting.json': setting() } }
  ])
  await syncReleases(pool, { token: 't', fetchImpl: good.fetchImpl })
  assert.equal(pool.rows.quickstart_releases.get('tracy-business/emdash-0.x').tracy, 'ready')

  // The same release, but every asset download is refused for now (secondary rate limit).
  const refused = async (url) =>
    String(url).includes('/releases') ? good.fetchImpl(url) : new Response('rate limited', { status: 403 })
  await syncReleases(pool, { token: 't', fetchImpl: refused })
  const row = pool.rows.quickstart_releases.get('tracy-business/emdash-0.x')
  assert.equal(row.tracy, 'ready', 'a 403 says nothing about the file: the setting stays')
  assert.ok(row.setting, 'setting kept')
  assert.equal(row.reason, null)

  // A 404 is about the file: the row says so and the setting goes.
  const gone = async (url) =>
    String(url).includes('/releases') ? good.fetchImpl(url) : new Response('no', { status: 404 })
  await syncReleases(pool, { token: 't', fetchImpl: gone })
  const after = pool.rows.quickstart_releases.get('tracy-business/emdash-0.x')
  assert.equal(after.setting, null)
  assert.match(after.reason, /404/)
})

test('the archived mark takes a release out of every reading on the next copy, and taking it off brings it back', async () => {
  const files = (archived) => ({
    ...EMDASH_FILES,
    'tracy_setting.json': setting({ template: 'tracy-business', card: legacyCard }),
    ...(archived ? { 'tracy_archived.json': { archived: true } } : {})
  })
  const pool = memoryPool()
  // A release copied before it was archived: listed, choosable, a card.
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([{ tag: 'tracy-business/emdash-0.x', files: files(false) }]).fetchImpl
  })
  assert.equal((await readReleases(pool)).length, 1)

  // The mark is uploaded: the row already copied is marked on the next read of GitHub.
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([{ tag: 'tracy-business/emdash-0.x', files: files(true) }]).fetchImpl
  })
  assert.deepEqual(await readReleases(pool), [], 'off every list')
  assert.deepEqual(await readReleases(pool, { choosable: true }), [], 'and not choosable')
  const [kept] = await readReleases(pool, { includeArchived: true })
  assert.equal(kept.archived, true)
  assert.equal(kept.choosable, false, 'an archived release is never a build base')
  assert.deepEqual(templateCards([kept]), [], 'no card on Design inspiration')
  assert.equal(templateRelease([kept], 'emdash', 'tracy-business'), null, 'Create with finds nothing')

  // The mark is deleted: the next read puts the release back as it was.
  await syncReleases(pool, {
    token: 't',
    fetchImpl: stub([{ tag: 'tracy-business/emdash-0.x', files: files(false) }]).fetchImpl
  })
  const [back] = await readReleases(pool)
  assert.equal(back?.archived, false)
  assert.equal(back?.choosable, true)
  assert.equal(templateCards([back])[0]?.id, 'tracy-business')
})

test('readingOf: a release carrying tracy_archived.json is archived and not choosable', () => {
  const release = (assets) => ({ tag_name: 'tracy-business/emdash-0.x', assets })
  const ok = setting()
  assert.equal(readingOf(release([]), ok, null).archived, false)
  const marked = readingOf(release([{ name: 'tracy_archived.json' }]), ok, null)
  assert.deepEqual([marked.archived, marked.choosable], [true, false])
})

test('templateCards: each archive says what a site built from it WEARS, by the create door’s own rule (plan tasks/plan-wo-design-follows-template.md)', () => {
  const emdash = reading({ inspiration: inspiration() })
  const joomla = reading({ tag: 'tracy-business/j6', platform: 'joomla', inspiration: inspiration() })
  const v = emdash.setting.version
  // A catalogue system named by one archive's profile falls back onto the archive nothing seals.
  const catalog = contractsWith({
    [`tracy-business/emdash-0.x/${v}`]: profile('tracy-business/emdash-0.x', v, {
      id: 'apple',
      source: 'catalog'
    })
  })
  const [card] = templateCards([emdash, joomla], new Map(), catalog)
  const apple = { id: 'apple', source: 'catalog', name: 'Apple' }
  assert.deepEqual(
    card.platforms.map((p) => [p.platform, p.wears]),
    [
      ['emdash', apple],
      ['joomla', apple]
    ]
  )
  // A quickstart look is one CMS's own token values: only the archive that declared it wears it.
  const quickstart = contractsWith({
    [`tracy-business/j6/${v}`]: {
      ...profile('tracy-business/j6', v, {
        id: 'tracy-business',
        source: 'quickstart',
        name: 'Tracy Business',
        tokensFrom: 'template-patches/tracy_business/css/styles/tracy-business.css'
      }),
      tokens: { '--bg': '#ffffff', '--surface': '#edeae2' },
      platform: 'joomla'
    }
  })
  const [biz] = templateCards([emdash, joomla], new Map(), quickstart)
  assert.deepEqual(
    biz.platforms.map((p) => [p.platform, p.wears]),
    [
      ['emdash', null],
      ['joomla', { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business' }]
    ]
  )
  // No profile anywhere: nothing is worn, and nothing is guessed from the card.
  assert.deepEqual(
    templateCards([emdash, joomla])[0].platforms.map((p) => p.wears),
    [null, null]
  )
})
