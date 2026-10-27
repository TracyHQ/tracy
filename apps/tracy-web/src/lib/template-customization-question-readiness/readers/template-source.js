/**
 * The template's own files inside a release, for the rules that read its code (layouts, CSS, theme
 * PHP, EmDash `src/`), read once per check and shared by every rule that asks:
 *
 * - Joomla: `templates/<template>/**` (and `media/templates/site/<template>/**`) out of the
 *   `webroot` tar.gz or the `installer` zip, keyed by path INSIDE the template folder
 *   (`index.php`, `etc/site/default.json`; the media copy as `media/<path>`).
 * - WordPress: the active theme, out of the theme zip the release attaches (`wp-<theme>-<version>.zip`)
 *   or else `wp-content/themes/<stylesheet>/` of the webroot, keyed by path inside the theme.
 * - EmDash: the project of the `source` zip, keyed by path from its root (`src/layouts/Base.astro`).
 *
 * `webrootFiles(paths)` reads other files of a Joomla or WordPress webroot by their path from the
 * site root (a demo logo under `images/`). Bytes, not text: a rule may read a picture. A release
 * that carries none of these throws `UnreadableContent` (`live-only` for an Akeeba bundle).
 */
import { readTables, tableEndingWith } from './sql-dump.js'
import { UnreadableContent } from './release-content.js'
import { tarGzFiles, zipFiles } from './archive-binaries.js'
import { themeZipsOfSetting } from './theme-zips.js'

/** @type {WeakMap<object, ReturnType<typeof make>>} one reader per check, keyed by its content reader */
const MEMO = new WeakMap()

/**
 * @param {import('../index.js').RuleContext} context
 */
export function templateSource(context) {
  let reader = MEMO.get(context.content)
  if (!reader) {
    reader = make(context)
    MEMO.set(context.content, reader)
  }
  return reader
}

const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** @param {import('../index.js').RuleContext} context */
function make(context) {
  const { platform } = context.release
  const install = context.setting.install ?? {}
  /** @type {Map<string, Promise<any>>} */
  const memo = new Map()
  const once = (/** @type {string} */ key, /** @type {() => Promise<any>} */ build) => {
    if (!memo.has(key)) memo.set(key, build())
    return memo.get(key)
  }
  const asset = async (/** @type {string} */ part) => {
    const file = install[part]?.file
    const bytes = file ? await context.source.read(file) : null
    return bytes ? { file, bytes } : null
  }
  /** The site archive: `{ file, bytes, kind }`, or a throw saying why there is none. */
  const siteArchive = () =>
    once('archive', async () => {
      const webroot = await asset('webroot')
      if (webroot) return { ...webroot, kind: 'tar' }
      const installer = await asset('installer')
      if (installer) return { ...installer, kind: 'zip' }
      if (install.bundle)
        throw new UnreadableContent(
          'an Akeeba bundle cannot be read without restoring it: check it on a restored site',
          'live-only'
        )
      throw new UnreadableContent('the release carries no webroot or installer this check can read')
    })
  const pick = (
    /** @type {{ bytes: Buffer, kind: string }} */ a,
    /** @type {(n: string) => boolean} */ test
  ) => (a.kind === 'tar' ? tarGzFiles(a.bytes, test) : zipFiles(a.bytes, test))

  /** Joomla: the template folder, keyed inside it. */
  const joomla = async () => {
    const t = String(context.setting.template ?? '')
    if (!t) throw new UnreadableContent('tracy_setting.json names no template')
    const archive = await siteArchive()
    const own = new RegExp(`^(.*?)(media/templates/site/|templates/)${escapeRe(t)}/(.+)$`)
    const out = new Map()
    let root = null
    for (const [name, bytes] of pick(archive, (n) => own.test(n) && !/(^|\/)administrator\//.test(n))) {
      const m = /** @type {RegExpExecArray} */ (own.exec(name))
      root ??= m[1]
      out.set(m[2] === 'templates/' ? m[3] : `media/${m[3]}`, bytes)
    }
    if (out.size === 0) throw new UnreadableContent(`${archive.file} has no templates/${t}/ inside`)
    return { files: out, where: archive.file, root: root ?? '' }
  }

  /** WordPress: the active theme, keyed inside it. */
  const wordpress = async () => {
    // A release may keep every theme zip it ever attached (JA Kinetic: seven), and a theme zip
    // carries the theme's version, not the release's: the one order every reader and the server's
    // download share (`theme-zips.js`). A zip without a theme style.css is passed over.
    const zips = themeZipsOfSetting(context.setting, await context.source.names())
    for (const zip of zips) {
      // eslint-disable-next-line no-await-in-loop -- one theme zip per release.
      const bytes = await context.source.read(zip)
      const all = bytes ? zipFiles(bytes, () => true) : new Map()
      const style = [...all.keys()].find((n) => /^[^/]+\/style\.css$/.test(n))
      if (!style) continue
      const top = style.slice(0, style.indexOf('/') + 1)
      const files = new Map(
        [...all].filter(([n]) => n.startsWith(top)).map(([n, b]) => [n.slice(top.length), b])
      )
      return { files, where: zip, root: null }
    }
    const archive = await asset('webroot')
    if (!archive) throw new UnreadableContent('the release carries no theme zip and no webroot')
    const tables = readTables(await context.content.sql(), (n) => n.endsWith('options'))
    const options = tableEndingWith(tables, 'options')?.rows ?? []
    const stylesheet = options.find((o) => o.option_name === 'stylesheet')?.option_value
    if (!stylesheet)
      throw new UnreadableContent('the demo database names no active theme (option stylesheet)')
    const own = new RegExp(`^(.*?)wp-content/themes/${escapeRe(String(stylesheet))}/(.+)$`)
    const files = new Map()
    let root = null
    for (const [name, bytes] of tarGzFiles(archive.bytes, (n) => own.test(n))) {
      const m = /** @type {RegExpExecArray} */ (own.exec(name))
      root ??= m[1]
      files.set(m[2], bytes)
    }
    if (files.size === 0)
      throw new UnreadableContent(`${archive.file} has no wp-content/themes/${stylesheet}/`)
    return { files, where: archive.file, root: root ?? '' }
  }

  /** EmDash: the project of the source zip, keyed from its root. */
  const emdash = async () => {
    const source = await asset('source')
    if (!source)
      throw new UnreadableContent(`the release does not carry ${install.source?.file ?? 'a source zip'}`)
    const all = zipFiles(source.bytes, () => true)
    // The project root is the shallowest folder holding src/ or seed/.
    const roots = [...all.keys()]
      .map((n) => /^(.*?)(?:src|seed)\//.exec(n)?.[1])
      .filter((r) => r !== undefined)
      .sort((a, b) => a.length - b.length)
    const top = roots[0] ?? ''
    const files = new Map(
      [...all].filter(([n]) => n.startsWith(top)).map(([n, b]) => [n.slice(top.length), b])
    )
    return { files, where: source.file, root: null }
  }

  const read = () =>
    once('template', () =>
      platform === 'joomla' ? joomla() : platform === 'wordpress' ? wordpress() : emdash()
    )

  return {
    /** @returns {Promise<{ files: Map<string, Buffer>, where: string }>} */
    read,
    /** The template's files whose path passes `test`, as text. */
    async texts(/** @type {(path: string) => boolean} */ test) {
      const { files } = await read()
      return new Map([...files].filter(([n]) => test(n)).map(([n, b]) => [n, b.toString('utf8')]))
    },
    /**
     * Other files of the webroot, by path from the site root; absent ones are left out.
     * @param {string[]} paths
     * @returns {Promise<Map<string, Buffer>>}
     */
    async webrootFiles(paths) {
      const { root } = await read()
      if (root === null || paths.length === 0) return new Map()
      return once(`webroot:${paths.join('\n')}`, async () => {
        const wanted = new Set(paths.map((p) => `${root}${p.replace(/^\/+/, '')}`))
        const found = pick(await siteArchive(), (n) => wanted.has(n))
        return new Map([...found].map(([n, b]) => [n.slice(root.length), b]))
      })
    }
  }
}
