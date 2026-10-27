import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { main } from '../src/cli.mjs'

const CONTRACT = 'tracy-business/j6/1.1.0'

/** `dist/data` with the package's own German for two of its strings. */
function shippedData(root) {
  const data = path.join(root, 'data')
  mkdirSync(path.join(data, 'quickstart-contracts', CONTRACT), { recursive: true })
  mkdirSync(path.join(data, 'quickstart-translations', CONTRACT), { recursive: true })
  writeFileSync(
    path.join(data, 'quickstart-contracts', CONTRACT, 'content-map.json'),
    JSON.stringify({
      slots: [
        { key: 'module-1.0', type: 'text', sample: 'Request a quote', maxCharacters: 50 },
        {
          key: 'module-1.1',
          type: 'text',
          sample: 'Industrial infrastructure, built to last',
          maxCharacters: 90
        }
      ]
    })
  )
  writeFileSync(
    path.join(data, 'quickstart-translations', CONTRACT, 'de-DE.json'),
    JSON.stringify({
      'module-1.0': 'Angebot anfordern',
      'module-1.1': 'Industrieinfrastruktur, gebaut für Jahrzehnte'
    })
  )
  return data
}

/** The Claude Cowork plugin's answers for one language, with the site's CURRENT text in each slot. */
function cowork(slots) {
  const applied = []
  const apply = async ({ params }) => {
    if (params.operation === 'multilingual.plan')
      return {
        ok: true,
        contract: CONTRACT,
        revision: 'r1',
        locale: params.locale,
        creates: { modules: 1 },
        slots
      }
    if (params.operation === 'multilingual.package') return { ok: true, alreadyPresent: true }
    if (params.operation === 'multilingual.apply') {
      applied.push(params.translations ?? params)
      return { ok: true, status: 'completed', phase: 'completed', created: 1 }
    }
    return { ok: true, verified: true }
  }
  return { apply, applied }
}

function inputs(root) {
  const dir = path.join(root, 'site', 'docs', 'agents')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'design-preview.json'),
    JSON.stringify({ site: { languages: ['en', 'de'] }, pages: [] })
  )
  return path.join(dir, 'design-preview.json')
}

test('a slot the customer never touched takes the shipped translation and costs no model call', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shipped-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const data = shippedData(root)
  // Both slots still hold the package's own words — the build kept its demo copy.
  const { apply } = cowork([
    { key: 'de-DE::module-1.0', type: 'text', source: 'Request a quote', maxCharacters: 50 },
    {
      key: 'de-DE::module-1.1',
      type: 'text',
      source: 'Industrial infrastructure, built to last',
      maxCharacters: 90
    }
  ])
  const asked = []
  const logs = []
  await main(
    [
      '--platform',
      'joomla',
      '--preview',
      inputs(root),
      '--target-site',
      'site.example',
      '--door',
      'http://127.0.0.1:1',
      '--add-language',
      'de-DE'
    ],
    {
      cwd: root,
      env: { TRACY_SEED_DATA: data, DEEPSEEK_API_KEY: 'unused' },
      apply,
      translate: async (items) => {
        asked.push(...items)
        return items.map(({ i }) => ({ i, text: 'MODEL' }))
      },
      log: (line) => logs.push(line)
    }
  )
  assert.equal(asked.length, 0, 'the model was asked for nothing')
  assert.ok(
    logs.some((l) => l.includes('2 strings from the package, 0 from the model')),
    logs.join('\n')
  )
})

test('a slot the customer rewrote goes to the model; the untouched one still does not', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shipped-cli-mixed-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const data = shippedData(root)
  const { apply } = cowork([
    { key: 'de-DE::module-1.0', type: 'text', source: 'Request a quote', maxCharacters: 50 },
    // the customer replaced the tagline with their own words
    { key: 'de-DE::module-1.1', type: 'text', source: 'Bakery ovens since 1962', maxCharacters: 90 }
  ])
  const asked = []
  const logs = []
  await main(
    [
      '--platform',
      'joomla',
      '--preview',
      inputs(root),
      '--target-site',
      'site.example',
      '--door',
      'http://127.0.0.1:1',
      '--add-language',
      'de-DE'
    ],
    {
      cwd: root,
      env: { TRACY_SEED_DATA: data, DEEPSEEK_API_KEY: 'unused' },
      apply,
      translate: async (items) => {
        asked.push(...items)
        return items.map(({ i }) => ({ i, text: 'Backöfen seit 1962' }))
      },
      log: (line) => logs.push(line)
    }
  )
  assert.equal(asked.length, 1, 'exactly the rewritten slot reached the model')
  assert.equal(asked[0].text ?? asked[0].source, 'Bakery ovens since 1962')
  assert.ok(
    logs.some((l) => l.includes('1 strings from the package, 1 from the model')),
    logs.join('\n')
  )
})

test('a quickstart with no shipped translations behaves exactly as before', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shipped-cli-none-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const data = path.join(root, 'data')
  mkdirSync(data, { recursive: true })
  const { apply } = cowork([
    { key: 'de-DE::module-1.0', type: 'text', source: 'Request a quote', maxCharacters: 50 }
  ])
  const asked = []
  await main(
    [
      '--platform',
      'joomla',
      '--preview',
      inputs(root),
      '--target-site',
      'site.example',
      '--door',
      'http://127.0.0.1:1',
      '--add-language',
      'de-DE'
    ],
    {
      cwd: root,
      env: { TRACY_SEED_DATA: data, DEEPSEEK_API_KEY: 'unused' },
      apply,
      translate: async (items) => {
        asked.push(...items)
        return items.map(({ i }) => ({ i, text: 'Angebot' }))
      },
      log: () => {}
    }
  )
  assert.equal(asked.length, 1, 'with nothing shipped, the model translates as it always did')
})
