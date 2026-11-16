// tools/personalize.mjs, a `blocks` rule bounded in characters. Measured 16/11/2026 on dev (JA Restaurant EmDash 1.0.2,
// "Trattoria Lume", 1440x900): the slideshow title the model wrote ran to five lines of 100 px capitals and ended 10 px above
// the bottom of a 720 px box that cuts what overflows. The contract bounds that slot (template-kit `maxCharacters` 39); the
// rule carries the same number, and an answer over it is not taken.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { rewriteBlock } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
const kit = JSON.parse(readFileSync(path.join(ROOT, 'contracts', '1.0.2', 'template-kit.json'), 'utf8'))
const rule = map.blocks.find((b) => b.collection === 'slideshow' && b.slug === 'slideshow')
const facts = { name: 'Trattoria Lume', about: 'An Italian trattoria in Da Nang.', sector: 'restaurant' }
const model = { url: 'http://model.test/v1/chat', key: 'k', model: 'm' }

/** Every limit the kit gives a slot, by its id. */
function kitLimits() {
  const out = new Map()
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (typeof v.id === 'string' && Number.isInteger(v.maxCharacters)) out.set(v.id, v.maxCharacters)
      Object.values(v).forEach(walk)
    }
  }
  walk(kit)
  return out
}

test('the slideshow rule bounds its titles by the number the contract measured', () => {
  const limits = kitLimits()
  const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
  const rows = seed.content.slideshow.find((e) => e.slug === 'slideshow').data.items
  rows.forEach((_, i) => {
    const contract = limits.get(`slideshow.slideshow.items[${i}].slide_title`)
    assert.ok(Number.isInteger(contract), `the kit bounds items[${i}].slide_title`)
    assert.equal(rule.maxCharacters?.slide_title, contract, `items[${i}].slide_title`)
  })
})

test('a slide title over the bound is not taken, one within it is, and the model is told the bound', async () => {
  const rows = [{ slide_title: 'The Best Bar & Restaurant \nin Brooklyn' }, { slide_title: 'The Best Bar' }]
  let asked = null
  const fetchImpl = async (_url, init) => {
    asked = JSON.parse(init.body).messages[0].content
    const answer = {
      rows: [
        { slide_title: 'Benvenuti at Trattoria Lume, \nhandmade pasta by the river in Da Nang' },
        { slide_title: 'Benvenuti at \nTrattoria Lume' }
      ]
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  }
  const out = await rewriteBlock({ model, rule, facts, locale: 'en', rows, fetchImpl })
  assert.equal(
    out.rows[0].slide_title,
    rows[0].slide_title,
    'too long: the row keeps its words, to be asked again'
  )
  assert.equal(out.rows[1].slide_title, 'Benvenuti at \nTrattoria Lume')
  assert.match(asked, /slide_title is at most 39 characters/)
})

test('the bound counts a run of spaces or line breaks as one, and a rule with no bound takes any length', async () => {
  const title = 'The Best Bar & Restaurant \nin Brooklyn'
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ rows: [{ slide_title: title }] }) } }]
      })
    )
  const one = (limit) =>
    rewriteBlock({
      model,
      rule: {
        ...rule,
        ...(limit ? { maxCharacters: { slide_title: limit } } : { maxCharacters: undefined })
      },
      facts,
      locale: 'en',
      rows: [{ slide_title: 'Demo' }],
      fetchImpl
    })
  assert.equal((await one(37)).rows?.[0].slide_title, title, '37 characters fit 37')
  assert.equal((await one(36)).rows, null, '37 characters do not fit 36')
  assert.equal((await one(null)).rows?.[0].slide_title, title, 'no bound')
})
