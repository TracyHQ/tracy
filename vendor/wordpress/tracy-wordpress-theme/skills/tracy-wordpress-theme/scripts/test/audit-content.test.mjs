// Content-class checks (review/content-audit.mjs) and the seeder's one-article-one-post rule.
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { auditCmsLeftovers, auditListings, categoryTreeFindings, extractListings, scanCmsLeftovers, allowlistErrors } from '../review/content-audit.mjs'
import { mergeSharedArticles, parseArgs, runSeed } from '../seed.mjs'
import { fakeSite } from './lib/fake-site.mjs'
import { testDir } from './lib/test-root.mjs'
import { footerPage, listingPage, writeSharedSpec } from './audit-fixture.mjs'

// ── CMS leftovers ─────────────────────────────────────────────────────────────────────────
test('cms-leftovers: the audited "Joomla!" footer, a plumbing link, T4 Framework and a JoomlArt copyright are each a finding', () => {
  const bad = footerPage(
    '<p>Copyright © 2024 JoomlArt. All rights reserved.</p><p>Powered by Joomla!</p><p><a href="/index.php?option=com_content&view=article&id=3">Terms</a></p><small>Built on T4 Framework</small>',
    '<p>Welcome</p><meta name="generator" content="Joomla! - Open Source Content Management">'
  )
  const r = scanCmsLeftovers(bad, { route: '/' })
  const tokens = new Set(r.findings.map((f) => f.token))
  for (const t of ['joomla', 'joomlart-copyright', 'index.php?option=', 'com_content', 't4-framework']) assert.ok(tokens.has(t), `${t} found`)
  assert.ok(r.findings.some((f) => f.region === 'footer' && f.token === 'joomla'))
  assert.ok(r.examined > 0)
})

test('cms-leftovers: a clean page, and a JoomlArt mention that is not a copyright line, are not findings', () => {
  const clean = footerPage('<p>© 2026 Acme Studio. All rights reserved.</p>', '<p>We once worked with JoomlArt on a poster.</p>')
  assert.deepEqual(scanCmsLeftovers(clean, { route: '/' }).findings, [])
})

test('cms-leftovers: an exception needs a route, token, exact text and a reason, and the source CONTENT must show that text', () => {
  const page = footerPage('<p>Powered by Joomla!</p>', '<p>Migrating from Joomla! to WordPress takes a day.</p>')
  const allow = [{ route: '/', token: 'joomla', text: 'Migrating from Joomla! to WordPress', reason: 'the article is about Joomla' }]
  const source = footerPage('<p>Powered by Joomla!</p>', '<p>Migrating from Joomla! to WordPress takes a day.</p>')
  const r = scanCmsLeftovers(page, { route: '/', allow, sourceHtml: source })
  assert.equal(r.exempt.length, 1, 'the article mention is exempt')
  assert.equal(r.findings.length, 1, 'the footer is still a finding — source footer branding alone exempts nothing')
  assert.equal(r.findings[0].region, 'footer')
  // an exemption the source does not back
  const unbacked = scanCmsLeftovers(page, { route: '/', allow, sourceHtml: footerPage('<p>Powered by Joomla!</p>', '<p>Nothing about it.</p>') })
  assert.equal(unbacked.exempt.length, 0)
  // text that only the source footer shows
  const footerOnly = scanCmsLeftovers(page, { route: '/', allow: [{ route: '/', token: 'joomla', text: 'Powered by Joomla!', reason: 'x' }], sourceHtml: source })
  assert.equal(footerOnly.exempt.length, 0, 'a footer hit is never exempt')
  assert.equal(footerOnly.findings.length, 2)
})

test('cms-leftovers: Joomla named only in the document head (an inline <style> comment, <title>) is not page text — a false positive of the live Essence run', () => {
  const head = '<style>/* wp-ja-essence: dark mode. The source (JA Essence, Joomla 6 T4) follows the OS */ .x{color:red}</style>'
  const page = `<!doctype html><html><head><title>JA Essence</title>${head}</head>\nstray text <body>text before the first element<header><nav><a href="/">Home</a></nav></header><main><p>Welcome</p></main><footer><p>© 2026 Acme</p></footer></body></html>`
  const r = scanCmsLeftovers(page, { route: '/' })
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  assert.ok(r.examined > 0)
  // the same word in visible text is still found, with the body's own stray text in the line
  const visible = scanCmsLeftovers(page.replace('text before the first element', 'Built with Joomla'), { route: '/' })
  assert.equal(visible.findings.length, 1)
  assert.ok(!visible.findings[0].context.includes('wp-ja-essence'), 'the line is the body text, not the head')
})

test('cms-leftovers: malformed allowlist rows are refused before scanning', () => {
  for (const bad of [[{ route: '*', token: 'joomla', text: 'x', reason: 'y' }], [{ route: '/', token: 'nope', text: 'x', reason: 'y' }], [{ route: '/', token: 'joomla', reason: 'y' }], [{ route: '/', token: 'joomla', text: 'x' }], 'all'])
    assert.ok(allowlistErrors(bad).length, JSON.stringify(bad))
  assert.throws(() => scanCmsLeftovers('<p>x</p>', { route: '/', allow: [{}] }), /needs one exact route/)
})

test('cms-leftovers: every route is read; a missing page, a 404 and an empty page make the audit unclean', async () => {
  const pages = { '/': footerPage('<p>© 2026 Acme</p>'), '/b': footerPage('<p>Powered by Joomla!</p>'), '/empty': '<html><body></body></html>' }
  const fetchPage = async (route) => (route === '/gone' ? { status: 404, html: '' } : route === '/boom' ? Promise.reject(new Error('connection refused')) : { status: 200, html: pages[route] })
  const r = await auditCmsLeftovers({ routes: ['/', '/b', '/gone', '/boom', '/empty'], fetchPage })
  assert.equal(r.ok, false)
  assert.equal(r.findings.length, 1)
  assert.deepEqual(r.unmeasured.map((u) => u.route).sort(), ['/boom', '/empty', '/gone'])
  const clean = await auditCmsLeftovers({ routes: ['/'], fetchPage })
  assert.equal(clean.ok, true)
  await assert.rejects(() => auditCmsLeftovers({ routes: [], fetchPage }), /no routes/)
})

// ── listing duplicates ────────────────────────────────────────────────────────────────────
test('listings: a title printed twice where the source prints it once is a finding; once, or as often as the source, is not', () => {
  const source = listingPage(['Alpha', 'Beta', 'Gamma'])
  const dup = auditListings({ route: '/blog', siteHtml: listingPage(['Alpha', 'Beta', 'Gamma', 'Beta']), sourceHtml: source })
  assert.equal(dup.findings.length, 1)
  assert.deepEqual({ t: dup.findings[0].title, s: dup.findings[0].siteCount, o: dup.findings[0].sourceCount }, { t: 'Beta', s: 2, o: 1 })
  assert.deepEqual(auditListings({ route: '/blog', siteHtml: listingPage(['Alpha', 'Beta', 'Gamma']), sourceHtml: source }).findings, [])
  const both = auditListings({ route: '/blog', siteHtml: listingPage(['Alpha', 'Beta', 'Beta']), sourceHtml: listingPage(['Alpha', 'Beta', 'Beta']) })
  assert.equal(both.findings.length, 0, 'the source prints Beta twice itself: the site matching it is not a defect')
  assert.ok(both.examined > 0)
})

test('listings: hidden templates, carousel clones and a linked heading are not counted twice', () => {
  const html = `<main><div class="list">
    <article class="blog-item"><h3><a href="/a/">Alpha</a></h3></article>
    <article class="blog-item"><h3><a href="/b/">Beta</a></h3></article>
    <article class="blog-item swiper-slide-duplicate"><h3>Alpha</h3></article>
    <template><article class="blog-item"><h3>Beta</h3></article></template>
    <article class="blog-item" hidden><h3>Beta</h3></article></div></main>`
  assert.deepEqual(extractListings(html)[0].titles, ['Alpha', 'Beta'])
  assert.deepEqual(auditListings({ route: '/', siteHtml: html, sourceHtml: html }).findings, [])
})

test('listings (live Impact false positive): a Joomla grid of .items-row > .item is one listing across its rows; a source whose listing cannot be read claims nothing', () => {
  const grid = (titles, perRow = 2) => {
    const rows = []
    for (let i = 0; i < titles.length; i += perRow) rows.push(`<div class="items-row cols-2 row-cols-1">${titles.slice(i, i + perRow).map((t) => `<div class="item"><div class="item-inner"><div class="page-header"><h2><a href="/x">${t}</a></h2></div></div></div>`).join('')}</div>`)
    return `<main><div class="blog">${rows.join('')}</div></main>`
  }
  const src = grid(['Alpha', 'Beta', 'Beta', 'Gamma'])
  assert.deepEqual(extractListings(src)[0].titles, ['Alpha', 'Beta', 'Beta', 'Gamma'], 'the rows are not items; the listing runs across them')
  const site = listingPage(['Alpha', 'Beta', 'Beta', 'Gamma'])
  assert.deepEqual(auditListings({ route: '/blog', siteHtml: site, sourceHtml: src }).findings, [], 'the source prints Beta twice itself')
  assert.equal(auditListings({ route: '/blog', siteHtml: listingPage(['Alpha', 'Beta', 'Beta', 'Gamma']), sourceHtml: grid(['Alpha', 'Beta', 'Gamma', 'Delta']) }).findings.length, 1, 'the source prints it once: still a finding')
  // the source page has no readable listing at all: no finding, and it says so
  const none = auditListings({ route: '/blog', siteHtml: site, sourceHtml: '<main><p>No posts</p></main>' })
  assert.deepEqual(none.findings, [])
  assert.match(none.unmeasured, /no listing that could be read/)
})

// ── category trees ────────────────────────────────────────────────────────────────────────
test('category trees: the same name under a second parent where the source has one is a finding; a source-declared duplicate and a source alias are not', () => {
  const source = [{ name: 'Health', alias: 'health', parent: null }, { name: 'News', alias: 'news', parent: null }]
  const dup = categoryTreeFindings({ site: [{ name: 'Health', slug: 'health', parent: null }, { name: 'Health', slug: 'health-2', parent: 'News' }], source })
  assert.equal(dup.findings.filter((f) => f.kind === 'category-tree').length, 1)
  const declared = categoryTreeFindings({ site: [{ name: 'Health', slug: 'health', parent: null }, { name: 'Health', slug: 'health-news', parent: 'News' }], source: [...source, { name: 'Health', alias: 'health-news', parent: 'News' }] })
  assert.deepEqual(declared.findings, [])
  const slug = categoryTreeFindings({ site: [{ name: 'News', slug: 'latest-news', parent: null }], source })
  assert.deepEqual(slug.findings.map((f) => [f.kind, f.siteSlug, f.sourceAlias]), [['category-slug', 'latest-news', 'news']])
  assert.deepEqual(categoryTreeFindings({ site: [{ name: 'News', slug: 'news', parent: null }], source }).findings, [])
})

// ── seeder: one article, one post, several categories ────────────────────────────────────
const post = (slug, category, id, extra = {}) => ({ slug, category, title: 'Shared Story', content: '<p>Same words.</p>', joomla: { articleId: String(id), alias: 'shared-story' }, ...extra })

test('mergeSharedArticles: same alias, title, words and picture fold into one post with both categories; differing content stays apart', () => {
  const posts = [post('shared-story', 'blogs', 10), post('shared-story', 'news', 20), post('shared-story', 'sport', 30, { content: '<p>Other words entirely.</p>' }), post('lonely', 'blogs', 40, { joomla: { articleId: '40' } })]
  const notes = mergeSharedArticles(posts)
  assert.deepEqual(posts.map((p) => p.joomla.articleId), ['10', '30', '40'])
  assert.deepEqual(posts[0].categories, ['blogs', 'news'])
  assert.deepEqual(posts[0].joomla.alsoArticleIds, ['20'])
  assert.ok(notes.some((n) => /a different article, not merged/.test(n.note)), 'the conflicting copy is reported, not merged')
  assert.equal(posts[1].categories, undefined)
})

test('mergeSharedArticles: no alias is never a merge (a title alone is not identity)', () => {
  const posts = [post('a', 'x', 1, { joomla: { articleId: '1' } }), post('a', 'y', 2, { joomla: { articleId: '2' } })]
  assert.deepEqual(mergeSharedArticles(posts), [])
  assert.equal(posts.length, 2)
})

async function seed(site, root, n) {
  const spec = join(root, 'spec')
  writeSharedSpec(spec)
  const opts = parseArgs(['--spec', spec, '--wp', 'fake', '--theme', 'wp-tracy-business', '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img', '--base-url', 'http://x', '--report', join(root, `report-${n}.json`)])
  const e = console.error
  console.error = () => {}
  try {
    return await runSeed(opts, { runner: site.wp, fetch: async () => ({ status: 200, headers: new Map() }) })
  } finally {
    console.error = e
  }
}

test('seed: a shared article is one post in two categories with a stable id, and the second seed changes nothing', async () => {
  const site = fakeSite()
  const root = testDir('audit-content')
  const first = await seed(site, root, 1)
  const posts = [...site.posts.values()].filter((p) => p.post_type === 'post')
  assert.equal(posts.length, 1, 'one WordPress post, not one per category')
  assert.equal(posts[0].post_name, 'shared-story', 'the slug is the source alias, not -2')
  assert.equal(String(posts[0].post_category).split(',').length, 2, 'in both categories')
  assert.equal(first.counts.posts.created, 1)
  const id = posts[0].ID
  const second = await seed(site, root, 2)
  assert.equal(second.counts.posts.created, 0)
  assert.equal(second.counts.posts.updated, 0)
  assert.equal([...site.posts.values()].find((p) => p.post_type === 'post').ID, id)
})

// ── amendment class 12: copy that promises behaviour WordPress does not have ───────────────────
import { auditBehaviorCopy, behaviorGate, featureOfAction, reviewErrors, scanBehaviorCopy } from '../review/behavior-copy.mjs'
import { parseDecisions } from '../lib/parity-acceptance.mjs'

const remind = (copy, action = '/wp-login.php?action=lostpassword') =>
  `<!doctype html><html><head><title>Username reminder</title></head><body><main><h1>Remind</h1><p class="lead">${copy}</p><form method="post" action="${action}"><label>Email <input name="user_login" type="email"></label><button>Send</button></form></main></body></html>`
const review = (c, over = {}) => ({ route: c.route, claim: c.claim, claimHash: c.claimHash, observed: 'submitted a test address on the stand: the mail was a password-reset link', evidence: 'mail log 2026-10-02', reviewer: 'Hano', disposition: 'truthful', ...over })

test('behavior-copy: "your username will be emailed" over a lostpassword form is a contradiction the scan sees', () => {
  const r = scanBehaviorCopy(remind('Your username will be emailed to you.'), { route: '/username-reminder/' })
  assert.equal(r.claims.length, 1, JSON.stringify(r.claims))
  assert.equal(r.claims[0].claim, 'username-emailed')
  assert.equal(r.claims[0].feature, 'password-reset')
  assert.equal(r.claims[0].contradicts, true)
  assert.ok(r.examined > 0)
  assert.equal(featureOfAction('/wp-login.php?action=lostpassword'), 'password-reset')
})

const adminPost = (copy, handler) =>
  `<!doctype html><html><head><title>Username reminder</title></head><body><main><h1>Remind</h1><div class="alert">${copy}</div><form method="post" action="https://site.test/wp-admin/admin-post.php">${handler === null ? '' : `<input type="hidden" name="action" value="${handler}">`}<label>Email <input name="email" type="email"></label><button>Send</button></form></main></body></html>`

test('behavior-copy: admin-post.php is not a contact form by its URL — the handler the form names decides, what it cannot prove is a claim to review, not a lie', () => {
  const copy = 'Enter the email address of your account. Your username will be emailed to the email address on file.'
  // a username-reminder handler keeps the promise: no contradiction (it was reported as an unkept promise)
  const kept = scanBehaviorCopy(adminPost(copy, 'jm_remind'), { route: '/username-reminder-request' }).claims
  assert.equal(kept.length, 1)
  assert.equal(kept[0].feature, 'username-reminder')
  assert.equal(kept[0].contradicts, false)
  // a handler the detector does not know, or none at all: unknown — still a claim a person must review, never a contradiction
  for (const handler of ['jm_do_thing', null]) {
    const [c] = scanBehaviorCopy(adminPost(copy, handler), { route: '/r' }).claims
    assert.equal(c.feature, null, String(handler))
    assert.equal(c.contradicts, false, String(handler))
    assert.equal(behaviorGate({ claims: [c], reviews: [] }).findings[0].kind, 'behavior-copy-unreviewed', 'it is still reviewed')
  }
  // a handler that is provably something else still contradicts the promise
  const [lie] = scanBehaviorCopy(adminPost(copy, 'jm_contact_form'), { route: '/r' }).claims
  assert.equal(lie.feature, 'contact-form')
  assert.equal(lie.contradicts, true)
  // the handler may be named in the URL's query instead of a field
  assert.equal(featureOfAction('https://site.test/wp-admin/admin-post.php?action=jm_remind'), 'username-reminder')
  assert.equal(featureOfAction('/wp-admin/admin-post.php'), null)
  assert.equal(featureOfAction('/wp-admin/admin-post.php', { handler: 'send_contact' }), 'contact-form')
  // the other known endpoints are read as before
  assert.equal(featureOfAction('/contact-us/'), 'contact-form')
  assert.equal(featureOfAction('/wp-json/contact-form-7/v1/contact-forms/1/feedback'), 'contact-form')
  assert.equal(featureOfAction('/wp-comments-post.php'), 'comment')
})

test('behavior-copy: an unreviewed, a stale, an open and a truthful-claimed false promise each block; only an owner-approved citation passes', () => {
  const [c] = scanBehaviorCopy(remind('Your username will be emailed to you.'), { route: '/username-reminder/' }).claims
  assert.equal(behaviorGate({ claims: [c], reviews: [] }).findings[0].kind, 'behavior-copy-unreviewed')
  assert.equal(behaviorGate({ claims: [c], reviews: [review(c, { claimHash: '0123456789abcdef' })] }).findings[0].kind, 'behavior-copy-stale')
  assert.equal(behaviorGate({ claims: [c], reviews: [review(c, { disposition: 'open' })] }).findings[0].kind, 'behavior-copy-unresolved')
  const lie = behaviorGate({ claims: [c], reviews: [review(c)] })
  assert.equal(lie.findings[0].kind, 'behavior-copy-false', 'a reviewer cannot call a false promise truthful')
  const d = parseDecisions('| D-77 | The /username-reminder/ page keeps the source wording "Your username will be emailed to you." | OPEN |\n| D-78 | The /username-reminder/ page keeps the source layout | OPEN |')
  assert.equal(behaviorGate({ claims: [c], reviews: [review(c, { disposition: 'owner-approved' })], decisions: d }).ok, false, 'owner-approved without a decision')
  assert.equal(behaviorGate({ claims: [c], reviews: [review(c, { disposition: 'owner-approved', decision: 'D-77' })], decisions: d }).ok, true)
  assert.equal(behaviorGate({ claims: [c], reviews: [review(c, { disposition: 'owner-approved', decision: 'D-99' })], decisions: d }).ok, false, 'a decision that does not exist')
  const unrelated = behaviorGate({ claims: [c], reviews: [review(c, { disposition: 'owner-approved', decision: 'D-78' })], decisions: d })
  assert.equal(unrelated.ok, false, 'a decision that names the page but not the promise approves nothing')
  assert.match(unrelated.findings[0].detail, /does not mention/)
  assert.equal(behaviorGate({ claims: [c], reviews: [review(c, { disposition: 'owner-approved', decision: 'D-77' })] }).ok, false, 'decisions that cannot be read approve nothing, even with a citation')
})

test('behavior-copy: corrected truthful copy with a current review passes; changing the copy or the action makes the review stale', () => {
  const good = scanBehaviorCopy(remind('Enter your email address and we will send you a link to reset your password.'), { route: '/reset/' }).claims
  assert.equal(good.length, 1)
  assert.equal(good[0].claim, 'password-emailed')
  assert.equal(good[0].contradicts, false)
  const rv = review(good[0])
  assert.deepEqual(behaviorGate({ claims: good, reviews: [rv] }).findings, [])
  const changed = scanBehaviorCopy(remind('Enter your email address and we will send you a link to reset your password.', '/somewhere-else'), { route: '/reset/' }).claims
  assert.equal(behaviorGate({ claims: changed, reviews: [rv] }).findings[0].kind, 'behavior-copy-stale', 'the action changed')
  assert.equal(behaviorGate({ claims: [{ ...good[0], copy: 'We will mail you a password reset link soon.', claimHash: 'ffffffffffffffff' }], reviews: [rv] }).findings[0].kind, 'behavior-copy-stale')
  assert.ok(reviewErrors([{ route: '/a/', claim: 'username-emailed', claimHash: 'x', disposition: 'truthful' }]).length, 'a review without evidence is refused')
})

test('behavior-copy: audit reads every route; an unreadable or empty route makes it unclean', async () => {
  const pages = { '/a/': remind('Your username will be emailed to you.'), '/ok/': '<html><body><main><p>Nothing promised here.</p></main></body></html>', '/empty/': '<html><body></body></html>' }
  const fetchPage = async (route) => (route === '/gone/' ? { status: 404, html: '' } : { status: 200, html: pages[route] })
  const r = await auditBehaviorCopy({ routes: ['/a/', '/ok/', '/gone/', '/empty/'], fetchPage })
  assert.equal(r.ok, false)
  assert.deepEqual(r.unmeasured.map((u) => u.route).sort(), ['/empty/', '/gone/'])
  assert.deepEqual(r.findings.map((f) => f.kind), ['behavior-copy-unreviewed'])
  await assert.rejects(auditBehaviorCopy({ routes: [], fetchPage }), /no routes/)
  await assert.rejects(auditBehaviorCopy({ routes: ['/a/'], fetchPage, reviews: 'all' }), /not a list/)
})

test('cms-leftovers: with decisions given, an exemption cites one existing decision that mentions its text', () => {
  const d = parseDecisions('| D-02 | The footer says Powered by Joomla! on the source too | OPEN |\n| D-12 | something else | OPEN |')
  const row = { route: '/', token: 'joomla', text: 'Powered by Joomla!', reason: 'x', decision: 'D-02' }
  assert.deepEqual(allowlistErrors([row], { decisions: d }), [])
  assert.ok(allowlistErrors([{ ...row, decision: 'D-12' }], { decisions: d }).length, 'unrelated decision')
  assert.ok(allowlistErrors([{ ...row, decision: 'D-gb-1' }], { decisions: d }).length, 'missing decision')
  assert.ok(allowlistErrors([{ ...row, decision: undefined }], { decisions: d }).length, 'no citation')
})

test('behavior-copy: the login field label "Username or Email Address" is a label, not a promise that a username is emailed', () => {
  const login = '<form action="https://x.test/wp-login.php" method="post"><label for="u">Username or Email Address</label><input id="u" name="log"><button>Log in</button></form>'
  assert.deepEqual(scanBehaviorCopy(login, { route: '/login' }).claims, [])
  assert.deepEqual(scanBehaviorCopy('<form action="/wp-login.php?action=lostpassword"><label>Email Address or Password</label><input name="user_login"></form>', { route: '/x' }).claims, [])
  // a real promise is still read
  const promise = '<form action="/wp-login.php?action=lostpassword"><p>Enter your email address. Your username will be emailed to you.</p><input name="user_login"></form>'
  const claims = scanBehaviorCopy(promise, { route: '/lost' }).claims
  assert.equal(claims.length, 1)
  assert.equal(claims[0].claim, 'username-emailed')
  assert.equal(claims[0].contradicts, true)
  assert.equal(scanBehaviorCopy('<form action="/wp-login.php?action=lostpassword"><p>We will email you a password reset link.</p></form>', { route: '/lost' }).claims[0].claim, 'password-emailed')
})
