import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clusterFindings, clustersMarkdown, escapeMd, parseLabel, repeatKey, sharedTextChains, writeClusters } from '../visual/cluster.mjs'

const pm = (element, ...deltas) => ({ kind: 'parity-mismatch', element, deltas: deltas.map(([property, expected, observed]) => ({ property, expected, observed })) })
const page = (id, axes) => ({ id, axes: Object.entries(axes).map(([variant, findings]) => ({ variant, findings, accepted: [] })) })
const openOf = (r) => r.clusters.filter((c) => c.status === 'open')
const WHITE = 'rgb(241, 243, 246)'
const BLUE = 'rgb(59, 139, 255)'

test('cluster: a label splits into tag, classes and words; anything else is not a label', () => {
  assert.deepEqual(parseLabel('h3.card__title.wp-block-post-title "Say \\"hi\\" twice"'), { tag: 'h3', classes: ['card__title', 'wp-block-post-title'], text: 'Say \\"hi\\" twice', selector: 'h3.card__title.wp-block-post-title' })
  assert.equal(parseLabel('a ""').selector, 'a')
  assert.equal(parseLabel('.site-header > nav a'), null)
  assert.equal(parseLabel(undefined), null)
})

// The measured case (JA Vega M4c dd-1): one card-title colour on many pages and several tiers is ONE
// fix, however many cards each page lists and whatever words each card says.
test('cluster: same selector + property + expected→actual across pages and tiers is one cluster; the words do not split it', () => {
  const pages = [
    page('en-blog', { '1440-dark': [pm('h3.card__title "Alpha"', ['color', WHITE, BLUE]), pm('h3.card__title "Beta"', ['color', WHITE, BLUE])] }),
    page('en-portfolio', { '1440-dark': [pm('h3.card__title "Gamma"', ['color', WHITE, BLUE])], '390-dark': [pm('h3.card__title "Gamma"', ['color', WHITE, BLUE])] })
  ]
  const r = clusterFindings(pages)
  assert.equal(r.totals.findings, 4)
  assert.equal(r.totals.clusters, 1)
  const [c] = openOf(r)
  assert.equal(c.size, 4)
  assert.deepEqual(c.pages, ['en-blog', 'en-portfolio'])
  assert.deepEqual(c.axes, ['1440-dark', '390-dark'])
  assert.equal(c.selector, 'h3.card__title')
  assert.equal(c.property, 'color')
  assert.equal(c.expected, WHITE)
  assert.equal(c.observed, BLUE)
  assert.equal(c.representative, 'en-blog', 'the page with the most members, ties by id')
})

test('cluster: a different property, value, kind or selector context is a different cluster; 400 and "400" stay apart', () => {
  const pages = [
    page('p', {
      d: [
        pm('h3.card__title "A"', ['color', WHITE, BLUE]),
        pm('h3.card__title "B"', ['color', WHITE, 'rgb(0, 0, 0)']),
        pm('h3.card__title "C"', ['background-color', WHITE, BLUE]),
        pm('h3.hero__title "D"', ['color', WHITE, BLUE]),
        { kind: 'rule-mismatch', element: 'h3.card__title "E"', deltas: [{ property: 'color', expected: WHITE, observed: BLUE }] },
        pm('p.x "F"', ['font-weight', 400, 500]),
        pm('p.x "G"', ['font-weight', '400', '500'])
      ]
    })
  ]
  const r = clusterFindings(pages)
  assert.equal(r.totals.clusters, 7)
  assert.ok(openOf(r).every((c) => c.size === 1))
})

test('cluster: ids do not depend on the order of pages, axes or findings', () => {
  const a = page('en-a', { l: [pm('p.x "1"', ['color', WHITE, BLUE]), { kind: 'image-missing', source: 3, site: 2 }] })
  const b = page('en-b', { l: [pm('p.x "2"', ['color', WHITE, BLUE])], d: [{ kind: 'unclassified-element', element: 'a "Blogs"' }] })
  const ids = (pages) => openOf(clusterFindings(pages)).map((c) => `${c.id}:${c.size}`).sort()
  const reversed = { ...b, axes: [...b.axes].reverse() }
  assert.deepEqual(ids([a, b]), ids([reversed, a]))
  const first = openOf(clusterFindings([a, b])).find((c) => c.selector === 'p.x')
  const second = openOf(clusterFindings([reversed, a])).find((c) => c.selector === 'p.x')
  assert.deepEqual(first.members.map((m) => m.key), second.members.map((m) => m.key), 'members are listed in a fixed order too')
})

test('cluster: a finding with several deltas sits in several clusters; a duplicate finding is two members', () => {
  const twice = pm('a.more "Read"', ['color', WHITE, BLUE], ['font-size', '16px', '24px'])
  const r = clusterFindings([page('p', { d: [twice, { ...twice }] })])
  assert.equal(r.totals.findings, 2)
  assert.equal(r.totals.units, 4)
  assert.equal(r.totals.inMoreThanOneCluster, 2)
  assert.equal(r.totals.clusters, 2)
  for (const c of openOf(r)) {
    assert.equal(c.size, 2)
    assert.deepEqual(c.members.map((m) => m.key), ['p|d|findings#0', 'p|d|findings#1'])
  }
  assert.deepEqual(openOf(r).map((c) => c.members[0].delta).sort(), [0, 1])
})

// The link inside a card title has the title's words and the title's wrong colour: it is the same
// fix, but the label does not PROVE the link sits in the heading. Joined only when unambiguous.
test('cluster: the shared-text chain joins a bare link to the classed element right before it — from the real producer', async () => {
  const { parityByText } = await import('../visual/visual-qa.mjs')
  const white = { color: WHITE }
  const blue = { color: BLUE }
  const site = [
    { tag: 'h3', cls: 'card__title', text: 'Card one', styles: blue, place: 1 },
    { tag: 'a', cls: '', text: 'Card one', styles: blue, place: 1 },
    { tag: 'h3', cls: 'card__title', text: 'Card two', styles: blue, place: 2 },
    { tag: 'a', cls: '', text: 'Card two', styles: blue, place: 2 }
  ]
  const produced = parityByText(site, { 'Card one': [{ tag: 'h3', styles: white }], 'Card two': [{ tag: 'h3', styles: white }] }, { properties: ['color'], hexTolerance: 0, pxTolerance: 1 })
  assert.equal(produced.findings.length, 4, JSON.stringify(produced.findings))
  const r = clusterFindings([page('en-blog', { '1440-dark': produced.findings }), page('en-news', { '1440-dark': produced.findings })])
  assert.equal(r.totals.clusters, 1)
  const [c] = openOf(r)
  assert.equal(c.size, 8)
  assert.equal(c.inference, 'shared-text-chain')
  assert.deepEqual(c.viaSelectors, ['a'])
  assert.equal(c.members.filter((m) => m.via === 'a').length, 4)
  assert.equal(r.totals.inferred, 4)
})

test('cluster: an independent link, another delta, a link with no classed element before it, or cut-off words that collide stay apart', () => {
  const d = ['color', WHITE, BLUE]
  // words differ
  assert.equal(sharedTextChains([pm('h3.card__title "Alpha"', d), pm('a "Read more"', d)]).size, 0)
  // deltas differ
  assert.equal(sharedTextChains([pm('h3.card__title "Alpha"', d), pm('a "Alpha"', ['color', WHITE, 'rgb(0, 0, 0)'])]).size, 0)
  // not adjacent
  assert.equal(sharedTextChains([pm('h3.card__title "Alpha"', d), pm('p.x "Beta"', d), pm('a "Alpha"', d)]).size, 0)
  // the element before is a bare tag too
  assert.equal(sharedTextChains([pm('span "Alpha"', d), pm('a "Alpha"', d)]).size, 0)
  // two titles cut to the same 40 characters: which heading holds which link is not knowable
  const cut = 'The Impact of Cloud Computing on Small B'
  const collide = [pm(`h3.card__title "${cut}"`, d), pm(`a "${cut}"`, d), pm(`h3.card__title "${cut}"`, d), pm(`a "${cut}"`, d)]
  assert.equal(sharedTextChains(collide).size, 0)
  const r = clusterFindings([page('p', { l: collide })])
  assert.deepEqual(openOf(r).map((c) => [c.selector, c.size, c.inference]).sort(), [['a', 2, null], ['h3.card__title', 2, null]])
  // unambiguous: joined
  assert.deepEqual([...sharedTextChains([pm('h3.card__title "Alpha"', d), pm('a "Alpha"', d)]).entries()], [[1, 'h3.card__title']])
})

test('cluster: a finding without a value keeps its words — every bare `a` is not one cluster; scan positions do not split', () => {
  const r = clusterFindings([
    page('en-author', { d: [{ kind: 'unclassified-element', element: 'a "Blogs"' }, { kind: 'unclassified-element', element: 'a "Blogs"' }, { kind: 'unclassified-element', element: 'a "Database Security"' }] }),
    page('en-tag', { d: [{ kind: 'unclassified-element', element: 'a "Blogs"' }, { kind: 'scan:doubled-seam', what: 'h@1375: DIV:bB + DIV:bT' }] }),
    page('en-home', { d: [{ kind: 'scan:doubled-seam', what: 'h@2410: DIV:bB + DIV:bT' }] })
  ])
  const sizes = Object.fromEntries(openOf(r).map((c) => [`${c.kind} ${c.selector}`, c.size]))
  assert.deepEqual(sizes, { 'unclassified-element a "Blogs"': 3, 'unclassified-element a "Database Security"': 1, 'scan:doubled-seam h@*: DIV:bB + DIV:bT': 2 })
})

test('cluster: malformed and unknown input is kept, conservatively, and every finding stays reachable; accepted findings cluster apart', () => {
  assert.throws(() => clusterFindings(null), /pages must be an array/)
  const pages = [
    {
      id: 'p',
      axes: [
        {
          variant: 'd',
          findings: [{ element: 'div "no kind"' }, { kind: 'parity-mismatch', element: 'p.x "bad"', deltas: [{ expected: 1 }] }, { kind: 'parity-mismatch', element: 'p.x "none"', deltas: [] }, { kind: 'novel-kind', whatever: [1, 2] }, null],
          accepted: [{ ...pm('h3.card__title "A"', ['color', WHITE, BLUE]), exception: { reason: 'brand', decision: 'D-1' } }, { ...pm('h3.card__title "B"', ['color', WHITE, BLUE]), exception: { reason: 'brand', decision: 'D-2' } }]
        },
        { variant: 'l' }
      ]
    },
    { id: 'q' }
  ]
  const r = clusterFindings(pages)
  assert.equal(r.totals.findings, 5)
  assert.equal(r.totals.accepted, 2)
  assert.equal(r.totals.clusters, 5, 'a malformed record is its own cluster, never merged by tag')
  assert.equal(r.totals.acceptedClusters, 2, 'two cited decisions are two clusters')
  const keys = new Set(r.clusters.flatMap((c) => c.members.map((m) => m.key)))
  assert.equal(keys.size, 7, 'every finding, open or accepted, is a member somewhere')
  assert.ok(r.clusters.filter((c) => c.status === 'accepted').every((c) => c.decision))
  assert.deepEqual(r.clusters.filter((c) => c.kind === '(no kind)').map((c) => c.size), [1, 1], 'no kind: the div and the null record, each its own record')
})

test('cluster: Markdown cells cannot break the table or inject markup; members are listed on demand', () => {
  assert.equal(escapeMd('a|b\nc `d` <script>'), 'a\\|b c \\`d\\` \\<script\\>')
  const r = clusterFindings([page('en-x', { d: [{ kind: 'unclassified-element', element: 'a "pipe | and `tick` <b>"' }] })])
  const md = clustersMarkdown(r, { at: 'now' })
  const row = md.split('\n').find((l) => l.startsWith(`| ${r.clusters[0].id} |`))
  assert.equal(row.split(/(?<!\\)\|/).length - 2, 10, row)
  assert.doesNotMatch(md, /<b>/)
  assert.match(md, /<details><summary>C-[0-9a-f]{8} — 1 member\(s\)<\/summary>/)
  assert.ok(md.includes('- en-x|d|findings#0 — a "pipe | and \\`tick\\` \\<b\\>"'), 'a member line keeps its pipes (a key copies as written) and still cannot open code or HTML')
})

// The 75 unclassified findings of JA Vega M4c were the same for 9 rounds and were re-read every
// round. Marked, not hidden: they are still counted and still fail the gate.
test('cluster: history marks unchanged findings; new, changed and reappearing ones are not; multiplicity counts', () => {
  const u = (w) => ({ kind: 'unclassified-element', element: `a "${w}"` })
  const run = (name, findings) => ({ run: name, pages: [page('en-a', { '1440-light': findings })] })
  const history = [run('r0', [u('Blogs'), u('Gone')]), run('r1', [u('Blogs'), u('Moved')]), run('r2', [u('Blogs'), pm('p.x "v"', ['color', WHITE, BLUE])])]
  const now = [page('en-a', { '1440-light': [u('Blogs'), u('Blogs'), u('Gone'), pm('p.x "v"', ['color', WHITE, 'rgb(0, 0, 0)']), u('New')] })]
  const r = clusterFindings(now, { history })
  const m = (sel) => r.clusters.find((c) => c.selector === sel).members
  const blogs = m('a "Blogs"')
  assert.deepEqual(blogs.map((x) => [x.unchanged, x.streak]), [[true, 3], [false, 0]], 'the second copy was not there before')
  assert.equal(blogs[0].since, 'r0')
  assert.equal(m('a "Gone"')[0].unchanged, false, 'gone in r1 and r2, back now: reappeared, listed with the rest')
  assert.equal(m('a "New"')[0].unchanged, false)
  assert.equal(m('p.x')[0].unchanged, false, 'a changed value is a new finding')
  assert.equal(r.totals.unchanged, 1)
  assert.equal(r.totals.findings, 5, 'marking never removes a finding')
  assert.ok(!r.clusters.find((c) => c.selector === 'a "Blogs"').unchanged, 'a cluster is unchanged only when all its members are')
  const md = clustersMarkdown(clusterFindings([page('en-a', { '1440-light': [u('Blogs')] })], { history }))
  assert.match(md, /## Unchanged since the last measurement[^\n]*\n\n\| Cluster[^\n]*\n\|---[^\n]*\n\| C-[0-9a-f]{8} \| 1 \| unclassified-element \| a "Blogs" \|[^\n]*unchanged ×3 since r0/)
})

test('cluster: a finding seen before only on another axis is new on this one; a changed actual value without deltas is new', () => {
  const u = { kind: 'unclassified-element', element: 'a "Blogs"' }
  const id = (observed) => ({ kind: 'identity-mismatch', what: 'site title', expected: 'JA Vega', observed })
  const history = [
    { run: 'r0', pages: [page('en-a', { '1440-light': [u, id('JA Vega!')] })] },
    { run: 'r1', pages: [page('en-a', { '1440-light': [u, id('JA Vega!')], '1440-dark': [] })] },
  ]
  const now = [page('en-a', { '1440-light': [u, id('Vega')], '1440-dark': [u] })]
  const r = clusterFindings(now, { history })
  const members = r.clusters.flatMap((c) => c.members)
  const at = (axis, kind) => members.find((x) => x.axis === axis && x.findingKey.includes(kind))
  assert.equal(at('1440-light', 'unclassified').unchanged, true)
  assert.equal(at('1440-light', 'unclassified').streak, 2)
  assert.equal(at('1440-dark', 'unclassified').unchanged, false, 'dark was measured clean in r1 and never had it: a first dark sighting, not a light repeat')
  assert.equal(at('1440-light', 'identity-mismatch').unchanged, false, 'same what and expected, another observed: findingKey would call it the same, the record does not')
  const darkNever = clusterFindings([page('en-a', { '1440-dark': [u] })], { history: [history[0]] })
  assert.equal(darkNever.clusters[0].members[0].unchanged, undefined, 'no earlier dark measurement: nothing is compared')
  assert.equal(darkNever.totals.compared, 0)
  const same = clusterFindings([page('en-a', { '1440-light': [id('JA Vega!')] })], { history })
  assert.equal(same.clusters[0].members[0].unchanged, true, 'the identical record is still recognised')
})

test('cluster: a page the latest run did not measure keeps its older measurement; axis-error is never read as clean; no history marks nothing', () => {
  const u = { kind: 'unclassified-element', element: 'a "Blogs"' }
  const axisError = { kind: 'axis-error', error: 'browser died' }
  const full = { run: 'full', pages: [page('en-a', { l: [u] }), page('en-b', { l: [u] })] }
  const targeted = { run: 'targeted', pages: [page('en-b', { l: [] })] }
  const broken = { run: 'broken', pages: [page('en-a', { l: [axisError] })] }
  const now = [page('en-a', { l: [u] }), page('en-b', { l: [u] }), page('en-c', { l: [u] })]
  const r = clusterFindings(now, { history: [full, targeted, broken] })
  const byPage = Object.fromEntries(r.clusters[0].members.map((x) => [x.page, x.unchanged ?? null]))
  assert.deepEqual(byPage, { 'en-a': true, 'en-b': false, 'en-c': null }, 'en-a: its axis-error run is skipped, the full run counts; en-b: clean in the targeted run; en-c: never measured')
  assert.equal(r.totals.compared, 2)
  const erroredNow = clusterFindings([page('en-a', { l: [u], d: [axisError] })], { history: [full] })
  assert.equal(erroredNow.totals.compared, 1, 'the light axis is compared; only the dark axis-error is not')
  const lightErrored = clusterFindings([page('en-a', { l: [axisError] })], { history: [full] })
  assert.equal(lightErrored.totals.compared, 0, 'an axis with axis-error now is not compared')
  const none = clusterFindings(now)
  assert.equal(none.history, false)
  assert.ok(none.clusters.every((c) => c.members.every((x) => !('unchanged' in x))))
})

test('cluster: an axis-error on one axis drops only that axis from history — a light finding gone in that run and back is not unchanged', () => {
  const u = { kind: 'unclassified-element', element: 'a "Blogs"' }
  const axisError = { kind: 'axis-error', error: 'browser died' }
  const r0 = { run: 'r0', pages: [page('en-a', { l: [u], d: [] })] }
  const r1 = { run: 'r1', pages: [page('en-a', { l: [], d: [axisError] })] }
  const r = clusterFindings([page('en-a', { l: [u], d: [] })], { history: [r0, r1] })
  const m = r.clusters.flatMap((c) => c.members).find((x) => x.axis === 'l')
  assert.equal(m.unchanged, false, 'light was clean in r1 although dark failed there')
  assert.equal(m.streak, 0)
  assert.equal(r.totals.unchanged, 0)
  const dark = clusterFindings([page('en-a', { d: [u] })], { history: [{ run: 'r0', pages: [page('en-a', { d: [u] })] }, r1] })
  assert.equal(dark.clusters[0].members[0].unchanged, true, 'the dark axis-error in r1 is skipped; r0 still counts')
})

test('cluster: an @ in the words or a value is content — only a scan position at the start of `what` is dropped', () => {
  assert.notEqual(repeatKey({ kind: 'unclassified-element', element: 'a "Call @123"' }), repeatKey({ kind: 'unclassified-element', element: 'a "Call @456"' }))
  assert.notEqual(repeatKey({ kind: 'image-missing', observed: 'x@1' }), repeatKey({ kind: 'image-missing', observed: 'x@2' }))
  assert.notEqual(repeatKey({ kind: 'rule', what: 'h@1375: DIV:bB' }), repeatKey({ kind: 'rule', what: 'h@1415: DIV:bB' }), 'not a scan kind')
  assert.equal(repeatKey({ kind: 'scan:doubled-seam', what: 'h@1375: DIV:bB + DIV:bT' }), repeatKey({ kind: 'scan:doubled-seam', what: 'h@1415: DIV:bB + DIV:bT' }))
  assert.notEqual(repeatKey({ kind: 'scan:doubled-seam', what: 'h@1375: DIV "a@1"' }), repeatKey({ kind: 'scan:doubled-seam', what: 'h@1375: DIV "a@2"' }), 'later @ in a scan row is content')
  const u = (t) => ({ kind: 'unclassified-element', element: `a "Call @${t}"` })
  const r = clusterFindings([page('en-a', { l: [u(456)] })], { history: [{ run: 'r0', pages: [page('en-a', { l: [u(123)] })] }] })
  assert.equal(r.clusters[0].members[0].unchanged, false)
  assert.equal(r.clusters.length, 1)
  const two = clusterFindings([page('en-a', { l: [u(123), u(456)] })])
  assert.equal(two.clusters.length, 2, 'different words after @ are different findings')
})

test('cluster: writeClusters writes clusters.json with every member and clusters.md largest first', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'cluster-'))
  const pages = [page('en-a', { d: [pm('h3.t "A"', ['color', WHITE, BLUE]), pm('h3.t "B"', ['color', WHITE, BLUE]), pm('p.x "C"', ['color', WHITE, BLUE])] })]
  const r = writeClusters(out, pages, { at: 'now' })
  const json = JSON.parse(readFileSync(path.join(out, 'clusters.json'), 'utf8'))
  assert.equal(json.at, 'now')
  assert.deepEqual(json.totals, r.totals)
  assert.equal(json.clusters.reduce((n, c) => n + c.members.length, 0), 3)
  const md = readFileSync(path.join(out, 'clusters.md'), 'utf8')
  assert.ok(md.indexOf('| h3.t |') < md.indexOf('| p.x |'), 'largest first')
})
