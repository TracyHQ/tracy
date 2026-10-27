/**
 * STAB-7: no machine text leaks onto a page (`null`, `none`, a raw `{contact.tel}`, a raw `TPL_*`
 * key) (spec `tasks/spec-template-customization-question-readiness.md`, STAB-7).
 *
 * - Joomla: every identity token in the presentation lock and the template files is one
 *   `plg_system_tracyidentity` renders (`Identity::NAMES`), and the dump installs and enables that
 *   plugin; a token inside a `tel:`/`mailto:` link needs a layout that calls `isBlankToken`; every
 *   `TPL_*` key the template's PHP asks for is in one of its `.ini` files; no text slot sample is a
 *   bare `null`/`none`/`undefined`.
 * - WordPress: every token in the pages and parts is one the theme's `inc/identity.php` renders; the
 *   option `tracy_site_identity` holds no `null`/`none`; no `tel:`/`mailto:` link is empty.
 * - EmDash: no seed string is a bare `null`/`none`/`undefined`; every `identity` rule writing an
 *   optional fact (`{phone}`, `{email}`, `{address}`, `{hours}`) says what to write when it is empty.
 *
 * Parts that need files this copy of the release does not carry are reported in `details`, and a
 * rule with nothing failed but such a part left is `live-only`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { demoDatabase } from '../readers/demo-database-tables.js'
import { emdashTemplate, stringsIn } from '../readers/emdash-personalize-coverage.js'
import { contractOf, NO_CONTRACT_FIX, NO_CONTRACT_OWNER } from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSourceFiles } from '../readers/template-source-files.js'
import { counted } from '../readers/rule-findings.js'
import { templateLanguageKeys } from '../readers/joomla-language-keys.js'

/**
 * The identity plugin's token list: in the repo, or where the tracy-web image copies it (the image
 * holds `src/` only, so /ops can run this rule on the server; `apps/tracy-web/Dockerfile`).
 */
const IDENTITY_PHP_PLACES = [
  '../../../../../../packages/cms/tracy-joomla-quickstart/plugins/plg_system_tracyidentity/src/Identity.php',
  '../../../identity-plugin/Identity.php'
].map((p) => fileURLToPath(new URL(p, import.meta.url)))
const IDENTITY_PHP = IDENTITY_PHP_PLACES.find((p) => existsSync(p)) ?? IDENTITY_PHP_PLACES[0]
const TOKEN = /(?:\{|%7B)((?:site|contact|social)\.[a-zA-Z]+)(?:\}|%7D)/g
const MACHINE_WORD = /^(null|none|undefined)$/i
const OPTIONAL_FACT = /\{(phone|email|address|hours)\}/

/** The token names a PHP file lists as quoted strings (`'site.name'`, `'contact.tel'`). */
const tokenNamesIn = (/** @type {string} */ php) =>
  new Set([...php.matchAll(/'((?:site|contact|social)\.[a-zA-Z]+)'/g)].map((m) => m[1]))

const tokensIn = (/** @type {string} */ text) => [...text.matchAll(TOKEN)].map((m) => m[1])

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function joomla(context, problems, open, /** @type {string[]} */ notes = []) {
  const contract = contractOf(context)
  if (!contract) return void problems.push('no content contract seals this release')
  const lock = JSON.stringify(contract.json('presentation-lock.json')?.entities ?? {})
  const files = await templateSourceFiles(context)
  const php = files ? [...files].filter(([n]) => n.endsWith('.php')) : []
  const known = tokenNamesIn(readFileSync(IDENTITY_PHP, 'utf8'))
  const used = new Set([...tokensIn(lock), ...php.flatMap(([, t]) => tokensIn(t))])
  for (const t of used)
    if (!known.has(t)) problems.push(`the token {${t}} is not one the identity plugin renders`)
  if (used.size) {
    try {
      const db = await demoDatabase(context)
      const plugin = db.table('extensions').find((e) => e.element === 'tracyidentity')
      if (!plugin || String(plugin.enabled) !== '1')
        problems.push(
          `the pages carry ${counted(used.size, 'identity token', 'identity tokens')} but the demo database does not ${plugin ? 'enable' : 'install'} plg_system_tracyidentity`
        )
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      open.push(`whether plg_system_tracyidentity is installed: ${e.message}`)
    }
    if (/(?:tel|mailto):(?:\{|%7B)contact\./.test(lock)) {
      if (!files)
        open.push(
          'a tel:/mailto: link holds a token, and the template files are not carried to see if a layout hides it when empty'
        )
      else if (!php.some(([, t]) => t.includes('isBlankToken')))
        problems.push(
          'a tel:/mailto: link holds a contact token and no template layout calls Identity::isBlankToken, so an empty number prints an empty link'
        )
    }
  }
  if (!files) open.push('the template files are not carried: TPL_* keys and layouts are not read')
  else {
    const defined = new Set()
    for (const [name, text] of files)
      if (name.endsWith('.ini')) for (const m of text.matchAll(/^\s*([A-Z0-9_]+)\s*=/gm)) defined.add(m[1])
    const missing = new Map()
    const prefixes = new Map()
    const { keys, uncalled } = templateLanguageKeys(php)
    if (uncalled.length)
      notes.push(
        `TPL_* keys asked only inside functions no template file calls, so never printed: ${uncalled.join(', ')}`
      )
    for (const { file: name, key, prefix } of keys)
      if (prefix) {
        if (![...defined].some((d) => d.startsWith(key))) prefixes.set(key, name)
      } else if (!defined.has(key)) missing.set(key, name)
    for (const [key, where] of missing)
      problems.push(`the key ${key} (${where}) is in no .ini file of the template`)
    for (const [key, where] of prefixes)
      problems.push(`the key prefix ${key} (${where}) starts no key of any .ini file of the template`)
  }
  for (const slot of contract.json('content-map.json')?.slots ?? [])
    if (slot.type === 'text' && MACHINE_WORD.test(String(slot.sample ?? '').trim()))
      problems.push(`the slot ${slot.key} holds the machine word "${slot.sample}"`)
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function wordpress(context, problems, open) {
  const db = await demoDatabase(context)
  const files = await templateSourceFiles(context)
  const contents = db
    .table('posts')
    .filter(
      (p) =>
        p.post_status === 'publish' &&
        ['page', 'post', 'wp_template_part', 'wp_template', 'wp_navigation', 'wp_block'].includes(p.post_type)
    )
    .map((p) => String(p.post_content ?? ''))
  const theme = files
    ? [...files].filter(([n]) => /^(parts|patterns|templates)\//.test(n)).map(([, t]) => t)
    : []
  const used = new Set([...contents, ...theme].flatMap(tokensIn))
  const identity = files?.get('inc/identity.php')
  if (!files)
    open.push(
      `the theme files are not carried: ${counted(used.size, 'token is not held', 'tokens are not held')} to inc/identity.php`
    )
  else {
    const known = identity ? tokenNamesIn(identity) : new Set()
    for (const t of used)
      if (!known.has(t)) problems.push(`the token {${t}} is not one the theme's inc/identity.php renders`)
  }
  const raw = String(db.option('tracy_site_identity') ?? '')
  for (const m of raw.matchAll(/s:\d+:"(null|none|undefined)";|"(null|none|undefined)"/gi))
    problems.push(`option tracy_site_identity holds the value "${m[1] ?? m[2]}"`)
  const empty = contents.reduce((n, c) => n + (c.match(/href=["'](?:tel|mailto):["']/g)?.length ?? 0), 0)
  if (empty) problems.push(`${empty} tel:/mailto: links in the demo content are empty`)
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function emdash(context, problems, open) {
  const t = await emdashTemplate(context)
  if (!t?.seed || !t.personalize)
    return void open.push('the release carries no readable source zip with the seed')
  const words = new Set()
  for (const entries of Object.values(t.seed.content ?? {}))
    for (const e of /** @type {any[]} */ (entries))
      for (const s of stringsIn(e.data))
        if (MACHINE_WORD.test(s.trim())) words.add(`${e.id ?? e.slug}: "${s}"`)
  for (const w of [...words].slice(0, 10)) problems.push(`the seed string ${w} is a machine word`)
  // An optional fact needs a decided outcome when it is blank: `empty`, or the demo's value kept as a placeholder
  // (`"unanswered": "keep-demo"`, product owner 11/10/2026, TCH #1013: a contact line nobody asked for keeps the template's).
  for (const r of t.personalize.identity ?? [])
    if (OPTIONAL_FACT.test(JSON.stringify(r.value ?? '')) && !('empty' in r) && r.unanswered !== 'keep-demo')
      problems.push(
        `the identity rule ${r.collection}.${r.field} writes an optional fact with no "empty" value and no "unanswered": "keep-demo", so what stays when it is blank is undecided`
      )
  open.push(
    'a tel: link printed from the hotline in src/** is not read; only a built site shows an empty one'
  )
}

export const stab7MachineText = {
  id: 'STAB-7',
  title: 'No machine text such as null, none or {contact.tel} reaches a page',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    /** @type {string[]} */
    const problems = []
    /** @type {string[]} */
    const open = []
    /** What was read and needs no fix, for the details. */
    /** @type {string[]} */
    const notes = []
    try {
      if (platform === 'joomla') await joomla(context, problems, open, notes)
      else if (platform === 'wordpress') await wordpress(context, problems, open)
      else await emdash(context, problems, open)
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    // Only the Joomla part reads a contract, so only it can find none.
    const unsealed = platform === 'joomla' && problems.includes('no content contract seals this release')
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails STAB-7: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? `; and ${problems.length - 6} more` : ''}.`,
        ...(unsealed ? { owner: NO_CONTRACT_OWNER } : {}),
        fix: unsealed
          ? NO_CONTRACT_FIX
          : platform === 'joomla'
            ? 'Use only tokens the identity plugin renders, hide a contact link when its value is empty, add every TPL_* key to the template .ini, and never ship a bare null/none sample, then cut a new release.'
            : platform === 'wordpress'
              ? "Use only tokens the theme's inc/identity.php renders, keep option tracy_site_identity free of null/none, fill or drop empty tel:/mailto: links, then cut a new release."
              : 'Replace every bare null/none/undefined seed string and give each identity rule for an optional fact a value for when it is empty (seed/personalize.json), then cut a new release.',
        details: [...problems, ...open, ...notes]
      }
    if (open.length && platform !== 'emdash')
      return {
        status: 'live-only',
        message: `${name}: nothing failed in what was read; ${open.join('; ')}.`,
        details: [...open, ...notes]
      }
    return {
      status: 'pass',
      message: `${name}: no machine text in the tokens, keys and samples read.`,
      details: [...open, ...notes]
    }
  }
}
