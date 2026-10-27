/**
 * STAB-6: a site just built can be edited with Tracy at once (spec STAB-6). Template half: the lock
 * is the release byte for byte (drift written after the build, e.g. plugin ordering, is not).
 * - Joomla: `files` hashes equal the installer or webroot (T4's generated files aside), no PHP/JS
 *   file under `fileRoots` is unlocked, `entities` equal their dump rows, assignments are the dump's.
 * - WordPress: every contract entity has a lock entry, `options` equal `wp_options`, `templateParts`
 *   hashes are the dump's parts, `files` the theme's, `superseded.json` names this lock. (`skeleton`
 *   hashes need the capture script's own function and are not recomputed.)
 * - EmDash: the release manifest's `contractHash`/`artifactHash` are the packed `distribution.json`.
 */
import { createHash } from 'node:crypto'

import { tarGzHashes, zipHashes } from '../readers/archive-file-hashes.js'
import { differingFields, joomlaEntityRows } from '../readers/contract-against-dump.js'
import { demoDatabase } from '../readers/demo-database-tables.js'
import { emdashTemplate } from '../readers/emdash-personalize-coverage.js'
import { contractOf, NO_CONTRACT_FIX } from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { counted } from '../readers/rule-findings.js'
import { againstThemeZips, compared } from '../readers/lock-file-hashes.js'

const sha256 = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex')

/** (a) of Joomla and the `files` check of WordPress: the lock's hashes against the archive. */
async function fileProblems(
  /** @type {import('../index.js').RuleContext} */ context,
  lock,
  /** @type {string[]} */ problems,
  /** @type {string[]} */ open
) {
  const roots = /** @type {string[]} */ (lock?.fileRoots ?? []).map((r) => `${r.replace(/\/$/, '')}/`)
  const locked = /** @type {Record<string, string>} */ (lock?.files ?? {})
  if (!roots.length || !Object.keys(locked).length) return
  const install = context.setting.install ?? {}
  const strip = (/** @type {string} */ n) => n.replace(/^\.\//, '')
  // The lock may hash files outside its roots too (demo images under `images/`).
  const wanted = (/** @type {string} */ n) => strip(n) in locked || roots.some((r) => strip(n).startsWith(r))
  const read = async (/** @type {any} */ a) => (a?.file ? context.source.read(a.file) : null)
  const installer = await read(install.installer)
  const webroot = installer ? null : await read(install.webroot)
  if (!installer && !webroot) {
    if (context.release.platform === 'wordpress' && (await againstThemeZips(context, roots, locked, open)))
      return
    return void open.push('the webroot is not carried: the lock file hashes are not compared')
  }
  const actual = installer
    ? zipHashes(installer, wanted)
    : tarGzHashes(/** @type {Buffer} */ (webroot), wanted)
  problems.push(...compared(locked, actual))
}

/** @param {import('../index.js').RuleContext} context */
async function joomla(context, contract, /** @type {string[]} */ problems, /** @type {string[]} */ open) {
  const lock = contract.json('presentation-lock.json')
  const db = await demoDatabase(context)
  const { rows, problems: missing } = joomlaEntityRows(db, contract.json('content-map.json'))
  problems.push(...missing)
  const drift = []
  for (const [key, row] of rows) {
    const fields = differingFields(lock?.entities?.[key] ?? {}, row)
    if (fields.length) drift.push(`${key} (${fields.slice(0, 3).join(', ')})`)
  }
  if (drift.length)
    problems.push(
      `${counted(drift.length, 'locked row differs', 'locked rows differ')} from the dump: ${drift.slice(0, 5).join('; ')}`
    )
  const pair = (/** @type {any} */ a) => `${a.moduleid}:${a.menuid}`
  const lockPairs = new Set((lock?.assignments ?? []).map(pair))
  const modules = new Set((lock?.assignments ?? []).map((a) => String(a.moduleid)))
  const dumpPairs = new Set(
    db
      .table('modules_menu')
      .filter((a) => modules.has(String(a.moduleid)))
      .map(pair)
  )
  const lost = [...lockPairs].filter((p) => !dumpPairs.has(p))
  const added = [...dumpPairs].filter((p) => !lockPairs.has(p))
  if (lost.length || added.length)
    problems.push(
      `the module assignments differ: ${lost.length} locked are not in the dump, ${added.length} in the dump are not locked`
    )
  await fileProblems(context, lock, problems, open)
}

/** @param {import('../index.js').RuleContext} context */
async function wordpress(context, contract, /** @type {string[]} */ problems, /** @type {string[]} */ open) {
  const lock = contract.json('presentation-lock.json')
  const db = await demoDatabase(context)
  // One capture writes both files: a governed entity the lock does not hold is a lock of another cut.
  const unheld = (contract.json('content-map.json')?.entities ?? []).filter(
    (e) => !(e.key in (lock?.entities ?? {}))
  )
  if (unheld.length)
    problems.push(
      `${counted(unheld.length, 'contract entity has', 'contract entities have')} no entry in the lock (${unheld
        .slice(0, 4)
        .map((e) => e.key)
        .join(', ')})`
    )
  for (const [k, v] of Object.entries(lock?.options ?? {}))
    if (String(db.option(k) ?? '') !== String(v))
      problems.push(`the locked option ${k} is "${v}", the dump has "${db.option(k) ?? ''}"`)
  for (const [part, { sha256: hash }] of Object.entries(lock?.templateParts ?? {})) {
    const rows = db
      .table('posts')
      .filter(
        (p) => p.post_type === 'wp_template_part' && p.post_name === part && p.post_status === 'publish'
      )
    if (rows.length && !rows.some((r) => sha256(String(r.post_content)) === hash))
      problems.push(`the locked template part ${part} is not the dump's`)
  }
  const superseded = contract.json('superseded.json')
  const own = contract.text('presentation-lock.json')
  if (superseded?.presentationLock && own !== null && superseded.presentationLock !== sha256(own))
    problems.push("superseded.json names another presentation lock than the profile's own")
  await fileProblems(context, lock, problems, open)
  open.push('page skeleton hashes need the capture script and are not recomputed')
}

/** @param {import('../index.js').RuleContext} context */
async function emdash(context, /** @type {string[]} */ problems, /** @type {string[]} */ open) {
  const raw = await context.source.read('manifest.json')
  const t = await emdashTemplate(context)
  const dist = t?.files.get('distribution.json')
  if (!raw || dist === undefined)
    return void open.push('the release manifest or the packed distribution.json is not carried')
  const manifest = JSON.parse(raw.toString('utf8'))
  const packed = JSON.parse(dist)
  const bare = (/** @type {unknown} */ h) => String(h ?? '').replace(/^sha256:/, '')
  for (const k of ['contractHash', 'artifactHash'])
    if (bare(manifest.template?.[k]) !== bare(packed[k]))
      problems.push(`the release manifest ${k} is not the packed source's distribution.json`)
}

export const stab6LockMatchesRelease = {
  id: 'STAB-6',
  title: 'A site just built can be edited with Tracy at once',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('contract'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    /** @type {string[]} */
    const problems = []
    /** @type {string[]} */
    const open = []
    try {
      if (platform === 'emdash') await emdash(context, problems, open)
      else {
        const contract = contractOf(context)
        if (!contract)
          return {
            status: 'fail',
            message: `${name}: no content contract seals this release.`,
            fix: NO_CONTRACT_FIX
          }
        await (platform === 'joomla' ? joomla : wordpress)(context, contract, problems, open)
      }
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.`, details: problems }
    }
    const live =
      'Drift written after the build is not the template’s; only a built site shows an edit go through.'
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails STAB-6: ${problems.slice(0, 4).join('; ')}.`,
        fix: 'Capture the presentation lock again from this very release, and ship the plugin carrying it.',
        details: [...problems, ...open, live]
      }
    const whole = open.filter(
      (o) => !o.startsWith('page skeleton') && !o.includes('were compared with the theme zip')
    )
    if (whole.length)
      return {
        status: 'live-only',
        message: `${name}: nothing differs in what was read; ${whole.join('; ')}.`,
        details: [...open, live]
      }
    return {
      status: 'pass',
      message: `${name}: the presentation lock is this release.`,
      details: [...open, live]
    }
  }
}
