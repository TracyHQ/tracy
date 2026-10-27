/**
 * The pages a template declares, for the Add site preview measurement (Akemi, 15/10/2026: a customer
 * who wears a system gets the whole site restyled, so every preview check reads every page, not the
 * home page alone). The source is the release's own contract, per CMS, never a crawl of the demo:
 *
 *   - Joomla: `content-map.json` of the version's contract folder, its `pages` (every menu item of
 *     the release database). A heading or separator (no link) is no page, an alias (`Itemid=`) is the
 *     page it points at, and the demo answers each route at `/index.php/<route>`.
 *   - WordPress: `content-map.json`, its `page` entities (slugs; WordPress redirects `/<slug>/` to the
 *     page's own address), and the demo's published pages read off its REST API. The content map lists
 *     only the pages whose text is captured, so the blog page, search and tags were missing from it.
 *   - EmDash: the theme's `qa.contract.json`, its `pages` of the default locale that answer 200 (other
 *     locales render the same views).
 *
 * The home page `/` always comes first. PURE except `declaredPagesOf`, which reads files and the demo.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { measurementPath, previewLineOf } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'

/** The home page first, then each page once, in the order the source lists them. */
const homeFirst = (/** @type {string[]} */ paths) => [...new Set(['/', ...paths])]

/**
 * A Joomla release's pages from its content map: `/index.php/<route>` for every menu item that is a page.
 * With the release's presentation lock, a menu item the demo does not publish (trashed -2, unpublished 0)
 * is not a page: Joomla answers 404 there (JA Vital 1.0.5 /about-us, /check).
 * @param {{ pages?: { entity?: string, route?: string, link?: string }[] } | null | undefined} contentMap
 * @param {{ entities?: Record<string, { published?: string | number }> } | null} [lock]
 */
export function joomlaPagesOf(contentMap, lock = null) {
  const out = []
  for (const p of contentMap?.pages ?? []) {
    const route = String(p?.route ?? '').replace(/^\/+|\/+$/g, '')
    const link = String(p?.link ?? '')
    // a menu heading or separator has no link; an alias names another item (`index.php?Itemid=218`)
    if (!route || !link || /^index\.php\?Itemid=\d+$/i.test(link)) continue
    // a URL menu item that links another item's page (JA Podcast 'Detail Layout 3': &Itemid=147) is that page
    if (/[?&]Itemid=\d+/i.test(link)) continue
    // an external or system URL menu item is not a page of the template
    if (!/^index\.php\?option=/i.test(link)) continue
    // a menu item in the trash or unpublished renders nowhere
    const entity = lock?.entities?.[p?.entity ?? '']
    const published = entity?.published
    if (published !== undefined && String(published) !== '1') continue
    // a heading or separator can keep the link of the type it was before (JA Impact 'User'): no page
    if (entity?.type === 'heading' || entity?.type === 'separator') continue
    // a category view that names no category renders nothing (JA Spa 1.0.6 /page/joomla-content: 404)
    if (/[?&]view=category(&|$)/i.test(link) && !/[?&]id=\d+/i.test(link)) continue
    // an article submit form needs a login that may create articles; a visitor gets 403
    // (JA Voyara 1.0.10 /pages/submit-article: "You don't have permission to access this")
    if (/^index\.php\?option=com_content&(.*&)?view=form(&|$)/i.test(link)) continue
    out.push(`/index.php/${route.split('/').map(encodeURIComponent).join('/')}`)
  }
  return homeFirst(out)
}

/**
 * A WordPress release's pages: the content map's page slugs as `/<slug>/`, then the demo's own
 * published pages (`restPaths`, absolute paths read off `/wp-json/wp/v2/pages`).
 * @param {{ entities?: { kind?: string, identity?: { postType?: string, slug?: string } }[] } | null | undefined} contentMap
 * @param {string[]} [restPaths]
 */
export function wordpressPagesOf(contentMap, restPaths = []) {
  const rest = restPaths.filter((p) => typeof p === 'string' && p.startsWith('/'))
  // a child page lives at /<parent>/<slug>/ and WordPress need not redirect /<slug>/ there (JA Nova WP 1.1.12
  // /contact/ 404, the page is /about-us-2/contact/): a slug the demo publishes under a parent is that page
  const nested = (/** @type {string} */ slug) =>
    rest.find((p) => p.endsWith(`/${slug}/`) && p !== `/${slug}/`)
  const slugs = (contentMap?.entities ?? [])
    .filter((e) => e?.kind === 'page' && e.identity?.slug)
    .map((e) => encodeURIComponent(String(e.identity?.slug)))
    .map((slug) => nested(slug) ?? `/${slug}/`)
  return homeFirst([...slugs, ...rest])
}

/** A locale prefix as WordPress multilingual plugins write it: `de`, `pt-br`, `zh-tw`. */
const LOCALE_SEGMENT = /^[a-z]{2,3}(-[a-z]{2,4})?$/
/**
 * The stress locales, in preference order (Akemi, 15/10/2026): the language whose words run longest
 * (German compounds, then Finnish and Dutch), and one non-Latin script (Cyrillic first).
 */
const LONG_TEXT_LOCALES = ['de', 'fi', 'nl', 'pl', 'hu', 'fr', 'es', 'it', 'pt-br', 'pt-pt']
const NON_LATIN_LOCALES = ['ru', 'uk', 'bg', 'sr', 'el', 'ka', 'ja', 'zh-cn', 'zh-tw', 'th']
/** A site counts as multilingual from this many locale prefixes, each with a page of its own. */
const MIN_LOCALES = 2

/**
 * The page list of a multilingual site (Akemi, 15/10/2026: never drop a PAGE; a locale copy is the
 * same page in another language, not another page). Every page of the default locale (no prefix) is
 * kept, every page of two stress locales (the longest text, one non-Latin script), and the home page
 * of every locale (its header and language switcher); the other locale copies are `twins`, counted
 * per locale. A site with fewer than `MIN_LOCALES` prefixes is returned as given.
 * @param {string[]} paths
 * @returns {{ pages: string[], twins: Record<string, number>, stress: string[], locales: string[] }}
 */
export function localeSampleOf(paths) {
  /** @type {Map<string, string[]>} */
  const byLocale = new Map()
  for (const p of paths) {
    const seg = p.split('/')[1] ?? ''
    if (!LOCALE_SEGMENT.test(seg)) continue
    byLocale.set(seg, [...(byLocale.get(seg) ?? []), p])
  }
  // a prefix is a locale when it holds a page below it (`/de/about-de/`), not only itself
  for (const [seg, list] of byLocale)
    if (!list.some((p) => p.split('/').filter(Boolean).length > 1)) byLocale.delete(seg)
  if (byLocale.size < MIN_LOCALES) return { pages: paths, twins: {}, stress: [], locales: [] }
  const locales = [...byLocale.keys()]
  const stress = [LONG_TEXT_LOCALES, NON_LATIN_LOCALES]
    .map((pref) => pref.find((l) => byLocale.has(l)))
    .filter((l) => typeof l === 'string')
  /** @type {Record<string, number>} */
  const twins = {}
  const pages = []
  for (const p of paths) {
    const seg = p.split('/')[1] ?? ''
    if (!byLocale.has(seg) || stress.includes(seg)) {
      pages.push(p)
      continue
    }
    twins[seg] = (twins[seg] ?? 0) + 1
  }
  // every locale's home page, whether or not the REST list names it
  for (const l of locales) if (!pages.includes(`/${l}/`)) pages.push(`/${l}/`)
  for (const l of locales) {
    if (twins[l] === undefined) continue
    if (paths.includes(`/${l}/`)) twins[l]--
    if (!twins[l]) delete twins[l]
  }
  return { pages: homeFirst(pages), twins, stress, locales }
}

/** The rule as one line for the measurement file and /ops (`previewPagesNote`). */
export const localeNoteOf = (
  /** @type {{ twins: Record<string, number>, stress: string[], locales: string[] }} */ s
) =>
  s.locales.length
    ? `multilingual (${s.locales.length} locales): every default-locale page, every page of ${s.stress.join(' and ')} (longest text, non-Latin script), the home page of every locale; ${Object.values(s.twins).reduce((a, b) => a + b, 0)} other locale copies are the same pages in another language and are not measured`
    : null

/**
 * An EmDash theme's pages from its QA contract: the default locale's pages that answer 200.
 * @param {{ defaultLocale?: string, pages?: { path?: string, locale?: string, status?: number }[] } | null | undefined} qa
 */
export function emdashPagesOf(qa) {
  const locale = qa?.defaultLocale ?? null
  return homeFirst(
    (qa?.pages ?? [])
      .filter((p) => typeof p?.path === 'string' && p.path.startsWith('/'))
      .filter((p) => (p.status ?? 200) === 200 && (!locale || !p.locale || p.locale === locale))
      .map((p) => String(p.path))
  )
}

/**
 * The page list a run measures: `home` (the fast mode), `all` (every declared page, the default) or
 * a comma list of paths.
 * @param {string | null | undefined} option @param {string[]} declared
 */
export function pagesFor(option, declared) {
  const o = String(option ?? 'all').trim()
  if (o === 'all' || o === '') return declared
  if (o === 'home') return ['/']
  const listed = [
    ...new Set(
      o
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.startsWith('/'))
    )
  ]
  return listed.length ? listed : ['/']
}

/**
 * The contract file a line's pages come from, relative to the tch root, or null when the CMS has none.
 * @param {{ platform: string, tag: string, version?: string | null }} d
 */
export function pageSourceOf(d) {
  const line = previewLineOf({ platform: d.platform, tag: d.tag })
  if (!line || !d.version) return null
  if (line.cms === 'emdash')
    return `packages/cms/tracy-emdash-theme-${line.template.replace(/^tracy-/, '')}/qa.contract.json`
  const file = measurementPath({
    cms: line.cms,
    template: line.template,
    tag: `${line.template}/${line.cmsDir}`,
    version: d.version
  })
  return file.replace(/design-system-measurement\.json$/, 'content-map.json')
}

/**
 * Every page a demo row's template declares, and where the list came from.
 * @param {{ platform: string, tag: string, version?: string | null, address: string }} d
 * @param {{ root: string, fetchImpl?: typeof fetch }} p
 * @returns {Promise<{ pages: string[], source: string[], locales?: ReturnType<typeof localeSampleOf>, note?: string | null }>}
 */
export async function declaredPagesOf(d, { root, fetchImpl = fetch }) {
  const file = pageSourceOf(d)
  /** @type {any} */
  let doc = null
  if (file && existsSync(join(root, file))) {
    try {
      doc = JSON.parse(readFileSync(join(root, file), 'utf8'))
    } catch {}
  }
  const source = doc ? [file ?? ''] : []
  if (d.platform === 'joomla') {
    // the presentation lock beside the content map says which menu items the demo publishes
    const lockFile = file ? join(root, file.replace(/content-map\.json$/, 'presentation-lock.json')) : null
    let lock = null
    if (lockFile && existsSync(lockFile)) {
      try {
        lock = JSON.parse(readFileSync(lockFile, 'utf8'))
      } catch {}
    }
    return { pages: joomlaPagesOf(doc, lock), source }
  }
  if (d.platform === 'emdash') return { pages: emdashPagesOf(doc), source }
  const rest = await wordpressRestPaths(d.address, fetchImpl)
  if (rest.length) source.push('/wp-json/wp/v2/pages')
  const sample = localeSampleOf(wordpressPagesOf(doc, rest))
  return { pages: sample.pages, source, locales: sample, note: localeNoteOf(sample) }
}

/** The published pages of a WordPress demo, as absolute paths on it; empty when its REST API is shut. */
async function wordpressRestPaths(/** @type {string} */ address, /** @type {typeof fetch} */ fetchImpl) {
  const host = new URL(address).host
  /** @type {string[]} */
  const out = []
  for (let page = 1; page <= 20; page++) {
    try {
      const r = await fetchImpl(
        new URL(`/wp-json/wp/v2/pages?per_page=100&page=${page}&_fields=link`, address),
        { signal: AbortSignal.timeout(20000) }
      )
      if (!r.ok) break
      const list = await r.json()
      if (!Array.isArray(list) || !list.length) break
      for (const p of list) {
        try {
          const u = new URL(String(p?.link ?? ''))
          if (u.host === host) out.push(`${u.pathname}${u.search}`)
        } catch {}
      }
      if (list.length < 100) break
    } catch {
      break
    }
  }
  return out
}

/** A page path as a folder name for screenshots: `/` is `home`. */
export const pageSlugOf = (/** @type {string} */ path) =>
  path === '/'
    ? 'home'
    : path
        .replace(/^\/+(index\.php\/)?/, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'page'
