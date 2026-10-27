/**
 * PAGE-8: Google sees only the pages that are public, in the language the customer chose (spec
 * `tasks/spec-template-customization-question-readiness.md`, PAGE-8).
 *
 * The template's side is "the demo carries nothing nobody declared", in three static parts:
 * 1. languages (all CMS): every language the demo carries is declared (the reader LANG-1 and LANG-5
 *    share), and an EmDash theme serving several locales has its locale gate `src/lib/locale-gate.ts`;
 * 2. extra pages outside every menu (WordPress, EmDash): a published page of the source language
 *    that is not in `tracy_site_pages.json`, not a system page, and that no navigation, template
 *    part or other page links to is reachable only through the sitemap. It needs a trim rule
 *    (WordPress contract `demo-trim-map.json` hide/kept; EmDash `personalize.json` hide/trim).
 *    Pages a menu other than the main one links (the kit, the top bar) stay as the template
 *    (S3 08/10/2026);
 * 3. a sitemap the template draws itself (EmDash `src/views/Sitemap.astro`) reads published
 *    entries of the served locale only.
 * Category and tag archives of WordPress are Tracy's to hide (D4) and are only counted here; the
 * sitemap a built site finally sends is the platform's and Tracy's.
 */
import { demoLanguages, missingFrom } from '../readers/demo-languages.js'
import { counted, findings, listed } from '../readers/rule-findings.js'
import { sitePagesOfRelease } from '../readers/site-pages-of-release.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'
import { UTILITY_WORDS } from '../site-pages/page-rule.js'

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function wordpressOrphans(context, f, /** @type {Set<string>} */ ids, /** @type {any} */ langs) {
  const wp = await wordpressDemo(context)
  const t = wp.tables
  const posts = wp.posts
  const pathOf = wp.pathOf
  const front = String(wp.front?.ID ?? '')
  const linked = posts
    .filter((p) => p.post_status === 'publish' && p.post_type !== 'revision')
    .map((p) => String(p.post_content ?? ''))
    .join('\n')
  const trim = langs.contract?.json('demo-trim-map.json')
  const trimmed = new Set([...(trim?.hide ?? []), ...(trim?.kept ?? [])].map((e) => String(e.key)))
  const orphans = []
  for (const p of posts) {
    if (p.post_type !== 'page' || p.post_status !== 'publish' || String(p.ID) === front) continue
    if (!wp.isSource(p)) continue
    const path = pathOf(p)
    if (ids.has(path) || UTILITY_WORDS.test(path) || UTILITY_WORDS.test(String(p.post_title))) continue
    if (trimmed.has(`page-${p.ID}`)) continue
    const refs = [`"id":${p.ID}`, `"id":"${p.ID}"`, `/${path}/`, `/${path}"`, `/${encodeURI(path)}/`]
    if (refs.some((r) => linked.includes(r))) continue
    orphans.push(`${p.post_title} (/${decodeURIComponent(path)}/)`)
  }
  if (orphans.length)
    f.problem(
      `${counted(orphans.length, 'published page is linked', 'published pages are linked')} from no menu or page and have no trim rule, so only the sitemap leads to them: ${listed(orphans)}`
    )
  const terms = t
    .rows('term_taxonomy')
    .filter((r) => ['category', 'post_tag'].includes(r.taxonomy) && Number(r.count) > 0)
  if (terms.length)
    f.note(
      `The demo has ${terms.filter((r) => r.taxonomy === 'category').length} categories and ${terms.filter((r) => r.taxonomy === 'post_tag').length} tags with posts; hiding their archives is Tracy's (D4).`
    )
}

/** @param {ReturnType<typeof findings>} f */
function emdashOrphans(f, /** @type {Set<string>} */ ids, /** @type {any} */ langs) {
  const model = langs.model ?? {}
  const locale = model.locales?.default ?? 'en'
  const paths = (model.menus ?? []).flatMap((/** @type {any} */ m) => {
    const walk = (/** @type {any[]} */ items) => items.flatMap((i) => [i.path, ...walk(i.children ?? [])])
    return walk(m.items ?? [])
  })
  // A menu path names a record by its last segment (`/about`) or by every segment (`/kit/email` is
  // the record `kit-email`).
  const segments = paths.filter(Boolean).map((p) =>
    String(p)
      .replace(/^\/+|\/+$/g, '')
      .split('/')
  )
  const linked = new Set(segments.flatMap((s) => [s[s.length - 1], s.join('-')]))
  const personalize = langs.files.get('seed/personalize.json')
  const rules = personalize ? JSON.parse(personalize) : {}
  const covered = new Set([...(rules.hide ?? []), ...(rules.trim ?? [])].map((r) => r.slug ?? r.collection))
  const orphans = (model.records ?? [])
    .filter(
      (/** @type {any} */ r) => r.type === 'pages' && (r.locale ?? locale) === locale && r.status !== 'draft'
    )
    .filter(
      (/** @type {any} */ r) =>
        !ids.has(r.slug) && !linked.has(r.slug) && !covered.has(r.slug) && !covered.has('pages')
    )
    .filter((/** @type {any} */ r) => !UTILITY_WORDS.test(r.slug))
    .map((/** @type {any} */ r) => r.slug)
  if (orphans.length)
    f.problem(`page records no menu links and no personalize rule covers: ${listed(orphans)}`)
  const sitemap = langs.files.get('src/views/Sitemap.astro')
  if (sitemap && /getEmDashCollection\(/.test(sitemap) && !/status:\s*['"]published['"]/.test(sitemap))
    f.problem("src/views/Sitemap.astro lists collections without status: 'published'")
  if (sitemap && /getEmDashCollection\(/.test(sitemap) && !/\blocale\b/.test(sitemap))
    f.problem('src/views/Sitemap.astro lists collections of every locale')
}

export const page8SearchEnginesSeePublicPages = {
  id: 'PAGE-8',
  title: 'Google sees only the public pages, in the language the customer chose',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'PAGE-8')
    await f.part('the demo content', async () => {
      const langs = /** @type {any} */ (await demoLanguages(context))
      const declared = langs.declared.find((/** @type {any} */ d) => d.languages)?.languages ?? null
      const many = langs.platform === 'joomla' ? langs.carried.length > 1 : langs.carried.length > 0
      if (many && langs.platform !== 'emdash') {
        const missing = declared ? missingFrom(langs.carried, declared) : langs.carried
        if (missing.length) {
          f.owner('contract')
          f.problem(`the demo carries languages no contract edition declares: ${listed(missing)}`)
        }
      }
      if (langs.platform === 'emdash') {
        const served = langs.declared[0].languages ?? []
        const missing = missingFrom(langs.carried, served)
        if (missing.length)
          f.problem(`seed content carries locales tracy_setting.json does not list: ${listed(missing)}`)
        if (langs.carried.length > 1 && !langs.files.has('src/lib/locale-gate.ts'))
          f.problem('the theme serves several locales but has no locale gate (src/lib/locale-gate.ts)')
      }
      const a = await sitePagesOfRelease(context)
      if (!a.pages) {
        f.note(`No page list (${a.reason}): the extra-page part is skipped.`)
        return
      }
      const ids = new Set(a.pages.map((p) => p.id))
      if (langs.platform === 'wordpress') await wordpressOrphans(context, f, ids, langs)
      if (langs.platform === 'emdash') emdashOrphans(f, ids, langs)
    })
    f.note(
      'The sitemap a built site sends (WordPress and EmDash core, robots) is the platform and Tracy; check it on a built site.'
    )
    return f.outcome({
      pass: 'the demo carries no language, page or sitemap entry that nobody declared',
      fix: `Remove the extra pages from the demo or add them to the trim map (${
        context.release.platform === 'emdash' ? 'seed/personalize.json' : "the contract's demo-trim-map.json"
      }), declare every demo language, then cut a new release.`
    })
  }
}
