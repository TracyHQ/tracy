import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { renderedUnits, unitParts } from '../src/host/html-units.mjs'
import {
  RECEIPT_MAX_BYTES,
  REPLACE_CALL,
  REPLACE_CONFIRM_OVER,
  REPLACE_KEYS,
  REPLACE_MAX_TARGETS,
  REPLACE_NEXT,
  REPLACE_WHERE,
  RESTORE_LEAF_MAX,
  clip,
  confirmKey,
  dryRunAnswer,
  followHref,
  hitRank,
  isFact,
  isPhone,
  locate,
  locateAll,
  matchUnits,
  occurrences,
  leadLeftovers,
  phoneOccurrences,
  planReplace,
  plannedWrites,
  rawSpan,
  receipt,
  replaceText,
  restoreOf,
  splitTwoLines,
  spliceRaw,
  undoOf,
  views,
  wouldOf
} from '../src/host/replace.mjs'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const FIXTURES = new URL('./fixtures/replace/', import.meta.url)
const fixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8')

/** A stored value as an engine builds one. */
const su = (at, raw, extra = {}) => ({ ...views(raw, { decode: extra.decode ?? false }), at, raw, ...extra })

/** A page from a snippet. */
const pageOf = (html) => renderedUnits(`<html lang="en"><body>${html}</body></html>`)

/** A store with one value per visible link or block of a page, anchored to exactly that block */
function identityStore(page) {
  const stored = []
  page.units.forEach((u, k) => {
    if (u.hidden || u.region === 'drawer' || u.attr) return
    const parts = unitParts(u)
    parts.forEach((part, j) =>
      stored.push({ ...su(parts.length > 1 ? `u${k}.${j}` : `u${k}`, part.text), region: u.region, src: u })
    )
  })
  return { stored, hooks: { anchor: (h, o) => h.unit.src === o.unit } }
}

const run = (params, page, stored, extra = {}) => {
  const plan = planReplace(params)
  assert.equal(plan.ok, true, JSON.stringify(plan))
  return locateAll({ plan, page, stored, ...extra })
}

// ── parameters ────────────────────────────────────────────────────────────────────────────────────

test('planReplace: the defaults, and the closed key set is exactly the schema', () => {
  // test-quality: contract the closed key set is the public schema of content.replace; a key added or dropped must be a deliberate edit here
  assert.deepEqual(REPLACE_KEYS, [
    'find',
    'replace',
    'path',
    'where',
    'at',
    'all',
    'changes',
    'dryRun',
    'restore',
    'expect',
    'href'
  ])
  assert.deepEqual(REPLACE_WHERE, ['topbar', 'header', 'main', 'footer', 'title'])
  assert.deepEqual(planReplace({ find: '  See our capabilities ', replace: 'Get a free quote' }), {
    ok: true,
    mode: 'replace',
    changes: [{ find: 'See our capabilities', replace: 'Get a free quote' }],
    path: '/',
    where: null,
    at: null,
    all: false,
    dryRun: false,
    expect: null,
    normalized: []
  })
  const p = planReplace({
    changes: [
      { find: 'a1b', replace: 'x' },
      { find: 'c2d', replace: '' }
    ],
    path: '/en/',
    where: 'Footer',
    all: 'page',
    expect: 2,
    dryRun: true
  })
  assert.equal(p.ok, true)
  assert.equal(p.where, 'footer')
  assert.equal(p.all, 'page')
  assert.equal(p.changes.length, 2)
})

test('planReplace: every shape mistake is BAD_PARAMS with the path, the rule and a one-line fix', () => {
  const bad = (params, param, nextHas) => {
    const r = planReplace(params)
    assert.equal(r.ok, false, JSON.stringify(params))
    assert.equal(r.code, 'BAD_PARAMS')
    assert.equal(r.param, param, JSON.stringify(r))
    assert.ok(r.error.length <= 160 && r.next.length <= 200, JSON.stringify(r))
    // every slot filled at the real call site; `{find:"…"}` examples are calls, not slots
    assert.doesNotMatch(`${r.error} ${r.next}`, /\{[a-zA-Z]+\}/, JSON.stringify(r))
    if (nextHas) assert.match(r.next, nextHas)
  }
  bad(null, 'params')
  bad('find', 'params')
  bad({ find: 'a1b', replace: 'x', from: 'y' }, 'from', /tracy_site content\.replace \{find/)
  bad({ find: 'a1b', replace: 'x', dry_run: true }, 'dry_run', /send dryRun instead of dry_run/)
  bad({ find: 'a1b', replace: 'x', Where: 'footer' }, 'Where', /send where instead/)
  bad({ changes: [{ find: 'a1b', replace: 'x', where: 'footer' }] }, 'changes[0].where')
  bad({ replace: 'x' }, 'find', /find:"<the old words/)
  bad({ find: 'a1b' }, 'replace')
  bad({ find: 42, replace: 'x' }, 'find')
  bad({ find: ' … ', replace: 'x' }, 'find')
  bad({ find: 'x'.repeat(501), replace: 'y' }, 'find')
  bad({ find: 'a1b', replace: 'y'.repeat(2001) }, 'replace')
  bad({ find: 'a1b', replace: 'x\u0007y' }, 'replace')
  bad({ find: 'Same words', replace: 'Same words' }, 'replace', /the NEW words/)
  // Only the ENDS differ: not compared, so nothing would change — and the next says a space left where
  // words were removed is harmless, instead of "send the NEW words" (round 7: a trim after a removal).
  bad(
    { find: 'Same words', replace: ' Same words ' },
    'replace',
    /a space left where words were removed is harmless/
  )
  // W3: find+replace beside changes is merged (its own test below); a lone find or replace is no pair.
  bad({ replace: 'x', changes: [{ find: 'c', replace: 'd' }] }, 'changes', /inside changes/)
  bad({ find: 'a1b', changes: [{ find: 'c', replace: 'd' }] }, 'changes', /inside changes/)
  bad({ find: 'C', replace: 'x', changes: [{ find: 'c', replace: 'd' }] }, 'find', /send one change/)
  bad(
    {
      find: 'w20x',
      replace: 'y',
      changes: Array.from({ length: 20 }, (_, i) => ({ find: `w${i}x`, replace: 'y' }))
    },
    'changes'
  )
  bad({ changes: [] }, 'changes')
  bad({ changes: Array.from({ length: 21 }, (_, i) => ({ find: `w${i}x`, replace: 'y' })) }, 'changes')
  bad(
    {
      changes: [
        { find: 'News', replace: 'a' },
        { find: ' news ', replace: 'b' }
      ]
    },
    'changes[1].find'
  )
  bad({ find: 'a1b', replace: 'x', path: 'about' }, 'path')
  bad({ find: 'a1b', replace: 'x', path: '//evil.test/x' }, 'path')
  bad({ find: 'a1b', replace: 'x', where: 'menu' }, 'where', /"header" or "topbar"/)
  bad({ find: 'a1b', replace: 'x', where: 'drawer' }, 'where')
  bad({ find: 'a1b', replace: 'x', at: [] }, 'at')
  bad({ find: 'a1b', replace: 'x', at: [7] }, 'at')
  bad({ find: 'a1b', replace: 'x', all: 'site' }, 'all', /all:"page" for this page only/)
  bad({ find: 'a1b', replace: 'x', all: true, at: ['u1'] }, 'at', /send one of them/)
  bad({ find: 'a1b', replace: 'x', expect: 0 }, 'expect')
  bad({ find: 'a1b', replace: 'x', expect: 2.5 }, 'expect')
  bad({ find: 'a1b', replace: 'x', dryRun: 'yes' }, 'dryRun')
  bad({ restore: [{ at: 'site#hotline', value: 'x' }], find: 'y' }, 'restore', /restore:\[\{at, value\}\]/)
  bad({ restore: [] }, 'restore')
  bad({ restore: [{ at: 'site#hotline', value: 'x', why: 'y' }] }, 'restore[0].why')
  bad({ restore: [{ at: '', value: 'x' }] }, 'restore[0].at')
  bad({ restore: [{ at: 'a', value: 'x'.repeat(RESTORE_LEAF_MAX + 1) }] }, 'restore[0].value')
})

test('find+replace beside changes is merged into them, once, and said in normalized', () => {
  const merged = /** @type {any} */ (
    planReplace({
      find: 'Hotline',
      replace: 'Phone',
      changes: [{ find: '8 800 550-67-89', replace: '0909 123 456' }]
    })
  )
  assert.equal(merged.ok, true, JSON.stringify(merged))
  assert.deepEqual(merged.changes, [
    { find: '8 800 550-67-89', replace: '0909 123 456' },
    { find: 'Hotline', replace: 'Phone' }
  ])
  assert.deepEqual(merged.normalized, ['find/replace merged into changes as changes[1]'])
  // The same pair already in changes (another case, other spacing): sent once.
  const dup = /** @type {any} */ (
    planReplace({ find: ' hotline ', replace: 'Phone', changes: [{ find: 'Hotline', replace: 'Phone' }] })
  )
  assert.equal(dup.ok, true, JSON.stringify(dup))
  assert.deepEqual(dup.changes, [{ find: 'Hotline', replace: 'Phone' }])
  assert.deepEqual(dup.normalized, ['find/replace is changes[0]: sent once'])
  // The same words with other new words: which one is meant is the model's to say.
  const clash = /** @type {any} */ (
    planReplace({ find: 'Hotline', replace: 'Call us', changes: [{ find: 'Hotline', replace: 'Phone' }] })
  )
  assert.equal(clash.code, 'BAD_PARAMS')
  assert.equal(clash.param, 'find')
  assert.equal(clash.error, 'find "Hotline" is also changes[0].find, with other new words')
})

test('NOT_FOUND sends to page.text, then this replace quoting exactly — and says only a NOT_FOUND needs a read', () => {
  const next = replaceText('notFoundNext', { page: '/about', word: 'Hotline' })
  assert.equal(
    next,
    'page.text {path:"/about", match:"Hotline"}, then this replace quoting those words exactly; only a NOT_FOUND needs a read.'
  )
})

test('planReplace: a lone `at` string is one place, corrected and said; restore goes alone', () => {
  const p = planReplace({ find: 'Careers', replace: 'Jobs', at: 'menu:topbar[3]' })
  assert.deepEqual(p.at, ['menu:topbar[3]'])
  assert.equal(p.normalized.length, 1)
  assert.deepEqual(planReplace({ restore: [{ at: 'site#hotline', value: '8 800 550-67-89' }], path: '/' }), {
    ok: true,
    mode: 'restore',
    restore: [{ at: 'site#hotline', value: '8 800 550-67-89' }],
    path: '/',
    dryRun: false,
    normalized: []
  })
})

// ── matching ──────────────────────────────────────────────────────────────────────────────────────

test('views map every folded character back to its exact raw span: entities, NBSP, U+2011, quotes, soft hyphen', () => {
  const raw = 'Mon&ndash;Fri,&nbsp;9:00–18:00 “R&amp;D” non\u2011stop co\u00adop'
  const v = views(raw)
  assert.equal(v.cased, 'Mon-Fri, 9:00-18:00 "R&D" non-stop coop')
  const m = matchUnits([v], 'mon-fri, 9:00-18:00')
  assert.equal(m.hits.length, 1)
  assert.deepEqual(rawSpan(v, m.hits[0]), [0, 'Mon&ndash;Fri,&nbsp;9:00–18:00'.length])
  const q = matchUnits([v], '"R&D" non-stop').hits[0]
  assert.equal(raw.slice(...rawSpan(v, q)), '“R&amp;D” non\u2011stop')
  assert.equal(raw.slice(...rawSpan(v, matchUnits([v], 'coop').hits[0])), 'co\u00adop')
})

test('occurrences: word bounded, and never inside an address the words are not', () => {
  assert.deepEqual(occurrences('news & newsletter', 'news'), [[0, 4]])
  assert.deepEqual(occurrences('write to info@northgate-ind.ru now', 'northgate'), [])
  assert.deepEqual(occurrences('northgate, info@northgate-ind.ru', 'northgate'), [[0, 9]])
  assert.deepEqual(occurrences('mail info@northgate-ind.ru', 'info@northgate-ind.ru'), [[5, 26]])
  assert.deepEqual(occurrences('see northgate-ind.ru/about', 'northgate'), [])
})

test('phone numbers are found by their digits, in any grouping, never inside a longer number', () => {
  const v = views('Hotline: 8\u00a0800 550-67-90 · fax 8 800 550 67 901')
  const hits = phoneOccurrences(v, '8 800 550-67-90')
  assert.equal(hits.length, 1)
  assert.equal(v.cased.slice(...hits[0]), '8 800 550-67-90')
  assert.equal(phoneOccurrences(views('Call (8) 800-550-67-90 today'), '8 800 550 67 90').length, 1)
  assert.equal(isPhone('0909 123 456'), true)
  assert.equal(isPhone('9:00–18:00'), false)
  assert.equal(isPhone('380+'), false)
  const m = matchUnits([views('Hotline: 8 800 550 67 90')], '8 800 550-67-90')
  assert.equal(m.mode, 'phone')
  assert.equal(m.hits[0].caseExact, false) // another grouping: not spelled exactly
})

test('matchUnits: a priced amount of two digits is found inside a dish heading, never inside a longer one', () => {
  const units = [views('Baked Squid $56'), views('Smoked Venison $560'), views('Ask 56 times')]
  const m = matchUnits(units, '$56')
  assert.equal(m.hits.length, 1)
  assert.equal(m.hits[0].unit.cased, 'Baked Squid $56')
  assert.equal(matchUnits([views('Espresso 9 €')], '9 €').hits.length, 1)
  // A bare two-digit number is still only a whole unit.
  assert.equal(matchUnits(units, '56').hits.length, 0)
})

test('matchUnits tiers: text before glyph before accent-blind; short words only as a whole unit', () => {
  const units = [views('All projects'), views('BÁN XE NỘI THẬT'), views('NG'), views('Ship NG parts')]
  assert.equal(matchUnits(units, 'All projects →').mode, 'glyph')
  assert.deepEqual(matchUnits(units, 'All projects →').glyph, { lead: '', trail: '→' })
  const b = matchUnits(units, 'ban xe noi that')
  assert.equal(b.mode, 'bare')
  assert.equal(b.hits[0].whole, true)
  assert.equal(matchUnits(units, 'NG').hits.length, 1) // "NG" inside "Ship NG parts" is not a match
  assert.equal(matchUnits(units, 'xe').hits.length, 0)
})

test('hit rank: whole and exact → whole → exact inside → inside in another case → accent-blind', () => {
  const [a, b, c, d] = [views('News'), views('NEWS'), views('Latest News here'), views('latest news here')]
  const rank = (u, q) => hitRank(matchUnits([u], q).hits[0])
  assert.deepEqual([rank(a, 'News'), rank(b, 'News'), rank(c, 'News'), rank(d, 'News')], [0, 1, 2, 3])
  assert.equal(hitRank(matchUnits([views('Nội thất')], 'noi that').hits[0]), 4)
})

{
  for (const s of [
    '8 800 550-67-89',
    'sales@northgate-ind.ru',
    'Mon–Fri, 9:00–18:00 (MSK)',
    '© 2026 Northgate Industrial.',
    'https://t.me/northgate'
  ])
    test(`isFact: phone, e-mail, hours, copyright and links are facts; words and an address are not: ${rowName(s)}`, () => {
      assert.equal(isFact(s), true, s)
    })
}

{
  for (const s of ['Selected projects', 'Vorsino Industrial Park, Kaluga Region', 'Established 2004'])
    test(`isFact: phone, e-mail, hours, copyright and links are facts; words and an address are not: ${rowName(s)}`, () => {
      assert.equal(isFact(s), false, s)
    })
}

test('splitTwoLines follows D13 in order: line break, dash, comma or colon, the old ratio', () => {
  const s = (r, a = 'Building the groundwork for', b = 'next-generation plants', o = {}) =>
    splitTwoLines(r, a, b, o)
  assert.deepEqual(s('Built for\nthe way you work'), {
    ok: true,
    a: 'Built for',
    b: 'the way you work',
    by: 'line-break'
  })
  assert.deepEqual(s('Northgate — built to last'), {
    ok: true,
    a: 'Northgate —',
    b: 'built to last',
    by: 'dash'
  })
  assert.deepEqual(
    s('Toyota Hanoi Motors — your dealer', 'Toyota Hanoi Motors', '— your authorised Toyota dealer'),
    {
      ok: true,
      a: 'Toyota Hanoi Motors',
      b: '— your dealer',
      by: 'dash'
    }
  )
  assert.deepEqual(s('Built right, built on time'), {
    ok: true,
    a: 'Built right,',
    b: 'built on time',
    by: 'comma'
  })
  assert.deepEqual(s('Our promise: built on time'), {
    ok: true,
    a: 'Our promise:',
    b: 'built on time',
    by: 'colon'
  })
  // 27 : 22 old parts → the boundary nearest 54 % of the new length
  assert.deepEqual(s('Built for the way you work', undefined, undefined, { mustKeepTwo: true }), {
    ok: true,
    a: 'Built for the',
    b: 'way you work',
    by: 'words'
  })
})

test('splitTwoLines: one word keeps one line where the store allows it, is two-lines on sealed Joomla, and parts fit their limits', () => {
  assert.deepEqual(splitTwoLines('Welcome', 'Old line one', 'old two'), {
    ok: true,
    a: 'Welcome',
    b: '',
    by: 'one-line'
  })
  assert.deepEqual(splitTwoLines('Welcome', 'Old line one', 'old two', { mustKeepTwo: true }), {
    ok: false,
    rule: 'two-lines'
  })
  // the nearest boundary would give a 16-char line 1; a limit of 12 moves the cut
  const r = splitTwoLines('Industrial parks built for tomorrow', 'Building the', 'groundwork for plants', {
    mustKeepTwo: true,
    maxA: 12
  })
  assert.equal(r.ok, true)
  assert.ok(r.a.length <= 12, r.a)
  assert.equal(`${r.a} ${r.b}`, 'Industrial parks built for tomorrow')
  assert.deepEqual(splitTwoLines('x'.repeat(80), 'a b', 'c', { maxA: 74, maxB: 64 }), {
    ok: false,
    rule: 'max-characters',
    limit: 74,
    part: 'a'
  })
})

// ── locate ────────────────────────────────────────────────────────────────────────────────────────

const HOME = `
<div class="tb-topbar"><ul><li><a href="tel:88005506790">Hotline: 8 800 550-67-90</a></li><li><a href="mailto:sales@northgate-ind.ru">sales@northgate-ind.ru</a></li>
<nav class="nav"><ul><li><a href="/careers">Careers</a></li></ul></nav></div>
<header><div class="brand"><a href="/">Northgate <span>Industrial infrastructure</span></a></div>
<nav class="nav"><ul><li><a href="/news">News</a></li><li><a href="/about">About</a></li></ul></nav></header>
<main><section><h1>Building the groundwork for<br><span>next-generation plants</span></h1>
<p>Design–build main contractor.</p>
<div class="actions"><a class="btn" href="/services">See our capabilities</a> <a class="btn" href="/deck.pdf">Download company profile (PDF)</a></div>
<h2>Selected projects</h2><button type="button">Load more</button><ul class="why"><li>Safety first</li></ul>
<a class="more" href="/projects">All projects →</a></section></main>
<footer><nav class="nav"><ul><li><a href="/news">News</a></li><li><a href="/careers">Careers</a></li></ul></nav>
<p>8 800 550-67-90</p><h3>Company</h3><p>© 2026 Northgate Industrial JSC. Template running on Joomla.</p></footer>`

test('locate: the presence rule — a stored value counts only where the page shows it WHOLE', () => {
  const page = pageOf(HOME)
  const stored = [su('article-555.1', 'Industrial infrastructure for the Volga region', { region: 'main' })]
  const r = locate({
    page,
    stored,
    change: { find: 'Industrial infrastructure', replace: 'Trusted since 2004' }
  })
  assert.equal(r.code, 'NOT_EDITABLE')
  assert.equal(r.unchanged[0].where, 'header')
  assert.match(r.next, /tell the customer .* that is an answer/)
})

test('locate: two places and no where/at/all → AMBIGUOUS, nothing written, each place with its at', () => {
  const page = pageOf(HOME)
  const stored = [
    su('menu:topbar[0]', 'Careers', { region: 'topbar' }),
    su('menu:footer[1]', 'Careers', { region: 'footer' })
  ]
  const r = locate({ page, stored, change: { find: 'Careers', replace: 'Jobs' } })
  assert.equal(r.code, 'AMBIGUOUS')
  assert.deepEqual(
    r.candidates.map((c) => [c.at, c.where]),
    [
      ['menu:topbar[0]', 'topbar'],
      ['menu:footer[1]', 'footer']
    ]
  )
  assert.match(r.next, /at:\["menu:topbar\[0\]"\]/)
  assert.match(r.next, /all:"page"/)
  // the customer's place decides; `at` from the answer decides
  assert.equal(
    locate({ page, stored, change: { find: 'Careers', replace: 'Jobs' }, where: 'footer' }).targets[0].at,
    'menu:footer[1]'
  )
  assert.equal(
    locate({ page, stored, change: { find: 'Careers', replace: 'Jobs' }, at: ['menu:topbar[0]'] }).targets[0]
      .at,
    'menu:topbar[0]'
  )
  assert.equal(locate({ page, stored, change: { find: 'Careers', replace: 'Jobs' }, all: 'page' }).places, 2)
  // both places named in `at` are chosen, not ambiguous: the next offers "one or more" (pilot 23/10/2026)
  const both = locate({
    page,
    stored,
    change: { find: 'Careers', replace: 'Jobs' },
    at: ['menu:topbar[0]', 'menu:footer[1]']
  })
  assert.equal(both.places, 2, JSON.stringify(both).slice(0, 200))
})

test('locate: where names a place the words are not → NOT_FOUND with where they are', () => {
  const page = pageOf(HOME)
  const stored = [su('module-438.2', 'Company', { region: 'footer' })]
  const r = locate({ page, stored, change: { find: 'Company', replace: 'Our company' }, where: 'header' })
  assert.equal(r.code, 'NOT_FOUND')
  assert.deepEqual(r.seenIn, ['footer', 'main']) // the whole "Company" first, "Download company profile" after
  assert.match(r.next, /where:"footer"/)
})

test('locate: at names places that no longer hold the words → STORE_CHANGED (state: the same call once without at)', () => {
  const page = pageOf(HOME)
  const r = locate({
    page,
    stored: [su('menu:topbar[0]', 'Jobs')],
    change: { find: 'Careers', replace: 'Work' },
    at: ['menu:topbar[0]']
  })
  assert.equal(r.code, 'STORE_CHANGED')
  assert.match(r.next, /the same call once without at/)
})

test('locate: NOT_FOUND names what is near, and the page.text road with one word to match', () => {
  const page = pageOf(HOME)
  const stored = [su('module-443.0', 'Selected projects', { region: 'main' })]
  const r = locate({ page, stored, change: { find: 'Our selected projects', replace: 'x' } })
  assert.equal(r.code, 'NOT_FOUND')
  assert.deepEqual(r.near, ['Selected projects'])
  assert.match(r.next, /^page\.text \{path:"\/", match:"selected"\}/)
})

test('locate: unless all, only the best rank is written; the rest are named in alsoIn', () => {
  const page = pageOf('<main><h2>News</h2><p>Latest News from the plant</p></main>')
  const stored = [
    su('a', 'News', { region: 'main' }),
    su('b', 'Latest News from the plant', { region: 'main' })
  ]
  const r = locate({ page, stored, change: { find: 'News', replace: 'Insights' } })
  assert.equal(r.verdict, 'WRITE')
  assert.deepEqual(
    r.targets.map((t) => t.at),
    ['a']
  )
  assert.deepEqual(
    r.alsoIn.map((x) => x.at),
    ['b']
  )
})

test('all never writes a case-blind hit inside a longer text, nor an accent-blind one', () => {
  const page = pageOf('<main><h2>Northgate</h2><p>NORTHGATE INDUSTRIAL JSC</p></main>')
  const stored = [
    su('a', 'Northgate', { region: 'main' }),
    su('b', 'NORTHGATE INDUSTRIAL JSC', { region: 'main' })
  ]
  const r = locate({ page, stored, change: { find: 'Northgate', replace: 'Acme' }, all: true, expect: 1 })
  assert.equal(r.verdict, 'WRITE')
  assert.deepEqual(
    r.targets.map((t) => t.at),
    ['a']
  )
  assert.deepEqual(
    r.alsoIn.map((x) => x.at),
    ['b']
  )
  const accents = locate({
    page: null,
    stored: [su('c', 'Nội thất', { region: 'main' })],
    change: { find: 'noi that', replace: 'x' },
    all: true
  })
  assert.equal(accents.code, 'NOT_FOUND')
  assert.match(accents.next, /find:"Nội thất"/)
})

test('accent-blind hits: one whole-unit target is written and said; two are NOT_FOUND with the exact spelling', () => {
  const page = pageOf('<header><a>BÁN XE NỘI THẬT</a></header><title>x</title>')
  const one = locate({
    page,
    stored: [su('site#brand_name', 'BÁN XE NỘI THẬT', { region: 'header' })],
    change: { find: 'ban xe noi that', replace: 'Nội thất Việt' }
  })
  assert.equal(one.verdict, 'WRITE')
  assert.match(one.notes.join(' '), /accents ignored/)
  const two = locate({
    page: null,
    stored: [su('site#brand_name', 'BÁN XE NỘI THẬT'), su('settings.title', 'Bán xe nội thật')],
    change: { find: 'ban xe noi that', replace: 'x' }
  })
  assert.equal(two.code, 'NOT_FOUND')
  assert.match(two.error, /other accents/)
})

test('confirm-count: all over five places, or not spelled exactly, needs expect or an earlier dryRun', () => {
  const stored = Array.from({ length: REPLACE_CONFIRM_OVER + 1 }, (_, i) =>
    su(`p${i}`, `Hotline: 8 800 550-67-90 (${i})`)
  )
  const change = { find: '8 800 550-67-90', replace: '0909 123 456' }
  const r = locate({ page: null, stored, change, all: true })
  assert.equal(r.code, 'VALUE_NOT_ALLOWED')
  assert.equal(r.rule, 'confirm-count')
  assert.equal(r.would.length, 6)
  assert.match(r.next, /expect:6/)
  assert.equal(locate({ page: null, stored, change, all: true, expect: 6 }).verdict, 'WRITE')
  assert.equal(locate({ page: null, stored, change, all: true, confirmed: true }).verdict, 'WRITE')
  assert.equal(locate({ page: null, stored, change, all: true, dryRun: true }).verdict, 'WRITE')
  assert.equal(locate({ page: null, stored, change, all: true, expect: 5 }).code, 'COUNT_MISMATCH')
  // two places, one in another grouping: not exact → confirm too
  const grouped = [su('a', '8 800 550-67-90'), su('b', '8 800 550 67 90')]
  assert.equal(locate({ page: null, stored: grouped, change, all: true }).rule, 'confirm-count')
  assert.equal(locate({ page: null, stored: grouped.slice(0, 1), change, all: true }).verdict, 'WRITE')
})

test('TOO_MANY: all over the cap is refused with the first places listed', () => {
  const stored = Array.from({ length: REPLACE_MAX_TARGETS + 1 }, (_, i) =>
    su(`p${i}`, 'Call sales@northgate-ind.ru')
  )
  const r = locate({
    page: null,
    stored,
    change: { find: 'sales@northgate-ind.ru', replace: 'hello@example.vn' },
    all: true,
    expect: 41
  })
  assert.equal(r.code, 'TOO_MANY')
  assert.equal(r.would.length, REPLACE_MAX_TARGETS)
})

test('cannot-empty: a whole heading, list item, button or link is never left without words; a paragraph or part of a link may be', () => {
  const page = pageOf(HOME)
  const { stored, hooks } = identityStore(page)
  const empty = (find) => locate({ page, stored, hooks, change: { find, replace: '' } })
  assert.equal(empty('Selected projects').rule, 'cannot-empty')
  assert.equal(empty('Safety first').rule, 'cannot-empty')
  assert.equal(empty('Load more').rule, 'cannot-empty')
  assert.match(empty('Download company profile (PDF)').error, /the whole link/)
  assert.equal(empty('Design–build main contractor.').verdict, 'WRITE')
  assert.equal(empty('(PDF)').verdict, 'WRITE')
})

test('a heading on two lines is ONE place: WRITE_SPLIT, split by D13, and the occurrence is not reported unchanged', () => {
  const page = pageOf(HOME)
  const stored = [
    su('module-441.1', 'Building the groundwork for', { record: 'module-441', region: 'main', max: 74 }),
    su('module-441.2', 'next-generation plants', { record: 'module-441', region: 'main', max: 64 })
  ]
  const change = {
    find: 'Building the groundwork for next-generation plants',
    replace: 'Built for the way you work'
  }
  const r = locate({ page, stored, change, mustKeepTwo: true })
  assert.equal(r.verdict, 'WRITE_SPLIT')
  assert.deepEqual(r.targets[0].parts, { a: 'Built for the', b: 'way you work', by: 'words' })
  assert.deepEqual(r.unchanged, [])
  assert.match(r.notes.join(' '), /split between words into "Built for the" \/ "way you work"/)
  assert.deepEqual(
    plannedWrites([r]).map((w) => [w.at, w.value]),
    [
      ['module-441.1', 'Built for the'],
      ['module-441.2', 'way you work']
    ]
  )
  assert.equal(
    locate({ page, stored, change: { ...change, replace: 'Welcome' }, mustKeepTwo: true }).rule,
    'two-lines'
  )
  assert.equal(locate({ page, stored, change: { ...change, replace: '' } }).rule, 'cannot-empty')
  assert.equal(
    locate({ page, stored, change: { ...change, replace: 'x'.repeat(75) + ' y' }, mustKeepTwo: true }).rule,
    'max-characters'
  )
})

test('an arrow the template prints is matched past, and left out of what is written', () => {
  const page = pageOf(HOME)
  const r = locate({
    page,
    stored: [su('site#all_projects_label', 'All projects', { region: 'main' })],
    change: { find: 'All projects →', replace: 'Our work →' }
  })
  assert.equal(r.verdict, 'WRITE')
  assert.deepEqual(
    plannedWrites([r]).map((w) => w.value),
    ['Our work']
  )
  assert.match(r.notes.join(' '), /"→"/)
})

test('a door with a length limit refuses the words that would not fit, before any write', () => {
  const page = pageOf(HOME)
  const r = locate({
    page,
    stored: [su('module-443.0', 'Selected projects', { region: 'main', max: 20 })],
    change: { find: 'Selected projects', replace: 'Projects we are proud of' }
  })
  assert.equal(r.rule, 'max-characters')
  assert.equal(r.limit, 20)
})

test('text-only mode: no page read, places decided from the stores and their regions, and said', () => {
  const stored = [su('a', 'Careers', { region: 'topbar' }), su('b', 'Careers', { region: 'footer' })]
  assert.equal(locate({ page: null, stored, change: { find: 'Careers', replace: 'Jobs' } }).code, 'AMBIGUOUS')
  const r = locate({ page: null, stored, change: { find: 'Careers', replace: 'Jobs' }, where: 'footer' })
  assert.deepEqual(
    r.targets.map((t) => [t.at, t.rendered]),
    [['b', null]]
  )
  assert.match(r.notes[0], /could not be read/)
  // all:"page" is offered only when every place was read on the page
  assert.match(locate({ page: null, stored, change: { find: 'Careers', replace: 'Jobs' } }).next, /all:true/)
})

test("The language rule: a fact reaches every language served, words only the page's own", () => {
  const vi = su('site@vi#hotline', 'Đường dây nóng: 8 800 550-67-90', { lang: 'vi' })
  const fr = su('site@fr#hotline', 'Ligne directe : 8 800 111-22-33', { lang: 'fr' })
  const en = su('site@en#hotline', 'Hotline: 8 800 550-67-90', { lang: 'en', region: 'topbar' })
  const hooks = { twins: (u) => (u.at === en.at ? [vi, fr] : []) }
  const page = pageOf(
    '<div class="topbar"><a>Hotline: 8 800 550-67-90</a></div><main><h2>Selected projects</h2></main>'
  )
  const fact = locate({
    page,
    stored: [en],
    hooks,
    change: { find: '8 800 550-67-90', replace: '0909 123 456' }
  })
  assert.equal(fact.scope, 'every')
  assert.deepEqual(
    fact.targets[0].twins.map((t) => t.unit.at),
    ['site@vi#hotline']
  )
  assert.equal(fact.languagesKept, 1)
  assert.equal(fact.places, 1) // one place, reached in two languages
  assert.deepEqual(
    plannedWrites([fact]).map((w) => [w.at, w.value]),
    [
      ['site@en#hotline', 'Hotline: 0909 123 456'],
      ['site@vi#hotline', 'Đường dây nóng: 0909 123 456']
    ]
  )
  assert.equal(wouldOf(fact.targets[0], fact.change).languages, 2)
  const words = locate({
    page,
    stored: [su('home@en#projects', 'Selected projects', { lang: 'en', region: 'main' })],
    hooks: { twins: () => [su('home@fr#projects', 'Selected projects', { lang: 'fr' })] },
    change: { find: 'Selected projects', replace: 'Featured projects' }
  })
  assert.equal(words.scope, 'page')
  assert.deepEqual(words.targets[0].twins, [])
  // words not on this page: only the page's language is a candidate…
  const site = [
    su('about@en#h', 'Our story', { lang: 'en', region: 'main' }),
    su('about@fr#h', 'Our story', { lang: 'fr', region: 'main' })
  ]
  assert.deepEqual(
    locate({ page, stored: site, change: { find: 'Our story', replace: 'Who we are' } }).targets.map(
      (t) => t.at
    ),
    ['about@en#h']
  )
  // …unless the customer said everywhere
  assert.equal(
    locate({ page, stored: site, change: { find: 'Our story', replace: 'Who we are' }, all: true }).places,
    2
  )
})

test('a language copy the engine also lists as a place of its own is written once, not twice', () => {
  const en = su('module-428.1', 'Hotline: 8 800 550-67-90', { lang: 'en', region: 'topbar' })
  const ru = su('module-448.1', 'Горячая линия: 8 800 550-67-90', { lang: 'ru', region: 'topbar' })
  const r = locate({
    page: null,
    stored: [en, ru],
    hooks: { twins: (u) => (u === en ? [ru] : [en]) },
    change: { find: '8 800 550-67-90', replace: '0909 123 456' },
    all: true
  })
  assert.equal(r.verdict, 'WRITE')
  assert.deepEqual(
    r.targets.map((x) => x.twins.length),
    [0, 0]
  )
  assert.deepEqual(
    plannedWrites([r]).map((w) => w.value),
    ['Hotline: 0909 123 456', 'Горячая линия: 0909 123 456']
  )
})

test('an accent-blind whole-unit write reads right in the receipt: the whole unit before, the new words after', () => {
  const page = pageOf('<header><a>BÁN XE NỘI THẬT</a></header>')
  const r = locate({
    page,
    stored: [su('site#brand_name', 'BÁN XE NỘI THẬT', { region: 'header', max: 20 })],
    change: { find: 'ban xe noi that', replace: 'Nội thất Việt' }
  })
  assert.equal(r.verdict, 'WRITE')
  assert.deepEqual(wouldOf(r.targets[0], r.change), {
    at: 'site#brand_name',
    where: 'header',
    before: 'BÁN XE NỘI THẬT',
    after: 'Nội thất Việt'
  })
  assert.deepEqual(
    plannedWrites([r]).map((w) => w.value),
    ['Nội thất Việt']
  )
})

test('every refusal locate returns fits T10 with its slots filled, on real calls', () => {
  const page = pageOf(HOME)
  const { stored, hooks } = identityStore(page)
  const split = [
    su('module-441.1', 'Building the groundwork for', { record: 'module-441', region: 'main', max: 74 }),
    su('module-441.2', 'next-generation plants', { record: 'module-441', region: 'main', max: 64 })
  ]
  const many = Array.from({ length: 41 }, (_, i) => su(`p${i}`, `Call 8 800 550-67-90 (${i})`))
  const long = 'Q'.repeat(400)
  const calls = [
    { page, stored, hooks, change: { find: 'Careers', replace: 'Jobs' } },
    { page, stored, hooks, change: { find: long, replace: 'x' } },
    { page, stored, hooks, change: { find: 'Company', replace: 'x' }, where: 'topbar' },
    {
      page,
      stored,
      hooks,
      change: { find: 'Careers', replace: 'x' },
      at: Array.from({ length: 20 }, (_, i) => `post:${i}#${'b'.repeat(150)}`)
    },
    {
      page,
      stored: [su('article-555.1', 'Industrial infrastructure for the Volga region')],
      change: { find: 'Industrial infrastructure', replace: 'x' }
    },
    { page, stored, hooks, change: { find: 'Selected projects', replace: '' } },
    {
      page,
      stored: split,
      change: { find: 'Building the groundwork for next-generation plants', replace: 'Welcome' },
      mustKeepTwo: true
    },
    {
      page,
      stored: split,
      change: { find: 'Building the groundwork for next-generation plants', replace: `${'x'.repeat(75)} y` },
      mustKeepTwo: true
    },
    { page: null, stored: many, change: { find: '8 800 550-67-90', replace: '0909 123 456' }, all: true },
    {
      page: null,
      stored: many.slice(0, 6),
      change: { find: '8 800 550-67-90', replace: '0909 123 456' },
      all: true
    },
    {
      page: null,
      stored: many.slice(0, 6),
      change: { find: '8 800 550-67-90', replace: '0909 123 456' },
      all: true,
      expect: 2
    },
    {
      page: null,
      stored: [su('a', 'Nội thất'), su('b', 'Nội thất xanh')],
      change: { find: 'noi that', replace: 'x' }
    },
    {
      page: null,
      stored: [su('a', 'Selected projects', { max: 10 })],
      change: { find: 'Selected projects', replace: 'Projects we are proud of' }
    },
    {
      page: pageOf('<main><p>Elena Gurova · IR Director</p></main>'),
      stored: [su('templatePart-123456.content.blocks.12.inner', 'Elena Gurova · IR Director')],
      hooks: { anchor: () => false },
      change: { find: 'Elena Gurova · IR Director', replace: 'x' }
    }
  ]
  const codes = new Set()
  for (const input of calls) {
    const r = locate(input)
    assert.equal(r.ok, false, JSON.stringify(input.change))
    codes.add(r.rule ? `${r.code}:${r.rule}` : r.code)
    assert.ok(r.error.length <= 160, r.error)
    assert.ok(r.next.length <= 200, r.next)
    assert.doesNotMatch(`${r.error} ${r.next}`, /\{[a-zA-Z]+\}/, `${r.error} | ${r.next}`)
  }
  assert.deepEqual([...codes].sort(), [
    'AMBIGUOUS',
    'COUNT_MISMATCH',
    'NOT_EDITABLE',
    'NOT_FOUND',
    'STORE_CHANGED',
    'TOO_MANY',
    'VALUE_NOT_ALLOWED:cannot-empty',
    'VALUE_NOT_ALLOWED:confirm-count',
    'VALUE_NOT_ALLOWED:max-characters',
    'VALUE_NOT_ALLOWED:two-lines'
  ])
})

test('a writable stored place that holds the words but missed the anchor is named, never "do not look for another way in"', () => {
  const page = pageOf('<main><p>Elena Gurova · IR Director</p></main>')
  const stored = [su('module-860.1', 'Elena Gurova · IR Director', { label: 'Investors - IR contact (en)' })]
  const change = { find: 'Elena Gurova · IR Director', replace: 'Sanne de Vries · eigenaar' }
  const held = locate({ page, stored, change, hooks: { anchor: () => false } })
  assert.equal(held.code, 'NOT_EDITABLE')
  assert.notEqual(held.next, REPLACE_NEXT.notEditableNext)
  assert.match(held.next, /at:\["module-860\.1"\]/)
  assert.deepEqual(held.held, [{ at: 'module-860.1', label: 'Investors - IR contact (en)' }])
  // the place it names is a place the same call writes
  const named = locate({ page, stored, change, hooks: { anchor: () => false }, at: ['module-860.1'] })
  assert.equal(named.verdict, 'WRITE')
  assert.equal(named.targets[0].at, 'module-860.1')
  // a place nobody may write keeps the plain answer
  const locked = locate({
    page,
    stored: [su('module-860.1', 'Elena Gurova · IR Director', { writable: false, why: 'a locked line' })],
    change,
    hooks: { anchor: () => false }
  })
  assert.equal(locked.code, 'NOT_EDITABLE')
  assert.equal(locked.held, undefined)
  assert.equal(locked.next, replaceText('notEditableNext', { why: locked.unchanged[0].why }))
})

test('all:true adds the places this page does not show; all:"page" keeps to this page', () => {
  const page = pageOf('<div class="topbar"><a>Hotline: 8 800 550-67-90</a></div>')
  const stored = [
    su('topbar', 'Hotline: 8 800 550-67-90', { region: 'topbar' }),
    su('contact-page', '8 800 550-67-90', { region: 'main' })
  ]
  const change = { find: '8 800 550-67-90', replace: '0909 123 456' }
  const everywhere = locate({ page, stored, change, all: true })
  assert.deepEqual(
    everywhere.targets.map((t) => [t.at, t.rendered]),
    [
      ['topbar', true],
      ['contact-page', false]
    ]
  )
  assert.equal(wouldOf(everywhere.targets[1], change).onPage, false)
  assert.deepEqual(
    locate({ page, stored, change, all: 'page' }).targets.map((t) => t.at),
    ['topbar']
  )
  assert.equal(
    locate({ page: pageOf('<main><p>x</p></main>'), stored, change, all: 'page' }).code,
    'NOT_FOUND'
  )
})

test('locateAll: one call, every change located; the count rules over the whole call; overlapping changes refused', () => {
  const page = pageOf(HOME)
  const { stored, hooks } = identityStore(page)
  const r = run(
    {
      changes: [
        { find: '8 800 550-67-90', replace: '0909 123 456' },
        { find: 'sales@northgate-ind.ru', replace: 'hello@example.vn' }
      ],
      all: true
    },
    page,
    stored,
    { hooks }
  )
  assert.equal(r.ok, true)
  assert.deepEqual(
    r.results.map((x) => x.places),
    [2, 1]
  )
  const over = run(
    {
      changes: [
        { find: 'Download company profile (PDF)', replace: 'a' },
        { find: 'company profile', replace: 'b' }
      ]
    },
    page,
    stored,
    { hooks }
  )
  assert.equal(over.code, 'BAD_PARAMS')
  assert.equal(over.change, 1)
  const counted = run(
    {
      changes: [
        { find: '8 800 550-67-90', replace: '0909 123 456' },
        { find: 'sales@northgate-ind.ru', replace: 'hello@example.vn' }
      ],
      all: true,
      expect: 2
    },
    page,
    stored,
    { hooks }
  )
  assert.equal(counted.code, 'COUNT_MISMATCH')
  assert.equal(counted.count, 3)
  const second = run(
    {
      changes: [
        { find: 'Selected projects', replace: 'a' },
        { find: 'Careers', replace: 'Jobs' }
      ]
    },
    page,
    stored,
    { hooks }
  )
  assert.equal(second.code, 'AMBIGUOUS')
  assert.equal(second.change, 1)
})

test('confirmKey: the same words and scope give the same key, whatever the key order or case of find', () => {
  const a = planReplace({ find: 'Hotline', replace: 'Call us', all: true })
  const b = planReplace({ all: true, replace: 'Call us', find: 'HOTLINE ' })
  assert.equal(confirmKey(a), confirmKey(b))
  assert.notEqual(confirmKey(a), confirmKey(planReplace({ find: 'Hotline', replace: 'Call us' })))
})

test('plannedWrites splices right to left into the exact raw bytes, several changes into one value', () => {
  const unit = su(
    'post:42#p3',
    'Call 8&nbsp;800&nbsp;550-67-90 or write to sales@northgate-ind.ru &amp; more',
    { decode: true }
  )
  const r = locateAll({
    plan: planReplace({
      changes: [
        { find: '8 800 550-67-90', replace: '0909 123 456' },
        { find: 'sales@northgate-ind.ru', replace: 'hello@example.vn' }
      ]
    }),
    page: null,
    stored: [unit]
  })
  const writes = plannedWrites(r.results)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].value, 'Call 0909 123 456 or write to hello@example.vn &amp; more')
  assert.equal(writes[0].before, unit.raw)
  assert.throws(
    () =>
      spliceRaw('abcdef', [
        { s: 1, e: 3, text: 'x' },
        { s: 2, e: 4, text: 'y' }
      ]),
    /overlapping/
  )
})

test('the undo restores the exact prior value — a round trip is byte-identical, never the clipped receipt text', () => {
  const long = `${'Long stored paragraph with "quotes" & entities &amp; NBSP\u00a0here. '.repeat(6)}Hotline: 8 800 550-67-90.`
  const unit = su('home#intro', long)
  const r = locate({
    page: null,
    stored: [unit],
    change: { find: '8 800 550-67-90', replace: '0909 123 456' }
  })
  const writes = plannedWrites([r])
  const restore = restoreOf(writes)
  assert.equal(restore[0].value, long)
  assert.ok(wouldOf(r.targets[0], r.change).before.length <= 160)
  // applying the undo to the written value gives back every byte
  const back = new Map(restore.map((x) => [x.at, x.value]))
  assert.equal(back.get('home#intro'), unit.raw)
  const undo = undoOf({ platform: 'emdash', restore })
  assert.deepEqual(undo, {
    action: 'content.replace',
    params: { restore: [{ at: 'home#intro', value: long }] }
  })
  assert.equal(planReplace(undo.params).ok, true) // the undo is a valid call as given
  const big = undoOf({
    platform: 'emdash',
    restore: [{ at: 'post#body', value: 'x'.repeat(RESTORE_LEAF_MAX + 1) }]
  })
  assert.deepEqual(big.params, { restore: [] })
  assert.match(big.note, /revision_restore then content_publish for post#body/)
  assert.deepEqual(undoOf({ platform: 'wordpress', applyId: 'replace-1' }), {
    action: 'apply.revert',
    params: { apply_id: 'replace-1' }
  })
  assert.match(undoOf({ platform: 'joomla', applyId: 'contract-replace-1' }).note, /LATEST apply/)
})

test('a receipt with places left out says so in next, with all:true; one without keeps the plain receipt', () => {
  const undo = undoOf({ platform: 'emdash' })
  const changed = [
    { at: 'site/site@en#hotline', where: 'footer', before: '8 800 550-67-89', after: '0909 123 456' }
  ]
  const left = receipt({
    platform: 'emdash',
    path: '/',
    changed,
    alsoIn: [{ at: 'site/site@en#topbar_phone', where: 'topbar', text: 'Hotline: 8 800 550-67-89' }],
    undo
  })
  assert.equal(left.next, REPLACE_NEXT.receiptAlsoIn)
  assert.match(left.next, /all:true/)
  assert.equal(receipt({ platform: 'emdash', path: '/', changed, undo }).next, REPLACE_NEXT.receipt)
})

test('the receipt stays under 2 KB, cut from the least useful end, and never cuts the undo', () => {
  const changed = Array.from({ length: 12 }, (_, i) => ({
    at: `module-${400 + i}.1`,
    where: 'footer',
    label: `[Tracy Business] Footer - Contacts (${i})`,
    before: `Hotline: 8 800 550-67-90 — a long line of words around the number ${i}`,
    after: `Hotline: 0909 123 456 — a long line of words around the number ${i}`
  }))
  const undo = undoOf({ platform: 'wordpress', applyId: 'replace-mfz3k2-9a1c7e' })
  const out = receipt({
    platform: 'wordpress',
    path: '/',
    applyId: 'replace-mfz3k2-9a1c7e',
    changed,
    unchanged: [{ text: 'x', where: 'main', why: 'y' }],
    alsoIn: [{ at: 'a', where: 'main', text: 'b' }],
    undo
  })
  assert.ok(new TextEncoder().encode(JSON.stringify(out)).length <= RECEIPT_MAX_BYTES)
  assert.deepEqual(out.undo, undo)
  // The list is cut for size; the sentence that other places still hold the words is not.
  assert.equal(out.next, REPLACE_NEXT.receiptAlsoIn)
  assert.ok(out.more > 0)
  assert.equal('alsoIn' in out, false)
  const small = receipt({
    platform: 'joomla',
    path: '/en/',
    applyId: 'contract-replace-1',
    changed: changed.slice(0, 2),
    undo
  })
  assert.equal(small.changed[0].label, changed[0].label)
})

test('a dryRun answer lists what would change and names the call that makes it, with expect under all', () => {
  const page = pageOf(HOME)
  const { stored, hooks } = identityStore(page)
  const r = run({ find: '8 800 550-67-90', replace: '0909 123 456', all: true, dryRun: true }, page, stored, {
    hooks
  })
  const out = dryRunAnswer({ platform: 'joomla', path: '/en/', results: r.results, all: true })
  assert.equal(out.dryRun, true)
  assert.equal(out.count, 2)
  assert.deepEqual(
    out.would.map((w) => w.where),
    ['topbar', 'footer']
  )
  assert.equal(out.would[0].after, 'Hotline: 0909 123 456')
  assert.equal(
    out.next,
    'Nothing was written. To make exactly these changes: the same call without dryRun, with expect:2.'
  )
})

test('followHref: tel: and mailto: follow the fact they carry, nothing else does', () => {
  assert.equal(followHref('tel:88005506790', '8 800 550-67-90', '0909 123 456'), 'tel:0909123456')
  assert.equal(followHref('tel:+78005506790', '8 800 550-67-90', '0909 123 456'), null)
  assert.equal(
    followHref('mailto:Sales@northgate-ind.ru?subject=Hi', 'sales@northgate-ind.ru', 'hello@example.vn'),
    'mailto:hello@example.vn?subject=Hi'
  )
  assert.equal(followHref('/contact', 'sales@northgate-ind.ru', 'hello@example.vn'), null)
})

test('clip keeps the change in view and marks what it cut', () => {
  const t = `${'a'.repeat(200)}CHANGE${'b'.repeat(200)}`
  const c = clip(t, 200, 206, 60)
  assert.ok(c.includes('CHANGE') && c.startsWith('…') && c.endsWith('…'))
  assert.equal(c.length, 60)
  assert.equal(clip('short', 0, 5), 'short')
})

test('every sentence fits T10 on its worst case: error ≤ 160, next ≤ 200, English, the call named once', () => {
  const worst = {
    find: 'x'.repeat(120),
    replace: 'y'.repeat(120),
    near: 'z'.repeat(120),
    exact: 'e'.repeat(120),
    word: 'w'.repeat(30),
    got: `"${'g'.repeat(29)}…"`,
    param: 'restore[39].value',
    key: 'k'.repeat(120),
    path: `/${'p'.repeat(120)}`,
    page: `/${'p'.repeat(59)}`,
    where: 'footer',
    seen: 'topbar, header, main, footer',
    region: 'topbar',
    n: 40,
    list: 'topbar, header, main, footer, title',
    at: 'post:1234#blocks[12].innerHTML',
    allForm: '"page"',
    why: 'a mega-menu caption from the template navigation file (locked)',
    expect: 40,
    max: REPLACE_MAX_TARGETS,
    how: REPLACE_NEXT.confirmCountHow,
    thing: 'list item',
    what: 'a line of that heading',
    len: 2000,
    limit: 2000,
    i: 19,
    j: 20,
    allowed: REPLACE_KEYS.join(', '),
    want: `a list of 1 to ${REPLACE_MAX_TARGETS} {at, value}`,
    example: '{find:"<old words>", replace:"<new words>"}',
    with: 'changes',
    regions: REPLACE_WHERE.map((r) => `"${r}"`).join(', '),
    glyph: '→',
    a: 'a'.repeat(120),
    b: 'b'.repeat(120),
    by: 'between words',
    expectHint: ', with expect:40'
  }
  for (const key of Object.keys(REPLACE_NEXT)) {
    const text = replaceText(key, worst)
    const limit = key.endsWith('Error') ? 160 : 200
    assert.ok(text.length <= limit, `${key} is ${text.length} chars: ${text}`)
    assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, `${key} left a slot unfilled`)
    assert.doesNotMatch(text, /cowork/i, `${key}: model-facing text says "component"`)
    assert.doesNotMatch(text, /[À-ỹ]/, `${key} must be English`)
  }
  assert.equal(REPLACE_CALL, 'tracy_site content.replace')
  assert.ok(
    Object.values(REPLACE_NEXT).every((s) => !s.includes('tracy_site_replace')),
    'the action form ships (D21)'
  )
})

// ── the Joomla 1.2.0 hero heading, from the contract itself ───────────────────────────────────────

test('sealed Joomla tracy-business 1.2.0: the hero H1 is module-441.1 + 441.2 and splits within 74 / 64', () => {
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  const stored = map.slots
    .filter((s) => s.entity === 'module-441' && s.type === 'text' && s.sample !== '')
    .map((s) => su(s.key, s.sample, { record: s.entity, region: 'main', max: s.maxCharacters }))
  const page = renderedUnits(fixture('pages/joomla-home.html'))
  const r = locate({
    page,
    stored,
    change: {
      find: 'Building the groundwork for next-generation plants',
      replace: 'Built for the way you work'
    },
    mustKeepTwo: true
  })
  assert.equal(r.verdict, 'WRITE_SPLIT')
  assert.equal(r.targets[0].at, 'module-441.1+module-441.2')
  assert.deepEqual(r.targets[0].parts, { a: 'Built for the', b: 'way you work', by: 'words' })
  assert.equal(r.targets[0].where, 'main')
})

const HELDOUT = JSON.parse(fixture('heldout.json'))

test('held-out set: 78 asks over the three bench sites, each tied to its suite-v3 oracle', () => {
  assert.equal(HELDOUT.cases.length, 78)
  assert.deepEqual(Object.keys(HELDOUT.sites), ['benchjoomla01', 'benchwp01', 'benchemdash01'])
  for (const c of HELDOUT.cases) {
    const finds = c.call.changes ? c.call.changes.map((x) => x.find) : [c.call.find]
    const gone = c.oracle.home?.gone ?? c.oracle.about?.gone ?? []
    // the call changes the oracle's own target: what must go is among the words found
    for (const g of gone) assert.ok(finds.includes(g), `${c.case} ${c.site}: "${g}" is not asked for`)
  }
})

{
  for (const c of HELDOUT.cases)
    test(`held-out: every ask of the three bench sites gets the verdict and the places its page decides, and a write stays within the receipt budget: ${rowName(c)}`, () => {
      const label = `${c.case} on ${c.site} ${c.path}: ${JSON.stringify(c.call).slice(0, 90)}`
      const page = renderedUnits(fixture(c.page))
      const { stored, hooks } = identityStore(page)
      const plan = planReplace(c.call)
      assert.equal(plan.ok, true, `${label} ${JSON.stringify(plan)}`)

      const r = locateAll({ plan, page, stored, hooks })

      const want = c.pageSays
      const block = (occ) => occ.unit.chain.find((el) => !el.inline)?.tag ?? ''
      if (want.verdict === 'WRITE') {
        assert.equal(r.ok, true, `${label} ${JSON.stringify(r).slice(0, 600)}`)
        const places = r.results.flatMap((x) => x.targets.map((t) => [t.where, t.occ ? block(t.occ) : '']))
        assert.deepEqual(places, want.places, label)
        // what is written holds the new words and none of the old ones
        for (const w of plannedWrites(r.results)) {
          const change = r.results.find((x) => x.targets.some((t) => t.at === w.at)).change
          if (change.replace)
            assert.ok(w.value.includes(change.replace.split('\n')[0]), `${label} ${w.value}`)
          const [was, now] = [views(change.find).lower, views(change.replace).lower]
          if (!now.includes(was)) assert.ok(!views(w.value).lower.includes(was), `${label} ${w.value}`)
        }
        const out = receipt({
          platform: HELDOUT.sites[c.site].platform,
          path: c.path,
          applyId: 'replace-test',
          changed: r.results.flatMap((x) => x.targets.map((t) => wouldOf(t, x.change))),
          undo: undoOf({
            platform: HELDOUT.sites[c.site].platform,
            applyId: 'replace-test',
            restore: restoreOf(plannedWrites(r.results))
          })
        })
        assert.ok(
          JSON.stringify(out).length <= RECEIPT_MAX_BYTES,
          `${label} receipt ${JSON.stringify(out).length} chars`
        )
      } else {
        assert.equal(r.ok, false, label)
        assert.equal(r.code, want.verdict, `${label} ${JSON.stringify(r).slice(0, 400)}`)
        if (want.rule) assert.equal(r.rule, want.rule, label)
        if (want.verdict === 'AMBIGUOUS')
          assert.deepEqual(
            [...new Map(r.candidates.map((x) => [x.at, x.where])).values()],
            want.places.map(([w]) => w),
            label
          )
      }
    })
}

test('a find that opens with + or ( owns the stored one, so the replace never prints it twice', () => {
  const v = views('Call · +7 843 200 45 67 · fax (843) 200 45 68')
  const plus = phoneOccurrences(v, '+7 843 200 45 67')
  assert.equal(v.cased.slice(...plus[0]), '+7 843 200 45 67')
  const paren = phoneOccurrences(v, '(843) 200 45 68')
  assert.equal(v.cased.slice(...paren[0]), '(843) 200 45 68')
  // without the plus in find, the stored one stays outside the span (unchanged behaviour)
  assert.equal(v.cased.slice(...phoneOccurrences(v, '7 843 200 45 67')[0]), '7 843 200 45 67')
  const m = matchUnits([v], '+7 843 200 45 67')
  assert.equal(m.mode, 'phone')
  assert.equal(m.hits[0].caseExact, true)
  // find opens with + but the page stores no plus: the span stays on the digits
  const bare = views('Tel 7 843 200 45 67')
  assert.equal(bare.cased.slice(...phoneOccurrences(bare, '+7 843 200 45 67')[0]), '7 843 200 45 67')
})

test('a bulk change lists the places that still open with the shared lead words', () => {
  const unit = (/** @type {string} */ at, /** @type {string} */ text) => ({
    ...views(text),
    at,
    raw: text,
    region: ['main'],
    writable: true
  })
  const units = [
    unit('a', 'Timeline: 8–14 weeks for roofs'),
    unit('b', 'Timeline: 6 weeks for HVAC'),
    unit('c', 'Timeline: 10 weeks for building services'),
    unit('d', 'Our timeline is short')
  ]
  const changes = [
    { find: 'Timeline: 8–14 weeks', replace: 'Timeline: 6 weeks' },
    { find: 'Timeline: 6 weeks', replace: 'Timeline: 4 weeks' }
  ]
  // c was dropped from the call: it is listed, with what it still says; d does not open with the lead
  const left = leadLeftovers(changes, /** @type {any} */ (units), ['a', 'b'])
  assert.equal(left?.opening, 'timeline:')
  assert.deepEqual(
    left?.places.map((x) => x.at),
    ['c']
  )
  // one change, or finds with no shared opening, say nothing
  assert.equal(leadLeftovers(changes.slice(0, 1), /** @type {any} */ (units), []), null)
  assert.equal(
    leadLeftovers(
      [
        { find: 'Roofs', replace: 'x' },
        { find: 'Walls', replace: 'y' }
      ],
      /** @type {any} */ (units),
      []
    ),
    null
  )
  // nothing left: no key at all
  assert.equal(leadLeftovers(changes, /** @type {any} */ (units), ['a', 'b', 'c']), null)
})

// Local round 20, 25/10/2026: a WordPress build swapped a template photo by its file path, read the words answer as
// "read the page again" and never reached the block that holds it.
test('locate: a picture’s file asked as words is sent to the block that holds it, never to page.text', () => {
  const page = pageOf(HOME)
  const stored = [su('module-438.2', 'Company', { region: 'footer' })]
  const r = locate({
    page,
    stored,
    change: {
      find: '/wp-content/uploads/2026/10/intro-3-1.jpg',
      replace: '/wp-content/uploads/tracy-content/a.jpg'
    }
  })
  assert.equal(r.code, 'NOT_FOUND')
  assert.match(r.next, /^A picture is not words/)
  assert.match(r.next, /content\.update \{kind:"post", id, blocks:/)
  assert.doesNotMatch(r.next, /page\.text/)
  const words = locate({ page, stored, change: { find: 'Nowhere words', replace: 'x' } })
  assert.match(words.next, /^page\.text/)
})
