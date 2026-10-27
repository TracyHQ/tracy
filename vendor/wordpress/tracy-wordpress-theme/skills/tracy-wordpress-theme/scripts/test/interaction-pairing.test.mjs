// Interaction parity pairs a control by what a visitor meets — role, place, shape — not by its name. Each fixture is the shape of a live false
// positive (a differently named but equivalent control, a current item marked by style only, a newsletter form with other field names, a drawer that
// opens under other labels, a form the tool cannot drive); each must produce NO finding, and the real difference beside it must still be one.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { lazyBrowser } from '../lib/browser.mjs'
import { counterpartOf, pairByOrder } from '../lib/control-pairing.mjs'
import { drawerFindings, formFindings, headerFindings, measureDrawer, measureForms, measureHeader, measureTouch, navCurrentVerdict, pairFields, touchFindings } from '../visual/interaction-parity.mjs'
import { advisoryMarkdown, groupInteractionFindings, interactionAdvisory, interactionClaimOf, interactionLine, interactionNotes, interactionSummaryOf } from '../visual/interaction-report.mjs'
import { exitCodeOf } from '../visual/report.mjs'
import { interactionAttestationProblems } from '../visual/interaction-report.mjs'
import { CHECKS, TIERS, owedCases } from '../visual/interaction-page-contract.mjs'

const pages = new Map()
let server
let origin
const handle = lazyBrowser()
let browser
before(async () => {
  server = http.createServer((req, res) => {
    const html = pages.get(req.url.split('?')[0])
    res.writeHead(html == null ? 404 : 200, { 'content-type': 'text/html' })
    res.end(html ?? 'not found')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await handle.get()
})
after(async () => {
  await handle.close()
  await new Promise((r) => server.close(r))
})
const put = (path, html) => { pages.set(path, `<!doctype html><meta charset=utf-8><body>${html}`); return { url: `${origin}${path}` } }
const kinds = (r) => r.findings.map((f) => f.kind)
const BASE = 'body{margin:0;font:16px sans-serif}header{display:flex;align-items:center;gap:24px;height:80px;padding:0 40px;border-bottom:1px solid #ccc}a{color:#333;text-decoration:none}.logo{font-weight:700;width:100px}ul{list-style:none;display:flex;gap:24px;margin:0;padding:0}'

test('interaction attestation: none pages carry typed N/A only on paired cases; a report cannot exempt an html page', () => {
  const coverage = owedCases({ pages: ['/'], chromePages: ['/'] }).map((c) =>
    c.check === 'contrast' ? { ...c, measured: true } : { ...c, measured: true, status: 'not-applicable', reason: 'reference.kind=none' }
  )
  const record = {
    tool: 'interaction-parity/7', status: 'run', thresholds: { geometryPx: 2, minTargetPx: 24, minContrast: 4.5 },
    tiers: TIERS, origins: { site: 'http://site.test', source: null }, chromePages: ['/'], pages: ['/'], checks: CHECKS,
    examined: 1, coverage, obligations: [], outcomes: [], discoveries: coverage.filter((c) => c.check === 'drawer' || c.check === 'form').map((c) => ({ ...c, complete: true, count: 0 })), findings: [], groups: [], notMeasured: [], blocking: false
  }
  assert.deepEqual(interactionAttestationProblems(record, { referenceKinds: { '/': 'none' } }), [])
  assert.match(interactionAttestationProblems(record, { referenceKinds: { '/': 'html' } }).join(), /not-applicable without a bound reference.kind=none/)
  const missingTarget = structuredClone(record)
  missingTarget.coverage.find((c) => c.check === 'contrast').measured = false
  assert.match(interactionAttestationProblems(missingTarget, { referenceKinds: { '/': 'none' } }).join(), /NOT measured/)
})

test('none interaction: target drawer parents that open no children fail without a source', () => {
  const r = drawerFindings({
    route: '/', source: null, theme: 'light',
    site: { measured: true, width: 390, states: [{ path: [], depth: 0, labels: [], rows: 1 }, { path: [0], depth: 1, labels: ['Services'], rows: 1, model: 'none', children: [], kids: [] }] }
  })
  assert.ok(r.findings.some((f) => f.kind === 'drawer-submenu-not-opened'), JSON.stringify(r))
})

test('none interaction: a target touch submenu control that does not open or navigates fails without a source', () => {
  const r = touchFindings({
    route: '/', compare: false, source: null,
    site: { measured: true, width: 1024, controls: [{ label: 'Services', key: 'services', w: 40, h: 40, hitOk: true, opened: false, navigated: true }] }
  })
  assert.ok(r.findings.some((f) => f.kind === 'touch-not-opened' && /followed a link/.test(f.reason)), JSON.stringify(r))
})

test('none interaction: a valid target form that does not submit fails without a source', () => {
  const r = formFindings({
    route: '/', source: null,
    site: { measured: true, width: 1440, total: 1, forms: [{ index: 0, action: '/contact', fields: [], submit: { label: 'Send' }, attempt: { fired: false, invalid: [] }, state1: { disabled: false, invalid: [] }, dupKeys: [] }] }
  })
  assert.ok(r.findings.some((f) => f.kind === 'form-submit-blocked'), JSON.stringify(r))
})

// ── header controls: the chevron beside a link is that link's, an unnamed three-bar button is the menu button ──
const sourceHeader = `<style>${BASE}.navbar-toggler{display:none}@media(max-width:991px){nav{display:none}.navbar-toggler{display:block;width:40px;height:40px;border:0;background:none}}</style>
<header><a class="logo" href="/" rel="home">Brand</a><nav><ul><li><a href="/">Home</a></li><li><a class="dropdown-toggle" href="/services">Our Services</a></li></ul></nav>
<button class="navbar-toggler" aria-label="Toggle navigation" aria-expanded="false"><span class="bar"></span></button></header><main><p>Body</p></main>`
const portHeader = (extra = '', burger = '<button class="burger" style="width:40px;height:40px"><i style="display:block;height:3px;width:24px;background:#000;margin:5px"></i><i style="display:block;height:3px;width:24px;background:#000;margin:5px"></i><i style="display:block;height:3px;width:24px;background:#000;margin:5px"></i></button>') =>
  `<style>${BASE}.burger{display:none}.mega{display:flex;align-items:center}.mega button{width:24px;height:45px;border:0;background:none}.sr{position:absolute;left:-9999px}@media(max-width:991px){nav,.mega{display:none}.burger{display:block}}</style>
<header><a class="logo" href="/" rel="home">Brand</a><nav><ul><li><a href="/">Home</a></li></ul></nav>
<div class="mega"><a href="/services">Our Services</a><button type="button" aria-expanded="false" aria-controls="m1"><span class="sr">Show the Our Services menu</span>▾</button><div id="m1" hidden><a href="/services/a">A</a></div></div>${burger}${extra}</header><main><p>Body</p></main>`

test('header: a submenu chevron beside a link is not the menu button, and an unnamed three-bar button is the source\'s named one', async () => {
  const src = put('/h/src', sourceHeader)
  const port = put('/h/port', portHeader())
  for (const width of [1440, 1024, 768, 390]) {
    const r = headerFindings({ route: '/', site: await measureHeader(browser, port, { width }), source: await measureHeader(browser, src, { width }) })
    assert.deepEqual(r.findings.filter((f) => /^header-control/.test(f.kind)), [], `${width}: ${JSON.stringify(r.findings)}`)
  }
  const wide = await measureHeader(browser, port, { width: 1440 })
  assert.equal(wide.header.controls.hamburger, undefined, 'the chevron is no hamburger on desktop')
})

test('header: a menu button the site really shows on desktop where the source has none is still header-control-extra', async () => {
  const src = put('/h/src2', sourceHeader)
  const port = put('/h/port2', portHeader().replace('.burger{display:none}', '.burger{display:block}').replace('.mega{display:flex', '.mega{display:flex'))
  const r = headerFindings({ route: '/', site: await measureHeader(browser, port, { width: 1440 }), source: await measureHeader(browser, src, { width: 1440 }) })
  assert.ok(kinds(r).includes('header-control-extra'), JSON.stringify(r.findings))
})

test('header: a role one side lacks is paired with the unrecognised control of the same shape on the same edge, and only then', () => {
  const have = { x: 1300, y: 20, w: 40, h: 40 }
  assert.deepEqual(counterpartOf(have, [{ x: 1302, y: 22, w: 36, h: 38 }], { haveWidth: 1440, lackWidth: 1440 }), { x: 1302, y: 22, w: 36, h: 38 })
  assert.equal(counterpartOf(have, [{ x: 20, y: 20, w: 40, h: 40 }], { haveWidth: 1440, lackWidth: 1440 }), null, 'the other edge')
  assert.equal(counterpartOf(have, [{ x: 1302, y: 22, w: 36, h: 38 }, { x: 1250, y: 22, w: 36, h: 38 }], { haveWidth: 1440, lackWidth: 1440 }), null, 'two candidates: not guessed')
  assert.equal(counterpartOf(have, [{ x: 1302, y: 22, w: 300, h: 20 }], { haveWidth: 1440, lackWidth: 1440 }), null, 'another shape')
  const { pairs, source, site } = pairByOrder([{ label: 'a' }, { label: 'b' }], [{ label: 'x' }, { label: 'y' }])
  assert.equal(pairs.length, 2); assert.equal(source.length + site.length, 0)
})

// ── the current item: marked on both sides, in other ways ──
const navHeader = (items) => `<style>${BASE}nav{display:flex;gap:24px}.mark{border-bottom:2px solid #0050d0;color:#0050d0;font-weight:700}.mega{display:flex}</style><header><a class="logo" href="/" rel="home">Brand</a><nav>${items}</nav></header><main><p>Body</p></main>`
const sourceNav = navHeader(`<ul><li><a href="/">Home</a></li><li class="active parent"><a href="/portfolio">Portfolio</a></li><li><a href="/news">News</a></li><li><a href="/contact">Contact</a></li></ul>`)
const portNavStyled = navHeader(`<ul><li><a href="/">Home</a></li></ul><div class="mega"><a class="mark" href="/portfolio">Portfolio</a></div><ul><li><a href="/news">News</a></li><li><a href="/contact">Contact</a></li></ul>`)
const portNavNone = navHeader(`<ul><li><a href="/">Home</a></li></ul><div class="mega"><a href="/portfolio">Portfolio</a></div><ul><li><a href="/news">News</a></li><li><a href="/contact">Contact</a></li></ul>`)

test('nav current: marked by a class on the source and by style alone on a port whose mega item is no list item is the same section', async () => {
  const s = await measureHeader(browser, put('/n/src', sourceNav), { width: 1440 })
  const ok = await measureHeader(browser, put('/n/styled', portNavStyled), { width: 1440 })
  assert.deepEqual(s.nav.current, ['Portfolio'])
  assert.deepEqual(ok.nav.current, ['Portfolio'])
  assert.equal(ok.nav.links, 4, 'the row of links is read across the list and the wrapper')
  assert.deepEqual(headerFindings({ route: '/', site: ok, source: s }).findings, [])
  const none = headerFindings({ route: '/', site: await measureHeader(browser, put('/n/none', portNavNone), { width: 1440 }), source: s })
  assert.deepEqual(kinds(none), ['nav-current-missing'], 'the real difference: the source marks one, the port none')
})

test('nav current: the verdict compares by words, page or place; one side marking and the other not is the only gap', () => {
  const e = (label, path, on) => ({ label, path, explicit: on, styled: false })
  const src = { links: 3, entries: [e('Home', '/', false), e('Portfolio', '/portfolio', true), e('News', '/news', false)] }
  assert.equal(navCurrentVerdict(src, { links: 3, entries: [e('Home', '/', false), e('Work', '/portfolio/', true), e('News', '/news', false)] }), null, 'the same page under another name')
  assert.equal(navCurrentVerdict(src, { links: 3, entries: [e('Home', '/', false), e('Folio', '/work', true), e('News', '/news', false)] }), null, 'the same place in the row')
  assert.equal(navCurrentVerdict(src, { links: 3, entries: [e('Home', '/', true), e('Portfolio', '/p', false), e('News', '/news', false)] })?.kind, 'nav-current-wrong')
  assert.equal(navCurrentVerdict({ links: 3, entries: src.entries.map((x) => ({ ...x, explicit: false })) }, src)?.kind, 'nav-current-extra')
})

// ── forms: the same newsletter under other names ──
const newsletterSource = `<footer><form id="formAcym1" method="POST" action="/index.php/component/acym/frontusers" onsubmit="return false"><h4>Join 150K+ Designers</h4><input name="user[email]" placeholder="Email" type="email" required>
<input type="button" class="btn subbutton" value="Subscribe" name="Submit" onclick="void 0"></form></footer>`
const newsletterPort = (req = 'required') => `<footer><form id="jv-newsletter" method="post" action="/wp-admin/admin-post.php" onsubmit="return false"><input type="hidden" name="action" value="jv"><input type="text" name="jv_website" style="position:absolute;left:-9999px" tabindex="-1" autocomplete="off">
<input type="email" name="jv_email" aria-label="Your e-mail address" ${req}><button type="submit">Join</button></form></footer>`

test('forms: a newsletter form whose fields and button are named otherwise is the same form — no form-missing, no required gap', async () => {
  const [a, b] = await Promise.all([measureForms(browser, put('/f/port', newsletterPort())), measureForms(browser, put('/f/src', newsletterSource))])
  const r = formFindings({ route: '/', site: a, source: b })
  assert.deepEqual(r.findings, [], JSON.stringify(r))
  assert.deepEqual(r.notMeasured, [], JSON.stringify(r.notMeasured))
  assert.ok(r.examined > 0)
})

test('forms: a field the source requires and the paired site field does not is still form-missing-required (the name is no part of the pairing)', async () => {
  const [a, b] = await Promise.all([measureForms(browser, put('/f/port2', newsletterPort(''))), measureForms(browser, put('/f/src2', newsletterSource))])
  const r = formFindings({ route: '/', site: a, source: b })
  assert.deepEqual(kinds(r), ['form-missing-required'], JSON.stringify(r.findings))
  assert.ok(!kinds(r).includes('form-missing'))
})

test('forms: a form with no counterpart in purpose or controls is still form-missing; fields pair by kind when the names differ', async () => {
  const contact = put('/f/contact', `<main><form action="/c" method="post" onsubmit="return false"><input name="n" aria-label="Name" required><textarea name="m" aria-label="Message"></textarea><button type="submit">Send</button></form></main>`)
  const [a, b] = await Promise.all([measureForms(browser, put('/f/port3', newsletterPort())), measureForms(browser, contact)])
  assert.deepEqual(kinds(formFindings({ route: '/', site: a, source: b })), ['form-missing'])
  const m = pairFields([{ type: 'email', shown: true, label: 'Email' }], [{ type: 'email', shown: true, label: 'Your e-mail address' }, { type: 'text', shown: false, label: 'x' }])
  assert.equal(m.size, 2)
})

// ── forms: the Joomla com_tags filter (ja-diner S-39): the source's only button is `type="button"` with an icon and `onclick="document.adminForm.submit()"` ──
const tagFilterSource = `<main><form action="/tagged" method="post" name="adminForm" id="adminForm"><fieldset><label for="fs">Enter Part of Title</label>
<input type="text" name="filter-search" id="fs" class="form-control" onchange="document.adminForm.submit();" placeholder="Enter Part of Title">
<button type="button" name="filter-search-button" title="Search" onclick="document.adminForm.submit();" class="btn btn-light"><span class="fa fa-search" aria-hidden="true"></span></button>
<button type="reset" name="filter-clear-button" title="Clear" class="btn btn-light"><span class="fa fa-times"></span></button>
<label for="limit">Display #</label><select id="limit" name="limit" onchange="document.adminForm.submit();"><option value="5">5</option><option value="20" selected>20</option></select></fieldset></form></main>`
const tagFilterPort = `<main><form action="/tagged" method="get" name="adminForm" id="adminForm"><fieldset><label for="fs">Enter Part of Title</label>
<input type="text" name="filter-search" id="fs" class="form-control" placeholder="Enter Part of Title">
<button type="submit" name="filter-search-button" title="Search" class="btn btn-light"><span class="fa fa-search" aria-hidden="true"></span></button>
<button type="button" name="filter-clear-button" title="Clear" class="btn btn-light"><span class="fa fa-times"></span></button>
<label for="limit">Display #</label><select id="limit" name="limit"><option value="5">5</option><option value="20" selected>20</option></select></fieldset></form></main>`

test('forms: a script-submitted filter form (an icon button whose onclick calls form.submit()) has a submit control and is measured (ja-diner S-39)', async () => {
  const [a, b] = await Promise.all([measureForms(browser, put('/f/tagport', tagFilterPort)), measureForms(browser, put('/f/tagsrc', tagFilterSource))])
  assert.ok(b.forms[0].submit, 'the source form has a submit control: the button that calls adminForm.submit()')
  const r = formFindings({ route: '/tagged', site: a, source: b })
  assert.deepEqual(r.notMeasured, [], JSON.stringify(r.notMeasured))
  assert.ok(r.examined > 0)
})

test('forms: an AcyMailing subscribe form — a button script posting new FormData(form), no submit event — is measured as submitted (ja-restaurant S-29)', async () => {
  const acym = (id, marker = id) => `<footer><form id="${id}" name="${id}" method="post" enctype="multipart/form-data" action="/index.php/component/acym/frontusers"><input type="email" name="user[email]" aria-label="Email" required>
<input type="hidden" name="ctrl" value="frontusers"><input type="hidden" name="task" value="notask"><input type="hidden" name="option" value="com_acym">
<input type="hidden" name="acyformname" value="${marker}"><input type="hidden" name="acysubmode" value="mod_acym"><input type="button" class="btn subbutton" value="Subscribe" name="Submit"
onclick="var f=document.getElementById('${id}');f.task.value='subscribe';var x=new XMLHttpRequest();x.open('POST',f.action+'?ajax=1');x.send(new FormData(f));return false"></form></footer>`
  const a = await measureForms(browser, put('/f/acym', acym('formAcym98711')))
  assert.equal(a.forms[0].attempt?.fired, true, JSON.stringify(a.forms[0].attempt))
  assert.equal(a.forms[0].attempt.lifecycle, 'acym')
  // a marker that is not the form's own id says nothing: still not measured
  const b = await measureForms(browser, put('/f/acym-other', acym('formAcym98711', 'formAcym1')))
  assert.equal(b.forms[0].attempt?.fired, null, JSON.stringify(b.forms[0].attempt))
})

test('a page the contract declares at 404 is read at that status on both sides; an undeclared 404 is still no page (ja-restaurant S-31)', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const page = { id: 'en-404', route: '/404', siteUrl: `${origin}/gone-site`, sourceUrl: `${origin}/gone-source` }
  const run = (p) => measureInteractions({ browser, pages: [p], checks: ['header', 'form', 'carousel'], headerWidths: [1440] })
  const declared = await run({ ...page, status: 404 })
  assert.deepEqual(declared.notMeasured, [], JSON.stringify(declared.notMeasured))
  assert.ok(declared.examined > 0 && declared.coverage.every((c) => c.measured), JSON.stringify(declared.coverage))
  const undeclared = await run(page)
  assert.ok(undeclared.notMeasured.some((n) => /answered 404/.test(n.reason)), JSON.stringify(undeclared.notMeasured))
  // a page declared at 404 that answers 200 is not the page the contract declares
  put('/f/served-200', '<main><p>Found after all</p></main>')
  const found = await run({ ...page, siteUrl: `${origin}/f/served-200`, status: 404 })
  assert.ok(found.notMeasured.some((n) => /answered 200, not the 404 the contract declares/.test(n.reason)), JSON.stringify(found.notMeasured))
})

test('forms: controls that share a label on both sides in the same order pair in order (ja-restaurant S-30); a run that differs stays not measured', async () => {
  const form = (second = '<select multiple id="s2"><option>One</option><option>Two</option></select>') =>
    `<main><form action="/t" method="post" onsubmit="return false"><label for="e">Email</label><input id="e" type="email" required><label for="s1">Selects</label><select id="s1"><option>One</option></select><label for="s2">Selects</label>${second}<button type="submit">Submit</button></form></main>`
  const [a, b] = await Promise.all([measureForms(browser, put('/f/dup-port', form())), measureForms(browser, put('/f/dup-src', form()))])
  assert.deepEqual(b.forms[0].dupKeys, ['selects'], JSON.stringify(b.forms[0].dupKeys))
  const r = formFindings({ route: '/', site: a, source: b })
  assert.ok(!r.notMeasured.some((n) => /same label/.test(n.reason)), JSON.stringify(r.notMeasured))
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  assert.ok(r.examined > 0)
  // the port's second "Selects" is a text field: the n-th is not the n-th, the mapping stays ambiguous
  const c = await measureForms(browser, put('/f/dup-other', form('<input id="s2" type="text">')))
  assert.ok(formFindings({ route: '/', site: c, source: b }).notMeasured.some((n) => /same label/.test(n.reason)))
})

test('forms: a Joomla filter form whose icon button posts it with document.<name>.submit() is measured as submitted (ja-restaurant tagged items)', async () => {
  // com_tags tagged items: POST adminForm, a type=button "Search" icon (title only) whose onclick submits the form, a reset button beside it
  const src = put('/f/tags-src', `<main><form action="/f/tags-src" method="post" name="adminForm" id="adminForm"><label for="fs" class="visually-hidden">Enter Part of Title</label>
<input type="text" name="filter-search" id="fs" placeholder="Enter Part of Title"><button type="button" name="filter-search-button" title="Search" onclick="document.adminForm.submit();" class="btn"><span class="fa fa-search"></span></button>
<button type="reset" title="Clear" class="btn" onclick="document.adminForm.submit();"><span class="fa fa-remove"></span></button>
<label for="limit">Display #</label><select id="limit" name="limit" onchange="this.form.submit()"><option>10</option><option selected>20</option></select></form></main>`)
  const port = put('/f/tags-port', `<main><form action="/f/tags-port" method="get" id="adminForm"><label for="fs" class="visually-hidden">Enter Part of Title</label>
<input type="text" name="filter-search" id="fs" placeholder="Enter Part of Title"><button type="submit" title="Search" class="btn"><span class="fa fa-search"></span></button>
<button type="button" title="Clear" class="btn"><span class="fa fa-remove"></span></button>
<label for="limit">Display #</label><select id="limit" name="limit"><option>10</option><option selected>20</option></select></form></main>`)
  const [a, b] = await Promise.all([measureForms(browser, port), measureForms(browser, src)])
  assert.ok(b.forms[0].submit, 'the onclick button that submits its own form is the source submit')
  assert.equal(b.forms[0].attempt?.fired, true, JSON.stringify(b.forms[0].attempt))
  assert.equal(b.forms[0].attempt?.lifecycle, 'navigation')
  const r = formFindings({ route: '/', site: a, source: b })
  assert.deepEqual(r.notMeasured, [], JSON.stringify(r.notMeasured))
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  assert.ok(r.examined > 0)
  // a button that submits ANOTHER form is not this form's submit
  const other = await measureForms(browser, put('/f/tags-other', `<main><form action="/x" method="post" name="adminForm"><input name="title" aria-label="Title"><button type="button" title="Search" onclick="document.otherForm.submit();">?</button></form></main>`))
  assert.equal(other.forms[0].submit, null, JSON.stringify(other.forms[0].submit))
})

test('forms: a page the tool cannot drive is not measured with its reason — never a crash; a script that navigates is read as a submit', async () => {
  const nav = put('/f/nav', `<form action="/f/nav" method="get"><input name="title" aria-label="Filter" required><button type="button" class="submit" onclick="this.form.submit()">Go</button></form>`)
  const a = await measureForms(browser, nav)
  assert.equal(a.measured, true)
  const rec = a.forms[0]
  assert.ok(rec.error || rec.attempt?.fired === true || rec.attempt?.fired === null, JSON.stringify(rec.attempt))
  const reload = put('/f/reload', `<form action="/f/reload" method="get"><input name="title" aria-label="Filter"><button type="submit" onclick="setTimeout(() => location.reload(), 50)">Go</button></form><form action="/f/x" onsubmit="return false"><input name="z" aria-label="Zed"><button type="submit">Z</button></form>`)
  const b = await measureForms(browser, reload)
  const r = formFindings({ route: '/', site: b, source: b })
  assert.ok(Array.isArray(r.findings) && Array.isArray(r.notMeasured))
  assert.equal(b.forms.length, 2, 'the form after the one that left the page is read on a fresh load')
})

// ── the drawer: opened for real on both sides, under other labels ──
const drawerCss = `${BASE}.burger{width:48px;height:48px;border:0;background:none}.panel{position:fixed;top:0;right:0;width:300px;height:100%;background:#fff;transform:translateX(100%);transition:none}.panel.open{transform:none}.panel ul{display:block}.panel li{display:block;padding:8px}.sub{display:none}.sub.open{display:block}`
const drawerSource = `<style>${drawerCss}</style><header><a class="logo" href="/">Brand</a><button class="navbar-toggler burger" onclick="document.getElementById('p').classList.add('open')"><span style="display:block;height:3px;width:24px;background:#000"></span><span style="display:block;height:3px;width:24px;background:#000;margin-top:5px"></span></button></header>
<div class="panel offcanvas" id="p"><ul><li><a href="/">Home</a></li><li><a href="/services">Services</a><button class="toggle" aria-expanded="false" onclick="this.nextElementSibling.classList.toggle('open')">+</button><ul class="sub"><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li></ul></li></ul></div>`
const drawerPort = `<style>${drawerCss}</style><header><a class="logo" href="/">Brand</a><div class="mega"><a href="/services">Services</a><button type="button" aria-expanded="false" aria-controls="x" style="width:24px;height:30px" onclick="">▾<span style="position:absolute;left:-9999px">Show the Services menu</span></button><div id="x" hidden></div></div>
<button class="burger" aria-label="Open the menu" aria-controls="p" aria-expanded="false" onclick="document.getElementById('p').classList.add('open')"><i style="display:block;height:3px;width:24px;background:#000"></i><i style="display:block;height:3px;width:24px;background:#000;margin-top:5px"></i></button></header>
<div class="panel" id="p"><div class="item"><a href="/">Home</a></div><div class="item"><a href="/services">Services</a><button type="button" aria-expanded="false" aria-controls="s1" onclick="document.getElementById('s1').classList.toggle('open');this.setAttribute('aria-expanded','true')" style="width:30px;height:30px">▸<span style="position:absolute;left:-9999px">Show the Services menu</span></button><div class="sub" id="s1"><ul><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li></ul></div></div></div>`

test('drawer: a drawer that opens on both sides under other labels (an unnamed bar button, a disclosure beside a link) is measured and clean', async () => {
  const src = put('/d/src', drawerSource)
  const port = put('/d/port', drawerPort)
  const [a, b] = await Promise.all([measureDrawer(browser, port, { width: 390 }), measureDrawer(browser, src, { width: 390 })])
  assert.equal(a.measured, true, JSON.stringify(a))
  assert.equal(b.measured, true, JSON.stringify(b))
  const r = drawerFindings({ route: '/', site: a, source: b, theme: 'light' })
  assert.deepEqual(r.findings.filter((f) => /missing|not-opened/.test(f.kind)), [], JSON.stringify(r.findings))
})

test('touch: submenu controls the site names otherwise are paired by place; with no counterpart left it is still touch-not-opened', () => {
  const c = (label, opened = true) => ({ label, key: label.toLowerCase(), w: 40, h: 40, hitOk: true, opened })
  const mk = (...controls) => ({ width: 1024, measured: true, context: 'nav', controls })
  assert.deepEqual(touchFindings({ route: '/', site: mk(c('Show the Our Services menu')), source: mk(c('Our Services')) }).findings, [])
  assert.deepEqual(touchFindings({ route: '/', site: mk(c('Show the Our Services menu', false)), source: mk(c('Our Services')) }).findings.map((f) => f.kind), ['touch-not-opened'])
  assert.deepEqual(touchFindings({ route: '/', site: mk(), source: mk(c('Our Services')) }).findings.map((f) => f.kind), ['touch-not-opened'])
})

// ── counting: one cause is one group ──
test('groups: one header-control-extra on many routes and widths is one cause with its routes; the rows stay', () => {
  const rows = []
  for (const route of ['/a', '/b', '/c']) for (const width of [992, 1024]) rows.push({ kind: 'header-control-extra', route, width, control: 'hamburger', site: 'Show the menu' })
  rows.push({ kind: 'form-missing-required', route: '/a', width: 1440, form: 'Log in', control: 'Username', type: 'text', source: 'required', site: 'optional' })
  const groups = groupInteractionFindings(rows)
  assert.equal(groups.length, 2)
  assert.deepEqual([groups[0].count, groups[0].routes, groups[0].widths], [6, ['/a', '/b', '/c'], [992, 1024]])
  const advisory = interactionAdvisory({ status: 'run', findings: rows, notMeasured: [] })
  assert.equal(advisory.length, 2, 'one advisory row per cause')
  assert.equal(rows.length, 7)
})

// ── advisory: findings are a list to read, never a verdict ──
const runRecord = (over = {}) => ({ status: 'run', tool: 'x', pages: ['/'], checks: ['header'], examined: 10, findings: [], notMeasured: [], ...over })
const FINDING = { kind: 'header-control-extra', route: '/', width: 1024, control: 'hamburger', site: 'Show the menu' }

test('advisory: findings are not machine rows, not blocking, and never make the run exit non-zero', () => {
  const record = runRecord({ findings: [FINDING, { ...FINDING, route: '/b' }] })
  assert.deepEqual(interactionNotes(record), [], 'no machine row for a finding')
  const claim = interactionClaimOf(record)
  assert.equal(claim.blocking, 0)
  assert.equal(claim.advisory, 2)
  assert.equal(claim.findings, 2, 'the count is still reported')
  const summary = interactionSummaryOf(claim)
  assert.equal(exitCodeOf({ findings: 0, unclassified: 0, interaction: summary }), 0)
  assert.match(interactionLine(summary), /advisory findings 2 .*not counted/)
  assert.doesNotMatch(interactionLine(summary), /blocks the run/)
  const rows = interactionAdvisory(record)
  assert.equal(rows.length, 1)
  assert.match(advisoryMarkdown(rows, 'now'), /second port classified/)
})

test('advisory: a probe that crashed, a state not measured and a probe that read nothing still block, visibly', () => {
  const failed = interactionClaimOf({ status: 'failed', reason: 'the probe failed: boom' })
  assert.equal(failed.blocking, 1)
  assert.equal(exitCodeOf({ findings: 0, unclassified: 0, interaction: interactionSummaryOf(failed) }), 1)
  assert.equal(interactionNotes({ status: 'failed', reason: 'boom' }).length, 1, 'the crash stays a machine row')
  const unmeasured = runRecord({ notMeasured: [{ route: '/x', check: 'form', reason: 'no form' }] })
  assert.equal(interactionClaimOf(unmeasured).blocking, 1)
  assert.equal(interactionNotes(unmeasured).length, 1)
  assert.equal(exitCodeOf({ findings: 0, unclassified: 0, interaction: interactionSummaryOf(interactionClaimOf(unmeasured)) }), 1)
  assert.equal(interactionClaimOf(runRecord({ examined: 0 })).blocking, 1)
  assert.deepEqual(interactionAdvisory({ status: 'failed' }), [], 'a probe that did not run has no advisory list')
})
