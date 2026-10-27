// Acceptance and decision hygiene (lib/parity-acceptance.mjs), and the http-parity input it guards.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { once } from 'node:events'
import { parseDecisions, readSmallFile, substitutionReport, validateAcceptRows, validateExceptionRows } from '../lib/parity-acceptance.mjs'
import { testDir } from './lib/test-root.mjs'

const DECISIONS = `# Decisions
| Id | Question | Default | Status |
|---|---|---|---|
| D-09 | Joomla orders Trending by hits; WordPress keeps no hit counter | Newest first; the Hits column is not drawn | OPEN |
| D-64 | The source prints "Written by" and "Don't have an account?" chrome | Not drawn | OPEN |
- S-03: 19 articles share an alias across categories
`
const rows = (over = {}) => [{ match: 'Written by', routes: ['/blog/a'], reason: 'view chrome', decision: 'D-64', ...over }]

test('acceptance: an exact-route row citing a decision that names it stands', () => {
  assert.deepEqual(validateAcceptRows(rows(), parseDecisions(DECISIONS)), [])
})

test('acceptance: omitted, empty, wildcard, glob-like and regex-like route scopes are refused', () => {
  const d = parseDecisions(DECISIONS)
  for (const routes of [undefined, [], ['*'], ['/blog/*'], ['/blog/(a|b)'], ['^/blog'], ['blog/a'], 'all', ['/a?x=*'], ['/a?'], ['/a*?x=1'], ['?q=1']]) {
    const errors = validateAcceptRows(rows({ routes }), d)
    assert.ok(errors.length, `scope ${JSON.stringify(routes)} must be refused`)
  }
  // a search page is an exact route with its literal query (ja-restaurant S-35)
  assert.deepEqual(validateAcceptRows(rows({ routes: ['/explore/j-pages/smart-search?q=zqxwv'] }), d).filter((e) => /route/.test(e)), [])
})

test('acceptance: a citation must exist, be unique and be about the accepted key (wrong-citation class)', () => {
  const d = parseDecisions(DECISIONS)
  // the audited defect: footer text accepted citing a hits/ordering decision
  assert.match(validateAcceptRows(rows({ match: 'All rights reserved', decision: 'D-09' }), d).join(), /does not mention "all rights reserved"/)
  assert.match(validateAcceptRows(rows({ decision: 'D-99' }), d).join(), /does not exist/)
  assert.match(validateAcceptRows(rows({ decision: undefined }), d).join(), /needs a decision id/)
  assert.match(validateAcceptRows(rows({ decision: 'D6' }), d).join(), /needs a decision id/)
  // naming the key only in the reason is not enough
  assert.ok(validateAcceptRows(rows({ match: 'Footer links', reason: 'Footer links are chrome', decision: 'D-64' }), d).length)
  const twice = parseDecisions(`${DECISIONS}\n| D-64 | again | x | OPEN |\n`)
  assert.match(validateAcceptRows(rows(), twice).join(), /defined more than once/)
  assert.match(validateAcceptRows(rows(), null).join(), /no decisions were given/)
})

test('acceptance: every alternative of a regex row must be mentioned by the decision', () => {
  const d = parseDecisions(DECISIONS)
  assert.deepEqual(validateAcceptRows(rows({ match: "Written by|Don't have an account" }), d), [])
  assert.ok(validateAcceptRows(rows({ match: 'Written by|Share this article' }), d).length)
})

test('visual exceptions: structured scopes validate dimensions and require a page or route', () => {
  const decisions = parseDecisions('| D-01 | h1 title Foundation heading | OPEN |')
  const row = { kind: 'parity-mismatch', reason: 'approved type size', decision: 'D-01', key: 'Foundation', scope: { pages: ['en-about'], axes: ['desktop-light'], selector: 'h1', text: 'Foundation' } }
  assert.deepEqual(validateExceptionRows([row], decisions), [])
  for (const scope of [
    { pages: [] },
    { routes: ['/about'], unexpected: true },
    { pages: [1] },
    { axes: ['desktop-light'], selector: 'h1' }
  ]) assert.ok(validateExceptionRows([{ ...row, scope }], decisions).length, JSON.stringify(scope))
  assert.match(validateExceptionRows([{ ...row, scope: { pages: ['/about'], properties: [] } }], decisions).join(), /properties.*non-empty|properties.*empty/i)
})

test('decisions: substitutions are classified by a structured declaration; the audited four surface individually', () => {
  const md = `${DECISIONS}
| D-40 | Author cards become post cards [substitution feature=author-cards effect=post-cards class=defect status=open] | applied | OPEN |
| D-41 | Slider becomes stacked images [substitution feature=slider effect=stacked-images class=defect status=open] | applied | OPEN |
| D-42 | Recovery links dropped [substitution feature=recovery-links effect=none class=owner-question status=open] | applied | OPEN |
| D-43 | Filterable list becomes a tag cloud [substitution feature=filterable-list effect=tag-cloud class=owner-question status=owner-approved] | applied | OPEN |
`
  const r = substitutionReport(parseDecisions(md))
  assert.deepEqual(r.substitutions.map((s) => s.feature), ['author-cards', 'slider', 'recovery-links', 'filterable-list'])
  assert.equal(r.blocking, 3 + r.unresolved.length, 'three open; the owner-approved one does not block')
})

test('decisions: an accepted-deviation class, a missing field and an unknown status are refused; a legacy substitution stays unresolved', () => {
  const md = `| D-70 | Slider replaced by stacked images [substitution feature=slider effect=stacked class=accepted status=open] | x | OPEN |
| D-71 | Author listing is drawn as a post query instead of the people grid | applied | OPEN |
| D-72 | Colour tweak, nothing replaced | applied | OPEN |
| D-73 | Slider replaced by stacked images | applied | CLOSED |
| D-74 | Author cards become post cards | applied | CLOSED |
| D-75 | Reading list shown as plain links | applied | CLOSED |
`
  const r = substitutionReport(parseDecisions(md))
  assert.match(r.errors.join(), /D-70.*class/)
  assert.deepEqual(r.unresolved.map((u) => u.id), ['D-71', 'D-73', 'D-74'], 'a legacy substitution is unresolved whatever its status says (CLOSED proves nothing about the feature); a plain one is not')
  assert.ok(r.blocking >= 4)
  const fixed = substitutionReport(parseDecisions('| D-80 | Slider back [substitution feature=slider effect=stacked class=defect status=fixed] | x | CLOSED |'))
  assert.equal(fixed.blocking, 0)
})

test('decisions file: a directory, an empty file and a missing file are refused before reading', () => {
  const dir = testDir('audit-acc')
  assert.throws(() => readSmallFile(dir, '--decisions'), /not a regular file/)
  writeFileSync(join(dir, 'empty.md'), '')
  assert.throws(() => readSmallFile(join(dir, 'empty.md'), '--decisions'), /empty/)
  assert.throws(() => readSmallFile(join(dir, 'nope.md'), '--decisions'), /no such file/)
  symlinkSync(dir, join(dir, 'link'))
  assert.throws(() => readSmallFile(join(dir, 'link'), '--decisions'), /symbolic link/)
  // a link to a REGULAR file is a link all the same: refused, never followed
  writeFileSync(join(dir, 'real.md'), '- D-1: x\n')
  symlinkSync(join(dir, 'real.md'), join(dir, 'real-link.md'))
  assert.equal(readSmallFile(join(dir, 'real.md'), '--decisions'), '- D-1: x\n')
  assert.throws(() => readSmallFile(join(dir, 'real-link.md'), '--decisions'), /symbolic link/)
})

// ── http-parity: the same rules at its input ──────────────────────────────────────────────
async function withServer(fn) {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<html><body><main><h1>Hello world and welcome</h1><p>Written by somebody nice for you here</p></main></body></html>')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

test('http-parity: --accept needs --decisions, exact routes and a citation that names the row; a good one runs', async () => {
  const dir = testDir('audit-acc')
  mkdirSync(dir, { recursive: true })
  const dec = join(dir, 'DECISIONS.md')
  writeFileSync(dec, DECISIONS)
  const acc = (name, list) => {
    const f = join(dir, name)
    writeFileSync(f, JSON.stringify({ accept: list }))
    return f
  }
  await withServer(async (base) => {
    // async: the server lives in this process, a synchronous spawn would never let it answer
    const run = async (...extra) => {
      const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', base, '--target', base, '--routes', '/', '--no-cache', '--out', join(dir, 'r.json'), ...extra])
      let stderr = ''
      child.stderr.on('data', (d) => (stderr += d))
      child.stdout.resume()
      const [status] = await once(child, 'close')
      return { status, stderr }
    }
    const wildcard = await run('--accept', acc('w.json', rows({ routes: ['*'] })), '--decisions', dec)
    assert.equal(wildcard.status, 2, wildcard.stderr)
    assert.match(wildcard.stderr, /wildcard/)
    const bare = await run('--accept', acc('b.json', rows({ routes: ['/'] })))
    assert.equal(bare.status, 2)
    assert.match(bare.stderr, /needs --decisions/)
    const wrong = await run('--accept', acc('x.json', rows({ routes: ['/'], decision: 'D-09' })), '--decisions', dec)
    assert.equal(wrong.status, 2)
    assert.match(wrong.stderr, /does not mention/)
    const ok = await run('--accept', acc('ok.json', rows({ routes: ['/'] })), '--decisions', dec)
    assert.equal(ok.status, 0, ok.stderr)
  })
})

// ── amendment class 11: every place an exception cites a decision ───────────────────────────
const IMPACT_DECISIONS = `# Decisions
| D-ji-gb-1 | Joomla footer wording "Joomla! is Free Software" kept in the footer | OPEN |
| D-12 | The mega panel corner radius differs | OPEN |
| D-03 | Contrast of the footer link .site-footer a on /contact/ is 2.62 | OPEN |
| D-21 | The drawer picture differs: .offcanvas | OPEN |
`
const exc = (over = {}) => ({ kind: 'identity-mismatch', match: 'footer', key: 'Joomla! is Free Software', reason: 'Joomla! is Free Software', decision: 'D-ji-gb-1', ...over })

test('exceptions: a namespaced decision id resolves, a short form of it does not, an unrelated one does not', async () => {
  const { validateExceptionRows } = await import('../lib/parity-acceptance.mjs')
  const d = parseDecisions(IMPACT_DECISIONS)
  assert.ok(d.decisions.has('D-ji-gb-1'))
  assert.deepEqual(validateExceptionRows([exc()], d), [])
  assert.deepEqual(validateExceptionRows([exc({ decision: 'DECISIONS.md D-ji-gb-1' })], d), [], 'a wrapped citation is read')
  assert.match(validateExceptionRows([exc({ decision: 'D-gb-1' })], d).join(), /D-gb-1 does not exist/)
  assert.match(validateExceptionRows([exc({ decision: 'D-12' })], d).join(), /does not mention "joomla! is free software"/)
  assert.match(validateExceptionRows([exc({ decision: 'D-ji-gb-1 and D-12' })], d).join(), /exactly one decision/)
  assert.match(validateExceptionRows([exc({ decision: 'D-1' })], d).join(), /D-1 does not exist/, 'D-1 is not a prefix of D-12')
  assert.match(validateExceptionRows([exc()], null).join(), /no decisions were given/)
})

test('exceptions: a key named only in the row reason is not in the decision; duplicate ids are refused; a row without a key is read by the words of its match', async () => {
  const { validateExceptionRows } = await import('../lib/parity-acceptance.mjs')
  assert.match(validateExceptionRows([exc({ key: 'GNU GPL', reason: 'GNU GPL footer line' })], parseDecisions(IMPACT_DECISIONS)).join(), /does not mention "gnu gpl"/)
  assert.match(validateExceptionRows([exc()], parseDecisions(`${IMPACT_DECISIONS}| D-ji-gb-1 | again | OPEN |\n`)).join(), /defined more than once/)
  assert.deepEqual(validateExceptionRows([exc({ key: undefined, match: 'Joomla! is Free Software' })], parseDecisions(IMPACT_DECISIONS)), [], 'the match words are the key')
  assert.match(validateExceptionRows([exc({ key: undefined, match: 'Share this article' })], parseDecisions(IMPACT_DECISIONS)).join(), /does not mention "share this article"/)
})

test('exceptions: a universal match is a wildcard acceptance and is refused; a narrow one with a citation stands', async () => {
  const { validateExceptionRows } = await import('../lib/parity-acceptance.mjs')
  const d = parseDecisions(IMPACT_DECISIONS)
  const row = { kind: 'contrast', match: '2\\.62', reason: 'accepted', decision: 'D-03', key: '2.62' }
  for (const match of ['.*', '.+', '.', '^', '(?:)', '[\\s\\S]*']) assert.match(validateExceptionRows([{ ...row, match }], d).join(), /accepts every finding/, match)
  assert.deepEqual(validateExceptionRows([row], d), [], 'the narrow, cited acceptance stands (main-compatible: no routes or selector are demanded)')
  for (const routes of [[], ['*'], ['/contact/*']]) assert.ok(validateExceptionRows([{ ...row, routes }], d).length, `routes ${JSON.stringify(routes)} named by a row must be exact paths`)
  assert.deepEqual(validateExceptionRows([{ ...row, routes: ['/contact/'], selector: '.site-footer a' }], parseDecisions('- D-03: contrast of 2.62 on .site-footer a is accepted')), [])
})

test('exceptions: visual-qa accept() — once decisions are bound, a wildcard match or a citation that does not resolve accepts nothing; unbound keeps the legacy behaviour', async () => {
  const { accept, bindDecisions } = await import('../visual/visual-qa.mjs')
  const row = { kind: 'contrast', match: '2\\.62', reason: 'r', decision: 'D-03', key: '2.62' }
  const finding = { kind: 'contrast', selector: '.site-footer a', ratio: 2.62 }
  const page = { id: 'contact', path: '/contact/' }
  const unbound = { design: { exceptions: [row] } }
  assert.ok(accept(unbound, finding, page), 'a contract that never bound decisions behaves as before')
  const bound = (r, text) => { const c = { design: { exceptions: [r] } }; bindDecisions(c, text === null ? null : parseDecisions(text)); return c }
  assert.ok(accept(bound(row, '- D-03: contrast of 2.62 on .site-footer a is accepted'), finding, page))
  assert.equal(accept(bound({ ...row, match: '.*' }, '- D-03: contrast of 2.62 is accepted'), finding, page), null, 'a wildcard match')
  assert.equal(accept(bound({ ...row, decision: 'D-99' }, '- D-03: contrast of 2.62 is accepted'), finding, page), null, 'a decision that does not exist')
  assert.equal(accept(bound(row, '- D-03: the footer logo is accepted'), finding, page), null, 'a decision about something else')
  assert.equal(accept(bound(row, null), finding, page), null, 'decisions that cannot be read')
  assert.equal(accept(bound({ ...row, decision: 'D-03 and D-04' }, '- D-03: contrast of 2.62\n- D-04: contrast of 2.62'), finding, page), null, 'two decisions')
})

test('visual exceptions: structured scopes require bound decisions and match every declared dimension', async () => {
  const { accept, bindDecisions } = await import('../visual/visual-qa.mjs')
  const row = { kind: 'parity-mismatch', reason: 'accepted type change', decision: 'D-01', key: 'Foundation', scope: { pages: ['en-about'], routes: ['/about/'], axes: ['1440-light'], selector: 'h1', text: 'Foundation title', properties: ['font-size'] } }
  const finding = { kind: 'parity-mismatch', subject: { selector: 'h1', text: 'Foundation title' }, deltas: [{ property: 'font-size' }, { property: 'line-height' }] }
  const page = { id: 'en-about', path: '/about/' }
  const make = (r, bound = true) => {
    const c = { design: { exceptions: [r] } }
    if (bound) bindDecisions(c, parseDecisions('- D-01: Foundation title font-size'))
    return c
  }
  assert.equal(accept(make(row, false), finding, page, '1440-light'), null)
  assert.equal(accept(make(row), finding, page, '1440-light'), null, 'all differing properties must be covered')
  const coversBoth = { ...row, scope: { ...row.scope, properties: ['font-size', 'line-height'] } }
  assert.ok(accept(make(coversBoth), finding, page, '1440-light'))
  for (const [p, axis, subject] of [
    [{ ...page, id: 'en-home' }, '1440-light', finding.subject],
    [page, 'mobile-light', finding.subject],
    [page, '1440-light', { ...finding.subject, selector: '.hero h1' }],
    [page, '1440-light', { ...finding.subject, text: 'Different title' }]
  ]) assert.equal(accept(make(coversBoth), { ...finding, subject }, p, axis), null)
  assert.ok(accept(make({ ...coversBoth, match: 'Foundation' }), finding, page, '1440-light'))
  assert.equal(accept(make({ ...coversBoth, match: 'Other' }), finding, page, '1440-light'), null)
})

test('visual exceptions: legacy regex sees the pre-scope parity finding only', async () => {
  const { accept } = await import('../visual/visual-qa.mjs')
  const finding = {
    kind: 'parity-mismatch',
    element: 'h1.x "A long heading label truncated before the rest…"',
    subject: { selector: 'h1.x', text: 'A long heading label truncated before the rest Zebra' },
    properties: ['font-size'],
    deltas: [{ property: 'font-size', expected: '40px', observed: '44px' }]
  }
  const contract = { design: { exceptions: [{ kind: 'parity-mismatch', match: 'Zebra', decision: 'D-01' }] } }
  assert.equal(accept(contract, finding, { id: 'en-about', path: '/about/' }, '1440-light'), null)
})

test('visual exceptions: every non-page kind needs a subject scope, and scoped matching needs that subject', async () => {
  const { accept, bindDecisions } = await import('../visual/visual-qa.mjs')
  const { validateExceptionRows } = await import('../lib/parity-acceptance.mjs')
  const decisions = parseDecisions('- D-01: heading text is approved')
  const base = { kind: 'unclassified-element', reason: 'approved', decision: 'D-01', key: 'heading' }
  const pageOnly = { ...base, scope: { pages: ['en-about'] } }
  assert.match(validateExceptionRows([pageOnly], decisions).join(), /element scope must name selector or text/)

  const selectorScope = { ...base, scope: { pages: ['en-about'], selector: 'h1' } }
  const contract = { design: { exceptions: [selectorScope] } }
  bindDecisions(contract, decisions)
  assert.equal(accept(contract, { kind: 'unclassified-element', element: 'h1 "heading"' }, { id: 'en-about', path: '/about/' }, '1440-light'), null)
})

test('visual exceptions: a present scoped match must be a non-empty valid regular expression', async () => {
  const { validateExceptionRows } = await import('../lib/parity-acceptance.mjs')
  const decisions = parseDecisions('- D-01: heading is approved')
  const row = { kind: 'unclassified-element', key: 'heading', reason: 'approved', decision: 'D-01', scope: { pages: ['en-about'], selector: 'h1' } }
  for (const match of ['', null, 1, '[']) {
    assert.match(validateExceptionRows([{ ...row, match }], decisions).join(), /match must be a non-empty string|match is not a valid regular expression/)
  }
})

test('exceptions: validateContract, menu pairs and the design contract resolve citations; release revalidates through the same validator', async () => {
  const { validateContract } = await import('../visual/contract.mjs')
  const { validateDesign } = await import('../design-contract.mjs')
  const d = parseDecisions(IMPACT_DECISIONS)
  const bad = { design: { exceptions: [exc({ decision: 'D-gb-1' })], menus: { pairs: [{ site: '.offcanvas', source: '#t4-off-canvas', reason: 'r', decision: 'D-12' }] } } }
  const errors = validateContract(bad, { decisions: d }).filter((e) => /design\.(exceptions|menus)/.test(e))
  assert.ok(errors.some((e) => /exceptions\[0\].*D-gb-1 does not exist/.test(e)), errors.join('\n'))
  assert.ok(errors.some((e) => /menus\.pairs\[0\].*D-12 does not mention/.test(e)), errors.join('\n'))
  const good = { design: { exceptions: [exc()], menus: { pairs: [{ site: '.offcanvas', source: '.offcanvas', reason: 'r', decision: 'D-21' }] } } }
  assert.deepEqual(validateContract(good, { decisions: d }).filter((e) => /design\.(exceptions|menus)/.test(e)), [])
  assert.ok(validateContract(good, { decisions: null }).some((e) => /no decisions were given/.test(e)), 'a missing DECISIONS.md refuses')
  assert.equal(typeof validateDesign, 'function')
  const { decisionsOf } = await import('../visual/visual-qa.mjs')
  assert.equal(decisionsOf({}, '/nonexistent/dossier/visual.contract.json', good), null, 'cited decisions with no readable file read none')
  assert.equal(decisionsOf({}, '/nonexistent/x.json', { design: {} }).decisions.size, 0)
})

test('acceptance scope: a match-everything regex with a harmless key accepts nothing', async () => {
  const { universalRegex } = await import('../lib/parity-acceptance.mjs')
  const d = parseDecisions(DECISIONS)
  // the audited hole: `.*` plus a key a decision does mention
  assert.match(validateAcceptRows(rows({ match: '.*', key: 'Written by' }), d).join(), /accepts every finding/)
  for (const m of ['.*', '.+', '^', 'a*', '(?:)', '[\\s\\S]*']) assert.ok(universalRegex(new RegExp(m, 'i')), m)
  assert.equal(universalRegex(/Written by/i), false)
})
