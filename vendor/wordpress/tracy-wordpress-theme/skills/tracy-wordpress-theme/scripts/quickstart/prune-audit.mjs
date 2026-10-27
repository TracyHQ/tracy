#!/usr/bin/env node
// Prune audit for a WordPress quickstart stand — the Phase 10 gate before pack.mjs.
//
// A build stand accumulates things that are true of the BUILD and not of the product: transients
// (cache and update checks keyed to this machine), revisions and auto-drafts (an editor's history),
// trashed posts, the builder's login sessions, users other than the one admin the quickstart
// declares, options the seeder set for itself, a debug log, Finder metadata, uploads nothing on the
// site shows (orphan attachments) and WordPress's own "Hello world!" post and "Sample Page". Draft
// pages are listed for a person to decide; a draft whose intent is recorded is kept — one an option
// names (the 404 page, WordPress's privacy policy draft), the seeder's draft for a search view of
// `--page-map`, or one a person decided on with `--keep-draft <id>`. None of it errors on
// restore; all of it ships a stranger's traces to every customer site born from the archive.
//
// Every row is KEEP / PRUNE / UNKNOWN with the measurement that decided it. Exit 1 while any
// PRUNE remains; `--apply` performs the removals that are safe by construction — wp-cli for the
// database (revisions/auto-drafts/trash need --force because they cannot be trashed twice; a
// published post or page is never touched — except WordPress's two default ones, found by type +
// slug and confirmed by title), rm for files. Without `--apply` nothing is written. UNKNOWN is for
// a person.
//
// Facts come from the live stand (`--wp "<runner>"` + `--webroot`) or from `--data facts.json`
// (the same shape, pre-collected — what the tests use).
//
// Usage: node prune-audit.mjs --webroot <dir> --wp "<runner>" --admin <login> --site-url <url>
//        [--page-map page-map.json] [--keep-draft <id>]… [--stand-options tracy_style,claude_cowork_token]
//        [--data facts.json] [--apply] [--json]
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  cli,
  parseArgs,
  wpRunner,
  startDeadline,
  classifyPrune,
  walkWebroot,
  readDefine,
  parseRefs,
  REFS_PHP,
  ownersPhp,
  parseOwners,
  staleRemoval,
  readSearchViews,
  parseKeepDrafts,
  keepDraftProblems,
  UsageError,
  DB_CONSTANTS,
  SALT_CONSTANTS
} from './lib.mjs'
import { collectUsermeta, withUsermetaRefs, deleteUnreferenced } from './prune-usermeta.mjs'

const SPEC = {
  '--webroot': { placeholder: 'dir', help: 'the stand webroot (the bind mount)' },
  '--wp': {
    placeholder: 'runner',
    help: 'wp-cli runner for the stand, e.g. "docker compose -p tracy-base-wp7 run --rm -T cli"'
  },
  '--admin': { placeholder: 'login', help: 'the one user the quickstart ships', default: 'tracyagent' },
  '--keep-user': {
    placeholder: 'login',
    repeat: true,
    help: 'an author the spec declares — kept as content (repeatable)'
  },
  '--site-url': {
    placeholder: 'url',
    help: 'the stand address export-db rewrites to the placeholder (what siteurl/home must equal)'
  },
  '--stand-options': {
    placeholder: 'a,b',
    help: 'options that belong to the build, never the product',
    default: 'tracy_style,claude_cowork_token,tracy_access_aud,tracy_access_team_domain'
  },
  '--page-map': {
    placeholder: 'file',
    help: "the site's page-map.json: the seeder's draft at a search view's path is kept"
  },
  '--keep-draft': {
    placeholder: 'id',
    repeat: true,
    help: 'a draft page decided on: keep it as a draft (repeatable; recorded in the report)'
  },
  '--data': { placeholder: 'facts.json', help: 'pre-collected facts instead of a live stand' },
  '--dump-facts': { placeholder: 'file', help: 'write the collected facts (to build a fixture)' },
  '--apply': { value: false, help: 'perform the PRUNE removals' },
  '--json': { value: false, help: 'machine-readable report' },
  '--timeout': { placeholder: 's', default: '900', help: 'seconds for the whole audit; past it the run ends with exit 1' }
}

/**
 * Text files of the installed themes (a part or pattern may name an uploads file by URL). Read
 * whole, whatever their size: classifyMedia takes this list as every theme file there is, so one
 * left out (a large built bundle) would make the image only it names an orphan to delete.
 */
function themeTexts(webroot) {
  const root = path.join(webroot, 'wp-content', 'themes')
  const out = []
  const visit = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, name.name)
      if (name.isDirectory()) {
        if (name.name !== 'node_modules' && !name.name.startsWith('.')) visit(abs)
      } else if (name.isFile() && /\.(html|php|json|css|js|svg)$/i.test(name.name))
        out.push({ rel: path.relative(webroot, abs).split(path.sep).join('/'), text: readFileSync(abs, 'utf8') })
    }
  }
  if (existsSync(root)) visit(root)
  return out
}

/**
 * Everything that can name an attachment, read in one `wp eval` (lib.mjs REFS_PHP; reads only).
 * A failed call is `{error}` and classifyMedia turns it into UNKNOWN — never into orphans.
 */
export function collectMedia({ wp, webroot }) {
  const r = wp(['eval', REFS_PHP], { allowFail: true, raw: true })
  if (r?.status !== 0) return { error: `wp eval exited ${r?.status ?? '?'}: ${String(r?.stderr ?? '').trim().split('\n').slice(-2).join(' | ')}` }
  const media = parseRefs(r.stdout)
  if (!media.error) media.files = themeTexts(webroot)
  // User meta names attachments too (the seeder's author avatars); REFS_PHP does not read it.
  if (!media.error) {
    const um = collectUsermeta(wp)
    if (um.error) media.usermetaError = um.error
    else media.usermeta = um.usermeta
  }
  return media
}

// post_type as well as post_status: classifyPrune needs both, and applyPrune re-checks both.
const POST_LIST = ['--ignore_sticky_posts=1', '--fields=ID,post_title,post_type,post_status']

/**
 * Whether each user carries the seeder's author meta (lib.mjs SEEDED_AUTHOR_META): one read-only
 * `wp eval` of ownersPhp, straight from the users and usermeta tables, so every user gets its own
 * yes/no — `[{ ID, user_login, seeded }]`. A call that fails or an answer parseOwners refuses is
 * `{ error }`, and classifyPrune then prunes no user: it cannot tell an author from a builder's account.
 */
function collectAuthorMeta(wp) {
  const r = wp(['eval', ownersPhp()], { allowFail: true, raw: true })
  if (r?.status !== 0) return { error: `wp eval exited ${r?.status ?? '?'}: ${String(r?.stderr ?? '').trim().split('\n').slice(-2).join(' | ')}` }
  const o = parseOwners(r.stdout)
  return o.error ? { error: o.error } : o.users
}

export function collectFacts({ webroot, wp, admin, siteUrl, standOptions, keepUsers = [] }) {
  const names = (rows) => rows.map((r) => r.option_name)
  const users = wp.json(['user', 'list', '--fields=ID,user_login,roles'])
  const sessions = users.map((u) => {
    const out = wp(['user', 'session', 'list', u.user_login, '--format=count']).trim()
    return { user_login: u.user_login, count: Number(out) || 0 }
  })
  const options = {}
  for (const n of ['siteurl', 'home']) options[n] = wp.field(['option', 'get', n])
  const present = []
  for (const n of standOptions) {
    const r = wp(['option', 'get', n], { allowFail: true, raw: true })
    if (r.status === 0) present.push(n)
  }
  const { dropped } = walkWebroot(webroot)
  const files = dropped.filter((d) => existsSync(path.join(webroot, d.rel)) && !/symlink/.test(d.why))
  const config = existsSync(path.join(webroot, 'wp-config.php'))
    ? readFileSync(path.join(webroot, 'wp-config.php'), 'utf8')
    : ''
  return {
    admin,
    siteUrl,
    options,
    // `--transients`: without it `wp option list` leaves every transient out of its answer, and the
    // audit reported 0 on a stand holding 136 + 7 (WP-CLI 2.12, measured 25/09).
    transients: names(wp.json(['option', 'list', '--search=_transient_*', '--transients', '--fields=option_name'])),
    siteTransients: names(wp.json(['option', 'list', '--search=_site_transient_*', '--transients', '--fields=option_name'])),
    standOptions: present,
    // `--ignore_sticky_posts=1`: a query that names no archive — `--post_type=any` — is a "home"
    // query to WP_Query, which puts every published sticky post in front of page 1 whatever
    // post_status was asked for. JA Vega's eight featured articles came back as auto-drafts and as
    // trash (M5, 27/09); classifyPrune kept them by their status, the lists still named them.
    revisions: wp.json(['post', 'list', '--post_type=revision', '--post_status=any', ...POST_LIST]),
    autoDrafts: wp.json(['post', 'list', '--post_type=any', '--post_status=auto-draft', ...POST_LIST]),
    trash: wp.json(['post', 'list', '--post_type=any', '--post_status=trash', ...POST_LIST]),
    users,
    keepUsers,
    authorMeta: collectAuthorMeta(wp),
    sessions,
    files,
    media: collectMedia({ wp, webroot }),
    config: {
      salts: SALT_CONSTANTS.every((n) => readDefine(config, n) !== null),
      dbDefined: DB_CONSTANTS.every((n) => readDefine(config, n) !== null)
    }
  }
}

/**
 * Remove what the audit marked PRUNE. Post deletions go in batches — `wp post delete <id…>
 * --force` takes any number of ids — because each runner call is one `docker run` (~3 s): the
 * 150 revisions of a long seed loop took seven minutes one by one, measured 14/09.
 */
const PRUNE_BATCH = 50

const isDestructive = (r) => ['post', 'user'].includes(r.remove?.wp?.[0]) && r.remove.wp[1] === 'delete'

/**
 * Read ownership and status again for `rows` (post and user deletions) and return the ones the stand
 * still matches; each other row becomes UNKNOWN with the reason, and a re-read that failed keeps
 * them all. applyPrune calls it right before EACH user deletion and EACH post batch, not once up
 * front: the audit's reading can be minutes old (a person reads it, then passes --apply), and the
 * deletions before this one take seconds each — a user who became a seeded author, a draft someone
 * published, an id reused in between must not be removed on the older reading.
 */
function stillMatching(wp, rows) {
  let now
  try {
    const ids = rows.filter((r) => r.remove.wp[0] === 'post').map((r) => r.remove.wp[2])
    const res = wp(['eval', ownersPhp(ids)], { allowFail: true, raw: true })
    now = res?.status === 0 ? parseOwners(res.stdout) : { error: `wp eval exited ${res?.status ?? '?'}` }
  } catch (e) {
    now = { error: String(e.message).split('\n')[0] }
  }
  return rows.filter((r) => {
    const stale = staleRemoval(r, now)
    if (!stale) return true
    r.verdict = 'UNKNOWN'
    r.why += ` — not removed: ${stale}`
    return false
  })
}

export function applyPrune(rows, { wp, webroot, batch = PRUNE_BATCH, outcome = {} }) {
  const postRows = []
  for (const r of rows) {
    if (r.verdict !== 'PRUNE' || !r.remove) continue
    if (r.remove.wp) {
      if (!wp) {
        r.why += ' (no --wp runner to apply)'
        continue
      }
      if (r.remove.wp[0] === 'post' && r.remove.wp[1] === 'delete') {
        postRows.push(r)
        continue
      }
      if (isDestructive(r) && !stillMatching(wp, [r]).length) continue
      wp(r.remove.wp)
      r.verdict = 'REMOVED'
    } else if (r.remove.rm) {
      const abs = path.join(webroot, r.remove.rm)
      if (existsSync(abs)) rmSync(abs, { recursive: true, force: true })
      r.verdict = 'REMOVED'
    }
  }
  for (let i = 0; i < postRows.length; i += batch) {
    // An attachment deletion that ended in doubt stops every later deletion; the rows stay PRUNE.
    if (outcome.halt) break
    const chunk = stillMatching(wp, postRows.slice(i, i + batch))
    // An attachment is deleted by one wp call that also checks the user meta for a reference (an
    // avatar set since the audit): no window between the check and the deletion.
    deleteUnreferenced(wp, chunk.filter((r) => r.area === 'attachment'), outcome)
    if (outcome.halt) break
    const rest = chunk.filter((r) => r.area !== 'attachment')
    if (!rest.length) continue
    wp(['post', 'delete', ...rest.map((r) => r.remove.wp[2]), '--force'])
    for (const r of rest) r.verdict = 'REMOVED'
  }
  return rows
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(
      process.argv.slice(2),
      SPEC,
      'usage: prune-audit.mjs --webroot <dir> --wp "<runner>" --admin <login> --site-url <url> [--apply] [--json]'
    )
    let facts
    let wp = null
    // Both read before the stand is: a page-map or a decision that cannot be used stops the audit
    // before anything is collected or removed.
    const keepDrafts = parseKeepDrafts(o.keepDraft ?? [])
    const searchViews = o.pageMap ? readSearchViews(o.pageMap) : null
    const deadline = startDeadline(Number(o.timeout), 'prune-audit')
    if (o.data) facts = JSON.parse(readFileSync(o.data, 'utf8'))
    else {
      if (!o.webroot || !o.wp || !o.siteUrl)
        throw new Error('--webroot, --wp and --site-url are required without --data')
      wp = wpRunner(o.wp, { deadline })
      facts = collectFacts({
        webroot: o.webroot,
        wp,
        admin: o.admin,
        siteUrl: o.siteUrl,
        standOptions: o.standOptions
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        keepUsers: o.keepUser ?? []
      })
    }
    if (o.dumpFacts) writeFileSync(o.dumpFacts, JSON.stringify(facts, null, 2) + '\n')
    // A decision about a page that is not a draft page on this stand is refused, before --apply.
    const problems = keepDraftProblems(facts.media, keepDrafts)
    if (problems.length) throw new UsageError(problems.join('; '))
    let rows = withUsermetaRefs(classifyPrune({ ...facts, searchViews, keepDrafts }), facts.media)
    const outcome = {}
    if (o.apply)
      rows = applyPrune(rows, { wp: wp ?? (o.wp ? wpRunner(o.wp, { deadline }) : null), webroot: o.webroot ?? '.', outcome })
    const prune = rows.filter((r) => r.verdict === 'PRUNE')
    const unknown = rows.filter((r) => r.verdict === 'UNKNOWN')
    const removed = rows.filter((r) => r.verdict === 'REMOVED')
    if (o.json)
      console.log(
        JSON.stringify(
          { rows, prune: prune.length, unknown: unknown.length, removed: removed.length, pageMap: o.pageMap ?? null, keptDrafts: keepDrafts },
          null,
          1
        )
      )
    else {
      // Every draft page is printed, the kept ones too: the reason a draft ships is in the log.
      for (const r of rows)
        if (r.verdict !== 'KEEP' || r.area === 'page:draft')
          console.log(`${r.verdict.padEnd(8)} ${r.area.padEnd(16)} ${String(r.item).padEnd(36)} ${r.why}`)
      console.log(
        `\n${rows.length} checks — ${rows.filter((r) => r.verdict === 'KEEP').length} keep, ${prune.length} prune, ${removed.length} removed, ${unknown.length} to decide`
      )
    }
    if (outcome.halt) console.error(`prune-audit: ${outcome.halt}`)
    return prune.length || outcome.halt ? 1 : 0
  })
