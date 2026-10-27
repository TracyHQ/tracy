// Issue #73 — what the Joomla adapter and the dump dropped on the JA Nova (T4) port: {loadmoduleid}, the
// full-text image, the featured view, hidden menu items, author profiles, contact details, a redirected
// route's status, a menu item's page heading. Fixture: scripts/test/fixtures/issue73/nova (a sanitized
// mini-site on the joomla-min T4 template capture). Each test names the row of the issue it covers.
//
// S-11 (template-computed values: counters, image side, slide direction) has no test: the spec has no place to
// declare them (content-contract.mjs is the visual branch's) — see references/inputs/from-joomla.md, "Known gaps".
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { checkRenderRoutes } from '../ingest/from-joomla.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { authorProfiles, contactRow, menuShown, pageHeading, resolveModuleLoads, routeAnswer } from '../ingest/joomla-normalize.mjs'
import { assignedTo } from '../lib/joomla-inventory.mjs'
import { PUBLISHING_MARKER, bumpEpoch, recheckGeneration, treeDigest, verifyGeneration } from '../ingest/joomla-generation.mjs'
import { CAPTURE_LIMITS, crawlRoutes, fetchBounded, followImports, locationOf, readTar, safeSegments, stylesheetLinks, writeEntries } from '../ingest/joomla-capture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const NOVA = join(here, 'fixtures', 'issue73', 'nova')
const CAPTURE = join(here, 'fixtures', 'joomla-min', 'capture')
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
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
/** A copy of the Nova fixture with the T4 capture beside it; `edit(inv, routes)` changes the rows first. */
const novaDir = (edit = () => {}) => {
  const dir = tmp('i73-nova-')
  cpSync(NOVA, dir, { recursive: true })
  cpSync(CAPTURE, join(dir, 'capture'), { recursive: true })
  const inv = readJson(join(dir, 'inventory.json'))
  const routes = readJson(join(dir, 'render-routes.json'))
  edit(inv, routes)
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(routes))
  return dir
}
const build = (dir, extra = {}) => {
  const out = join(tmp('i73-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z', ...extra })
  return { out, notes: result.notes, content: readJson(join(out, 'content.json')), pm: readJson(join(out, 'page-map.json')), menus: readJson(join(out, 'menus.json')), coverage: readJson(join(out, 'adapter-coverage.json')) }
}
const pageOf = (b, file) => b.content.pages.find((p) => p.file === file)
const item = (b, id) => b.coverage.items.find((i) => i.id === id)
const flatMenu = (b) => b.menus.menus.flatMap(function walk(m) { return (m.items ?? m.children ?? []).flatMap((i) => [i, ...walk(i)]) })

test('S-22 {loadmoduleid}: an ACM module becomes a slot naming it, a custom module is inlined, an unpublished one prints nothing, an unknown one stays text', () => {
  const b = build(novaDir())
  const one = pageOf(b, 'service-one.html')
  assert.equal(one.contentKind, 'sections')
  const slot = one.content.find((e) => e.kind === 'slot' && e.modules?.includes('116'))
  assert.deepEqual(slot, { kind: 'slot', position: 'section-2', modules: ['116'] }, 'the slot sits between the paragraphs, naming the module')
  assert.deepEqual(one.content.map((e) => e.kind).slice(0, 3), ['blocks', 'slot', 'blocks'])
  assert.match(one.contentMarkup, /"position":"section-2"/, 'the markup form has the slot at the position too')
  assert.doesNotMatch(JSON.stringify(one), /\{loadmoduleid/, 'no marker is left on the page')
  const two = pageOf(b, 'service-two.html')
  assert.match(two.content, /Inline module words/, 'a mod_custom module is its content, where the marker stood')
  assert.doesNotMatch(two.content, /Hidden here/, 'module 118 is not published: Joomla prints nothing for it')
  assert.ok(two.notes.some((n) => /\{loadmoduleid 118\} prints nothing on the Joomla site \(the module is not published\)/.test(n)))
  assert.match(two.content, /\{loadmoduleid 999\}/, 'no such module: the marker stays as text, reported')
  assert.ok(two.notes.some((n) => /\{loadmoduleid 999\} is left as text: no such site module/.test(n)))
  assert.deepEqual(one.sections.filter((s) => s.via === 'loadmoduleid'), [{ position: 'section-2', via: 'loadmoduleid', modules: ['116'] }])
})

test('S-22 {loadmoduleid}: a marker inside another block cannot be split, so the slot is by position and says so; an unassigned module is drawn, noted', () => {
  const b = build(novaDir())
  const nested = pageOf(b, 'nested-load.html')
  assert.equal(nested.contentKind, 'blocks')
  assert.match(nested.content, /wp:tracy-base\/slot \{"position":"section-2","modules":\["116"\]\}/)
  assert.ok(nested.notes.some((n) => /sits inside another block, so the page entry cannot name module 116/.test(n)))
  assert.ok(nested.notes.some((n) => /module 116 is not assigned to menu item 370.*not traced/.test(n)))
})

test('S-22 {loadmoduleid}: a post body resolves the marker too — a post with no page route and an article kept as a post', () => {
  const dir = novaDir((inv) => {
    const by = (id) => inv.content.find((a) => a.id === id)
    by('3').introtext = '<p>Start.</p>{loadmoduleid 116}<p>Mid.</p>{loadmoduleid 117}{loadmoduleid 118}{loadmoduleid 999}'
    by('3').fulltext = '<p>Full.</p>{loadmoduleid 117}'
    by('60').introtext = '<p>Kept.</p>{loadmoduleid 117}'
  })
  const b = build(dir, { articlePosts: { 60: {} } })
  const posts = (b.content.posts ?? [])
  const three = posts.find((p) => p.joomla.articleId === '3')
  assert.ok(three, 'article 3 is a post')
  assert.match(three.content, /wp:tracy-base\/slot \{"position":"section-2","modules":\["116"\]\}/, 'the ACM module is a slot at its position naming module 116')
  assert.ok(b.notes.some((n) => /article #3: \{loadmoduleid 116\} is a slot block at position "section-2" naming module #116.*post seeder does not expand/.test(n)), 'the seeder dependency is named')
  assert.match(three.content, /Inline module words/, 'the custom module is its content')
  assert.doesNotMatch(three.content, /Hidden here/)
  assert.doesNotMatch(three.content, /\{loadmoduleid (116|117|118)\}/)
  assert.match(three.content, /\{loadmoduleid 999\}/, 'an unknown module stays text')
  assert.equal((three.content.match(/Inline module words/g) ?? []).length, 2, 'the marker in the full text resolves as well')
  assert.ok(b.notes.some((n) => /article #3: \{loadmoduleid 999\} is left as text: no such site module/.test(n)))
  assert.ok(b.notes.some((n) => /article #3: \{loadmoduleid 118\} prints nothing/.test(n)))
  const kept = posts.find((p) => p.joomla.articleId === '60')
  assert.ok(kept, 'article 60 is kept as a post')
  assert.match(kept.content, /Inline module words/)
  assert.doesNotMatch(kept.content, /\{loadmoduleid/)
})

test('S-22 {loadmoduleid}: coverage — a resolved marker is a remark, an unresolved one is critical (the page prints it)', () => {
  const b = build(novaDir())
  const a61 = item(b, 'article:61')
  assert.equal(a61.status, 'mapped')
  assert.match(a61.detail.remarks[0], /\{loadmoduleid 116\} resolved/)
  const a62 = item(b, 'article:62')
  assert.equal(a62.status, 'partial')
  assert.equal(a62.critical, true, 'the text {loadmoduleid 999} is printed on the page')
  assert.match(a62.reason, /\{loadmoduleid 999\}: the adapter leaves \{loadmodule\} markers as text/)
  assert.match(item(b, 'module:116').reason ?? item(b, 'module:116').detail?.remarks?.join(' ') ?? '', /loaded by \{loadmodule\} in article:61, article:65 \(by id\), placed there as a slot at its position/)
})

test('S-22 resolver: only digits name a module; a module with no position is left; the input string is not changed', () => {
  const mods = [
    { id: '1', module: 'mod_ja_acm', position: 'p', published: true, assignment: { all: true, pages: [], except: [] }, content: '' },
    { id: '2', module: 'mod_login', position: '', published: true, assignment: { all: true, pages: [], except: [] }, content: '' },
    { id: '3', module: 'mod_custom', position: '', published: true, assignment: { all: false, pages: ['9'], except: [] }, content: '<b>x</b>' }
  ]
  const html = '{loadmoduleid 1}{loadmoduleid 2}{loadmoduleid 3}{loadmoduleid x1}{loadmoduleid }'
  const r = resolveModuleLoads(html, mods, '5', assignedTo)
  assert.deepEqual(r.slots.map((s) => [s.id, s.position, s.token]), [['1', 'p', '@m1']])
  assert.deepEqual(r.inline.map((s) => s.id), ['3'])
  assert.deepEqual(r.unresolved.map((u) => u.id), ['2', 'x1', ''])
  assert.match(r.unresolved[0].why, /no position/)
  assert.deepEqual(r.unassigned.map((u) => u.id), ['3'])
  assert.equal(r.html, '{loadposition @m1}{loadmoduleid 2}<b>x</b>{loadmoduleid x1}{loadmoduleid }')
  assert.equal(resolveModuleLoads(null, mods, '5', assignedTo).html, '')
})

test('S-24 image_fulltext: the article view’s image is the full-text one; the intro image is kept beside it; alt follows the image', () => {
  const b = build(novaDir())
  const two = b.content.posts.find((p) => p.joomla.articleId === '60')
  assert.equal(two.featuredImage, 'images/a-full.jpg')
  assert.equal(two.featuredImageAlt, 'Full alt')
  assert.equal(two.introImage, 'images/a-intro.jpg')
  assert.equal(two.introImageAlt, 'Intro alt')
  const solo = b.content.posts.find((p) => p.joomla.articleId === '64')
  assert.equal(solo.featuredImage, 'images/b-intro.jpg', 'only an intro image: it is the featured one')
  assert.ok(!('introImage' in solo), 'and is not listed twice')
  // a page (an article on a menu route) carries the same fields
  const dir = novaDir((inv) => {
    inv.content.find((c) => c.id === '63').images = JSON.stringify({ image_intro: 'images/p1.jpg', image_fulltext: 'images/p2.jpg', image_fulltext_alt: 'P2' })
  })
  const tagged = pageOf(build(dir), 'tagged-items.html')
  assert.deepEqual([tagged.featuredImage, tagged.featuredImageAlt, tagged.introImage], ['images/p2.jpg', 'P2', 'images/p1.jpg'])
  // an empty full-text image is no image
  const empty = build(novaDir((inv) => (inv.content.find((c) => c.id === '60').images = JSON.stringify({ image_intro: 'images/a-intro.jpg', image_fulltext: '', image_fulltext_alt: 'orphan alt' }))))
  const p60 = empty.content.posts.find((p) => p.joomla.articleId === '60')
  assert.deepEqual([p60.featuredImage, p60.featuredImageAlt], ['images/a-intro.jpg', ''])
})

test('S-25 featured view: the page declares the featured articles and paging; order is omitted without the menu setting; coverage says so', () => {
  const b = build(novaDir())
  const page = pageOf(b, 'featured-articles.html')
  assert.deepEqual(page.featured.articleIds, ['3', '60', '64'], 'featured and published: state 1, featured 1')
  assert.equal(page.featured.count, 3)
  assert.equal(page.featured.drawn, true)
  assert.deepEqual([page.featured.perPage, page.featured.paging.leading, page.featured.paging.intro, page.featured.paging.links], [7, 1, 6, 4])
  assert.equal(Object.hasOwn(page.featured, 'order'), false, 'without the menu ordering option, order is not declared')
  assert.equal(Object.hasOwn(page.featured, 'orderBy'), false, 'without the menu ordering option, orderBy is not declared')
  const r = item(b, 'route:350:/featured-articles')
  assert.equal(r.status, 'partial')
  assert.match(r.reason, /featured list \(3 article\(s\)\) is declared.*its order is not declared/)
  // unpublished and unfeatured articles are not listed
  const dir = novaDir((inv) => {
    inv.content.find((c) => c.id === '60').state = '0'
    inv.content.find((c) => c.id === '64').featured = '0'
  })
  assert.deepEqual(pageOf(build(dir), 'featured-articles.html').featured.articleIds, ['3'])
  // a non-count paging option is named, not guessed
  const bad = build(novaDir((inv) => (inv.menu.find((m) => m.id === '350').params = JSON.stringify({ num_leading_articles: 'lots', num_intro_articles: '6' }))))
  assert.ok(pageOf(bad, 'featured-articles.html').notes.some((n) => /"num_leading_articles" \(menu\) is "lots"/.test(n)))
  assert.equal(pageOf(bad, 'featured-articles.html').featured.perPage, undefined)
})

test('S-30 menu_show 0: the item is not published in the menus, the route still answers, coverage remarks it', () => {
  const b = build(novaDir())
  const hidden = flatMenu(b).find((i) => i.label === 'Tagged Items')
  assert.equal(hidden.published, false, 'no navigation draws it')
  assert.equal(hidden.menuShow, false)
  assert.ok(pageOf(b, 'tagged-items.html'), 'the page is still built')
  assert.ok(b.pm.pages.some((p) => p.file === 'tagged-items.html'))
  assert.equal(flatMenu(b).find((i) => i.label === 'Contact').published, true)
  assert.ok(!('menuShow' in flatMenu(b).find((i) => i.label === 'Contact')))
  assert.match(item(b, 'menu-item:310').detail.remarks[0], /menu_show 0/)
  assert.deepEqual([undefined, {}, { menu_show: '1' }, { menu_show: 1 }, { menu_show: 'x' }].map(menuShown), [true, true, true, true, true])
  assert.deepEqual([{ menu_show: '0' }, { menu_show: 0 }, { menu_show: false }].map(menuShown), [false, false, false])
})

test('S-33 author profiles: job title, about me and social links are read from the allow-listed keys only', () => {
  const b = build(novaDir())
  const alex = b.content.authors.find((a) => a.joomlaUserId === '42')
  assert.equal(alex.jobTitle, 'Lead designer')
  assert.equal(alex.description, 'Alex writes about design.')
  assert.deepEqual(alex.social, { facebook: 'https://fb.example/alex', linkedin: 'https://in.example/alex' }, 'the empty twitter link is no link')
  assert.equal(alex.avatar, 'images/authors/alex.jpg')
  assert.deepEqual(Object.keys(alex.provenance).sort(), ['avatar', 'description', 'jobTitle', 'login', 'name', 'social'])
  assert.equal(alex.provenance.jobTitle, '#__user_profiles.profile.user_jobtitle')
  const inv = readJson(join(NOVA, 'inventory.json'))
  const profiles = authorProfiles({ ...inv, user_profiles: [...inv.user_profiles, { user_id: '42', profile_key: 'profile.phone', profile_value: '"555 0100"' }, { user_id: '42', profile_key: 'profile.address1', profile_value: '"secret street"' }] })
  assert.doesNotMatch(JSON.stringify([...profiles]), /555 0100|secret street/, 'a key outside the allow-list is never read')
  assert.equal(profiles.get('43').jobTitle, 'Editor')
  assert.ok(!profiles.get('43').description)
  assert.equal(authorProfiles({}), null, 'no table: not dumped')
  // hostile values: a script link, a list, an oversized text (kept whole), plain (not JSON-encoded) text
  const hostile = authorProfiles({
    user_profiles: [
      { user_id: '1', profile_key: 'profile.user_social', profile_value: JSON.stringify({ x: 'javascript:alert(1)', ok: 'http://a.example/x' }) },
      { user_id: '2', profile_key: 'profile.user_social', profile_value: '["a"]' },
      { user_id: '3', profile_key: 'profile.aboutme', profile_value: JSON.stringify('x'.repeat(50000)) },
      { user_id: '4', profile_key: 'profile.user_jobtitle', profile_value: 'Plain text' },
      { user_id: '5', profile_key: 'profile.user_jobtitle', profile_value: '""' }
    ]
  })
  assert.deepEqual(hostile.get('1').social, { ok: 'http://a.example/x' })
  assert.ok(!hostile.has('2'))
  assert.equal(hostile.get('3').description.length, 50000)
  assert.equal(hostile.get('4').jobTitle, 'Plain text')
  assert.ok(!hostile.has('5'), 'an empty value is no value')
})

test('S-35 contact: the com_contact row is written into the contact page; a missing table or row is a named gap, nothing is made up', () => {
  const b = build(novaDir())
  const page = pageOf(b, 'about-us-contact.html')
  assert.equal(page.view, 'page-contact')
  assert.deepEqual([page.contact.name, page.contact.position, page.contact.street, page.contact.telephone, page.contact.email], ['Nova Studio', 'Head office', '1 Example Street', '+1 555 0100', 'hello@example.test'])
  assert.deepEqual(page.contact.links, [{ label: 'Link A', url: 'https://a.example' }, { label: 'Link B', url: 'https://b.example' }], 'the empty third link is dropped')
  assert.ok(!('mobile' in page.contact) && !('fax' in page.contact), 'an empty field is absent, not filled')
  assert.equal(page.contact.misc, '<p>Open weekdays.</p>')
  assert.equal(item(b, 'route:340:/about-us/contact').status, 'mapped')
  const none = build(novaDir((inv) => delete inv.contact_details))
  assert.equal(pageOf(none, 'about-us-contact.html').contact, undefined)
  assert.ok(pageOf(none, 'about-us-contact.html').notes.some((n) => /the dump has no #__contact_details table/.test(n)))
  assert.equal(item(none, 'route:340:/about-us/contact').status, 'partial')
  const noRow = build(novaDir((inv) => (inv.contact_details = [])))
  assert.match(item(noRow, 'route:340:/about-us/contact').reason, /#__contact_details has no row 1/)
  // the row reader alone
  assert.equal(contactRow(null), null)
  const r = contactRow({ id: 7, name: ' A ', address: '', email_to: 'a@b.test', params: '{"linka":"javascript:x","linka_name":"bad","linkb":"https://ok.example"}', misc: '   ' })
  assert.deepEqual(r, { id: '7', name: 'A', email: 'a@b.test', links: [{ label: '', url: 'https://ok.example' }], provenance: '#__contact_details' })
})

test('S-41 route status: a measured redirect is declared by the page-map (http-parity reads it); a bad record stops the run before any output', () => {
  const b = build(novaDir())
  const p = b.pm.pages.find((x) => x.file === 'user-profile.html')
  assert.deepEqual([p.status, p.location], [303, '/login-form'])
  assert.ok(b.pm.pages.filter((x) => x.status).length === 1, 'a 200 route declares nothing')
  assert.equal(pageOf(b, 'user-profile.html').httpStatus, 303)
  assert.equal(item(b, 'route:330:/user-profile').source.answers, 303)
  assert.deepEqual(routeAnswer({ status: 404 }), { status: 404 })
  assert.deepEqual(routeAnswer({ status: 301, location: '/x' }), { status: 301, location: '/x' })
  assert.equal(routeAnswer({ path: '/a' }), null)
  for (const bad of [{ status: '303' }, { status: 99 }, { status: 600 }, { status: 303 }, { status: 303, location: '' }, { status: 200, location: 'a\nb' }, { location: '/x' }])
    assert.ok(routeAnswer(bad)?.problem, JSON.stringify(bad))
  assert.throws(() => checkRenderRoutes([{ id: '1', path: '/', status: 'ok' }]), /routes\[0\] \(\/\): status "ok" is not an HTTP status/)
  assert.throws(() => build(novaDir((inv, routes) => (routes.find((r) => r.id === '330').location = ''))), /location is not a URL string/)
})

test('S-45 page heading: a menu item’s page_heading (show_page_heading on) is the listing’s title; the menu label is kept; no heading text, no change', () => {
  const b = build(novaDir())
  const arch = b.content.archives.find((a) => a.path === '/project/ui-ux-design')
  assert.equal(arch.title, 'UI/UX Design')
  assert.equal(arch.menuLabel, 'UI/UX design')
  assert.equal(arch.pageHeading.from, 'menu item params page_heading (show_page_heading 1)')
  assert.equal(b.pm.pages.find((p) => p.path === '/project/ui-ux-design').title, 'UI/UX Design')
  const plain = b.content.archives.find((a) => a.path === '/plain-heading')
  assert.equal(plain.title, 'Plain heading', 'show_page_heading on with no text: the menu title stands')
  assert.ok(!('pageHeading' in plain))
  assert.deepEqual(pageHeading({ show_page_heading: '1', page_heading: '  Hi  ' }), { text: 'Hi', from: 'menu item params page_heading (show_page_heading 1)' })
  assert.deepEqual(pageHeading({ show_page_heading: '0', page_heading: 'x' }), { hidden: true, from: 'menu item params show_page_heading 0' })
  for (const params of [undefined, {}, { page_heading: 'x' }, { show_page_heading: '1', page_heading: 5 }, { show_page_heading: '1', page_heading: '  ' }])
    assert.equal(pageHeading(params), null, JSON.stringify(params))
  // an article route keeps the article's title; the heading is a field beside it
  const art = build(novaDir((inv) => (inv.menu.find((m) => m.id === '310').params = JSON.stringify({ page_heading: 'Custom h1', show_page_heading: '1' }))))
  assert.equal(pageOf(art, 'tagged-items.html').title, 'Tagged')
  assert.equal(pageOf(art, 'tagged-items.html').pageHeading.text, 'Custom h1')
})

// ── the dump's capture: the tar stream, the pages, the imports ────────────────

/** One tar entry: a ustar header (512 bytes) and the body padded to 512. */
const tarEntry = (name, { type = '0', data = '', linkname = '' } = {}) => {
  const body = Buffer.from(data)
  const h = Buffer.alloc(512)
  h.write(name, 0, 100)
  h.write('0000644\0', 100)
  h.write('0000000\0', 108)
  h.write('0000000\0', 116)
  h.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
  h.write('00000000000\0', 136)
  h.write('        ', 148)
  h.write(type, 156)
  h.write(linkname, 157, 100)
  h.write('ustar\0', 257)
  h.write('00', 263)
  const sum = [...h].reduce((n, b) => n + b, 0)
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return Buffer.concat([h, body, Buffer.alloc((512 - (body.length % 512)) % 512)])
}
const tar = (...entries) => Buffer.concat([...entries, Buffer.alloc(1024)])

test('capture tar reader: regular files and directories under plain paths are accepted, anything else refuses the whole stream', () => {
  const ok = readTar(tar(tarEntry('templates/', { type: '5' }), tarEntry('templates/x/a.css', { data: 'a{}' }), tarEntry('./t3-assets/b.css', { data: 'b{}' })))
  assert.deepEqual(ok.map((e) => [e.path, e.dir, e.data?.toString()]), [['templates', true, undefined], ['templates/x/a.css', false, 'a{}'], ['t3-assets/b.css', false, 'b{}']])
  for (const [label, entries, re] of [
    ['a symbolic link', [tarEntry('templates/l', { type: '2', linkname: '/etc/passwd' })], /is of type "2"/],
    ['a hard link', [tarEntry('templates/h', { type: '1', linkname: 'a' })], /is of type "1"/],
    ['a device', [tarEntry('templates/d', { type: '3' })], /is of type "3"/],
    ['a fifo', [tarEntry('templates/f', { type: '6' })], /is of type "6"/],
    ['a parent segment', [tarEntry('templates/../x', { data: 'x' })], /not a plain relative path/],
    ['an absolute path', [tarEntry('/etc/x', { data: 'x' })], /not a plain relative path/],
    ['a backslash', [tarEntry('templates/a\\b', { data: 'x' })], /not a plain relative path/],
    ['an empty segment', [tarEntry('templates//x', { data: 'x' })], /not a plain relative path/]
  ])
    assert.throws(() => readTar(tar(...entries)), re, label)
  // bounds
  assert.throws(() => readTar(tar(tarEntry('a/b', { data: 'xxxx' })), { ...CAPTURE_LIMITS, fileBytes: 3 }), /over the 3 bound/)
  assert.throws(() => readTar(tar(tarEntry('a/b', { data: 'xx' }), tarEntry('a/c', { data: 'xx' })), { ...CAPTURE_LIMITS, totalBytes: 3 }), /more than 3 bytes/)
  assert.throws(() => readTar(tar(tarEntry('a/b'), tarEntry('a/c')), { ...CAPTURE_LIMITS, files: 1 }), /more than 1 entries/)
  assert.throws(() => readTar(tar(tarEntry('a/b/c/d', { data: 'x' })), { ...CAPTURE_LIMITS, depth: 3 }), /nested deeper than 3/)
  // a truncated stream and a size that is not a number
  assert.throws(() => readTar(tarEntry('a/b', { data: 'x'.repeat(600) }).subarray(0, 700)), /is cut off/)
  const bad = tarEntry('a/b', { data: 'x' })
  bad.write('zzzzzzzzzzz\0', 124)
  assert.throws(() => readTar(tar(bad)), /size field is not a number/)
  // a pax path record and a GNU long name override the header's name, and are checked the same way
  const pax = (path) => {
    const rec = `${path.length + 10} path=${path}\n`
    return tarEntry('PaxHeader', { type: 'x', data: rec })
  }
  assert.equal(readTar(tar(pax('templates/long/name.css'), tarEntry('short', { data: 'x' })))[0].path, 'templates/long/name.css')
  assert.throws(() => readTar(tar(pax('templates/../../x'), tarEntry('short', { data: 'x' }))), /not a plain relative path/)
  assert.equal(readTar(tar(tarEntry('././@LongLink', { type: 'L', data: 'templates/gnu/long.css\0' }), tarEntry('short', { data: 'x' })))[0].path, 'templates/gnu/long.css')
  assert.deepEqual(safeSegments('a/b/'), ['a', 'b'])
  for (const bad of ['', '/a', 'a/../b', 'a//b', 'a/./b', 'a\\b', 'a\0b', null]) assert.equal(safeSegments(bad), null, String(bad))
})

test('capture writer: files are created exclusively, never over something there and never through a link', () => {
  const root = tmp('i73-w-')
  writeEntries([{ path: 'a/b.css', dir: false, data: Buffer.from('x') }, { path: 'a/sub', dir: true }], root)
  assert.equal(readFileSync(join(root, 'a', 'b.css'), 'utf8'), 'x')
  assert.throws(() => writeEntries([{ path: 'a/b.css', dir: false, data: Buffer.from('y') }], root), /EEXIST/)
  assert.equal(readFileSync(join(root, 'a', 'b.css'), 'utf8'), 'x', 'the file that was there is kept')
  const outside = tmp('i73-outside-')
  symlinkSync(outside, join(root, 'link'))
  assert.throws(() => writeEntries([{ path: 'link/escape.css', dir: false, data: Buffer.from('z') }], root), /is a link/)
  assert.equal(existsSync(join(outside, 'escape.css')), false)
  // a link in the middle of the path: no directory is created through it, for a file or a directory entry
  assert.throws(() => writeEntries([{ path: 'link/deep/er/x.css', dir: false, data: Buffer.from('z') }], root), /is a link/)
  assert.throws(() => writeEntries([{ path: 'link/newdir', dir: true }], root), /is a link/)
  assert.deepEqual(readdirSync(outside), [], 'nothing was created below the link target')
  // a file where a directory belongs is refused, not replaced
  assert.throws(() => writeEntries([{ path: 'a/b.css/inner.css', dir: false, data: Buffer.from('z') }], root), /is not a directory/)
  // the root itself is checked too: a link at the staging root sends nothing outside, and a missing root is not created
  const linked = join(tmp('i73-rootlink-'), 'stage')
  symlinkSync(outside, linked)
  assert.throws(() => writeEntries([{ path: 'x.css', dir: false, data: Buffer.from('z') }], linked), /is a link/)
  assert.throws(() => writeEntries([{ path: 'x.css', dir: false, data: Buffer.from('z') }], join(root, 'nope')), /does not exist/)
  assert.deepEqual(readdirSync(outside), [], 'nothing was written below the link target')
})

test('capture: stylesheet links are read in document order, decoded, and only rel=stylesheet ones', () => {
  const html = `<link rel="preload" href="/no.css"><link REL='stylesheet' HREF='/a.css?x=1&amp;y=2'><link href=/b.css rel=stylesheet>
    <link rel="alternate stylesheet" href="/c.css"><link rel="stylesheet" href=""><link rel="icon" href="/i.png"><link rel=stylesheet>`
  assert.deepEqual(stylesheetLinks(html), ['/a.css?x=1&y=2', '/b.css', '/c.css'])
  assert.deepEqual(stylesheetLinks('<p>none</p>'), [])
  assert.throws(() => stylesheetLinks('<link rel=stylesheet href=/a.css>'.repeat(3), 2), /over the 2 bound/)
  assert.equal(locationOf('http://site.test:9/login?x=1', new URL('http://site.test:9/')), '/login?x=1')
  assert.equal(locationOf('https://other.example/x', new URL('http://site.test:9/')), 'https://other.example/x')
  assert.equal(locationOf('/x', new URL('http://site.test:9/sub/')), '/x')
})

/** A local site: `routes` (path → [status, html, location?]) with a per-request hook; `stats` counts what it saw. */
const site = async (routes, { hook = () => {} } = {}) => {
  const stats = { hits: [], cookies: [], active: 0, maxActive: 0, aborted: 0 }
  const server = createServer(async (req, res) => {
    stats.hits.push(req.url)
    stats.cookies.push(req.headers.cookie ?? null)
    stats.active++
    stats.maxActive = Math.max(stats.maxActive, stats.active)
    res.on('close', () => {
      stats.active--
      if (!res.writableFinished) stats.aborted++
    })
    await hook(req, res, stats)
    if (res.writableEnded || res.destroyed) return
    const r = routes[req.url.split('?')[0]] ?? [404, 'no']
    res.writeHead(r[0], { 'content-type': 'text/html', ...(r[2] ? { location: r[2] } : {}) })
    res.end(r[1])
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = new URL(`http://127.0.0.1:${server.address().port}/`)
  test.after(() => server.closeAllConnections?.() ?? server.close())
  return { base, stats, server }
}
const PAGE = (...css) => `<html><head>${css.map((c) => `<link rel="stylesheet" href="${c}">`).join('')}</head><body><h1>x</h1></body></html>`

test('capture crawl: two passes without cookies or redirects; the last pass is the record: stylesheets, a redirect’s status and Location', async () => {
  const s = await site({ '/': [200, PAGE('/t3-assets/css/a.css')], '/about': [200, PAGE('/t3-assets/css/a.css', '/t3-assets/css/b.css')], '/profile': [303, '', `${'http://127.0.0.1'}/login`], '/gone': [404, 'no'] })
  const routes = [{ id: '1', path: '/' }, { id: '2', path: '/about' }, { id: '3', path: '/profile' }, { id: '4', path: '/gone' }]
  const got = await crawlRoutes(routes, s.base)
  assert.deepEqual(got.map((r) => r.stylesheets ?? null), [['/t3-assets/css/a.css'], ['/t3-assets/css/a.css', '/t3-assets/css/b.css'], null, null])
  assert.deepEqual(got.map((r) => r.status ?? 200), [200, 200, 303, 404])
  assert.equal(got[2].location, 'http://127.0.0.1/login', 'a foreign location is kept as sent')
  assert.equal(s.stats.hits.length, 8, 'every route twice: warm-up, then the record')
  assert.ok(s.stats.cookies.every((c) => c === null), 'no cookie is sent')
  assert.ok(s.stats.maxActive <= CAPTURE_LIMITS.concurrency)
  assert.deepEqual(routes.map((r) => Object.keys(r)), [['id', 'path'], ['id', 'path'], ['id', 'path'], ['id', 'path']], 'the input is not modified')
  // a same-origin redirect is kept as a path
  const t = await site({ '/x': [301, '', '/y'] })
  const [x] = await crawlRoutes([{ id: '1', path: '/x' }], t.base)
  assert.deepEqual([x.status, x.location], [301, '/y'])
  // a redirect with no Location, and a redirect that the source names outside HTTP, are refused
  const u = await site({ '/x': [302, ''] })
  await assert.rejects(crawlRoutes([{ id: '1', path: '/x' }], u.base), /a 302 answer with no Location/)
})

test('capture crawl: a 5xx, a timeout or an oversized page aborts the capture, cancels what is outstanding and awaits it', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const s = await site({ '/ok': [200, PAGE()], '/boom': [500, 'no'] }, { hook: async (req) => { if (req.url === '/slow') await gate } })
  const routes = [{ id: '1', path: '/slow' }, { id: '2', path: '/slow' }, { id: '3', path: '/boom' }, { id: '4', path: '/ok' }]
  await assert.rejects(crawlRoutes(routes, s.base, { concurrency: 4, timeoutMs: 5000 }), /the site answered 500/)
  // crawlRoutes has returned: nothing it started is still in flight, and the slow requests were cut, not answered
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(s.stats.active, 0, 'no request is still open when the error is raised')
  assert.ok(s.stats.aborted >= 2, `the slow requests were cancelled (${s.stats.aborted})`)
  release()
  const hits = s.stats.hits.length
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(s.stats.hits.length, hits, 'and nothing is requested after the failure')
  // a route that never answers
  const t = await site({}, { hook: async () => new Promise(() => {}) })
  await assert.rejects(crawlRoutes([{ id: '1', path: '/' }], t.base, { timeoutMs: 150 }), /no answer within 150 ms/)
  // a page over the bound
  const big = await site({ '/': [200, 'x'.repeat(2000)] })
  await assert.rejects(fetchBounded(big.base.href, { timeoutMs: 5000, maxBytes: 1000 }), /larger than 1000 bytes/)
  // a connection that is refused
  await assert.rejects(crawlRoutes([{ id: '1', path: '/' }], new URL('http://127.0.0.1:1/'), { timeoutMs: 2000 }), /127\.0\.0\.1:1/)
  await assert.rejects(crawlRoutes(Array.from({ length: CAPTURE_LIMITS.routes + 1 }, (_, i) => ({ id: String(i), path: `/${i}` })), new URL('http://x.test/')), /2001 routes, over the 2000 bound/)
})

test('capture imports: an import the copy lacks is fetched; a 404, a foreign origin, a condition and a cycle are reported; nothing else is fetched', async () => {
  const s = await site({ '/plugins/t3/font.css': [200, "@import url('/plugins/t3/more.css');\n.fa{font-family:x}"], '/plugins/t3/more.css': [200, "@import 'font.css';\n.more{color:red}"] })
  const stored = new Map()
  const held = new Map([['t3-assets/css/a.css', `@import url('/plugins/t3/font.css');\n@import url('/plugins/t3/missing.css');\n@import url('https://cdn.example/x.css');\n@import url(held.css) print;\n@import url('held.css');\n.a{}`], ['t3-assets/css/held.css', '.held{}']])
  const r = await followImports([{ rel: 't3-assets/css/a.css', text: held.get('t3-assets/css/a.css') }], s.base, { has: (rel) => held.get(rel) ?? stored.get(rel) ?? null, store: (rel, text) => stored.set(rel, text) })
  assert.deepEqual(r.fetched, ['plugins/t3/font.css', 'plugins/t3/more.css'], 'the cycle font → more → font ends')
  assert.deepEqual([...stored.keys()], ['plugins/t3/font.css', 'plugins/t3/more.css'])
  assert.deepEqual(r.gaps.map((g) => g.target).sort(), ['/plugins/t3/missing.css', 'held.css', 'https://cdn.example/x.css'].sort())
  assert.match(r.gaps.find((g) => g.target === '/plugins/t3/missing.css').why, /answered 404/)
  assert.match(r.gaps.find((g) => g.target === 'https://cdn.example/x.css').why, /another origin/)
  assert.match(r.gaps.find((g) => g.target === 'held.css').why, /conditional/)
  assert.ok(!s.stats.hits.some((h) => /held|cdn/.test(h)), 'a file the capture holds and a foreign URL are not requested')
})

/** joomla-dump.mjs against the fake database and web container (the site is a local server): async, so the site can answer. */
const dumpCapture = async ({ web, site: siteUrl, args = [], env = {}, into = null, db: dbExtra = {} }) => {
  const dir = tmp('i73-dump-')
  const inv = readJson(join(NOVA, '..', '..', 'joomla-min', 'inventory.json'))
  const db = Object.fromEntries(Object.entries(inv).map(([t, rows]) => [`jm_${t}`, rows]))
  db.jm_extensions = [{ extension_id: '19', name: 'com_content', type: 'component', element: 'com_content', folder: '', client_id: '1', enabled: '1', params: readFileSync(join(NOVA, 'content-params.json'), 'utf8') }]
  Object.assign(db, dbExtra)
  db.__php__ = { print: `${JSON.stringify({ sitename: 'Fixture' })}\n` }
  writeFileSync(join(dir, 'db.json'), JSON.stringify(db))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  const fake = join(here, 'fixtures', 'issue73', 'fake-docker-capture.mjs')
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(fake)} "$@"\n`, { mode: 0o755 })
  const j6 = into ?? join(dir, 'j6')
  const log = join(dir, 'capture.log')
  const child = spawn(process.execPath, [join(here, '..', 'ingest', 'joomla-dump.mjs'), ...args, '--out', j6, '--container', 'fake-db', '--password', 'S3cret-dump-pw', '--prefix', 'jm_', ...(siteUrl ? ['--site-url', siteUrl] : []), ...(web ? ['--web-container', 'fake-web'] : [])], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_JOOMLA_DB: join(dir, 'db.json'), ...(web ? { FAKE_WEB_ROOT: web } : {}), FAKE_CAPTURE_LOG: log, ...env }
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => (stdout += d))
  child.stderr.on('data', (d) => (stderr += d))
  const [status] = await once(child, 'close')
  return { dir, j6, status, stdout, stderr, log: existsSync(log) ? readFileSync(log, 'utf8') : '' }
}
/** A web root: the joomla-min template `tracy`, a T3 compiled sheet that imports a plugin sheet, media/t4. */
const webRoot = () => {
  const root = tmp('i73-web-')
  cpSync(join(here, 'fixtures', 'joomla-min', 'capture', 'templates'), join(root, 'templates'), { recursive: true })
  mkdirSync(join(root, 't3-assets', 'css'), { recursive: true })
  writeFileSync(join(root, 't3-assets', 'css', 'css-a.css'), "@import url('/plugins/system/t3/font.css');\nbody{color:#111}\n")
  return root
}
const jm = readJson(join(NOVA, '..', '..', 'joomla-min', 'render-routes.json'))
const jmSite = () =>
  site(Object.fromEntries([...jm.map((r) => [r.path, [r.id === '248' ? 303 : 200, r.id === '248' ? '' : PAGE('/t3-assets/css/css-a.css'), r.id === '248' ? '/login' : undefined]]), ['/plugins/system/t3/font.css', [200, '.fa{font-family:fa}']]]))

test('dump --capture: capture/ is built from the container and the site; render-routes.json carries what each route answers and links', async () => {
  const s = await jmSite()
  const web = webRoot()
  const d = await dumpCapture({ web, site: s.base.href.replace(/\/$/, ''), args: ['--capture'] })
  assert.equal(d.status, 0, `${d.stderr}${d.stdout}`)
  const routes = readJson(join(d.j6, 'render-routes.json'))
  assert.equal(routes.length, jm.length)
  assert.deepEqual(routes.find((r) => r.id === '248'), { id: '248', path: '/company/about', status: 303, location: '/login' })
  assert.deepEqual(routes.find((r) => r.id === '247').stylesheets, ['/t3-assets/css/css-a.css'])
  assert.ok(existsSync(join(d.j6, 'capture', 'templates', 'tracy', 'templateDetails.xml')))
  assert.equal(readFileSync(join(d.j6, 'capture', 't3-assets', 'css', 'css-a.css'), 'utf8').includes('@import'), true)
  assert.equal(readFileSync(join(d.j6, 'capture', 'plugins', 'system', 't3', 'font.css'), 'utf8'), '.fa{font-family:fa}', 'the import the copy lacked was fetched')
  const meta = readJson(join(d.j6, 'dump.json')).capture
  assert.deepEqual([meta.passes, meta.routes, meta.importsFetched, meta.gaps], [2, jm.length, ['plugins/system/t3/font.css'], []])
  assert.ok(meta.directories.includes('templates/tracy') && meta.directories.includes('t3-assets'))
  assert.ok(!meta.directories.includes('media/t4'), 'a directory the site does not have is not asked for')
  assert.deepEqual(readdirSync(d.j6).sort(), ['.joomla-dump.epoch', 'capture', 'dump.json', 'inventory.json', 'render-routes.json', 'site-config.json'], 'no temporary directory is left')
  assert.match(d.log, /tar templates\/tracy t3-assets/)
  assert.equal(s.stats.hits.filter((h) => h === '/').length, 2, 'home was requested twice')
  // from-joomla reads the dump: the routes' stylesheets, statuses and the captured template
  const out = join(tmp('i73-pack-'), 'pack')
  const result = buildSpecPack({ j6Dir: d.j6, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.deepEqual(readJson(join(out, 'page-map.json')).pages.find((p) => p.source?.menuId === '248')?.status, 303)
  assert.ok(result.counts)
})

test('dump --capture: a failed route, a link in the web tree, a missing template and bad arguments stop the dump with nothing written', async () => {
  const refuse = async (label, opts, re) => {
    const d = await dumpCapture(opts)
    assert.notEqual(d.status, 0, `${label}: ${d.stdout}`)
    assert.match(d.stderr, re, label)
    assert.doesNotMatch(d.stderr + d.stdout, /S3cret-dump-pw/, `${label}: the password is not printed`)
    assert.equal(existsSync(d.j6) && readdirSync(d.j6).length > 0, false, `${label}: nothing is written (${existsSync(d.j6) ? readdirSync(d.j6) : 'no --out'})`)
    return d
  }
  const broken = await site({ '/': [500, 'no'] })
  await refuse('a 5xx', { web: webRoot(), site: broken.base.href.replace(/\/$/, ''), args: ['--capture'] }, /capture failed: .*the site answered 500/)
  const okSite = await jmSite()
  const linked = webRoot()
  symlinkSync('/etc', join(linked, 'templates', 'tracy', 'escape'))
  const d = await refuse('a link in the web tree', { web: linked, site: okSite.base.href.replace(/\/$/, ''), args: ['--capture'] }, /capture failed: tar entry .*is of type "2"/)
  assert.equal(d.status, 1)
  const noTemplate = webRoot()
  rmSync(join(noTemplate, 'templates'), { recursive: true })
  await refuse('no template directory', { web: noTemplate, site: okSite.base.href.replace(/\/$/, ''), args: ['--capture'] }, /no templates\/<name> directory/)
  for (const [label, opts, re] of [
    ['no site url', { web: webRoot(), args: ['--capture'] }, /--capture needs --site-url/],
    ['a site url with a query', { web: webRoot(), site: 'http://127.0.0.1:1/?x=1', args: ['--capture'] }, /--capture needs --site-url/],
    ['a site url with credentials', { web: webRoot(), site: 'http://u:p@127.0.0.1:1', args: ['--capture'] }, /--capture needs --site-url/],
    ['no web target', { site: 'http://127.0.0.1:1', args: ['--capture'] }, /--capture needs --web-service or --web-container/],
    ['--capture twice', { web: webRoot(), site: 'http://127.0.0.1:1', args: ['--capture', '--capture'] }, /--capture is given twice/],
    ['an unknown flag', { args: ['--captur'] }, /"--captur" is not an argument of this command/],
    ['a flag with no value', { args: ['--capture-timeout-ms'] }, /--capture-timeout-ms needs a value/],
    ['a timeout that is not a number', { web: webRoot(), site: 'http://127.0.0.1:1', args: ['--capture', '--capture-timeout-ms', 'soon'] }, /--capture-timeout-ms "soon": expected a whole number/]
  ]) {
    const r = await dumpCapture(opts)
    assert.equal(r.status, 2, `${label}: ${r.stderr}`)
    assert.match(r.stderr, re, label)
    assert.equal(r.log, '', `${label}: nothing was read from the container`)
  }
})

test('dump --capture: a second dump replaces capture/ with the dump — one generation; a dump without --capture leaves no capture/ of the earlier one', async () => {
  const s = await jmSite()
  const site = s.base.href.replace(/\/$/, '')
  const first = await dumpCapture({ web: webRoot(), site, args: ['--capture'] })
  assert.equal(first.status, 0, first.stderr)
  const marker = join(first.j6, 'capture', 'earlier-only.txt')
  writeFileSync(marker, 'x')
  const again = await dumpCapture({ web: webRoot(), site, args: ['--capture'], into: first.j6 })
  assert.equal(again.status, 0, again.stderr)
  assert.equal(existsSync(marker), false, 'the earlier capture is replaced whole, not merged')
  assert.equal(existsSync(join(first.j6, 'capture', 'templates', 'tracy', 'templateDetails.xml')), true)
  assert.equal(verifyGeneration(first.j6, readJson(join(first.j6, 'dump.json'))).checked, true)
  assert.deepEqual(readdirSync(first.j6).filter((n) => /\.(tmp|bak)$|publishing/.test(n)), [], 'no moved-aside capture, no marker')
  // without --capture the earlier capture/ would sit beside an inventory it does not belong to: it goes with the swap
  const plain = await dumpCapture({ web: null, site, args: [], into: first.j6 })
  assert.equal(plain.status, 0, plain.stderr)
  assert.match(plain.stdout ?? plain.log ?? '', /earlier capture\/ belongs to the earlier dump/)
  assert.equal(existsSync(join(first.j6, 'capture')), false)
  assert.equal(readJson(join(first.j6, 'dump.json')).generation.capture, null)
  assert.equal(verifyGeneration(first.j6, readJson(join(first.j6, 'dump.json'))).checked, true)
  // a re-capture that fails on a rename puts the earlier capture back
  const withCap = await dumpCapture({ web: webRoot(), site, args: ['--capture'], into: first.j6 })
  assert.equal(withCap.status, 0, withCap.stderr)
  writeFileSync(join(first.j6, 'capture', 'earlier-only.txt'), 'x')
  const digestBefore = treeDigest(join(first.j6, 'capture'))
  const failedRun = await dumpCapture({ web: webRoot(), site, args: ['--capture'], env: { JOOMLA_DUMP_FAIL_RENAME_AFTER: '4' }, into: first.j6 })
  assert.notEqual(failedRun.status, 0)
  assert.match(failedRun.stderr, /the earlier dump is as it was/)
  assert.equal(treeDigest(join(first.j6, 'capture')), digestBefore, 'the earlier capture is back')
  assert.equal(existsSync(join(first.j6, '.joomla-dump.publishing')), false)
})

test('dump --capture: files are staged and put in place together — a target that cannot be replaced leaves the earlier dump and no capture/ behind', async () => {
  const s = await jmSite()
  const first = await dumpCapture({ web: null, site: s.base.href.replace(/\/$/, ''), args: [] })
  assert.equal(first.status, 0, first.stderr)
  const before = readFileSync(join(first.j6, 'inventory.json'), 'utf8')
  rmSync(join(first.j6, 'dump.json'))
  mkdirSync(join(first.j6, 'dump.json'))
  const again = await dumpCapture({ web: webRoot(), site: s.base.href.replace(/\/$/, ''), args: ['--capture'], into: first.j6 })
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, /cannot write .*dump\.json: it exists and is not a regular file; nothing of this dump was put in place/)
  assert.equal(existsSync(join(first.j6, 'capture')), false, 'no capture/ beside the old inventory')
  assert.equal(readFileSync(join(first.j6, 'inventory.json'), 'utf8'), before, 'the earlier inventory is untouched')
  assert.deepEqual(readdirSync(first.j6).filter((n) => /\.tmp$/.test(n)), [], 'no staged file or capture directory is left')
})

test('dump publication: a rename that fails after the first succeeded puts the earlier dump back — no mixed directory', async () => {
  const s = await jmSite()
  const first = await dumpCapture({ web: null, site: s.base.href.replace(/\/$/, ''), args: [] })
  assert.equal(first.status, 0, first.stderr)
  const files = ['inventory.json', 'render-routes.json', 'dump.json']
  const before = Object.fromEntries(files.map((f) => [f, readFileSync(join(first.j6, f), 'utf8')]))
  for (const after of ['0', '1', '2']) {
    const again = await dumpCapture({ web: webRoot(), site: s.base.href.replace(/\/$/, ''), args: ['--capture'], env: { JOOMLA_DUMP_FAIL_RENAME_AFTER: after }, into: first.j6 })
    assert.notEqual(again.status, 0, after)
    assert.match(again.stderr, /rename refused .*the earlier dump is as it was/, after)
    for (const f of files) assert.equal(readFileSync(join(first.j6, f), 'utf8'), before[f], `${f} is the earlier one after ${after} renames`)
    assert.equal(existsSync(join(first.j6, 'capture')), false, 'no capture/ beside the earlier dump')
    assert.deepEqual(readdirSync(first.j6).filter((n) => /\.(tmp|bak)$/.test(n)), [], 'no staged or moved-aside file is left')
  }
})

test('dump: the author profile keys and the contact table are read through allow-lists; a key or a column outside them never leaves the database', async () => {
  const d = await dumpCapture({
    db: {
      jm_users: [{ id: '42', name: 'Alex', username: 'alex', block: '0', email: 'alex@private.test', password: 'hash-do-not-export' }],
      jm_user_profiles: [
        { user_id: '42', profile_key: 'profile.user_avatar', profile_value: '"a.jpg"', ordering: '1' },
        { user_id: '42', profile_key: 'profile.user_jobtitle', profile_value: '"Lead"', ordering: '2' },
        { user_id: '42', profile_key: 'profile.aboutme', profile_value: '"About"', ordering: '3' },
        { user_id: '42', profile_key: 'profile.user_social', profile_value: '{"facebook":"https://f.example"}', ordering: '4' },
        { user_id: '42', profile_key: 'profile.phone', profile_value: '"555 0100"', ordering: '5' }
      ],
      jm_contact_details: [{ id: '1', name: 'Nova', email_to: 'hello@example.test', telephone: '555', params: '{}', published: '1', catid: '4', language: '*', ordering: '1', user_id: '42', sortname1: 'private', metakey: 'private' }]
    }
  })
  assert.equal(d.status, 0, d.stderr)
  const inv = readJson(join(d.j6, 'inventory.json'))
  assert.deepEqual(inv.user_profiles.map((r) => r.profile_key).sort(), ['profile.aboutme', 'profile.user_avatar', 'profile.user_jobtitle', 'profile.user_social'], 'no other profile key is read')
  assert.doesNotMatch(readFileSync(join(d.j6, 'inventory.json'), 'utf8'), /555 0100|private\.test|hash-do-not-export|sortname1|metakey/)
  assert.equal(inv.contact_details[0].email_to, 'hello@example.test', 'the public contact address is what the page prints')
  assert.ok(!('user_id' in inv.contact_details[0]) && !('sortname1' in inv.contact_details[0]), 'only the allow-listed columns')
  assert.equal(readJson(join(d.j6, 'dump.json')).counts.contact_details, 1)
  // a site without the table dumps without the key: "not dumped", not "no contact"
  const none = await dumpCapture({ db: { jm_contact_details: undefined } })
  assert.equal(none.status, 0)
  assert.ok(!('contact_details' in readJson(join(none.j6, 'inventory.json'))))
})

// ── the pilot replay harness (issue67-73-pilot.mjs) ───────────────────────────

const PILOT = join(here, 'issue67-73-pilot.mjs')
const pilot = (args, opts = {}) => spawnSync(process.execPath, [PILOT, ...args], { encoding: 'utf8', timeout: 240000, ...opts })

test('pilot replay: on the two fixtures every exercised item is verified, the gaps are named, the verdict is PARTIAL, the inputs are untouched', () => {
  const nova = novaDir()
  const t3 = join(tmp('i73-t3-'), 't3')
  cpSync(join(here, 'fixtures', 'issue67', 't3'), t3, { recursive: true })
  const out = tmp('i73-pilot-')
  const before = [nova, t3].map((d) => readdirSync(d, { recursive: true }).sort().join('\n'))
  const r = pilot(['--morgan', t3, '--nova', nova, '--out', out, '--timeout-ms', '120000'])
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  const ledger = readJson(join(out, 'ledger.json'))
  assert.equal(ledger.verdict, 'PARTIAL', 'gaps remain (the pack does not validate, the fixtures are not a full dump): never PASS')
  const by = (pilotName, item) => ledger.ledger.find((l) => l.pilot === pilotName && l.item.includes(item))
  for (const [p, item] of [['morgan', 'layout INI'], ['morgan', 'style mainlayout'], ['morgan', 'hero before section-top'], ['morgan', 'negative module assignments'], ['morgan', 'nested ACM'], ['morgan', 'T3Section frame'], ['nova', 'S-22'], ['nova', 'S-24'], ['nova', 'S-25'], ['nova', 'S-30'], ['nova', 'S-33'], ['nova', 'S-35'], ['nova', 'S-41'], ['nova', 'S-45']])
    assert.equal(by(p, item)?.status, 'verified', `${p} ${item}: ${JSON.stringify(by(p, item))}`)
  assert.equal(by('nova', 'S-11').status, 'gap')
  assert.equal(by('morgan', 'spec-pack validation').status, 'gap')
  assert.match(by('morgan', 'compiled CSS per route').status, /gap|verified/)
  assert.deepEqual(ledger.summary.map((s) => [s.pilot, s.deterministic, s.unchanged]), [['morgan', true, true], ['nova', true, true]])
  assert.deepEqual([nova, t3].map((d) => readdirSync(d, { recursive: true }).sort().join('\n')), before, 'the replay wrote nothing into the pilot directories')
  assert.ok(existsSync(join(out, 'REPORT.md')) && existsSync(join(out, 'nova', 'pack-1', 'pack', 'page-map.json')))
  // run again into the same --out: its own earlier replay is replaced, the result is the same
  const again = pilot(['--nova', nova, '--out', out, '--timeout-ms', '120000'])
  assert.equal(again.status, 0, again.stderr)
})

test('pilot replay: bad arguments, a missing pilot and a directory that is not its own stop it; no clean verdict without a verified item', () => {
  for (const [args, re] of [
    [['--out', tmp('i73-p-')], /name at least one pilot/],
    [['--nova', '/x'], /--out <dir> is required/],
    [['--nova', '/x', '--nova', '/y', '--out', '/tmp/z'], /--nova is given twice/],
    [['--novaa', '/x', '--out', '/tmp/z'], /is not an argument/],
    [['--nova', '--out', '/tmp/z'], /--nova needs a value/],
    [['--nova', '/x', '--out', '/tmp/z', '--timeout-ms', 'soon'], /--timeout-ms "soon"/],
    [['--nova', '/x', '--out', '/tmp/z', '--timeout-ms', '5'], /--timeout-ms "5"/]
  ]) {
    const r = pilot(args)
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`)
    assert.match(r.stderr, re)
  }
  const out = tmp('i73-pilot-missing-')
  const missing = pilot(['--morgan', join(out, 'nowhere'), '--out', out])
  assert.equal(missing.status, 1)
  assert.match(missing.stdout, /verdict FAIL/)
  assert.match(readJson(join(out, 'ledger.json')).failures.join('\n'), /inventory\.json is missing/)
  // a broken inventory is a failure of that pilot, named, not a crash
  const broken = tmp('i73-broken-')
  writeFileSync(join(broken, 'inventory.json'), '{not json')
  writeFileSync(join(broken, 'render-routes.json'), '[]')
  const b = pilot(['--nova', broken, '--out', join(out, 'b')])
  assert.equal(b.status, 1)
  assert.match(b.stdout, /nova: /)
  // an output directory that is somebody else's is not reused
  const other = tmp('i73-other-')
  mkdirSync(join(other, 'nova', 'pack-1'), { recursive: true })
  writeFileSync(join(other, 'nova', 'pack-1', 'mine.txt'), 'keep')
  const x = pilot(['--nova', novaDir(), '--out', other, '--timeout-ms', '60000'])
  assert.equal(x.status, 1)
  assert.match(x.stdout, /not an earlier replay of this script/)
  assert.equal(readFileSync(join(other, 'nova', 'pack-1', 'mine.txt'), 'utf8'), 'keep')
})

test('pilot replay: a replay that does not finish in time fails the run, and one that changes its input is caught', () => {
  const nova = novaDir()
  const dir = tmp('i73-standin-')
  const hang = join(dir, 'hang.mjs')
  writeFileSync(hang, 'setInterval(() => {}, 1000)\n')
  const slow = pilot(['--nova', nova, '--out', join(dir, 'slow'), '--timeout-ms', '1000'], { env: { ...process.env, PILOT_FROM_JOOMLA_SCRIPT: hang }, timeout: 60000 })
  assert.equal(slow.status, 1)
  assert.match(slow.stdout, /replay 1 did not finish within 1000 ms/)
  // a stand-in that writes a real pack but also touches the pilot's input
  const touch = join(dir, 'touch.mjs')
  writeFileSync(touch, `import { appendFileSync } from 'node:fs'\nimport { spawnSync } from 'node:child_process'\nimport { join } from 'node:path'\nconst [j6, ...rest] = process.argv.slice(2)\nappendFileSync(join(j6, 'render-routes.json'), ' ')\nprocess.exit(spawnSync(process.execPath, [${JSON.stringify(join(here, '..', 'ingest', 'from-joomla.mjs'))}, j6, ...rest], { stdio: 'inherit' }).status)\n`)
  const changed = pilot(['--nova', nova, '--out', join(dir, 'changed'), '--timeout-ms', '60000'], { env: { ...process.env, PILOT_FROM_JOOMLA_SCRIPT: touch } })
  assert.equal(changed.status, 1)
  assert.match(changed.stdout, /the pilot's input changed during the replay \(1 file\(s\), first: render-routes\.json\)/)
  // a stand-in that writes two different packs: the replays are not deterministic
  const flaky = join(dir, 'flaky.mjs')
  writeFileSync(flaky, `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'\nimport { spawnSync } from 'node:child_process'\nimport { join } from 'node:path'\nconst [j6, ...rest] = process.argv.slice(2)\nconst r = spawnSync(process.execPath, [${JSON.stringify(join(here, '..', 'ingest', 'from-joomla.mjs'))}, j6, ...rest], { stdio: 'inherit' })\nconst out = rest[rest.indexOf('--out') + 1]\nconst f = join(out, 'content.json')\nconst c = JSON.parse(readFileSync(f, 'utf8'))\nc.site.name = String(Math.random())\nwriteFileSync(f, JSON.stringify(c))\nprocess.exit(r.status)\n`)
  const flakyRun = pilot(['--nova', nova, '--out', join(dir, 'flaky'), '--timeout-ms', '60000'], { env: { ...process.env, PILOT_FROM_JOOMLA_SCRIPT: flaky } })
  assert.equal(flakyRun.status, 1)
  assert.match(flakyRun.stdout, /the two replays differ in 1 file\(s\): content\.json/)
})

test('dump generation: dump.json records the hash of each file and of capture/; an interrupted or interleaved dump is refused, one writer at a time', async () => {
  const s = await jmSite()
  const site = s.base.href.replace(/\/$/, '')
  const first = await dumpCapture({ web: webRoot(), site, args: ['--capture'] })
  assert.equal(first.status, 0, first.stderr)
  const dj = () => readJson(join(first.j6, 'dump.json'))
  assert.ok(dj().generation.id && dj().generation.capture && dj().generation.files['inventory.json'], 'the generation is recorded')
  assert.equal(verifyGeneration(first.j6, dj()).checked, true)
  assert.equal(existsSync(join(first.j6, '.joomla-dump.lock')), false, 'the lock is released')
  // a dump made before the record is read as before
  assert.equal(verifyGeneration(first.j6, { dumpedAt: 'x' }).checked, false)
  // a run without a web target does not leave the earlier site-config.json beside its files: it is not part of the new generation
  const noWeb = await dumpCapture({ web: null, site, args: [], into: first.j6 })
  assert.equal(noWeb.status, 0, noWeb.stderr)
  assert.equal(existsSync(join(first.j6, 'site-config.json')), false, 'the earlier site-config.json is removed with the swap')
  assert.equal(verifyGeneration(first.j6, dj()).checked, true)
  assert.deepEqual(readdirSync(first.j6).filter((n) => /\.(tmp|bak)$/.test(n)), [])
  // a file of another generation, a file added, and capture/ gone are named
  const good = readFileSync(join(first.j6, 'inventory.json'), 'utf8')
  writeFileSync(join(first.j6, 'inventory.json'), `${good} `)
  assert.throws(() => verifyGeneration(first.j6, dj()), /inventory\.json differs from generation .*interrupted or two dumps interleaved/)
  writeFileSync(join(first.j6, 'inventory.json'), good)
  writeFileSync(join(first.j6, 'site-config.json'), '{}\n')
  assert.throws(() => verifyGeneration(first.j6, dj()), /site-config\.json is not in generation/)
  rmSync(join(first.j6, 'site-config.json'))
  // a writer killed between two renames (the new files are in place, the new dump.json is not) leaves a mixed directory and its lock: from-joomla refuses the directory, a second dump refuses the lock
  const killed = await dumpCapture({ web: webRoot(), site, args: ['--capture'], env: { JOOMLA_DUMP_KILL_AFTER: '3' }, into: first.j6 })
  assert.notEqual(killed.status, 0, killed.stderr)
  assert.ok(killed.stderr === '' || !/joomla-dump:/.test(killed.stderr), killed.stderr)
  assert.throws(() => verifyGeneration(first.j6, dj()), /joomla-dump\.publishing exists: a dump is being written .*run joomla-dump\.mjs again/, 'the directory is neither the old nor the new generation')
  assert.throws(() => buildSpecPack({ j6Dir: first.j6, out: join(tmp('i73-gen-'), 'pack'), pageFloor: 4, now: '2026-01-01T00:00:00Z' }), /joomla-dump\.publishing exists/)
  assert.equal(existsSync(join(first.j6, '.joomla-dump.lock')), true, 'a killed writer leaves its lock')
  const again = await dumpCapture({ web: null, site, args: [], into: first.j6 })
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, /another dump holds .*\.joomla-dump\.lock/)
  assert.throws(() => verifyGeneration(first.j6, dj()), /publishing exists/, 'a refused writer changes nothing')
  // a writer that died with dump.json moved aside leaves no record at all: the marker, not the missing record, decides — it is not read as an old dump
  rmSync(join(first.j6, 'dump.json'))
  assert.throws(() => verifyGeneration(first.j6, undefined), /publishing exists/)
  assert.throws(() => buildSpecPack({ j6Dir: first.j6, out: join(tmp('i73-gen-'), 'pack'), pageFloor: 4, now: '2026-01-01T00:00:00Z' }), /publishing exists/)
  // an interrupted dump's marker is never removed before its replacement exists, and a run that fails keeps it: the directory stays refused
  const stale = await dumpCapture({ web: null, site, args: [], into: first.j6 })
  assert.notEqual(stale.status, 0, 'the lock of the killed writer is still there')
  rmSync(join(first.j6, '.joomla-dump.lock'))
  const failing = await dumpCapture({ web: webRoot(), site, args: ['--capture'], env: { JOOMLA_DUMP_FAIL_RENAME_AFTER: '1' }, into: first.j6 })
  assert.notEqual(failing.status, 0)
  assert.ok(existsSync(join(first.j6, PUBLISHING_MARKER)), 'a failed run over an interrupted dump leaves the marker')
  assert.throws(() => verifyGeneration(first.j6, undefined), /publishing exists/)
  // a lock held by a live writer refuses a second one before it writes anything
  const held = tmp('i73-held-')
  const j6 = join(held, 'j6')
  mkdirSync(j6)
  writeFileSync(join(j6, '.joomla-dump.lock'), '1\n')
  const other = await dumpCapture({ web: null, site, args: [], into: j6 })
  assert.notEqual(other.status, 0)
  assert.match(other.stderr, /another dump holds/)
  assert.deepEqual(readdirSync(j6), ['.joomla-dump.lock'], 'nothing else was written')
})

test('pilot replay: a post whose {loadmoduleid} becomes a slot block is a gap (seed.mjs does not expand it in a post), never verified from the spec alone', () => {
  const nova = novaDir((inv) => {
    inv.content.find((a) => a.id === '3').introtext = '<p>Start of the article body words.</p>{loadmoduleid 116}<p>Middle of the article body words here.</p>'
  })
  const out = tmp('i73-pilot-post-')
  const r = pilot(['--nova', nova, '--out', out, '--timeout-ms', '120000'])
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  const row = readJson(join(out, 'ledger.json')).ledger.find((l) => l.item.includes('S-22'))
  assert.equal(row.status, 'gap', JSON.stringify(row))
  assert.match(row.detail, /post slot\(s\) .*depend on seed\.mjs, which does not expand a slot block in a post body/)
})

test('dump generation: a reader refuses a directory another dump replaced while it was read — one ingest never mixes two generations', async () => {
  const s = await jmSite()
  const site = s.base.href.replace(/\/$/, '')
  const first = await dumpCapture({ web: webRoot(), site, args: ['--capture'] })
  assert.equal(first.status, 0, first.stderr)
  const j6 = first.j6
  const pack = () => join(tmp('i73-read-'), 'pack')
  const opts = { j6Dir: j6, pageFloor: 4, now: '2026-01-01T00:00:00Z' }
  // undisturbed: read
  assert.doesNotThrow(() => buildSpecPack({ ...opts, out: pack() }))
  // a file replaced after it was read (the writer's files are in place, its dump.json is not)
  const good = readFileSync(join(j6, 'render-routes.json'), 'utf8')
  assert.throws(() => buildSpecPack({ ...opts, out: pack(), hooks: { afterInputs: () => writeFileSync(join(j6, 'render-routes.json'), `${good} `) } }), /render-routes\.json differs from generation/)
  writeFileSync(join(j6, 'render-routes.json'), good)
  // capture/ changed after it was read
  const tpl = join(j6, 'capture', 'templates', 'tracy', 'templateDetails.xml')
  const xml = readFileSync(tpl, 'utf8')
  assert.throws(() => buildSpecPack({ ...opts, out: pack(), hooks: { afterInputs: () => writeFileSync(tpl, `${xml}\n`) } }), /capture differs from generation/)
  writeFileSync(tpl, xml)
  // a whole new generation published in between: another id
  const dj = readJson(join(j6, 'dump.json'))
  assert.throws(() => buildSpecPack({ ...opts, out: pack(), hooks: { afterInputs: () => writeFileSync(join(j6, 'dump.json'), JSON.stringify({ ...dj, generation: { ...dj.generation, id: 'other' } })) } }), /dump\.json changed while it was read/)
  writeFileSync(join(j6, 'dump.json'), `${JSON.stringify(dj, null, 2)}\n`)
  // a marker that appears while it is read
  assert.throws(() => buildSpecPack({ ...opts, out: pack(), hooks: { afterInputs: () => writeFileSync(join(j6, PUBLISHING_MARKER), '1\n') } }), /publishing exists/)
  rmSync(join(j6, PUBLISHING_MARKER))
  // a publication that started while it was read and rolled back leaves the old files and the old dump.json, but its epoch: the read is refused
  assert.throws(() => buildSpecPack({ ...opts, out: pack(), hooks: { afterInputs: () => bumpEpoch(j6) } }), /\.joomla-dump\.epoch changed while .* was read/)
  // capture/ present while the generation recorded none
  const dj2 = readJson(join(j6, 'dump.json'))
  assert.throws(() => verifyGeneration(j6, { ...dj2, generation: { ...dj2.generation, capture: null } }), /capture is present but generation .* recorded no capture/)
  assert.equal(recheckGeneration(j6, { dumpedAt: 'x' }, {}).checked, false, 'a dump without a record has nothing to recheck')
})

test('capture: stylesheet links read rel and href by exact name — data-rel and data-href are not them', () => {
  const html = `<link data-rel="stylesheet" href="/decoy.css"><link rel="stylesheet" data-href="/no.css" href="/real.css"><link data-href="/x.css" rel="stylesheet" href='/y.css'>`
  assert.deepEqual(stylesheetLinks(html), ['/real.css', '/y.css'])
})

test('profile and contact text is kept whole, never cut; a long misc stays valid HTML', () => {
  const long = 'x'.repeat(30000)
  const misc = `<p>${long}</p>`
  const c = contactRow({ id: 1, name: 'A', address: 'y'.repeat(5000), misc, params: '{}' })
  assert.equal(c.street.length, 5000)
  assert.equal(c.misc, misc)
  const p = authorProfiles({ user_profiles: [{ user_id: '1', profile_key: 'profile.aboutme', profile_value: JSON.stringify(long) }] })
  assert.equal(p.get('1').description, long)
})

test('capture: a ">" inside a quoted link attribute keeps the stylesheet; an unclosed link tag throws', () => {
  assert.deepEqual(stylesheetLinks('<link title="a>b" rel="stylesheet" href="/site.css">'), ['/site.css'])
  assert.throws(() => stylesheetLinks('<link rel="stylesheet" href="/x.css'), /not closed/)
})

test('capture: a <link> quoted inside another tag attribute is not a stylesheet the page links', () => {
  assert.deepEqual(stylesheetLinks('<link title="<link rel=stylesheet href=/fake.css>" rel="stylesheet" href="/real.css">'), ['/real.css'])
})

test('capture: a <link> in a comment, a quoted attribute of another tag or a script body is not a stylesheet; linkfoo is not link; an unclosed other tag throws', () => {
  const html = `<!-- <link rel=stylesheet href=/c.css> --><div title="<link rel=stylesheet href=/q.css>"></div><script>var s='<link rel=stylesheet href=/s.css>'; if (a<b) x("</p>")</script><linkfoo rel=stylesheet href=/f.css><link rel=stylesheet href=/real.css>`
  assert.deepEqual(stylesheetLinks(html), ['/real.css'])
  assert.throws(() => stylesheetLinks('<div title="x><link rel=stylesheet href=/late.css>'), /not closed/)
})

test('capture: a tar cut inside an entry\'s padding or before its end block is refused', () => {
  const full = tar(tarEntry('a/b', { data: 'xy' }))
  assert.equal(readTar(full).length, 1)
  assert.throws(() => readTar(full.subarray(0, 512 + 100)), /cut off/)
  assert.throws(() => readTar(full.subarray(0, 1024)), /end-of-archive|cut off/)
})

test('capture: the end of a tar is two zero blocks and nothing else; directories count against the entry limit', () => {
  const one = Buffer.concat([tarEntry('a/b', { data: 'xy' }), Buffer.alloc(512)])
  assert.throws(() => readTar(one), /end-of-archive marker/)
  const junk = Buffer.concat([tarEntry('a/b', { data: 'xy' }), Buffer.alloc(1024), Buffer.from('junk')])
  assert.throws(() => readTar(junk), /end-of-archive marker/)
  assert.throws(() => readTar(tar(tarEntry('a/', { type: '5' }), tarEntry('b/', { type: '5' })), { ...CAPTURE_LIMITS, files: 1 }), /more than 1 entries/)
})
