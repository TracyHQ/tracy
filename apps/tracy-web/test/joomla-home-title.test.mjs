/**
 * The home tab of a Joomla site names the owner (`pageMetaSteps`, `joomla-tidy.js`), held against the menus the
 * releases really ship. JA Voyara, JA Tour and JA Social II ship their home entry with an EMPTY `page_title` and the
 * site name off in titles, so the tab read "Home" after every build (tasks/kiem-38-template-theo-nhom.md §6.1).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { pageMetaSteps, shippedPageMeta } from '../src/sites/brief-engines/joomla-tidy.js'

const CONTRACTS = fileURLToPath(
  new URL('../../../packages/cms/tracy-joomla-quickstart/contracts/', import.meta.url)
)

/** A release's menu as the site holds it after install: the lock's menu entries, with their ids. */
function releaseMenu(release) {
  const dir = path.join(CONTRACTS, release)
  const { entities } = JSON.parse(readFileSync(path.join(dir, 'presentation-lock.json'), 'utf8'))
  const rows = Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => ({ id: Number(key.slice('menuItem-'.length)), ...row }))
  return { dir, rows }
}

const owner = { name: 'Tamq Travel', said: 'Tamq Travel', about: '' }

/** The params a step writes to one entry, or null when the entry is not written. */
const written = (steps, id) => {
  const step = steps.find((s) => s.id === id)
  return step ? JSON.parse(step.fields.params) : null
}

for (const [release, home] of [
  ['ja-voyara/j6/1.0.3', 101],
  ['ja-tour/j6/1.0.0', 101],
  ['ja-social-ii/j6/1.0.0', 254]
]) {
  test(`${release}: an empty home page title takes the owner's name`, () => {
    const { dir, rows } = releaseMenu(release)
    const before = JSON.parse(rows.find((r) => r.id === home).params)
    assert.equal(before.page_title, '', 'the release ships the home title empty')
    const { steps } = pageMetaSteps({
      rows,
      visible: new Set(['en-GB']),
      owner,
      wroteIn: 'en-GB',
      shipped: shippedPageMeta(dir)
    })
    const after = written(steps, home)
    assert.ok(after, 'the home entry is written')
    assert.equal(after.page_title, 'Tamq Travel')
    const { page_title: _a, ...restAfter } = after
    const { page_title: _b, ...restBefore } = before
    assert.deepEqual(restAfter, restBefore, 'every other setting of the entry is kept')
  })
}

test('a home title somebody set is never overwritten, and a home with no title key is left', () => {
  const row = (id, params) => ({
    id,
    type: 'component',
    published: 1,
    language: '*',
    home: 1,
    params: JSON.stringify(params)
  })
  const run = (rows) =>
    pageMetaSteps({
      rows,
      visible: new Set(['en-GB']),
      owner,
      wroteIn: 'en-GB',
      shipped: { page_title: [], 'menu-meta_description': [] }
    }).steps
  // Not what the release ships: the owner's own title stays.
  assert.deepEqual(run([row(101, { page_title: 'Tamq Travel tours' })]), [])
  // No `page_title` key at all (Tracy Business, whose site names every title itself): not written.
  assert.deepEqual(run([row(596, { menu_show: 1 })]), [])
  // An empty title on an entry that is not home is not given the name.
  assert.deepEqual(run([{ ...row(102, { page_title: '' }), home: 0 }]), [])
})

test('no owner name: an empty home title stays empty', () => {
  const { dir, rows } = releaseMenu('ja-tour/j6/1.0.0')
  const { steps } = pageMetaSteps({
    rows,
    visible: new Set(['en-GB']),
    owner: { name: '', said: '', about: '' },
    wroteIn: 'en-GB',
    shipped: shippedPageMeta(dir)
  })
  assert.equal(written(steps, 101)?.page_title ?? '', '')
})

for (const release of ['ja-phio/j6/1.0.2', 'ja-phio/j6/1.0.3']) {
  test(`${release}: the share preview the home entry ships takes the owner's name and words`, () => {
    const { dir, rows } = releaseMenu(release)
    const before = JSON.parse(rows.find((r) => r.id === 101).params)
    assert.match(before.og_title, /JA Phio/, 'the release ships a demo share title')
    assert.match(before.og_desc, /JA Phio/, 'and a demo share description')
    const about = 'Tamq Travel runs small-group tours of northern Vietnam. We plan every trip by hand.'
    const { steps } = pageMetaSteps({
      rows,
      visible: new Set(['en-GB']),
      owner: { name: 'Tamq Travel', said: about, about },
      wroteIn: 'en-GB',
      shipped: shippedPageMeta(dir)
    })
    const after = written(steps, 101)
    assert.equal(after.og_title, 'Tamq Travel')
    assert.equal(after.og_desc, about)
    assert.equal(after.og_type, before.og_type, 'every other setting of the entry is kept')
  })

  test(`${release}: blank answers keep the template's share preview`, () => {
    const { dir, rows } = releaseMenu(release)
    const before = JSON.parse(rows.find((r) => r.id === 101).params)
    const { steps } = pageMetaSteps({
      rows,
      visible: new Set(['en-GB']),
      owner: { name: 'Tamq Travel', said: 'Tamq Travel', about: '' },
      wroteIn: 'en-GB',
      shipped: shippedPageMeta(dir)
    })
    const after = written(steps, 101)
    assert.equal(after.og_title, 'Tamq Travel', 'the name was given')
    assert.equal(after.og_desc, before.og_desc, 'no description was given: the template keeps its own')
    const nameless = pageMetaSteps({
      rows,
      visible: new Set(['en-GB']),
      owner: { name: '', said: '', about: '' },
      wroteIn: 'en-GB',
      shipped: shippedPageMeta(dir)
    }).steps
    assert.equal((written(nameless, 101) ?? before).og_title, before.og_title)
  })
}

test('ja-essence/j6/1.0.4, About blank: the home description the release ships stays, the demo name swapped (BLANK)', () => {
  const { dir, rows } = releaseMenu('ja-essence/j6/1.0.4')
  const before = JSON.parse(rows.find((r) => r.id === 134).params)
  assert.equal(before['menu-meta_description'], 'Minimal Blogging Joomla Template - JA Essence')
  const run = (/** @type {string} */ about) =>
    written(
      pageMetaSteps({
        rows,
        visible: new Set(['en-GB']),
        owner: { name: 'Tamarind Bakery', said: about || 'Tamarind Bakery', about },
        wroteIn: 'en-GB',
        shipped: shippedPageMeta(dir),
        demoNames: ['JA Essence']
      }).steps,
      134
    )
  assert.equal(run('')?.['menu-meta_description'], 'Minimal Blogging Joomla Template - Tamarind Bakery')
  assert.equal(run('')?.page_title, 'Tamarind Bakery', 'the home title still takes the name')
  const about = 'A family bakery in Dubai. Sourdough every morning.'
  assert.equal(run(about)?.['menu-meta_description'], about, 'About given: the owner’s own words, as before')
})

test('a brief build home title is its search title, and its description the plan one when no description was given', () => {
  const { dir, rows } = releaseMenu('ja-voyara/j6/1.0.3')
  const { steps } = pageMetaSteps({
    rows,
    visible: new Set(['en-GB']),
    owner: {
      name: 'Tamq Travel',
      title: 'Desert tours in Port Marlow | Tamq Travel',
      said: 'Tamq Travel',
      about: 'Tamq Travel, based in Old Harbour, Port Marlow. Desert tours.'
    },
    wroteIn: 'en-GB',
    shipped: shippedPageMeta(dir)
  })
  const home = written(steps, 101)
  assert.equal(home.page_title, 'Desert tours in Port Marlow | Tamq Travel')
  // No name given: the title is left as the template ships it, whatever the plan made.
  const nameless = pageMetaSteps({
    rows,
    visible: new Set(['en-GB']),
    owner: { name: '', title: 'Desert tours in Port Marlow', said: '', about: '' },
    wroteIn: 'en-GB',
    shipped: shippedPageMeta(dir)
  })
  assert.notEqual(written(nameless.steps, 101)?.page_title, 'Desert tours in Port Marlow')
})
