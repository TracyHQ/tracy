/**
 * The donor fixture must stay one of the 84 systems that share the base reference page.
 *
 * WHY A TEST AND NOT A COMMENT. `REFERENCE_DONOR` is read by no gate and by nothing at build time:
 * if someone re-draws `application` as a bespoke fixture — as 68 of the 152 already are — every
 * community card silently starts wearing that drawing instead, and the shelf stops being a fair
 * reading of what the brand engine derived. Nothing on screen would say so.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { REFERENCE_DONOR } from '../src/client/reference-donor.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const vendor = path.join(here, '..', '..', '..', '..', 'vendor', 'tracy', 'od-design-system')
const slots = JSON.parse(readFileSync(path.join(vendor, 'slots.json'), 'utf8')).systems

/** A system's slot map as one string: which element, in which role, in which order. */
const shape = (id) => JSON.stringify(slots[id].slots.map((s) => `${s.id}|${s.role}`))

test('the donor is a system the vendored library actually has', () => {
  assert.ok(slots[REFERENCE_DONOR], `${REFERENCE_DONOR} is not in vendor/tracy/od-design-system`)
})

test('the donor still wears the base reference page, the one 84 systems share', () => {
  const mine = shape(REFERENCE_DONOR)
  const sharing = Object.keys(slots).filter((id) => shape(id) === mine)
  assert.ok(
    sharing.length >= 50,
    `${REFERENCE_DONOR} shares its page with only ${sharing.length} systems — it looks re-drawn, ` +
      'and every community card would now wear that drawing. Point REFERENCE_DONOR at a base system.'
  )
})

test("a brand's 56 tokens cover every token the donor's page reads", () => {
  const html = readFileSync(path.join(vendor, 'systems', REFERENCE_DONOR, 'components.html'), 'utf8')
  const root = html.slice(html.indexOf(':root'), html.indexOf('}', html.indexOf(':root')))
  const needed = new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const css = readFileSync(path.join(vendor, 'systems', REFERENCE_DONOR, 'tokens.css'), 'utf8')
  const has = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const missing = [...needed].filter((t) => !has.has(t))
  assert.deepEqual(missing, [], `the page reads tokens no tokens.css declares: ${missing.join(' ')}`)
})
