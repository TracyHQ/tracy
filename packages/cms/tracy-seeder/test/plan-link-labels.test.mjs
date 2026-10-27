// Every button's label is planned knowing where its link leads, and a button to a file of the demo company leads to Contact.
//
// TCH #1013, measured 10/10/2026 over every Joomla release: most labels were told nothing about their link, because the label
// field is named `btn-2-text` beside `btn-2-link` (Tracy Business) or sits inside the `<a>`. Tracy Business j6's hero offers
// "Download company profile (PDF)" linking the demo contractor's brochure; Akemi (10/10/2026, DEMO FILE LINKS): such a button
// leads to the Contact page with a label that says contact, in every template.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import {
  demoFileLinks,
  labelFields,
  labelOf,
  linkDestinations,
  planJoomlaContract
} from '../src/plan-joomla-contract.mjs'

const ID = 'tracy-business/j6/1.2.1'
const CONTRACT = fileURLToPath(new URL(`../../tracy-joomla-quickstart/contracts/${ID}`, import.meta.url))

function dataDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'link-labels-'))
  mkdirSync(path.join(root, 'quickstart-contracts', path.dirname(ID)), { recursive: true })
  symlinkSync(CONTRACT, path.join(root, 'quickstart-contracts', ID))
  return root
}
const map = JSON.parse(readFileSync(path.join(CONTRACT, 'content-map.json'), 'utf8'))
const state = {
  contract: ID,
  slots: map.slots.map((s) => ({ ...s, current: s.sample })),
  pages: map.pages ?? []
}
const slot = (key) => state.slots.find((s) => s.key === key)

test('a link field’s label is found by its own name: btn-2-link → btn-2-text, cta1_link → cta1_label, a bare link → link-text', () => {
  assert.deepEqual(labelFields('btn-2-link').slice(0, 3), ['btn-2-text', 'btn-2-link-text', 'btn-2-label'])
  assert.ok(labelFields('cta1_link').includes('cta1_label'))
  assert.ok(labelFields('link').includes('link-text'))
  assert.ok(!labelFields('link').includes('title'), 'a card’s title is never its button’s label')
  assert.equal(labelOf(state.slots, slot('module-441.7'))?.key, 'module-441.6')
  assert.equal(labelOf(state.slots, slot('module-441.5'))?.key, 'module-441.4')
})

test('Tracy Business: the hero’s buttons are told their pages, the PDF button the Contact page', (t) => {
  const dir = dataDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const told = linkDestinations(state, dir)
  assert.match(told['module-441.4'], /^the "/, 'See our capabilities names its page')
  assert.equal(told['module-441.6'], undefined, 'a file link is not a page')
  const files = demoFileLinks(state, dir)
  assert.deepEqual(files.changes, {
    'module-441.7': 'index.php?Itemid=604',
    'module-461.7': 'index.php?Itemid=604'
  })
  assert.match(files.leadsTo['module-441.6'], /Contact.*contact the business/)
})

test('a disobedient model that writes the PDF link back and labels without its target cannot keep the demo file', async (t) => {
  const dir = dataDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const asked = []
  const generate = async ({ input }) => {
    asked.push(...input.slots)
    // It answers a key it was not given (the PDF link, back to the brochure) and writes every label as a download.
    return {
      values: {
        ...Object.fromEntries(
          input.slots.map((s) => [s.key, s.type === 'url' ? '' : 'Tải hồ sơ'.slice(0, s.maxCharacters)])
        ),
        'module-441.7': 'images/northgate/decks/en/corporate-2026.pdf'
      },
      pending: []
    }
  }
  const site = { name: 'Tôn Việt', about: 'Tôn lợp', languages: ['en-GB'] }
  const plan = await planJoomlaContract({ state, site, generate, dataDir: dir, trimmed: false })
  assert.equal(plan.changes['module-441.7'], 'index.php?Itemid=604', 'the button leads to Contact')
  assert.equal(
    asked.some((s) => s.key === 'module-441.7'),
    false,
    'the file link is never asked of the model'
  )
  const label = asked.find((s) => s.key === 'module-441.6')
  assert.match(String(label?.leadsTo), /contact the business/, 'its label is told to invite contact')
  // Every planned label of a live link carries its destination.
  const labels = state.slots
    .filter((s) => s.type === 'url' && String(s.sample ?? '') !== '')
    .map((link) => labelOf(state.slots, link))
    .filter(Boolean)
  const plannedLabels = asked.filter((s) => labels.some((l) => l.key === s.key))
  assert.ok(plannedLabels.length > 10)
  const without = plannedLabels.filter((s) => !s.leadsTo && !/social/i.test(String(s.label)))
  assert.deepEqual(
    without.map((s) => `${s.key} ${s.label}`),
    [],
    'no planned button label is left without its destination'
  )
})
