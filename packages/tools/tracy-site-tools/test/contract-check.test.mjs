// contract-check.mjs — the mirror of `QuickstartContract::checkValue` (claude-cowork 2aa7840,
// `joomla/cowork/lib/QuickstartContract.php:538-562`, and `IdentityTokens.php`). Every rule's test
// names the line it mirrors; the cases marked `contracts.php` / `identity.php` are the component's
// own tests at 2aa7840 (`joomla/cowork/tests/`), restated here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CTA_URL,
  EVIDENCE_MAX_BYTES,
  IDENTITY_FIELDS,
  IDENTITY_TOKENS,
  checkChanges,
  checkSlotValue,
  contractPrecheckOn,
  hasDirective,
  hasMarkup,
  isIdentitySlot,
  phpTrim,
  stripIdentityTokens
} from '../src/host/contract-check.mjs'

/** A text slot as an inspect answers it. */
const text = (extra = {}) => ({
  key: 'hero.0',
  type: 'text',
  sample: 'Demo title',
  maxCharacters: 80,
  requiresEvidence: false,
  ...extra
})
const url = (extra = {}) =>
  text({ key: 'hero.1', type: 'url', sample: 'index.php?Itemid=101', maxCharacters: 2048, ...extra })
const identity = (field, extra = {}) =>
  text({
    key: `identity.${field}`,
    column: 'params',
    sample: '',
    maxCharacters: 255,
    jsonPath: ['site-identity', field],
    siteIdentity: true,
    label: `[Tracy] Site identity / ${field}`,
    ...extra
  })

test("the identity token list is the component's closed list of fourteen, and every field fills one", () => {
  // IdentityTokens::NAMES (= Identity::NAMES of plg_system_tracyidentity)
  assert.deepEqual(IDENTITY_TOKENS, [
    'site.name',
    'site.legalName',
    'site.slogan',
    'site.monogram',
    'contact.email',
    'contact.phone',
    'contact.tel',
    'contact.address',
    'contact.hours',
    'social.facebook',
    'social.instagram',
    'social.linkedin',
    'social.tiktok',
    'social.youtube'
  ])
  for (const name of Object.values(IDENTITY_FIELDS)) assert.ok(IDENTITY_TOKENS.includes(name), name)
  assert.equal(Object.keys(IDENTITY_FIELDS).length, 13, 'every token but the derived contact.tel')
})

test("the 1.2.0 contract's Site identity slots are the fields this file names", () => {
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  const fields = map.slots.filter((s) => s.siteIdentity === true).map((s) => s.jsonPath[1])
  assert.deepEqual(fields.sort(), Object.keys(IDENTITY_FIELDS).sort())
})

test('phpTrim is PHP trim(): a no-break space stays, the six ASCII blanks go', () => {
  assert.equal(phpTrim(' \t\n\r\0\v x \v\0'), 'x')
  assert.equal(phpTrim('\u00a0'), '\u00a0', 'occupied to the component, empty to String#trim')
  assert.equal(phpTrim('\u3000x'), '\u3000x')
})

test('QC.php:540-543 evidence: a value other than the sample in an evidence slot needs a non-empty string ≤ 8,000 bytes', () => {
  const slot = text({ requiresEvidence: true })
  assert.equal(checkSlotValue(slot, 'Demo title'), null, 'the sample itself needs none')
  assert.deepEqual(checkSlotValue(slot, 'Customer title'), {
    rule: 'evidence',
    key: 'hero.0',
    message: 'Customer evidence required: hero.0'
  })
  assert.equal(checkSlotValue(slot, 'Customer title', { evidence: { 'hero.0': ' \t' } })?.rule, 'evidence')
  assert.equal(checkSlotValue(slot, 'Customer title', { evidence: { 'hero.0': 42 } })?.rule, 'evidence')
  assert.equal(
    checkSlotValue(slot, 'Customer title', { evidence: { 'hero.0': 'Call it Customer title' } }),
    null
  )
  // strlen counts bytes: 2,667 three-byte characters are 8,001 bytes
  assert.equal(
    checkSlotValue(slot, 'Customer title', { evidence: { 'hero.0': 'đ'.repeat(4000) } }),
    null,
    '8,000 bytes pass'
  )
  assert.equal(
    checkSlotValue(slot, 'Customer title', { evidence: { 'hero.0': 'ế'.repeat(2667) } })?.rule,
    'evidence',
    `over ${EVIDENCE_MAX_BYTES} bytes`
  )
  // PHP empty(): "0" and 0 are no evidence flag
  assert.equal(checkSlotValue(text({ requiresEvidence: '0' }), 'Customer title'), null)
})

test('QC.php:547-550 occupancy: an occupied slot is not emptied, an empty one not filled (PHP trim)', () => {
  // contracts.php: 'contract rejects empty or unknown slot hero.0'
  assert.deepEqual(checkSlotValue(text(), ''), {
    rule: 'cannot-empty',
    key: 'hero.0',
    message: 'Content cannot remove an occupied slot: hero.0'
  })
  assert.equal(checkSlotValue(text(), ' \n')?.rule, 'cannot-empty')
  assert.equal(checkSlotValue(text(), '\u00a0'), null, 'a no-break space is not empty to PHP trim()')
  assert.deepEqual(checkSlotValue(text({ sample: '' }), 'New words'), {
    rule: 'cannot-fill',
    key: 'hero.0',
    message: 'Content cannot activate an empty slot: hero.0'
  })
  assert.equal(checkSlotValue(text({ sample: '' }), ''), null)
})

test('QC.php:547 the Site identity block is exempt from occupancy, by its flag or its label (identity.php)', () => {
  // identity.php: 'an identity fact the customer never gave can be emptied'
  assert.equal(checkSlotValue(identity('phone', { sample: '8 800 550-67-90' }), ''), null)
  assert.equal(checkSlotValue(identity('site-name', { sample: '' }), 'Sarah'), null)
  assert.equal(checkSlotValue(identity('tiktok', { type: 'url' }), 'https://tiktok.com/@sarah'), null)
  // never stricter than the component: an answer that dropped the flag still names the block
  const unflagged = identity('phone', { siteIdentity: undefined, sample: '8 800 550-67-90' })
  assert.equal(isIdentitySlot(unflagged), true)
  assert.equal(checkSlotValue(unflagged, ''), null)
  // identity.php: 'an ordinary slot still cannot be emptied'
  assert.equal(checkSlotValue(text(), '')?.rule, 'cannot-empty')
  // identity.php: 'an identity URL is still held to the CTA rules'
  assert.equal(checkSlotValue(identity('tiktok', { type: 'url' }), 'javascript:alert(1)')?.rule, 'url')
})

test('QC.php:551 markup and control characters: < > and C0 controls but tab, line feed and carriage return', () => {
  for (const bad of ['<b>New</b>', 'a > b', 'x\u0000y', 'x\u0008y', 'x\u000by', 'x\u000cy', 'x\u001fy'])
    assert.equal(checkSlotValue(text(), bad)?.rule, 'no-markup', JSON.stringify(bad))
  for (const ok of ['a\tb', 'a\nb', 'a\rb', 'a\u007fb', 'Customer & partners'])
    assert.equal(checkSlotValue(text(), ok), null, JSON.stringify(ok))
  assert.equal(
    checkSlotValue(text(), '<b>')?.message,
    'Markup and control characters are not content: hero.0'
  )
  assert.equal(hasMarkup('plain'), false)
})

test('QC.php:552 directives: every {…} but the fourteen identity tokens (IdentityTokens::hasDirective)', () => {
  // contracts.php: 'contract rejects injected Joomla module directives'
  assert.equal(checkSlotValue(text(), '{loadposition new-position}')?.rule, 'no-directive')
  assert.equal(
    checkSlotValue(text(), '{loadmodule 1}')?.message,
    'Joomla plugin directives are not content: hero.0'
  )
  // identity.php: 'the customer may keep a token in copy they rewrite'
  assert.equal(checkSlotValue(text(), 'Why choose {site.name} today'), null)
  // identity.php: 'an unknown token is refused like any directive'
  assert.equal(checkSlotValue(text(), 'Why {site.evil}')?.rule, 'no-directive')
  // identity.php: 'a directive beside an identity token is still refused'
  assert.equal(checkSlotValue(text(), '{site.name} {loadposition x}')?.rule, 'no-directive')
  assert.equal(stripIdentityTokens('{site.name} · {contact.phone} · {contact.tel}'), ' ·  · ')
  // IdentityTokens::strip is ONE `strtr` pass: what a removal joins is not looked at again
  assert.equal(stripIdentityTokens('{contact.{site.name}email}'), '{contact.email}')
  assert.equal(checkSlotValue(text(), 'Mail {contact.{site.name}email}')?.rule, 'no-directive')
  assert.equal(stripIdentityTokens('{{site.name}}'), '{}', 'braces around a token stay')
  assert.equal(hasDirective('{/if}'), true, 'a closing directive too')
  assert.equal(hasDirective('{1}'), false, 'braces around a digit are not a directive')
})

test('QC.php:553 length in code points (mb_strlen), not UTF-16 units', () => {
  const slot = text({ maxCharacters: 74 })
  assert.equal(checkSlotValue(slot, 'x'.repeat(74)), null)
  assert.deepEqual(checkSlotValue(slot, 'x'.repeat(75)), {
    rule: 'max-characters',
    key: 'hero.0',
    message: 'Content too long: hero.0',
    limit: 74,
    length: 75
  })
  assert.equal(checkSlotValue(slot, '𝐀'.repeat(74)), null, 'an astral letter is one character, two units')
  assert.equal(checkSlotValue(slot, 'ệ'.repeat(74)), null)
  assert.equal(
    checkSlotValue(text({ maxCharacters: undefined }), 'x'.repeat(5000)),
    null,
    'no limit known: no rule'
  )
})

test("QC.php:554-555 CTA URLs: the component's pattern, a leading // and any backslash refused", () => {
  const slot = url()
  // contracts.php: 'contract rejects unsafe CTA …'
  for (const bad of ['javascript:alert(1)', '//other.example/', '/\\other.example/'])
    assert.equal(checkSlotValue(slot, bad)?.rule, 'url', bad)
  for (const bad of [
    'http://plain.example',
    'https://a b',
    'tel:0909-abc',
    'ftp://x',
    'mailto:',
    'index.php?Itemid=x'
  ])
    assert.equal(checkSlotValue(slot, bad)?.message, 'Unsupported CTA URL: hero.1', bad)
  for (const ok of [
    'https://example.com/a?b=c',
    'mailto:hello@example.vn',
    'tel:+84 (0) 909-123-456',
    'tel:0909123456',
    'index.php?Itemid=604',
    '/en/contact#form',
    '#top',
    ''
  ])
    assert.equal(checkSlotValue(url({ sample: ok === '' ? '' : 'x' }), ok), null, ok)
  // PCRE without /u: \s is ASCII, so a no-break space inside https://… passes the component
  assert.equal(CTA_URL.test('https://a\u00a0b'), true)
  assert.equal(CTA_URL.test('https://a\u000bb'), false, 'a vertical tab is \\s to PCRE')
  // PCRE's `~D`: no line feed before the end
  assert.equal(CTA_URL.test('#top\n'), false)
})

test("QC.php:557 a picture is checked by its path only; the file is the site's to find", () => {
  const slot = text({
    key: 'hero.8',
    type: 'image',
    sample: 'images/northgate/hero-ru.png',
    maxCharacters: 2048
  })
  assert.equal(checkSlotValue(slot, 'images/tracy/hero-new.webp'), null)
  assert.equal(
    checkSlotValue(slot, 'images/a.JPG')?.rule,
    'image',
    "the component's pattern is case-sensitive"
  )
  assert.equal(checkSlotValue(slot, 'images/../configuration.php')?.rule, 'image')
  assert.equal(
    checkSlotValue(slot, '/images/a.png')?.message,
    'Image must already exist in the site media library: hero.8'
  )
})

test("the rules run in the component's order: the first one broken is the one it names", () => {
  const slot = text({ requiresEvidence: true, maxCharacters: 3 })
  assert.equal(checkSlotValue(slot, '<b>long</b>')?.rule, 'evidence', 'evidence (540) before markup (551)')
  assert.equal(checkSlotValue(slot, '<b>long</b>', { evidence: { 'hero.0': 'mine' } })?.rule, 'no-markup')
  assert.equal(
    checkSlotValue(text({ maxCharacters: 3 }), '{loadmodule 1}')?.rule,
    'no-directive',
    'directive (552) before length (553)'
  )
  assert.equal(checkSlotValue(text(), '')?.rule, 'cannot-empty', 'occupancy (547) before everything after it')
})

test("checkChanges: the first refusal of an apply in sending order; keys the snapshot lacks are the component's", () => {
  const slots = [text(), url(), text({ key: 'hero.2', maxCharacters: 5 })]
  assert.equal(
    checkChanges(slots, { 'hero.0': 'Fine', 'hero.2': 'Too long here', 'hero.1': '//x' })?.key,
    'hero.2'
  )
  assert.equal(checkChanges(slots, { 'hero.99': '', 'vi-VN::hero.0': '' }), null)
  assert.equal(checkChanges(slots, { 'hero.0': 12 }), null, "a non-string is plan()'s to refuse")
  assert.equal(checkChanges(slots, {}), null)
})

test('TRACY_CONTRACT_PRECHECK=off is the one switch that hands every value back to the component', () => {
  assert.equal(contractPrecheckOn({}), true)
  assert.equal(contractPrecheckOn({ TRACY_CONTRACT_PRECHECK: 'on' }), true)
  assert.equal(contractPrecheckOn({ TRACY_CONTRACT_PRECHECK: ' OFF ' }), false)
  assert.equal(contractPrecheckOn({ TRACY_CONTRACT_PRECHECK: '0' }), true, 'only "off" turns it off')
})
