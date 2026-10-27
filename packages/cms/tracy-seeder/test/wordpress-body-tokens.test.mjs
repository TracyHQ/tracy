/**
 * What the seeder writes into a WordPress page keeps to the design system (ADR 0023, PR 6).
 *
 * Measured 29/09/2026 before writing this: across `apple`, `airbnb` and `brutalism`, the page bodies
 * `htmlBlock` wraps carry NO raw hex, and every inline `font-family` is a `var()` — colour and type
 * already travel through the landing artifact's `--brand-*` tokens and the fixture's own classes.
 * The only raw numbers are layout geometry (shadows, radii, widths) from the vendored brand engine,
 * which the by-value adherence check does not judge. This test keeps it that way: a future edit that
 * writes `color:#123456` or `font-family:Arial` into a seeded page goes red here, not on a customer
 * site under `tracy_design_check`.
 *
 *   node --test packages/cms/tracy-seeder/test/wordpress-body-tokens.test.mjs
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { slotsOf } from '../../../../scripts/lib/od-slots-dom.mjs'
import { buildArtifactDocsFor } from '../../tracy-cms-sections/lib/artifacts.mjs'
import { buildSeedPlan } from '../../../design/tracy-design-inspiration/src/host/seed-plan.mjs'
import { htmlBlock } from '../src/apply-wordpress.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const VENDOR = path.join(ROOT, 'vendor/tracy/od-design-system')
const SECTIONS_DIR = path.join(ROOT, 'packages/cms/tracy-cms-sections/sections')
const sections = Object.fromEntries(
  readdirSync(SECTIONS_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), readFileSync(path.join(SECTIONS_DIR, f), 'utf8')])
)

/** The WordPress pages the seeder would write for one system, each as the block it upserts. */
function bodiesFor(id) {
  const fixtureHtml = readFileSync(path.join(VENDOR, `systems/${id}/components.html`), 'utf8')
  const landingHtml = buildArtifactDocsFor(id, VENDOR).landing
  const r = buildSeedPlan({
    system: id,
    systemName: id,
    cms: 'wordpress',
    site: {
      name: 'Acme Works',
      headline: 'Metal parts, made to order',
      sub: 'Since 1987.',
      cta: 'Get a quote'
    },
    pages: [],
    fixtureHtml,
    fixtureSlots: slotsOf(fixtureHtml, []),
    landingHtml,
    landingSlots: slotsOf(landingHtml, []),
    sections
  })
  assert.equal(r.ok, true, `${id}: the plan builds`)
  return r.plan.pages.map((p) => ({ slug: p.slug, block: htmlBlock(p.body) }))
}

/** Every inline style declaration a block carries. */
const declarations = (block) =>
  [...block.matchAll(/style="([^"]*)"/g)].flatMap((m) =>
    m[1]
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
  )

for (const id of ['apple', 'airbnb', 'brutalism']) {
  test(`${id}: no seeded WordPress page writes a raw hex colour inline`, () => {
    for (const { slug, block } of bodiesFor(id)) {
      const raw = declarations(block).filter((d) => /#[0-9a-f]{3,8}\b/i.test(d))
      assert.deepEqual(raw, [], `${id}/${slug}`)
    }
  })

  test(`${id}: every inline font-family on a seeded WordPress page is a token`, () => {
    let seen = 0
    for (const { slug, block } of bodiesFor(id)) {
      const fonts = declarations(block).filter((d) => /^font-family\s*:/i.test(d))
      seen += fonts.length
      const raw = fonts.filter((d) => !/^font-family\s*:\s*var\(--[\w-]+\)\s*$/i.test(d))
      assert.deepEqual(raw, [], `${id}/${slug}`)
    }
    assert.ok(
      seen > 0,
      `${id}: expected the landing to set fonts inline, found none — the test measures nothing`
    )
  })
}
