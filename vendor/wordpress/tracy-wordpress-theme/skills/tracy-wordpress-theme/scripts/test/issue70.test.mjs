// #70 (S-14): theme-tokens (accent-on, surface, width-based containers, section role) and the
// preflight identity of a Joomla source whose CSRF token changes on every load.
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrastRatio, isSectionSubject, parseTokensCss, stripNegations, subjectOf, TOKEN_NAMES, tokensFromContract } from '../theme-tokens.mjs'
import { CSRF_POLICY, maskCsrf, sameIdentity, sourceIdentity } from '../visual/source-identity.mjs'
import { fetchHash, LOCK_FILE, LOCK_SCHEMA, lockDigest, resourceLog, stableJson, verifyRun } from '../visual/preflight.mjs'
import { testDir } from './lib/test-root.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EXAMPLE = path.resolve(HERE, '..', '..', 'examples', 'design-contract.json')
const apple = () => parseTokensCss(readFileSync(path.join(HERE, 'fixtures', 'theme-tokens', 'apple.tokens.css'), 'utf8'))

// ── theme-tokens ─────────────────────────────────────────────────────────────────────────────────

/** The example contract with `rules` = [id, selector, desktop styles, mobile styles?] and widths as given. */
function contractWith(rules, tokens = null) {
  const c = JSON.parse(readFileSync(EXAMPLE, 'utf8'))
  c.rules = rules.map(([id, selector, desktop, mobile = desktop]) => ({
    id,
    category: 'layout',
    selector,
    styles: Object.fromEntries(c.variants.map((v) => [v.id, v.width >= 1280 ? desktop : mobile]))
  }))
  if (tokens) for (const v of c.variants) c.tokens[v.id] = { ...tokens }
  return c
}
const of = (c, name, opts = {}) => {
  const r = tokensFromContract(c, { fallback: apple(), ...opts })
  return { value: r.tokens[name], p: r.provenance.find((p) => p.name === name), all: r }
}

test('section spacing comes from the section, not from a button inside `.hero` (18px vs 128px)', () => {
  const section = ['section', '.hero', { paddingTop: '128px', paddingBottom: '128px' }, { paddingTop: '64px', paddingBottom: '64px' }]
  const button = ['button', '.hero .btn-primary', { paddingTop: '18px', backgroundColor: 'rgb(217, 48, 48)', color: 'rgb(255, 255, 255)' }]
  for (const rules of [[section, button], [button, section]]) {
    const c = contractWith(rules)
    const y = of(c, '--section-y-desktop')
    assert.equal(y.value, '128px', rules.map((r) => r[0]).join('>'))
    assert.match(y.p.detail, /rule section \(\.hero\) paddingTop/)
    assert.equal(y.p.source, 'measured')
    assert.equal(of(c, '--section-y-phone').value, '64px')
  }
  // a button alone is no section: the value is the fallback, labelled so
  const alone = of(contractWith([button]), '--section-y-desktop')
  assert.equal(alone.p.source, 'fallback')
  assert.equal(alone.value, apple()['--section-y-desktop'])
  // a button class that starts with a band word, or a grouped rule that includes a button, is no section
  for (const selector of ['.hero-btn-primary', '.hero, .btn-primary', '.hero :is(.btn-primary)', '.hero :where(.btn)', '.hero :not(.btn)', '.hero [data-role=button]', '.hero *'])
    assert.equal(of(contractWith([['b', selector, { paddingTop: '18px' }]]), '--section-y-desktop').p.source, 'fallback', selector)
  // parts of a band are not the band; a `<section>` and BEM-free band classes are
  for (const [subject, is] of [['.hero', true], ['.t3-section.padding-top', true], ['section', true], ['section.x', true], ['.acm-hero', true], ['.band', true], ['.hero-title', false], ['.hero__inner', false], ['.hero .btn', false], ['.hero-btn', false], ['.heroic', false], ['.btn-primary', false], ['.hero-btn-primary', false], ['.hero-outline', false], ['.hero, .btn-primary', false], ['.hero, .band', true]])
    assert.equal(isSectionSubject(subjectOf(subject)), is, subject)
})

test('selector helpers: `:not(.btn)` is not a button, the subject is the last compound', () => {
  assert.equal(stripNegations('.item-page p a:not(.btn)'), '.item-page p a')
  assert.equal(stripNegations('a:not(.a):not(:is(.b, .c))'), 'a')
  assert.equal(subjectOf('.hero .btn-primary'), '.btn-primary')
  assert.equal(subjectOf('.a > .b + .c ~ .d:hover'), '.d:hover')
  assert.equal(subjectOf('.t3-mainbody.container'), '.t3-mainbody.container')
  assert.equal(subjectOf('form input[type=password].form-control'), 'input.form-control')
  assert.equal(subjectOf('h1, .x h2'), 'h1 h2')
  assert.equal(subjectOf('.hero:not(.dark)'), '.hero', 'a negation on the subject keeps the subject')
  assert.equal(subjectOf('.hero:has(.btn)'), '.hero')
  assert.equal(subjectOf('.hero[data-x="a b"]'), '.hero')
  // a functional pseudo-class that may hold the subject leaves the rule with none — `.hero :is(.btn)` is not `.hero`
  for (const sel of ['.hero :is(.btn-primary)', '.hero :where(.btn)', ':is(.hero, .band) .btn', '.hero > :is(a, button)', '.hero :not(.btn)', '.hero [data-role=button]', '.hero *', '.hero :hover', '.hero :has(.btn)', '.hero, .x :not(.y)']) {
    assert.equal(subjectOf(sel), '', sel)
    assert.equal(isSectionSubject(subjectOf(sel)), false, sel)
  }
})

test('container width: a Bootstrap 3 `width` 1260 is the maximum, `maxWidth` wins, a full-width container is none', () => {
  const at = (rule, mobile) => of(contractWith([['container', '.t3-mainbody.container', rule, mobile]]), '--container-max')
  const w = at({ width: '1260px', paddingLeft: '15px' })
  assert.equal(w.value, '1260px')
  assert.match(w.p.detail, /rule container .* width/)
  assert.equal(w.p.source, 'measured')
  // both present: max-width stays the answer
  assert.equal(at({ maxWidth: '1140px', width: '1260px' }).value, '1140px')
  // a container as wide as the viewport (1440 at 1440) measures no maximum
  const full = at({ width: '1440px' })
  assert.equal(full.p.source, 'fallback')
  assert.equal(full.value, apple()['--container-max'])
  // `none`, `auto`, zero and non-px widths are not measurements either
  for (const bad of ['auto', '0px', '50%', 'calc(100% - 30px)']) assert.equal(at({ width: bad }).p.source, 'fallback', bad)
  // the mobile companion does not decide the desktop token
  assert.equal(at({ width: '1260px' }, { width: '360px' }).value, '1260px')
  // the ancestor of a rule is not a container: `.container .card` is a card
  const card = of(contractWith([['card', '.container .card', { width: '300px' }]]), '--container-max')
  assert.equal(card.p.source, 'fallback')
})

test('accent-on: red link text on a red accent is replaced by a readable colour, with the reason; a button colour that reads stays', () => {
  const link = ['link-color', '.item-page p a:not(.btn)', { color: 'rgb(217, 48, 48)' }]
  const btn = ['btn-primary', '.item-page .btn.btn-primary', { backgroundColor: 'rgb(217, 48, 48)', color: 'rgb(255, 255, 255)' }]
  const body = ['body-colors', 'body', { color: 'rgb(119, 119, 119)', backgroundColor: 'rgb(255, 255, 255)' }]
  // the negation no longer makes a link a button: the button's own colour is measured
  for (const rules of [[link, btn, body], [btn, link, body], [body, btn, link]]) {
    const on = of(contractWith(rules), '--accent-on')
    assert.equal(on.value, '#ffffff')
    assert.equal(on.p.source, 'measured')
    assert.match(on.p.detail, /rule btn-primary/)
  }
  // a link is the only accent source and its colour is the accent: contrast picks --bg, then white, then black
  const linkOnly = of(contractWith([link, body]), '--accent-on', { fallback: { ...apple(), '--accent-on': '#d93030' } })
  assert.equal(linkOnly.p.source, 'derived')
  assert.equal(linkOnly.value, '#ffffff')
  assert.match(linkOnly.p.detail, /contrast: .* is 1\.00:1 on --accent #d93030, below 4\.5:1; used #ffffff/)
  // a light accent gets black
  const light = contractWith([['btn', '.btn', { backgroundColor: 'rgb(250, 240, 120)', color: 'rgb(255, 255, 255)' }]])
  const dark = of(light, '--accent-on')
  assert.equal(dark.value, '#000000')
  assert.equal(dark.p.source, 'derived')
  assert.ok(contrastRatio(dark.value, of(light, '--accent').value) >= 4.5)
  // the contract's own token map is an explicit decision: kept, with the failing ratio reported
  const declared = of(contractWith([btn], { '--accent-on': '#d93030', '--accent': '#d93030' }), '--accent-on')
  assert.equal(declared.value, '#d93030')
  assert.equal(declared.p.source, 'measured')
  assert.match(declared.p.detail, /contract tokens\..*WARNING: 1\.00:1/)
  // contrast maths
  assert.equal(contrastRatio('#000000', '#ffffff'), 21)
  assert.equal(contrastRatio('#ffffff', '#fff'), null)
  assert.equal(contrastRatio('#ffffff80', '#000000'), null)
})

test('surface: the footer band is not a content surface; the main content background is; nothing else is guessed', () => {
  const footer = ['footer-band', '.t3-footer', { backgroundColor: 'rgb(17, 17, 17)' }]
  const c1 = contractWith([footer])
  const s1 = of(c1, '--surface')
  assert.equal(s1.p.source, 'fallback', 'the dark footer is not --surface')
  assert.equal(s1.value, apple()['--surface'])
  // the footer still answers --surface-warm (its own role)
  assert.equal(of(c1, '--surface-warm').value, '#111111')
  const main = ['main-content', '.t3-mainbody', { backgroundColor: 'rgb(245, 245, 245)' }]
  for (const rules of [[footer, main], [main, footer]]) {
    const s = of(contractWith(rules), '--surface')
    assert.equal(s.value, '#f5f5f5')
    assert.match(s.p.detail, /rule main-content/)
  }
  // a card still wins over the main background; a card inside the sidebar chrome does not
  assert.equal(of(contractWith([main, ['card', '.card', { backgroundColor: 'rgb(240, 240, 250)' }]]), '--surface').value, '#f0f0fa')
  assert.equal(of(contractWith([['sidebar-card', '.t3-sidebar .card', { backgroundColor: 'rgb(1, 2, 3)' }], main]), '--surface').value, '#010203', 'a sidebar card is a content surface')
  for (const rules of [[['footer-card', '.t3-footer .card', { backgroundColor: 'rgb(17, 17, 17)' }], main], [main, ['footer-card', '.t3-footer .card', { backgroundColor: 'rgb(17, 17, 17)' }]]]) {
    assert.equal(of(contractWith(rules), '--surface').value, '#f5f5f5', 'a card inside the footer is not the surface, in either rule order')
  }
})

test('all 56 names stay answered; explicit contract tokens keep precedence; measured/fallback counts add up', () => {
  const c = contractWith([['section', '.hero', { paddingTop: '128px' }], ['container', '.container', { width: '1260px' }]], { '--container-max': '1000px' })
  const r = tokensFromContract(c, { fallback: apple() })
  assert.deepEqual(Object.keys(r.tokens).sort(), [...TOKEN_NAMES].sort())
  assert.equal(r.tokens['--container-max'], '1000px', 'declared beats a rule')
  assert.equal(r.provenance.length, 56)
  assert.equal(r.provenance.filter((p) => ['measured', 'derived', 'fallback'].includes(p.source)).length, 56)
  assert.deepEqual(r.missing, [])
})

// ── source identity ──────────────────────────────────────────────────────────────────────────────

const T1 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const T2 = '0f9e8d7c6b5a49382716f5e4d3c2b1a0'
const page = (token, { text = 'Hello', script = 'alert(1)', value = '1', extra = '', body = '' } = {}) =>
  `<!doctype html><html><head><title>t</title><style>p{color:red}</style>` +
  `<script type="application/json" class="joomla-script-options new">{"csrf.token":"${token}","system.paths":{"root":""}}</script></head>` +
  `<body><p>${text}</p><form action="/login" method="post"><input type="text" name="q"><input type="hidden" name="${token}" value="${value}"${extra}></form>` +
  `<script>${script}</script>${body}</body></html>`
const idOf = (html, opts) => sourceIdentity(Buffer.from(html), opts)

test('identity: pages that differ only in the supported CSRF token forms share one identity, the raw digests differ', () => {
  const a = idOf(page(T1)),
    b = idOf(page(T2))
  assert.equal(a.policy, CSRF_POLICY)
  assert.equal(a.normalized, true)
  assert.equal(a.fields, 2)
  assert.ok(sameIdentity(a, b))
  assert.notEqual(idOf(page(T1), { html: false }).sha256, idOf(page(T2), { html: false }).sha256)
  assert.equal(idOf(page(T1), { html: false }).policy, 'raw')
  assert.equal(maskCsrf(page(T1)).text.includes(T1), false)
})

test('identity: negative controls — real changes, unsupported forms and token-like content stay different or raw', () => {
  const base = idOf(page(T1))
  const differs = (html, why) => assert.equal(sameIdentity(base, idOf(html)), false, why)
  differs(page(T1, { text: 'Bye' }), 'visible text')
  differs(page(T1, { script: 'alert(2)' }), 'inline script')
  differs(page(T1).replace('color:red', 'color:blue'), 'CSS')
  differs(page(T1).replace('action="/login"', 'action="/elsewhere"'), 'form URL')
  differs(page(T1, { body: `<p>${T1}</p>` }), 'the token printed as text is content')
  differs(page(T1, { body: `<a href="/x?${T1}=1">x</a>` }), 'a token in a link is unsupported volatility')
  // an input that is not exactly the Joomla form is not masked: value ≠ 1, an extra attribute, not hidden, short name
  for (const [html, why] of [[page(T1, { value: '2' }), 'value 2'], [page(T1, { extra: ' class="x"' }), 'extra attribute'], [page(T1).replace('type="hidden"', 'type="text"'), 'not hidden']]) {
    const alt = idOf(html.replace(new RegExp(T1, 'g'), T2))
    assert.equal(sameIdentity(alt, idOf(html)) && !alt.normalized, false, why)
    const inputOnly = idOf(html)
    assert.ok(inputOnly.fields <= 1, `${why}: at most the JSON form is masked`)
  }
  assert.equal(maskCsrf('<input type="hidden" name="abc" value="1">').tokens.length, 0, 'not 32 hex')
  assert.equal(maskCsrf(`<input type="hidden" name="${T1}" value="1" onclick="x">`).tokens.length, 0)
  assert.equal(maskCsrf(`<input type="hidden" name="${T1}" value="0">`).tokens.length, 0)
  assert.equal(maskCsrf(`<script type="application/json">{"csrf.token":"${T1}"}</script>`).tokens.length, 0, 'not a joomla-script-options block')
  assert.equal(maskCsrf(`<script type="application/json" class="joomla-script-options">{"csrf.token":"${T1}"</script>`).tokens.length, 0, 'malformed JSON')
  assert.equal(maskCsrf(`<script type="application/json" class="joomla-script-options">{"csrf.token":"short"}</script>`).tokens.length, 0)
  // an input-shaped string that is not a form field (script, textarea, comment, attribute value) is content
  const field = (t) => `<input type="hidden" name="${t}" value="1">`
  for (const [wrap, why] of [
    [(x) => `<script>var f='${x}'</script>`, 'inline script'],
    [(x) => `<textarea>${x}</textarea>`, 'textarea'],
    [(x) => `<!-- ${x} -->`, 'comment'],
    [(x) => `<div data-tpl='${x}'></div>`, 'attribute value'],
    [(x) => `<style>/* ${x} */</style>`, 'style'],
    [(x) => `<plaintext>${x}`, 'plaintext (the rest of the document is text)'],
    [(x) => `<div>${x}</div>`, 'an input outside any form'],
    [(x) => `<form><template>${x}</template></form>`, 'template content'],
    [(x) => `<form></form>${x}`, 'after the form closed'],
    [(x) => `<form><template><template></template>${x}</template></form>`, 'nested template content'],
    [(x) => `<form><noscript>${x}</noscript></form>`, 'noscript (text where scripting is on)'],
    [(x) => `<form><select><template>${x}</template></select></form>`, 'template in a select']
  ]) {
    assert.equal(maskCsrf(wrap(field(T1))).tokens.length, 0, `${why}: not masked`)
    const a = idOf(page(T1, { body: wrap(field(T1)) }))
    const b = idOf(page(T1, { body: wrap(field(T2)) }))
    assert.equal(sameIdentity(a, b), false, `${why}: a change of the string is a change of the source`)
    // the real form token changing together with the lookalike is still a change of the source
    assert.equal(sameIdentity(idOf(page(T1, { body: wrap(field(T1)) })), idOf(page(T2, { body: wrap(field(T2)) }))), false, `${why}: both change`)
  }
  // an input inside a real form IS a field (the positive control of the form context)
  assert.equal(maskCsrf(`<form>${field(T1)}</form>`).tokens.length, 1)
  // two different tokens in one page are not one session's token: raw identity, never normalised
  const mixed = idOf(page(T1).replace(`name="${T1}"`, `name="${T2}"`))
  assert.equal(mixed.policy, 'raw')
  assert.equal(idOf('<p>no token</p>').policy, 'raw')
  assert.equal(idOf(Buffer.from([0xff, 0xfe, 0x3c, 0x70, 0x3e])).policy, 'raw', 'not UTF-8')
})

const htmlRes = (url, body, { status = 200, type = 'text/html; charset=utf-8', frame = {} } = {}) => ({
  url: () => url,
  status: () => status,
  headers: () => ({ 'content-type': type }),
  frame: () => frame,
  request: () => ({ resourceType: () => 'document', sizes: async () => ({ responseBodySize: Buffer.byteLength(body) }) }),
  body: async () => Buffer.from(body)
})
async function load(log, url, bodies, opts) {
  const fake = new EventEmitter(),
    frame = {}
  fake.mainFrame = () => frame
  fake.url = () => url
  const settle = log.attach(fake, 'source')
  for (const b of bodies) fake.emit('response', htmlRes(url, b, { ...opts, frame }))
  await settle()
}

test('capture: loads that differ by the token are one identity with two raw digests; a real change makes two identities', async () => {
  const log = resourceLog()
  await load(log, 'http://src/', [page(T1), page(T2), page('0'.repeat(32))])
  const e = log.entries.get('source document http://src/')
  assert.equal(e.sha256s.length, 3)
  assert.equal(e.identities.length, 1)
  assert.equal(e.identities[0].policy, CSRF_POLICY)
  const changed = resourceLog()
  await load(changed, 'http://src/', [page(T1), page(T2, { text: 'other' })])
  assert.equal(changed.entries.get('source document http://src/').identities.length, 2)
  // a document that is not HTML, and a page without a token, keep the raw identity
  const plain = resourceLog()
  await load(plain, 'http://src/x', [page(T1), page(T2)], { type: 'text/plain' })
  assert.equal(plain.entries.get('source document http://src/x').identities.length, 2)
})

test('verify: the lock written under the policy accepts a source that changed only its token, and refuses every other change', async () => {
  const dir = testDir('issue70-verify')
  let body = page(T1),
    status = 200
  const server = createServer((req, res) => {
    res.writeHead(status, { 'content-type': 'text/html' })
    res.end(body)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const url = `http://127.0.0.1:${server.address().port}/`
    const log = resourceLog()
    await load(log, url, [page(T1), page(T2)])
    const entry = log.entries.get(`source document ${url}`)
    const writeLock = (doc, name) => {
      const out = path.join(dir, name)
      mkdirSync(out, { recursive: true })
      const lock = { schema: LOCK_SCHEMA, complete: true, epoch: { fingerprint: 'fp', sequence: 1 }, artifacts: {}, unresolved: [], source: { documents: [doc], stylesheets: [] } }
      lock.digest = lockDigest(lock)
      writeFileSync(path.join(out, LOCK_FILE), stableJson(lock))
      return out
    }
    const sourceReasons = async (out) => {
      const now = { [url]: await fetchHash(url) }
      return verifyRun(out, { fingerprint: 'fp', sourceNow: now }).reasons.filter((r) => r.startsWith('source '))
    }
    const { side: _s, type: _t, ...doc } = entry
    const lock = writeLock(doc, 'lock-new')
    // the source serves a third token: accepted on identity, and the lock keeps every raw digest and the policy
    body = page(T2.replace('0', '1'))
    assert.deepEqual(await sourceReasons(lock), [])
    assert.equal(doc.identities[0].policy, CSRF_POLICY)
    assert.equal(doc.sha256s.length, 2)
    // real changes are refused
    body = page(T1, { text: 'changed' })
    assert.match((await sourceReasons(lock)).join(), /serves other bytes than the lock recorded \(identity policy joomla-csrf-v1\)/)
    body = page(T1, { script: 'steal()' })
    assert.match((await sourceReasons(lock)).join(), /other bytes/)
    body = page(T1, { body: `<p>${T1}</p>` })
    assert.match((await sourceReasons(lock)).join(), /other bytes/)
    body = page(T1)
    status = 500
    assert.match((await sourceReasons(lock)).join(), /answers 500 now/)
    status = 200
    // a lock from before the policy (raw digests only) is compared raw: a token change is refused, identical bytes accepted
    const legacy = writeLock({ url, sha256s: [entry.sha256s[0]], statuses: [200], bytes: 1 }, 'lock-legacy')
    body = page(T1)
    assert.deepEqual(await sourceReasons(legacy), [])
    body = page(T2)
    assert.match((await sourceReasons(legacy)).join(), /other bytes/)
    // a lock that names two bodies and no identity is not one set of bytes
    const many = writeLock({ url, sha256s: entry.sha256s, statuses: [200], bytes: 1 }, 'lock-many')
    assert.match(verifyRun(many, { fingerprint: 'fp', sourceNow: { [url]: await fetchHash(url) } }).reasons.join(), /more than one body/)
    // a lock whose normalised identity was edited to another value is refused
    const forged = writeLock({ ...doc, identities: [{ ...doc.identities[0], sha256: `sha256:${'1'.repeat(64)}` }], sha256s: [entry.sha256s[0]] }, 'lock-forged')
    body = page(T2)
    assert.match((await sourceReasons(forged)).join(), /other bytes/)
  } finally {
    await new Promise((r) => server.close(r))
  }
})
