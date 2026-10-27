/**
 * The Card tab (Templates page): the selected release's Status, beside its content contract, says
 * where ITS listing stands: "No listing yet", "Hidden" or "Listed", plus "No content contract" when its
 * road says it has none, and "Used on Design Inspiration" (a strip under that status) for at
 * most one release: the one whose listing feeds the card customers see. The CMS chips themselves are plain. That
 * one is the server's `cardSource` (`cardSources`, the rule `templateCards` follows), passed
 * through, never worked out in the browser. The server half is
 * `apps/tracy-web/test/ops-quickstarts.test.mjs`.
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
      contents: `export { chipStatusOf, templateRows, NO_CONTRACT, listingNextStep, listingWord, noContractLine } from './cms/templates-model'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

const cell = (state, over = {}) => ({ state, why: null, code: null, warnings: [], ...over })
const row = (platform, tag, inspiration, over = {}) => ({
  tag,
  name: 'Tracy Business',
  label: 'Tracy Business',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  reason: null,
  choosable: true,
  platform,
  platformFromTag: false,
  version: '1.0.0',
  cms: null,
  template: 'tracy-business',
  publishedAt: null,
  inspiration,
  contract: { state: platform === 'emdash' ? 'not-applicable' : 'exact' },
  notShowable: null,
  cardSource: false,
  ...over
})

test('each release status names its own listing: Listed, Hidden or No listing yet', () => {
  assert.equal(mod.chipStatusOf(row('wordpress', 'tracy-business/wp7', cell('on'))).card, 'Listed')
  assert.equal(
    mod.chipStatusOf(row('joomla', 'tracy-business/j6', cell('card', { code: 'unpublished' }))).card,
    'Hidden'
  )
  assert.equal(
    mod.chipStatusOf(row('emdash', 'tracy-business/emdash-0.x', cell('none'))).card,
    'No listing yet'
  )
  assert.equal(mod.chipStatusOf(row('emdash', 'quickstart/x/emdash', cell('n/a'))).card, 'No listing yet')
})

test('"No content contract" in the status exactly where the road says it', () => {
  const contract = (code) => ({
    step: 'contract',
    state: code === 'no-contract' ? 'todo' : 'done',
    code,
    params: {}
  })
  const lacking = row('joomla', 'tracy-business/j6', cell('card'), { road: [contract('no-contract')] })
  const emdash = row('emdash', 'tracy-business/emdash-0.x', cell('on'), {
    road: [contract('contract-not-needed')]
  })
  const sibling = row('wordpress', 'tracy-business/wp7', cell('card'), {
    road: [{ step: 'contract', state: 'todo', code: 'sibling-no-contract', params: { tags: ['x'] } }]
  })
  assert.equal(mod.chipStatusOf(lacking).contract, mod.NO_CONTRACT)
  assert.equal(mod.chipStatusOf(emdash).contract, null, 'EmDash is never asked for a contract')
  assert.equal(
    mod.chipStatusOf(sibling).contract,
    null,
    'its own contract is there; another release lacks one'
  )
  const [t] = mod.templateRows([lacking, emdash], { shown: [], notShown: [] })
  assert.equal(t.issues.filter((i) => i.endsWith(mod.NO_CONTRACT)).length, 1)
})

test('one release at most is "Used on Design Inspiration", the one the server named; none when nothing is shown', () => {
  const releases = [
    row('joomla', 'tracy-business/j6', cell('on')),
    row('wordpress', 'tracy-business/wp7', cell('on'), { cardSource: true }),
    row('emdash', 'tracy-business/emdash-0.x', cell('on'))
  ]
  assert.deepEqual(
    releases.filter((r) => mod.chipStatusOf(r).onInspiration).map((r) => r.tag),
    ['tracy-business/wp7']
  )
  const hidden = releases.map((r) => ({ ...r, inspiration: cell('card'), cardSource: false }))
  assert.equal(hidden.filter((r) => mod.chipStatusOf(r).onInspiration).length, 0)
  // An older server sends no `cardSource`: no chip claims it.
  const { cardSource: _, ...old } = releases[1]
  assert.equal(mod.chipStatusOf(old).onInspiration, false)
})

test('the status strip is the state word and at most one short phrase', () => {
  assert.equal(mod.listingWord('No listing yet'), 'Not listed yet')
  assert.equal(mod.listingWord('Hidden'), 'Hidden')
  assert.equal(mod.listingNextStep('Listed'), 'Customers can pick it.')
  assert.equal(mod.listingNextStep('Hidden'), 'Saved, hidden from customers.')
  assert.equal(mod.listingNextStep('No listing yet'), '')
  assert.equal(mod.noContractLine(), 'Needs a content contract (step 3).')
  for (const card of ['Listed', 'Hidden', 'No listing yet']) {
    const line = `${mod.listingWord(card)}. ${mod.listingNextStep(card)}`
    assert.ok(line.length <= 50, line)
    assert.doesNotMatch(line, /[\u2013\u2014]/)
  }
})

test('a design pack carries no tab dots: every tab counts zero', () => {
  const [r] = mod.templateRows(
    [
      row('joomla', 'tracy-airbnb/j6', cell('n/a'), {
        kind: 'design-pack',
        tracy: 'no-setting',
        contract: { state: 'none' }
      })
    ],
    { shown: [], notShown: [], noCard: [] }
  )
  assert.deepEqual(r.problems, {
    card: { issues: 0, warnings: 0 },
    settings: { issues: 0, warnings: 0 },
    questions: { issues: 0, warnings: 0 }
  })
})
