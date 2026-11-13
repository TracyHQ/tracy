// Icon fields and picture frames inside child lists (ticket #595, review 13/11): JA Boxing's class page holds four
// feature rows with two icon fields each, and exercise and punch rows with a picture and a video. The pictures step sees
// every one of them, and its decisions are held to the DECLARATION, enumerated straight from the block store
// (`picture-declared.mjs`): declared instances = decided instances, nothing unexplained. Run on the real JA Boxing block
// store with every block placed, and on the invented fixtures. The reason histograms are printed.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-depth.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { iconScopesOfPlan } from '../domain/icon-fields.mjs'
import { declaredMediaOf, mediaAccountOf } from '../domain/picture-declared.mjs'
import { framesOfPlan } from '../domain/picture-frames.mjs'
import { blocksOf, picturesStep } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { blockStore as clubStore } from './fixtures/plan-composer/invented-club.mjs'
import { everyBlockPlaced } from './fixtures/icon-fields/every-block-placed.mjs'
import {
  blockStore,
  firstCandidate,
  iconLibrary,
  scriptedModel
} from './fixtures/icon-fields/invented-yoga.mjs'

const BOXING = new URL(
  '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/block-store.json',
  import.meta.url
)
const boxing = () => JSON.parse(readFileSync(BOXING, 'utf8'))
const vision = scriptedModel()

async function stepOn(store) {
  const { plan, profile, copy } = await everyBlockPlaced(store)
  const result = await picturesStep({
    plan,
    profile,
    blockStore: store,
    vision,
    model: scriptedModel(firstCandidate()),
    copy,
    iconLibrary: iconLibrary()
  })
  const declared = declaredMediaOf(plan.pages, blocksOf(store), planDataOf(profile))
  return { plan, profile, result, account: mediaAccountOf(declared, result) }
}

function assertAccounted(label, account) {
  for (const kind of ['icon', 'video', 'image']) {
    const a = account[kind]
    console.log(
      `${label} ${kind}: declared ${a.declared} = decided ${a.decided}; sources ${JSON.stringify(a.sources)}; reasons ${JSON.stringify(a.reasons)}; unexplained ${a.unexplained}`
    )
    assert.deepEqual(a.missing, [], `${label} ${kind}: declared but never decided`)
    assert.deepEqual(a.extra, [], `${label} ${kind}: decided but never declared`)
    assert.equal(a.declared, a.decided)
    assert.equal(a.unexplained, 0)
  }
}

test('JA Boxing: the child list rows of the class page are seen, icons, pictures and videos alike', () => {
  const store = boxing()
  const detail = store.blocks.find((b) => b.id === 'class-detail')
  const pages = [{ id: 'class', blocks: [{ id: 'b1', type: detail.type, block: detail.id, data: [] }] }]
  const data = planDataOf({ sources: [], facts: {}, items: {} })
  const scopes = iconScopesOfPlan(pages, blocksOf(store), data)
  assert.deepEqual(
    scopes.map((s) => [s.id, s.row, s.fields.map((f) => `${f.field}@${f.frame.width}`).join('+')]),
    [1, 2, 3, 4].map((n) => [`class.b1.features.${n}`, `features.${n}`, 'icon@150+icon-light@150'])
  )
  const frames = framesOfPlan(pages, blocksOf(store), data)
  const rows = frames.filter((f) => f.row).map((f) => `${f.id}:${f.place}`)
  assert.deepEqual(
    rows.filter((r) => r.startsWith('class.b1.exercises.1.')),
    ['class.b1.exercises.1.picture:row', 'class.b1.exercises.1.video:video']
  )
  assert.equal(rows.length, 8)
})

test('JA Boxing with every block placed: every declared icon, video and image field is decided, none unexplained', async () => {
  const { result, account } = await stepOn(boxing())
  assertAccounted('JA Boxing', account)
  assert.ok(account.icon.declared >= 20 && account.video.declared > 0 && account.image.declared > 0)
  // A row has no written words yet (the writer writes no child list field): its icon is hidden, with the reason.
  const row = result.icons.find((i) => i.id === 'class-detail.b1.features.1.icon')
  assert.deepEqual([row.source, row.reason], ['none', 'icon_words_missing'])
  assert.ok(result.icons.some((i) => i.case === 'social' && i.source === 'library'))
})

test('the invented templates: declared = decided as well', async () => {
  assertAccounted('invented yoga', (await stepOn(blockStore())).account)
  assertAccounted('invented club', (await stepOn(clubStore())).account)
})

test('an icon field the step would not see shows as missing against the declaration', async () => {
  const store = boxing()
  const { plan, profile, result } = await stepOn(store)
  const declared = declaredMediaOf(plan.pages, blocksOf(store), planDataOf(profile))
  const blind = { ...result, icons: result.icons.filter((i) => !i.row) }
  assert.deepEqual(mediaAccountOf(declared, blind).icon.missing.length, 8)
})
