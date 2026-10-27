/**
 * A BUILD ASKS NOBODY AND EDITS NO TEMPLATE FILE (WO A–Z, council 25/10/2026).
 *
 * WHY. A demo or own-site build (`index.ts` `isBuild`) is the whole site as one ask, run with nobody at
 * the chat: a demo is built for a prospect who is not there, and "Build from my business" runs 20–80
 * minutes after one press. Local round 31 (25/10/2026, WordPress, JA Restaurant): the agent rewrote three
 * of the theme's PHP patterns with a Python heredoc, then ran `wp post delete 511 --force` so the stored
 * sidebar part would give way to the edited file. The shell rule (`shell-writes.mjs`) refused the delete
 * with a `confirm-` card, the agent showed it, and the turn stood 80 minutes on a question nobody could
 * answer. The brief already forbade both; the agent read it and did them anyway.
 *
 * 🔒 NO QUESTION IS NOT A YES. A change that waits for the customer's yes is not made in a build; it is
 * left as it is and named in the build's final reply. Nothing here agrees on anyone's behalf.
 *
 * 🔒 THE TEMPLATE'S FILES, NOT THE SITE'S OWN COPY. WordPress themes and plugins and Joomla's template,
 * extension and core folders are written back by their next update, so an edit there is lost and was
 * never the build's (the brief: "The theme's and plugins' files are the template's"). EmDash's `/app` is
 * the site's own copy, edited there by ADR 0022, and stays open. A stylesheet in a Joomla template's
 * `local/` folder — T4's own place for a site's styles — stays open too; nothing else in `local/` does
 * (council: being kept across updates does not make a folder the build's).
 *
 * 🔒 BEST EFFORT, AND SAID SO. A shell command is read by its words: `shellWriteTargets` for the
 * commands that write files, and a script interpreter (`python3`, `php`, `node`, `perl`, `ruby`,
 * `wp eval`) whose text writes a file while it works in, or names, a template folder. A script that
 * builds its path in a variable from another folder is not seen. Reads are never refused. Pure: no I/O.
 */
// Host-owned residue sweep calls execute their validated native operations directly, outside this agent hook.
import path from 'node:path'

import { callWriteTargets, isLookFile } from './comment-fence.mjs'

/**
 * The webroot folders a build never writes: WordPress's themes and plugins, Joomla's template, extension
 * and core folders. Relative to the site's `.webroot`.
 */
const TEMPLATE_DIRS = Object.freeze([
  'wp-content/themes',
  'wp-content/plugins',
  'wp-content/mu-plugins',
  'templates',
  'administrator',
  'components',
  'modules',
  'plugins',
  'libraries',
  'layouts',
  'includes',
  'media/templates'
])

/** A Joomla template's own folder for a site's styles: `templates/<name>/local/…`. */
const JOOMLA_LOCAL = /^(?:media\/)?templates\/(?:site\/)?[^/]+\/local\//
/**
 * 🔒 T4'S SITE SETTINGS ARE THE SITE'S (local round 35, 26/10/2026). A T4 template reads its logo, site name and slogan
 * from `etc/site/<profile>.json`, looked up in `local/` first (`T4\Helper\Path::getFileContent`), and T4's own admin
 * saves them there (`Path::saveLocalContent`): `local/etc/site/` is where the template keeps a site's own settings, as
 * WordPress keeps an option. The Death & Co build had no other way to put its logo in the header, overwrote the
 * template's `logo.png` instead, and failed header-brand eight times.
 */
const T4_SITE_SETTINGS = /^(?:media\/)?templates\/(?:site\/)?[^/]+\/local\/etc\/site(?:\/[^/]+\.json)?$/

/**
 * The template file a path names, relative to the webroot, or null for any other path.
 * @param {string} target - absolute, as `callWriteTargets` gives it.
 * @param {string} siteRoot
 */
export function templateFileOf(target, siteRoot) {
  const rel = path.relative(path.join(siteRoot, '.webroot'), target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  const fenced = TEMPLATE_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`))
  if (!fenced) return null
  if (JOOMLA_LOCAL.test(rel) && isLookFile(rel)) return null
  if (T4_SITE_SETTINGS.test(rel)) return null
  return rel
}

/** A picture file by its name. */
const PICTURE_FILE = /\.(?:jpe?g|png|webp|gif|svg|avif)$/i

/**
 * The picture file of the webroot one tool call of a build writes outside a `tracy-content/` folder, or null.
 * 🔒 THE BUSINESS'S PICTURES ARE PLACED, THE TEMPLATE'S ARE LEFT (local round 35, 26/10/2026): the Death & Co build
 * wrote its logo over the template's `images/joomlart/logo/logo.png` with PHP — the header showed the business's
 * mark under the template's file name, every check that reads files kept failing, and the template's own picture was
 * gone. A build's pictures go in with `tracy_demo media.import` (into `…/tracy-content/`) and into their field.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string }} call
 * @returns {string | null} the file, relative to the webroot.
 */
export function buildPictureWrite(call) {
  const places = writePlaces(call)
  if (places === null) return null
  for (const target of [...places.targets, ...places.script.slice(1)]) {
    const rel = path.relative(path.join(call.siteRoot, '.webroot'), target)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue
    if (PICTURE_FILE.test(rel) && !rel.split('/').includes('tracy-content')) return rel
  }
  return null
}

/**
 * 🔒 A BUILD HIDES NOTHING (local round 36, 26/10/2026). Told by the checks that its blog sidebar still showed the
 * template's banner picture and "Most Read", a WordPress build wrote `display:none` on them with `look.set`: the
 * checks passed and the page lost what the template shows. The brief forbids it ("Never hide, delete or unpublish to
 * fill gaps"); this refuses it. A look value that takes something off the page: none, hidden, nothing to see.
 * @param {unknown} args - a `tracy_site` call's arguments.
 * @returns {string | null} the hiding property, `name: value`, or null.
 */
export function buildHide(args) {
  const a = /** @type {Record<string, any>} */ (args !== null && typeof args === 'object' ? args : {})
  const action = typeof a.action === 'string' ? a.action.trim() : ''
  if (action !== 'look.set') return null
  const props = a.params?.props
  if (props === null || typeof props !== 'object') return null
  for (const [name, raw] of Object.entries(props)) {
    const value = String(raw ?? '')
      .trim()
      .toLowerCase()
    const key = name.trim().toLowerCase()
    const hides =
      (key === 'display' && value === 'none') ||
      (key === 'visibility' && (value === 'hidden' || value === 'collapse')) ||
      (key === 'content-visibility' && value === 'hidden') ||
      (key === 'opacity' && /^0*(?:\.0*)?%?$/.test(value)) ||
      (/^(?:max-)?(?:height|width)$/.test(key) && /^0(?:px|em|rem|%)?$/.test(value)) ||
      (key === 'font-size' && /^0(?:px|em|rem|%)?$/.test(value)) ||
      (key === 'color' && value === 'transparent') ||
      (key === 'transform' && /scale\(\s*0(?:\.0*)?\s*\)/.test(value))
    if (hides) return `${name}: ${raw}`
  }
  return null
}

/**
 * The refusal of a look value that hides something in a build.
 * @param {string} prop
 */
export function buildHideRefusal(prop) {
  return `site-tools: look.set refused: "${prop}" takes something the template shows off the page, and a build hides nothing — it makes it the business's. Nothing ran. Words the theme prints: content.find {text:"<the words>"} names their translation call, and content.contract {operation:"string"} changes them; a picture: the block or setting that shows it (a check's "in" names it). If no door reaches it, leave it and name it in your final reply.`
}

/**
 * The refusal of a picture written by hand in a build.
 * @param {string} tool @param {string} file
 */
export function buildPictureRefusal(tool, file) {
  return `site-tools: ${tool} refused: ${JSON.stringify(file)} is a picture of the site, and a build writes no picture file by hand — the template's stay as they are. Nothing ran. Put the business's picture in with tracy_demo {operation:"media.import"} and set the path it answers in the field or setting that shows it (a T4 template's logo: "site_logo" in templates/<template>/local/etc/site/<profile>.json).`
}

/** A script interpreter on a shell line. */
const INTERPRETER =
  /(?:^|[\s;&|(])(?:python3?|php|node|perl|ruby)(?=[\s;&|)]|$)|\bwp\s+(?:--?[\w-]+(?:=\S+)?\s+)*eval(?:-file)?\b/m
/** A call in a script that writes or moves a file. */
const SCRIPT_WRITE =
  /\bopen\s*\([^)]*,\s*(?:mode\s*=\s*)?['"][wax]\+?b?['"]|\.write_(?:text|bytes)\s*\(|\bfile_put_contents\s*\(|\bwriteFile(?:Sync)?\s*\(|\bappendFile(?:Sync)?\s*\(|\bshutil\.(?:copy\w*|move)\s*\(|\bos\.(?:remove|rename|replace|unlink)\s*\(|\b(?:unlink|rename|copy)\s*\(\s*['"$]|\bFile\.write\s*\(|\bimage(?:png|jpeg|webp|gif|avif|bmp)\s*\(|\.save\s*\(|\bopen\s*\(\s*(?:my\s+)?\$?\w+\s*,\s*['"]?[>+]/
/** A word that may be a path: has a slash, or a file name with an extension a template keeps. */
const PATH_WORD = /[\w.@~-]*\/[\w./@~-]*|[\w.-]+\.(?:php|html?|js|json|twig|xml|ini|tpl)\b/g

/**
 * Where one tool call may write: the paths its file tool or shell names as written (`callWriteTargets`), and for a
 * script interpreter that writes a file, the folder it works in (as `<dir>/_`) and every path word it names, resolved
 * there. Null for a call that writes nothing.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string }} call
 * @returns {{ targets: string[], script: string[] } | null}
 */
function writePlaces({ name, args, cwd, siteRoot }) {
  const targets = callWriteTargets({ name, args, cwd, siteRoot })
  if (targets === null) return null
  const a = /** @type {Record<string, unknown>} */ (args !== null && typeof args === 'object' ? args : {})
  const text = typeof a.command === 'string' ? a.command : typeof a.text === 'string' ? a.text : null
  if (text === null || !INTERPRETER.test(text) || !SCRIPT_WRITE.test(text)) return { targets, script: [] }
  const dir = typeof a.workdir === 'string' ? path.resolve(cwd, a.workdir) : cwd
  const here = dirBeforeScript(text, dir, siteRoot)
  const script = [path.join(here, '_')]
  for (const [word] of text.matchAll(PATH_WORD)) {
    const [target] = callWriteTargets({ name: 'edit', args: { file_path: word }, cwd: here, siteRoot }) ?? []
    if (target !== undefined) script.push(target)
  }
  return { targets, script }
}

/**
 * The template file one tool call of a build writes, or null to let it through.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string }} call - `cwd` resolves a relative
 *   path; `siteRoot` is the session's site folder.
 * @returns {string | null} the file, relative to the webroot.
 */
export function buildTemplateWrite(call) {
  const places = writePlaces(call)
  if (places === null) return null
  for (const target of places.targets) {
    const file = templateFileOf(target, call.siteRoot)
    if (file !== null) return file
  }
  const [here, ...named] = places.script
  if (here !== undefined) {
    const inHere = templateFileOf(here, call.siteRoot)
    if (inHere !== null) return path.dirname(inHere)
  }
  for (const target of named) {
    const file = templateFileOf(target, call.siteRoot)
    if (file !== null) return file
  }
  return null
}

const inApp = (/** @type {string} */ target) => target === '/app' || target.startsWith('/app/')

/**
 * Whether a call writes under EmDash's `/app` (the site's own template code), by the same reading.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string }} call
 */
export function writesApp(call) {
  const places = writePlaces(call)
  return places !== null && [...places.targets, ...places.script].some(inApp)
}

/**
 * 🔒 A BUILD REBUILDS ONLY WHAT CHANGED (plan "10/10" §7 S4, 26/10/2026): `site.rebuild` runs astro build and a
 * restart, 41 s in local round 33; entries, menus and settings an EmDash build writes need none. Whether a write under
 * `/app` came since the conversation's last rebuild (or ever, before the first), read from its log.
 * @param {readonly { type?: string, data?: any }[]} events
 * @param {string} cwd
 * @param {string} siteRoot
 */
export function appChangedSinceRebuild(events, cwd, siteRoot) {
  let changed = false
  for (const event of events ?? []) {
    if (event?.type !== 'tool/call') continue
    let args = event.data?.arguments
    if (typeof args === 'string')
      try {
        args = JSON.parse(args)
      } catch {
        continue
      }
    if (
      event.data?.name === 'tracy_site_build_emdash' &&
      /** @type {any} */ (args)?.operation === 'site.rebuild'
    )
      changed = false
    else if (writesApp({ name: event.data?.name, args, cwd, siteRoot })) changed = true
  }
  return changed
}

/** The refusal of a rebuild nothing asked for in a build. */
export const BUILD_REBUILD_UNNEEDED =
  'site-tools: site.rebuild refused: nothing under /app changed since the last build of this site, and entries, menus, media and settings show without one. Nothing ran. Rebuild only after editing the template code under /app.'

/**
 * Where a shell command stands when its script starts: its `cd`s, read until the first line that runs
 * an interpreter (the heredoc after it is the script's, not the shell's).
 * @param {string} command
 * @param {string} dir
 * @param {string} siteRoot - where a bare `cd` goes.
 */
function dirBeforeScript(command, dir, siteRoot) {
  let here = dir
  for (const part of command.split(/\n|;|&&|\|\||\|/)) {
    if (INTERPRETER.test(part)) break
    const words = part.trim().split(/\s+/).filter(Boolean)
    if (words[0] !== 'cd') continue
    const to = words[1]?.replace(/^['"]|['"]$/g, '')
    here = to === undefined ? siteRoot : path.resolve(here, to)
  }
  return here
}

/**
 * The refusal of a template file write in a build: what it is, why not, and the doors that do it.
 * @param {string} tool
 * @param {string} file - relative to the webroot.
 */
export function buildTemplateRefusal(tool, file) {
  return `site-tools: ${tool} refused: ${JSON.stringify(file)} is the template's own file, and a build never edits it — the theme's or plugin's next update writes it back. Nothing ran. Words the theme prints change with tracy_site content.replace {path:"<the page that shows them>", changes:[{find, replace}]}; a picture the theme picks from a setting changes with that setting (tracy_site content.update {kind:"option"}). Reading these files is fine. If no door reaches it, leave it and name it in your final reply.`
}

/** What a change waiting for a yes becomes in a build: one sentence per kind, so none reads as another. */
const NOT_IN_A_BUILD =
  'A change that waits for a yes is not made in a build: nothing is deleted or hidden — keep it and make it the business’s, its words and pictures — and nothing is installed, switched or rolled back — use what the template has and repair forward.'

/**
 * The refusal of an `ask_user_question` in a build.
 * @param {boolean} confirm - the card carries a question Tracy wrote for a refused call (`confirm-…`).
 */
export function buildQuestionRefusal(confirm) {
  const lead = confirm
    ? 'site-tools: ask_user_question refused: nobody answers during a build, so this question would hold the whole build until it times out, and the change it asks about is not made.'
    : 'site-tools: ask_user_question refused: nobody answers during a build, so a question would hold the whole build until it times out. Decide from the brief and the research.'
  return `${lead} ${NOT_IN_A_BUILD} Name anything you left for the owner in your final reply, and go on with the build.`
}

/**
 * The refusal of a shell command with a consequence in a build (`shell-writes.mjs`), with no card to show.
 * @param {{ reason: string, door: string | null }} found
 */
export function buildShellRefusal(found) {
  const why =
    found.reason === 'deletes' || found.reason === 'hides'
      ? 'A build deletes and hides nothing: keep it and make it the business’s, its words and pictures.'
      : found.reason === 'code'
        ? 'A build installs, switches and upgrades nothing: use what the template has.'
        : found.reason === 'database'
          ? 'A build never writes the database by hand.'
          : found.door === null
            ? 'Leave it, and name it in your final reply.'
            : `Make the change through ${found.door} — it records the change, so it can be undone.`
  return `site-tools: this command ${found.reason === 'deletes' ? 'deletes' : 'changes'} the site (reason: ${found.reason}), and a build asks nobody: nothing ran. ${why} Do not ask the customer: nobody answers during a build.`
}

/**
 * The refusal of a call another listener wanted a person to approve (dsh's `ask`), in a build.
 * @param {string} tool
 */
export function buildApprovalRefusal(tool) {
  return `site-tools: ${tool} needs an approval nobody can give during a build: nothing ran. Do the work through the build's own doors (tracy_site, tracy_demo), or leave it and name it in your final reply.`
}
