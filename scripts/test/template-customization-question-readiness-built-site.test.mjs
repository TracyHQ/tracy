/**
 * The Template Customization Question Readiness built-site check (`scripts/template-customization-question-readiness-built-site.mjs`) on saved HTML. The fixtures
 * (`fixtures/template-customization-question-readiness-built-site/{site,demo}/`) are pages cut from the g59 test builds of 10/10/2026
 * (a Vietnamese FULL site) and their English demo, at the same paths, each keeping the markup of
 * one g59 defect: "By" painted by CSS, "Read more", "Tháng 6 9, 2023", a contact form left
 * `lang="en-US"`, "@Grazia on instagram" rewritten into an action on `#`, "Xem thực đơn" leading to
 * /contact, two posts with near-identical titles, "Details" turned into "Banner được lưu thành công.",
 * Previous / Next changed, an English Typography kit page, a button to the demo company's PDF and filler service names ("Mỗi sáng").
 * The whole audit runs on them through a fake fetch, so no network is used.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { auditBuiltSite } from '../lib/template-customization-question-readiness-built-site/audit.mjs'
import {
  articleOf,
  blockChanges,
  repeatedTitles,
  stretchedLabels
} from '../lib/template-customization-question-readiness-built-site/content.mjs'
import { wrongDates } from '../lib/template-customization-question-readiness-built-site/dates-and-styles.mjs'
import { namesTarget } from '../lib/template-customization-question-readiness-built-site/labels.mjs'
import { categoryTitle } from '../lib/template-customization-question-readiness-built-site/menus.mjs'
import {
  allowedWords,
  documentOf,
  englishRuns,
  isEnglish
} from '../lib/template-customization-question-readiness-built-site/text.mjs'

const FIXTURES = new URL('./fixtures/template-customization-question-readiness-built-site/', import.meta.url)

/** A fetch serving `<side>/<path as file name>`, 404 for anything else. */
function fakeFetch(/** @type {Record<string, string>} */ origins) {
  return async (/** @type {string} */ url) => {
    const u = new URL(url)
    const side = origins[u.origin]
    const name = u.pathname === '/' ? 'home.html' : u.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_')
    let body = null
    try {
      body = readFileSync(
        new URL(`${side}/${name.endsWith('.css') ? name : `${name.replace(/\.html$/, '')}.html`}`, FIXTURES),
        'utf8'
      )
    } catch {
      // not saved: a 404
    }
    return new Response(body ?? 'Not found', { status: body === null ? 404 : 200 })
  }
}

const SITE = 'https://g59-full.test'
const DEMO = 'https://demo.test'
const run = () =>
  auditBuiltSite({
    site: SITE,
    demo: DEMO,
    set: 'full',
    lang: 'vi',
    unticked: ['/detail/video/'],
    names: ['Tiệm Bánh Tamarind & Co'],
    allow: ['sourdough', 'Dubai'],
    fetch: /** @type {any} */ (fakeFetch({ [SITE]: 'site', [DEMO]: 'demo' }))
  })

test('the audit reproduces each g59 defect on the saved pages', async () => {
  const report = await run()
  const by = Object.fromEntries(report.checks.map((c) => [c.id, c]))
  const items = (/** @type {string} */ id) => by[id].items.join('\n')
  assert.equal(by['english-left'].outcome, 'FAIL')
  assert.match(items('english-left'), /"Read more"/)
  assert.match(items('english-left'), /"Send a copy to yourself"/)
  assert.match(items('english-left'), /All Rights Reserved/)
  assert.doesNotMatch(items('english-left'), /"Email"|Woodrow Ortega|sourdough/)
  assert.match(items('css-words'), /"By" \(\.je-meta \.wp-block-post-author-name::before\)/)
  assert.doesNotMatch(items('css-words'), /201C/)
  assert.match(items('dates'), /"Tháng 6 9, 2023"/)
  assert.match(items('form-language'), /wpcf7 no-js" lang="en-US"/)
  assert.match(items('dead-buttons'), /Xem hình ảnh bánh → #/)
  assert.equal(by['demo-files'].outcome, 'FAIL')
  assert.match(items('demo-files'), /Liên hệ tiệm bánh → \/_emdash\/api\/media\/file\/profile\.pdf/)
  assert.match(items('label-targets'), /"Xem thực đơn" \(demo "Become a subscriber"\) → \/contact/)
  assert.match(items('social-count'), /0 of the demo's 1 social buttons/)
  assert.match(items('page-navigation'), /prev: demo \/p1\/, site \/p2\//)
  assert.match(items('page-navigation'), /next: demo \/p2\/, site none/)
  assert.match(items('repeated-posts'), /"Bánh nướng mỗi sáng ở Dubai" ~ "Bánh mì nướng mỗi sáng ở Dubai"/)
  assert.match(items('wrong-translation'), /"Details" → "Banner được lưu thành công\."/)
  assert.match(items('kit-translated'), /"Typography"/)
  assert.doesNotMatch(items('kit-translated'), /translated paragraph/)
  assert.match(
    items('service-items'),
    /"Mỗi sáng", "Gia đình" beside "Bánh mì sourdough", "Bánh mì Việt" → \/services/
  )
  assert.equal(by['unticked-gone'].outcome, 'PASS')
})

test('English detection: loanwords, names and Vietnamese pass; English interface words do not', () => {
  const allow = allowedWords('vi', ['Tiệm Bánh Tamarind & Co'])
  const en = (/** @type {string} */ s) =>
    isEnglish(s, { lang: 'vi', allow, names: ['Tiệm Bánh Tamarind & Co'] })
  for (const s of [
    'Share article:',
    'Tags in:',
    'By',
    'Remember me',
    'Advanced Search',
    'Tiệm Bánh Tamarind & Co. All Rights Reserved.'
  ])
    assert.equal(en(s), true, s)
  for (const s of ['Email', 'Chia sẻ bài viết', 'Eula Ward', '#14171A', '48 ha', 'Video'])
    assert.equal(en(s), false, s)
  assert.equal(isEnglish('Share article', { lang: 'en', allow }), false)
})

test('dates: English month names and a Vietnamese month before the day are wrong; the language order is not', () => {
  const doc = (/** @type {string} */ t) => documentOf(`<body><time>${t}</time></body>`)
  assert.deepEqual(wrongDates(doc('Jun 09, 2023'), 'vi'), ['Jun 09, 2023'])
  assert.deepEqual(wrongDates(doc('Th6 09, 2023'), 'vi'), ['Th6 09, 2023'])
  assert.deepEqual(wrongDates(doc('9 tháng 6, 2023'), 'vi'), [])
  assert.deepEqual(wrongDates(doc('09/06/2023'), 'vi'), [])
})

test('label targets: a contact page takes a contact word; another page a word of its title', () => {
  assert.equal(namesTarget('Xem bánh →', '/contact', 'Liên hệ', 'vi'), false)
  assert.equal(namesTarget('Đặt bánh', '/contact', 'Liên hệ', 'vi'), true)
  assert.equal(namesTarget('Mỗi sáng', '/services', 'Dịch vụ Các loại bánh Cách đặt mua', 'vi'), false)
  assert.equal(namesTarget('Bánh mì sourdough', '/services', 'Dịch vụ Các loại bánh', 'vi'), true)
})

test('BLANK = demo: a rewritten form fails, the name swap alone does not; repeated and stretched labels', () => {
  const demo = documentOf(
    '<body><main><form class="ec-form"><option>Construction quote</option><option>Site survey</option><p>Northgate Industrial answers within a day.</p></form></main></body>'
  )
  const renamed = documentOf(
    '<body><main><form class="ec-form"><option>Construction quote</option><option>Site survey</option><p>Tamarind Bakery answers within a day.</p></form></main></body>'
  )
  const rewritten = documentOf(
    '<body><main><form class="ec-form"><option>Custom cake order</option><option>Wholesale enquiry</option><p>Tamarind Bakery answers within a day.</p></form></main></body>'
  )
  const names = ['Tamarind Bakery', 'Northgate Industrial']
  assert.deepEqual(blockChanges(renamed, demo, names), [])
  assert.match(
    blockChanges(rewritten, demo, names).join('\n'),
    /-\[construction quote site survey\] \+\[custom cake order wholesale enquiry\]/
  )
  assert.deepEqual(
    repeatedTitles([
      { title: 'A b c', key: '1' },
      { title: 'A b c', key: '2' }
    ]).same,
    ['"A b c" ×2']
  )
  assert.deepEqual(
    stretchedLabels(documentOf('<dt class="x">Chi tiết</dt>'), documentOf('<dt class="x">Details</dt>')),
    []
  )
})

// Measured 11/10/2026 on dev g61 (Joomla, FULL): one article reached by two routes (a category-blog page and a
// category-style-3 page, no canonical link) was counted twice, an exact "×2" pair that is one post.
test('one Joomla article reached by two routes is one post, not a repeated title', () => {
  const page = (/** @type {string} */ extra) =>
    documentOf(
      `<html><body class="site com-content view-article ${extra}"><div class="com-content-article item-page" itemscope itemtype="https://schema.org/Article">` +
        '<div class="page-header"><h1 itemprop="headline">Bánh nướng mỗi sáng</h1></div>' +
        '<div itemprop="articleBody" class="com-content-article__body"><p>Mỗi sáng lò của chúng tôi nướng bánh mới cho khách ở Dubai.</p></div>' +
        '</div></body></html>'
    )
  const a = articleOf(page('itemid-101'), '/blog/12-banh-nuong')
  const b = articleOf(page('itemid-205'), '/style-3/12-banh-nuong')
  assert.ok(a && b)
  assert.equal(a.key, b.key)
  // Two different articles under one title are still two.
  const other = documentOf(
    '<html><body class="view-article"><h1 itemprop="headline">Bánh nướng mỗi sáng</h1><div itemprop="articleBody"><p>Một bài khác hẳn.</p></div></body></html>'
  )
  assert.notEqual(articleOf(other, '/blog/13-khac')?.key, a.key)
  // The edit link names the article: the same id on two routes is one article even when the words differ by a module.
  const edit = (/** @type {string} */ words) =>
    documentOf(
      `<html><body class="view-article"><h1>Tiêu đề</h1><a href="/index.php?option=com_content&task=article.edit&a_id=12&return=x">Sửa</a><div itemprop="articleBody"><p>${words}</p></div></body></html>`
    )
  assert.equal(articleOf(edit('Một'), '/a/12')?.key, articleOf(edit('Hai'), '/b/12')?.key)
})

test('a person the page marks as an author is a name, not English, even when the words are English words (g62)', () => {
  const allow = allowedWords('vi', ['Tiệm Bánh Tamarind & Co'])
  const opts = { lang: 'vi', allow, names: ['Tiệm Bánh Tamarind & Co'] }
  // Measured on g62-ess-wp-full and g62-ess-j-full: the demo authors' bylines (kept by rule) were read as English.
  const wp = documentOf(
    '<html><body><div class="je-meta"><div class="je-meta__author wp-block-post-author-name">Alfonso Cortez</div>' +
      '<a rel="author" href="/author/faith/">Faith Singleton</a></div><p>Read more</p></body></html>'
  )
  assert.deepEqual(englishRuns(wp, opts), ['Read more'])
  const joomla = documentOf(
    '<html><body><dd class="createdby" itemprop="author" itemscope itemtype="https://schema.org/Person">By ' +
      '<span itemprop="name">Alfonso Cortez </span></dd>' +
      '<span style="display: none;" itemprop="publisher" itemscope><span itemprop="name">Faith Singleton</span></span></body></html>'
  )
  assert.deepEqual(englishRuns(joomla, opts), ['By'], 'the words around the name are still read')
  // Outside an author's mark, the same words are still judged.
  assert.deepEqual(englishRuns(documentOf('<html><body><p>Faith Singleton</p></body></html>'), opts), [
    'Faith Singleton'
  ])
})

test('a Joomla article whose second route hides its intro is still one post: its alias and publish time name it (g62)', () => {
  // Measured on g62-ess-j-full: category-blog and category-style-3 show one article, the style-3 layout without the first
  // intro paragraph, so the bodies differ and no id or canonical link is printed.
  const page = (/** @type {string} */ words) =>
    documentOf(
      '<html><body class="com_content view-article item-113"><h1 itemprop="headline">Sourdough và bánh Việt tươi</h1>' +
        '<time datetime="2023-06-09T07:22:57+00:00" itemprop="datePublished">9 tháng 6, 2023</time>' +
        `<div itemprop="articleBody"><p>${words}</p></div></body></html>`
    )
  const blog = articleOf(
    page('Tiệm bánh Tamarind & Co. Tiệm bánh gia đình ở Dubai.'),
    '/index.php/pages/j-content/category-blog/healthy-eating-tips-for-busy-professionals'
  )
  const style3 = articleOf(
    page('Tiệm bánh gia đình ở Dubai.'),
    '/index.php/category/category-style-3/healthy-eating-tips-for-busy-professionals'
  )
  assert.ok(blog && style3)
  assert.equal(blog.key, style3.key)
  assert.deepEqual(repeatedTitles([blog, style3]).same, [])
  // Another article under the same title (another alias) is another post, and is still reported.
  const other = articleOf(page('Một bài khác.'), '/index.php/category/category-style-3/fitness-tips')
  assert.notEqual(other?.key, blog.key)
})

// The final decisions of 12/10/2026, measured on the g65 builds (EmDash FULL, JA Essence Joomla FULL): pages cut to the
// markup that decided each one, at `fixtures/.../g65-{site,demo}/`.
const G65 = 'https://g65-full.test'
const G65_DEMO = 'https://g65-demo.test'
const runG65 = async () => {
  const report = await auditBuiltSite({
    site: G65,
    demo: G65_DEMO,
    set: 'full',
    lang: 'vi',
    names: ['Tiệm Bánh Tamarind & Co'],
    allow: ['sourdough', 'Dubai'],
    fetch: /** @type {any} */ (fakeFetch({ [G65]: 'g65-site', [G65_DEMO]: 'g65-demo' }))
  })
  return Object.fromEntries(report.checks.map((c) => [c.id, c]))
}

test('a rewritten label the site menu and footer agree on is a NOTE, not a label-targets FAIL (g65 EmDash "Giới thiệu")', async () => {
  const by = await runG65()
  assert.equal(by['label-targets'].outcome, 'PASS')
  assert.equal(by['label-targets-consistent'].outcome, 'NOTE')
  assert.match(by['label-targets-consistent'].items.join('\n'), /"Giới thiệu" \(demo "About us"\) → \/about/)
})

test('a kit page keeps its sample "#" button: dead-buttons does not count it (g65 Joomla Typography)', async () => {
  const by = await runG65()
  assert.equal(by['dead-buttons'].outcome, 'PASS')
})

test('menu-category-names: a menu item to a renamed category must carry the category title (g65 Joomla footer)', async () => {
  const by = await runG65()
  const c = by['menu-category-names']
  assert.equal(c.outcome, 'FAIL')
  const items = c.items.join('\n')
  assert.match(items, /"Thiết kế" \(demo "Design"\) → \/cat\/style-2, category "Quy trình nướng"/)
  // A label sharing a word with the category title passes; a menu item the demo did not name after its category
  // ("Category Style 2", a layout sample) is not judged.
  assert.doesNotMatch(items, /Vỏ bánh|Kiểu danh mục/)
})

test('repeated-posts: titles repeated exactly as the demo repeats them are a NOTE; Tracy-made repeats still FAIL', async () => {
  const by = await runG65()
  assert.equal(by['repeated-posts'].outcome, 'PASS')
  assert.equal(by['repeated-posts-as-demo'].outcome, 'NOTE')
  assert.match(by['repeated-posts-as-demo'].items.join('\n'), /"Bánh mì nướng mỗi sáng" ×2/)
  const g59 = Object.fromEntries((await run()).checks.map((c) => [c.id, c]))
  assert.equal(g59['repeated-posts'].outcome, 'FAIL')
  assert.equal(g59['menu-category-names'].outcome, 'PASS')
})

test('category pages: a WordPress category archive and a Joomla category view name their category; other pages are not one', () => {
  const wp = documentOf(
    '<html><head><title>Bánh mì – Site</title></head><body class="archive category category-banh-mi"><h1 class="wp-block-query-title">Chuyên mục: Bánh mì</h1></body></html>'
  )
  assert.equal(categoryTitle(wp, '/category/banh-mi/'), 'Chuyên mục: Bánh mì')
  assert.equal(
    categoryTitle(documentOf('<html><body class="page"><h1>Giới thiệu</h1></body></html>'), '/about'),
    null
  )
})
