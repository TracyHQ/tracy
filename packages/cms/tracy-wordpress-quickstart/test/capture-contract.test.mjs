import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
  deriveProfile,
  findNamedBlock,
  normalizeRelease,
  pageSlots,
  readText,
  readUrl
} from '../scripts/capture-contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.join(HERE, '..', 'scripts')

const block = (type, name, inner, extra = '') =>
  `<!-- wp:${type} {"metadata":{"name":"${name}"}${extra}} -->\n${inner}\n<!-- /wp:${type} -->`
const heading = (name, text) => block('heading', name, `<h2 class="wp-block-heading">${text}</h2>`)
const para = (name, text) => block('paragraph', name, `<p>${text}</p>`)
const button = (name, text, href) =>
  block(
    'button',
    name,
    `<div class="wp-block-button"><a class="wp-block-button__link" href="${href}">${text}</a></div>`,
    `,"url":"${href}"`
  )

test('the block found for a name is the first one, with its inner markup', () => {
  const page = `${para('a.x', 'one')}\n${para('a.x', 'two')}`
  const found = findNamedBlock(page, 'a.x')
  assert.equal(found.block, 'paragraph')
  assert.equal(readText(found), 'one')
  assert.equal(findNamedBlock(page, 'nope'), null)
})

test('a button reads its link text and its link; other blocks read their one element', () => {
  const b = findNamedBlock(button('hero.cta', 'Get started', '/start'), 'hero.cta')
  assert.equal(readText(b), 'Get started')
  assert.equal(readUrl(b), '/start')
  assert.equal(readText(findNamedBlock(heading('h', 'Hi'), 'h')), 'Hi')
  assert.equal(readText(findNamedBlock(block('group', 'g', '<div><p>x</p></div><p>y</p>'), 'g')), null)
})

test('slots are made only for named plain-text blocks, and everything left out is said', () => {
  const content = [
    heading('hero.title', 'Build <br>better'),
    heading('hero.sub', 'Plain &amp; simple'),
    para('hero.lead', 'Lead text'),
    para('hero.lead', 'A second block of the same name'),
    button('hero.cta', 'Start', '/go'),
    block('image', 'hero.img', '<figure><img src="/wp-content/uploads/a.png"></figure>', ',"id":5'),
    '<!-- wp:paragraph -->\n<p>unnamed</p>\n<!-- /wp:paragraph -->',
    block('group', 'wrap', '<div>x</div>')
  ].join('\n')
  const { slots, skipped } = pageSlots({ content, entityKey: 'page-home', prefix: 'home' })
  assert.deepEqual(
    slots.map((s) => [s.key, s.type, s.target.attr, s.sample]),
    [
      ['home.hero.sub', 'text', 'content', 'Plain & simple'],
      ['home.hero.lead', 'text', 'content', 'Lead text'],
      ['home.hero.cta', 'text', 'content', 'Start'],
      ['home.hero.cta.url', 'url', 'url', '/go']
    ]
  )
  assert.equal(skipped.length, 2)
  assert.match(skipped.join('\n'), /hero\.title \(inline markup\)/)
  assert.match(skipped.join('\n'), /hero\.lead \(a second block of that name/)
  for (const s of slots) assert.ok(s.maxCharacters >= 80)
})

// ── a whole profile from a tiny dump ──

const q = (v) =>
  v === null ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
const table = (name, columns, rows) =>
  `CREATE TABLE \`tr_${name}\` (\n${columns.map((c) => `  \`${c}\` text`).join(',\n')}\n) ENGINE=InnoDB;\nINSERT INTO \`tr_${name}\` VALUES ${rows.map((r) => `(${r.map(q).join(',')})`).join(',')};\n`
const POST = ['ID', 'post_content', 'post_title', 'post_status', 'post_name', 'post_type', 'post_parent']
const dump = ({ pages, options = [], taxonomies = [] }) =>
  table(
    'options',
    ['option_id', 'option_name', 'option_value'],
    [
      [1, 'stylesheet', 'wp-demo'],
      [2, 'template', 'wp-demo'],
      [3, 'blogname', 'Demo'],
      [4, 'blogdescription', ''],
      ...options
    ]
  ) +
  table('term_taxonomy', ['term_taxonomy_id', 'term_id', 'taxonomy', 'description'], taxonomies) +
  table(
    'posts',
    POST,
    pages.map((p, i) => [
      p.id ?? i + 10,
      p.content,
      p.name,
      p.status ?? 'publish',
      p.name,
      p.type ?? 'page',
      0
    ])
  )

const RELEASE = {
  version: '1.0.0',
  prefix: 'tr_',
  wpVersion: '7.1',
  phpVersion: '8.3.1',
  placeholderUrl: 'https://quickstart.invalid',
  theme: { name: 'wp-demo' },
  webroot: { file: 'w.tar.gz', bytes: 1, sha256: 'a'.repeat(64) },
  database: { file: 'd.sql.gz', bytes: 1, sha256: 'b'.repeat(64) }
}
const CARD = {
  slug: 'ja-demo',
  version: '1.0.0',
  tag: 'quickstart/ja-demo/wp7',
  repo: 'o/r',
  assets: { 'w.tar.gz': { id: 7 } }
}
const derive = (sql) =>
  deriveProfile({
    sql,
    release: RELEASE,
    card: CARD,
    coworkVersion: '0.17.1',
    themeRoots: ['wp-content/themes/wp-demo']
  })

test('a profile is made from the site name, the tagline and every page that has addressable text', () => {
  const out = derive(
    dump({
      pages: [
        { name: 'home', content: `${heading('hero.title', 'Hello')}\n${button('hero.cta', 'Go', '/go')}` },
        { name: 'empty', content: '<p>no names here</p>' },
        { name: 'dup', content: heading('a', 'one') },
        { name: 'dup', content: heading('a', 'two'), status: 'draft' },
        { name: 'gone', content: heading('a', 'x'), status: 'trash' },
        { name: 'about', content: heading('about.title', 'About us') }
      ]
    })
  )
  assert.deepEqual(
    out.contentMap.entities.map((e) => e.key),
    ['option-blogname', 'option-blogdescription', 'page-home', 'page-about']
  )
  assert.deepEqual(
    out.contentMap.slots.map((s) => s.key),
    [
      'site.name',
      'site.tagline',
      'home.hero.title',
      'home.hero.cta',
      'home.hero.cta.url',
      'about.about.title'
    ]
  )
  assert.deepEqual(out.coverage.pagesWithoutSlots, ['empty'])
  assert.match(out.coverage.ambiguousPages.join(), /dup \(2 rows\)/)
  assert.equal(out.manifest.id, 'ja-demo/wp7/1.0.0')
  assert.equal(out.manifest.coworkContractVersion, '0.17.1')
  assert.equal(out.manifest.quickstart.parts.webroot.githubAssetId, 7)
  assert.deepEqual(out.lock.fileRoots, ['wp-content/themes/wp-demo'])
  assert.deepEqual(out.lock.options, { stylesheet: 'wp-demo', template: 'wp-demo' })
})

test('deriving twice gives the same bytes', () => {
  const sql = dump({ pages: [{ name: 'home', content: heading('hero.title', 'Hello') }] })
  assert.equal(JSON.stringify(derive(sql)), JSON.stringify(derive(sql)))
})

test('a dump that cannot yield a trustworthy profile is refused with the reason', () => {
  const page = [{ name: 'home', content: heading('hero.title', 'Hello') }]
  assert.throws(() => derive(dump({ pages: page, taxonomies: [[1, 1, 'language', 'a:0:{}']] })), /Polylang/)
  assert.throws(
    () => derive(dump({ pages: [{ name: 'home', content: '<p>x</p>' }] })),
    /no page of the dump has a named text block/
  )
  assert.throws(
    () => derive(dump({ pages: page, options: [[5, 'stylesheet', 'other']] })),
    /active theme|cannot/
  )
  assert.throws(
    () =>
      deriveProfile({
        sql: dump({ pages: page }),
        release: { ...RELEASE, prefix: 'xx_' },
        card: CARD,
        coworkVersion: '1',
        themeRoots: []
      }),
    /table prefix/
  )
  assert.throws(
    () =>
      derive(
        dump({
          pages: [
            { name: 'home', content: heading('hero.title', 'Hello') },
            { name: 'home', content: heading('x', 'y'), status: 'private' }
          ]
        })
      ),
    /no page of the dump/
  )
})

test('both shapes of a release manifest are read, and a missing field stays missing', () => {
  const older = normalizeRelease(RELEASE)
  assert.equal(older.wpVersion, '7.1')
  assert.equal(older.theme, 'wp-demo')
  assert.equal(older.webroot.file, 'w.tar.gz')
  const newer = normalizeRelease({
    version: '1.0.2',
    prefix: 'tr_',
    cms: { name: 'wordpress', version: '7.1' },
    theme: { name: 'wp-demo' },
    placeholderUrl: 'https://quickstart.invalid',
    parts: { webroot: { file: 'w' }, database: { file: 'd' } }
  })
  assert.equal(newer.wpVersion, '7.1')
  assert.equal(newer.phpVersion, undefined)
  assert.equal(newer.database.file, 'd')
  const out = deriveProfile({
    sql: dump({ pages: [{ name: 'home', content: heading('hero.title', 'Hello') }] }),
    release: {
      version: '1.0.0',
      prefix: 'tr_',
      cms: { version: '7.1' },
      theme: { name: 'wp-demo' },
      parts: RELEASE
    },
    card: CARD,
    coworkVersion: '0.17.1',
    themeRoots: ['x']
  })
  assert.equal('phpVersion' in JSON.parse(JSON.stringify(out.manifest.quickstart)), false)
  assert.throws(
    () =>
      deriveProfile({ sql: '', release: { version: '1' }, card: CARD, coworkVersion: '1', themeRoots: [] }),
    /names no webroot/
  )
})

// ── the command line honours --contracts-root ──

test('capture-contract.mjs writes the three profile files under --contracts-root and refuses a wrong dump', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-cc-'))
  const sql = dump({ pages: [{ name: 'home', content: heading('hero.title', 'Hello') }] })
  const gz = gzipSync(sql)
  const dumpFile = path.join(dir, 'd.sql.gz')
  writeFileSync(dumpFile, gz)
  const manifest = path.join(dir, 'manifest.json')
  writeFileSync(
    manifest,
    JSON.stringify({
      ...RELEASE,
      database: { ...RELEASE.database, sha256: createHash('sha256').update(gz).digest('hex') }
    })
  )
  const run = (extra = []) =>
    execFileSync(
      process.execPath,
      [
        path.join(SCRIPTS, 'capture-contract.mjs'),
        '--contract',
        'ja-demo/wp7/1.0.0',
        '--dump',
        dumpFile,
        '--release-manifest',
        manifest,
        '--tag',
        CARD.tag,
        '--cowork-version',
        '0.17.1',
        '--contracts-root',
        path.join(dir, 'contracts'),
        '--theme-roots',
        'wp-content/themes/wp-demo',
        ...extra
      ],
      { encoding: 'utf8' }
    )
  const out = JSON.parse(run().trim().split('\n').at(-1))
  assert.equal(out.entities, 3)
  for (const f of ['manifest.json', 'content-map.json', 'presentation-lock.json'])
    assert.ok(existsSync(path.join(dir, 'contracts/ja-demo/wp7/1.0.0', f)), f)
  writeFileSync(manifest, JSON.stringify(RELEASE))
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          path.join(SCRIPTS, 'capture-contract.mjs'),
          '--contract',
          'ja-demo/wp7/1.0.0',
          '--dump',
          dumpFile,
          '--release-manifest',
          manifest,
          '--tag',
          CARD.tag,
          '--cowork-version',
          '0.17.1',
          '--contracts-root',
          path.join(dir, 'c2'),
          '--theme-roots',
          'x'
        ],
        { stdio: 'pipe' }
      ),
    /Command failed/
  )
  assert.equal(existsSync(path.join(dir, 'c2')), false)
  mkdirSync(path.join(dir, 'unused'), { recursive: true })
  assert.equal(
    readFileSync(path.join(SCRIPTS, 'capture-inventory.mjs'), 'utf8').includes("args['contracts-root']"),
    true
  )
  assert.equal(
    readFileSync(path.join(SCRIPTS, 'capture-image-slots.mjs'), 'utf8').includes("args['contracts-root']"),
    true
  )
})

// ── slot roles (ADR 0038): bound at capture, carried across recaptures ──

/** A fictional page: a title the rule tables place and a panel size they cannot. */
const rolesPage = (title, extra = '') =>
  dump({
    pages: [
      {
        name: 'home',
        content: `${heading('hero.title', title)}\n${para('gallery.panel_size', 'Launch day')}${extra}`
      }
    ]
  })
const roleDerive = (sql, previousMap) =>
  deriveProfile({
    sql,
    release: RELEASE,
    card: CARD,
    coworkVersion: '0.17.1',
    themeRoots: ['wp-content/themes/wp-demo'],
    previousMap
  })
const slotOf = (out, key) => out.contentMap.slots.find((s) => s.key === key)

test('a first capture writes roles from the rule tables and lists the slots they cannot place', () => {
  const out = roleDerive(rolesPage('Boats built by hand', `\n${para('hero.lead', 'Small yard.')}`))
  assert.equal(out.contentMap.roleVocabularyVersion, 'place-content-roles/2')
  assert.equal(slotOf(out, 'site.name').role, 'business.name')
  assert.equal(slotOf(out, 'site.tagline').role, 'business.tagline')
  assert.equal(slotOf(out, 'site.name').group.kind, 'business')
  assert.ok(out.unplaced.includes('home.gallery.panel_size'))
  assert.equal('role' in slotOf(out, 'home.gallery.panel_size'), false)
  assert.equal(JSON.stringify(out.contentMap).includes('unplaced'), false, 'the list stays out of the map')
})

test('a recapture keeps the role and group of every slot whose key and sample are unchanged', () => {
  const sql = rolesPage('Boats built by hand')
  const previous = roleDerive(sql).contentMap
  const caption = previous.slots.find((s) => s.key === 'home.gallery.panel_size')
  caption.role = 'business.category_label'
  caption.group = { id: 'agent.group', item: 0, kind: 'business' }
  const name = previous.slots.find((s) => s.key === 'site.name')
  name.role = 'business.summary'
  name.group = { id: 'agent.group', item: 0, kind: 'business' }
  const out = roleDerive(sql, previous)
  assert.deepEqual(
    [slotOf(out, 'home.gallery.panel_size').role, slotOf(out, 'home.gallery.panel_size').group.id],
    ['business.category_label', 'agent.group']
  )
  assert.equal(slotOf(out, 'site.name').role, 'business.summary', 'a reviewed role beats the tables')
  assert.equal(out.unplaced.includes('home.gallery.panel_size'), false)
})

test('a slot whose sample changed is rebound by the rule tables, not carried', () => {
  const previous = roleDerive(rolesPage('Boats built by hand')).contentMap
  const name = previous.slots.find((s) => s.key === 'site.name')
  name.role = 'business.summary'
  name.group = { id: 'agent.group', item: 0, kind: 'business' }
  const changed = rolesPage('Boats built by hand').replace("'Demo'", "'Harbour Studio'")
  const out = roleDerive(changed, previous)
  assert.equal(slotOf(out, 'site.name').sample, 'Harbour Studio')
  assert.equal(slotOf(out, 'site.name').role, 'business.name')
  assert.notEqual(slotOf(out, 'site.name').group.id, 'agent.group')
})

test('a new slot is bound by the rule tables, or listed when they cannot place it', () => {
  const previous = roleDerive(rolesPage('Boats built by hand')).contentMap
  const out = roleDerive(rolesPage('Boats built by hand', `\n${para('hero.lead', 'Small yard.')}`), previous)
  assert.ok(slotOf(out, 'home.hero.lead'))
  // The new slot is either bound or listed, never silently left without a role.
  assert.equal(slotOf(out, 'home.hero.lead').role !== undefined, !out.unplaced.includes('home.hero.lead'))
  assert.equal(slotOf(out, 'site.name').role, 'business.name')
  assert.ok(out.unplaced.includes('home.gallery.panel_size'))
})

test('the command line takes --previous-map and --unplaced-report and prints the unplaced slots', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-cc-roles-'))
  const gz = gzipSync(rolesPage('Boats built by hand'))
  const dumpFile = path.join(dir, 'd.sql.gz')
  writeFileSync(dumpFile, gz)
  const manifest = path.join(dir, 'manifest.json')
  writeFileSync(
    manifest,
    JSON.stringify({
      ...RELEASE,
      database: { ...RELEASE.database, sha256: createHash('sha256').update(gz).digest('hex') }
    })
  )
  const run = (root, extra = []) =>
    execFileSync(
      process.execPath,
      [
        path.join(SCRIPTS, 'capture-contract.mjs'),
        '--contract',
        'ja-demo/wp7/1.0.0',
        '--dump',
        dumpFile,
        '--release-manifest',
        manifest,
        '--tag',
        CARD.tag,
        '--cowork-version',
        '0.17.1',
        '--contracts-root',
        path.join(dir, root),
        '--theme-roots',
        'wp-content/themes/wp-demo',
        ...extra
      ],
      { encoding: 'utf8' }
    )
  const mapOf = (root) =>
    JSON.parse(readFileSync(path.join(dir, root, 'ja-demo/wp7/1.0.0/content-map.json'), 'utf8'))
  const report = path.join(dir, 'unplaced.json')
  const first = run('c1', ['--unplaced-report', report])
  assert.match(first, /Slots without a role \(1\).*home\.gallery\.panel_size/)
  assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')).unplaced, ['home.gallery.panel_size'])
  const reviewed = mapOf('c1')
  for (const key of ['home.gallery.panel_size']) {
    const slot = reviewed.slots.find((s) => s.key === key)
    slot.role = 'business.category_label'
    slot.group = { id: 'agent.group', item: 0, kind: 'business' }
  }
  writeFileSync(path.join(dir, 'prev.json'), JSON.stringify(reviewed))
  const second = run('c2', ['--previous-map', path.join(dir, 'prev.json')])
  assert.match(second, /Slots without a role \(0\).*none/)
  assert.equal(
    mapOf('c2').slots.find((s) => s.key === 'home.gallery.panel_size').role,
    'business.category_label'
  )
})
