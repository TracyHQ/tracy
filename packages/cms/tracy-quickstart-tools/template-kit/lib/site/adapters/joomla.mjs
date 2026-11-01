// The Joomla adapter of the site part of the kit: where Joomla and its template framework keep the site name, the
// logo, the favicon, the head and the title suffix, read from the site's own files and database (read-only, never
// written). Everything it returns is in CMS-neutral words; the Joomla names only appear as the `setting` a later step
// writes. Another CMS gets an adapter of the same shape.
import { languageFilesOf } from '../cms-strings.mjs'
import { emptyShowsOf, logoLayouts, t4PrintsOpenGraph, t4Settings, variableOf } from './joomla-t4.mjs'

/** The most bytes Joomla stores in one module's content (`Table\Module::check`). */
export const FREE_HTML_MAX_BYTES = 65535
const TITLE_SUFFIX = { 0: 'none', 1: 'before', 2: 'after' }

/** Selected keys of `configuration.php` (only these are ever read: never a password or a secret). */
export function readConfig(php, keys = ['sitename', 'sitename_pagetitles', 'MetaDesc', 'offline']) {
  const out = {}
  for (const k of keys) {
    const m = new RegExp(
      `public\\s+\\$${k}\\s*=\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"([^"]*)"|([\\w.-]+))\\s*;`
    ).exec(php ?? '')
    if (m) out[k] = m[1] !== undefined ? m[1].replace(/\\'/g, "'") : (m[2] ?? m[3])
  }
  return out
}

/** The prefix of the Joomla tables (`jos_` in `jos_extensions`). */
export function prefixOf(tables) {
  const hits = tables.map((t) => /^(\w+?_)extensions$/.exec(t)?.[1]).filter(Boolean)
  return hits.sort((a, b) => a.length - b.length)[0] ?? null
}

/** @param {{query: Function|null, readFile: Function|null}} source */
export function joomlaAdapter(source) {
  const errors = []
  const missing = (field, reason) => errors.push({ kind: 'missing', field, reason })
  const { query, readFile } = source
  const state = {
    config: {},
    template: null,
    site: null,
    global: null,
    prefix: null,
    menus: [],
    language: null
  }
  if (readFile) state.config = readConfig(readFile('configuration.php'))
  else missing('site.nameSlots', 'no web root to read the CMS settings from (--webroot)')
  if (query) {
    state.prefix = prefixOf(query('SHOW TABLES').map((r) => Object.values(r)[0]))
    const p = state.prefix
    const style = query(
      `SELECT template, params FROM ${p}template_styles WHERE client_id = 0 AND home = '1'`
    )[0]
    state.template = style?.template ?? null
    state.menus = query(
      `SELECT id, title, link, menutype, home, params FROM ${p}menu WHERE client_id = 0 AND published = 1 AND link <> ''`
    ).map((r) => ({ ...r, params: safeJson(r.params) }))
    state.schemaPlugin = query(
      `SELECT enabled FROM ${p}extensions WHERE type = 'plugin' AND folder = 'system' AND element = 'schemaorg'`
    )[0]
    const langParams = query(
      `SELECT params FROM ${p}extensions WHERE type = 'component' AND element = 'com_languages'`
    )[0]?.params
    state.language = safeJson(langParams).site ?? null
  } else missing('site', 'no database to read the template and menus from (--db or --db-command)')
  const t4 = state.template && readFile ? t4Settings(readFile, state.template, 'site') : null
  if (t4) {
    state.site = t4
    state.global = t4Settings(readFile, state.template, 'global')
  }
  const siteName = state.config.sitename ?? null
  return {
    cms: 'joomla',
    framework: t4 ? 't4' : null,
    template: state.template,
    errors,
    siteName,
    /** The menu entry behind a map page entity (`menuItem-N`): `{title, params}`, or null. */
    menuOf(entityKey) {
      const id = /^menuItem-(\d+)$/.exec(entityKey ?? '')?.[1]
      return state.menus.find((m) => String(m.id) === id) ?? null
    },
    /** The titles of the main menu (the menu holding the home entry). */
    mainMenuTitles() {
      const home = state.menus.find((m) => m.home === '1')
      return state.menus.filter((m) => home && m.menutype === home.menutype).map((m) => m.title)
    },
    /** Whether a map page lists items (a category or featured listing). */
    isListing: (mapPage) => /[?&]view=(?:category|featured)\b/.test(mapPage?.link ?? ''),
    nameSettings() {
      const out = []
      if (siteName != null)
        out.push({ kind: 'setting', scope: 'cms', setting: 'global configuration sitename', value: siteName })
      if (t4)
        out.push({
          kind: 'setting',
          scope: 'template',
          setting: `template site setting site_name (${t4.file})`,
          value: t4.values.site_name ?? '',
          whenEmpty: 'prints the CMS site name'
        })
      return out
    },
    /** The template-level logo settings: `{key, value, file, prints: [{where, emptyShows}]}`. */
    logoSettings() {
      if (!t4) return []
      const layouts = logoLayouts(readFile, state.template)
      return Object.entries(t4.values)
        .filter(([k]) => k.startsWith('site_logo'))
        .map(([key, value]) => ({
          key,
          value: String(value ?? '').split('#')[0],
          prints: layouts.map((l) => {
            const v = variableOf(l.php, key)
            return { where: l.where, layout: l.file, emptyShows: v ? emptyShowsOf(l.php, v) : null }
          })
        }))
    },
    favicon(icons) {
      const set = t4?.values.other_faviconFile ?? null
      const own = state.template && readFile ? readFile(`templates/${state.template}/favicon.ico`) : null
      return {
        currentFile: icons?.[0]?.href?.split('?')[0] ?? null,
        mechanism: {
          setting: t4 ? 'template site setting other_faviconFile' : null,
          value: set || null,
          fallback: own !== null ? `favicon.ico in the template folder (templates/${state.template})` : null
        }
      }
    },
    head(titles) {
      const suffix = state.config.sitename_pagetitles ?? (readFile ? '0' : null)
      const g = state.global?.values ?? {}
      return {
        injection: {
          mechanism: 'free-html-block-on-every-page',
          maxBytes: FREE_HTML_MAX_BYTES,
          templateCodeSetting: t4
            ? 'template global setting system_advancedCodeBeforeHead (a file, not written)'
            : null
        },
        titleSuffix: {
          setting: 'global configuration sitename_pagetitles',
          value: suffix === null ? null : (TITLE_SUFFIX[suffix] ?? suffix),
          current: titles
        },
        og: {
          supported: t4 && readFile ? t4PrintsOpenGraph(readFile) : null,
          switch: t4 ? 'template global setting system_opengraph' : null,
          on: t4 ? Boolean(Number(g.system_opengraph ?? 0)) : null,
          perPage: t4 ? 'menu entry setting og_title' : null
        },
        schemaInjection: state.schemaPlugin
          ? { mechanism: 'cms schema plugin (system schemaorg)', enabled: state.schemaPlugin.enabled === '1' }
          : { mechanism: 'free-html-block-on-every-page', enabled: null }
      }
    },
    /**
     * The language files the site prints its fixed sentences from, read in one call, and the override file a
     * measurement may write: `{tag, files: [{file, text}], override: {file, setting}}`, or null without files.
     */
    cmsStrings() {
      if (!source.listDir || !source.readMany) return null
      const tag = state.language ?? 'en-GB'
      const rels = languageFilesOf({ listDir: source.listDir, tag, template: state.template })
      return {
        tag,
        files: source.readMany(rels).filter((f) => f.text),
        override: { file: `language/overrides/${tag}.override.ini`, setting: 'cms language override' }
      }
    },
    /** Map entities that are free HTML blocks (no slots but their HTML). */
    isFreeHtml: (entity) => entity?.kind === 'module' && entity.identity?.module === 'mod_custom'
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
