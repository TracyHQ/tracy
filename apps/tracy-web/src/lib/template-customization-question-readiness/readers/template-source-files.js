/**
 * The template's own source files as a release carries them, keyed by their path INSIDE the
 * template (`error.php`, `html/com_contact/contact/default_address.php`, `templates/404.html`,
 * `src/views/Home.astro`). Read for the rules that look at template code (STAB-2, STAB-7, HIDDEN-1,
 * SHARE-1, ABOUT-1, ABOUT-3).
 *
 * - Joomla: `templates/<template>/` from the `installer` zip or the `webroot` tar.gz, plus the site
 *   language files of the template (`language/<tag>/<tag>.tpl_<template>.ini`) as `site:language/…`.
 * - WordPress: the active theme folder from the theme zip the release attaches
 *   (`wp-<theme>-<version>.zip`) or, failing that, `wp-content/themes/<stylesheet>/` in the webroot.
 * - EmDash: the whole packed source (`install.source`), its top folder stripped.
 *
 * Returns null when the release carries no archive with them (a download cache that holds only the
 * database, an Akeeba bundle): a rule then reports that part `live-only`, never a pass. Text files
 * only, read once per context. Images, fonts and other binaries are left out.
 */
import { tarGzTexts, zipTexts } from './archives.js'
import { demoDatabase } from './demo-database-tables.js'
import { themeZipsInOrder } from './theme-zips.js'

/** Files a rule may read as text; everything else in a template (images, fonts) is skipped. */
const TEXT_FILE = /\.(php|ini|xml|html?|json|astro|ts|tsx|js|mjs|css|less|scss|txt|md|po|pot)$/i

/** @type {WeakMap<object, Promise<Map<string, string> | null>>} */
const memo = new WeakMap()

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<Map<string, string> | null>}
 */
export function templateSourceFiles(context) {
  if (!memo.has(context)) memo.set(context, readFiles(context))
  return /** @type {Promise<Map<string, string> | null>} */ (memo.get(context))
}

/**
 * Keep the files under `root` (any leading folders allowed), keyed by their path below it.
 * @param {Map<string, string>} files
 * @param {string} root
 */
function under(files, root) {
  const out = new Map()
  for (const [name, text] of files) {
    const at = name.indexOf(root)
    if (at < 0 || (at > 0 && name[at - 1] !== '/')) continue
    out.set(name.slice(at + root.length), text)
  }
  return out
}

/** The active WordPress theme folder (option `stylesheet` of the dump), or null. */
async function stylesheetOf(/** @type {import('../index.js').RuleContext} */ context) {
  try {
    return (await demoDatabase(context)).option('stylesheet') ?? null
  } catch {
    return null
  }
}

/** @param {import('../index.js').RuleContext} context */
async function readFiles(context) {
  const { platform } = context.release
  const install = context.setting.install ?? {}
  const read = async (/** @type {string | undefined} */ file) => (file ? context.source.read(file) : null)

  if (platform === 'emdash') {
    const zip = await read(install.source?.file)
    if (!zip) return null
    const files = zipTexts(zip, (n) => TEXT_FILE.test(n))
    // The packed source may sit under one top folder: strip whatever stands before `seed/` or `src/`.
    const marker = [...files.keys()].map((n) => /^(.*?)(?:seed|src)\//.exec(n)).find(Boolean)
    const cut = marker ? marker[1] : ''
    return new Map([...files].map(([n, t]) => [cut && n.startsWith(cut) ? n.slice(cut.length) : n, t]))
  }

  if (platform === 'joomla') {
    const template = context.setting.template
    if (!template) return null
    const root = `templates/${template}/`
    // The site language files of the template sit outside its folder: kept as `site:language/…`.
    const siteLanguage = new RegExp(`^(language/[^/]+/[^/]*tpl_${template}[^/]*\\.ini)$`)
    const wanted = (/** @type {string} */ n) =>
      (n.includes(root) && TEXT_FILE.test(n)) || siteLanguage.test(n)
    const installer = await read(install.installer?.file)
    const webroot = installer ? null : await read(install.webroot?.file)
    if (!installer && !webroot) return null
    const files = installer
      ? zipTexts(installer, wanted)
      : tarGzTexts(/** @type {Buffer} */ (webroot), wanted)
    const out = under(files, root)
    for (const [name, text] of files) {
      const m = siteLanguage.exec(name)
      if (m && !name.includes(root)) out.set(`site:${m[1]}`, text)
    }
    return out
  }

  const stylesheet = await stylesheetOf(context)
  // This version's theme zip first, else the newest: old cuts stay attached to a release.
  for (const zip of themeZipsInOrder(await context.source.names(), stylesheet, context.release.version)) {
    // eslint-disable-next-line no-await-in-loop -- one theme zip per release.
    const bytes = await context.source.read(zip)
    if (!bytes) continue
    const files = zipTexts(bytes, (n) => TEXT_FILE.test(n))
    const top = stylesheet && [...files.keys()].some((n) => n.startsWith(`${stylesheet}/`))
    return top ? under(files, `${stylesheet}/`) : files
  }
  const webroot = await read(install.webroot?.file)
  if (!webroot || !stylesheet) return null
  const root = `wp-content/themes/${stylesheet}/`
  return under(
    tarGzTexts(webroot, (n) => n.includes(root) && TEXT_FILE.test(n)),
    root
  )
}

/**
 * The files whose path passes `test`.
 * @param {Map<string, string>} files
 * @param {RegExp} test
 */
export const filesMatching = (files, test) => [...files].filter(([name]) => test.test(name))
