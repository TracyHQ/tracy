// The blank site contract (#584): the released contract restricted to the records the blank site keeps, each slot the
// blank site empties opened (its sample the blank value, `opensEmpty`), and the check that guards it. On the invented
// demo data fixture and the invented contract beside it; no php: HTML pieces are emptied by a stand-in.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BLANK_SITE_STEPS, produceBlankSite } from '../scripts/blank-site.mjs'
import { blankSiteContract, blankSiteContractId } from '../scripts/blank-site-contract.mjs'
import { checkBlankSiteContract } from '../scripts/blank-site-contract-check.mjs'
import { blankSlot, emptiedSamples } from '../scripts/blank-site-contract-samples.mjs'
import { emptyDeclaredFieldsStep } from '../scripts/blank-site-empty-fields.mjs'
import { mappingFile, releasedContract } from './fixtures/blank-site/contract.mjs'

const DEMO = readFileSync(new URL('./fixtures/blank-site/custom.sql.txt', import.meta.url), 'utf8')
const SHAS = {
  'manifest.json': '1'.repeat(64),
  'content-map.json': '2'.repeat(64),
  'presentation-lock.json': '3'.repeat(64)
}
// Stands in for `empty-html-places.php` on the one kind of value these tests give it.
const emptyHtml = (entries) => entries.map((e) => ({ html: e.html.replace(/>[^<]*</g, '><') }))

function make() {
  const released = releasedContract()
  const mapping = mappingFile()
  const steps = [...BLANK_SITE_STEPS, emptyDeclaredFieldsStep({ mapping, readFile: () => null, emptyHtml })]
  const after = produceBlankSite(DEMO, { steps }).sql
  const made = blankSiteContract({ ...released, mapping, before: DEMO, after, released: SHAS, emptyHtml })
  const blank = {
    manifest: JSON.parse(made.files['manifest.json']),
    contentMap: JSON.parse(made.files['content-map.json']),
    lock: JSON.parse(made.files['presentation-lock.json'])
  }
  return { released, mapping, made, blank }
}

const check = ({ released, mapping, blank }) =>
  checkBlankSiteContract({ mapping, released: { ...released, sha256: SHAS }, blank, emptyHtml })

test('the id is the released one with -blank, under the plugin rule for a profile id', () => {
  assert.equal(blankSiteContractId('ja-bakery/j6/1.0.3'), 'ja-bakery-blank/j6/1.0.3')
  assert.throws(() => blankSiteContractId('Bad Id/j6/1'), /no valid blank site contract id/)
})

test('it keeps the records the blank site keeps and names none it removes', () => {
  const { made, blank } = make()
  assert.deepEqual(made.removed, ['article-1', 'category-8', 'menuItem-102'])
  assert.deepEqual(
    blank.contentMap.entities.map((e) => e.key),
    ['module-90', 'module-91']
  )
  assert.deepEqual(
    blank.contentMap.slots.map((s) => s.key),
    ['module-90.0', 'module-90.1', 'module-91.0']
  )
  assert.deepEqual(blank.contentMap.pages, [])
  assert.deepEqual(blank.contentMap.itemPages, {})
  assert.deepEqual(Object.keys(blank.lock.entities), ['module-90', 'module-91'])
  assert.deepEqual(blank.lock.assignments, [], 'the blank site assigns its blocks to no page')
  assert.deepEqual(blank.lock.inventoryCounts, { module: 2, category: 0, article: 0, menuItem: 0 })
  assert.deepEqual(blank.lock.access.entityRules, { 'modules.90': '{}' })
  assert.equal(blank.manifest.id, 'ja-bakery-blank/j6/1.0.3')
  assert.deepEqual(blank.manifest.blankSiteOf.files, SHAS)
  assert.equal(blank.manifest.blankSiteOf.opened, 1)
})

test('a place the blank site empties opens empty; every other slot is the released one', () => {
  const { released, blank } = make()
  const [heading, title, footer] = blank.contentMap.slots
  assert.equal(heading.sample, '')
  assert.equal(heading.opensEmpty, true)
  assert.deepEqual(
    { ...heading, sample: 'Bread, slowly', opensEmpty: undefined },
    { ...released.contentMap.slots[0], opensEmpty: undefined }
  )
  assert.deepEqual(title, released.contentMap.slots[1])
  assert.deepEqual(footer, released.contentMap.slots[2])
})

test('pieces of an HTML slot leave the slot occupied: its sample is the emptied value, and it does not open empty', () => {
  const slot = {
    key: 'module-5.0',
    entity: 'module-5',
    column: 'content',
    type: 'text',
    sample: '<h2>Rye</h2><a href="#">More</a>'
  }
  const mapping = {
    entities: { 'module-5': { kind: 'module', sourceId: 5 } },
    blocks: {
      b: {
        fields: {
          title: [
            {
              entity: 'module-5',
              column: 'content',
              slot: 'module-5.0',
              xpath: '/html/body/div/h2',
              piece: true
            }
          ]
        }
      }
    }
  }
  const emptied = emptiedSamples({ mapping, slots: [slot], emptyHtml })
  assert.deepEqual(blankSlot(slot, emptied), { ...slot, sample: '<h2></h2><a href="#"></a>' })
})

test('two runs give the same bytes', () => {
  assert.deepEqual(make().made.files, make().made.files)
})

test('the check passes on what the generator makes', () => {
  assert.deepEqual(check(make()), [])
})

test('the check names each way a blank site contract goes wrong', () => {
  const cases = [
    [
      'another id',
      (b) => (b.manifest.id = 'ja-bakery/j6/1.0.3'),
      /manifest.json id: must be ja-bakery-blank/
    ],
    [
      'a stale released file',
      (b) => (b.manifest.blankSiteOf.files['content-map.json'] = '9'.repeat(64)),
      /make the blank site contract again/
    ],
    [
      'the demo sample left in an emptied place',
      (b) => (b.contentMap.slots[0].sample = 'Bread, slowly'),
      /the blank site empties it/
    ],
    [
      'an emptied place that does not open',
      (b) => delete b.contentMap.slots[0].opensEmpty,
      /the blank site empties it/
    ],
    [
      'a slot changed that the blank site keeps',
      (b) => (b.contentMap.slots[2].maxCharacters = 5),
      /differs from the released slot/
    ],
    [
      'a removed record named',
      (b) => (b.lock.entities['article-1'] = {}),
      /names article-1, a record the blank site removes/
    ],
    [
      'a slot of a kept record missing',
      (b) => b.contentMap.slots.splice(0, 1),
      /slot module-90.0 of a kept record is missing/
    ],
    [
      'a slot on a record the build creates',
      (b) => b.contentMap.slots.push({ key: 'article-1.0', entity: 'article-1' }),
      /article-1.0 is on a record the build creates/
    ]
  ]
  for (const [name, spoil, message] of cases) {
    const input = make()
    spoil(input.blank)
    const problems = check(input)
    assert.ok(
      problems.some((p) => message.test(`${p.file} ${p.at}: ${p.message}`)),
      `${name}: ${JSON.stringify(problems)}`
    )
  }
})
