// The EmDash adapter of the site part of the kit, the same shape as the WordPress adapter (wordpress.mjs): where an
// EmDash theme keeps the site name, the logos, the favicon and the main menu. EmDash has no database to SELECT from
// (a SQLite file in the site's own folder, behind its REST API), so the settings are read once through that API with
// the agent token, by the caller (`readEmdashSettings`), and handed in; the theme's files are read from `--webroot`.
// Nothing is written. Where EmDash has no equivalent of a Joomla field, the method answers empty and the reason goes
// to `errors` (`kind: 'not-on-platform'`), so the kit never invents one.
import { readFileSync } from 'node:fs'

/**
 * The site settings the adapter reads (`GET /_emdash/api/settings`, agent token), or null with the reason.
 * Only GET is sent; a token is read from a file, never a command line.
 * @param {{siteUrl: string, tokenFile?: string, hostHeader?: string, fetchImpl?: typeof fetch}} a
 * @returns {Promise<{settings: object|null, reason: string|null}>}
 */
export async function readEmdashSettings({ siteUrl, tokenFile, hostHeader, fetchImpl = fetch }) {
  if (!tokenFile)
    return { settings: null, reason: 'no agent token to read the site settings with (--token-file)' }
  let token
  try {
    token = readFileSync(tokenFile, 'utf8').trim()
  } catch (e) {
    return { settings: null, reason: `the token file could not be read: ${e.code ?? e.message}` }
  }
  try {
    const res = await fetchImpl(new URL('/_emdash/api/settings', siteUrl), {
      headers: {
        authorization: `Bearer ${token}`,
        'x-emdash-request': '1',
        ...(hostHeader ? { host: hostHeader } : {})
      }
    })
    if (!res.ok) return { settings: null, reason: `the settings door answered ${res.status}` }
    const body = await res.json()
    return body?.data && typeof body.data === 'object'
      ? { settings: body.data, reason: null }
      : { settings: null, reason: 'the settings door answered without data' }
  } catch (e) {
    return { settings: null, reason: `the settings door could not be reached: ${e.message}` }
  }
}

/** The file a settings media reference (`{url}` or a plain path) names, or ''. */
const mediaOf = (v) => (typeof v === 'string' ? v : typeof v?.url === 'string' ? v.url : '')

/** The logo spots a theme draws with `logoSpots(...)` (src/lib/brand.ts), by the component file that calls it. */
export function logoPlacesOf(files) {
  const places = []
  for (const [file, text] of Object.entries(files)) {
    if (!/logoSpots\(\s*\w+\s*,\s*'(?:themed|dark)'/.test(text ?? '')) continue
    const where = /footer/i.test(file) ? 'footer' : /header/i.test(file) ? 'header' : 'other'
    const dark = /logoSpots\(\s*\w+\s*,\s*'dark'/.test(text)
    places.push({ where, layout: file, dark })
  }
  return places
}

const TOKENS_FILE = 'src/styles/tokens.css'
/** The theme variables that name the brand itself, and the role they stand for. */
const BRAND_TOKENS = {
  '--color-accent': 'primary',
  '--color-primary': 'primary',
  '--color-secondary': 'secondary'
}

/**
 * The brand colours a theme's `tokens.css` declares, first declaration of each (the light theme), as colour variables
 * `{name, value, declaredIn, names}`. A value that is another variable (`--color-primary: var(--color-accent)`) is
 * the other's own and adds nothing.
 * @param {string|null} css
 */
export function brandVariablesOf(css) {
  const out = []
  const seen = new Set()
  for (const m of String(css ?? '').matchAll(/(--color-[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const [, token, raw] = m
    const names = BRAND_TOKENS[token]
    if (!names || seen.has(token)) continue
    seen.add(token)
    const value = raw.trim()
    const viaVar = /^var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-f]{3,8})\s*\)$/i.exec(value)
    if (viaVar)
      out.push({
        name: viaVar[1],
        value: viaVar[2].toLowerCase(),
        declaredIn: TOKENS_FILE,
        names,
        brand: true
      })
    else if (/^#[0-9a-f]{3,8}$/i.test(value))
      out.push({ name: token, value: value.toLowerCase(), declaredIn: TOKENS_FILE, names, brand: true })
  }
  return out
}

/** The component files that may draw a logo. */
const LOGO_FILES = ['src/components/site/Header.astro', 'src/components/site/Footer.astro']

/**
 * @param {{query: Function|null, readFile: Function|null}} source
 * @param {{settings?: object|null, settingsReason?: string|null, map?: object|null, template?: string|null}} [extra]
 *   `settings`: the site settings (`readEmdashSettings`); `map`: the content map (menus, page titles)
 */
export function emdashAdapter(
  source,
  { settings = null, settingsReason = null, map = null, template = null } = {}
) {
  const errors = []
  const missing = (field, reason) => errors.push({ kind: 'missing', field, reason })
  const absent = (field, reason) => errors.push({ kind: 'not-on-platform', field, reason })
  const { readFile } = source
  if (!settings) missing('site.settings', settingsReason ?? 'no site settings were read')
  if (!readFile) missing('site.template', 'no site folder to read the theme files from (--webroot)')
  const siteName = settings?.title ?? null
  const files = Object.fromEntries(LOGO_FILES.map((f) => [f, readFile ? readFile(f) : null]))
  const places = readFile ? logoPlacesOf(files) : []
  const pageOfEntity = (key) => (map?.pages ?? []).find((p) => p.entity === key) ?? null
  absent(
    'site.head.injection',
    'the EmDash content map holds no free HTML entity printed on every page: head markup is not written through a content block'
  )
  absent(
    'site.contactBlocks[].accepts',
    'EmDash has no CMS contact entity: a contact page is a page whose fields the content map names'
  )
  return {
    cms: 'emdash',
    framework: readFile && files['src/components/site/Header.astro'] ? 'astro' : null,
    template,
    errors,
    siteName,
    /** The page behind a map page entity (`pages.<slug>`): `{title, params}`, or null. */
    menuOf(entityKey) {
      const page = pageOfEntity(entityKey)
      return page ? { title: page.title ?? null, params: {} } : null
    },
    /** The labels of the top level of the main menu the pages print (the map's `primary` menu). */
    mainMenuTitles() {
      const menu = (map?.menus ?? []).find((m) => m.name === 'primary') ?? map?.menus?.[0]
      return (menu?.items ?? []).map((i) => i.label).filter(Boolean)
    },
    pageContents: () => null,
    /** A listing page: the map's view says so (`list`). */
    isListing: (mapPage) => mapPage?.view === 'list',
    nameSettings() {
      return siteName == null
        ? []
        : [{ kind: 'setting', scope: 'cms', setting: 'settings.title', value: siteName }]
    },
    /**
     * The logo settings the theme's spots print. A themed spot prints the core logo (`settings.logo`) in the light
     * theme and the chrome entry's `logo_dark` field in the dark one; with no picture it prints the template's own
     * lockup (the slot of `BrandLogo.astro`), never nothing.
     */
    logoSettings() {
      if (!readFile) return []
      const prints = (list) =>
        list.map((p) => ({ where: p.where, layout: p.layout, emptyShows: 'template-text' }))
      return [
        {
          key: 'settings.logo',
          value: mediaOf(settings?.logo),
          prints: prints(places.filter((p) => !p.dark))
        },
        { key: 'chrome.logo_dark', value: '', prints: prints(places) }
      ].filter((s) => s.prints.length)
    },
    /**
     * The brand colours the theme declares in `src/styles/tokens.css`: `--color-accent: var(--ds-c-accent, #d24a24)`
     * is the design system role variable with the theme's own colour as its fallback. The role variable is named with
     * that fallback, as the WordPress adapter names a palette entry; a stylesheet may override it, the measure judges.
     */
    colourVariables: () => brandVariablesOf(readFile ? readFile(TOKENS_FILE) : null),
    /** Empty: a theme's dark appearance is the same pages in another colour scheme, not a page on another style. */
    themeVariantStyles: () => [],
    favicon(icons) {
      return {
        currentFile: icons?.[0]?.href?.split('?')[0] ?? null,
        mechanism: {
          setting: 'settings.favicon',
          value: mediaOf(settings?.favicon) || null,
          fallback: '/favicon.svg'
        }
      }
    },
    head(titles) {
      return {
        injection: { mechanism: null, maxBytes: null, templateCodeSetting: null },
        // The layout joins the page title and the site title itself: changing `settings.title` changes the suffix.
        titleSuffix: { setting: 'settings.title', value: siteName, current: titles },
        og: { supported: null, switch: null, on: null, perPage: null },
        schemaInjection: { mechanism: null, enabled: null }
      }
    },
    cmsStrings: () => ({
      none: 'an EmDash theme prints its fixed words from its own files (src/lib/ui-words.ts, the chrome entry), not from CMS language files the kit can match a line against: the kit measures those words as template words'
    }),
    contactChannels: () => null,
    /** Empty: a map or embed is a field of an entry, which the content map names. */
    mapSettings: () => (readFile ? [] : null),
    /** Empty: a page's background pictures are image fields of its entry, which the content map names. */
    backgroundSettings: () => (readFile ? [] : null),
    /** An EmDash free HTML field is a field of an entry, never an entity of the map. */
    isFreeHtml: () => false
  }
}

/** Whether an EmDash page view exists only to show a feature off: the search results page. */
export function showcaseViewOf(kind) {
  if (/^search\b/.test(String(kind ?? ''))) return 'a search results page: the search box reaches it'
  return null
}
