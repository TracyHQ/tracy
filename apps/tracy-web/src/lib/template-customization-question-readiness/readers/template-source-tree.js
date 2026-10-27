/**
 * The text files of a release's own template, keyed by their path inside it, for the rules that
 * scan template code (hard-coded `lang`, hard-coded links, hard-coded words, the error page):
 *
 * - Joomla: `templates/<template>/**` (key `index.php`, `html/com_contact/...`) and the template's
 *   English language files (key `language/en-GB/tpl_<template>.ini`), from the webroot tar.gz or,
 *   for an `installer` zip, from inside it.
 * - WordPress: the active theme's folder (key `templates/404.html`, `inc/extra.php`), from the theme
 *   zip the release attaches, else from the webroot. The theme is `stylesheet` of the demo database.
 * - EmDash: the `install.source` zip without `node_modules`, media and build output (key
 *   `src/lib/link-gate.ts`, `seed/personalize.json`), one leading folder stripped when every entry
 *   shares it.
 *
 * Only text kinds a rule reads are kept (code, markup, language files, JSON). What cannot be read
 * throws `UnreadableContent`, like the other content readers: an Akeeba bundle is `live-only`, a
 * release with no archive holding the template is a `fail`.
 */
import { tarGzTexts, zipTexts } from './archives.js'
import { demoTables } from './demo-tables.js'
import { UnreadableContent } from './release-content.js'
import { themeZipsInOrder } from './theme-zips.js'

/** Text kinds a rule reads; macOS resource forks (`._error.php`) are not files of the template. */
const TEXT = /^(?!(.*\/)?\._).*\.(php|html|ini|xml|json|js|mjs|cjs|ts|tsx|astro)$/i
const EMDASH_SKIP = /(^|\/)(node_modules|dist|\.astro|\.git|media)\//

/** @type {WeakMap<object, Promise<Map<string, string>>>} */
const memo = new WeakMap()

/**
 * Keep the files under `root/`, keyed by the rest of their path.
 * @param {Map<string, string>} files
 * @param {string} root
 */
function under(files, root) {
  const out = new Map()
  for (const [name, text] of files) {
    const at = name.indexOf(root)
    if (at === 0 || (at > 0 && name[at - 1] === '/')) out.set(name.slice(at + root.length), text)
  }
  return out
}

/** @param {import('../index.js').RuleContext} context */
async function joomlaFiles(context) {
  const template = context.setting.template
  if (typeof template !== 'string' || !template)
    throw new UnreadableContent('tracy_setting.json names no template, so its folder cannot be found')
  const install = context.setting.install ?? {}
  const wanted = (/** @type {string} */ n) =>
    TEXT.test(n) &&
    (n.includes(`templates/${template}/`) ||
      (/language\/en-GB\//.test(n) && n.includes(`tpl_${template}`) && !n.includes('administrator/')))
  let files
  if (install.webroot?.file && (await context.source.read(install.webroot.file)))
    files = tarGzTexts(/** @type {Buffer} */ (await context.source.read(install.webroot.file)), wanted)
  else if (install.installer?.file && (await context.source.read(install.installer.file)))
    files = zipTexts(/** @type {Buffer} */ (await context.source.read(install.installer.file)), wanted)
  else if (install.bundle)
    throw new UnreadableContent('an Akeeba bundle cannot be read without restoring it', 'live-only')
  else throw new UnreadableContent('the release carries no webroot or installer with the template inside')
  const out = under(files, `templates/${template}/`)
  for (const [name, text] of files) {
    const m = /(?:^|\/)(language\/en-GB\/[^/]+\.ini)$/.exec(name)
    if (m && !name.includes(`templates/${template}/`)) out.set(m[1], text)
  }
  if (out.size === 0) throw new UnreadableContent(`no templates/${template}/ folder in the release`)
  return out
}

/** @param {import('../index.js').RuleContext} context */
async function wordpressFiles(context) {
  const stylesheet = (await demoTables(context)).option('stylesheet')
  if (!stylesheet) throw new UnreadableContent('the demo database names no active theme (option stylesheet)')
  // A release may carry several theme zips (old cuts stay attached): this version's first, else the newest.
  const zips = themeZipsInOrder(await context.source.names(), stylesheet, context.release.version)
  for (const zip of zips) {
    // eslint-disable-next-line no-await-in-loop -- one theme zip per release.
    const bytes = await context.source.read(zip)
    const files = bytes
      ? under(
          zipTexts(bytes, (n) => TEXT.test(n)),
          `${stylesheet}/`
        )
      : new Map()
    if (files.size) return files
  }
  const webroot = context.setting.install?.webroot?.file
  const bytes = webroot ? await context.source.read(webroot) : null
  if (!bytes)
    throw new UnreadableContent(`the release carries neither a theme zip nor a webroot with ${stylesheet}`)
  const files = under(
    tarGzTexts(bytes, (n) => TEXT.test(n) && n.includes(`wp-content/themes/${stylesheet}/`)),
    `wp-content/themes/${stylesheet}/`
  )
  if (files.size === 0) throw new UnreadableContent(`the webroot has no wp-content/themes/${stylesheet}/`)
  return files
}

/** @param {import('../index.js').RuleContext} context */
async function emdashFiles(context) {
  const file = context.setting.install?.source?.file
  const bytes = file ? await context.source.read(file) : null
  if (!bytes) throw new UnreadableContent(`the release does not carry ${file ?? 'an install.source zip'}`)
  const files = zipTexts(bytes, (n) => TEXT.test(n) && !EMDASH_SKIP.test(n))
  const first = [...files.keys()].map((n) => n.split('/')[0])
  const shared = first.length && first.every((f) => f === first[0]) && !/\./.test(first[0]) ? first[0] : null
  return shared && !['seed', 'src', 'tools'].includes(shared) ? under(files, `${shared}/`) : files
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<Map<string, string>>}
 */
export function templateSourceFiles(context) {
  if (!memo.has(context)) {
    const read = { joomla: joomlaFiles, wordpress: wordpressFiles, emdash: emdashFiles }[
      context.release.platform
    ]
    memo.set(context, read ? read(context) : Promise.resolve(new Map()))
  }
  return /** @type {Promise<Map<string, string>>} */ (memo.get(context))
}
