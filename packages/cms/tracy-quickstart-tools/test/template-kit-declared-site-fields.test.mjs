// The site fields a person declares by hand (cli.mjs video-buttons, self-link-buttons, hidden-page-links,
// created-page-hide, stock-screens, legal-layout, and the reasons of an explicit none) survive `assemble` and `build`,
// which write the kit's site part again from site.json. A made-up kit; every selector, path and reason is invented.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { assembleKit } from '../template-kit/lib/assemble.mjs'
import { DECLARED_SITE_FIELDS, declaredOf } from '../template-kit/lib/declared-site-fields.mjs'

const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`)

/** A kit folder and a contract with no pages: enough for assembleKit to write a kit with a site part. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kit-declared-'))
  const contract = join(root, 'contract')
  const out = join(root, 'out')
  mkdirSync(contract)
  mkdirSync(join(out, 'images'), { recursive: true })
  write(join(contract, 'manifest.json'), { id: 'made-up-contract', platform: 'joomla' })
  write(join(contract, 'content-map.json'), { entities: [], slots: [], pages: [] })
  write(join(out, 'capture-index.json'), { widths: [1440], pages: [], blocks: {} })
  write(join(out, 'site.json'), { site: { forms: [] }, mainHeadings: [], errors: [] })
  return { root, contract, out }
}

/** Every declared field, as the declare commands would have written them. */
const DECLARED = {
  emptyVideoButtons: [
    { selector: '.made-up-card .play-button', why: 'the play button prints for an empty address' }
  ],
  selfLinkButtons: [{ container: '.made-up-hero', why: 'its button points at the page it sits on' }],
  hiddenPageLinks: [{ container: '.made-up-list', why: 'a row may link to a page a plan hides' }],
  createdPageHide: [
    { selector: '.made-up-booking-bar', why: 'a created page must not print the booking bar' }
  ],
  stockScreens: [{ path: '/made-up/writers', why: 'no customer content fills a list of demo writers' }],
  noneWhy: { emptyVideoButtons: 'unused here, kept as written' },
  createdPageLayouts: { legal: { articleLayout: 'made_up:default', why: 'the plain article file' } }
}

test('assemble keeps every hand-declared site field of the kit already in --out, unchanged', async () => {
  const { root, contract, out } = fixture()
  try {
    const opts = { contract, site: 'http://site.example', 'template-version': '1.0.0' }
    await assembleKit(opts, out, 'test')
    const file = join(out, 'template-kit.json')
    const kit = JSON.parse(readFileSync(file, 'utf8'))
    kit.site = { ...kit.site, ...structuredClone(DECLARED) }
    write(file, kit)

    await assembleKit(opts, out, 'test')
    const again = JSON.parse(readFileSync(file, 'utf8'))
    for (const [field, value] of Object.entries(DECLARED))
      assert.deepEqual(again.site[field], value, `site.${field} is lost or changed`)
    assert.deepEqual(again.site.forms, [], 'the site part read from site.json is still there')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a build into an empty folder has nothing to keep', async () => {
  const { root, contract, out } = fixture()
  try {
    const kit = await assembleKit(
      { contract, site: 'http://site.example', 'template-version': '1.0.0' },
      out,
      'test'
    )
    for (const field of Object.keys(DECLARED)) assert.equal(kit.site[field], undefined, field)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('one list names every field a declare command writes', () => {
  const commands = DECLARED_SITE_FIELDS.map((d) => d.command)
  for (const c of [
    'video-buttons',
    'self-link-buttons',
    'hidden-page-links',
    'created-page-hide',
    'stock-screens',
    'legal-layout'
  ])
    assert.ok(commands.includes(c), c)
  assert.deepEqual(Object.keys(declaredOf({ site: DECLARED })).sort(), Object.keys(DECLARED).sort())
})
