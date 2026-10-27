/**
 * Which stylesheets of a JA T3 template a page of the languages LANG-2 checks really loads (LANG-2 fonts).
 * T3 loads `css/<name>.css`, swaps in `css/rtl/<name>.css` only on a right-to-left page, and adds
 * `css/themes/<theme>/<name>.css` only for the theme the page's template style sets (`params.theme`);
 * an ACM keeps the same folders under `acm/<acm>/css/`. JA Mood, Sensei, Smallbiz, Resume and
 * Directory ship every colour theme and the rtl copy, which no left-to-right page reads.
 *
 * The themes in use are those of the default site style and of every style a published site menu
 * item opens with. A dump this cannot read leaves every theme counted, as before.
 */
import { readTables, tableEndingWith } from './sql-dump.js'

const RTL = /(^|\/)css\/rtl\//
const THEME = /(^|\/)css\/themes\/([^/]+)\//

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<(name: string) => boolean>} whether a stylesheet of the template is loaded
 */
export async function joomlaLoadedStylesheet(context) {
  if (context.release.platform !== 'joomla') return () => true
  /** @type {Set<string> | null} */
  let themes = null
  try {
    const sql = await context.content.sql()
    const tables = readTables(sql, (n) => n.endsWith('template_styles') || n.endsWith('_menu'))
    const template = String(context.setting.template ?? '')
    const styles = (tableEndingWith(tables, 'template_styles')?.rows ?? []).filter(
      (r) => Number(r.client_id) === 0 && r.template === template
    )
    const opened = new Set(
      (tableEndingWith(tables, '_menu')?.rows ?? [])
        .filter((r) => Number(r.client_id) === 0 && Number(r.published) === 1)
        .map((r) => String(r.template_style_id ?? '0'))
    )
    themes = new Set()
    for (const s of styles) {
      if (Number(s.home) !== 1 && !opened.has(String(s.id))) continue
      try {
        const theme = JSON.parse(s.params || '{}')?.theme
        if (typeof theme === 'string' && theme) themes.add(theme)
      } catch {
        // A style whose params do not parse sets no theme.
      }
    }
    if (!styles.length) themes = null
  } catch {
    themes = null
  }
  return (name) => {
    if (RTL.test(name)) return false
    const m = THEME.exec(name)
    return !m || themes === null || themes.has(m[2])
  }
}
