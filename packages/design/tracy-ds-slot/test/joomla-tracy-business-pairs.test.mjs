// Tracy Business Joomla wears three colour pairs from the roles the emitter proves (15/10/2026, review of
// ds-tb-joomla under Moxie and Figma): the closing call band is the accent-band pair, the info message the
// info pair, and the footer's words the on-ink family over the ink it wears. Both sides of the switch, four
// systems; the contract serves the published 1.2.3 (no role read) and the release that reads the roles.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  figma: 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
  stripe: 'od:stripe',
  spotify: 'od:spotify'
}
const contract = loadContract('joomla-tracy-business')
const sheet = (id) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, contract), contract).css

/** Each value a sheet gives one role variable, in order (one per side of the switch). */
const valuesOf = (css, name) => [...css.matchAll(new RegExp(`${name}:(#[0-9a-f]{6})`, 'gi'))].map((m) => m[1])

test('the closing call band wears the accent-band pair, its button stands out on it', () => {
  assert.ok(!contract.keepScopes.includes('.acm-tb-cta-band'), 'the call band is no longer kept')
  assert.equal(contract.bands['.acm-tb-cta-band'], undefined)
  assert.equal(contract.keptButtons['.acm-tb-cta-band'], undefined)
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const css = sheet(id)
    // the band, its title (a literal #F5F3EE on 1.2.3) and its line, past the template's own rules
    assert.match(
      css,
      /\.acm-tb-cta-band:not\([^)]*\)\{background-color:var\(--ds-c-accent-band\)!important;color:var\(--ds-c-on-accent-band\)!important\}/,
      key
    )
    assert.match(
      css,
      /\.acm-tb-cta-band \.tb-ctaband__title:not\([^)]*\)\{color:var\(--ds-c-on-accent-band\)!important\}/
    )
    // no ground of the band machine's own (a hex) any more
    assert.doesNotMatch(css, /\.acm-tb-cta-band\{background-color:#/, key)
    const bands = valuesOf(css, '--ds-c-accent-band')
    const words = valuesOf(css, '--ds-c-on-accent-band')
    const accents = valuesOf(css, '--ds-c-accent')
    assert.equal(bands.length, 2, `${key}: both sides`)
    bands.forEach((band, i) => {
      assert.ok(contrast(words[i], band) >= 4.5, `${key} side ${i}: words ${words[i]} on ${band}`)
      assert.ok(contrast(accents[i], band) >= 3, `${key} side ${i}: button ${accents[i]} on ${band}`)
    })
  }
})

test('the info message reads the info pair, at 4.5:1 on both sides', () => {
  assert.equal(contract.templateVars['--tb-info-fg'], 'var(--ds-c-info-text)')
  assert.equal(contract.templateVars['--tb-info-bg'], 'var(--ds-c-info-bg)')
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const css = sheet(id)
    const text = valuesOf(css, '--ds-c-info-text')
    const ground = valuesOf(css, '--ds-c-info-bg')
    assert.equal(text.length, 2, `${key}: both sides`)
    text.forEach((t, i) => assert.ok(contrast(t, ground[i]) >= 4.5, `${key} side ${i}: ${t} on ${ground[i]}`))
  }
})

test('the footer reads one family: the on-ink mixes over the ink it wears', () => {
  const footer = contract.bands['.tb-footer']
  // its ground is the template's own --tb-ink-band, the system's ink; its words are not the band machine's
  assert.equal(footer.root, false)
  // the wordmark and the column titles read the on-ink role (template CSS) over that ink: a band paint
  // ("text", judged on the band machine's own ground) set them in the paper text on a mid-grey ink,
  // 2.73:1 under Azione (15/10/2026, 135 systems)
  assert.equal(footer.paint, undefined)
  for (const k of contract.keepFollows) {
    assert.ok(!(k in contract.keepDefaults), `${k} is not given back`)
    assert.match(contract.templateVars[k], /--ds-c-ink/, `${k} reads the ink`)
  }
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const css = sheet(id)
    assert.doesNotMatch(css, /\.tb-footer\{background-color:/, key)
    const keep = css.split('\n').filter((l) => l.includes(' .tb-footer{--ds-c-bg:initial'))
    assert.equal(keep.length, 2, `${key}: a kept-band rule per side`)
    for (const l of keep)
      for (const k of contract.keepFollows) assert.ok(!l.includes(`${k}:`), `${key}: ${k}`)
  }
  for (const [key, id] of Object.entries({
    ...SYSTEMS,
    azione: 'refero:01d00b5d-5afe-4940-97b6-90ee994f62f6'
  })) {
    const css = sheet(id)
    assert.doesNotMatch(css, /\.tb-footbrand__name\)[^{]*\{color:/, `${key}: no paint on the wordmark`)
    const inks = valuesOf(css, '--ds-c-ink')
    const words = valuesOf(css, '--ds-c-on-ink')
    assert.equal(inks.length, 2, `${key}: both sides`)
    inks.forEach((ink, i) =>
      assert.ok(contrast(words[i], ink) >= 4.5, `${key} side ${i}: ${words[i]} on ${ink}`)
    )
  }
})
