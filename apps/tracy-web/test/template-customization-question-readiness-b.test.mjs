/**
 * Template Customization Question Readiness, group b rules (`src/lib/template-customization-question-readiness/rules/`):
 * PAGE-1, PAGE-2, PAGE-4, PAGE-5, PAGE-7, PAGE-8, LANG-1, LANG-2, LANG-3, LANG-5, called directly.
 *
 * Fixtures (`fixtures/template-customization-question-readiness/b/`) are cut from the real release
 * assets of `JoomlArt-Products/joomlart-products` (09/10/2026): settings and page lists byte for byte;
 * demo databases cut to the rows the rules read (articles and modules keep no text, other editions
 * one row each); theme zips, webroots and the EmDash source zip cut to the files the rules read
 * (the EmDash seed keeps two default-locale entries per collection, values shortened). Contracts are
 * the profiles this checkout ships. JA Essence WordPress 1.0.9 keeps the words of three pages only
 * (/contact, /home/home-2, /pages/j-pages/typography), for PAGE-5.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { readContracts } from '../src/lib/contracts.js'
import { hardCodedWords } from '../src/lib/template-customization-question-readiness/readers/hard-coded-words.js'
import { releaseContent } from '../src/lib/template-customization-question-readiness/readers/release-content.js'
import { templateSourceFiles } from '../src/lib/template-customization-question-readiness/readers/template-source-tree.js'
import { releaseCacheSource } from '../src/lib/template-customization-question-readiness/release-source.js'
import { lang1PageLanguage } from '../src/lib/template-customization-question-readiness/rules/lang-1-page-language.js'
import { lang2OneLanguageEverywhere } from '../src/lib/template-customization-question-readiness/rules/lang-2-one-language-everywhere.js'
import { lang3NoForeignScript } from '../src/lib/template-customization-question-readiness/rules/lang-3-no-foreign-script.js'
import { lang5OneLanguage } from '../src/lib/template-customization-question-readiness/rules/lang-5-one-language.js'
import { page1UntickedPageGone } from '../src/lib/template-customization-question-readiness/rules/page-1-unticked-page-gone.js'
import { page2TickedPageOpens } from '../src/lib/template-customization-question-readiness/rules/page-2-ticked-page-opens.js'
import { page4NoDeadLinks } from '../src/lib/template-customization-question-readiness/rules/page-4-no-dead-links.js'
import { page5ButtonsLeadSomewhere } from '../src/lib/template-customization-question-readiness/rules/page-5-buttons-lead-somewhere.js'
import { page7ChildrenOfUntickedPage } from '../src/lib/template-customization-question-readiness/rules/page-7-children-of-unticked-page.js'
import { page8SearchEnginesSeePublicPages } from '../src/lib/template-customization-question-readiness/rules/page-8-search-engines-see-public-pages.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'template-customization-question-readiness', 'b')
const CONTRACTS = path.join(HERE, '..', '..', '..', 'packages', 'cms')

const TB_WP = 'tracy-business/wp7'
const TB_J6 = 'tracy-business/j6'
const TB_EMDASH = 'tracy-business/emdash-0.x'
const ESSENCE_J6 = 'quickstart/ja-essence/j6'
const ESSENCE_WP = 'quickstart/ja-essence/wp7'
const KINETIC_J6 = 'quickstart/ja-kinetic/j6'
const KINETIC_WP = 'quickstart/ja-kinetic/wp7'
const VOYARA_J6 = 'quickstart/ja-voyara/j6'
const PODCAST_J6 = 'quickstart/ja-podcast/j6'

/** A source that serves `overrides` (name -> Buffer | string) over a real one. */
function withFiles(source, overrides) {
  return {
    ...source,
    names: async () => [...new Set([...(await source.names()), ...Object.keys(overrides)])].sort(),
    read: async (name) => (name in overrides ? Buffer.from(overrides[name]) : source.read(name))
  }
}

/** The context `checkRelease` builds (index.js), with an optional contract index for the test. */
async function contextOf(tag, { source = releaseCacheSource(FIXTURES, tag), contracts } = {}) {
  const setting = JSON.parse(String(await source.read('tracy_setting.json')))
  const cms = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }[setting.platform]
  return {
    release: {
      template: setting.template ?? null,
      platform: setting.platform,
      version: setting.version,
      tag: source.tag,
      name: `${setting.label} ${cms} ${setting.version}`
    },
    setting,
    source,
    content: releaseContent(source, setting),
    ...(contracts ? { contracts } : {})
  }
}

async function run(rule, tag, options) {
  const result = await rule.run(await contextOf(tag, options))
  return { owner: rule.owner, ...result }
}

/** The contract profiles of one CMS, copied without `drop` (a profile as it was before a file existed). */
function contractsWithout(cms, profile, drop) {
  const root = mkdtempSync(path.join(tmpdir(), 'tcqr-b-'))
  const from = path.join(CONTRACTS, `tracy-${cms}-quickstart`, 'contracts', profile)
  cpSync(from, path.join(root, profile), { recursive: true, filter: (f) => !drop.includes(path.basename(f)) })
  test.after(() => rmSync(root, { recursive: true, force: true }))
  return readContracts(root)
}

/** A tar.gz of `files` (name -> text), ustar, for a webroot the test changes. */
function tarGz(files) {
  const blocks = []
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.write('        ', 148)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

// LANG-1

test('LANG-1: JA Essence Joomla, Tracy Business WordPress and EmDash pass', async () => {
  for (const tag of [ESSENCE_J6, TB_WP, TB_EMDASH]) {
    const result = await run(lang1PageLanguage, tag)
    assert.equal(result.status, 'pass', result.message)
  }
})

test('LANG-1: a hard-coded <html lang="en-gb"> in a Joomla template fails', async () => {
  const real = releaseCacheSource(FIXTURES, ESSENCE_J6)
  const source = withFiles(real, {
    'ja-essence-j6-webroot-1.0.2.tar.gz': tarGz({
      'templates/ja_essence/error.php': '<!DOCTYPE html>\n<html lang="en-gb" dir="ltr"><body></body></html>'
    })
  })
  const result = await run(lang1PageLanguage, ESSENCE_J6, { source })
  assert.equal(result.status, 'fail')
  assert.match(result.message, /error\.php hard-codes <html lang="en-gb">/)
})

test('LANG-1: Tracy Business WordPress 1.3.4 without editions.json (before cc #145) fails on the contract', async () => {
  const contracts = contractsWithout('wordpress', 'tracy-business/wp7/1.3.4', ['editions.json'])
  const result = await run(lang1PageLanguage, TB_WP, { contracts })
  assert.equal(result.status, 'fail')
  assert.equal(result.owner, 'contract')
  assert.match(result.message, /41 Polylang languages but the contract has no editions\.json/)
})

// LANG-2

test('LANG-2: JA Podcast Joomla names the words its contact and author layouts write', async () => {
  const result = await run(lang2OneLanguageEverywhere, PODCAST_J6)
  assert.equal(result.status, 'fail')
  for (const word of ['Address', 'Postcode', 'Country', 'Call Us', 'Webpage', 'No articles post'])
    assert.ok(result.message.includes(`'${word}'`), `names "${word}"`)
})

test('LANG-2: Tracy Business EmDash 1.7.2 fails on Pagination and the investors collection', async () => {
  const result = await run(lang2OneLanguageEverywhere, TB_EMDASH)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /'Previous' \(src\/components\/site\/Pagination\.astro:20\)/)
  assert.match(result.message, /investors \(fin_title/)
})

test('LANG-2: Tracy Business WordPress 404 and archive templates write their words', async () => {
  const result = await run(lang2OneLanguageEverywhere, TB_WP)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /'Page not found' \(templates\/404\.html:10\)/)
})

test('LANG-2: a kit sample layout is not exempt; its words must be in the site language (K3)', async () => {
  const real = releaseCacheSource(FIXTURES, ESSENCE_J6)
  const source = withFiles(real, {
    'ja-essence-j6-webroot-1.0.2.tar.gz': tarGz({
      'templates/ja_essence/html/com_content/kit-styleguide/default.php':
        '<section><h2>Form field states</h2></section>'
    })
  })
  const result = await run(lang2OneLanguageEverywhere, ESSENCE_J6, { source })
  assert.equal(result.status, 'fail')
  assert.match(result.message, /'Form field states' \(html\/com_content\/kit-styleguide\/default\.php:1\)/)
})

test('LANG-2 scanner: only words a visitor reads, never script code or JavaScript fragments', () => {
  // Shapes from JA Vital Joomla html/mod_jaquickcontact/ajax_layout.php and JA Nova mod_articles_categories.
  const php = [
    '<?php $q = "?>"; echo Text::_(\'TPL_SEND\'); ?>',
    '<script>if ((message.length > maxchars) ||(message.length < 1)) { el.innerHTML = "<p>"+result.successful+"</p>"; }</script>',
    "<div>' + item.title + '</div>",
    '<nav aria-label="Pagination"><a href="#" aria-label="Previous page">&lsaquo;</a></nav>',
    '<img src="a.jpg" alt="Intro Image"><input type="hidden" name="x" value="Hidden value here">',
    '<input type="submit" value="Send message"><input placeholder="Your email">',
    '<button title="Toggle dark mode">Read more</button><p>inquiry@morgan.com</p>',
    '<div class="tab-pane <?php if ($i < 1) echo "show active"; ?>"></div>'
  ].join('\n')
  const words = hardCodedWords('html/mod_x/default.php', php).map((w) => w.text)
  assert.deepEqual(words.sort(), [
    'Previous page',
    'Read more',
    'Send message',
    'Toggle dark mode',
    'Your email'
  ])
})

test('LANG-2 scanner: the JavaScript between JSX branches of a deep Astro expression is code, not words', () => {
  // Tracy Base EmDash HeroAcm.astro: `{image ? (<Photo/>) : hasAside ? (<aside>…</aside>) : null}`,
  // three levels of braces, leaked `) : hasAside ? (` as interface words.
  const file = fileURLToPath(
    new URL(
      '../../../packages/cms/tracy-emdash-theme-base/src/components/sections/HeroAcm.astro',
      import.meta.url
    )
  )
  assert.deepEqual(hardCodedWords('src/components/sections/HeroAcm.astro', readFileSync(file, 'utf8')), [])
  // Words outside the expression are still caught.
  const astro =
    '---\n---\n<div>{a ? (<p>Read more</p>) : b ? (<p>Show less</p>) : null}</div>\n<p>Contact us today</p>'
  assert.deepEqual(
    hardCodedWords('src/x.astro', astro).map((w) => w.text),
    ['Contact us today']
  )
})

test('LANG-2 scanner: a code-styled eyebrow a visitor reads is still a word (JA Kinetic "// session")', () => {
  // html/com_users/login/default_logout.php: `<span class="kinetic-auth__eyebrow">// session</span>` is
  // printed on the page, not a comment, so it is an English word on a Vietnamese site.
  const php =
    '<div class="kinetic-auth__head">\n<span class="kinetic-auth__eyebrow">// session</span>\n</div>'
  assert.deepEqual(
    hardCodedWords('html/com_users/login/default_logout.php', php).map((w) => w.text),
    ['// session']
  )
})

// LANG-3

test('LANG-3: Tracy Business Joomla 1.2.1 fails on module-810.3 only; the evidence slots pass', async () => {
  const result = await run(lang3NoForeignScript, TB_J6)
  assert.equal(result.status, 'fail')
  assert.equal(result.owner, 'contract')
  assert.match(
    result.message,
    /1 source-language slot with another script: module-810\.3 \(Cyrillic: "Горячая линия"\)/
  )
  assert.doesNotMatch(result.message, /module-447/)
})

test('LANG-3: JA Voyara 1.0.4 catches the mixed word "Kok-Jайык"', async () => {
  const result = await run(lang3NoForeignScript, VOYARA_J6)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /article-386\.1 \(Cyrillic: "[^"]*Kok-Jайык/)
})

test('LANG-3: the kit Slide page of Tracy Business WordPress is not exempt: its Russian words fail (K3)', async () => {
  const result = await run(lang3NoForeignScript, TB_WP)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /page 49 \(Cyrillic/)
})

test('LANG-3: JA Essence Joomla and Tracy Business EmDash pass', async () => {
  for (const tag of [ESSENCE_J6, TB_EMDASH]) {
    const result = await run(lang3NoForeignScript, tag)
    assert.equal(result.status, 'pass', result.message)
  }
})

// LANG-5

test('LANG-5: Tracy Business WordPress 1.3.4 and Joomla 1.2.1 and JA Essence Joomla pass', async () => {
  for (const tag of [TB_WP, TB_J6, ESSENCE_J6]) {
    const result = await run(lang5OneLanguage, tag)
    assert.equal(result.status, 'pass', result.message)
  }
})

test('LANG-5: Tracy Business WordPress without editions.json and demo-trim-map.json (cc #145) fails', async () => {
  const contracts = contractsWithout('wordpress', 'tracy-business/wp7/1.3.4', [
    'editions.json',
    'demo-trim-map.json'
  ])
  const result = await run(lang5OneLanguage, TB_WP, { contracts })
  assert.equal(result.status, 'fail')
  assert.match(result.message, /there is no contract editions\.json/)
  assert.match(result.message, /no demo-trim-map\.json/)
})

test('LANG-5: Tracy Business EmDash 1.7.2 fails: site-model.json declares 2 of the 40 locales', async () => {
  const result = await run(lang5OneLanguage, TB_EMDASH)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /seed\/site-model\.json locales\.all lacks af, be/)
})

// PAGE-1

test('PAGE-1: Tracy Business WordPress 1.3.4 fails: editions.json does not declare the News translations', async () => {
  const result = await run(page1UntickedPageGone, TB_WP)
  assert.equal(result.status, 'fail')
  assert.equal(result.owner, 'contract')
  assert.match(result.message, /does not declare the translation of news/)
})

test('PAGE-1: JA Essence and JA Kinetic Joomla pass; EmDash is live-only', async () => {
  for (const tag of [ESSENCE_J6, KINETIC_J6])
    assert.equal((await run(page1UntickedPageGone, tag)).status, 'pass', tag)
  const emdash = await run(page1UntickedPageGone, TB_EMDASH)
  assert.equal(emdash.status, 'live-only')
  // Hiding an unticked page in every edition is Tracy's copy of the personalize tool, not the theme's own code (as LANG-5).
  assert.doesNotMatch(emdash.message, /theme's own code/)
  assert.match(emdash.message, /Tracy's copy of the personalize tool/)
})

test('PAGE-1: JA Kinetic WordPress lists the helixql redirects to the KineticQL page for Tracy', async () => {
  const result = await run(page1UntickedPageGone, KINETIC_WP)
  assert.equal(result.status, 'pass', result.message)
  assert.ok(result.details.some((d) => d.includes('/pages/helixql → /pages/kineticql')))
})

// PAGE-2

test('PAGE-2: Tracy Business Joomla 1.2.1 passes: Apply publishes again the Projects and News entries its trim turns off', async () => {
  // The map comes from scripts/build-joomla-demo-trim.mjs; tickedMenuItems brings a ticked page's entry back (12/10/2026).
  const result = await run(page2TickedPageOpens, TB_J6)
  assert.doesNotMatch(result.message, /demo-trim-map\.json cuts pages/, result.message)
  assert.ok(
    result.details.some((d) =>
      /Apply publishes again .*menuItem-602 \(projects\), menuItem-603 \(news\)/.test(d)
    ),
    result.details.join(' | ')
  )
})

test('PAGE-2: JA Kinetic Joomla 1.0.3 (no trim map) and Tracy Business EmDash pass', async () => {
  for (const tag of [KINETIC_J6, TB_EMDASH])
    assert.equal((await run(page2TickedPageOpens, tag)).status, 'pass', tag)
})

// PAGE-4

test('PAGE-4: JA Kinetic WordPress templates/404.html and Joomla error.php write links to listed pages', async () => {
  const wp = await run(page4NoDeadLinks, KINETIC_WP)
  assert.equal(wp.status, 'fail')
  assert.match(wp.message, /templates\/404\.html \(15: \/company\/contact/)
  const joomla = await run(page4NoDeadLinks, KINETIC_J6)
  assert.equal(joomla.status, 'fail')
  assert.match(joomla.message, /error\.php \(.*\/product\/features/)
})

test('PAGE-4: Tracy Business WordPress, JA Essence Joomla and Tracy Business EmDash pass', async () => {
  for (const tag of [TB_WP, ESSENCE_J6, TB_EMDASH]) {
    const result = await run(page4NoDeadLinks, tag)
    assert.equal(result.status, 'pass', result.message)
  }
})

test("PAGE-4: a link slot under a published component item is that component's page; under a heading it leads nowhere", async () => {
  // The JA Essence 1.0.2 contract with three link slots changed in memory: a VirtueMart style address
  // under the published Login Form item (Joomla hands the rest of the path to com_users), the same
  // under the Pages heading, and one under no item at all (JA Cagox module-134 links the shop's terms
  // of service this way: /index.php/shop/all-categories/vendor/<vendor>?layout=tos answers 200).
  const contracts = contractsWithout('joomla', 'ja-essence/j6/1.0.2', [])
  const file = path.join(
    [...contracts.values()].find((c) => c.id === 'ja-essence/j6/1.0.2').dir,
    'content-map.json'
  )
  const map = JSON.parse(readFileSync(file, 'utf8'))
  const links = map.slots.filter((s) => s.type === 'url')
  links[0].sample = '/index.php/pages/user/login-form/vendor/demo-store?layout=tos'
  links[1].sample = '/index.php/pages/vendor/demo-store?layout=tos'
  links[2].sample = '/index.php/no-such-page/vendor'
  writeFileSync(file, JSON.stringify(map))
  const result = await run(page4NoDeadLinks, ESSENCE_J6, { contracts })
  assert.equal(result.status, 'fail')
  assert.ok(!result.message.includes(links[0].key), result.message)
  assert.match(result.message, new RegExp(`${links[1].key.replace('.', '\\.')} → /index\\.php/pages/vendor`))
  assert.match(result.message, new RegExp(`${links[2].key.replace('.', '\\.')} → /index\\.php/no-such-page`))
})

// PAGE-5

test('PAGE-5: dead buttons of Tracy Business EmDash, JA Kinetic Joomla, Tracy Business WordPress', async () => {
  const emdash = await run(page5ButtonsLeadSomewhere, TB_EMDASH)
  assert.equal(emdash.status, 'fail')
  assert.match(
    emdash.message,
    /posts → \/contact, projects → \/contact, vacancies → \/contact, services → \/contact/
  )
  const kj = await run(page5ButtonsLeadSomewhere, KINETIC_J6)
  assert.match(kj.message, /module-184\.6 .*module-204\.6 .*module-211\.6 .*module-234\.6 .*module-235\.6/)
  assert.match((await run(page5ButtonsLeadSomewhere, TB_WP)).message, /\/home \(6\)/)
})

test('PAGE-5: JA Kinetic WordPress 24 integration logo cards lead nowhere but are decorative: noted, not failed (K4)', async () => {
  const result = await run(page5ButtonsLeadSomewhere, KINETIC_WP)
  assert.equal(result.status, 'live-only', result.message)
  assert.ok(result.details?.some((d) => /decorative cards .*\/product\/integrations \(24\)/.test(d)))
})

test('PAGE-5: JA Essence WordPress 1.0.9 social buttons keep their # links and pass, its # "Go somewhere" button fails (K6)', async () => {
  const result = await run(page5ButtonsLeadSomewhere, ESSENCE_WP)
  assert.equal(result.status, 'fail', result.message)
  assert.match(
    result.message,
    /buttons that lead nowhere \(#, empty or javascript:\): \/pages\/j-pages\/typography \(1\)\.$/
  )
  assert.ok(
    result.details?.some((d) =>
      /social network buttons .*K6.*\/contact \(1\), \/home\/home-2 \(5\), \/pages\/j-pages\/typography \(1\)/.test(
        d
      )
    ),
    result.details?.join('\n')
  )
})

test('PAGE-5: JA Essence Joomla has no dead button slot, so the label check is live-only', async () => {
  const result = await run(page5ButtonsLeadSomewhere, ESSENCE_J6)
  assert.equal(result.status, 'live-only')
})

// PAGE-7

test('PAGE-7: Tracy Business WordPress, JA Essence Joomla and Tracy Business EmDash pass', async () => {
  for (const tag of [TB_WP, ESSENCE_J6, TB_EMDASH]) {
    const result = await run(page7ChildrenOfUntickedPage, tag)
    assert.equal(result.status, 'pass', result.message)
  }
})

test('PAGE-7: JA Kinetic WordPress lists posts by query with no posts page, noted for Tracy', async () => {
  const result = await run(page7ChildrenOfUntickedPage, KINETIC_WP)
  assert.equal(result.status, 'pass', result.message)
  assert.ok(
    result.details.some((d) => /product\/blog, pages\/engineering\) and the site sets no posts page/.test(d))
  )
})

// PAGE-8

test('PAGE-8: the kit pages a menu links stay; the releases pass', async () => {
  for (const tag of [TB_EMDASH, TB_WP, TB_J6, ESSENCE_J6]) {
    const result = await run(page8SearchEnginesSeePublicPages, tag)
    assert.equal(result.status, 'pass', result.message)
  }
})

test('PAGE-8: an EmDash page record no menu links and no rule covers fails', async () => {
  const context = await contextOf(TB_EMDASH)
  // The rule reads the theme's files once per check; add a page record nothing links to.
  const files = await templateSourceFiles(context)
  const model = JSON.parse(files.get('seed/site-model.json'))
  model.records.push({ type: 'pages', slug: 'old-landing', locale: 'en', status: 'published' })
  files.set('seed/site-model.json', JSON.stringify(model))
  const result = await page8SearchEnginesSeePublicPages.run(context)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /no menu links and no personalize rule covers: old-landing/)
})
