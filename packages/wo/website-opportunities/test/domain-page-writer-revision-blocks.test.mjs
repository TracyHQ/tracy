// A revision writes again only the blocks that changed (#599): the first call of a page sent for some blocks asks those
// blocks' fields alone; the page's other blocks ride along as read only context (`kept`, with a plain note) and keep
// their words byte for byte whatever the writer answers for them; the page's own check and the whole site check still
// read the full page, kept and new words together. Invented club, scripted fakes, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-page-writer-revision-blocks.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { KEPT_NOTE } from '../domain/page-writer-request.mjs'
import { keptWordsOf } from '../domain/revision-impact.mjs'
import { factWriter, ownerPlan } from './fixtures/owner-statement/club-owner-facts.mjs'
import { blockStore, library } from './fixtures/plan-composer/invented-club.mjs'

const write = (plan, profile, model, reuse) =>
  writePages({ plan, profile, blockStore: blockStore(), library: library(), model, reuse })

async function firstWords() {
  const { plan, profile } = await ownerPlan({ facts: [] })
  const first = await write(plan, profile, factWriter())
  return { plan, profile, words: new Map(first.pages.map((p) => [p.id, keptWordsOf(p)])) }
}

/** A writer that answers every key it sees, the kept ones too, with `text(key)`. */
function greedy(text) {
  const calls = []
  const model = async (request) => {
    calls.push(request)
    const user = JSON.parse(request.user)
    const keys = [
      ...user.blocks.flatMap((b) => b.fields.map((f) => f.key)),
      ...(user.kept?.blocks ?? []).flatMap((b) => Object.keys(b.words))
    ]
    return JSON.stringify({ fields: Object.fromEntries(keys.map((k) => [k, text(k)])) })
  }
  return Object.assign(model, { calls })
}

test('only the changed block is asked; the kept blocks are context and keep their words byte for byte', async () => {
  const { plan, profile, words } = await firstWords()
  const reuse = new Map([
    ['home', { ...words.get('home'), ask: new Set(['home-b3']) }],
    ['team', words.get('team')]
  ])
  const model = greedy((key) => `New ${key.split('/')[1]}`)
  const out = await write(plan, profile, model, reuse)
  assert.equal(model.calls.length, 1, 'one call: the home page; the team page keeps its words with no call')
  const user = JSON.parse(model.calls[0].user)
  assert.deepEqual(
    user.blocks.map((b) => [b.id, b.fields.map((f) => f.key)]),
    [['home-b3', ['home-b3/heading']]]
  )
  assert.equal(user.kept.note, KEPT_NOTE)
  assert.deepEqual(
    user.kept.blocks.map((b) => b.id),
    ['home-b1', 'home-b2', 'home-extra-7', 'home-b6']
  )
  for (const b of user.kept.blocks) {
    assert.ok(!('fields' in b), 'a kept block has no field to write')
    for (const [key, value] of Object.entries(b.words)) assert.equal(value, words.get('home').values[key])
  }
  const home = out.pages.find((p) => p.id === 'home').fields.filter((f) => f.from === 'writer')
  for (const f of home)
    assert.equal(
      f.value,
      f.key === 'home-b3/heading' ? 'New heading' : words.get('home').values[f.key],
      f.key
    )
})

test('the page check reads kept and new words together: a new block repeating a kept one is rewritten', async () => {
  const { plan, profile, words } = await firstWords()
  const kept = { ...words.get('home'), values: { ...words.get('home').values } }
  kept.values['home-b2/heading'] = 'Friendly coaching for every age'
  const reuse = new Map([['home', { ...kept, ask: new Set(['home-b3']) }]])
  let n = 0
  const model = greedy((key) =>
    key === 'home-b3/heading' && n++ === 0 ? 'Friendly coaching for every age' : 'Courts and lessons'
  )
  const out = await write(plan, profile, model, reuse)
  const home = model.calls.filter((c) => JSON.parse(c.user).page.id === 'home')
  assert.equal(home.length, 2, 'the first call and one rewrite')
  assert.deepEqual(
    JSON.parse(home[1].user).rewrite.map((r) => r.key),
    ['home-b3/heading']
  )
  const fields = out.pages.find((p) => p.id === 'home').fields
  assert.equal(fields.find((f) => f.key === 'home-b2/heading').value, 'Friendly coaching for every age')
  assert.equal(fields.find((f) => f.key === 'home-b3/heading').value, 'Courts and lessons')
})
