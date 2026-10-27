/**
 * The Templates screen folds releases into one template the way the server's `templateCards` folds
 * them into one customer card, and names two releases of the same CMS apart.
 *
 * The rows below are the real `GET /api/ops/quickstarts` rows for the Tracy family on the local
 * snapshot stand (10/10/2026), cut to the fields the fold reads. The trap they carry:
 * `tracy-base/wp7` declares `template: "tracy-base"` in its install file but files its CARD under
 * `tracy` (the card's own `template` wins on the server, `cardTemplateOf`), so customers see one
 * "Tracy Base" card built by WordPress and Joomla, while `tracy-apple/j6` declares `template:
 * "tracy"` and carries no card. Folding by the install file alone put the Apple Joomla release
 * beside Tracy Base and dropped WordPress from it. Since Akemi's call of 10/10/2026 a release on no
 * card joins the card of its tag family, else its tag family is its template: `tracy-base/emdash-0.x`
 * joins Tracy Base, and Tracy Apple is its own template.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let mod

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { templateRows, releaseNames, defaultReleaseTag, tagFamilyOf } from './cms/templates-model'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent'
  })
  mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

// [tag, template, platform, version, kind, inspiration state, cardSource, tracy, label]
const CAPTURED = [
  ['tracy-base/wp7', 'tracy-base', 'wordpress', '1.1.2', 'quickstart', 'on', true, 'ready', 'Tracy Base'],
  [
    'tracy-base/emdash-0.x',
    'tracy-base',
    'emdash',
    '0.4.0',
    'quickstart',
    'none',
    false,
    'ready',
    'Tracy Base'
  ],
  [
    'tracy-saas/emdash-0.x',
    'tracy-saas',
    'emdash',
    '1.4.2',
    'quickstart',
    'card',
    false,
    'ready',
    'Tracy SaaS'
  ],
  [
    'tracy-business/wp7',
    'tracy-business',
    'wordpress',
    '1.3.4',
    'quickstart',
    'on',
    true,
    'ready',
    'Tracy Business'
  ],
  [
    'tracy-business/emdash-0.x',
    'tracy-business',
    'emdash',
    '1.7.4',
    'quickstart',
    'on',
    false,
    'ready',
    'Tracy Business'
  ],
  [
    'tracy-business/j6',
    'tracy-business',
    'joomla',
    '1.2.1',
    'quickstart',
    'on',
    false,
    'ready',
    'Tracy Business'
  ],
  ['tracy-base/j6', 'tracy', 'joomla', '1.0.2', 'quickstart', 'on', false, 'ready', 'Tracy Base'],
  ['tracy-airbnb/j6', null, 'joomla', null, 'design-pack', 'n/a', false, 'no-setting', null],
  ['tracy-apple/j6', 'tracy', 'joomla', '1.3.0', 'quickstart', 'none', false, 'ready', 'Tracy Apple']
]
// Each release's own Design inspiration cell warnings, as the local stand words them (10/10/2026).
const CELL_WARNINGS = {
  'tracy-base/wp7': [
    '8 of 8 pictures are not on this server yet: tracy-home-390.png, tracy-home-1440.png',
    'No demo on this server to preview'
  ],
  'tracy-base/j6': ['The demo on this server runs 1.0.1, not the release’s 1.0.2']
}
const releases = CAPTURED.map(
  ([tag, template, platform, version, kind, state, cardSource, tracy, label]) => ({
    tag,
    name: label ?? tag,
    label,
    kind,
    github: 'published',
    tracy,
    reason: null,
    choosable: tracy === 'ready',
    platform,
    platformFromTag: false,
    version,
    cms: null,
    template,
    publishedAt: null,
    inspiration: { state, why: null, code: null, warnings: CELL_WARNINGS[tag] ?? [] },
    contract: { state: platform === 'emdash' ? 'not-applicable' : 'exact' },
    notShowable: null,
    cardSource
  })
)
// The `shown` cards exactly as the local and dev `GET /api/templates` fold them (same tags).
const shownCard = (id, label, tags, warnings = []) => ({
  id,
  label,
  card: { provider: null, category: null, blurb: null, image: null, layouts: 0 },
  design: null,
  platforms: tags.map(([platform, tag, version]) => ({ platform, tag, version, demo: null })),
  warnings
})
const inspiration = {
  shown: [
    shownCard(
      'tracy',
      'Tracy Base',
      [
        ['wordpress', 'tracy-base/wp7', '1.1.2'],
        ['joomla', 'tracy-base/j6', '1.0.2']
      ],
      [
        'WordPress: 8 of 8 pictures are not on this server yet: tracy-home-390.png, tracy-home-1440.png',
        'WordPress: No demo on this server to preview',
        'Joomla: The demo on this server runs 1.0.1, not the release’s 1.0.2'
      ]
    ),
    shownCard('tracy-business', 'Tracy Business', [
      ['wordpress', 'tracy-business/wp7', '1.3.4'],
      ['emdash', 'tracy-business/emdash-0.x', '1.7.4'],
      ['joomla', 'tracy-business/j6', '1.2.1']
    ])
  ],
  notShown: [],
  noCard: []
}

test('a template holds every release its customer card holds, and no other row claims one', () => {
  const rows = mod.templateRows(releases, inspiration)
  for (const card of inspiration.shown) {
    const row = rows.find((r) => r.id === card.id)
    assert.ok(row, `a row for card ${card.id}`)
    const tags = row.releases.map((r) => r.tag)
    for (const p of card.platforms) assert.ok(tags.includes(p.tag), `${card.id} holds ${p.tag}`)
    for (const other of rows.filter((r) => r.id !== card.id))
      for (const p of card.platforms)
        assert.ok(!other.releases.some((r) => r.tag === p.tag), `${other.id} does not hold ${p.tag}`)
  }
})

test('a release on no card joins its tag family: EmDash into Tracy Base, Tracy Apple on its own', () => {
  const rows = mod.templateRows(releases, inspiration)
  const tagsOf = (id) => rows.find((r) => r.id === id)?.releases.map((r) => r.tag)
  assert.deepEqual(tagsOf('tracy'), ['tracy-base/j6', 'tracy-base/wp7', 'tracy-base/emdash-0.x'])
  const apple = rows.find((r) => r.id === 'tracy-apple')
  assert.equal(apple.label, 'Tracy Apple')
  assert.deepEqual(tagsOf('tracy-apple'), ['tracy-apple/j6'])
  assert.equal(apple.active, false)
  assert.equal(apple.hasListing, false, 'the list draws No card for it')
  assert.equal(rows.filter((r) => r.label === 'Tracy Base').length, 1)
  assert.equal(
    rows.find((r) => r.id === 'tracy-base'),
    undefined
  )
})

test('the tag family drops local/ and quickstart/ and reads in card-id spelling', () => {
  assert.equal(mod.tagFamilyOf('tracy-apple/j6'), 'tracy-apple')
  assert.equal(mod.tagFamilyOf('tracy-base/emdash-0.x'), 'tracy-base')
  assert.equal(mod.tagFamilyOf('quickstart/ja-essence/j6'), 'ja-essence')
  assert.equal(mod.tagFamilyOf('local/tracy-base/wp7'), 'tracy-base')
  assert.equal(mod.tagFamilyOf('JA_Titan/j6'), 'ja-titan')
})

test('two releases of one CMS in one template are named apart; a lone CMS keeps its plain name', () => {
  const both = releases.filter((r) => ['tracy-base/wp7', 'tracy-base/j6', 'tracy-apple/j6'].includes(r.tag))
  const names = mod.releaseNames(both)
  assert.equal(names.get('tracy-base/wp7'), 'WordPress')
  assert.equal(names.get('tracy-base/j6'), 'Joomla · tracy-base/j6')
  assert.equal(names.get('tracy-apple/j6'), 'Joomla · tracy-apple/j6')
  const tracy = mod.templateRows(releases, inspiration).find((r) => r.id === 'tracy')
  assert.equal(mod.releaseNames(tracy.releases).get('tracy-base/j6'), 'Joomla')
})

test('a template page opens on the card source; an asked release or CMS wins', () => {
  const tracy = mod.templateRows(releases, inspiration).find((r) => r.id === 'tracy')
  // Joomla is first in the rail's order, but WordPress feeds the card.
  assert.equal(tracy.releases[0].tag, 'tracy-base/j6')
  assert.equal(mod.defaultReleaseTag(tracy.releases), 'tracy-base/wp7')
  assert.equal(mod.defaultReleaseTag(tracy.releases, 'tracy-base/emdash-0.x'), 'tracy-base/emdash-0.x')
  assert.equal(mod.defaultReleaseTag(tracy.releases, 'joomla'), 'tracy-base/j6')
  assert.equal(mod.defaultReleaseTag(tracy.releases, 'nothing/like-this'), 'tracy-base/wp7')
  // No card source: the first Listed, then the first Hidden, then the first release.
  const plain = (tag, state) => ({ ...releases[0], tag, cardSource: false, inspiration: { state } })
  assert.equal(mod.defaultReleaseTag([plain('a', 'none'), plain('b', 'card'), plain('c', 'on')]), 'c')
  assert.equal(mod.defaultReleaseTag([plain('a', 'none'), plain('b', 'card')]), 'b')
  assert.equal(mod.defaultReleaseTag([plain('a', 'none'), plain('b', 'n/a')]), 'a')
})
