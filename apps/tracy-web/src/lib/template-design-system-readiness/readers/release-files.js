/**
 * The files of a release the Template Design System Readiness check reads: the template's own
 * stylesheets and the few text files that say how it wears the design-system slot, keyed by their
 * path INSIDE the template (`css/template.css`, `assets/css/wp-ja-essence.css`, `src/lib/ds-slot.ts`).
 *
 * - Joomla: `templates/<template>/` from the `installer` zip, else the `webroot` tar.gz.
 * - WordPress: the newest theme zip the release attaches (`newestThemeZips`: the theme running sites
 *   update to, not the order the Customize your site readers open them in), its top folder being the
 *   theme's stylesheet; else the theme folder in the webroot. The theme's `Version` header is what the Design system door compares (`minVersion`
 *   of a WordPress contract is keyed by stylesheet), so it is read here too.
 * - EmDash: the packed source (`install.source`), one leading folder stripped, build output and
 *   `node_modules` left out.
 *
 * Text kinds only. What cannot be read throws `UnreadableContent` (shared with the Customize your
 * site check): an Akeeba bundle is `live-only`, a release with no archive holding the template fails.
 */
import { tarGzTexts, zipTexts } from '../../template-customization-question-readiness/readers/archives.js'
import { UnreadableContent } from '../../template-customization-question-readiness/readers/release-content.js'
import { newestThemeZips } from '../newest-theme.js'

/** Text kinds a rule reads; macOS resource forks (`._x.css`) are not files of the template. */
const TEXT = /^(?!(.*\/)?\._).*\.(css|json|xml|php|html|ts|tsx|astro|mjs|js)$/i
const EMDASH_SKIP = /(^|\/)(node_modules|dist|\.astro|\.git|media|public\/_astro)\//

/**
 * @typedef {{ files: Map<string, string>, stylesheet: string | null, themeVersion: string | null }} ReleaseFiles
 */

/** @type {WeakMap<object, Promise<ReleaseFiles>>} */
const memo = new WeakMap()

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<ReleaseFiles>}
 */
export function releaseFiles(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<ReleaseFiles>} */ (memo.get(context))
}

/** The stylesheets among the files, as [path, text]. */
export const stylesheetsOf = (/** @type {ReleaseFiles} */ r) =>
  [...r.files].filter(([name]) => /\.css$/i.test(name))

/**
 * Keep the files under `root`, keyed by the rest of their path.
 * @param {Map<string, string>} files @param {string} root
 */
function under(files, root) {
  const out = new Map()
  for (const [name, text] of files) {
    const at = name.indexOf(root)
    if (at === 0 || (at > 0 && name[at - 1] === '/')) out.set(name.slice(at + root.length), text)
  }
  return out
}

/** The `Version:` header of a WordPress theme's `style.css`, or null. */
export const themeVersionOf = (/** @type {string | undefined} */ styleCss) =>
  /^[ \t/*]*Version:\s*([0-9][0-9A-Za-z.+-]*)/m.exec(styleCss ?? '')?.[1] ?? null

/** @param {import('../index.js').RuleContext} context @returns {Promise<ReleaseFiles>} */
async function read(context) {
  const { platform } = context.release
  const install = context.setting.install ?? {}
  if (install.bundle)
    throw new UnreadableContent(
      'the release ships an Akeeba bundle, which is read on a built site',
      'live-only'
    )
  const bytesOf = async (/** @type {string | undefined} */ file) => (file ? context.source.read(file) : null)

  if (platform === 'emdash') {
    const zip = await bytesOf(install.source?.file)
    if (!zip) throw new UnreadableContent('the release carries no source zip (install.source)')
    const files = zipTexts(zip, (n) => TEXT.test(n) && !EMDASH_SKIP.test(n))
    const marker = [...files.keys()].map((n) => /^(.*?)(?:seed|src)\//.exec(n)).find(Boolean)
    const cut = marker ? marker[1] : ''
    return {
      files: new Map([...files].map(([n, t]) => [cut && n.startsWith(cut) ? n.slice(cut.length) : n, t])),
      stylesheet: null,
      themeVersion: null
    }
  }

  if (platform === 'joomla') {
    const template = context.setting.template
    if (!template) throw new UnreadableContent('tracy_setting.json names no template')
    const root = `templates/${template}/`
    const wanted = (/** @type {string} */ n) => n.includes(root) && TEXT.test(n)
    const installer = await bytesOf(install.installer?.file)
    const webroot = installer ? null : await bytesOf(install.webroot?.file)
    if (!installer && !webroot)
      throw new UnreadableContent(
        'the release carries neither an installer zip nor a webroot with the template'
      )
    const files = installer
      ? zipTexts(installer, wanted)
      : tarGzTexts(/** @type {Buffer} */ (webroot), wanted)
    return { files: under(files, root), stylesheet: null, themeVersion: null }
  }

  // WordPress: the theme zip first (this version's, else the newest), else the webroot.
  for (const zip of newestThemeZips(context.setting, await context.source.names())) {
    // eslint-disable-next-line no-await-in-loop -- one theme zip per release.
    const bytes = await context.source.read(zip)
    if (!bytes) continue
    const all = zipTexts(bytes, (n) => TEXT.test(n))
    const top = [...all.keys()].map((n) => /^([^/]+)\/style\.css$/.exec(n)?.[1]).find(Boolean) ?? null
    const files = top ? under(all, `${top}/`) : all
    return { files, stylesheet: top, themeVersion: themeVersionOf(files.get('style.css')) }
  }
  const webroot = await bytesOf(install.webroot?.file)
  if (!webroot) throw new UnreadableContent('the release carries neither a theme zip nor a webroot')
  const template = String(context.setting.template ?? '').replace(/^wp-/, '')
  const all = tarGzTexts(webroot, (n) => n.includes('wp-content/themes/') && TEXT.test(n))
  for (const stylesheet of [`wp-${template}`, template]) {
    const files = under(all, `wp-content/themes/${stylesheet}/`)
    if (files.has('style.css'))
      return { files, stylesheet, themeVersion: themeVersionOf(files.get('style.css')) }
  }
  throw new UnreadableContent(`the webroot holds no theme folder for "${template}"`)
}
