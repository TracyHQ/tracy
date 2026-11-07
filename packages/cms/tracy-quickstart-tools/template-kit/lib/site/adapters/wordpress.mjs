// The WordPress adapter of the site part of the kit, the same shape as the Joomla adapter (joomla.mjs): where a block
// theme keeps the site name, the logo, the favicon, the main menu and its pages, read from the site's own database
// (SELECT only) and theme files, never written. Its table prefix is read, never assumed (`tr_options` as well as
// `wp_options`). Where WordPress has no equivalent of a Joomla field, the method answers empty and the reason goes to
// `errors` (`kind: 'not-on-platform'`), so the kit never invents one.

/** The prefix of the WordPress tables (`tr_` in `tr_options`): the shortest one with both options and posts. */
export function wpPrefixOf(tables) {
  const has = new Set(tables)
  const hits = tables
    .map((t) => /^(\w*?_)options$/.exec(t)?.[1])
    .filter((p) => p && has.has(`${p}posts`) && has.has(`${p}postmeta`))
  return hits.sort((a, b) => a.length - b.length)[0] ?? null
}

/** The options the adapter reads (never a key, a salt or a password). */
const OPTIONS = [
  'blogname',
  'blogdescription',
  'stylesheet',
  'template',
  'site_logo',
  'site_icon',
  'page_on_front',
  'page_for_posts',
  'show_on_front'
]

/** The `ref` of the first navigation block in a template part's markup, or null. */
export const navigationRefOf = (markup) =>
  /<!-- wp:navigation \{[^}]*?"ref":(\d+)/.exec(String(markup ?? ''))?.[1] ?? null

/** The labels of a navigation post's top-level links and submenus, in order. */
export function topLevelLabels(markup) {
  const labels = []
  let depth = 0
  for (const m of String(markup ?? '').matchAll(/<!-- (\/?)wp:([a-z-]+)(\s+\{.*?\})?\s*(\/?)-->/g)) {
    const [, close, name, attrs, self] = m
    if (close) {
      depth--
      continue
    }
    if (depth === 0 && /^navigation-(link|submenu)$/.test(name)) {
      const label = /"label":"((?:[^"\\]|\\.)*)"/.exec(attrs ?? '')?.[1]
      if (label) labels.push(JSON.parse(`"${label}"`))
    }
    if (!self) depth++
  }
  return labels
}

/** The palette slugs a block theme names its brand colours with (`accent`, `primary`), never a hover or a status. */
const BRAND_SLUG = {
  primary: /^(?:primary|brand|accent)(?:-colou?r)?$/i,
  secondary: /^secondary(?:-colou?r)?$/i
}

/**
 * One theme.json palette entry as a colour variable, or none when it states no colour of its own. An entry whose slug
 * names the brand says so (`names: 'primary'`): theme.json is where a block theme declares its accent, so the colour
 * measure keeps it a brand colour when a status rule of the stylesheets reuses it (a search badge painted with it).
 */
export function paletteVariableOf(entry, declaredIn) {
  const colour = String(entry?.color ?? '').trim()
  const slug = String(entry?.slug ?? '')
  const names = Object.keys(BRAND_SLUG).find((k) => BRAND_SLUG[k].test(slug))
  const named = names ? { names } : {}
  const viaVar = /^var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-f]{3,8})\s*\)$/i.exec(colour)
  if (viaVar) return [{ name: viaVar[1], value: viaVar[2].toLowerCase(), declaredIn, ...named }]
  if (/^#[0-9a-f]{3,8}$/i.test(colour) && slug)
    return [{ name: `--wp--preset--color--${slug}`, value: colour.toLowerCase(), declaredIn, ...named }]
  return []
}

const sqlText = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** @param {{query: Function|null, queryMany?: Function|null, readFile: Function|null}} source */
export function wordpressAdapter(source) {
  const errors = []
  const missing = (field, reason) => errors.push({ kind: 'missing', field, reason })
  const absent = (field, reason) => errors.push({ kind: 'not-on-platform', field, reason })
  const { query, readFile } = source
  const many = source.queryMany ?? ((qs) => qs.map(query))
  const state = { prefix: null, options: {}, pages: [], parts: new Map(), navigations: new Map() }
  if (query) {
    state.prefix = wpPrefixOf(query('SHOW TABLES').map((r) => Object.values(r)[0]))
    const p = state.prefix
    if (!p) missing('site', 'the database holds no WordPress options and posts tables')
    else {
      const [options, pages, parts, navs] = many([
        `SELECT option_name, option_value FROM ${p}options WHERE option_name IN (${OPTIONS.map(sqlText).join(', ')})`,
        `SELECT ID, post_name, post_title, post_parent FROM ${p}posts WHERE post_type = 'page' AND post_status = 'publish'`,
        `SELECT post_name, post_content FROM ${p}posts WHERE post_type = 'wp_template_part' AND post_status = 'publish'`,
        `SELECT ID, post_title, post_content FROM ${p}posts WHERE post_type = 'wp_navigation' AND post_status = 'publish'`
      ])
      state.options = Object.fromEntries(options.map((r) => [r.option_name, r.option_value]))
      state.pages = pages
      for (const r of parts) state.parts.set(r.post_name, r.post_content)
      for (const r of navs) state.navigations.set(String(r.ID), r)
    }
  } else missing('site', 'no database to read the options, pages and navigation from (--db or --db-command)')
  const theme = state.options.stylesheet ?? null
  const themeFile = (rel) => (theme && readFile ? readFile(`wp-content/themes/${theme}/${rel}`) : null)
  // A template part edited in the Site Editor lives in the database and wins over the theme's file.
  const partOf = (slug) => state.parts.get(slug) ?? themeFile(`parts/${slug}.html`)
  const themeJson = (() => {
    try {
      return JSON.parse(themeFile('theme.json') ?? 'null')
    } catch {
      return null
    }
  })()
  if (!readFile) missing('site.template', 'no web root to read the theme files from (--webroot)')
  const pageOfEntity = (key) => {
    const slug = /^page-(.+)$/.exec(key ?? '')?.[1]
    return slug ? (state.pages.find((r) => r.post_name === slug) ?? null) : null
  }
  const siteName = state.options.blogname ?? null
  const attachedFile = (id) => {
    if (!query || !state.prefix || !/^\d+$/.test(String(id ?? '')) || Number(id) === 0) return null
    const r = query(
      `SELECT meta_value FROM ${state.prefix}postmeta WHERE post_id = ${Number(id)} AND meta_key = '_wp_attached_file'`
    )[0]
    return r?.meta_value ? `wp-content/uploads/${r.meta_value}` : null
  }
  absent(
    'site.head.injection',
    'WordPress has no free HTML block printed on every page: head markup is written by the Claude Cowork plugin, not through a content block'
  )
  absent(
    'site.contactBlocks[].accepts',
    'WordPress has no CMS contact entity: a contact page is a page whose blocks the content map names'
  )
  return {
    cms: 'wordpress',
    framework: themeJson ? 'block-theme' : null,
    template: theme,
    errors,
    siteName,
    /** The page behind a map page entity (`page-<slug>`): `{title, params}`, or null. */
    menuOf(entityKey) {
      const page = pageOfEntity(entityKey)
      return page ? { title: page.post_title, params: {} } : null
    },
    /** The top-level labels of the navigation the header template part prints. */
    mainMenuTitles() {
      const ref = navigationRefOf(partOf('header'))
      return topLevelLabels(state.navigations.get(String(ref))?.post_content)
    },
    /** The post content of every published page, by post id (its sections are the kit's blocks). */
    pageContents() {
      if (!query || !state.prefix) return null
      const rows = query(
        `SELECT ID, post_content FROM ${state.prefix}posts WHERE post_type = 'page' AND post_status = 'publish'`
      )
      return Object.fromEntries(rows.map((r) => [String(r.ID), r.post_content ?? '']))
    },
    /** Whether a map page lists posts: the posts page, or a page whose content holds a query loop. */
    isListing(mapPage) {
      const id = String(mapPage?.postId ?? '')
      if (!id) return false
      if (id === String(state.options.page_for_posts ?? '')) return true
      if (!query || !state.prefix) return false
      const r = query(`SELECT post_content FROM ${state.prefix}posts WHERE ID = ${Number(id)}`)[0]
      return /<!-- wp:query\b/.test(r?.post_content ?? '')
    },
    nameSettings() {
      return siteName == null
        ? []
        : [{ kind: 'setting', scope: 'cms', setting: 'option blogname', value: siteName }]
    },
    /** The site logo option every `core/site-logo` block prints, with the template parts that print it. */
    logoSettings() {
      const prints = ['header', 'footer']
        .filter((slug) => /<!-- wp:site-logo\b/.test(partOf(slug) ?? ''))
        .map((where) => ({ where, layout: `parts/${where}`, emptyShows: 'nothing' }))
      if (!prints.length) return []
      return [{ key: 'site_logo', value: attachedFile(state.options.site_logo) ?? '', prints }]
    },
    /**
     * The colours a block theme's theme.json palette declares (`settings.color.palette`): the variable a palette entry
     * reads (`var(--ds-c-accent, #c36349)`) with its stated fallback, or the preset variable WordPress prints for a
     * plain colour (`--wp--preset--color--<slug>`). A stylesheet may override them; the measure judges that.
     */
    colourVariables() {
      const declaredIn = `wp-content/themes/${theme}/theme.json`
      return (themeJson?.settings?.color?.palette ?? []).flatMap((p) => paletteVariableOf(p, declaredIn))
    },
    /** Empty: a block theme's style variations are not pages, so no page paints another colour theme by style. */
    themeVariantStyles: () => [],
    favicon(icons) {
      return {
        currentFile: icons?.[0]?.href?.split('?')[0] ?? null,
        mechanism: {
          setting: 'option site_icon',
          value: attachedFile(state.options.site_icon),
          fallback: null
        }
      }
    },
    head(titles) {
      return {
        injection: { mechanism: null, maxBytes: null, templateCodeSetting: null },
        // WordPress core joins the page title and the site name itself: there is no setting to read or write.
        titleSuffix: { setting: null, value: null, current: titles },
        og: { supported: null, switch: null, on: null, perPage: null },
        schemaInjection: { mechanism: null, enabled: null }
      }
    },
    /**
     * WordPress prints its fixed sentences from gettext catalogues compiled into `.mo` files (none at all for a site
     * in the source language), not from language files a line can be matched against: named, not read.
     */
    cmsStrings: () => ({
      none: 'WordPress prints its fixed sentences from gettext catalogues (.mo), not from language files the kit can match a line against'
    }),
    contactChannels: () => null,
    /** Empty: a WordPress map shortcode or embed is a block of the post content, which the content map names. */
    mapSettings: () => (query ? [] : null),
    /** Empty: a block theme paints its backgrounds from theme.json and stylesheets, not from a site setting. */
    backgroundSettings: () => (query && readFile ? [] : null),
    /** A WordPress free HTML block is a `core/html` block inside a page, never an entity of the map. */
    isFreeHtml: () => false
  }
}

/** Whether a WordPress page view exists only to show a CMS feature off: the search results page. */
export function showcaseViewOf(kind) {
  if (/^search\b/.test(String(kind ?? ''))) return 'a search results page: the search box reaches it'
  return null
}
