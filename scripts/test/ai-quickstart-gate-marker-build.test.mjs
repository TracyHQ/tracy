// The marker build of the release gate (ticket #585) on an INVENTED kit (the florist store of the write order tests):
// the gate reads the template from its input only, so the build chain runs on any block store and page recipes, and
// every value it writes carries a marker code the registry can name.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  FLORIST_TEMPLATE,
  floristBlockStore,
  floristPageRecipes
} from '../../packages/wo/website-opportunities/test/fixtures/write-order/florist-store.mjs'
import { codesIn, markerShare } from '../ai-quickstart/gate/marker-codec.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ai-quickstart/gate')
const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const kit = () => ({
  ref: 'example-petal/j6@1.0.0',
  blockStore: floristBlockStore(),
  pageRecipes: floristPageRecipes(),
  template: { slug: FLORIST_TEMPLATE.slug, version: FLORIST_TEMPLATE.version }
})

test('the marker build runs the real chain on an invented kit down to a write order with no problem', async () => {
  const built = await markerBuild(kit(), { iconLibrary: icons })
  assert.deepEqual(built.orderProblems, [])
  assert.ok(built.plan.pages.length >= 1)
  // Every page the plan keeps is named by a marker, and every text field of the order carries one.
  for (const page of built.plan.pages) assert.equal(markerShare(page.name).kind, 'marker', page.name)
  const texts = built.order.pages.flatMap((p) =>
    p.blocks.flatMap((b) => [...(b.fields ?? []), ...(b.items ?? []).flatMap((i) => i.fields ?? [])])
  )
  const written = texts.filter((f) => typeof f.value === 'string' && f.value.trim())
  assert.ok(written.length > 0)
  for (const f of written) assert.ok(codesIn(f.value).length > 0, `${f.key}: ${f.value}`)
  // Every code names one thing.
  const codes = built.registry.entries.map((e) => e.code)
  assert.equal(new Set(codes).size, codes.length)
})

test('the gate reads no template name: no JA template literal in its files', () => {
  for (const file of readdirSync(GATE, { recursive: true }).filter((f) => /\.(mjs|js)$/.test(f))) {
    const text = readFileSync(path.join(GATE, file), 'utf8')
    assert.doesNotMatch(text, /ja[-_ ]?boxing|block-\d+/i, file)
  }
})
