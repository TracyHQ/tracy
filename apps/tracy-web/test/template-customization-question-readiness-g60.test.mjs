/**
 * Template Customization Question Readiness, the static signals added after the g59 test builds
 * (spec decided 10/10/2026). Each test feeds the shape of one g59 defect (red)
 * and the same release with the defect fixed (green):
 * - LANG-2: words painted by CSS `content:` (JA Essence WP "By"), English block attributes (JA
 *   Essence WP `moreText:"Read more"`), an EmDash switcher naming options from the stored locale
 *   (Tracy Business EmDash "🇺🇸 English" on a vi site);
 * - PAGE-5: EmDash social lists without a `from: "social"` rule or dropped when their link is empty
 *   (K6), label rules without their destination (Tracy Business EmDash "Xem bánh →" on /contact,
 *   Tracy Business WP `hero.cta.2` "Download company profile (PDF)", JA Vega Joomla `btn-link-2`);
 * - PAGE-2: Joomla articles of one category tied on the Previous / Next order (JA Essence j6
 *   category 9);
 * - LANG-6: date formats in English order (JA Essence WP "M d, Y", Joomla `show_date_format`).
 * Fixtures are built in memory (`template-customization-question-readiness-fixtures.mjs`); the
 * Joomla and WordPress label tests read the real contracts of the tree.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { englishOrder } from '../src/lib/template-customization-question-readiness/readers/english-date-formats.js'
import { PLUGIN_BLOCK_WORD_PAIRS } from '../src/lib/template-customization-question-readiness/readers/plugin-block-words.js'
import { findings } from '../src/lib/template-customization-question-readiness/readers/rule-findings.js'
import { cssContentWords } from '../src/lib/template-customization-question-readiness/readers/visitor-words-in-css.js'
import { lang2OneLanguageEverywhere } from '../src/lib/template-customization-question-readiness/rules/lang-2-one-language-everywhere.js'
import { lang6DatesInLanguage } from '../src/lib/template-customization-question-readiness/rules/lang-6-dates-in-language.js'
import { joomlaTiedArticleOrder } from '../src/lib/template-customization-question-readiness/rules/page-2-tied-article-order.js'
import { page4NoDeadLinks } from '../src/lib/template-customization-question-readiness/rules/page-4-no-dead-links.js'
import { page7ChildrenOfUntickedPage } from '../src/lib/template-customization-question-readiness/rules/page-7-children-of-unticked-page.js'
import { hidden1SystemPages } from '../src/lib/template-customization-question-readiness/rules/hidden-1-system-pages.js'
import { page5ButtonsLeadSomewhere } from '../src/lib/template-customization-question-readiness/rules/page-5-buttons-lead-somewhere.js'
import { labelTargets } from '../src/lib/template-customization-question-readiness/rules/page-5-social-and-targets.js'
import { contextOf, dumpOf, zipOf } from './template-customization-question-readiness-fixtures.mjs'

const WP = {
  platform: 'wordpress',
  label: 'JA Essence',
  version: '1.0.12',
  template: 'ja-essence',
  install: { database: { file: 'db.sql.gz' } }
}

/** JA Essence WordPress 1.0.12, cut: one page of `content`, a theme zip of `theme` files. */
function essenceWp(
  /** @type {Record<string, string>} */ theme,
  content = '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->'
) {
  return contextOf(WP, {
    'db.sql.gz': dumpOf({
      tr_options: [{ option_name: 'stylesheet', option_value: 'wp-ja-essence' }],
      tr_posts: [
        {
          ID: '10',
          post_content: content,
          post_title: 'Lifestyle',
          post_status: 'publish',
          post_name: 'lifestyle',
          post_parent: '0',
          post_type: 'page'
        }
      ]
    }),
    'wp-ja-essence-1.0.12.zip': zipOf(
      Object.fromEntries(Object.entries(theme).map(([f, t]) => [`wp-ja-essence/${f}`, t]))
    )
  })
}

const outcome = async (/** @type {any} */ rule, /** @type {any} */ context) => rule.run(context)

test('LANG-2: a word painted by CSS content: fails (JA Essence WP "By"); glyphs and empty strings do not', async () => {
  assert.deepEqual(
    cssContentWords(
      '.a::before{content:""}\n.b::after{content:"\\201C"}\n.c::before { content: "By " attr(x) }'
    ).map((w) => w.text),
    ['By']
  )
  const red = await outcome(
    lang2OneLanguageEverywhere,
    essenceWp({ 'assets/css/je-detail.css': '.je-meta__author::before{content:"By";margin-right:4px}\n' })
  )
  assert.equal(red.status, 'fail')
  assert.match(
    red.message,
    /stylesheet words: 1 word painted by CSS content:.*'By' \(assets\/css\/je-detail\.css:1\)/
  )
  const green = await outcome(
    lang2OneLanguageEverywhere,
    essenceWp({ 'assets/css/je-detail.css': '.je-meta__author::before{content:"";margin-right:4px}\n' })
  )
  assert.doesNotMatch(green.message, /stylesheet words/)
})

test("LANG-2: an English block attribute outside the plugin's pairs fails; one the theme or the plugin translates does not", async () => {
  const words = "<?php\nfunction w() { return __( 'Read more ...', 'wp-ja-essence' ); }\n"
  const page = (/** @type {string} */ more) =>
    `<!-- wp:wp-ja-essence/card {"moreText":"${more}"} /-->\n<!-- wp:post-excerpt {"moreText":"Read more","excerptLength":20} /-->`
  const red = await outcome(
    lang2OneLanguageEverywhere,
    essenceWp({ 'inc/words.php': words }, page('Read more'))
  )
  assert.equal(red.status, 'fail')
  // The custom block's moreText counts; core/post-excerpt moreText is a BlockWords::PAIRS pair.
  assert.match(red.message, /block attribute words: 1 word .*'moreText: Read more' \(\/lifestyle:1\)/)
  assert.ok(
    red.details.some((d) => /1 block attribute word on the pairs the Claude Cowork plugin translates/.test(d))
  )
  const green = await outcome(
    lang2OneLanguageEverywhere,
    essenceWp({ 'inc/words.php': words }, page('Read more ...'))
  )
  assert.doesNotMatch(green.message, /block attribute words/)
})

/** The plugin checkout beside this one, when there is one (`$CLAUDE_COWORK_DIR` or `../claude-cowork*`). */
function pluginBlockWordsFile() {
  const roots = process.env.CLAUDE_COWORK_DIR ? [process.env.CLAUDE_COWORK_DIR] : []
  const parent = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
  try {
    for (const d of readdirSync(parent)) if (d.startsWith('claude-cowork')) roots.push(path.join(parent, d))
  } catch {
    // no parent folder to look in
  }
  return (
    roots.map((r) => path.join(r, 'wordpress/cowork/lib/BlockWords.php')).find((f) => existsSync(f)) ?? null
  )
}
const PLUGIN_FILE = pluginBlockWordsFile()

test('the pinned block-word pairs equal BlockWords::PAIRS of the plugin', {
  skip: PLUGIN_FILE ? false : 'no claude-cowork checkout beside this one'
}, () => {
  const php = readFileSync(/** @type {string} */ (PLUGIN_FILE), 'utf8')
  const body = /const PAIRS = \[([\s\S]*?)\];/.exec(php)?.[1] ?? ''
  const pairs = Object.fromEntries(
    [...body.matchAll(/'([^']+)'\s*=>\s*\[([^\]]*)\]/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
    ])
  )
  assert.deepEqual(pairs, PLUGIN_BLOCK_WORD_PAIRS)
})

const EMDASH = {
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.7.7',
  install: { source: { file: 'src.zip' } }
}
const SEED = (/** @type {any} */ content) => JSON.stringify({ defaultLocale: 'en', content })
const emdash = (/** @type {Record<string, string>} */ files) =>
  contextOf(EMDASH, {
    'src.zip': zipOf(
      Object.fromEntries(
        Object.entries({ 'seed/seed.json': SEED({}), 'seed/personalize.json': '{}', ...files }).map(
          ([f, t]) => [`tracy-business/${f}`, t]
        )
      )
    )
  })
const TOPBAR = (/** @type {string} */ name) =>
  `---\nconst options = served.map((l: string) => ({\n  code: l,\n  name: ${name},\n  current: l === locale\n}))\n---\n<LanguageMenu options={options} />\n`

test('LANG-2: an EmDash switcher naming options from the stored locale fails; one naming them from the shown locale passes', async () => {
  const red = await outcome(
    lang2OneLanguageEverywhere,
    emdash({ 'src/components/site/Topbar.astro': TOPBAR('wordsOf(l).name') })
  )
  assert.match(
    red.message,
    /language switcher: .*src\/components\/site\/Topbar\.astro:4 \(wordsOf\(l\)\.name\)/
  )
  const green = await outcome(
    lang2OneLanguageEverywhere,
    emdash({ 'src/components/site/Topbar.astro': TOPBAR('wordsOf(uiLocale(l)).name') })
  )
  assert.doesNotMatch(green.message, /language switcher/)
})

const SOCIAL_SEED = SEED({
  social: [
    {
      slug: 'footer-brand',
      data: { items: [{ network: 'github', url: 'https://github.com/helix-labs', label: 'GitHub' }] }
    }
  ]
})

test('PAGE-5: an EmDash social list with no from "social" rule fails (K6), and so does a view dropping empty links', async () => {
  const red = await outcome(page5ButtonsLeadSomewhere, emdash({ 'seed/seed.json': SOCIAL_SEED }))
  assert.equal(red.status, 'fail')
  assert.match(red.message, /social lists with no identity rule from "social".*social\.items/)
  const kept = JSON.stringify({ identity: [{ collection: 'social', field: 'items', from: 'social' }] })
  const green = await outcome(
    page5ButtonsLeadSomewhere,
    emdash({ 'seed/seed.json': SOCIAL_SEED, 'seed/personalize.json': kept })
  )
  assert.doesNotMatch(green.message, /social lists/)
  const dropping = await outcome(
    page5ButtonsLeadSomewhere,
    emdash({
      'seed/seed.json': SOCIAL_SEED,
      'seed/personalize.json': kept,
      'src/components/site/Footer.astro':
        '---\nconst socials = ((b.items ?? []) as any[]).filter((s) => s?.url)\n---\n'
    })
  )
  assert.match(dropping.message, /views that drop a social item whose link is empty.*Footer\.astro:2/)
})

const FOOTER =
  '---\nconst contactUrl = href(locale, "/contact")\n---\n<a href={contactUrl} class="link" {...s("footer_book_label")}>{site.footer_book_label}</a>\n<a href={h.hero_cta2_url} {...$page("hero_cta2_label")}>{h.hero_cta2_label}</a>\n'
const LABELS_SEED = SEED({
  site: [{ slug: 'site', data: { footer_book_label: 'Book a site survey →' } }],
  home: [
    {
      slug: 'home',
      data: { hero_cta2_label: 'Download company profile (PDF)', hero_cta2_url: '/media/profile.pdf' }
    }
  ]
})
const copy = (/** @type {object} */ extra = {}) =>
  JSON.stringify({
    copy: [
      {
        collection: 'site',
        slug: 'site',
        field: 'footer_book_label',
        brief: 'a closing invitation',
        ...extra
      },
      { collection: 'home', slug: 'home', field: 'hero_cta2_label', brief: 'the second button' }
    ]
  })

test('PAGE-5: an EmDash label rule whose link has no field fails (footer_book_label → /contact); a sibling url or a target passes', async () => {
  const context = emdash({
    'seed/seed.json': LABELS_SEED,
    'seed/personalize.json': copy(),
    'src/components/site/Footer.astro': FOOTER
  })
  const f = findings(context, 'PAGE-5')
  await labelTargets(context, f)
  const red = f.outcome({ pass: 'ok' })
  assert.equal(red.status, 'fail')
  assert.match(
    red.message,
    /label rules without their destination.*site\.footer_book_label \(its link is contactUrl/
  )
  assert.doesNotMatch(red.message, /hero_cta2_label/)
  const fixed = emdash({
    'seed/seed.json': LABELS_SEED,
    'seed/personalize.json': copy({ leadsTo: '/contact' }),
    'src/components/site/Footer.astro': FOOTER
  })
  const g = findings(fixed, 'PAGE-5')
  await labelTargets(fixed, g)
  assert.equal(g.outcome({ pass: 'ok' }).status, 'pass')
})

test('PAGE-5: Joomla and WordPress button label slots without the url slot of their link fail', async () => {
  const vega = contextOf(
    { platform: 'joomla', label: 'JA Vega', version: '1.0.4', template: 'ja_vega', install: {} },
    {},
    'quickstart/ja-vega/j6'
  )
  const f = findings(vega, 'PAGE-5')
  await labelTargets(vega, f)
  assert.match(
    f.outcome({ pass: 'ok' }).message,
    /module-111\.5 \(hero\[button-2\], link hero\[btn-link-2\]\)/
  )
  const business = contextOf(
    {
      platform: 'wordpress',
      label: 'Tracy Business',
      version: '1.3.4',
      template: 'tracy-business',
      install: { database: { file: 'db.sql.gz' } }
    },
    {
      'db.sql.gz': dumpOf({
        tr_options: [{ option_name: 'stylesheet', option_value: 'tracy' }],
        tr_posts: [
          {
            ID: '5',
            post_content:
              '<!-- wp:button {"metadata":{"name":"hero.cta.2"}} --><div class="wp-block-button"><a class="wp-block-button__link" href="/profile.pdf">Download company profile (PDF)</a></div><!-- /wp:button -->',
            post_status: 'publish',
            post_name: 'home',
            post_parent: '0',
            post_type: 'page'
          }
        ]
      })
    },
    'tracy-business/wp7'
  )
  const g = findings(business, 'PAGE-5')
  await labelTargets(business, g)
  assert.match(g.outcome({ pass: 'ok' }).message, /label rules without their destination.*home\.hero\.cta\.2/)
})

test('PAGE-5: a flat ACM button whose link field has a url slot has its destination (JA Voyara j6 1.0.6)', async () => {
  const voyara = contextOf(
    { platform: 'joomla', label: 'JA Voyara', version: '1.0.6', template: 'ja_voyara', install: {} },
    {},
    'quickstart/ja-voyara/j6'
  )
  const f = findings(voyara, 'PAGE-5')
  await labelTargets(voyara, f)
  const message = f.outcome({ pass: 'ok' }).message
  // hero[button] -> hero[btn-link] = /pages/contact is slot module-400.5 (type url): not reported.
  assert.doesNotMatch(message, /module-400\.4 /)
  assert.doesNotMatch(message, /module-403\.2 /)
  // hero[button-2] -> hero[btn-link-2] = "#" is captured as a text slot, not a url one: still reported.
  assert.match(message, /module-400\.6 \(button-2, link btn-link-2\)/)
})

test('PAGE-4: a WordPress system address (/wp-login.php, with or without a query) is not a dead demo link', async () => {
  const page = (/** @type {string} */ html) =>
    contextOf(WP, {
      'tracy_site_pages.json': JSON.stringify({ pages: [{ id: 'home', label: 'Home', home: true }] }),
      'db.sql.gz': dumpOf({
        tr_options: [{ option_name: 'stylesheet', option_value: 'wp-ja-essence' }],
        tr_posts: [
          {
            ID: '7',
            post_content: html,
            post_title: 'Home',
            post_status: 'publish',
            post_name: 'home',
            post_parent: '0',
            post_type: 'page'
          }
        ]
      }),
      'wp-ja-essence-1.0.12.zip': zipOf({ 'wp-ja-essence/templates/index.html': '<p>Hi</p>' })
    })
  // Tracy Base WordPress wp7: the account links of its header.
  const login = await page4NoDeadLinks.run(
    page('<a href="/wp-login.php">Log in</a> <a href="/wp-login.php?action=register">Sign up</a>')
  )
  assert.equal(login.status, 'pass', login.message)
  const dead = await page4NoDeadLinks.run(
    page('<a href="/wp-login.php">Log in</a> <a href="/pricing">Pricing</a>')
  )
  assert.equal(dead.status, 'fail')
  assert.match(dead.message, /1 demo link to no published address: \/pricing \(in page 7\)/)
})

const J6 = {
  platform: 'joomla',
  label: 'JA Essence',
  version: '1.0.4',
  template: 'ja_essence',
  install: { database: { file: 'db.sql.gz' } }
}
const joomlaDump = (
  /** @type {Record<string, unknown>[]} */ articles,
  /** @type {Record<string, unknown>[]} */ modules = [
    { id: '1', module: 'mod_custom', client_id: '0', published: '1', params: '{}' }
  ]
) =>
  contextOf(J6, {
    'db.sql.gz': dumpOf({
      jd_extensions: [
        {
          element: 'com_content',
          folder: '',
          enabled: '1',
          params: JSON.stringify({ orderby_sec: 'rdate', order_date: 'published', show_item_navigation: '1' })
        },
        { element: 'pagenavigation', folder: 'content', enabled: '1', params: '{}' }
      ],
      jd_menu: [
        { id: '101', link: 'index.php?option=com_content&view=category&id=9', published: '1', params: '{}' }
      ],
      jd_content: articles,
      jd_modules: modules
    })
  })
const article = (/** @type {string} */ id, /** @type {string} */ publishUp) => ({
  id,
  catid: '9',
  language: '*',
  state: '1',
  title: `A${id}`,
  ordering: '0',
  created: '2023-06-09 10:00:00',
  modified: '2023-06-09 10:00:00',
  publish_up: publishUp
})

test('PAGE-2: Joomla articles of one category tied on the Previous / Next order fail (JA Essence category 9); distinct dates pass', async () => {
  const tied = joomlaDump([
    article('22', '2023-06-09 10:00:00'),
    article('23', '2023-06-09 10:00:00'),
    article('24', '2023-06-10 10:00:00')
  ])
  const f = findings(tied, 'PAGE-2')
  await joomlaTiedArticleOrder(tied, f)
  const red = f.outcome({ pass: 'ok' })
  assert.equal(red.status, 'fail')
  assert.match(red.message, /category 9 by published: articles 22, 23/)
  const distinct = joomlaDump([
    article('22', '2023-06-08 10:00:00'),
    article('23', '2023-06-09 10:00:00'),
    article('24', '2023-06-10 10:00:00')
  ])
  const g = findings(distinct, 'PAGE-2')
  await joomlaTiedArticleOrder(distinct, g)
  assert.equal(g.outcome({ pass: 'ok' }).status, 'pass')
})

test('PAGE-2: a category listed by a hyphenated layout (tb-projects) is sorted by that menu item, not the global order', async () => {
  const listed = (/** @type {string} */ layout) =>
    contextOf(J6, {
      'db.sql.gz': dumpOf({
        jd_extensions: [
          {
            element: 'com_content',
            folder: '',
            enabled: '1',
            params: JSON.stringify({
              orderby_sec: 'rdate',
              order_date: 'published',
              show_item_navigation: '1'
            })
          },
          { element: 'pagenavigation', folder: 'content', enabled: '1', params: '{}' }
        ],
        // Tracy Business j6 Projects: its own layout, ordered by the article order it sets.
        jd_menu: [
          {
            id: '602',
            link: `index.php?option=com_content&view=category&layout=${layout}&id=9`,
            published: '1',
            params: JSON.stringify({ orderby_sec: 'order' })
          }
        ],
        jd_content: [
          { ...article('22', '2023-06-09 10:00:00'), ordering: '1' },
          { ...article('23', '2023-06-09 10:00:00'), ordering: '2' }
        ],
        jd_modules: [{ id: '1', module: 'mod_custom', client_id: '0', published: '1', params: '{}' }]
      })
    })
  for (const layout of ['blog', 'tb-projects']) {
    const context = listed(layout)
    const f = findings(context, 'PAGE-2')
    await joomlaTiedArticleOrder(context, f)
    assert.equal(f.outcome({ pass: 'ok' }).status, 'pass', layout)
  }
})

test('PAGE-7: a page opening a component other than com_content (JA Resort Rooms, com_solidres) is a note, not a failure', async () => {
  const context = contextOf(
    { ...J6, label: 'JA Resort', version: '1.0.2', template: 'ja_resort' },
    {
      'tracy_site_pages.json': JSON.stringify({
        pages: [
          { id: 'homepage', label: 'Home', home: true },
          { id: 'rooms', label: 'Rooms' },
          { id: 'blogs', label: 'Blogs' }
        ]
      }),
      'db.sql.gz': dumpOf({
        jd_menu: [
          {
            id: '101',
            client_id: '0',
            published: '1',
            type: 'component',
            path: 'homepage',
            alias: 'homepage',
            link: 'index.php?option=com_content&view=featured'
          },
          {
            id: '109',
            client_id: '0',
            published: '1',
            type: 'component',
            path: 'rooms',
            alias: 'rooms',
            link: 'index.php?option=com_solidres&view=reservationasset&id=8'
          },
          {
            id: '112',
            client_id: '0',
            published: '1',
            type: 'component',
            path: 'blogs',
            alias: 'blogs',
            link: 'index.php?option=com_content&view=category&layout=blog&id=10'
          }
        ]
      })
    }
  )
  const r = await page7ChildrenOfUntickedPage.run(context)
  assert.equal(r.status, 'pass', r.message)
  assert.ok(
    r.details.some((d) => /rooms \(com_solidres\)/.test(d)),
    r.details.join(' | ')
  )
})

test('PAGE-2: an article module ties on the column it sorts by, not on publish_up (JA Spa j6 module 107, a.created ASC)', async () => {
  const spa = (/** @type {string[]} */ created) => {
    const rows = created.map((c, i) => ({
      ...article(String(30 + i), `2023-06-0${i + 1} 10:00:00`),
      catid: '13',
      ordering: String(i + 1),
      created: c
    }))
    return joomlaDump(rows, [
      {
        id: '107',
        module: 'mod_articles_category',
        client_id: '0',
        published: '1',
        params: JSON.stringify({
          catid: [13],
          article_ordering: 'a.created',
          article_ordering_direction: 'ASC',
          count: 2
        })
      }
    ])
  }
  // Distinct publish dates and orderings (the old check passed it), one creation time: the two shown are undefined.
  const tied = spa(['2023-06-09 10:00:00', '2023-06-09 10:00:00', '2023-06-09 10:00:00'])
  const f = findings(tied, 'PAGE-2')
  await joomlaTiedArticleOrder(tied, f)
  assert.match(
    f.outcome({ pass: 'ok' }).message,
    /module 107 \(mod_articles_category\) by created: articles 30, 31, 32/
  )
  const distinct = spa(['2023-06-07 10:00:00', '2023-06-08 10:00:00', '2023-06-08 10:00:00'])
  const g = findings(distinct, 'PAGE-2')
  await joomlaTiedArticleOrder(distinct, g)
  // Only 30 and 31 show (count 2); 31 ties with 32 just past the cut, so which shows is undefined.
  assert.match(g.outcome({ pass: 'ok' }).message, /module 107 .*articles 31, 32/)
  const clear = spa(['2023-06-07 10:00:00', '2023-06-08 10:00:00', '2023-06-09 10:00:00'])
  const h = findings(clear, 'PAGE-2')
  await joomlaTiedArticleOrder(clear, h)
  assert.equal(h.outcome({ pass: 'ok' }).status, 'pass')
})

test('PAGE-2: an article module ties only among the articles it does not exclude (JA Essence j6 1.0.7 module 133)', async () => {
  // Module 133 and the articles of its categories 9, 10, 11, out of the JA Essence j6 1.0.7 database (12/10/2026).
  // It sorts by title; articles 25 and 37 share one, and the template excludes 37 (`excluded_articles: "37"`).
  const { modules, content } = JSON.parse(
    readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'fixtures/template-customization-question-readiness/c/ja-essence-j6-1.0.7-module-133.json'
      ),
      'utf8'
    )
  )
  const essence = (/** @type {string} */ excluded) =>
    joomlaDump(content, [
      {
        ...modules[0],
        params: JSON.stringify({ ...JSON.parse(modules[0].params), excluded_articles: excluded })
      }
    ])
  const shipped = essence('37')
  const f = findings(shipped, 'PAGE-2')
  await joomlaTiedArticleOrder(shipped, f)
  assert.equal(f.outcome({ pass: 'ok' }).status, 'pass', f.outcome({ pass: 'ok' }).message)
  // Without the exclusion the tie is on the page; an id list of several lines still excludes 37.
  const kept = essence('')
  const g = findings(kept, 'PAGE-2')
  await joomlaTiedArticleOrder(kept, g)
  assert.match(
    g.outcome({ pass: 'ok' }).message,
    /module 133 \(mod_articles_category\) by title: articles 25, 37/
  )
  const lines = essence('12\r\n37')
  const h = findings(lines, 'PAGE-2')
  await joomlaTiedArticleOrder(lines, h)
  assert.equal(h.outcome({ pass: 'ok' }).status, 'pass', h.outcome({ pass: 'ok' }).message)
})

test('LANG-2 and HIDDEN-1 read the offline page and the T4 HTML blocks (JA Kinetic j6 drawer "Kinetic")', async () => {
  const kinetic = contextOf(
    {
      platform: 'joomla',
      label: 'JA Kinetic',
      version: '1.0.4',
      template: 'ja_kinetic',
      install: { installer: { file: 'installer.zip' } }
    },
    {
      'installer.zip': zipOf({
        // Cut from the release: the offline page's copied menu, and the drawer brand of the header block.
        'templates/ja_kinetic/offline.php':
          '<?php defined("_JEXEC") or die; ?>\n<a class="nav-link" href="/">Home Styles</a>\n<p>hello@kineticlabs.dev</p>\n',
        'templates/ja_kinetic/html/layouts/t4/block/kinetic-header.html':
          '<div class="kinetic-drawer"><span class="kinetic-drawer__brand">Kinetic</span><jdoc:include type="modules" name="mainnav" /></div>\n'
      })
    },
    'quickstart/ja-kinetic/j6'
  )
  const lang = await lang2OneLanguageEverywhere.run(kinetic)
  assert.match(lang.message, /'Home Styles' \(offline\.php:2\)/)
  assert.match(lang.message, /'Kinetic' \(html\/layouts\/t4\/block\/kinetic-header\.html:1\)/)
  const hidden = await hidden1SystemPages.run(kinetic)
  assert.match(
    hidden.message,
    /offline\.php writes demo text the offline page shows to every visitor: Kinetic|offline\.php writes demo text the offline page shows to every visitor: hello@kineticlabs\.dev/
  )
  assert.match(
    hidden.message,
    /html\/layouts\/t4\/block\/kinetic-header\.html writes demo text every page, the 404 page too, shows to every visitor: Kinetic/
  )
})

test('LANG-6: date formats in English order fail on WordPress, Joomla and EmDash; the language order passes', async () => {
  assert.equal(englishOrder('M d, Y'), true)
  assert.equal(englishOrder('F j, Y'), true)
  assert.equal(englishOrder('j F, Y'), false)
  assert.equal(englishOrder('d/m/Y'), false)
  const wp = await outcome(
    lang6DatesInLanguage,
    essenceWp(
      { 'inc/extra.php': "<?php echo esc_html( get_the_date( 'M d, Y', $id ) );\n" },
      '<!-- wp:post-date {"format":"F j, Y"} /-->'
    )
  )
  assert.equal(wp.status, 'fail')
  assert.match(wp.message, /'M d, Y' \(inc\/extra\.php:1\)/)
  assert.match(wp.message, /'F j, Y' \(page lifestyle:1\)/)
  const wpGreen = await outcome(
    lang6DatesInLanguage,
    essenceWp(
      { 'inc/extra.php': "<?php echo esc_html( get_the_date( '', $id ) );\n" },
      '<!-- wp:post-date {"format":"j F, Y"} /-->'
    )
  )
  assert.equal(wpGreen.status, 'pass', wpGreen.message)
  const j = await outcome(
    lang6DatesInLanguage,
    joomlaDump(
      [],
      [
        {
          id: '127',
          module: 'mod_articles_category',
          client_id: '0',
          published: '1',
          params: JSON.stringify({ show_date_format: 'M d, Y' })
        }
      ]
    )
  )
  assert.match(j.message, /'M d, Y' \(module 127 \(mod_articles_category\) show_date_format\)/)
  const e = await outcome(
    lang6DatesInLanguage,
    emdash({ 'src/components/Card.astro': "{new Date(d).toLocaleDateString('en-US', { month: 'short' })}\n" })
  )
  assert.match(e.message, /src\/components\/Card\.astro:1/)
})
