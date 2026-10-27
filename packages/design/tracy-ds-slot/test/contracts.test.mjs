// Every slot contract under templates/: the fields a build door and the measuring scripts rely on.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { ROLE_VARIABLE_NAMES } from '../src/role-variables.mjs'
import { COLOUR_TOKENS } from '../src/tokens56.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const DIR = join(HERE, '../templates')
const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
const raw = (n) => JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8'))
// ink / on-ink: the EmDash emitter's ink role (#1309), what a band the template paints dark wears
// and every standard role variable, which every emitter writes since 15/10/2026 (role-values.test.mjs): the
// accent band and its words, the status pairs (Tracy Business Joomla's info message reads info-text on info-bg)
const ROLES = new Set([
  ...COLOUR_TOKENS,
  'accent-text',
  'accent-text-hover',
  'ink',
  'on-ink',
  ...ROLE_VARIABLE_NAMES.filter((n) => n.startsWith('--ds-c-')).map((n) => n.slice('--ds-c-'.length))
])

test('a contract offered to customers says what measured it', () => {
  for (const n of names) {
    const c = raw(n)
    if (c.ready !== true) continue
    assert.equal(typeof c.readyNote, 'string', `${n}: ready without readyNote`)
    assert.match(c.readyNote, /measured/, `${n}: readyNote names no measurement`)
  }
})

test('a contract measured on a page other than the home page names a site path', () => {
  for (const n of names) {
    const p = raw(n).measuredPage
    if (p === undefined) continue
    assert.match(p, /^\/[\w./-]*$/, n)
    assert.doesNotMatch(p, /\.\./, n)
  }
})

// JA Morgan WordPress, 13/10/2026: cardLike ".wp-block-group" rounded every full-width band under Eddie (40px)
test('rounded boxes and labels never name a layout class every section carries', () => {
  const layout = /^\.(wp-block-|container|row$|col-|section|wrapper|inner|content)/
  for (const n of names) {
    const sel = raw(n).selectors ?? {}
    for (const k of ['cardLike', 'pill'])
      for (const s of [sel[k] ?? []].flat()) assert.doesNotMatch(s, layout, `${n}: selectors.${k} ${s}`)
  }
})

test("a template's own variables point at a colour role the slot sets", () => {
  for (const n of names) {
    for (const [k, v] of Object.entries(raw(n).templateVars ?? {})) {
      assert.match(k, /^--[\w-]+$/, `${n}: ${k}`)
      const m = /^var\(--ds-c-([\w-]+)\)$/.exec(v)
      if (m) assert.ok(ROLES.has(m[1]), `${n}: ${k} → unknown role ${m[1]}`)
    }
  }
})

test('an offered contract’s kept bands give back every colour variable the slot repoints', () => {
  for (const n of names) {
    const c = raw(n)
    // a contract not offered yet is work in progress (its notes say what still fails)
    if (c.ready !== true) continue
    if (!c.keepScopes?.length || !c.templateVars || !c.template?.startsWith('joomla/')) continue
    // the colour ones: a kept band resets --ds-c-*, so a variable pointed at one needs its default back
    // (a slot role itself, pointed at another — GK Compact's surface-warm at the accent — is reset with the
    // others inside a kept band)
    // `keepFollows`: variables a kept band whose ground follows the system reads for its words, left to the
    // root's worn value on purpose (Tracy Business Joomla's footer, 15/10/2026), each one named
    const follows = new Set(c.keepFollows ?? [])
    for (const [k, v] of Object.entries(c.templateVars))
      if (/var\(--ds-c-/.test(String(v)) && !k.startsWith('--ds-c-') && !follows.has(k))
        assert.ok(k in (c.keepDefaults ?? {}), `${n}: ${k} missing from keepDefaults`)
    for (const k of follows) {
      assert.ok(k in c.templateVars, `${n}: keepFollows ${k} is not a template variable the slot repoints`)
      assert.ok(!(k in (c.keepDefaults ?? {})), `${n}: keepFollows ${k} is given back too`)
    }
  }
})

test("the Joomla sheet sets a template's own variables when it wears a system", () => {
  const withVars = names.filter((n) => n.startsWith('joomla-') && raw(n).templateVars)
  for (const n of withVars) {
    const c = loadContract(n)
    const r = joomlaSlot(
      loadProfile(ROOT, 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'),
      contractBase(ROOT, c),
      c
    )
    assert.ok(r.css, n)
    for (const [k, v] of Object.entries(c.templateVars)) assert.ok(r.css.includes(`${k}:${v}`), `${n}: ${k}`)
  }
})

test('a contract names a face by the template’s variable, never by its name (15/10/2026)', () => {
  // a family written by name at the slot's weight beats the release's own `:lang(vi)` swap, so a Vietnamese
  // site drew the kept words with fallback marks (JA Resort's photo card, JA Symphony's header): a kept face
  // is the template's variable (T4's --body-font-family, --heading-font-family), which that swap re-points
  const named = []
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`))
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'font-family' && typeof x === 'string' && !/^(var\(|inherit$)/.test(x.trim()))
          named.push(`${at}.${k}: ${x}`)
        else walk(x, `${at}.${k}`)
      }
  }
  for (const n of names) walk(raw(n), n)
  assert.deepEqual(named, [])
})

test('Tracy Base WP: the home plan names keep their text colour, the section eyebrows take the accent', async () => {
  // `.tracy.home .tracy-eyebrow` (accentText, !important) also reached the plan names of the home pricing
  // block, which the template paints in its text colour: olive #7f6f18 under Mailchimp's light side,
  // white under its dark one (15/10/2026)
  const { parseHTML } = await import('linkedom')
  const { document } = parseHTML(
    '<html><body class="tracy home"><section class="tracy-section tracy-plans acm-pricing">' +
      '<div class="tracy-section__head"><p class="tracy-eyebrow" id="head">Pricing</p></div>' +
      '<div class="tracy-plans__grid"><div class="wp-block-group tracy-card tracy-plan">' +
      '<p class="tracy-eyebrow" id="plan">Starter</p></div></div></section></body></html>'
  )
  const c = loadContract('wordpress-tracy-base')
  const hits = (id) =>
    c.selectors.accentText
      .filter((s) => !s.includes('::'))
      .filter((s) => [...document.querySelectorAll(s)].some((el) => el.id === id))
  assert.ok(hits('head').length > 0, 'the section eyebrow is accent text')
  assert.deepEqual(hits('plan'), [], 'a plan name is not accent text')
})

test('Tracy Base WP: a ghost button in an ink band reads on the ink, one on the page keeps the accent text', async () => {
  // `.tracy .wp-block-button.is-style-outline .wp-block-button__link` (accentText, !important) also
  // reached the ghost actions of the scene (ink) band of Home variant and Home variation, which the
  // theme paints with --ds-c-on-ink: Mailchimp's light accent text read 3.30:1 on its ink (15/10/2026)
  const { parseHTML } = await import('linkedom')
  const chapter = (cls, id) =>
    `<section class="tracy-section ${cls}"><div class="wp-block-buttons tracy-actions">` +
    `<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link" id="${id}">Go</a></div>` +
    '</div></section>'
  const page = (hero, chapters) =>
    parseHTML(
      `<html><body class="tracy page-template-page-landing"><main><section class="acm-hero ${hero}"></section>` +
        `<div class="wp-block-post-content">${chapters}</div>` +
        '<section class="tracy-section">' +
        '<div class="wp-block-button is-style-outline"><a class="wp-block-button__link" id="outside">Go</a></div>' +
        '</section></main></body></html>'
    ).document
  const c = loadContract('wordpress-tracy-base')
  const hits = (document, id) =>
    c.selectors.accentText
      .filter((s) => !s.includes('::'))
      .filter((s) => [...document.querySelectorAll(s)].some((el) => el.id === id))
  const centered = page(
    'acm-hero--centered',
    chapter('acm-story-chapter acm-story-chapter--media-right', 'ink')
  )
  assert.deepEqual(hits(centered, 'ink'), [], 'centered hero: every story chapter is ink')
  assert.ok(hits(centered, 'outside').length > 0, 'an outline button on the page is accent text')
  const split = page(
    'acm-hero--split',
    chapter('acm-story-chapter acm-story-chapter--media-left', 'ink') +
      chapter('acm-story-chapter acm-story-chapter--media-right', 'warm')
  )
  assert.deepEqual(hits(split, 'ink'), [], 'split hero: the media-left chapter is ink')
  assert.ok(hits(split, 'warm').length > 0, 'split hero: the media-right chapter is the warm surface')
})

test('Tracy Base WP: the ink-band stop adds no weight, the featured plan button keeps its accent-on words', () => {
  // both rules are !important; the featured plan's followRule outranked the outline accent text by
  // specificity, and a :not() of the ink band without :where() outweighed it: the home "Discuss
  // Studio" read the accent text on the accent fill, 3.80:1 under Mailchimp's light side (16/10/2026)
  const c = loadContract('wordpress-tracy-base')
  const dropWhere = (s) => {
    let out = ''
    for (let i = 0; i < s.length; i++) {
      if (!s.startsWith(':where(', i)) {
        out += s[i]
        continue
      }
      let depth = 0
      for (i += ':where'.length; i < s.length; i++) {
        if (s[i] === '(') depth++
        else if (s[i] === ')' && --depth === 0) break
      }
    }
    return out
  }
  // class-level weight (classes, pseudo-classes, attributes), counting a :not()/:is() by its own content
  const weight = (s) =>
    (
      dropWhere(s)
        .replace(/:(not|is|has)\(/g, '(')
        .match(/\.[\w-]+|:[\w-]+|\[[^\]]*\]/g) ?? []
    ).length
  const outline = c.selectors.accentText.find((s) => s.startsWith('.tracy .wp-block-button.is-style-outline'))
  const featured = Object.keys(c.followRules).find((s) => s.includes('.tracy-plan:nth-child(2)'))
  assert.ok(weight(featured) > weight(outline), `${weight(featured)} vs ${weight(outline)}`)
})

test("Tracy Base WP: the landing ink band takes the system's page on a dark side, as the template's dark look does", async () => {
  // a black band on the light page, flush with the black page in the template's dark look; on Moxie's
  // dark side the system's ink is its surface (#1a1a1a, 1.21:1 off the page, GROUND-2, 16/10/2026)
  const { wordpressVariation } = await import('../src/wordpress.mjs')
  const c = loadContract('wordpress-tracy-base')
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const css = JSON.stringify(wordpressVariation(moxie, contractBase(ROOT, c), c).variation)
  const dark = css
    .split('}')
    .filter((r) => r.includes('acm-story-chapter') && r.includes('--ds-c-ink:var(--ds-c-bg)'))
  assert.ok(dark.length > 0, 'the ink band rule is written')
  for (const r of dark) {
    assert.match(r, /data-theme=\\"dark\\"|:not\(\[data-theme\]\)/, 'only on the dark side')
    assert.match(r, /--ds-c-on-ink:var\(--ds-c-fg\)/, 'its words take the page text colour')
  }
  // the light side keeps the system's ink band
  assert.ok(
    !css
      .split('}')
      .some((r) => r.includes('not([data-theme=\\"dark\\"])') && r.includes('--ds-c-ink:var(--ds-c-bg)'))
  )
})

test("a system's button label never outgrows the template's own where the contract measured it (Tracy Business WP under Figma)", async () => {
  const { slotVars, templateSizes } = await import('../src/emit.mjs')
  const figma = loadProfile(ROOT, 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671')
  const free = slotVars(figma, {})['--ds-size-button']
  assert.equal(free, '16px', "Figma's own button label")
  const sizes = templateSizes(loadContract('wordpress-tracy-business'))
  assert.equal(sizes.templateButton, 14)
  assert.equal(slotVars(figma, sizes)['--ds-size-button'], '14px')
  // a contract that measured no button keeps the system's
  assert.equal(templateSizes(loadContract('wordpress-tracy-base')).templateButton, null)
})
