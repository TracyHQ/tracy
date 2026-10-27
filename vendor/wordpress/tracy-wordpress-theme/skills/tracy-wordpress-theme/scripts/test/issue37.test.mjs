// #37 (JA Vega M6, part 2): the CF7 required star, a source <br> in a section field, the body's
// text rendering and the container widths between the 1440 and 390 axes. Tests named `M6-<n>:`
// reproduce the item through entry points that existed before the fix
// (scripts/test/issue37-baseline.mjs runs them against the base commit and requires an assertion
// failure for every item); a helper added by the fix is reached through `need()`, which fails as an
// assertion — not a TypeError — on a tree that does not have it, so this file loads on the base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import * as formEmbed from '../lib/form-embed.mjs'
import * as blockFill from '../lib/block-fill.mjs'
import * as seed from '../seed.mjs'
import * as contractApi from '../visual/contract.mjs'
import * as vqa from '../visual/visual-qa.mjs'
import * as round from '../visual/round.mjs'
import { normaliseAcm } from '../lib/joomla-inventory.mjs'
import { pageHash } from '../visual/page-hash.mjs'

const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
const tmp = (prefix) => {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})
/** An export of the fix: an assertion failure (not a TypeError) on a tree that lacks it. */
const need = (mod, name) => {
  assert.equal(typeof mod[name], 'function', `${name} is not exported on this tree`)
  return mod[name]
}
const { parseBlocks, findAll, checkMarkup } = blockFill

// ── M6-11: the CF7 required star ─────────────────────────────────────────────────

// The JA Vega /contact form as the port's `contact-form` section carries it: every label marks its
// field required with a star element of its own (`<span class="star"> *</span>`, red in the
// source's CSS), label and control in one wrapper.
const CONTACT = `<form class="form-validate"><fieldset>
<div class="control-group"><label id="jform_contact_name-lbl" for="jform_contact_name" class="required control-label">Name<span class="star"> *</span></label>
<input type="text" name="jform[contact_name]" id="jform_contact_name" class="form-control required" required></div>
<div class="control-group"><label for="jform_contact_email" class="required control-label">Email<span class="star"> *</span></label>
<input type="email" name="jform[contact_email]" id="jform_contact_email" class="form-control required" required></div>
<div class="control-group"><label for="jform_contact_emailmsg" class="required control-label">Subject<span class="star"> *</span></label>
<input type="text" name="jform[contact_subject]" id="jform_contact_emailmsg" class="form-control required" required></div>
<div class="control-group"><label for="jform_contact_message" class="required control-label">Message<span class="star"> *</span></label>
<textarea name="jform[contact_message]" id="jform_contact_message" class="form-control required" required></textarea></div>
<div class="control-group"><label for="jform_contact_phone">Phone</label>
<input type="tel" name="jform[contact_phone]" id="jform_contact_phone"></div>
</fieldset><button class="btn btn-primary validate" type="submit">Send Email</button></form>`
const MARK = /<span class="wtb-form__required"[^>]*>\*<\/span>/

test('M6-11: a required field carries its star in an element the theme can style, as the source does', () => {
  const read = formEmbed.sourceForm(CONTACT)
  assert.deepEqual(read.fields.map((f) => [f.label, f.required]), [['Name', true], ['Email', true], ['Subject', true], ['Message', true], ['Phone', false]])
  const { form, fields } = formEmbed.cf7Form(read)
  const labels = form.split('\n\n').filter((l) => l.startsWith('<label'))
  assert.equal(labels.length, 5, form)
  for (const name of ['Name', 'Email', 'Subject', 'Message']) {
    const label = labels.find((l) => l.startsWith(`<label class="wtb-form__field"> ${name} `))
    assert.ok(label, `${name}: ${form}`)
    assert.match(label, MARK, `${name}: the star is not an element — ${label}`)
    assert.doesNotMatch(label.replace(MARK, ''), /\*\s*\n/, `${name}: a bare star is left in the label text`)
  }
  // an optional field has no star, not even an empty mark
  const phone = labels.find((l) => l.includes(' Phone'))
  assert.doesNotMatch(phone, /wtb-form__required|\*/, phone)
  // CF7's own required tags, the field names and the mail body are unchanged
  assert.match(form, /\[text\* name\]/)
  assert.match(form, /\[email\* email\]/)
  assert.match(form, /\[textarea\* message\]/)
  assert.match(form, /\[tel phone\]/)
  assert.deepEqual(fields.map((f) => f.name), ['name', 'email', 'subject', 'message', 'phone'])
  const mail = formEmbed.cf7MailBody(fields)
  assert.match(mail, /^Name: \[name\]\nEmail: \[email\]\nSubject: \[subject\]\nMessage: \[message\]\nPhone: \[phone\]\n/)
  assert.doesNotMatch(mail, /\*|wtb-form/)
  // the printed text still says what the source says, for the coverage check
  assert.match(formEmbed.cf7FormText(form), /^Name \* Email \* Subject \* Message \* Phone Send Email$/)
})

test('M6-11: the star rides every labelled kind — select, radio legend, file — and the seeded form is the same on every run', () => {
  const html = `<div style="display:block">
<label>Topic *</label><select required><option>Sales</option><option>Support</option></select>
<label>Plan *</label><div><span style="cursor: pointer">Free</span><span style="cursor: pointer">Pro</span></div>
<label>Drawings *</label><input type="file" required>
<label>Notes</label><textarea></textarea>
<button type="submit">Send</button></div>`
  const { form } = formEmbed.cf7Form(formEmbed.sourceForm(html))
  assert.match(form, new RegExp(`<label class="wtb-form__field"> Topic ${MARK.source}\\n\\s+\\[select\\* topic`))
  assert.match(form, new RegExp(`<legend>Plan ${MARK.source}</legend>`))
  assert.match(form, new RegExp(`<label class="wtb-form__file"> Drawings ${MARK.source}\\n\\s+\\[file\\* drawings`))
  assert.match(form, /<label class="wtb-form__field"> Notes\n\s+\[textarea notes\]/)
  // The seeder's form for a spec: built twice from the same spec, byte for byte the same (a second
  // seed updates nothing).
  const spec = {
    content: { pages: [{ path: '/contact', view: 'page-contact' }] },
    sections: { custom: [{ id: 'c1', sectionType: 'form', html: `<div id="card">${CONTACT}</div>`, pages: [{ path: '/contact' }] }] }
  }
  const a = seed.specForms(spec)
  const b = seed.specForms(JSON.parse(JSON.stringify(spec)))
  assert.equal(a.length, 1)
  assert.equal(a[0].form, b[0].form)
  assert.match(a[0].form, MARK)
})

// ── M6-12: a source <br> in a section field ─────────────────────────────────────

const TEAM = [
  '<!-- wp:group {"className":"acm-team"} -->\n<div class="wp-block-group acm-team">',
  '<!-- wp:paragraph {"metadata":{"role":"content","name":"team.title"},"className":"t-title"} -->\n<p class="t-title">Placeholder</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:heading {"metadata":{"role":"content","name":"team.desc"},"className":"t-desc"} -->\n<h2 class="wp-block-heading t-desc">Placeholder</h2>\n<!-- /wp:heading -->',
  '</div>\n<!-- /wp:group -->'
].join('\n')
const TEAM_MAP = {
  types: {
    'team:style-1': {
      pattern: 'demo/team',
      fields: {
        'team-title': { block: 'core/paragraph', path: 'team.title', attr: 'text' },
        'team-desc': { block: 'core/heading', path: 'team.desc', attr: 'content' }
      }
    }
  }
}
const renderTeam = (fields) => {
  const out = seed.renderAcm({ id: '160', type: 'team', style: 'style-1', fields, items: [] }, TEAM_MAP, { 'demo/team': TEAM }, () => null)
  assert.equal(checkMarkup(out.markup), true, out.markup)
  return out.markup
}
const headings = (markup) => findAll(parseBlocks(markup), (b) => b.name === 'core/heading')

test('M6-12: a <br> the source wrote in a field reaches the heading as a line break, not as text', () => {
  const markup = renderTeam({ 'team-title': 'Our team', 'team-desc': 'Meet the Minds <br>Behind Our Success' })
  assert.match(markup, /<h2 class="wp-block-heading t-desc">Meet the Minds <br>Behind Our Success<\/h2>/, markup)
  assert.doesNotMatch(markup, /&lt;br/)
  const h = headings(markup)
  assert.equal(h.length, 1)
  assert.equal(h[0].attrs.metadata.role, 'content', 'the heading stays editable')
  // a `text` field with the break (`<br/>`, CRLF after it) too
  const text = renderTeam({ 'team-title': 'Showcasing Our<br>\r\nExpertise ', 'team-desc': 'x' })
  assert.match(text, /<p class="t-title">Showcasing Our <br>Expertise<\/p>/, text)
})

test('M6-12: a composed line and a repeated item keep their breaks; the rest of the value stays text', () => {
  const pattern =
    '<!-- wp:group {"metadata":{"name":"hero.item.1"}} -->\n<div class="wp-block-group">\n<!-- wp:paragraph {"metadata":{"role":"content","name":"hero.avatar-title.1"}} -->\n<p>x</p>\n<!-- /wp:paragraph -->\n</div>\n<!-- /wp:group -->'
  const map = {
    types: {
      'hero:style-1': {
        pattern: 'demo/hero',
        item: 'hero.item.<n>',
        fields: {
          'avatar-accent': { block: 'core/paragraph', path: 'hero.avatar-title.<n>', attr: 'content', repeat: 'items', part: 1, wrap: 'span' },
          'avatar-title': { block: 'core/paragraph', path: 'hero.avatar-title.<n>', attr: 'content', repeat: 'items', part: 2 }
        }
      }
    }
  }
  const items = [
    { 'avatar-accent': '20K+', 'avatar-title': 'USERS HAVE SIGNED UP TO GROW<br/> ON THEIR TERMS' },
    { 'avatar-accent': '', 'avatar-title': 'Second<BR >line & more' }
  ]
  const { markup } = seed.renderAcm({ id: '111', type: 'hero', style: 'style-1', fields: {}, items }, map, { 'demo/hero': pattern }, () => null)
  assert.equal(checkMarkup(markup), true)
  assert.match(markup, /<p><span>20K\+<\/span> USERS HAVE SIGNED UP TO GROW <br>ON THEIR TERMS<\/p>/, markup)
  assert.match(markup, /<p>Second <br>line &amp; more<\/p>/, markup)
})

test('M6-12: the adapter keeps the break — sections.json is not where it is lost (evidence: m6 ingest spec, lines 64/311/2262)', () => {
  // Joomla's jatools-config writes a tag as ((br)); normaliseAcm reads it back as <br>.
  const module = {
    id: 160,
    title: 'Our Team',
    position: 'section-5',
    published: 1,
    ordering: 1,
    showtitle: 1,
    params: JSON.stringify({ 'jatools-config': JSON.stringify({ ':type': 'acm:team', team: { 'team[team-title]': 'Our team', 'team[team-desc]': 'Meet the Minds ((br))Behind Our Success' } }) })
  }
  const acm = normaliseAcm(module, { pages: [101] })
  assert.equal(acm.fields['team-desc'], 'Meet the Minds <br>Behind Our Success')
})

test('#37 M6-12: markup that is not a bare <br> stays text; breaks alone are an empty field', () => {
  const hostile = renderTeam({ 'team-title': 'a <br onclick="alert(1)"> b', 'team-desc': 'x <br> <script>alert(1)</script> <!-- /wp:heading --> <img src=x onerror=alert(1)> y' })
  assert.doesNotMatch(hostile, /<script|<img|onerror="|<br onclick|<!-- \/wp:heading --> y/)
  assert.match(hostile, /a &lt;br onclick="alert\(1\)"&gt; b/)
  assert.match(hostile, /x <br>&lt;script&gt;alert\(1\)&lt;\/script&gt; &lt;!-- \/wp:heading --&gt; &lt;img src=x onerror=alert\(1\)&gt; y/)
  // the block structure is what the pattern drew: two leaves, one group
  assert.equal(findAll(parseBlocks(hostile), (b) => b.name !== null).length, 3)
  // breaks and nothing else, empty, null: the block goes, as an empty field's does
  for (const v of ['<br>', ' <br/> <BR /> ', '', null]) assert.equal(headings(renderTeam({ 'team-title': 'Our team', 'team-desc': v })).length, 0, JSON.stringify(v))
  // plain text and entities: exactly as before
  const plain = renderTeam({ 'team-title': 'Tom & Jerry', 'team-desc': 'A &amp; B' })
  assert.match(plain, /<p class="t-title">Tom &amp; Jerry<\/p>/)
  assert.match(plain, /<h2 class="wp-block-heading t-desc">A &amp;amp; B<\/h2>/)
  const breaks = need(blockFill, 'breaksAsMarkup')
  assert.equal(breaks('no break'), null)
  assert.equal(breaks('a<br>b<br/>c<br />d'), 'a <br>b <br>c <br>d')
  assert.equal(breaks('<br>'), '')
})

// ── M6-13 / M6-14: a fake site and its rendered source ──────────────────────────

// `status` answers a path with another code, the file's own words in the body (a 404 page that
// happens to carry the selector a probe reads).
function serve(dir, { status = {} } = {}) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const code = status[p] ?? 200
      if (p.endsWith('/')) p += 'index.html'
      const file = join(dir, p)
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('<html lang="en"><body class="tracy-page-page"><main><h1>Not found</h1></main></body></html>')
        return
      }
      res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

const WORDS = Array.from({ length: 22 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
const BASE_CSS = 'body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}'
// The source's container steps at breakpoints of its own (not Bootstrap's): 600 / 900 / 1200 / 1400.
const SOURCE_STEPS = '.container{width:100%;margin:0 auto}@media (min-width:600px){.container{max-width:560px}}@media (min-width:900px){.container{max-width:860px}}@media (min-width:1200px){.container{max-width:1140px}}@media (min-width:1400px){.container{max-width:1320px}}'
const BREAKPOINTS = [600, 900, 1200, 1400]
// A site container that only caps: equal to the source's at 390 and at 1440, wider at 600/900/1200.
const CAP_ONLY = '.site-wrap{width:100%;margin:0 auto;max-width:1320px}'
const SITE_STEPS = SOURCE_STEPS.replaceAll('.container', '.site-wrap')
const sitePage = ({ css = '', title, kind = 'page', script = '' }) =>
  `<!doctype html><html lang="en"><head><style>${BASE_CSS}${css}</style></head><body class="tracy-page-${kind}"><main><div class="site-wrap"><h1>${title}</h1>${WORDS}</div></main>${script ? `<script>${script}</script>` : ''}</body></html>`
const sourcePage = ({ css = '', title }) => `<!doctype html><html lang="en"><head><style>${BASE_CSS}${css}</style></head><body><div class="container"><h1>${title}</h1>${WORDS}</div></body></html>`

const PAGES = [
  { file: 'About.html', view: 'page', title: 'About the company', path: '/about/', locale: 'en', rendered: 'about.html' },
  { file: 'Team.html', view: 'page', title: 'Our team members', path: '/team/', locale: 'en', rendered: 'team.html' },
  { file: 'One.html', view: 'single', title: 'One article', path: '/news/one/', locale: 'en', rendered: 'one.html' }
]
const CONTAINERS = { breakpoints: BREAKPOINTS, evidence: 'fixture template.css: .container max-width 560/860/1140/1320 from 600/900/1200/1400', items: [{ id: 'main', source: '.container', site: '.site-wrap' }] }

function fixture({ site = {}, source = {}, containers = CONTAINERS } = {}) {
  const root = tmp('i37-vqa-')
  const siteDir = join(root, 'site')
  const spec = join(root, 'spec')
  mkdirSync(join(spec, 'reference', 'rendered'), { recursive: true })
  for (const pg of PAGES) {
    mkdirSync(join(siteDir, pg.path), { recursive: true })
    writeFileSync(join(siteDir, pg.path, 'index.html'), sitePage({ css: site.css ?? '', script: site.script ?? '', title: pg.title, kind: pg.view === 'single' ? 'article' : 'page' }))
    writeFileSync(join(spec, 'reference', 'rendered', pg.rendered), sourcePage({ css: source.css ?? '', title: pg.title }))
  }
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(join(spec, f), '{}')
  const pageMap = { locales: ['en'], defaultLocale: 'en', pages: PAGES.map(({ rendered, ...p }) => p) }
  const reference = { pages: PAGES.map((p) => ({ page: p.file, path: `reference/rendered/${p.rendered}` })) }
  const reviewConfig = { hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page', '/team/': 'page', '/news/one/': 'single' }, containers }
  const contract = contractApi.buildContract({ pageMap, reference, reviewConfig, themeTemplates: new Set(['page', 'single']), specHash: contractApi.specHash(spec), id: 'i37' })
  const contractFile = join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  return { root, siteDir, spec, contract, contractFile }
}
const runOn = async (fx, stage, extra = {}, { siteStatus = {} } = {}) => {
  const srv = await serve(fx.siteDir, { status: siteStatus })
  const out = join(fx.root, `out-${stage}-${Math.random().toString(36).slice(2, 8)}`)
  const t0 = Date.now()
  try {
    const report = await vqa.run({ contract: fx.contractFile, site: srv.origin, out, spec: fx.spec, sourceSite: null, concurrency: 2, megaItems: '.none', stage, ...extra })
    return { report, out, seconds: (Date.now() - t0) / 1000 }
  } finally {
    await srv.close()
  }
}
const found = (report, kind) => report.pages.flatMap((p) => p.findings.filter((f) => f.kind === kind).map((f) => ({ page: p.id, ...f })))

// ── M6-13: the body's text rendering ────────────────────────────────────────────

const SMOOTH = 'body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}'

test('M6-13: the contract names the body\'s font smoothing and text rendering as a two-sided pair', () => {
  const { contract } = fixture()
  const body = contract.design.parity.body
  assert.ok(body, 'the contract has no body rendering pair')
  assert.equal(body.selector, 'body')
  assert.deepEqual(body.properties, ['-webkit-font-smoothing', 'text-rendering'])
})

test('M6-13: a source drawing antialiased / geometricPrecision against a site on auto is a finding on every axis; equal values are clean', async () => {
  const fx = fixture({ source: { css: SMOOTH } })
  const { report } = await runOn(fx, 'light-desktop', { pages: '/about/' })
  const rows = found(report, 'parity-body')
  assert.deepEqual(
    rows.map((f) => [f.property, f.expected, f.observed]).sort(),
    [
      ['-webkit-font-smoothing', 'antialiased', 'auto'],
      ['text-rendering', 'geometricprecision', 'auto']
    ],
    JSON.stringify(report.pages.map((p) => p.findings))
  )
  const same = fixture({ source: { css: SMOOTH }, site: { css: SMOOTH } })
  const clean = await runOn(same, 'light-desktop', { pages: '/about/' })
  assert.deepEqual(found(clean.report, 'parity-body'), [])
  assert.deepEqual(found(clean.report, 'parity-body-not-measured'), [])
  const axis = clean.report.pages[0].axes[0]
  assert.deepEqual(axis.body, { source: { '-webkit-font-smoothing': 'antialiased', 'text-rendering': 'geometricprecision' }, site: { '-webkit-font-smoothing': 'antialiased', 'text-rendering': 'geometricprecision' } })
})

test('#37 M6-13: a property a side cannot report is not measured — never an equal pair', async () => {
  const find = need(vqa, 'bodyRenderingFindings')
  const both = { found: true, values: { 'text-rendering': 'auto' } }
  assert.deepEqual(find(both, { found: false, values: {} }, ['text-rendering']).findings.map((f) => [f.kind, f.side]), [['parity-body-not-measured', 'site']])
  assert.deepEqual(find(both, { found: true, values: { 'text-rendering': '' } }, ['text-rendering']).findings.map((f) => [f.kind, f.side]), [['parity-body-not-measured', 'site']])
  assert.deepEqual(find(null, null, ['text-rendering']).findings.map((f) => f.side), ['source+site'])
  assert.deepEqual(find(both, both, ['text-rendering']).findings, [])
  // In the browser: a property Chromium does not compute (-moz-osx-font-smoothing) reads '' both sides.
  const fx = fixture({ source: { css: SMOOTH }, site: { css: SMOOTH } })
  fx.contract.design.parity.body.properties.push('-moz-osx-font-smoothing')
  writeFileSync(fx.contractFile, JSON.stringify(fx.contract))
  const { report } = await runOn(fx, 'light-desktop', { pages: '/about/' })
  assert.deepEqual(found(report, 'parity-body-not-measured').map((f) => [f.property, f.side]), [['-moz-osx-font-smoothing', 'source+site']])
  assert.deepEqual(found(report, 'parity-body'), [])
})

// ── M6-14: container widths at the source's breakpoints ─────────────────────────

test('M6-14: the contract carries the source\'s container breakpoints and measures each layout\'s representative there', () => {
  const { contract } = fixture()
  const c = contract.design.containers
  assert.ok(c, 'the contract has no container breakpoints: only 1440 and 390 are measured')
  assert.deepEqual(c.breakpoints, BREAKPOINTS)
  assert.deepEqual(c.items.map((i) => [i.id, i.layouts, i.pages]), [['main', ['page', 'single'], ['en-about', 'en-news-one']]])
  assert.deepEqual(contractApi.validateContract(contract), [])
})

test('M6-14: a container equal at 1440 and 390 and wider between is a finding at every breakpoint where it differs; the equal pair is clean', async () => {
  const fx = fixture({ source: { css: SOURCE_STEPS }, site: { css: CAP_ONLY } })
  const { report, seconds } = await runOn(fx, 'light-responsive')
  const rows = found(report, 'container-width')
  assert.deepEqual(
    rows.map((f) => [f.page, f.width, f.expected, f.observed]).sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)),
    [
      ['en-about', 1200, '1140px', '1200px'],
      ['en-about', 600, '560px', '600px'],
      ['en-about', 900, '860px', '900px'],
      ['en-news-one', 1200, '1140px', '1200px'],
      ['en-news-one', 600, '560px', '600px'],
      ['en-news-one', 900, '860px', '900px']
    ],
    JSON.stringify(report.pages.map((p) => [p.id, p.findings]))
  )
  // the four axes the contract always had see no difference: the endpoints agree
  for (const f of report.pages.flatMap((p) => p.findings)) assert.ok(!['horizontal-overflow'].includes(f.kind), JSON.stringify(f))
  const clean = await runOn(fixture({ source: { css: SOURCE_STEPS }, site: { css: SITE_STEPS } }), 'light-responsive')
  assert.deepEqual(found(clean.report, 'container-width'), [])
  assert.deepEqual(found(clean.report, 'container-not-measured'), [])
  // Cost: the representatives only (2 of 3 pages), a fresh load a side at each breakpoint, every breakpoint a row.
  const measured = clean.report.pages.flatMap((p) => p.axes.filter((a) => a.containers).map((a) => ({ page: p.id, ...a.containers })))
  assert.deepEqual(measured.map((m) => [m.page, m.probes, m.navigations, m.rows.map((r) => `${r.width}:${r.status}`).join(' ')]), [
    ['en-about', 4, 8, '600:ok 900:ok 1200:ok 1400:ok'],
    ['en-news-one', 4, 8, '600:ok 900:ok 1200:ok 1400:ok']
  ])
  assert.equal(clean.report.pages.find((p) => p.id === 'en-team').axes.some((a) => a.containers), false, 'a page that represents no layout is not probed')
  const cost = {
    note: 'fixture: 3 pages, 2 layouts, 4 breakpoints, stage light-responsive, concurrency 2',
    representatives: measured.length,
    probes: measured.reduce((n, m) => n + m.probes, 0),
    navigations: measured.reduce((n, m) => n + m.navigations, 0),
    probeMs: measured.map((m) => m.ms),
    stageSeconds: { mismatch: seconds, clean: clean.seconds }
  }
  writeFileSync(join(SCRATCH, 'issue37-container-cost.json'), JSON.stringify(cost, null, 2) + '\n')
})

test('#37 M6-14: a selector that finds nothing, or a page with no source, is a probe not measured — never a pass', async () => {
  const fx = fixture({ source: { css: SOURCE_STEPS }, site: { css: SITE_STEPS }, containers: { ...CONTAINERS, items: [{ id: 'main', source: '.container', site: '.not-there', layouts: ['page'] }] } })
  const { report } = await runOn(fx, 'light-responsive', { pages: '/about/' })
  const rows = found(report, 'container-not-measured')
  assert.deepEqual(rows.map((f) => [f.width, f.side]), BREAKPOINTS.map((w) => [w, 'site']))
  assert.match(rows[0].reason, /no element matches \.not-there/)
  const probes = need(contractApi, 'containerProbes')
  const find = need(vqa, 'containerFindings')
  const pr = probes(fx.contract, fx.contract.pages.find((p) => p.id === 'en-about'), { id: '390-light', width: 390, theme: 'light' })
  const r = find(pr, { site: { 'main@600': { width: 600 } }, source: { 'main@600': { width: NaN }, 'main@900': { error: 'x' } } }, 1)
  assert.deepEqual(r.rows.map((x) => x.status), ['not-measured', 'not-measured', 'not-measured', 'not-measured'])
})

// A container a script sizes once, at load, from the width it was opened at (no resize listener).
const SIZED_AT_LOAD = "var w=innerWidth,c=document.querySelector('.site-wrap');c.style.width='100%';c.style.margin='0 auto';c.style.maxWidth=w>=1400?'1320px':w>=1200?'1140px':w>=900?'860px':w>=600?'560px':'none'"

test('#37 M6-14: each breakpoint is a fresh load — a container a script sizes at load is read at the width it was opened at', async () => {
  const fx = fixture({ source: { css: SOURCE_STEPS }, site: { script: SIZED_AT_LOAD } })
  const { report } = await runOn(fx, 'light-responsive', { pages: '/about/' })
  assert.deepEqual(found(report, 'container-width'), [], JSON.stringify(report.pages.map((p) => p.findings)))
  assert.deepEqual(found(report, 'container-not-measured'), [])
  const rows = report.pages[0].axes[0].containers.rows
  assert.deepEqual(rows.map((r) => [r.width, r.status, r.site]), [[600, 'ok', 560], [900, 'ok', 860], [1200, 'ok', 1140], [1400, 'ok', 1320]])
  // and the same script sizing a wrong step at 900 is found at 900 only
  const wrong = fixture({ source: { css: SOURCE_STEPS }, site: { script: SIZED_AT_LOAD.replace("'860px'", "'900px'") } })
  const w = await runOn(wrong, 'light-responsive', { pages: '/about/' })
  assert.deepEqual(found(w.report, 'container-width').map((f) => [f.width, f.expected, f.observed]), [[900, '860px', '900px']])
})

test('#37 M6-14: a side that answers another status measures nothing — a 404 carrying the selector is not a width', async () => {
  // the site's /about/ answers 404 with the page's own markup (the .site-wrap is there)
  const siteGone = fixture({ source: { css: SOURCE_STEPS }, site: { css: SITE_STEPS } })
  const a = await runOn(siteGone, 'light-responsive', { pages: '/about/' }, { siteStatus: { '/about/': 404 } })
  const siteRows = found(a.report, 'container-not-measured')
  assert.deepEqual(siteRows.map((f) => [f.width, f.side]), BREAKPOINTS.map((w) => [w, 'site']), JSON.stringify(a.report.pages[0].findings))
  assert.match(siteRows[0].reason, /answered 404 at 600px, expected 200/)
  // the source served over HTTP (--source-site) answers its rendered export with 404
  const srcGone = fixture({ source: { css: SOURCE_STEPS }, site: { css: SITE_STEPS } })
  const src = await serve(join(srcGone.spec, 'reference'), { status: { '/rendered/about.html': 404 } })
  try {
    const b = await runOn(srcGone, 'light-responsive', { pages: '/about/', sourceSite: `${src.origin}/` })
    const srcRows = found(b.report, 'container-not-measured')
    assert.deepEqual(srcRows.map((f) => [f.width, f.side]), BREAKPOINTS.map((w) => [w, 'source']), JSON.stringify(b.report.pages[0].findings))
    assert.match(srcRows[0].reason, /about\.html answered 404 at 600px, expected 200/)
    assert.ok(b.report.pages[0].axes[0].containers.rows.every((r) => r.status === 'not-measured'))
  } finally {
    await src.close()
  }
})

test('#37 M6-13/M6-14: a measurement not taken is never accepted — not by the contract, not by the runner, not by the round', () => {
  const { contract } = fixture()
  const decided = (kind) => ({ kind, match: '.*', reason: 'the selector moved', decision: 'DECISIONS.md D1' })
  for (const kind of ['container-not-measured', 'parity-body-not-measured']) {
    const c = structuredClone(contract)
    c.design.exceptions = [decided(kind)]
    assert.ok(contractApi.validateContract(c).some((e) => e.includes(kind) && /cannot be accepted/.test(e)), kind)
    assert.equal(need(vqa, 'accept')(c, { kind, element: 'body' }, c.pages[0]), null, `${kind} accepted by the runner`)
  }
  // an exception of a measured kind still works as before
  const c = structuredClone(contract)
  c.design.exceptions = [decided('container-width')]
  assert.deepEqual(contractApi.validateContract(c), [])
  assert.equal(need(vqa, 'accept')(c, { kind: 'container-width', element: 'container main @600px' }, c.pages[0])?.kind, 'container-width')
  // the round: a `not-measured` row is a probe owed, and a not-measured finding — found or accepted — is incomplete
  const pages = contract.pages.map((p) => p.id)
  const key = contractApi.containersKey(contract)
  const reps = new Set(['en-about', 'en-news-one'])
  const rows = (status) => BREAKPOINTS.map((width) => ({ item: 'main', width, theme: 'light', status }))
  const problems = (report) => round.reportProblems({ contract, stage: 'light-responsive', report, exit: 0, pages, full: true })
  const blindRows = problems(reportOf(contract, (p) => (reps.has(p.id) ? { key, rows: rows(p.id === 'en-about' ? 'not-measured' : 'ok') } : null)))
  assert.ok(blindRows.some((m) => /container probe .*en-about 390-light \(main@600/.test(m)), JSON.stringify(blindRows))
  for (const where of ['findings', 'accepted'])
    for (const f of [{ kind: 'parity-body-not-measured', property: 'text-rendering' }, { kind: 'container-not-measured', container: 'main', width: 900 }]) {
      const r = reportOf(contract, (p) => (reps.has(p.id) ? { key, rows: rows('ok') } : null))
      r.pages[1].axes[0][where] = [f]
      const got = problems(r)
      assert.ok(got.some((m) => /measurement\(s\) not taken/.test(m) && m.includes(f.kind)), `${where} ${f.kind}: ${JSON.stringify(got)}`)
    }
})

test('#37 M6-14: a wrong declaration is pending, never guessed; undeclared is pending; `none` needs its reason', () => {
  const from = need(contractApi, 'containersFrom')
  const layouts = [
    { id: 'page', representative: 'en-about' },
    { id: 'single', representative: 'en-news-one' }
  ]
  const item = { id: 'main', source: '.container', site: '.site-wrap' }
  const bad = (decl, re) => {
    const r = from(decl, layouts)
    assert.equal(r.value, null, JSON.stringify(decl))
    assert.ok(r.pending.some((m) => re.test(m)), `${JSON.stringify(decl)} → ${JSON.stringify(r.pending)}`)
  }
  bad(undefined, /declares no "containers"/)
  bad([], /must be an object/)
  bad({ none: '' }, /needs the reason/)
  bad({ none: 'x', breakpoints: [1] }, /cannot stand beside breakpoints/)
  bad({ breakpoints: [], evidence: 'e', items: [item] }, /non-empty list/)
  bad({ breakpoints: [576, 576], evidence: 'e', items: [item] }, /576 listed twice/)
  bad({ breakpoints: [576.5], evidence: 'e', items: [item] }, /whole number/)
  bad({ breakpoints: ['768'], evidence: 'e', items: [item] }, /whole number/)
  bad({ breakpoints: [100], evidence: 'e', items: [item] }, /whole number of px from 240/)
  bad({ breakpoints: [99999], evidence: 'e', items: [item] }, /whole number/)
  bad({ breakpoints: [768], items: [item] }, /evidence/)
  bad({ breakpoints: [768], evidence: 'e', items: [] }, /at least one container/)
  bad({ breakpoints: [768], evidence: 'e', items: [{ ...item, site: '' }] }, /site must be/)
  bad({ breakpoints: [768], evidence: 'e', items: [{ ...item, layouts: ['blog'] }] }, /names blog, not a layout/)
  bad({ breakpoints: [768], evidence: 'e', items: [item, item] }, /used twice/)
  bad({ breakpoints: [768], evidence: 'e', items: [item], themes: ['sepia'] }, /themes/)
  bad({ breakpoints: [768], evidence: 'e', items: [item], tolerance: -1 }, /tolerance/)
  bad({ breakpoints: [768], evidence: 'e', items: [item], widths: [1] }, /unknown key widths/)
  const none = from({ none: 'a canvas export: no container grid' }, layouts)
  assert.deepEqual(none, { value: { none: 'a canvas export: no container grid' }, pending: [] })
  const ok = from({ breakpoints: [1200, 576], evidence: 'e', items: [{ ...item, layouts: ['single'] }] }, layouts)
  assert.deepEqual(ok.value.breakpoints, [576, 1200])
  assert.deepEqual(ok.value.items[0].pages, ['en-news-one'])
  // through the contract: undeclared is a pending decision and the contract is not measured
  const fx = fixture({ containers: null })
  assert.ok(fx.contract.pending.some((x) => x.what === 'containers'))
  assert.ok(contractApi.validateContract(fx.contract).some((e) => /pending/.test(e)))
  // a hand-made contract without the key (written before this field) is refused
  const old = fixture().contract
  delete old.design.containers
  assert.ok(contractApi.validateContract(old).some((e) => /design\.containers is not declared/.test(e)))
})

test('#37 M6-14: the container declaration is part of what a page hash and a report stand for', () => {
  const a = fixture().contract
  const b = fixture({ containers: { ...CONTAINERS, breakpoints: [600, 900, 1200] } }).contract
  const page = a.pages[0]
  assert.notEqual(pageHash({ contract: a, page }).parts.contract, pageHash({ contract: b, page: b.pages[0] }).parts.contract)
  const key = need(contractApi, 'containersKey')
  assert.notEqual(key(a), key(b))
})

// A checkpoint is complete only with every probe the contract owes, measured under this declaration.
const axisOf = (variant, containers) => ({ variant, measured: 'now', findings: [], ...(containers ? { containers } : {}) })
const reportOf = (contract, containersFor) => ({
  summary: { findings: 0, unclassified: 0 },
  scope: { kind: 'full' },
  stages: [{ id: 'light-responsive', status: 'pass' }],
  pages: contract.pages.map((p) => ({ id: p.id, axes: [axisOf('390-light', containersFor(p))] }))
})

test('M6-14: a responsive checkpoint without the container probes of the current declaration is not complete', () => {
  const { contract } = fixture()
  const pages = contract.pages.map((p) => p.id)
  const problems = (containersFor) => round.reportProblems({ contract, stage: 'light-responsive', report: reportOf(contract, containersFor), exit: 0, pages, full: true })
  // an axis that measured no container at all (the tool before this fix, or a cut run)
  assert.ok(problems(() => null).some((m) => /container probe/.test(m)), JSON.stringify(problems(() => null)))
  const key = need(contractApi, 'containersKey')(contract)
  const rows = (widths) => widths.map((width) => ({ item: 'main', width, theme: 'light', status: 'ok' }))
  const reps = new Set(['en-about', 'en-news-one'])
  // every probe, this declaration: complete
  assert.deepEqual(problems((p) => (reps.has(p.id) ? { key, rows: rows(BREAKPOINTS) } : null)), [])
  // a breakpoint missing on one representative
  assert.ok(problems((p) => (reps.has(p.id) ? { key, rows: rows(p.id === 'en-about' ? [600, 900, 1200] : BREAKPOINTS) } : null)).some((m) => /en-about 390-light \(main@1400\)/.test(m)))
  // measured under another declaration (breakpoints changed since): stale
  assert.ok(problems((p) => (reps.has(p.id) ? { key: 'sha256:old', rows: rows(BREAKPOINTS) } : null)).some((m) => /another container declaration/.test(m)))
  // the desktop stage owes no probe
  assert.deepEqual(round.reportProblems({ contract, stage: 'light-desktop', report: { ...reportOf(contract, () => null), stages: [{ id: 'light-desktop', status: 'pass' }], pages: contract.pages.map((p) => ({ id: p.id, axes: [axisOf('1440-light')] })) }, exit: 0, pages, full: true }), [])
})

// ── inputs the harnesses and the contract refuse before they touch anything ──────

const here = dirname(fileURLToPath(import.meta.url))
const runScript = (file, argv) => spawnSync(process.execPath, [join(here, file), ...argv], { encoding: 'utf8', timeout: 60000 })

test('#37: the WordPress proof and the baseline refuse bad arguments and an --out that is not a directory, before any stand or checkout', () => {
  const dir = tmp('i37-args-')
  const file = join(dir, 'a-file')
  writeFileSync(file, 'x')
  for (const [script, argv, re] of [
    ['issue37-wordpress.mjs', [], /--project <name> is required/],
    ['issue37-wordpress.mjs', ['--project', 'javwp', '--out', dir], /must be tracy-issue37-/],
    ['issue37-wordpress.mjs', ['--project', 'tracy-issue37-x', '--out', dir, '--timeout', '-3'], /--timeout takes seconds/],
    ['issue37-wordpress.mjs', ['--project', 'tracy-issue37-x', '--out', dir, '--bogus'], /unknown argument --bogus/],
    ['issue37-wordpress.mjs', ['--project', 'tracy-issue37-x', '--out'], /--out needs a value/],
    ['issue37-wordpress.mjs', ['--project', 'tracy-issue37-x', '--out', file], /exists and is not a directory/],
    ['issue37-baseline.mjs', ['--out', dir], /--base <commit> is required/],
    ['issue37-baseline.mjs', ['--base', 'HEAD;rm', '--out', dir], /not a commit id/],
    ['issue37-baseline.mjs', ['--base', 'bb25611', '--out', file], /exists and is not a directory/]
  ]) {
    const r = runScript(script, argv)
    assert.equal(r.status, 2, `${script} ${argv.join(' ')}: exit ${r.status} ${r.stderr}`)
    assert.match(r.stderr, re, `${script} ${argv.join(' ')}`)
  }
  assert.equal(readFileSync(file, 'utf8'), 'x', 'the file named as --out is untouched')
})

// Stand-ins on PATH: a `docker` that answers the preflight and logs every call; a `git` whose archive fails.
const stub = (dir, name, body) => {
  const f = join(dir, name)
  writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return f
}

// The proof on a stand-in docker: every call is logged as "<calling pid> <argv>"; the lock lives in
// the test's own directory.
const proofRun = (dir, env = {}) =>
  new Promise((done) => {
    const out = join(dir, `out-${Math.random().toString(36).slice(2)}`)
    const child = spawn(process.execPath, [join(here, 'issue37-wordpress.mjs'), '--project', 'tracy-issue37-stub', '--out', out, '--timeout', '60'], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TRACY_ISSUE37_LOCK_DIR: join(dir, 'locks'), ...env }
    })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000)
    child.on('close', (status) => {
      clearTimeout(timer)
      done({ status, stderr, pid: child.pid, report: existsSync(join(out, 'report.json')) ? JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) : null })
    })
  })
const callsOf = (log, pid) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []).filter((c) => pid === undefined || c.startsWith(`${pid} `)).map((c) => c.replace(/^\d+ /, ''))
const MUTATING = /^(rm|compose|run|create|stop|volume rm|network rm)\b/

test('#37: the WordPress proof refuses any container, volume or network its project already covers — by label or by name only — and removes nothing', async () => {
  const project = 'tracy-issue37-stub'
  for (const [what, env, re] of [
    ['the runner\'s container, unlabelled', { PS_OUT: `deadbeef0001\t${project}-cli-keep\t` }, /container deadbeef0001 tracy-issue37-stub-cli-keep/],
    ['a container under the compose label only', { PS_OUT: `c0ffee000001\tsomething-else\t${project}` }, /container c0ffee000001 something-else/],
    ['a volume and no container', { VOL_OUT: `${project}_db\t${project}_db\t` }, /volume tracy-issue37-stub_db/],
    ['a labelled volume of another name', { VOL_OUT: `anon0001\tanon0001\t${project}` }, /volume anon0001/],
    ['a network and no container', { NET_OUT: `ne7000000001\t${project}_default\t` }, /network ne7000000001 tracy-issue37-stub_default/]
  ]) {
    const dir = tmp('i37-docker-')
    const log = join(dir, 'calls.log')
    // decoys: a longer project name that only shares the prefix is not this project
    stub(dir, 'docker', [
      `echo "$PPID $*" >> '${log}'`,
      'case "$1 $2" in',
      '  "info "*) echo 27.0 ;;',
      `  "ps -a") printf '%b\\n' "decoy0000001\\t${project}x-db-1\\t${project}x" "$PS_OUT" ;;`,
      `  "volume ls") printf '%b\\n' "${project}x_db\\t${project}x_db\\t" "$VOL_OUT" ;;`,
      `  "network ls") printf '%b\\n' "decoy0000002\\t${project}x_default\\t${project}x" "$NET_OUT" ;;`,
      'esac',
      'exit 0'
    ].join('\n'))
    const r = await proofRun(dir, env)
    assert.equal(r.status, 1, `${what}: ${r.stderr}`)
    assert.match(r.report.error, re, what)
    assert.doesNotMatch(r.report.error, /decoy|stubx/, `${what}: a project that only shares the prefix is not this one`)
    assert.deepEqual(callsOf(log).filter((c) => MUTATING.test(c)), [], `${what}: nothing was created or removed`)
    assert.equal(r.report.stand, null, `${what}: no stand was made`)
    assert.deepEqual(readdirSync(join(dir, 'locks')), [], `${what}: the lock is released`)
  }
  // A listing docker refuses is not an empty project.
  const dir = tmp('i37-docker-')
  stub(dir, 'docker', 'case "$1 $2" in "volume ls") echo "permission denied" >&2; exit 1 ;; "info "*) echo 27.0 ;; esac\nexit 0')
  const r = await proofRun(dir)
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.report.error, /cannot list the project's resources: docker volume ls failed: permission denied/)
  assert.equal(r.report.stand, null)
})

test('#37: two proofs on one project — one holds it, the other is refused before Docker; the holder removes only what carries its run id, and fails on what it did not make', async () => {
  const dir = tmp('i37-docker-')
  const log = join(dir, 'calls.log')
  const st = (f) => join(dir, f)
  stub(dir, 'docker', [
    `echo "$PPID $*" >> '${log}'`,
    'case "$*" in',
    '  info*) sleep 2; echo 27.0 ;;',
    // after `up`, a container of the project that this run did not make (the label only) is there
    `  "ps -a --format"*) [ -f '${st('up')}' ] && printf 'f0reign00001\\ttracy-issue37-stub-db-1\\ttracy-issue37-stub\\n' ;;`,
    `  "compose "*" up "*) f=$(echo "$*" | sed -n 's/.* -f \\([^ ]*\\) .*/\\1/p'); cp "$f" '${st('compose.seen')}'; touch '${st('up')}' ;;`,
    `  "ps -a -q --filter label=org.tracy.issue37.run="*) [ -f '${st('c-gone')}' ] || echo 0urs00000001 ;;`,
    '  "inspect --format {{range .Mounts}}"*) echo "anonvol1 " ;;',
    `  "rm -f -v 0urs00000001") touch '${st('c-gone')}' ;;`,
    `  "volume rm anonvol1") touch '${st('v-gone')}' ;;`,
    `  "volume inspect anonvol1") [ -f '${st('v-gone')}' ] && exit 1 ;;`,
    `  "network ls -q --filter label=org.tracy.issue37.run="*) [ -f '${st('n-gone')}' ] || echo n0urs0000001 ;;`,
    `  "network rm n0urs0000001") touch '${st('n-gone')}' ;;`,
    'esac',
    'exit 0'
  ].join('\n'))
  const runs = await Promise.all([1, 2, 3].map(() => proofRun(dir)))
  const holders = runs.filter((r) => r.report.stand)
  assert.equal(holders.length, 1, `exactly one run made a stand: ${runs.map((r) => r.stderr).join('\n')}`)
  const holder = holders[0]
  for (const refused of runs.filter((r) => r !== holder)) {
    assert.equal(refused.status, 1)
    // the owner is always readable: a lock is never seen before it names its run
    assert.match(refused.report.error, new RegExp(`project tracy-issue37-stub is held by .*tracy-issue37-stub\\.lock: pid ${holder.pid} \\(running\\), run ${holder.report.run}`))
    assert.deepEqual(callsOf(log, refused.pid), [], 'the refused run called docker')
    assert.equal(refused.report.stand, null)
  }
  // The holder: its compose file labels every service and the network with its run id…
  const compose = readFileSync(st('compose.seen'), 'utf8')
  assert.equal(compose.split(`org.tracy.issue37.run: "${holder.report.run}"`).length - 1, 4, compose)
  // …it failed (the stand-in has no port) and cleaned up by that id only: never `compose down`, never the foreign container.
  assert.equal(holder.status, 1)
  const calls = callsOf(log, holder.pid)
  assert.ok(calls.includes(`ps -a -q --filter label=org.tracy.issue37.run=${holder.report.run}`), calls.join('\n'))
  assert.deepEqual(calls.filter((c) => /^(rm|volume rm|network rm)\b/.test(c)), ['rm -f -v 0urs00000001', 'volume rm anonvol1', 'network rm n0urs0000001'])
  assert.ok(!calls.some((c) => / down\b/.test(c)), 'compose down by project')
  const cl = holder.report.cleanup
  assert.deepEqual(cl.removed, ['container 0urs00000001', 'volume anonvol1', 'network n0urs0000001'])
  assert.deepEqual(cl.retained, [])
  // a container of the project that appeared during the run is left for someone to look at, and fails the cleanup
  assert.deepEqual(cl.foreign, ['container f0reign00001 tracy-issue37-stub-db-1'])
  assert.equal(cl.ok, false)
  assert.deepEqual(readdirSync(join(dir, 'locks')), [], 'the holder released the lock')
  assert.equal(holder.report.lock.released, true)
})

test('#37: a lock a killed proof left is refused with its owner, and stays for someone to look', async () => {
  const dir = tmp('i37-docker-')
  const log = join(dir, 'calls.log')
  stub(dir, 'docker', `echo "$PPID $*" >> '${log}'\nexit 0`)
  // a pid that is not running: the highest pid this test can find free
  let pid = 99999
  while (spawnSync('kill', ['-0', String(pid)]).status === 0) pid--
  const lock = join(dir, 'locks', 'tracy-issue37-stub.lock')
  mkdirSync(join(dir, 'locks'))
  writeFileSync(lock, JSON.stringify({ pid, run: `${pid}-old`, started: '2026-09-01T00:00:00.000Z' }))
  const r = await proofRun(dir)
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.report.error, new RegExp(`is held by .*: pid ${pid} \\(not running\\), run ${pid}-old`))
  assert.deepEqual(callsOf(log), [], 'docker was called')
  assert.equal(JSON.parse(readFileSync(lock, 'utf8')).run, `${pid}-old`, 'the old lock was taken over or removed')
  assert.deepEqual(readdirSync(join(dir, 'locks')), ['tracy-issue37-stub.lock'], 'nothing else is left beside the lock')
})

test('#37: the cleanup reports what of its run it could not remove, and fails; a listing it cannot read is not an empty one', async () => {
  const { cleanup } = await import('./issue37-wordpress.mjs')
  const stand = tmp('i37-stand-')
  const calls = []
  const fake = (_cmd, argv) => {
    calls.push(argv.join(' '))
    const line = argv.join(' ')
    if (line.startsWith('ps -a -q --filter label=org.tracy.issue37.run=r1')) return { status: 0, stdout: 'c1\n' }
    if (line.startsWith('inspect ')) return { status: 0, stdout: '' }
    if (line === 'rm -f -v c1') return { status: 1, stderr: 'device busy' }
    if (line.startsWith('network ls -q')) return { status: 1, stderr: 'daemon gone' }
    if (line.startsWith('volume ls -q')) return { status: 0, stdout: '' }
    return { status: 1, stderr: 'no' }
  }
  const out = cleanup({ o: { project: 'tracy-issue37-stub', keep: false }, runId: 'r1', stand }, { spawn: fake })
  assert.equal(out.ok, false)
  assert.ok(out.retained.includes('container c1'), JSON.stringify(out))
  assert.ok(out.retained.some((r) => /^network \(docker network ls failed: daemon gone\)/.test(r)), JSON.stringify(out))
  assert.match(out.foreign[0], /^\(not listed: /)
  assert.ok(!existsSync(stand), 'the stand directory was left')
  assert.ok(!calls.some((c) => /\bdown\b|--filter label=com\.docker\.compose\.project/.test(c)), calls.join('\n'))
  // everything of the run removed, but the project has a container of no run and a volume the run did not mount: kept, and the cleanup fails
  const stand2 = tmp('i37-stand-')
  const clean = (_cmd, argv) => {
    const line = argv.join(' ')
    if (line.startsWith('ps -a --format')) return { status: 0, stdout: 'k9\ttracy-issue37-stub-cli-keep\t\t<no value>\n' }
    if (line.startsWith('volume ls --format')) return { status: 0, stdout: 'v7\tv7\ttracy-issue37-stub\t\n' }
    if (/^(ps|volume ls|network ls)\b/.test(line)) return { status: 0, stdout: '' }
    return { status: 1, stderr: `unexpected ${line}` }
  }
  const out2 = cleanup({ o: { project: 'tracy-issue37-stub', keep: false }, runId: 'r1', stand: stand2 }, { spawn: clean })
  assert.deepEqual(out2.retained, [])
  assert.deepEqual(out2.foreign, ['container k9 tracy-issue37-stub-cli-keep', 'volume v7 v7'])
  assert.equal(out2.ok, false)
  // a container, volume and network of this run that appear only after the labelled re-check —
  // the project listing, read last, holds them: retained, never dropped between the two reads
  const stand3 = tmp('i37-stand-')
  const late = (_cmd, argv) => {
    const line = argv.join(' ')
    if (line.startsWith('ps -a --format')) return { status: 0, stdout: 'c5\ttracy-issue37-stub-cli-run-1\ttracy-issue37-stub\tr1\n' }
    if (line.startsWith('volume ls --format')) return { status: 0, stdout: 'v5\tv5\ttracy-issue37-stub\tr1\n' }
    if (line.startsWith('network ls --format')) return { status: 0, stdout: 'n5\ttracy-issue37-stub_default\ttracy-issue37-stub\tr1\n' }
    if (/^(ps|volume ls|network ls)\b/.test(line)) return { status: 0, stdout: '' }
    return { status: 1, stderr: `unexpected ${line}` }
  }
  const out3 = cleanup({ o: { project: 'tracy-issue37-stub', keep: false }, runId: 'r1', stand: stand3 }, { spawn: late })
  assert.deepEqual(out3.retained, ['container c5', 'volume v5', 'network n5'])
  assert.deepEqual(out3.foreign, [])
  assert.equal(out3.ok, false)
})

test('#37: a proof that throws after it holds the project — docker that cannot be read, a stand that cannot be made — still releases the lock and fails', async () => {
  // `docker image inspect` whose answer overflows the buffer: spawnSync's error, thrown from the preflight
  let dir = tmp('i37-docker-')
  stub(dir, 'docker', 'case "$1 $2" in "info "*) echo 27.0 ;; "image inspect") head -c 70000000 /dev/zero ;; esac\nexit 0')
  let r = await proofRun(dir)
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.report.error, /docker image inspect .*ENOBUFS/)
  assert.equal(r.report.stand, null)
  assert.equal(r.report.lock.released, true)
  assert.deepEqual(readdirSync(join(dir, 'locks')), [], 'the lock was left')
  // a temporary directory the stand cannot be made in
  dir = tmp('i37-docker-')
  stub(dir, 'docker', 'case "$1 $2" in "info "*) echo 27.0 ;; esac\nexit 0')
  const ro = join(dir, 'ro')
  mkdirSync(ro, { mode: 0o555 })
  r = await proofRun(dir, { TMPDIR: ro })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.report.error, /EACCES.*i37-wp-/)
  assert.equal(r.report.stand, null)
  assert.equal(r.report.lock.released, true)
  assert.deepEqual(readdirSync(join(dir, 'locks')), [], 'the lock was left')
  assert.deepEqual(readdirSync(ro), [])
})

test('#37: a lock that cannot be released is in the report and fails the run; it is removed only while it names the run', async () => {
  const dir = tmp('i37-docker-')
  const lock = join(dir, 'locks', 'tracy-issue37-stub.lock')
  // someone replaces the lock while the proof holds it
  stub(dir, 'docker', `case "$1 $2" in "info "*) echo '{"run":"someone-else"}' > '${lock}'; echo 27.0 ;; esac\nexit 0`)
  const r = await proofRun(dir, { TMPDIR: join(dir, 'missing') })
  assert.equal(r.status, 1, r.stderr)
  assert.equal(r.report.lock.released, false)
  assert.match(r.report.lock.error, /names run someone-else, not this run .*; left in place/)
  assert.equal(JSON.parse(readFileSync(lock, 'utf8')).run, 'someone-else', 'another run\'s lock was removed')
  // in process: released once; a lock gone or unreadable is an error, not a release
  const { takeLock } = await import('./issue37-wordpress.mjs')
  const prev = process.env.TRACY_ISSUE37_LOCK_DIR
  process.env.TRACY_ISSUE37_LOCK_DIR = join(dir, 'inproc')
  try {
    const a = takeLock('tracy-issue37-a', 'r1')
    a.release()
    assert.ok(!existsSync(a.path))
    const b = takeLock('tracy-issue37-a', 'r2')
    rmSync(b.path)
    assert.throws(() => b.release(), /cannot read the lock .* to release it/)
    const c = takeLock('tracy-issue37-a', 'r3')
    writeFileSync(c.path, 'not json')
    assert.throws(() => c.release(), /cannot read the lock/)
    assert.equal(readFileSync(c.path, 'utf8'), 'not json')
  } finally {
    if (prev === undefined) delete process.env.TRACY_ISSUE37_LOCK_DIR
    else process.env.TRACY_ISSUE37_LOCK_DIR = prev
  }
})

test('#37: before a seed, anything of the project not this run\'s is refused; a listing or inspect that fails is an error, never "not there"', async () => {
  const { strangers } = await import('./issue37-wordpress.mjs')
  const P = 'tracy-issue37-stub'
  const answer = (over = {}) => (argv) => {
    const line = argv.join(' ')
    for (const [k, v] of Object.entries(over)) if (line.startsWith(k)) return v
    if (line.startsWith('ps -a --format')) return { status: 0, stdout: `c1\t${P}-db-1\t${P}\tr1\n` }
    if (line.startsWith('volume ls --format')) return { status: 0, stdout: `anon1\tanon1\t${P}\t<no value>\n` }
    if (line.startsWith('network ls --format')) return { status: 0, stdout: `n1\t${P}_default\t${P}\tr1\n` }
    if (line.startsWith('inspect ')) return { status: 0, stdout: 'anon1 ' }
    return { status: 1, stderr: `unexpected ${line}` }
  }
  // the run's own containers, network and the anonymous volume mounted in them: nothing strange
  assert.deepEqual(strangers(P, 'r1', answer()), [])
  // the runner's container of another run, or of none: strange, whatever its name
  assert.deepEqual(
    strangers(P, 'r1', answer({ 'ps -a --format': { status: 0, stdout: `c1\t${P}-db-1\t${P}\tr1\nk9\t${P}-cli-keep\t\t<no value>\nk8\tother\t${P}\tr0\n` } })).map((r) => `${r.kind} ${r.id}`),
    ['container k9', 'container k8']
  )
  // a volume not mounted in the run's containers is not the run's
  assert.deepEqual(strangers(P, 'r1', answer({ inspect: { status: 0, stdout: '' } })).map((r) => `${r.kind} ${r.id}`), ['volume anon1'])
  // what cannot be read throws: a listing, or the mounts of one of the run's containers
  assert.throws(() => strangers(P, 'r1', answer({ 'ps -a --format': { status: 1, stderr: 'daemon busy' } })), /docker ps -a failed: daemon busy/)
  assert.throws(() => strangers(P, 'r1', answer({ 'network ls': { error: new Error('spawn ETIMEDOUT') } })), /docker network ls failed: spawn ETIMEDOUT/)
  assert.throws(() => strangers(P, 'r1', answer({ inspect: { status: 1, stderr: 'Error response from daemon: timeout' } })), /docker inspect c1 failed: .*timeout/)
})

test('#37: the baseline takes its temporary checkout with it when the archive fails', () => {
  const dir = tmp('i37-git-')
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  assert.ok(realGit, 'git is not on PATH')
  stub(dir, 'git', `if [ "$1" = archive ]; then echo 'archive refused' >&2; exit 1; fi\nexec '${realGit}' "$@"`)
  const temp = join(dir, 'tmp')
  mkdirSync(temp)
  const r = spawnSync(process.execPath, [join(here, 'issue37-baseline.mjs'), '--base', 'bb25611d0b39b7f00ea7e62453d81df56fba836d', '--out', join(dir, 'out')], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TMPDIR: temp }
  })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /git archive .*archive refused/)
  assert.deepEqual(readdirSync(temp), [], 'the checkout directory was left behind')
})

test('#37: a review config that is missing, empty or not JSON stops contract init with its path', async () => {
  const dir = tmp('i37-cfg-')
  const spec = join(dir, 'spec')
  mkdirSync(join(spec, 'reference'), { recursive: true })
  writeFileSync(join(spec, 'page-map.json'), JSON.stringify({ locales: ['en'], defaultLocale: 'en', pages: [] }))
  const theme = join(dir, 'theme')
  mkdirSync(join(theme, 'templates'), { recursive: true })
  for (const [name, text] of [['empty.json', ''], ['broken.json', '{"containers": ']]) {
    const f = join(dir, name)
    writeFileSync(f, text)
    await assert.rejects(contractApi.initContract({ specDir: spec, configFile: f, builtTheme: theme }), (e) => e.message.includes(f) && /not JSON/.test(e.message))
  }
  const gone = join(dir, 'missing.json')
  await assert.rejects(contractApi.initContract({ specDir: spec, configFile: gone, builtTheme: theme }), (e) => e.message.includes(gone) && /cannot be read/.test(e.message))
})
