/**
 * Three small checks of the readiness verdict (ticket #437): the kit tool version, the pin behind the latest contract,
 * and the content map's item lists, item pages and menu blocks. Each is green on the latest JA Boxing and red on a
 * broken copy of it with the right code; the verdict flags a JA Voyara pin one version behind its newest contract
 * (JA Diner's kit was settled again in #439).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import { CONTENT_MAP_LISTS_CHECK } from '../src/lib/template-readiness/content-map-lists-check.js'
import { KIT_TOOL_CHECK } from '../src/lib/template-readiness/kit-tool-version-check.js'
import {
  PIN_BEHIND_CHECK,
  latestContractVersion
} from '../src/lib/template-readiness/pin-behind-contract-check.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'

const CONTRACTS = new URL('../../../packages/cms/tracy-joomla-quickstart/contracts/', import.meta.url)
const jsonAt = (id, file) => JSON.parse(readFileSync(new URL(`${id}/${file}`, CONTRACTS), 'utf8'))
const contracts = defaultContracts()
const boxing = releaseOfPin(latestPin('ja-boxing'), contracts)
const diner = releaseOfPin(latestPin('ja-diner'), contracts)
const voyara = releaseOfPin(latestPin('ja-voyara'), contracts)
const pieceOf = (release, checks, name) =>
  readinessVerdict(release, { contracts, server: false, checks }).pieces.find((p) => p.piece === name)

// ── kit tool version ─────────────────────────────────────────────────────────────────────────────────────────────────

test('kit tool: the latest JA Boxing kit is current', () => {
  assert.equal(KIT_TOOL_CHECK.judge(boxing, { contracts }, {}), null)
})

test('kit tool: a Boxing kit stamped by an older tool, or by none, is outdated with a fix', () => {
  const doc = jsonAt('ja-boxing/j6/1.0.11', 'template-kit.json')
  for (const tool of ['template-kit 3.0.0', 'template-kit 2.9.9', undefined]) {
    const judged = KIT_TOOL_CHECK.judge(boxing, { templateKit: { state: 'read', doc: { ...doc, tool } } }, {})
    assert.deepEqual([judged.state, judged.code], ['todo', 'kit-tool-outdated'], String(tool))
    assert.equal(judged.params.built, tool ? tool.split(' ')[1] : null)
    assert.equal(judged.params.required, '3.1.0')
    assert.match(judged.params.fix, /Settle the template kit again/)
    assert.match(judged.params.fix, /run samples/)
  }
})

test('kit tool: no readable kit is not judged here', () => {
  assert.equal(KIT_TOOL_CHECK.judge(boxing, { templateKit: { state: 'none' } }, {}), null)
})

test('kit tool: a T3 kit stamped 3.0.0 (JA Diner 1.0.5 before #439) is outdated; settled again, the verdict keeps it green', () => {
  const doc = jsonAt('ja-diner/j6/1.0.5', 'template-kit.json')
  const old = KIT_TOOL_CHECK.judge(
    diner,
    { templateKit: { state: 'read', doc: { ...doc, tool: 'template-kit 3.0.0' } } },
    {}
  )
  assert.deepEqual([old.state, old.code], ['todo', 'kit-tool-outdated'])
  assert.deepEqual([old.params.built, old.params.required], ['3.0.0', '3.1.0'])
  assert.equal(doc.tool, 'template-kit 3.1.0')
  const d = pieceOf(diner, [KIT_TOOL_CHECK], 'template-kit')
  assert.equal(d.state, 'done')
  assert.notEqual(d.step, 'kit-tool-version')
  assert.equal(pieceOf(boxing, [KIT_TOOL_CHECK], 'template-kit').state, 'done')
  assert.notEqual(pieceOf(boxing, [KIT_TOOL_CHECK], 'template-kit').step, 'kit-tool-version')
})

// ── pin behind the latest contract ───────────────────────────────────────────────────────────────────────────────────

test('pin: the newest contract version of a template is read from the contract index', () => {
  // test-quality: contract the newest committed JA Voyara contract is 1.0.12 (#473); a new capture moves this line
  assert.equal(latestContractVersion(contracts, 'quickstart/ja-voyara/j6'), '1.0.12')
  assert.equal(latestContractVersion(contracts, 'quickstart/ja-unknown/j6'), null)
})

test('pin: the latest JA Boxing pin is at its newest contract', () => {
  assert.equal(PIN_BEHIND_CHECK.judge(boxing, { contracts }, {}), null)
})

test('pin: a Boxing release one version back is behind, with a fix', () => {
  const back = { ...boxing, setting: { ...boxing.setting, version: '1.0.10' } }
  const judged = PIN_BEHIND_CHECK.judge(back, { contracts }, {})
  assert.deepEqual([judged.state, judged.code], ['todo', 'pin-behind-contract'])
  assert.deepEqual([judged.params.pinned, judged.params.latest], ['1.0.10', '1.0.11'])
  assert.match(judged.params.fix, /move its pin/)
})

test('pin: JA Voyara pinned at 1.0.12 is at its newest contract; one version back the release piece flags it', () => {
  // test-quality: contract the committed JA Voyara pin is 1.0.12, its newest contract (#473)
  assert.equal(voyara.setting.version, '1.0.12')
  assert.equal(PIN_BEHIND_CHECK.judge(voyara, { contracts }, {}), null)
  const back = { ...voyara, setting: { ...voyara.setting, version: '1.0.11' } }
  const v = pieceOf(back, [PIN_BEHIND_CHECK], 'quickstart-release')
  assert.deepEqual([v.state, v.code], ['todo', 'pin-behind-contract'])
  assert.deepEqual([v.params.pinned, v.params.latest], ['1.0.11', '1.0.12'])
})

// ── content map lists ────────────────────────────────────────────────────────────────────────────────────────────────

test('lists: the latest JA Boxing map holds lists, item pages and menu blocks', () => {
  assert.equal(CONTENT_MAP_LISTS_CHECK.judge(boxing, { contracts }, {}), null)
})

test('lists: each key left out of a Boxing map is named, with a fix', () => {
  const map = jsonAt('ja-boxing/j6/1.0.11', 'content-map.json')
  for (const key of ['itemLists', 'itemPages', 'menuBlocks']) {
    const broken = { ...map, [key]: {} }
    const judged = CONTENT_MAP_LISTS_CHECK.judge(boxing, { contracts, contentMap: broken }, {})
    assert.deepEqual(
      [judged.state, judged.code, judged.params.missing],
      ['todo', 'content-map-missing-lists', [key]]
    )
    assert.match(judged.params.fix, /content map/)
    const { [key]: _gone, ...absent } = map
    assert.deepEqual(
      CONTENT_MAP_LISTS_CHECK.judge(boxing, { contracts, contentMap: absent }, {}).params.missing,
      [key]
    )
  }
})

test('lists: a map with no articles or menus is not flagged for them', () => {
  assert.equal(
    CONTENT_MAP_LISTS_CHECK.judge(
      boxing,
      { contracts, contentMap: { entities: [], pages: [] }, templateKit: { state: 'none' } },
      {}
    ),
    null
  )
})

test('lists: JA Diner and JA Voyara 1.0.12 hold all three; the JA Voyara 1.0.11 map holds none of them', () => {
  assert.equal(CONTENT_MAP_LISTS_CHECK.judge(diner, { contracts }, {}), null)
  assert.equal(CONTENT_MAP_LISTS_CHECK.judge(voyara, { contracts }, {}), null)
  const old = jsonAt('ja-voyara/j6/1.0.11', 'content-map.json')
  const v = CONTENT_MAP_LISTS_CHECK.judge(voyara, { contracts, contentMap: old }, {})
  assert.deepEqual([v.state, v.code], ['todo', 'content-map-missing-lists'])
  assert.deepEqual(v.params.missing, ['itemLists', 'itemPages', 'menuBlocks'])
  // In the verdict it joins the contract piece after the road steps, which may decide the piece first.
  const verdict = readinessVerdict(voyara, { contracts, server: false, checks: [CONTENT_MAP_LISTS_CHECK] })
  assert.ok(verdict.pieces.some((p) => p.piece === 'contract'))
})

test('lists: not judged off Joomla and WordPress', () => {
  assert.equal(CONTENT_MAP_LISTS_CHECK.judge({ ...boxing, platform: 'emdash' }, { contracts }, {}), null)
})
