import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bornLabel } from '../src/lib/born-label.js'
import { fleetLabel, siteLabelRefusal, webDnsName, zoneLabelRefusal } from '../src/sites/label.js'

/**
 * What `workers/seat-registry/src/fleet.js` answered for these three keys. The Worker was deleted
 * 16/09/2026 and this test used to call it as the oracle; the values were read off that
 * implementation on the last commit that carried it (`git show <that commit>:workers/…/fleet.js`)
 * and frozen here. They are not decoration: every site provisioned before that day has a directory
 * on a fleet host named by this function, so a change that moves any of them orphans real sites.
 * The first key stood for a customer's domain; it is a fictional one now, its label from the unchanged function.
 */
const LABELS_THE_SEAT_BOOK_MINTED = {
  'fijitrips.example': 'fijitrips-example-5254d120',
  'https://www.joomlart.com/': 'www-joomlart-com-fd2509a5',
  'wpdemo.localhost': 'wpdemo-localhost-3b2d298f'
}

test('the label of a customer domain is the one the seat book minted before the port', async () => {
  for (const [key, label] of Object.entries(LABELS_THE_SEAT_BOOK_MINTED)) {
    assert.equal(await fleetLabel(key, 'tracy.ai'), label)
  }
})

test('a site born under the zone keeps its label', async () => {
  assert.equal(await fleetLabel('lantern-1a2b3c4d.tracy.ai', 'tracy.ai'), 'lantern-1a2b3c4d')
  assert.equal(await fleetLabel('wpdemo.localhost', 'localhost'), 'wpdemo')
})

// ── webDnsName: the bounded name a long label is dialled by (issue #165) ──────────────────────────

test('a short label is dialled by its own container name — no site deployed today changes', () => {
  // The whole point of the boundary: a label whose `<label>-web-1` fits a DNS label keeps EXACTLY
  // that name, so nothing already on the fleet needs re-provisioning. `wpdemo` → `wpdemo-web-1`.
  assert.equal(webDnsName('wpdemo'), 'wpdemo-web-1')
  assert.equal(webDnsName('fijitrips-example-5254d120'), 'fijitrips-example-5254d120-web-1')
})

test('the boundary is exact: 57-char label keeps its name, 58-char label gets an alias', () => {
  // `<label>-web-1` is `len + 6`; the cap is 63, so `len === 57` gives 63 (fits) and `len === 58`
  // gives 64 (over). Full-ASCII lower-case label to exercise the real charset a fleet label uses.
  const at57 = 'a'.repeat(57)
  const at58 = 'a'.repeat(58)
  assert.equal(`${at57}-web-1`.length, 63)
  assert.equal(webDnsName(at57), `${at57}-web-1`)
  assert.equal(`${at58}-web-1`.length, 64)
  assert.match(webDnsName(at58), /^tracy-web-[0-9a-f]{32}$/)
})

test('every over-long label yields a VALID DNS label, at most 63 octets', () => {
  // Push past the fleet label maximum (63) too, to prove the alias is bounded regardless of input.
  for (const len of [58, 60, 63, 80, 200]) {
    const alias = webDnsName('z'.repeat(len))
    assert.ok(alias.length <= 63, `alias for len ${len} is ${alias.length} octets`)
    assert.equal(alias.length, 42) // `tracy-web-` (10) + 32 hex
    // A DNS label: starts alnum, no leading/trailing hyphen, only [a-z0-9-].
    assert.match(alias, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
  }
})

test('two long labels differing by one character get distinct aliases', () => {
  const a = `${'a'.repeat(59)}x`
  const b = `${'a'.repeat(59)}y`
  assert.notEqual(webDnsName(a), webDnsName(b))
})

test('the alias hashes the WHOLE label — first 32 hex of SHA-256, matching render-compose.sh', () => {
  // The exact derivation both the bash renderer and the tracy-host copy must reproduce. Pinned so a
  // change to the hash length or input silently breaking parity fails here.
  const label = 'synthetic-imported-site-dns-length-regression-165-0a1b2c3def' // synthetic 60-char #165 case
  assert.equal(label.length, 60)
  const expected = `tracy-web-${createHash('sha256').update(label).digest('hex').slice(0, 32)}`
  assert.equal(webDnsName(label), expected)
})

// ── bornLabel: the address a site gets when nobody named it ─────────────────────────────────────
// Lee, 22/09: the CMS is readable from the address — `j-` Joomla, `wp-` WordPress, `ed-` EmDash —
// and a stock instance says it is stock (`inv-<cms>-`). A name the customer typed is not born here.

const fixed = () => 0.123456789 // (0.123456789).toString(36) === '0.4fzzzxjylrx'

test('a nameless site is addressed by its CMS and six random characters', () => {
  assert.equal(bornLabel('joomla', { random: fixed }), 'j-4fzzzx')
  assert.equal(bornLabel('wordpress', { random: fixed }), 'wp-4fzzzx')
  assert.equal(bornLabel('emdash', { random: fixed }), 'ed-4fzzzx')
})

test('a stock instance carries inv- before its CMS', () => {
  assert.equal(bornLabel('joomla', { stock: true, random: fixed }), 'inv-j-4fzzzx')
  assert.equal(bornLabel('wordpress', { stock: true, random: fixed }), 'inv-wp-4fzzzx')
  assert.equal(bornLabel('emdash', { stock: true, random: fixed }), 'inv-ed-4fzzzx')
})

test('a platform with no short name keeps the old site- address rather than inventing one', () => {
  assert.equal(bornLabel('drupal', { random: fixed }), 'site-4fzzzx')
  assert.equal(bornLabel(undefined, { stock: true, random: fixed }), 'inv-site-4fzzzx')
})

test('a short random draw is padded, so the tail is always six characters', () => {
  assert.equal(bornLabel('joomla', { random: () => 0.5 }), 'j-i00000')
})

test('every born label is a name the create door accepts when the press sends it back', () => {
  // The press after a nameless claim sends the claimed label to `POST /api/sites`, which judges it
  // with `siteLabelRefusal`. A tail of eight all-hex characters would read as `looks_imported`; six
  // cannot.
  for (const platform of ['joomla', 'wordpress', 'emdash', 'other'])
    for (const stock of [false, true])
      for (let i = 0; i < 200; i += 1) {
        const label = bornLabel(platform, { stock })
        assert.equal(siteLabelRefusal(label), null, label)
      }
})

test('a site cannot take the label of the desktop update host', () => {
  // `update.tracy.ai` serves the desktop app's update feed (UPDATE_ORIGIN); a site with the same
  // label would sit behind the same name and never be reachable.
  assert.equal(siteLabelRefusal('update'), 'reserved')
})

test('#1037 zoneLabelRefusal: the configured CNAME target and fallback origin labels are reserved, by the full label', () => {
  assert.equal(zoneLabelRefusal('connect', {}), 'reserved')
  assert.equal(zoneLabelRefusal('origin', {}), 'reserved')
  const dev = { ownDomainLabels: { connect: 'connect', origin: 'origin-dev' } }
  assert.equal(zoneLabelRefusal('origin-dev', dev), 'reserved')
  assert.equal(zoneLabelRefusal('origin', dev), null, 'only the labels in use')
  assert.equal(zoneLabelRefusal('connects', dev), null)
  // Both are site labels by shape: without this they would be free for any customer.
  assert.equal(siteLabelRefusal('connect'), null)
  assert.equal(siteLabelRefusal('origin'), null)
})
