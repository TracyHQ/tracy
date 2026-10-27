/**
 * Where a Joomla template shows a logo, read from its own files, for the four logo rules (REL-3,
 * LOGO-1, LOGO-2, LOGO-3): one search, four readings. WordPress and EmDash have their own readers
 * (`wordpress-logo-places.js`, `emdash-logo-places.js`).
 *
 * - T4: every site profile `etc/site/<name>.json` and its logo keys (`site_logo`,
 *   `site_logo_small`, `site_logo_dark`, `site_logo_dark_small`, `site_logo_2`), and whether dark
 *   mode is on (`other_darkmode`).
 * - T3: every site template style of the template, from the demo database (`logotype`,
 *   `logoimage`, `logoimage_dark`, its title).
 */
import { readTables, tableEndingWith } from './sql-dump.js'
import { templateSource } from './template-source.js'

/** The T4 profile keys that hold a logo picture. */
export const T4_LOGO_KEYS = [
  'site_logo',
  'site_logo_small',
  'site_logo_dark',
  'site_logo_dark_small',
  'site_logo_2'
]
/** The T4 keys whose picture always shows on a dark background (`brand-joomla-places.js` `DARK_KEYS`). */
export const T4_DARK_KEYS = new Set(['site_logo_dark', 'site_logo_dark_small', 'site_logo_2'])

const on = (/** @type {unknown} */ v) => v === true || v === 1 || v === '1' || v === 'true'

/**
 * @typedef {{ name: string, keys: Record<string, string>, darkMode: boolean }} T4Profile
 * @typedef {{ id: string, title: string, home: boolean, params: Record<string, any> }} T3Style
 */

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ framework: 't4' | 't3' | null, t4: T4Profile[], t3: T3Style[], files: Map<string, Buffer> }>}
 */
export async function joomlaLogoPlaces(context) {
  const { files } = await templateSource(context).read()
  /** @type {T4Profile[]} */
  const t4 = []
  for (const [path, bytes] of files) {
    const m = /^etc\/site\/([^/]+)\.json$/.exec(path)
    if (!m) continue
    let data = {}
    try {
      data = JSON.parse(bytes.toString('utf8')) ?? {}
    } catch {
      continue
    }
    /** @type {Record<string, string>} */
    const keys = {}
    for (const k of T4_LOGO_KEYS) if (k in data) keys[k] = String(data[k] ?? '')
    t4.push({ name: m[1], keys, darkMode: on(data.other_darkmode) })
  }
  /** @type {T3Style[]} */
  const t3 = []
  if (t4.length === 0) {
    const t = String(context.setting.template ?? '')
    const tables = readTables(await context.content.sql(), (n) => n.endsWith('template_styles'))
    for (const r of tableEndingWith(tables, 'template_styles')?.rows ?? []) {
      if (Number(r.client_id) !== 0 || r.template !== t) continue
      let params = {}
      try {
        params = JSON.parse(r.params || '{}') ?? {}
      } catch {
        params = {}
      }
      t3.push({ id: String(r.id), title: String(r.title ?? ''), home: Number(r.home) === 1, params })
    }
  }
  const framework = t4.length
    ? 't4'
    : t3.some((s) => 'logotype' in s.params || 'logoimage' in s.params)
      ? 't3'
      : null
  return { framework, t4, t3, files }
}

/** A T4 profile's logo keys that hold a picture. */
export const filledKeys = (/** @type {T4Profile} */ p) =>
  Object.entries(p.keys).filter(([, v]) => v.trim() !== '')
