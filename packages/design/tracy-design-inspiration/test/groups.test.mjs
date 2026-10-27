/**
 * Every category the catalog carries lands in exactly one of Tracy's groups. A category in no group
 * is not an error anywhere else: the picker simply has no row for it, and those inspirations can
 * never be filtered to. The brand engine's two categories are in the first group, which leads.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  categoryKey,
  categoryLabel,
  COMMUNITY_CATEGORY,
  GROUPS,
  OWN_CATEGORY,
  REFERENCE_CATEGORY,
  stateOf,
  toggleGroup,
  PROVIDERS
} from '../src/client/groups.mjs'
import { en } from '../src/client/strings.ts'

const catalog = JSON.parse(
  readFileSync(new URL('../../../../vendor/tracy/od-design-system/catalog.json', import.meta.url), 'utf8')
)
const upstream = new Set(catalog.systems.map((s) => s.category))

test('every upstream category is in exactly one group', () => {
  const seen = new Map()
  for (const g of GROUPS) for (const m of g.members) seen.set(m, (seen.get(m) ?? 0) + 1)
  assert.deepEqual(
    [...upstream].filter((c) => !seen.has(c)),
    [],
    'categories in no group'
  )
  assert.deepEqual(
    [...seen].filter(([, n]) => n > 1).map(([c]) => c),
    [],
    'categories in two groups'
  )
})

test("no group names a category nothing carries, except the brand engine's own, the shelf's and the providers", () => {
  // Providers are a filter group like a category, matched against `provider` rather than
  // `category` (D37): the two names the catalogue may carry are the group's members.
  const known = new Set([...upstream, OWN_CATEGORY, REFERENCE_CATEGORY, COMMUNITY_CATEGORY, ...PROVIDERS])
  assert.deepEqual(
    GROUPS.flatMap((g) => g.members).filter((m) => !known.has(m)),
    []
  )
})

test('the provider group leads: who made it is the first question, then whose site it is', () => {
  assert.equal(GROUPS[0].id, 'provider')
  assert.deepEqual(GROUPS[0].members, PROVIDERS)
  assert.deepEqual(PROVIDERS, ['Tracy', 'JoomlArt'])
})

test("the brand group follows and holds the engine's two categories", () => {
  assert.equal(GROUPS[1].id, 'brand')
  assert.deepEqual(GROUPS[1].members, [OWN_CATEGORY, REFERENCE_CATEGORY])
})

test('the community shelf is its own group, right after the brand one', () => {
  // Not a member of `brand`: that row means "the site I am working on", and a stranger's domain
  // read off the public shelf is not that. Empty on a lane, so the row does not appear there.
  assert.equal(GROUPS[2].id, 'community')
  assert.deepEqual(GROUPS[2].members, [COMMUNITY_CATEGORY])
  assert.equal(
    GROUPS.filter((g) => g.members.includes(COMMUNITY_CATEGORY)).length,
    1,
    'the shelf category belongs to exactly one group'
  )
})

test('ticking a parent ticks every member; ticking it again clears them; some members is part', () => {
  const g = GROUPS.find((x) => x.id === 'media')
  const all = toggleGroup(g, new Set())
  assert.equal(stateOf(g, all), 'on')
  assert.deepEqual([...all], g.members)
  assert.equal(stateOf(g, toggleGroup(g, all)), 'off')
  assert.equal(stateOf(g, new Set([g.members[0]])), 'part')
  assert.equal(stateOf(g, toggleGroup(g, new Set([g.members[0]]))), 'on', 'a part parent ticks the rest')
})

test('every category a card can show has a translation key (spec #730)', () => {
  const shown = [
    ...upstream,
    ...GROUPS.filter((g) => g.id !== 'provider').flatMap((g) => g.members),
    'Uncategorised'
  ]
  assert.deepEqual(
    [...new Set(shown)].filter((c) => !(categoryKey(c) in en)),
    [],
    'add category-<slug> to strings.ts and translate it, or the category reads in English in every language'
  )
})

test('categoryLabel translates a known category and keeps a publisher name as is', () => {
  const t = (key) => (key === 'category-ai-llm' ? 'KI & LLM' : key)
  assert.equal(categoryLabel(t, 'AI & LLM'), 'KI & LLM')
  assert.equal(categoryLabel(t, 'JoomlArt'), 'JoomlArt')
})
