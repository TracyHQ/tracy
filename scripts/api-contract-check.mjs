#!/usr/bin/env node
/**
 * Check, against REAL running sites, that the Apply door answers what the contract documents.
 *
 *   node scripts/api-contract-check.mjs --base http://tracy.test:8080 \
 *     --cookie-file <path> --site <key> [--site <key> ...]
 *
 * `--cookie-file` holds the value of a `tracy_sess` cookie (a leading `tracy_sess=` is accepted).
 * Every site is asked, through `POST <base>/api/sites/<site>/apply`:
 *   - `content.read` describe, a listing, the pages view, changes since, not modified and one
 *     record, each checked by the validator of `@tracy/content-api` (the same code the relay and
 *     the plugins' fixtures are held to);
 *   - on Joomla and WordPress with a plugin new enough to say so, that every page row names its
 *     `native` records and that each of them opens with `content.get`;
 *   - two refusals (an unknown `content.read` parameter, an unknown action), and that every
 *     refusal code seen during the run is in the public error table (`api-reference/errors.js`).
 *
 * WHY A SCRIPT AGAINST RUNNING SITES. The validator's own tests run on fixtures; a fixture is what
 * someone believed a plugin answers. Only a call through the real relay into a real plugin proves
 * the three CMS and the relay still agree with the documented shape.
 *
 * READ-ONLY BY CONSTRUCTION. `call()` refuses any action outside `READ_ACTIONS` (plus one action
 * name that exists nowhere, sent to see it refused), so no check can change a site.
 *
 * Prints one PASS / FAIL / SKIP line per check and a summary; exits 1 on any FAIL. A platform no
 * given site covers is reported as SKIP, never counted as passed.
 */
import { readFileSync } from 'node:fs'
import { ERROR_DOCS } from '../apps/tracy-web/src/api-reference/errors.js'
import {
  validateChanges,
  validateContent,
  validateDescribe,
  validatePages
} from '../packages/cms/tracy-content-api/validate.mjs'

const READ_ACTIONS = new Set(['info', 'content.read', 'content.get'])
// Sent only to be refused; it must never name a real action.
const UNKNOWN_ACTION = 'contract-check.no-such-action'
// Plugin versions from which every page row carries `native` (Claude Cowork plugin).
const NATIVE_SINCE = { joomla: '0.18.2', wordpress: '0.14.2' }
const PLATFORMS = ['joomla', 'wordpress', 'emdash']
const DOCUMENTED = new Set(ERROR_DOCS.map((entry) => entry.code))
const TIMEOUT_MS = 120_000

function parseArgs(argv) {
  const out = { base: null, cookieFile: null, sites: [] }
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === '--base') out.base = value
    else if (flag === '--cookie-file') out.cookieFile = value
    else if (flag === '--site') out.sites.push(value)
    else if (flag === '--help' || flag === '-h') out.help = true
    else throw new Error(`unknown argument ${flag}`)
    if (!out.help && (value === undefined || value.startsWith('--'))) throw new Error(`${flag} needs a value`)
    i++
  }
  return out
}

function readCookie(path) {
  const raw = readFileSync(path, 'utf8').trim()
  const named = raw.split(/;\s*/).find((part) => part.startsWith('tracy_sess='))
  return named ? named.slice('tracy_sess='.length) : raw
}

let args
try {
  args = parseArgs(process.argv.slice(2))
  if (args.help || !args.base || !args.cookieFile || args.sites.length === 0)
    throw new Error(
      'usage: node scripts/api-contract-check.mjs --base <url> --cookie-file <path> --site <key> [--site <key> ...]'
    )
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
const base = args.base.replace(/\/+$/, '')
const cookie = readCookie(args.cookieFile)

const tally = { PASS: 0, FAIL: 0, SKIP: 0 }
function report(verdict, site, check, detail = '') {
  tally[verdict]++
  console.log(`${verdict} ${site} ${check}${detail ? ` — ${detail}` : ''}`)
}
const pass = (site, check, detail) => report('PASS', site, check, detail)
const fail = (site, check, detail) => report('FAIL', site, check, detail)
const skip = (site, check, detail) => report('SKIP', site, check, detail)

/** Refusal codes seen per site, from a non-2xx answer or a plugin's `{ok: false}`. */
const seenCodes = new Map()
function codeOf(body) {
  if (!body || typeof body !== 'object') return null
  if (typeof body.code === 'string') return body.code
  if (typeof body.error?.code === 'string') return body.error.code
  if (body.ok === false && typeof body.error === 'string' && /^[A-Z][A-Z0-9_]+$/.test(body.error))
    return body.error
  return null
}

async function call(site, action, params) {
  if (!READ_ACTIONS.has(action) && action !== UNKNOWN_ACTION)
    throw new Error(`refusing to send ${action}: this script only reads`)
  const response = await fetch(`${base}/api/sites/${encodeURIComponent(site)}/apply`, {
    method: 'POST',
    headers: {
      cookie: `tracy_sess=${cookie}`,
      'content-type': 'application/json',
      'user-agent': 'tracy-api-contract-check'
    },
    body: JSON.stringify({ action, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {}
  const code = codeOf(body)
  if (code && (response.status >= 400 || body?.ok === false || body?.error)) {
    if (!seenCodes.has(site)) seenCodes.set(site, new Set())
    seenCodes.get(site).add(code)
  }
  return { status: response.status, body, text }
}

function brief(result) {
  const code = codeOf(result.body)
  if (code)
    return `HTTP ${result.status} ${code}${result.body?.error?.message ? `: ${result.body.error.message}` : ''}`
  return `HTTP ${result.status} ${result.text.slice(0, 160)}`
}

function problems(errors) {
  const shown = errors.slice(0, 3).map((e) => `${e.code} at ${e.path}: ${e.message}`)
  return `${errors.length} problem(s): ${shown.join('; ')}${errors.length > 3 ? '; …' : ''}`
}

/**
 * One validator check: 200, and the validator finds nothing (PASS is the caller's, with details).
 * Returns the answered document even when the validator objected, so later checks that only need
 * a value from it (a version, an id) still run; `valid` says whether this check passed.
 */
async function validated(site, check, params, validate) {
  const result = await call(site, 'content.read', params)
  if (result.status !== 200 || !result.body || codeOf(result.body)) {
    fail(site, check, brief(result))
    return { body: null, valid: false }
  }
  const errors = validate(result.body)
  if (errors.length > 0) fail(site, check, problems(errors))
  return { body: result.body, valid: errors.length === 0 }
}

function atLeast(version, minimum) {
  const parts = (v) => String(v).split(/[.+-]/).slice(0, 3).map(Number)
  const [a, b] = [parts(version), parts(minimum)]
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  return true
}

const covered = new Map()

async function checkSite(site) {
  // describe: also names the platform (`protocol.cowork.kind`), so no other lookup is needed.
  const { body: describe, valid } = await validated(
    site,
    'content.read {describe}',
    { describe: true },
    validateDescribe
  )
  if (!valid) {
    skip(site, 'remaining checks', 'describe did not answer a valid document; nothing else can be judged')
    return
  }
  const platform = describe.protocol?.cowork?.kind ?? 'unknown'
  pass(
    site,
    'content.read {describe}',
    `platform ${platform}, reader ${describe.protocol?.cowork?.capability}`
  )

  // info: the plugin version decides whether `native` is owed.
  let component = null
  if (platform === 'joomla' || platform === 'wordpress') {
    const info = await call(site, 'info', {})
    component = info.body?.info?.component ?? null
    if (info.status === 200 && info.body?.ok === true && typeof component === 'string')
      pass(site, 'info', `plugin ${component}`)
    else fail(site, 'info', brief(info))
  } else skip(site, 'info', `${platform} has no Claude Cowork plugin to ask`)

  // A site whose CMS has no content reader answers every read with this documented refusal: that
  // is the contract for such a site, so its reads are skipped by name, never passed.
  const probe = await call(site, 'content.read', { type: 'page', limit: 1 })
  if (codeOf(probe.body) === 'CONTENT_ADAPTER_UNSUPPORTED')
    skip(site, 'content reads', `the site has no content reader (${brief(probe)})`)
  else await readChecks(site, platform, component)

  // Refusals: exact status and code, and the content refusal in the documented error shape.
  const badQuery = await call(site, 'content.read', { type: 'page', notAParameter: 1 })
  if (badQuery.status !== 400 || codeOf(badQuery.body) !== 'CONTENT_BAD_QUERY')
    fail(
      site,
      'refusal: unknown content.read parameter',
      `expected 400 CONTENT_BAD_QUERY, got ${brief(badQuery)}`
    )
  else {
    const errors = validateContent(badQuery.body)
    if (errors.length > 0) fail(site, 'refusal: unknown content.read parameter', problems(errors))
    else pass(site, 'refusal: unknown content.read parameter', brief(badQuery))
  }
  const unknown = await call(site, UNKNOWN_ACTION, {})
  if (unknown.status !== 400 || codeOf(unknown.body) !== 'ACTION_NOT_ALLOWED')
    fail(site, 'refusal: unknown action', `expected 400 ACTION_NOT_ALLOWED, got ${brief(unknown)}`)
  else pass(site, 'refusal: unknown action', brief(unknown))
}

async function readChecks(site, platform, component) {
  const { body: listing, valid: listed } = await validated(
    site,
    'content.read {type:page, limit:3}',
    { type: 'page', limit: 3 },
    validateContent
  )
  if (listed) pass(site, 'content.read {type:page, limit:3}', `${listing.contents?.length ?? 0} content(s)`)

  const { body: pages, valid: paged } = await validated(
    site,
    'content.read {view:pages}',
    { view: 'pages' },
    validatePages
  )
  if (paged)
    pass(
      site,
      'content.read {view:pages}',
      `${pages.pages.length} page(s), version ${pages.version ?? 'none'}`
    )
  // Only a successful pages view counts toward platform coverage.
  if (paged) covered.set(platform, [...(covered.get(platform) ?? []), site])

  const version = pages?.version
  if (typeof version !== 'string') {
    const why = pages ? 'the pages view answered no version' : 'the pages view failed'
    ;(pages ? fail : skip)(site, 'content.read {changedSince}', why)
    skip(site, 'content.read {ifVersion}', why)
  } else {
    const { body: changes, valid: changed } = await validated(
      site,
      'content.read {changedSince}',
      { changedSince: version },
      validateChanges
    )
    if (changed)
      pass(
        site,
        'content.read {changedSince}',
        `${changes.changed.length} changed, ${changes.removed.length} removed`
      )
    const same = await call(site, 'content.read', { view: 'pages', ifVersion: version })
    const errors = same.status === 200 && same.body ? validateContent(same.body) : []
    if (same.status !== 200 || same.body?.notModified !== true)
      fail(site, 'content.read {ifVersion}', brief(same))
    else if (errors.length > 0) fail(site, 'content.read {ifVersion}', problems(errors))
    else if (same.body.version !== version)
      fail(
        site,
        'content.read {ifVersion}',
        `notModified with version ${same.body.version}, asked ${version}`
      )
    else pass(site, 'content.read {ifVersion}', 'notModified')
  }

  const id = listing?.contents?.[0]?.id ?? pages?.pages?.[0]?.id
  if (typeof id !== 'string') skip(site, 'content.read {id}', 'no content listed to read')
  else {
    const { body: one, valid: read } = await validated(site, 'content.read {id}', { id }, validateContent)
    if (one && one.contents?.[0]?.id !== id)
      fail(site, 'content.read {id}', `asked ${id}, answered ${one.contents?.[0]?.id ?? 'no content'}`)
    else if (read) pass(site, 'content.read {id}', id)
  }

  await checkNative(site, platform, component, pages)
}

function checkCodes(site) {
  const codes = [...(seenCodes.get(site) ?? [])]
  const missing = codes.filter((code) => !DOCUMENTED.has(code))
  if (missing.length > 0) fail(site, 'refusal codes documented', `not in errors.js: ${missing.join(', ')}`)
  else pass(site, 'refusal codes documented', codes.join(', '))
}

async function checkNative(site, platform, component, pages) {
  const minimum = NATIVE_SINCE[platform]
  if (!minimum) {
    skip(site, 'native + content.get', `content.get is a Joomla/WordPress action; ${platform} is not checked`)
    return
  }
  if (!pages) return skip(site, 'native present', 'the pages view failed')
  if (typeof component !== 'string')
    return skip(site, 'native present', 'plugin version unknown (info failed)')
  if (!atLeast(component, minimum))
    return skip(
      site,
      'native present',
      `plugin ${component} is older than ${minimum}, which first names native`
    )
  const without = pages.pages.filter((row) => !Array.isArray(row.native))
  const entries = new Map()
  for (const row of pages.pages)
    for (const ref of row.native ?? []) {
      const params = ref.id !== undefined ? { kind: ref.kind, id: ref.id } : { kind: ref.kind, key: ref.key }
      entries.set(JSON.stringify(params), params)
    }
  if (without.length > 0)
    fail(site, 'native present', `${without.length} page row(s) without native, e.g. ${without[0].id}`)
  else if (entries.size === 0 && pages.pages.length > 0)
    fail(site, 'native present', 'every page row has an empty native')
  else
    pass(site, 'native present', `${entries.size} distinct native record(s) on ${pages.pages.length} page(s)`)

  let opened = 0
  for (const params of entries.values()) {
    const got = await call(site, 'content.get', params)
    if (got.status === 200 && got.body?.ok === true) opened++
    else fail(site, `content.get ${JSON.stringify(params)}`, brief(got))
  }
  if (entries.size > 0 && opened === entries.size)
    pass(site, 'content.get every native record', `${opened} opened`)
  else if (entries.size === 0) skip(site, 'content.get every native record', 'no native record listed')
}

for (const site of args.sites) {
  try {
    await checkSite(site)
  } catch (error) {
    fail(site, 'run', error?.message ?? String(error))
  }
  checkCodes(site)
}
for (const platform of PLATFORMS) {
  const sites = covered.get(platform)
  if (sites) console.log(`COVERED ${platform}: ${sites.join(', ')}`)
  else skip('-', `platform ${platform}`, 'no --site given is a site of this platform whose pages view passed')
}
console.log(`\n${tally.PASS} passed, ${tally.FAIL} failed, ${tally.SKIP} skipped`)
process.exit(tally.FAIL > 0 ? 1 : 0)
