/**
 * Template Customization Question Readiness on Tracy Base EmDash 0.5.2 (follow-up of #1231):
 *
 * - PAGE-4 and PAGE-7 compare a listed page id, which on EmDash is a page record SLUG
 *   (`services_page`), with the RECORDS keys of `src/lib/link-gate.ts`, which are PATHS (`services`).
 *   The id goes through the menu path that opens it.
 * - ABOUT-2 counted the alt text of every demo picture, also of pictures that stay on the site
 *   (Tracy Base had to declare 46 of them in keptText). The alt of a kept picture is not counted;
 *   the alt of a picture the customer replaces still is.
 *
 * Fixtures: `tracy_setting.json` and `tracy_site_pages.json` of the 0.5.2 release pack (same JSON, reformatted),
 * and its `seed/personalize.json` (`tracy-base-emdash-0.5.2-personalize.json`, PR #1238). Every other
 * file of the source zip is built here from `packages/cms/tracy-emdash-theme-base`, whose seed and
 * `src/` are byte-identical to the pack's (measured 12/10/2026).
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { about2DemoParagraphs } from '../src/lib/template-customization-question-readiness/rules/about-2-demo-paragraphs.js'
import { page4NoDeadLinks } from '../src/lib/template-customization-question-readiness/rules/page-4-no-dead-links.js'
import { page7ChildrenOfUntickedPage } from '../src/lib/template-customization-question-readiness/rules/page-7-children-of-unticked-page.js'
import { contextOf, zipOf } from './template-customization-question-readiness-fixtures.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'template-customization-question-readiness')
const RELEASE = path.join(FIXTURES, 'c', 'tracy-base_emdash-0.x')
const THEME = path.join(HERE, '..', '..', '..', 'packages', 'cms', 'tracy-emdash-theme-base')
const ZIP = 'tracy-base-emdash-quickstart-0.5.2.zip'

/** Text files of the theme under `dir`, keyed by their path in the theme. */
function themeFiles(/** @type {string} */ dir) {
  /** @type {Record<string, Buffer>} */
  const out = {}
  for (const name of readdirSync(path.join(THEME, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(path.join(THEME, rel)).isDirectory()) Object.assign(out, themeFiles(rel))
    else if (/\.(astro|ts|mjs|js|json|css)$/.test(name)) out[rel] = readFileSync(path.join(THEME, rel))
  }
  return out
}

const personalize052 = () =>
  JSON.parse(readFileSync(path.join(FIXTURES, 'tracy-base-emdash-0.5.2-personalize.json'), 'utf8'))

/** A rule context over the Tracy Base EmDash 0.5.2 release, with theme files replaced. */
function baseEmdash(/** @type {Record<string, string>} */ replace = {}) {
  /** @type {Record<string, string | Buffer>} */
  const files = {
    ...themeFiles('src'),
    'template.config.json': readFileSync(path.join(THEME, 'template.config.json')),
    'seed/seed.json': readFileSync(path.join(THEME, 'seed/seed.json')),
    'seed/site-model.json': readFileSync(path.join(THEME, 'seed/site-model.json')),
    'seed/media-map.json': readFileSync(path.join(THEME, 'seed/media-map.json')),
    'seed/questions.json': readFileSync(path.join(THEME, 'seed/questions.json')),
    'seed/personalize.json': JSON.stringify(personalize052()),
    ...replace
  }
  const zip = zipOf(Object.fromEntries(Object.entries(files).map(([k, v]) => [`tracy-base/${k}`, v])))
  const setting = JSON.parse(readFileSync(path.join(RELEASE, 'tracy_setting.json'), 'utf8'))
  return contextOf(
    setting,
    {
      'tracy_setting.json': readFileSync(path.join(RELEASE, 'tracy_setting.json')),
      'tracy_site_pages.json': readFileSync(path.join(RELEASE, 'tracy_site_pages.json')),
      [ZIP]: zip
    },
    'tracy-base/emdash-0.x'
  )
}

const linkGate = () => readFileSync(path.join(THEME, 'src/lib/link-gate.ts'), 'utf8')

for (const rule of [page4NoDeadLinks, page7ChildrenOfUntickedPage]) {
  test(`${rule.id}: Tracy Base EmDash 0.5.2 passes; its services_page record sits at the path services of RECORDS`, async () => {
    const r = await rule.run(baseEmdash())
    assert.equal(r.status, 'pass', r.message)
  })

  test(`${rule.id}: a listed page whose path RECORDS does not hold still fails, named by its id`, async () => {
    // The real failure the rule was written for: a page missing from the link gate keeps its links alive.
    const gate = linkGate().replace(
      /^\s*services: \{ collection: 'services_page', slug: 'services_page' \},\n/m,
      ''
    )
    assert.notEqual(gate, linkGate())
    const r = await rule.run(baseEmdash({ 'src/lib/link-gate.ts': gate }))
    assert.equal(r.status, 'fail', r.message)
    assert.match(r.message, /services_page/)
    assert.doesNotMatch(r.message, /\b(product|pricing|blog|about)\b(?!_)/)
  })

  test(`${rule.id}: an alias key named after the slug does not stand in for the path`, async () => {
    const gate = linkGate().replace(
      /^(\s*)services: (\{ collection: 'services_page', slug: 'services_page' \}),/m,
      '$1services_page: $2,'
    )
    assert.notEqual(gate, linkGate())
    const r = await rule.run(baseEmdash({ 'src/lib/link-gate.ts': gate }))
    assert.equal(r.status, 'fail', r.message)
    assert.match(r.message, /services_page/)
  })
}

/** personalize.json 0.5.2 without the alt text of the pictures it keeps in keptText. */
function withoutPictureAlts(p = personalize052()) {
  const before = p.keptText.length
  p.keptText = p.keptText.filter((/** @type {string} */ id) => !id.endsWith('_alt'))
  assert.equal(before - p.keptText.length, 46)
  return p
}

test('ABOUT-2: Tracy Base EmDash 0.5.2 passes without declaring the alt text of its 46 kept pictures', async () => {
  const r = await about2DemoParagraphs.run(
    baseEmdash({ 'seed/personalize.json': JSON.stringify(withoutPictureAlts()) })
  )
  assert.equal(r.status, 'pass', r.message)
})

test('ABOUT-2: the alt text of a picture the customer replaces still counts', async () => {
  const p = withoutPictureAlts()
  p.images = {
    targets: [{ collection: 'about', slug: 'about', field: 'chapter1_image', what: 'the workplace' }],
    entries: [{ collection: 'people', field: 'image', what: 'a portrait', limit: 4 }]
  }
  const r = await about2DemoParagraphs.run(baseEmdash({ 'seed/personalize.json': JSON.stringify(p) }))
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /about\/about: 1 \(chapter1_image_alt\)/)
  assert.match(r.message, /people\/[a-z-]+: 1 \(image_alt\)/)
  assert.doesNotMatch(r.message, /chapter2_image_alt|posts\//)
})

test('ABOUT-2: Tracy Base EmDash 0.5.2 demo prose with no rule still fails', async () => {
  // The real failure the rule was written for: drop the copy rules of the About page.
  const p = withoutPictureAlts()
  p.copy = p.copy.filter((/** @type {any} */ r) => r.collection !== 'about')
  const r = await about2DemoParagraphs.run(baseEmdash({ 'seed/personalize.json': JSON.stringify(p) }))
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /about\/about: \d+/)
  assert.doesNotMatch(r.message, /image_alt/)
})
