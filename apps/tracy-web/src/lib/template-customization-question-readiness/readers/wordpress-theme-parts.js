/**
 * The block markup a WordPress visitor is served, per template part and per template: the copy in
 * the demo database (`wp_template_part` / `wp_template`, published) where the demo edited it, else
 * the theme's own `parts/<slug>.html` / `templates/<slug>.html`. The database copy wins, as it does
 * in WordPress. Read for the logo rules (where a Site Logo sits) and NAME-3 (the © line).
 *
 * Also the demo's options a brand rule reads (`blogname`, `stylesheet`, `site_logo`,
 * `tracy_logo_dark`, `site_icon`, `active_plugins`).
 */
import { readTables, tableEndingWith } from './sql-dump.js'
import { templateSource } from './template-source.js'

/** @type {WeakMap<object, Promise<any>>} */
const MEMO = new WeakMap()

/**
 * @typedef {{ slug: string, kind: 'part' | 'template', from: 'database' | 'theme', content: string }} ServedMarkup
 */

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ markup: ServedMarkup[], options: Record<string, string>, themeRead: boolean }>}
 */
export function wordpressServedMarkup(context) {
  let found = MEMO.get(context.content)
  if (!found) {
    found = read(context)
    MEMO.set(context.content, found)
  }
  return found
}

const WANTED_OPTIONS = [
  'blogname',
  'stylesheet',
  'site_logo',
  'tracy_logo_dark',
  'site_icon',
  'active_plugins'
]

/** @param {import('../index.js').RuleContext} context */
async function read(context) {
  const tables = readTables(await context.content.sql(), (n) => /(posts|options)$/.test(n))
  const posts = tableEndingWith(tables, 'posts')?.rows ?? []
  /** @type {Record<string, string>} */
  const options = {}
  for (const o of tableEndingWith(tables, 'options')?.rows ?? [])
    if (WANTED_OPTIONS.includes(o.option_name)) options[o.option_name] = String(o.option_value ?? '')

  /** @type {Map<string, ServedMarkup>} */
  const served = new Map()
  let themeRead = false
  try {
    const theme = await templateSource(context).texts((n) => /^(parts|templates)\/[^/]+\.html$/.test(n))
    themeRead = true
    for (const [path, content] of theme) {
      const [folder, file] = path.split('/')
      const kind = folder === 'parts' ? 'part' : 'template'
      const slug = file.replace(/\.html$/, '')
      served.set(`${kind}:${slug}`, { slug, kind, from: 'theme', content })
    }
  } catch {
    // No theme files to read: the database copies are all there is.
  }
  for (const p of posts) {
    if (p.post_status !== 'publish') continue
    const kind =
      p.post_type === 'wp_template_part' ? 'part' : p.post_type === 'wp_template' ? 'template' : null
    if (!kind) continue
    const slug = String(p.post_name)
    served.set(`${kind}:${slug}`, { slug, kind, from: 'database', content: String(p.post_content ?? '') })
  }
  return { markup: [...served.values()], options, themeRead }
}
