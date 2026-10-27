/**
 * The SVG pictures a release SHOWS as pictures, with where each is shown from (rule PIC-1):
 *
 * - `img`: an `<img src="….svg">` in the demo content (WordPress posts, templates, patterns and
 *   their meta; Joomla articles, modules, menus, template styles) or in the template's own markup
 *   (`.php`, `.html`, `.astro`, `.tsx`), with the chain of elements around it when the markup gives one;
 * - `field`: an SVG path a content field names without markup around it (a Joomla module's image
 *   field, an Elementor setting), which the template's layout draws;
 * - `css`: a `background`, `list-style`, `content` or `border-image` url of a stylesheet (a file or a
 *   `data:` SVG), with its selector. A `mask` url is not a picture: its colour is the element's
 *   `background-color`, which a worn system sets.
 *
 * Content that no visitor sees is left out: WordPress attachments (their own address), revisions,
 * drafts and trash, a Joomla row that is not published, and history or log tables.
 *
 * The SVG files themselves come from every archive the release carries: the webroot, the WordPress
 * theme zip (as `wp-content/themes/<stylesheet>/…`), the Joomla installer, the EmDash source.
 */
import {
  tarGzFiles,
  zipFiles
} from '../../template-customization-question-readiness/readers/archive-binaries.js'
import { releaseContent } from '../../template-customization-question-readiness/readers/release-content.js'
import { readTables } from '../../template-customization-question-readiness/readers/sql-dump.js'
import { newestThemeZips } from '../newest-theme.js'
import { acmRefs, refsInStylesheet, refsInText } from './icon-refs.js'
import { releaseFiles } from './release-files.js'

/** @typedef {import('./icon-refs.js').IconRef} IconRef */

const HIDDEN_TABLE =
  /_(history|ucm_history|action_logs?|finder_[a-z_]+|session|redirect_links|users|user_keys)$/i
const WP_HIDDEN_TYPES = new Set(['attachment', 'revision', 'customize_changeset', 'oembed_cache'])
const WP_SHOWN_STATUS = new Set(['publish', 'private', 'future'])
const WP_FILE_META = /^_wp_attach(ed_file|ment_metadata|ment_backup_sizes)$/
const MARKUP = /\.(php|html|astro|tsx|jsx)$/i

/**
 * Whether a row of a demo table is content a visitor sees.
 * @param {string} table @param {Record<string, any>} row @param {Set<string>} hiddenPosts
 */
function shown(table, row, hiddenPosts) {
  if (HIDDEN_TABLE.test(table)) return false
  if ('post_type' in row && 'post_status' in row)
    return !WP_HIDDEN_TYPES.has(String(row.post_type)) && WP_SHOWN_STATUS.has(String(row.post_status))
  if ('meta_key' in row && 'post_id' in row)
    return !WP_FILE_META.test(String(row.meta_key)) && !hiddenPosts.has(String(row.post_id))
  if (table.endsWith('_options') && /^_(site_)?transient/.test(String(row.option_name ?? ''))) return false
  for (const k of ['published', 'state'])
    if (k in row && row[k] !== null && String(row[k]) !== '1') return false
  return true
}

/** @type {WeakMap<object, Promise<{ svgs: Map<string, string>, refs: IconRef[], base: string }>>} */
const memo = new WeakMap()

/**
 * The SVG files of the release and every place that shows one.
 * @param {import('../index.js').RuleContext} context
 */
export function iconPictures(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<{ svgs: Map<string, string>, refs: IconRef[], base: string }>} */ (
    memo.get(context)
  )
}

/** @param {import('../index.js').RuleContext} context */
async function read(context) {
  const { platform } = context.release
  const install = context.setting.install ?? {}
  const files = await releaseFiles(context)
  const base =
    platform === 'joomla'
      ? `templates/${context.setting.template}/`
      : platform === 'wordpress'
        ? `wp-content/themes/${files.stylesheet}/`
        : ''
  /** @type {Map<string, string>} */
  const svgs = new Map()
  const keep = (/** @type {Map<string, Buffer>} */ found, /** @type {(n: string) => string} */ name) => {
    for (const [n, b] of found) svgs.set(name(n).replace(/^\.\//, ''), b.toString('utf8'))
  }
  const isSvg = (/** @type {string} */ n) => /\.svg$/i.test(n) && !/(^|\/)node_modules\//.test(n)
  const bytes = async (/** @type {string | undefined} */ f) => (f ? context.source.read(f) : null)
  const webroot = await bytes(install.webroot?.file)
  if (webroot) keep(tarGzFiles(webroot, isSvg), (n) => n)
  const installer = await bytes(install.installer?.file)
  if (installer) keep(zipFiles(installer, isSvg), (n) => n)
  const source = await bytes(install.source?.file)
  if (source) keep(zipFiles(source, isSvg), (n) => n.replace(/^[^/]+\//, ''))
  if (platform === 'wordpress') {
    const zip = newestThemeZips(context.setting, await context.source.names())[0]
    const theme = zip ? await context.source.read(zip) : null
    if (theme)
      keep(
        zipFiles(theme, isSvg),
        (n) => `wp-content/themes/${files.stylesheet}/${n.replace(/^[^/]+\//, '')}`
      )
  }

  /** @type {IconRef[]} */
  const refs = []
  for (const [name, text] of files.files) {
    if (/\.css$/i.test(name)) refs.push(...refsInStylesheet(text, name, base))
    else if (MARKUP.test(name))
      refs.push(...refsInText(text, `${base}${name}`).filter((r) => r.via === 'img'))
    // an EmDash site's content is its seed
    else if (platform === 'emdash' && /(^|\/)seed\/.*\.json$/i.test(name))
      refs.push(...refsInText(text, name))
  }
  if (platform !== 'emdash' && !install.bundle) {
    const tables = readTables(await releaseContent(context.source, context.setting).sql())
    const hiddenPosts = new Set()
    for (const t of tables.values())
      for (const row of t.rows)
        if ('post_type' in row && 'post_status' in row && !shown('', row, new Set()))
          hiddenPosts.add(String(row.ID))
    for (const [table, t] of tables)
      for (const row of t.rows) {
        if (!shown(table, row, hiddenPosts)) continue
        const label =
          row.post_name || row.alias || row.title || row.option_name || row.meta_key || row.ID || row.id
        for (const [column, value] of Object.entries(row))
          if (typeof value === 'string' && /\.svg/i.test(value)) {
            const from = `${table}.${column}${label ? ` (${label})` : ''}`
            refs.push(...(acmRefs(value, files.files, from) ?? refsInText(value, from)))
          }
      }
  }
  return { svgs, refs, base }
}

/**
 * The file of the release a reference names: the path itself, else the one file ending with it.
 * @param {Map<string, string>} svgs @param {string} ref
 */
export function svgOf(svgs, ref) {
  if (svgs.has(ref)) return { file: ref, text: /** @type {string} */ (svgs.get(ref)) }
  const tail = `/${ref}`
  for (const [file, text] of svgs) if (file.endsWith(tail)) return { file, text }
  return null
}
