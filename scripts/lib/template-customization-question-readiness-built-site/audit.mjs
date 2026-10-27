/**
 * The Template Customization Question Readiness built-site check: read a site Tracy built from a template, and the template's demo, and say
 * what the static Template Customization Question Readiness check cannot (the spec's "measured on a
 * real built site" section). One result per check:
 *
 *   const report = await auditBuiltSite({ site, demo, set: 'full', lang: 'vi', unticked, fetch })
 *   // { site, demo, set, lang, pages, checks: [{ id, rule, outcome: 'PASS' | 'FAIL' | 'NOTE', count, items }] }
 *
 * Checks, all over every crawled page of the site (and the same page of the demo):
 * english-left, css-words, font-glyphs (LANG-2) · dates (LANG-6) · form-language (LANG-1) · wrong-translation
 * (LANG-2) · kit-translated (K3) · dead-buttons (kit pages exempt), demo-files, label-targets (PAGE-5) ·
 * label-targets-consistent (PAGE-5, NOTE only: a rewritten label the menu and the footer both use for
 * that page, accepted 12/10/2026) · menu-category-names (ABOUT-2, FULL: a menu or footer item to a
 * category listing page must share a word with the category's title, when the demo's item was named
 * after its category) · social-count (K6) · page-navigation (PAGE-2) · repeated-posts (ABOUT-2, FULL)
 * and repeated-posts-as-demo (NOTE only: the same repeat on the demo, translated posts keep it) ·
 * blank-equals-demo (BLANK) · unticked-gone (PAGE-1, PAGE-4). Language checks run only when the site
 * is not in English. A NOTE check never fails the run.
 */
import { articleOf, blockChanges, repeatedTitles, stretchedLabels, unchangedLines } from './content.mjs'
import { crawl } from './crawl.mjs'
import { paintedWords, wrongDates } from './dates-and-styles.mjs'
import { glyphGaps } from './font-glyphs.mjs'
import { changedLabels, fillerItems, isContactPath, namesTarget, sharesWord } from './labels.mjs'
import { deadButtons, fileLinks, foreignLang, pageNavigation, socialItems } from './links.mjs'
import { agreedLabel, categoryTitle, menuLinks } from './menus.mjs'
import { lastSegment, tally, withInitials } from './tallies.mjs'
import { allowedWords, documentOf, englishRuns, isEnglish } from './text.mjs'

const KIT = /typography|style-?guide|kit[-_]|\/kit\b|offline|error-page/i

/** The category a page of a crawl lists (`categoryTitle`), or null when it is not a category page or does not answer. */
async function categoryOf(/** @type {Awaited<ReturnType<typeof crawl>>} */ c, /** @type {string} */ path) {
  const known = [path, `${path}/`].find((p) => c.pages.get(p)?.status === 200)
  const page = known ? c.pages.get(known) : await c.page(path)
  return page?.status === 200 ? categoryTitle(documentOf(page.html), path) : null
}

/** The title, headings and listed items of a page of a crawl (path with or without its trailing slash), or null. */
async function targetText(/** @type {Awaited<ReturnType<typeof crawl>>} */ c, /** @type {string} */ path) {
  const known = [path, `${path}/`].find((p) => c.pages.get(p)?.status === 200)
  const page = known
    ? c.pages.get(known)
    : await c.page(path === '/' ? '/' : `${path}/`).then((r) => (r.status === 200 ? r : c.page(path)))
  if (!page || page.status !== 200) return null
  const doc = documentOf(page.html)
  // The site name after the title's separator would let any label with a word of it pass; the
  // items the page lists are its headings and short entries, outside the shared header and footer
  // (the footer's own service list is on every page).
  const title = String(doc.querySelector('title')?.textContent ?? '').split(/\s[–—|-]\s/)[0]
  const items = [...doc.querySelectorAll('h1, h2, h3, h4, li, dt, strong, b, [class*=title]')]
    .filter((e) => !e.closest('header, footer, nav'))
    .map((e) => String(e.textContent ?? '').trim())
    .filter((x) => x && x.length <= 80)
  return [title, ...items].join(' | ')
}

/**
 * @param {{
 *   site: string, demo: string, set: 'full' | 'blank', lang?: string, unticked?: string[],
 *   names?: string[], demoNames?: string[], allow?: string[], kit?: string[], maxPages?: number,
 *   fetch?: typeof globalThis.fetch
 * }} opts
 */
export async function auditBuiltSite(opts) {
  const { set, unticked = [], names = [], demoNames = [], maxPages = 160 } = opts
  const fetch = opts.fetch ?? globalThis.fetch
  /** A kit page: a sample of the template's styles, named by its path or listed with `--kit`. */
  const isKit = (/** @type {string} */ path) => KIT.test(path) || (opts.kit ?? []).includes(path)
  const site = await crawl(opts.site, { fetch, max: maxPages })
  const demo = await crawl(opts.demo, { fetch, max: 0 })
  const lang = (opts.lang ?? '').toLowerCase()
  const allow = allowedWords(lang, [...names, ...(opts.allow ?? [])])
  const english = (/** @type {string} */ s) => isEnglish(s, { lang, allow, names })
  const t = Object.fromEntries(
    [
      'english',
      'css',
      'dates',
      'glyphs',
      'forms',
      'stretched',
      'kit',
      'dead',
      'files',
      'labels',
      'agreed',
      'categories',
      'filler',
      'social',
      'nav',
      'blank'
    ].map((k) => [k, tally()])
  )
  // The fonts of a page are judged once per set of stylesheets it links: every page of a template shares them.
  /** @type {Map<string, Promise<Array<{ family: string, missing: string[], subset: string }>>>} */
  const fontsBySheets = new Map()
  const fontBytes = async (/** @type {string} */ url) => {
    const r = await fetch(url)
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
  }
  const fontText = async (/** @type {string} */ url, /** @type {Record<string, string>} */ headers = {}) => {
    const r = await fetch(url, { headers })
    return r.ok ? r.text() : ''
  }
  const articles = []
  /** @type {{ label: string, before: string, path: string, on: string, agreed: boolean }[]} */
  const relabelled = []
  // Menu and footer items per target path, each paired with the demo's item at the same place of the same page.
  /** @type {Map<string, Map<string, { before: string | null, on: string }>>} label -> its pair, per path */
  const menuItems = new Map()
  const ok = [...site.pages].filter(([p, v]) => v.status === 200 && !unticked.includes(p))
  // BLANK: the site's own article titles by path, so a list that picks other demo articles (by
  // hits, at random, on tied dates) reads as a selection, not a rewrite.
  /** @type {Map<string, string>} */
  const titles = new Map()
  if (set === 'blank')
    for (const [p, v] of ok) {
      const a = articleOf(documentOf(v.html), p)
      if (a) titles.set(p.replace(/\/$/, '') || '/', a.title)
    }
  for (const [path, page] of ok) {
    const doc = documentOf(page.html)
    // eslint-disable-next-line no-await-in-loop -- the demo page of each site page, one at a time.
    const before = await demo.page(path)
    const demoDoc = before.status === 200 ? documentOf(before.html) : null
    if (lang && !lang.startsWith('en')) {
      for (const r of englishRuns(doc, { lang, allow, names })) t.english.add(`"${r.slice(0, 70)}"`, path)
      const sheets = [...doc.querySelectorAll('link[rel=stylesheet]')]
        .map((l) => l.getAttribute('href') ?? '')
        .filter((h) => h && new URL(h, `${site.origin}/`).origin === site.origin)
      // eslint-disable-next-line no-await-in-loop -- each stylesheet is fetched once (memoized).
      const texts = await Promise.all(sheets.map((h) => site.sheet(h)))
      for (const w of paintedWords(doc, texts))
        if (english(w.text)) t.css.add(`"${w.text}" (${w.selector.slice(0, 60)})`, path)
      for (const d of wrongDates(doc, lang)) t.dates.add(`"${d}"`, path)
      const linked = [...doc.querySelectorAll('link[rel=stylesheet]')]
        .map((l) => l.getAttribute('href') ?? '')
        .join(' ')
      if (!fontsBySheets.has(linked))
        fontsBySheets.set(
          linked,
          glyphGaps({
            doc,
            lang,
            sheets: sheets.map((href, i) => ({
              href: new URL(href, `${site.origin}/`).href,
              text: texts[i]
            })),
            fetchText: fontText,
            fetchBytes: fontBytes,
            base: `${site.origin}${path}`
          }).catch(() => [])
        )
      // eslint-disable-next-line no-await-in-loop -- once per set of stylesheets (memoized above).
      for (const g of await fontsBySheets.get(linked))
        t.glyphs.add(`"${g.family}" cannot draw ${g.missing.join(' ')} (no ${g.subset} glyphs)`, path)
      for (const f of foreignLang(doc)) t.forms.add(f, path)
      if (demoDoc) for (const s of stretchedLabels(doc, demoDoc)) t.stretched.add(s, path)
      if (demoDoc && isKit(path))
        for (const l of unchangedLines(doc, demoDoc, english)) t.kit.add(`"${l.slice(0, 70)}"`, path)
    }
    // BLANK is the demo: a button to nowhere the demo's page has too is the template's own, and only the ones beyond it count;
    // on FULL every action button to nowhere counts (it leads to the Contact page there, PAGE-5, 11/10/2026).
    // A kit page's sample buttons ("Go somewhere" → #) are the kit's own and stay (12/10/2026).
    const ownDead = set === 'blank' && demoDoc ? deadButtons(demoDoc).length : 0
    if (!isKit(path)) for (const b of deadButtons(doc).slice(ownDead)) t.dead.add(b, path)
    if (!KIT.test(path)) for (const f of fileLinks(doc)) t.files.add(f, path)
    const a = articleOf(doc, path)
    const demoArticle = demoDoc ? articleOf(demoDoc, path) : null
    if (a) articles.push({ ...a, path, demoTitle: demoArticle?.title ?? null })
    const menus = menuLinks(doc, site.origin)
    const demoMenus = demoDoc ? menuLinks(demoDoc, demo.origin) : []
    for (const m of menus) {
      const nth = menus.filter((x) => x.path === m.path && x.where === m.where).indexOf(m)
      const pair = demoMenus.filter((x) => x.path === m.path && x.where === m.where)[nth]
      const items = menuItems.get(m.path) ?? new Map()
      if (!items.has(m.label)) items.set(m.label, { before: pair?.label ?? null, on: path })
      menuItems.set(m.path, items)
    }
    if (!demoDoc) continue
    if (set === 'full')
      for (const l of changedLabels(doc, demoDoc, { siteOrigin: site.origin, demoOrigin: demo.origin }))
        relabelled.push({ ...l, on: path, agreed: agreedLabel(menus, l.path, l.label) })
    if (set === 'full')
      for (const f of fillerItems(doc, demoDoc, { siteOrigin: site.origin, demoOrigin: demo.origin }))
        t.filler.add(f, path)
    const [mine, theirs] = [socialItems(doc).length, socialItems(demoDoc).length]
    if (mine < theirs) t.social.add(`${mine} of the demo's ${theirs} social buttons`, path)
    const [n, m] = [pageNavigation(doc, site.origin), pageNavigation(demoDoc, demo.origin)]
    // Compared by the article's own alias: an unticked page moves an article's route, not its neighbour.
    for (const side of /** @type {const} */ (['prev', 'next']))
      if (
        m[side] &&
        lastSegment(n[side]) !== lastSegment(m[side]) &&
        !unticked.some((u) => u.replace(/\/$/, '') === String(m[side]).replace(/\/$/, ''))
      )
        t.nav.add(`${side}: demo ${m[side]}, site ${n[side] ?? 'none'}`, path)
    if (set === 'blank')
      for (const c of blockChanges(doc, demoDoc, withInitials([...names, ...demoNames]), 3, { titles }))
        t.blank.add(c, path)
  }
  // A rewritten label must name its target. A demo pair that was already loose (its words share
  // nothing with the demo's target page) is not judged, except for a contact page.
  for (const l of relabelled) {
    // eslint-disable-next-line no-await-in-loop -- target pages are memoized by the crawls.
    const [mine, theirs] = await Promise.all([targetText(site, l.path), targetText(demo, l.path)])
    if (mine === null) continue
    if (!isContactPath(l.path) && !namesTarget(l.before, l.path, theirs ?? '', 'en')) continue
    if (namesTarget(l.label, l.path, mine, lang || 'en')) continue
    // The site names that page by this label in its menu and its footer alike: accepted, reported as a NOTE
    // (g65 EmDash "Giới thiệu" → /about, 12/10/2026). A contact page still needs a contact word.
    const item = `"${l.label}" (demo "${l.before}") → ${l.path}`
    if (l.agreed && !isContactPath(l.path)) t.agreed.add(item, l.on)
    else t.labels.add(item, l.on)
  }
  // FULL renames blog categories for the customer's trade (12/10/2026): a menu item to a category page must carry
  // its category's name. Judged only where the demo's item to that page was named after the demo's category (a
  // "Category Style 2" layout sample is not).
  if (set === 'full')
    for (const [path, items] of menuItems) {
      if (unticked.some((u) => u.replace(/\/$/, '') === path)) continue
      // eslint-disable-next-line no-await-in-loop -- target pages are memoized by the crawls.
      const [mine, theirs] = await Promise.all([categoryOf(site, path), categoryOf(demo, path)])
      if (!mine) continue
      for (const [label, { before, on }] of items)
        if (!(theirs && before && !sharesWord(before, theirs)) && !sharesWord(label, mine))
          t.categories.add(
            `"${label}"${before ? ` (demo "${before}")` : ''} → ${path}, category "${mine}"`,
            on
          )
    }
  const unique = new Map(articles.map((x) => [x.key, x]))
  const posts = repeatedTitles([...unique.values()], {
    demoTitle: (/** @type {any} */ x) => x.demoTitle ?? null
  })
  const gone = []
  for (const p of unticked) {
    // eslint-disable-next-line no-await-in-loop -- a handful of paths.
    const r = await site.page(p)
    const from = [...site.pages]
      .filter(([, v]) => v.links.some((l) => l.replace(/\/$/, '') === p.replace(/\/$/, '')))
      .map(([k]) => k)
    if (r.status !== 404 && r.status !== 410) gone.push(`${p} answers ${r.status}`)
    if (from.length)
      gone.push(`${p} is linked from ${from.length} page${from.length === 1 ? '' : 's'} (${from[0]})`)
  }
  const fullFiles = set === 'full'
  const check = (
    /** @type {string} */ id,
    /** @type {string} */ rule,
    /** @type {string[]} */ items,
    fail = true
  ) => ({
    id,
    rule,
    outcome: items.length ? (fail ? 'FAIL' : 'NOTE') : 'PASS',
    count: items.length,
    items: items.slice(0, 200)
  })
  const checks = [
    check('english-left', 'LANG-2', t.english.items()),
    check('css-words', 'LANG-2', t.css.items()),
    check('wrong-translation', 'LANG-2', t.stretched.items()),
    check('kit-translated', 'LANG-2 (K3)', t.kit.items()),
    check('font-glyphs', 'LANG-2 (glyphs)', t.glyphs.items()),
    check('dates', 'LANG-6', t.dates.items()),
    check('form-language', 'LANG-1', t.forms.items()),
    check('dead-buttons', 'PAGE-5', t.dead.items()),
    check('demo-files', 'PAGE-5 (demo file links)', t.files.items(), fullFiles),
    check('label-targets', 'PAGE-5', t.labels.items()),
    check('label-targets-consistent', 'PAGE-5 (menu and footer agree)', t.agreed.items(), false),
    check('menu-category-names', 'ABOUT-2 (categories)', t.categories.items()),
    check('service-items', 'ABOUT-2 (SERVICES)', t.filler.items()),
    check('social-count', 'PAGE-5 (K6)', t.social.items()),
    check('page-navigation', 'PAGE-2', t.nav.items()),
    check('repeated-posts', 'ABOUT-2 (POSTS)', set === 'full' ? [...posts.same, ...posts.near] : []),
    check(
      'repeated-posts-as-demo',
      'ABOUT-2 (POSTS, as the demo)',
      set === 'full' ? posts.mirrored : [],
      false
    ),
    check('blank-equals-demo', 'BLANK', t.blank.items()),
    check('unticked-gone', 'PAGE-1, PAGE-4', gone)
  ]
  return {
    site: site.origin,
    demo: demo.origin,
    set,
    lang: lang || null,
    pages: ok.length,
    articles: unique.size,
    checks
  }
}
