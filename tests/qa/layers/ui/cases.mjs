// Pure derivation of the ui layer's case manifests from denominator.json and tables.mjs.
// No file access: generate.mjs calls it to record count/sha256, index.mjs calls it to list cases,
// so the manifests a run uses are exactly the ones the committed denominator vouches for.

import { createHash } from 'node:crypto'
import { OUTCOMES } from './outcomes.mjs'
import { FAMILIES, LEGACY_MAP_PATH, ORACLES, SWITCH_FAMILIES, VIEWPORTS } from './tables.mjs'

const STORY_KINDS = { 'ui-story-screen': 'real-screen', 'ui-story-block': 'building-block' }
const SHEET_LANGUAGES = ['en', 'vi']
const effects = { reads: ['storybook:local'], writes: [], mail: false, model: false, containers: false }

function oracleOf(id) {
  const o = ORACLES[id]
  return {
    source: o.file,
    ref: `tests/qa/oracles/ui/pins.json#${id}`,
    invariant: o.invariant,
    owner: o.owner
  }
}

function storyCase(item, detail, family, variant, explicitVariant) {
  const tags = [...new Set([...family.tags, ...(family.key === 'console-network' ? detail.stateTags : [])])]
  return {
    id: `QA-UI-${detail.key}-${family.key}${explicitVariant ? `-${variant}` : ''}`,
    itemIds: [item.id],
    requirement: family.requirement,
    oracle: oracleOf(family.oracle),
    edgeTags: tags,
    dimensions: { languages: ['en'], themes: ['light'], viewports: [variant] },
    area: STORY_KINDS[item.kind] === 'real-screen' ? 'screens' : 'blocks',
    targets: ['local'],
    effects,
    prerequisites: ['chromium', 'storybook'],
    assertionIds: [family.assertionId],
    redProof: null,
    legacyIds: []
  }
}

function sheetCase(item, detail, lang, vp) {
  return {
    id: `QA-UI-${detail.key}-sheet-${lang}-${vp}-light`,
    itemIds: [item.id],
    requirement:
      'A contact sheet (bench reference beside product screenshot, same size/theme/locale, SHA in the caption) exists, is not stale, and a person has ticked it in manual-review.json.',
    oracle: {
      source: 'tests/qa/oracles/ui/requirements.md',
      ref: 'tests/qa/oracles/ui/pins.json#qa-brief-ui',
      invariant:
        'Visual look and wording are judged by a person; the machine checks only that the sheet exists and is fresh.',
      owner: 'QA suite plan §4 ui, human cases'
    },
    edgeTags: ['language-theme-viewport'],
    dimensions: { languages: [lang], themes: ['light'], viewports: [vp] },
    area: 'sheets',
    targets: ['local', 'dev'],
    effects: { ...effects, reads: ['storybook:local', 'QA_STAND_URL'] },
    prerequisites: ['chromium', 'storybook', 'QA_STAND_URL'],
    assertionIds: ['ui.sheet.exists-fresh-pending-manual'],
    redProof: null,
    legacyIds: []
  }
}

function switchCase(item, detail, family) {
  return {
    id: `QA-UI-${detail.switchId}-switch-${family.key}`,
    itemIds: [item.id],
    requirement: family.requirement,
    oracle: oracleOf(family.oracle),
    edgeTags: family.tags,
    dimensions: { languages: ['en'], themes: ['light'], viewports: ['1440'] },
    area: 'switches',
    targets: ['local'],
    effects: { reads: ['browser:fixture-page'], writes: [], mail: false, model: false, containers: false },
    prerequisites: ['chromium'],
    assertionIds: [family.assertionId],
    redProof: null,
    legacyIds: []
  }
}

/** @returns {Record<string, object[]>} manifests grouped by family (stable order). */
/**
 * The object the ui layer works on: the committed denominator (shared contract shape) with its `details`
 * also readable at the top level (`itemDetails`, `matrix`, `counts`, `legacyMap`, `cases`…).
 */
export const flatView = (doc) => ({ ...doc.details, ...doc })

export function deriveCases(denominator) {
  const cases = {}
  const details = denominator.itemDetails
  for (const family of FAMILIES) {
    const list = []
    for (const item of denominator.items) {
      const kind = STORY_KINDS[item.kind]
      if (!kind || !family.kinds.includes(kind)) continue
      if (kind === 'building-block' && ['raw-keys', 'vocabulary'].includes(family.key)) continue
      const detail = details[item.id]
      if (family.onlyWhenSourceMatches && !detail.dialogHint) continue
      for (const variant of family.variants)
        list.push(
          storyCase(item, detail, family, variant, family.variants.length > 1 || family.key === 'overflow')
        )
    }
    cases[family.key] = list
  }
  const sheets = []
  for (const item of denominator.items) {
    if (item.kind !== 'ui-story-screen') continue
    for (const lang of SHEET_LANGUAGES)
      for (const vp of VIEWPORTS) sheets.push(sheetCase(item, details[item.id], lang, vp.id))
  }
  cases['contact-sheets'] = sheets
  const sw = []
  for (const item of denominator.items) {
    if (item.kind !== 'ui-switch') continue
    const detail = details[item.id]
    for (const family of SWITCH_FAMILIES) {
      if (family.onlyWhen === 'tabs' && detail.tabs.length === 0) continue
      if (family.key === 'consumer' && detail.locked) continue
      sw.push(switchCase(item, detail, family))
    }
  }
  cases.switches = sw
  const legacy = (denominator.legacyMap.entries ?? []).map((e) => ({
    id: `QA-UI-legacy-${e.id}`,
    itemIds: [],
    requirement: `Old audit finding ${e.id}${e.title ? ` — ${e.title}` : ''} must hold on the current tree (history not yet proven, so PENDING).`,
    oracle: {
      source: LEGACY_MAP_PATH,
      ref: `${LEGACY_MAP_PATH}#${e.id}`,
      invariant: 'the finding stays fixed',
      owner: 'tch-qa-audit ledger'
    },
    edgeTags: ['happy'],
    area: 'legacy',
    targets: ['local'],
    effects,
    prerequisites: ['legacy-fix-commit'],
    assertionIds: [`ui.legacy.${e.id}`],
    redProof: null,
    legacyIds: [e.id, ...(e.fixRefs ?? [])]
  }))
  if (legacy.length === 0) {
    legacy.push({
      id: 'QA-UI-legacy-map-gap',
      itemIds: [],
      requirement:
        'The old SSR/DSH/OPS findings mapped to ui are carried here with legacyIds once W1 lands tests/qa/inventory/legacy-map.json.',
      oracle: {
        source: LEGACY_MAP_PATH,
        ref: LEGACY_MAP_PATH,
        invariant: 'every audit finding owned by ui has a case',
        owner: 'W1 inventory'
      },
      edgeTags: ['happy'],
      area: 'legacy',
      targets: ['local'],
      effects,
      prerequisites: [LEGACY_MAP_PATH],
      assertionIds: ['ui.legacy.map-present'],
      redProof: null,
      legacyIds: []
    })
  }
  cases.legacy = legacy
  // Product-screen outcomes (outcomes.mjs): named and sourced, measured by no adapter yet.
  cases.outcomes = OUTCOMES.map((o) => ({
    id: `QA-UI-outcome-${o.key}`,
    itemIds: [],
    requirement: o.title,
    oracle: {
      source: o.oracle.source,
      ref: o.oracle.ref,
      invariant: o.oracle.invariant,
      owner: o.oracle.owner
    },
    edgeTags: [o.tag],
    dimensions: { group: o.group, measuredMeanwhile: o.meanwhile },
    area: 'outcomes',
    targets: ['local'],
    effects: { reads: ['QA_STAND_URL'], writes: [], mail: false, model: false, containers: false },
    prerequisites: ['chromium', 'QA_STAND_URL', 'product-screen-adapter'],
    assertionIds: [`ui.outcome.${o.key}`],
    redProof: null,
    legacyIds: []
  }))
  return cases
}

export function casesText(cases) {
  return JSON.stringify(
    Object.keys(cases)
      .sort()
      .map((k) => [k, cases[k]])
  )
}

export const casesHash = (cases) => createHash('sha256').update(casesText(cases)).digest('hex')
