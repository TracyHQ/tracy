// A quickstart with no second edition is written in the ONE language the customer chose.
//
// ja-kinetic has no multilingual profile: every entity is `*`, and the build makes the chosen
// language the site's only one. The planner used to name each slot's language from the contract
// alone, so a customer who chose Vietnamese got English copy — the model was told the slots were
// `*`/en-GB and wrote accordingly (23/09/2026). The Joomla `copy` stage now writes the chosen
// language into the preview as `site.sourceLanguage`, and that is the language the slots are named.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

function contractDir(language) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'source-language-'))
  const dir = path.join(dataDir, 'quickstart-contracts', 'kinetic', 'j6', '1.0.0')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({ entities: [{ key: 'module-1', kind: 'module', identity: { title: 'Hero', language } }] })
  )
  return dataDir
}
const state = {
  contract: 'kinetic/j6/1.0.0',
  slots: [
    {
      key: 'hero.title',
      entity: 'module-1',
      sample: 'Every trace',
      current: 'Every trace',
      maxCharacters: 80,
      type: 'text'
    }
  ],
  pages: []
}

for (const language of ['*', 'en-GB']) {
  test(`a slot at ${language} is written in the site's one language when the build names it`, async (t) => {
    const dataDir = contractDir(language)
    t.after(() => rmSync(dataDir, { recursive: true, force: true }))
    const inputs = []
    const generate = async ({ input }) => {
      inputs.push(input)
      return { values: { 'hero.title': 'Mọi lớp tôn' }, pending: [] }
    }
    const site = { name: 'Tôn Việt', about: 'Tôn lợp', languages: ['vi-VN'], sourceLanguage: 'vi-VN' }
    const plan = await planJoomlaContract({ state, site, generate, dataDir })
    assert.equal(inputs[0].language, 'vi-VN')
    assert.equal(inputs[0].slots[0].language, 'vi-VN')
    assert.equal(
      plan.changes['hero.title'],
      'Mọi lớp tôn',
      'a Vietnamese answer is not refused as off-language'
    )
  })
}

test('without a source language the contract still names the slot', async (t) => {
  const dataDir = contractDir('en-GB')
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const inputs = []
  const generate = async ({ input }) => {
    inputs.push(input)
    return { values: { 'hero.title': 'Every panel' }, pending: [] }
  }
  await planJoomlaContract({
    state,
    site: { name: 'Acme', about: 'x', languages: ['en-GB'] },
    generate,
    dataDir
  })
  assert.equal(inputs[0].slots[0].language, 'en-GB')
})

// The other half of the same hole, on a MULTILINGUAL quickstart. No `sourceLanguage` there: the
// source edition is en-GB and the language stage translates it into the others. A `*` row is shown
// on EVERY edition, so it belongs to the source one — handed to the model as `*`, which is no
// language at all, it was written in the brief's language, and a Vietnamese brief put Vietnamese
// on the English edition of tracy-business (23/09/2026).
test('a slot at * on a multilingual site is written in the source edition, en-GB', async (t) => {
  const dataDir = contractDir('*')
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const inputs = []
  const generate = async ({ input }) => {
    inputs.push(input)
    return { values: { 'hero.title': 'Every roof panel' }, pending: [] }
  }
  const plan = await planJoomlaContract({
    state,
    site: { name: 'Tôn Việt', about: 'Tôn lợp mái cho nhà xưởng', languages: ['en-GB', 'vi-VN'] },
    generate,
    dataDir
  })
  assert.equal(inputs[0].language, 'en-GB')
  assert.equal(inputs[0].slots[0].language, 'en-GB')
  assert.equal(plan.changes['hero.title'], 'Every roof panel')
})
