/**
 * PAGE-5 on Joomla ACM buttons the layout does not print (follow-up of #1231). Captured with
 * `--link-fields-by-role`, the numbered link field `btn-link-2` becomes a `url` slot, and its empty
 * demo value was flagged on JA Impact module 110, JA Nova 111 and JA Tour 98/131. But the second
 * button's caption is empty too, and the layout prints that button only `if button-2` (Impact,
 * Nova) or `if btn-link-2` (Tour): no button is on the page.
 *
 * Fixtures: the contracts in `packages/cms/tracy-joomla-quickstart/contracts` (content map retyped
 * here the way `capture-contract.py --link-fields-by-role` types link fields), and the two ACM layouts
 * from the published installers (`c/acm-button-layouts/`, byte for byte, 12/10/2026).
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readContracts } from '../src/lib/contracts.js'
import { page5ButtonsLeadSomewhere } from '../src/lib/template-customization-question-readiness/rules/page-5-buttons-lead-somewhere.js'
import { contextOf, zipOf } from './template-customization-question-readiness-fixtures.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LAYOUTS = path.join(
  HERE,
  'fixtures',
  'template-customization-question-readiness',
  'c',
  'acm-button-layouts'
)
const CONTRACTS = path.join(HERE, '..', '..', '..', 'packages', 'cms', 'tracy-joomla-quickstart', 'contracts')
// capture-contract.py, `--link-fields-by-role`: r'(link|url|href)[-_]?\d*$' on the field name.
const LINK_FIELD = /(link|url|href)[-_]?\d*$/

/**
 * A copy of one contract with link fields typed `url`, and its ACM data changed by `edit`.
 * @param {string} rel @param {string} entity @param {(data: Record<string, any>) => void} [edit]
 */
function recaptured(rel, entity, edit = () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'acm-buttons-'))
  cpSync(path.join(CONTRACTS, rel), dir, { recursive: true })
  const mapFile = path.join(dir, 'content-map.json')
  const map = JSON.parse(readFileSync(mapFile, 'utf8'))
  for (const s of map.slots)
    if (s.column === 'params' && LINK_FIELD.test(String(/\[([\w-]+)\]$/.exec(String(s.jsonPath?.[1]))?.[1])))
      s.type = 'url'
  writeFileSync(mapFile, JSON.stringify(map))
  const lockFile = path.join(dir, 'presentation-lock.json')
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  const params = JSON.parse(lock.entities[entity].params)
  const config = JSON.parse(params['jatools-config'])
  edit(config[Object.keys(config).find((k) => !k.startsWith(':')) ?? ''])
  params['jatools-config'] = JSON.stringify(config)
  lock.entities[entity].params = JSON.stringify(params)
  writeFileSync(lockFile, JSON.stringify(lock))
  return readContracts(dir)
}

/** A JA Joomla release whose installer carries one ACM layout. */
function release(
  /** @type {{ label: string, version: string, template: string, tag: string, layout: string, file: string }} */ r,
  /** @type {any} */ contracts
) {
  const installer = zipOf({
    [`templates/${r.template}/${r.layout}`]: readFileSync(path.join(LAYOUTS, r.file))
  })
  const setting = {
    platform: 'joomla',
    label: r.label,
    version: r.version,
    template: r.template,
    install: { installer: { file: 'installer.zip' } }
  }
  return { ...contextOf(setting, { 'installer.zip': installer }, r.tag), contracts }
}

const IMPACT = {
  label: 'JA Impact',
  version: '1.0.1',
  template: 'ja_impact',
  tag: 'quickstart/ja-impact/j6',
  layout: 'acm/hero/tmpl/style-1.php',
  file: 'ja-impact-1.0.1-hero-style-1.php'
}
const TOUR = {
  label: 'JA Tour',
  version: '1.0.1',
  template: 'ja_tour',
  tag: 'quickstart/ja-tour/j6',
  layout: 'acm/slideshow/tmpl/style-owl.php',
  file: 'ja-tour-1.0.1-slideshow-style-owl.php'
}

test('PAGE-5: JA Impact module 110 empty btn-link-2 is not flagged (caption empty, layout prints it only if button-2); its "#" btn-link still is', async () => {
  const r = await page5ButtonsLeadSomewhere.run(
    release(IMPACT, recaptured('ja-impact/j6/1.0.1', 'module-110'))
  )
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /module-110\.10 /)
  assert.match(r.message, /module-110\.11 /)
  assert.doesNotMatch(r.message, /module-110\.1[45] /)
})

test('PAGE-5: a JA Impact second button with a caption and an empty link is on the page and fails', async () => {
  const contracts = recaptured('ja-impact/j6/1.0.1', 'module-110', (hero) => {
    hero['hero[button-2]'] = ['Donate', 'Donate']
  })
  const r = await page5ButtonsLeadSomewhere.run(release(IMPACT, contracts))
  assert.equal(r.status, 'fail', r.message)
  assert.match(r.message, /module-110\.14 /)
})

test('PAGE-5: JA Tour 98 empty btn-link-2 is not flagged, also with a caption, because the layout prints it only if btn-link-2', async () => {
  const contracts = recaptured('ja-tour/j6/1.0.1', 'module-98', (slideshow) => {
    slideshow['slideshow[button-2]'] = ['See dates', 'See dates', 'See dates', 'See dates']
  })
  const r = await page5ButtonsLeadSomewhere.run(release(TOUR, contracts))
  assert.doesNotMatch(r.message, /module-98\.2[5-8] /)
  assert.ok(
    (r.details ?? []).some((d) =>
      /module-98\.25 \(the layout prints it only if btn-link-2, which is empty\)/.test(d)
    ),
    JSON.stringify(r.details)
  )
})
