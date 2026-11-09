/**
 * Every coverage hole met on JA Diner WP7 (TracyHQ/tracy#459) is DETECTED by a red verdict piece on a deliberately broken
 * fixture (an invented bakery), turns green when fixed, and has a recipe in `references/coverage-holes.md` section 6 that
 * SKILL.md reaches from the red state code. The detections are the real ones: the audit's label rules and the road
 * step's judges. Nothing here is a Diner fact.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  judgeCoverage,
  judgeLabelRules
} from '../../../../../apps/tracy-web/src/lib/content-coverage/judge.js'
import { namedLeafTexts } from '../../../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/wordpress-named-blocks.js'
import { isProse } from '../../../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/joomla-row-text.js'
import { labelRulesOf } from '../../../../../packages/cms/tracy-quickstart-tools/content-coverage/lib/label-rules.mjs'

const V3 = 'place-content-roles/3'
const HOLES = readFileSync(new URL('../../references/coverage-holes.md', import.meta.url), 'utf8')
const SKILL = readFileSync(new URL('../../SKILL.md', import.meta.url), 'utf8')
const FIXMAP = readFileSync(new URL('../../references/fix-map.md', import.meta.url), 'utf8')
const PATCH = readFileSync(new URL('../../references/patch-release.md', import.meta.url), 'utf8')

const text = (key, sample, role, extra = {}) => ({ key, type: 'text', sample, role, ...extra })
const grp = (id, item, kind) => ({ id, item, kind })
const mapOf = (slots) => ({ roleVocabularyVersion: V3, slotFitVersion: 'slot-fit/1', slots })

/** The audit's label rules, then the road step's judge over them: the state the verdict piece shows. */
function labelState(map, holes = []) {
  const labelRules = labelRulesOf({ map, pages: [], holes })
  const judged = judgeLabelRules({ labelRules }, { live: false })
  return { failing: judged.failing.map((f) => f.rule), holds: judged.holds }
}
const holesState = (holes) => judgeCoverage({ holes, hygiene: [], pages: { failed: 0 }, coverage: {} }).holds
const hole = (over) => ({ kind: 'text', lock: 'undeclared', pages: 2, firstPage: '/', ...over })

const CASES = [
  {
    id: 'H1',
    broken: () =>
      labelState(mapOf([]), [
        hole({
          value: '(555) 010-2030',
          class: 'template',
          evidence: 'wp-content/themes/t/patterns/contact.php'
        })
      ]),
    fixed: () =>
      labelState(
        mapOf([
          text('theme.t_contact_phone', '(555) 010-2030', 'contact.phone', {
            group: grp('site.contact.0', 0, 'contact')
          })
        ]),
        []
      ),
    rules: ['R9']
  },
  {
    id: 'H2',
    broken: () => labelState(mapOf([]), [hole({ value: '555-010-9999', class: 'unknown', evidence: '' })]),
    fixed: () => labelState(mapOf([]), []),
    rules: ['R9']
  },
  {
    id: 'H3',
    broken: () =>
      labelState(
        mapOf([text('menu.dish.1', 'Salad $30', 'offering.name', { group: grp('m.0', 0, 'menu_item') })])
      ),
    fixed: () =>
      labelState(
        mapOf([
          text('menu.dish.1', 'Salad ((span class="price"))$30((/span))', 'offering.name', {
            markup: 'inline',
            group: grp('m.0', 0, 'menu_item')
          })
        ])
      ),
    rules: ['R2']
  },
  {
    id: 'H4',
    broken: () =>
      labelState(
        mapOf([
          {
            key: 'hero.plate',
            type: 'image',
            sample: 'x.png',
            role: 'editorial.design_element',
            fit: { measured: true, kind: 'cutout', replace: 'photo' }
          }
        ])
      ),
    fixed: () =>
      labelState(
        mapOf([
          {
            key: 'hero.plate',
            type: 'image',
            sample: 'x.png',
            role: 'editorial.illustration',
            fit: { measured: true, kind: 'photo', replace: 'photo' }
          }
        ])
      ),
    rules: ['R5']
  },
  {
    id: 'H6',
    broken: () =>
      labelState(mapOf([]), [
        hole({
          value: 'Company Name 12 Example Road P: (555) 010-2030',
          class: 'capture',
          evidence: 'posts#9.post_content'
        })
      ]),
    fixed: () =>
      labelState(mapOf([]), [
        hole({
          value: 'Company Name Example Road 12 P: (555) 010',
          class: 'capture',
          evidence: 'posts#9.post_content'
        })
      ]),
    rules: ['R9']
  },
  {
    id: 'H12',
    broken: () =>
      labelState(mapOf([]), [
        hole({
          value: 'Studio name Example Road 12, Sometown 00000 P: (555) 010 2030',
          class: 'capture',
          evidence: 'posts#9.post_content (contains)',
          firstPage: '/?pagename=style-guide'
        })
      ]),
    fixed: () =>
      labelState(mapOf([]), [
        hole({
          value: 'Studio name Street address City P: Phone number',
          class: 'capture',
          evidence: 'posts#9.post_content (contains)',
          firstPage: '/?pagename=style-guide'
        })
      ]),
    rules: ['R9']
  },
  {
    id: 'H13',
    broken: () =>
      labelState(
        mapOf([
          text('promo.info', 'Mon to Thu ((br/))12 Noon to 11 PM', 'editorial.paragraph', {
            markup: 'inline'
          })
        ])
      ),
    fixed: () =>
      labelState(
        mapOf([
          text('promo.info', 'Mon to Thu ((br/))12 Noon to 11 PM', 'offering.schedule', {
            markup: 'inline',
            group: grp('promo.0', 0, 'event')
          })
        ])
      ),
    rules: ['R2']
  }
]

for (const c of CASES) {
  test(`${c.id}: a broken template turns the label rules red, the fix turns them green`, () => {
    const broken = c.broken()
    assert.deepEqual(broken.failing, c.rules)
    assert.equal(broken.holds, true, 'a new release is held')
    assert.deepEqual(c.fixed().failing, [])
  })
}

test('H5 and H7: a hole with no door holds coverage-holes until it is a slot or accepted with a reason', () => {
  const part = hole({
    value: 'Open daily until late',
    class: 'capture',
    evidence: 'posts#97.post_content (contains)'
  })
  assert.equal(holesState([part]), true)
  assert.equal(holesState([{ ...part, accepted: 'Template part text with no write door yet.' }]), false)
  assert.equal(holesState([]), false)
})

test('H8 has no verdict piece: the release sweep detects it, and the patch release page names that check', () => {
  assert.match(PATCH, /heights/)
  assert.match(HOLES, /### H8\./)
})

test('every recipe has its four parts, and SKILL.md and the fix map lead to them from the red code', () => {
  for (let n = 1; n <= 14; n++) {
    const body = HOLES.split(new RegExp(`^### H${n}\\. `, 'm'))[1]?.split(/^### H\d\. |^## /m)[0] ?? ''
    assert.ok(body, `recipe H${n} is missing`)
    for (const part of ['**Confirm.**', '**Fix.**', '**Verify.**'])
      assert.ok(body.includes(part), `H${n} lacks ${part}`)
  }
  assert.match(SKILL, /coverage-holes\.md`?\]?\(references\/coverage-holes\.md\) section 6/)
  assert.match(FIXMAP, /recipes H1, H2, H5, H7, H9, H10, H11 of section 6/)
  assert.match(FIXMAP, /recipes H1 to H6, H12 to H14 of section 6/)
  for (const code of ['coverage-holes', 'coverage-labels', 'coverage-judge']) assert.ok(SKILL.includes(code))
})

/** The demo words Customize (ABOUT-2) counts in a template part: named blocks whose text is prose no contract slot targets. */
const demoWordsOf = (part) =>
  namedLeafTexts(part)
    .filter((b) => isProse(b.text))
    .map((b) => b.name)
const LINK = '<a href="#" title="Get Directions">Get Directions</a>'

test('H14: a contact-shaped text in a template part paragraph that also holds a link is demo words nothing rewrites; a token in its own named paragraph is not', () => {
  const para = (inner, name) =>
    `<!-- wp:paragraph {"metadata":{"name":"${name}"}} -->\n<p>${inner}</p>\n<!-- /wp:paragraph -->`
  // broken: the address and the link share one named paragraph (the capture skips it: inline markup with a link)
  const broken = para(`<span>12 Example Road, Sometown</span><br>${LINK}`, 'footer.place.text')
  assert.deepEqual(demoWordsOf(broken), ['footer.place.text'])
  // half fixed: the address is a token but the link label still makes the named paragraph prose
  const half = para(`<span>{contact.address}</span><br>${LINK}`, 'footer.place.text')
  assert.deepEqual(demoWordsOf(half), ['footer.place.text'])
  // fixed: the named paragraph holds the token only, the link label sits in an unnamed paragraph (Tracy's)
  const fixed = `${para('<span>{contact.address}</span>', 'footer.place.text')}\n<!-- wp:paragraph -->\n<p>${LINK}</p>\n<!-- /wp:paragraph -->`
  assert.deepEqual(demoWordsOf(fixed), [])
})

test('the recipes carry no Diner-only wording as a rule', () => {
  const section = HOLES.split('## 6. Recipes by symptom')[1] ?? ''
  assert.doesNotMatch(section, /wp-ja-diner|joomlart\.com/)
})
