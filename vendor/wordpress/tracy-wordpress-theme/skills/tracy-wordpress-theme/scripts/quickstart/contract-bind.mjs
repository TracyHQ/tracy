#!/usr/bin/env node
// Content-contract bind test on a RESTORED quickstart: is this release bound to the content
// contract the receiving platform binds every site built from it to? The plugin answers through
// its own door, `<site>/wp-admin/admin-ajax.php?action=claude_cowork`, JSON in and out:
//   {"token":…,"action":"content.contract","params":{"operation":"bind","contract":"<slug>/wp7/<version>"}}
// after `wp option update claude_cowork_contract <id>`, then `"operation":"inspect"`.
//
// A theme-only fix comes back bound, its changed theme files as PRESENTATION_DRIFT warnings. A release
// that changes content structure the profile addresses (a block removed from a pattern, an entity
// removed or duplicated) is refused with `contract_failed` — that release needs its own profile.
//
// Run it on the restore stand AFTER pack and verify are finished: the packed archives must never
// contain the plugin or its binding, and the plugin install needs the restore's webroot owned by
// uid 33 (restore leaves it root-owned as packed). The token is read from the stand's option
// `claude_cowork_token`, sent in the request body only and removed from everything written or printed.
//
// `--pack <dir>` (the pack whose restore this ran on) and `--theme-zip` bind the evidence to the bytes
// being released: contract-bind.json then records the pack's identity (manifest and both archives, as
// restore.json binds it), the theme zip's sha256 and — for a local `--plugin` zip — the plugin's.
// release.mjs refuses evidence without them.
//
// Exit 0 bound · 3 refused by the plugin (the first five problems are printed) · 1 the tool or the
// transport failed (plugin missing, no token, no JSON answer — never reported as "refused") · 2 usage.
//
// Usage: node contract-bind.mjs --wp "<www-data wp runner>" --site-url <url curl can reach>
//        --contract <slug>/wp7/<version> [--plugin <zip url or path>] [--curl "<curl runner prefix>"]
//        [--root-runner "<root runner>" [--container-webroot /var/www/html] [--runtime-uid 33]]
//        [--pack <dir> --theme-zip <zip>] --out <dir>
//
// With `--root-runner` and `--plugin`, wp-content of the restore is handed to `--runtime-uid` first, as the plugin install needs.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { checkWebrootPath, cli, normalSiteUrl, packIdentity, parseArgs, rootRunner, sha256File, UsageError, wpRunner } from './lib.mjs'

export const TOKEN_OPTION = 'claude_cowork_token'
export const CONTRACT_OPTION = 'claude_cowork_contract'
export const DOOR = '/wp-admin/admin-ajax.php?action=claude_cowork'
export const CONTRACT_RE = /^[a-z0-9][a-z0-9-]*\/wp\d+\/\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?$/

/** A tool or transport failure: never a verdict about the release. */
export class ToolError extends Error {}

const SPEC = {
  '--wp': { required: true, placeholder: 'runner', help: 'wp-cli runner prefix that runs as the fleet www-data (uid 33) on the restore' },
  '--site-url': { required: true, placeholder: 'url', help: 'restored site address as the curl runner reaches it' },
  '--contract': { required: true, placeholder: 'slug/wp7/version', help: 'the content-contract id of this release' },
  '--plugin': { placeholder: 'zip url|path', help: 'install and activate this plugin zip first (else the plugin must be active)' },
  '--root-runner': { placeholder: 'runner', help: 'root runner on the restore webroot (restore.mjs --root-runner): with --plugin, wp-content is chowned to --runtime-uid before the install' },
  '--container-webroot': { placeholder: 'path', default: '/var/www/html', help: 'the restore webroot as the runners see it' },
  '--runtime-uid': { placeholder: 'uid', default: '33', help: "the fleet's www-data uid" },
  '--pack': { placeholder: 'dir', help: 'the pack whose restore this runs on: its identity is recorded in contract-bind.json (release.mjs requires it)' },
  '--theme-zip': { placeholder: 'file', help: 'the theme zip being released: its sha256 is recorded in contract-bind.json (release.mjs requires it)' },
  '--curl': { placeholder: 'runner', default: 'curl', help: 'command prefix that ends in curl and reads the request body on stdin' },
  '--out': { required: true, placeholder: 'dir', help: 'evidence directory: bind-answer.json, inspect-answer.json, contract-bind.json' },
  '--timeout': { placeholder: 'seconds', default: '60', help: 'per HTTP call' }
}

// ---------------------------------------------------------------- the two injectable I/O pieces
/** wp-cli: `(args, {allowFail}) -> {status, stdout, stderr}` over a www-data runner. */
export function wpCall(runner) {
  const wp = wpRunner(runner)
  const call = (args, opts = {}) => {
    const r = wp(args, { raw: true, allowFail: true, ...opts })
    return { status: r.status, stdout: (r.stdout ?? '').replace(/\r/g, ''), stderr: r.stderr ?? '' }
  }
  call.dispose = wp.dispose
  return call
}

/** HTTP: `(url, bodyObject) -> {status, text}` through a curl runner; the body goes in on stdin. */
export function curlPost(runner, { timeout = 60, spawn = spawnSync } = {}) {
  return (url, body) => {
    const r = spawn(
      'sh',
      ['-c', `${runner} "$@"`, 'curl', '-sS', '--max-time', String(timeout), '-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '@-', '-w', '\n%{http_code}', url],
      { encoding: 'utf8', input: JSON.stringify(body), maxBuffer: 1 << 28, env: process.env }
    )
    if (r.error) throw new ToolError(`curl could not run: ${r.error.message}`)
    if (r.status !== 0) throw new ToolError(`curl exited ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-2).join(' | ')}`)
    const out = r.stdout ?? ''
    const cut = out.lastIndexOf('\n')
    return { status: Number(out.slice(cut + 1)) || 0, text: out.slice(0, Math.max(cut, 0)) }
  }
}

// ---------------------------------------------------------------- reading the plugin's answers
const dig = (o, keys) => keys.reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o)
const first = (o, paths) => paths.map((p) => dig(o, p)).find((v) => v !== undefined && v !== null)
const text = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? String(v.message ?? v.error ?? JSON.stringify(v)) : String(v))

/** The error the plugin names, as {code, message}, or null when the answer carries none. */
export function answerError(a) {
  if (!a || typeof a !== 'object') return null
  const e = a.error ?? a.data?.error
  const failed = a.ok === false || a.success === false || a.status === 'error' || e !== undefined
  if (!failed) return null
  const code = typeof e === 'string' ? e : (e?.code ?? a.code ?? a.data?.code ?? 'error')
  return { code: String(code), message: String((typeof e === 'object' ? e?.message : null) ?? a.message ?? a.data?.message ?? code) }
}

/** The messages of the problems a refusal lists. */
export function answerProblems(a) {
  const list = first(a, [['problems'], ['data', 'problems'], ['error', 'problems'], ['result', 'problems'], ['details', 'problems']])
  return Array.isArray(list) ? list.map(text) : []
}

/** Warnings as counts: `{warnings: n, warningCodes: {code: n}}`. */
export function answerWarnings(a) {
  const list = first(a, [['warnings'], ['data', 'warnings'], ['result', 'warnings']])
  const codes = {}
  for (const w of Array.isArray(list) ? list : []) {
    const code = typeof w === 'string' ? w : String(w?.code ?? 'UNCODED')
    codes[code] = (codes[code] ?? 0) + 1
  }
  return { warnings: Array.isArray(list) ? list.length : 0, warningCodes: codes }
}

export function answerEntities(a) {
  const v = first(a, [['entities'], ['data', 'entities'], ['result', 'entities'], ['entityCount'], ['data', 'entityCount']])
  if (Array.isArray(v)) return v.length
  if (v && typeof v === 'object') return Object.keys(v).length
  return Number.isFinite(Number(v)) && v !== undefined && v !== null ? Number(v) : 0
}

function parseAnswer(r, what) {
  let json
  try {
    json = JSON.parse(r.text)
  } catch {
    throw new ToolError(`${what}: no JSON answer (HTTP ${r.status}): ${r.text.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  if (!json || typeof json !== 'object') throw new ToolError(`${what}: the answer is not a JSON object (HTTP ${r.status})`)
  return json
}

// ---------------------------------------------------------------- the bind test
/**
 * @param {{wp: Function, post: Function, contract: string, siteUrl: string, plugin?: string|null, out: string, now?: () => Date, binding?: {pack?: object, themeZipSha256?: string, pluginZipSha256?: string|null}}} p
 *   `binding` is what the evidence records of the artifacts the test ran for (see `bindingOf`); absent keys are not written.
 * @returns {{code: 0|1|3, evidence: object, lines: string[]}} evidence files are written into `out`.
 */
export function runBindTest({ wp, post, contract, siteUrl, plugin = null, out, now = () => new Date(), binding = {} }) {
  const evidence = { tool: 'contract-bind', contract, pluginVersion: null, bound: false, refused: false, alreadyBound: false, error: null, problems: [], warnings: 0, warningCodes: {}, entities: 0, ranAt: null }
  Object.assign(evidence, binding)
  let token = null
  const clean = (s) => (token ? String(s).split(token).join('[token]') : String(s))
  const write = (name, body) => writeFileSync(path.join(out, name), clean(typeof body === 'string' ? body : JSON.stringify(body, null, 2)) + '\n')
  mkdirSync(out, { recursive: true })
  const lines = []
  let code
  try {
    if (plugin) {
      const r = wp(['plugin', 'install', plugin, '--force', '--activate'])
      if (r.status !== 0)
        throw new ToolError(
          `plugin install failed (${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ')}) — the webroot must be owned by uid 33 first${
            existsSync(plugin) ? `, and the runner must see the zip at the same path (a docker runner needs -v ${plugin}:${plugin}:ro)` : ''
          } (references/quickstart.md §Content contract)`
        )
    }
    const list = wp(['plugin', 'list', '--format=json'])
    let plugins = []
    try {
      plugins = JSON.parse(list.stdout || '[]')
    } catch {
      throw new ToolError(`wp plugin list gave no JSON: ${list.stderr.trim().slice(0, 120)}`)
    }
    const found = plugins.find((p) => /cowork/i.test(`${p.name} ${p.title ?? ''}`))
    if (!found) throw new ToolError('the Claude Cowork plugin is not installed — pass --plugin <zip url or path>')
    if (found.status !== 'active') throw new ToolError(`the Claude Cowork plugin ${found.name} is ${found.status}, not active — pass --plugin to install and activate it`)
    evidence.pluginVersion = found.version ?? null

    const got = wp(['option', 'get', TOKEN_OPTION])
    token = got.status === 0 ? got.stdout.trim() : ''
    if (!token) {
      token = null
      throw new ToolError(`no token: option ${TOKEN_OPTION} is empty or missing on this stand`)
    }
    const set = wp(['option', 'update', CONTRACT_OPTION, contract])
    if (set.status !== 0) throw new ToolError(`wp option update ${CONTRACT_OPTION} failed: ${set.stderr.trim().slice(0, 120)}`)

    const url = normalSiteUrl(siteUrl) + DOOR
    const ask = (operation, extra = {}) => ({ token, action: 'content.contract', params: { operation, ...extra } })
    const bindRes = post(url, ask('bind', { contract }))
    const bindAnswer = parseAnswer(bindRes, 'bind')
    write('bind-answer.json', bindAnswer)
    let err = answerError(bindAnswer)
    // A second run on the same restore: the plugin answers `conflict` "already bound to <this contract>".
    // That is the state this test wants, so read it through inspect instead of failing the run.
    if (err?.code === 'conflict' && err.message.includes(`already bound to ${contract}`)) {
      evidence.alreadyBound = true
      err = null
    } else if (err && err.code !== 'contract_failed') throw new ToolError(`bind: the plugin answered ${err.code}: ${err.message}`)
    if (!err && !evidence.alreadyBound && bindRes.status >= 400) throw new ToolError(`bind: HTTP ${bindRes.status} with no error in the answer`)
    if (err) {
      evidence.refused = true
      evidence.error = err.code
      evidence.problems = answerProblems(bindAnswer)
      if (!evidence.problems.length) evidence.problems = [err.message]
      code = 3
    } else {
      const inspectRes = post(url, ask('inspect'))
      const inspectAnswer = parseAnswer(inspectRes, 'inspect')
      write('inspect-answer.json', inspectAnswer)
      const ierr = answerError(inspectAnswer)
      if (ierr) throw new ToolError(`inspect: the plugin answered ${ierr.code}: ${ierr.message}`)
      evidence.bound = true
      Object.assign(evidence, answerWarnings(inspectAnswer), { entities: answerEntities(inspectAnswer) })
      if (!evidence.warnings) Object.assign(evidence, answerWarnings(bindAnswer))
      code = 0
    }
  } catch (e) {
    if (!(e instanceof ToolError)) throw new ToolError(clean(e.message))
    evidence.error = clean(e.message)
    evidence.bound = false
    evidence.refused = false
    code = 1
  }
  evidence.problems = evidence.problems.map(clean)
  evidence.ranAt = now().toISOString()
  write('contract-bind.json', evidence)
  if (code === 0) {
    const codes = Object.entries(evidence.warningCodes).map(([c, n]) => `${c} ${n}`).join(', ')
    lines.push(`contract-bind: ${contract} BOUND${evidence.alreadyBound ? ' (already bound by an earlier run)' : ''} (plugin ${evidence.pluginVersion ?? '?'}) — ${evidence.entities} entities, ${evidence.warnings} warnings${codes ? ` (${codes})` : ''}`)
  } else if (code === 3) {
    lines.push(`contract-bind: ${contract} REFUSED by the plugin (${evidence.error}), ${evidence.problems.length} problems — this release needs its own profile`)
    for (const p of evidence.problems.slice(0, 5)) lines.push(`  ${p}`)
  } else lines.push(`contract-bind: the test did not run to an answer — ${evidence.error}`)
  return { code, evidence, lines }
}

/** Hand wp-content of the restore to the runtime uid, as the plugin install needs; `spawn` is injectable. */
export function ownWpContent({ runner, webroot = '/var/www/html', uid = '33', spawn }) {
  const uidNum = Number(uid)
  if (!Number.isInteger(uidNum) || uidNum <= 0) throw new UsageError('--runtime-uid must be a uid other than 0')
  const root = checkWebrootPath(webroot)
  rootRunner(runner, { spawn })(`chown -R ${uidNum}:${uidNum} "$1"`, { args: [`${root}/wp-content`], what: 'chown of wp-content' })
}

/** The artifact identities the CLI records: the pack (packIdentity), the theme zip, a local plugin zip. */
export function bindingOf({ pack = null, themeZip = null, plugin = null }) {
  const out = {}
  if (pack) out.pack = packIdentity(pack)
  if (themeZip) out.themeZipSha256 = sha256File(themeZip)
  // a plugin given as a URL cannot be hashed here: recorded as null, which release.mjs does not read
  if (plugin) out.pluginZipSha256 = existsSync(plugin) ? sha256File(plugin) : null
  return out
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(process.argv.slice(2), SPEC, 'usage: contract-bind.mjs --wp "<runner>" --site-url <url> --contract <slug>/wp7/<version> [--plugin <zip>] [--curl "<runner>"] [--pack <dir> --theme-zip <zip>] --out <dir>')
    if (!CONTRACT_RE.test(o.contract)) throw new UsageError(`--contract ${JSON.stringify(o.contract)} is not <slug>/wp7/<version>`)
    const timeout = Number(o.timeout)
    if (!Number.isFinite(timeout) || timeout <= 0) throw new UsageError('--timeout must be a positive number of seconds')
    const wp = wpCall(o.wp)
    try {
      if (o.rootRunner && o.plugin) ownWpContent({ runner: o.rootRunner, webroot: o.containerWebroot, uid: o.runtimeUid })
      const { code, lines } = runBindTest({ wp, post: curlPost(o.curl, { timeout }), contract: o.contract, siteUrl: o.siteUrl, plugin: o.plugin ?? null, out: path.resolve(o.out), binding: bindingOf({ pack: o.pack ? path.resolve(o.pack) : null, themeZip: o.themeZip ?? null, plugin: o.plugin ?? null }) })
      for (const l of lines) (code === 1 ? console.error : console.log)(l)
      return code
    } finally {
      wp.dispose?.()
    }
  })
