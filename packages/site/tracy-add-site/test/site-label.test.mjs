/**
 * The name rule for a site born on the fleet — `<label>.tracy.ai`.
 *
 * WHY THE TEST LIVES HERE AND NOT ELSEWHERE. This rule will have **two copies**: the one in the plugin
 * (answering instantly while people type) and the one in `workers/seat-registry` (the real gate, which cannot
 * be argued with). In `tracy-desk` the two were kept in sync by an `@shared` folder both
 * imported; there is no such folder here — the Worker deploys independently and cannot reach `packages/`.
 *
 * So the source is written in **plain JavaScript**, not TypeScript: the copy into the Worker is then
 * verbatim, not a translation. A translation is a chance for the two to drift, and
 * that drift shows up as a button lighting up on exactly the name the relay will refuse.
 *
 * The four refusals are FOUR, not one. `tracy-desk` `CreateSiteForm.tsx` states the reason:
 * one sentence for all four leaves people guessing where they went wrong. Three of the four are computed in place;
 * `taken` must ask the server.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { siteLabelRefusal, isSiteLabel, RESERVED_LABELS } from '../src/client/site-label.mjs'

test('an ordinary name is accepted', () => {
  assert.equal(siteLabelRefusal('bakery'), null)
  assert.equal(siteLabelRefusal('my-bakery'), null)
  assert.equal(isSiteLabel('nha-hang-cua-toi'), true)
})

test('too short or too long is `shape`', () => {
  // 6 to 30 characters — the same bounds as `FLEET_BORN_LABEL_RE` in tracy-desk.
  assert.equal(siteLabelRefusal('abcde'), 'shape')
  assert.equal(siteLabelRefusal('abcdef'), null)
  assert.equal(siteLabelRefusal('a'.repeat(30)), null)
  assert.equal(siteLabelRefusal('a'.repeat(31)), 'shape')
})

test('a hyphen at the start or end is `shape` (RFC 1035 §2.3.1)', () => {
  assert.equal(siteLabelRefusal('-bakery'), 'shape')
  assert.equal(siteLabelRefusal('bakery-'), 'shape')
})

test('capitals and odd characters are `shape` — the function does NOT normalise', () => {
  // Normalising is the caller's job (`name.trim().toLowerCase()`), as in tracy-desk. A function that
  // both checks and fixes would accept one name and send another.
  assert.equal(siteLabelRefusal('Bakery'), 'shape')
  assert.equal(siteLabelRefusal('bánh-mì'), 'shape')
  assert.equal(siteLabelRefusal('bakery.shop'), 'shape')
  assert.equal(siteLabelRefusal(' bakery '), 'shape')
})

test('two hyphens at positions 3–4 are `shape` — the IDN shape Cloudflare refuses', () => {
  // RFC 5891 §4.2.3.1 reserves the `xn--` shape for IDN. Measured on a real customer site 2026-08-10: it failed at
  // the DNS step, AFTER the whole export had finished.
  assert.equal(siteLabelRefusal('xn--bakery'), 'shape')
  assert.equal(siteLabelRefusal('ab--cdef'), 'shape')
  // A double hyphen elsewhere is fine — the rule only bans that exact position.
  assert.equal(siteLabelRefusal('abc--defg'), null)
})

test('a name the zone itself needs is `reserved`, not `shape`', () => {
  // A customer site answering at `api.tracy.ai` is not a naming matter — it is a site standing
  // exactly where an internal door is expected.
  assert.equal(siteLabelRefusal('registry'), 'reserved')
  assert.equal(siteLabelRefusal('webhook'), 'reserved')
  assert.equal(siteLabelRefusal('dashboard'), 'reserved')
})

test('a name shorter than 6 characters is still `shape` even if it is on the reserved list', () => {
  // `api`, `www`, `cdn`, `mail` are all under 6 characters, so `shape` catches them first. The check order is
  // part of the contract: changing it changes the sentence the user reads.
  assert.equal(siteLabelRefusal('api'), 'shape')
  assert.equal(siteLabelRefusal('www'), 'shape')
})

test('a `-` + 8 hex digits tail is `looks_imported`', () => {
  // The label of EVERY imported site is built as `<readable>-<8 hex of SHA-256>`. Refusing exactly that
  // tail is what keeps a name people make up themselves from ever landing on the address of an
  // imported site.
  assert.equal(siteLabelRefusal('joomlart-0871462c'), 'looks_imported')
  // Nine hex digits is not that shape.
  assert.equal(siteLabelRefusal('joomlart-0871462cd'), null)
  // Eight characters that are not hex are not either.
  assert.equal(siteLabelRefusal('joomlart-0871462z'), null)
})

test('the reserved list is lowercase and not empty', () => {
  assert.ok(RESERVED_LABELS.size > 0)
  for (const name of RESERVED_LABELS) assert.equal(name, name.toLowerCase())
})

test("a fleet-born site's label IS the name — no hashing needed", () => {
  // `fleetLabel()` in seat-registry has two branches, and the first matches `^<label>.tracy.ai$` and
  // returns `<label>` as is. So for the create branch the plugin does NOT have to compute anything — which is why
  // there is no copy of `fleetLabel` here. The only copy worth writing is the one that does not exist.
  assert.equal(isSiteLabel('bakery'), true)
})
