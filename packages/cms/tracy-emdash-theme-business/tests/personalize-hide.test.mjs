// 🔒 A PAGE IS HIDDEN ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013). This template's own showcase
// pages (the newsletter, email, form, slides and style-guide kit) used to leave a personalised site by the personalize map's
// `hide` rules, with its careers, investors and legal pages. Nothing a customer answers can rewrite them, but a page nobody
// can customize now stays published with the template's words: no template rule hides a page, and the map carries none.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { templateHideRules } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))

test("no page of the template's kit is hidden by a rule of its own on a personalised site", () => {
  const samples = (seed.content.pages ?? []).filter((e) => e.data && 'sample' in e.data)
  assert.ok(samples.length > 0, 'the seed has kit pages to check')
  assert.deepEqual(map.hide ?? [], [], 'the personalize map names no page to hide')
  assert.deepEqual(
    templateHideRules({ hide: samples.map((e) => ({ collection: 'pages', slug: e.slug })) }, {}),
    []
  )
})
