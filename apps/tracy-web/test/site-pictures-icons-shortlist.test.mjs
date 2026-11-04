// The icon shortlist and the ranking (#345): library words only, no table of a trade; a model cannot invent a name;
// no icon twice in one block. Every plan word here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  iconAnswerOf,
  iconQuestion,
  rankIcons,
  seederTextDoor
} from '../src/site-pictures/icons/icon-ranker.js'
import {
  assignIcons,
  iconShortlist,
  MENU_MAX,
  NEUTRAL_MARKS,
  usableCatalog,
  validRanking,
  wordsOfWish
} from '../src/site-pictures/icons/icon-shortlist.js'
import { hasPhosphorIcon, phosphorCatalog } from '../src/site-pictures/icons/phosphor-set.js'

const catalog = usableCatalog(phosphorCatalog())

test('the shortlist is made of library names and tags, for any trade', () => {
  for (const [shows, expected] of [
    ['a wrench', 'wrench'],
    ['a bicycle', 'bicycle'],
    ['a coffee cup', 'coffee'],
    ['a stethoscope', 'stethoscope'],
    ['a guitar', 'guitar']
  ]) {
    const menu = iconShortlist({ shows }, catalog)
    assert.ok(menu.includes(expected), `${shows}: ${menu.slice(0, 8)}`)
    assert.ok(menu.length <= MENU_MAX)
    assert.ok(menu.every(hasPhosphorIcon))
  }
})

test('style words of the plan call no icon; a word no icon says gives an empty menu', () => {
  assert.deepEqual(wordsOfWish({ shows: 'a wrench', mustInclude: ['thin line', 'one colour'] }).extra, [])
  assert.deepEqual(iconShortlist({ shows: 'zzqx', mustInclude: ['thin line', 'one colour'] }, catalog), [])
  assert.ok(iconShortlist({ shows: 'a wrench', mustInclude: ['thin line'] }, catalog).includes('wrench'))
})

test('brand logos are never on a menu', () => {
  assert.ok(catalog.every((i) => !i.name.endsWith('-logo') && !i.categories.includes('brands')))
  assert.ok(!iconShortlist({ shows: 'github' }, catalog).some((n) => n.includes('github')))
})

test('a ranking is cut to the frame menu: invented and foreign names are dropped, repeats too, five at most', () => {
  const menu = ['wrench', 'hammer', 'gear', 'nut', 'screwdriver', 'toolbox']
  assert.deepEqual(
    validRanking(
      ['Wrench', 'made-up-icon', 'bicycle', 'wrench', 'hammer', 'gear', 'nut', 'screwdriver', 'toolbox'],
      menu
    ),
    ['wrench', 'hammer', 'gear', 'nut', 'screwdriver']
  )
  assert.deepEqual(validRanking('wrench', menu), [])
})

test('the model answer keeps only the ids asked and the names of their own menus', () => {
  const items = [
    { id: 'f1', menu: ['wrench', 'gear'] },
    { id: 'f2', menu: ['bicycle'] }
  ]
  assert.deepEqual(
    iconAnswerOf({ items: { f1: ['gear', 'bicycle', 'zzz'], f2: ['wrench'], f9: ['gear'] } }, items),
    {
      f1: ['gear']
    }
  )
  assert.equal(iconAnswerOf({ items: {} }, items), null)
  assert.equal(iconAnswerOf(null, items), null)
})

test('no icon twice in one block; a frame nothing calls takes a neutral mark', () => {
  const cand = (...names) => names.map((name) => ({ name, by: 'model' }))
  const got = assignIcons([
    { id: 'a', section: 'b1', candidates: cand('wrench', 'gear') },
    { id: 'b', section: 'b1', candidates: cand('wrench', 'gear') },
    { id: 'c', section: 'b1', candidates: cand('wrench', 'gear') },
    { id: 'd', section: 'b1', candidates: [] },
    { id: 'e', section: 'b2', candidates: cand('wrench') }
  ])
  assert.deepEqual(
    [...got.values()].map((v) => v.name),
    ['wrench', 'gear', NEUTRAL_MARKS[0], NEUTRAL_MARKS[1], 'wrench']
  )
  assert.equal(got.get('d').by, 'neutral')
})

test('every neutral mark is in the library', () => {
  assert.ok(NEUTRAL_MARKS.every(hasPhosphorIcon))
})

test('the ranking call: a fake door is asked once; failures, timeouts and junk fall back with a note', async () => {
  const items = [{ id: 'f1', section: 's', words: 'a wrench', menu: ['wrench', 'gear'] }]
  const calls = []
  const ok = await rankIcons({
    door: async (q) => (
      calls.push(q),
      { text: '```json\n{"items":{"f1":["gear","invented"]}}\n```', model: 'fake/model', usage: { n: 1 } }
    ),
    items
  })
  assert.deepEqual([ok.rankings, ok.model, calls.length], [{ f1: ['gear'] }, 'fake/model', 1])
  assert.match(calls[0].user, /"menu":\["wrench","gear"\]/)
  assert.match(iconQuestion(items).system, /never|only names from the menu/i)
  for (const door of [
    null,
    async () => {
      throw new Error('boom')
    },
    async () => ({ text: 'no json' }),
    async () => ({ text: '{"items":{"f1":["invented"]}}' })
  ]) {
    const r = await rankIcons({ door, items })
    assert.equal(r.rankings, null)
    assert.match(r.note, /shortlist order/)
  }
  assert.equal((await rankIcons({ door: async () => ({ text: '{}' }), items: [] })).note, null)
})

test('the real door sends the credential to chat completions through the seeder chat', async () => {
  const seen = []
  const door = seederTextDoor({
    credential: { baseUrl: 'https://provider.example/api/v1/', apiKey: 'k', model: 'vendor/cheap-text' },
    chat: async (d, req) => (
      seen.push([d, req]), { text: '{"items":{}}', model: 'vendor/cheap-text', usage: null }
    )
  })
  const got = await door({ system: 's', user: 'u', signal: new AbortController().signal })
  assert.equal(got.model, 'vendor/cheap-text')
  assert.equal(seen[0][0].url, 'https://provider.example/api/v1/chat/completions')
  assert.equal(seen[0][1].temperature, 0)
  assert.deepEqual(
    seen[0][1].messages.map((m) => m.role),
    ['system', 'user']
  )
})
