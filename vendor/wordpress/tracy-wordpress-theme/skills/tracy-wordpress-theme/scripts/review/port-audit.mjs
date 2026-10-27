#!/usr/bin/env node
// port-audit.mjs — the finish gate for what a port can pass every older gate and still get wrong (the two independent
// audits of JA Essence and JA Impact): one run, one report, every class in one place.
//
//   node scripts/review/port-audit.mjs --site <origin> --routes <page-map.json|/a,/b> [--source <origin>]
//        [--decisions DECISIONS.md] [--allow cms-allow.json] [--behavior-reviews behavior-copy.reviews.json]
//        [--exceptions <visual.contract.json|review.config.json|design-contract.json> …] [--accept parity-accepted.json]
//        [--out port-audit.json]
//   node scripts/review/port-audit.mjs --site <origin> --routes <page-map.json> [--source <origin>] --dossier <dir>
//        (--interaction <run>/interaction.json[,…] | --theme-zip <theme.zip>) --out <dir>/port-audit.json
//
// A read-only reporter: it prints what each check found and writes --out. With `--dossier` the inputs are the dossier's OWN files
// (DECISIONS.md, cms-allow.json, behavior-copy.reviews.json, design-contract.json, visual.contract.json, review.config.json,
// parity-accepted.json, page-map.json, reference.json: lib/audit-receipt.mjs DOSSIER_INPUTS) and the report carries a RECEIPT: the hash of every file it read and of
// the interaction record(s) of the run it covers (`--interaction`: the interaction check is part of the audit, and a state that was owed
// and not measured makes it unclean) — or, for a fix release that has no four-tier run, the sha256 of the theme zip (`--theme-zip`).
// The Fast Gate verdict, the group verdict and the release (full and --patch) read that receipt and refuse one that is missing, not
// clean, not current or not of their own dossier (lib/audit-receipt.mjs). A report without --dossier is a report to read.
//
//   cms-leftovers   every declared route: the rendered site names the CMS it was ported from                (content-audit.mjs)
//   behavior-copy   copy that promises behaviour WordPress does not have, each claim REVIEWED                (behavior-copy.mjs)
//   decisions       duplicate ids, and decisions that replace a source feature without a classified declaration
//   exceptions      every exception / acceptance file the tools read: each cites ONE existing decision that names what
//                   it accepts; a contrast or style exception names routes and a selector                  (parity-acceptance.mjs)
//
// Exit 0 only when every check ran and found nothing. 1: a finding or an unmeasured route. 2: a usage or input error.
// Nothing is fetched until every input has been read; nothing is written but --out, atomically.
import { lstatSync } from 'node:fs'
import path from 'node:path'
import { pageHrefs, resolveSourceRoute } from '../lib/source-routes.mjs'
import { fileURLToPath } from 'node:url'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { InputError, readRoutes } from '../lib/routes.mjs'
import { citationErrors, parseDecisions, readSmallFile, substitutionReport, validateAcceptRows, validateExceptionRows } from '../lib/parity-acceptance.mjs'
import { BoundError, advisoriesOf, checksOwed, dossierInventory, readBound, receiptOf, sha256, writeAtomic } from '../lib/audit-receipt.mjs'
import { validateInteractionRecord } from '../visual/interaction-report.mjs'
import { bindReferenceKinds } from '../visual/applicability.mjs'
import { allowlistErrors, auditCmsLeftovers } from './content-audit.mjs'
import { auditBehaviorCopy, reviewErrors } from './behavior-copy.mjs'

export const PORT_AUDIT_TOOL = 'port-audit/1'
const FETCH_TIMEOUT_MS = 20000

const jsonOf = (file, what) => {
  let raw
  try {
    raw = readSmallFile(file, what)
  } catch (e) {
    throw new InputError(e.message)
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new InputError(`${what} ${file}: not valid JSON (${e.message})`)
  }
}

/** The origin of `value`, or an InputError: http(s) only, no path, query or credentials. */
export function originOf(value, what) {
  let u
  try {
    u = new URL(String(value))
  } catch {
    throw new InputError(`${what} ${value}: not a URL`)
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new InputError(`${what} ${value}: needs a bare http(s) origin (no path, query, hash or credentials)`)
  return u.origin
}

/** Errors of one exception / acceptance JSON, by the shape the file has: contract, review.config.json, design contract, parity-accepted. */
export function exceptionSurfaceErrors(json, decisions, file, { allowNone = false } = {}) {
  const out = []
  const tag = (list) => list.map((m) => `${path.basename(file)}: ${m}`)
  let seen = 0
  // a field that is present must be a list: a malformed one is an error even when another list in the same file is valid
  const list = (value, name) => {
    if (value === undefined) return null
    seen++
    if (!Array.isArray(value)) { out.push(...tag([`${name} is present and is not a list`])); return null }
    return value
  }
  const design = list(json?.design?.exceptions, 'design.exceptions')
  if (design) out.push(...tag(validateExceptionRows(design, decisions, { surface: 'design.exceptions' })))
  const visual = list(json?.visual?.exceptions, 'visual.exceptions')
  if (visual) out.push(...tag(validateExceptionRows(visual, decisions, { surface: 'visual.exceptions' })))
  for (const [value, name] of [[json?.design?.menus?.pairs, 'design.menus.pairs'], [json?.visual?.menuPairs, 'visual.menuPairs']]) {
    const pairs = list(value, name)
    if (pairs) pairs.forEach((x, n) => out.push(...tag(citationErrors(x?.decision, [x?.site, x?.source].filter((v) => typeof v === 'string'), decisions).map((m) => `menu pair [${n}]: ${m}`))))
  }
  const rules = list(json?.exceptions, 'exceptions')
  if (rules) {
    rules.forEach((e, n) => {
      if (e && typeof e === 'object' && !Array.isArray(e) && 'rule' in e) out.push(...tag(citationErrors(e.decision, [e.rule], decisions).map((m) => `exception [${n}] ${e.rule ?? '?'}: ${m}`)))
      else if (e && typeof e === 'object' && !Array.isArray(e) && 'kind' in e) out.push(...tag(validateExceptionRows([e], decisions, { surface: `exceptions[${n}]` })))
      else out.push(...tag([`exception [${n}] has neither a rule nor a kind: it is read as nothing`]))
    })
  }
  const accept = list(json?.accept, 'accept')
  if (accept) out.push(...tag(validateAcceptRows(accept, decisions)))
  if (Array.isArray(json)) { seen++; out.push(...tag(validateAcceptRows(json, decisions))) }
  if (!seen && !allowNone) out.push(`${path.basename(file)}: no exception list was found in it (design.exceptions, visual.exceptions, exceptions, accept) — an input that is read as nothing is not a pass`)
  return out
}

/**
 * @param {object} o
 * @param {string} o.site @param {string|null} [o.source]
 * @param {{path: string, status: number|null}[]} o.routes
 * @param {{decisions: string|null, allow: object[]|null, reviews: object[]|null, exceptionFiles: {file: string, json: any}[], interaction?: {file: string, json: any}[], allowNone?: boolean}} o.inputs
 * @param {(url: string) => Promise<{status: number, html: string, url?: string}>} [o.fetchUrl]
 */
export async function runPortAudit({ site, source = null, routes, inputs, scope = 'visual', fetchUrl = defaultFetch }) {
  const checks = {}
  const decisions = inputs.decisions == null ? null : parseDecisions(inputs.decisions)
  let homeHrefs = null
  const sourceHrefs = async () => {
    if (!homeHrefs) {
      const home = await fetchUrl(`${source}/`).catch(() => ({ status: 0, html: '' }))
      homeHrefs = home.status === 200 ? pageHrefs(home.html, source) : []
    }
    return homeHrefs
  }
  const read = (origin) => async (route) => {
    const entry = routes.find((r) => r.path === route)
    let page = await fetchUrl(new URL(route, origin).href)
    // a source without URL rewrite answers its pages under /index.php (the same rule as every live step)
    if (page.status === 404 && origin === source && route !== '/') {
      const found = await resolveSourceRoute(origin, route, { fetchPage: fetchUrl, hrefs: await sourceHrefs() })
      if (found.url) page = { status: 200, html: found.html, url: found.url }
    }
    if (page.url && new URL(page.url).origin !== origin) return { status: 0, html: '' } // left the origin: not this site's page
    // a page the map declares as answering 404 (the error page) is read at that status
    return { status: entry?.status && page.status === entry.status ? 200 : page.status, html: page.html }
  }
  const paths = routes.map((r) => r.path)

  const allowErrors = inputs.allow ? allowlistErrors(inputs.allow, { decisions: decisions ?? undefined }) : []
  checks['cms-leftovers'] = allowErrors.length
    ? { ok: false, error: allowErrors.join('; '), findings: [], unmeasured: [], examined: 0 }
    : await auditCmsLeftovers({ routes: paths, fetchPage: read(site), fetchSource: source ? async (route) => { const p = await read(source)(route); return p.status === 200 ? p.html : null } : async () => null, allow: inputs.allow ?? [], decisions: decisions ?? undefined })

  checks['behavior-copy'] = await auditBehaviorCopy({ routes: paths, fetchPage: read(site), reviews: inputs.reviews ?? [], decisions: decisions ?? undefined })

  if (!decisions) checks.decisions = { ok: false, error: 'no --decisions: the substitution and exception checks have nothing to read', substitutions: [], unresolved: [] }
  else {
    const sub = substitutionReport(decisions)
    const dup = decisions.duplicates
    checks.decisions = { ok: !sub.blocking && !dup.length, duplicates: dup, substitutions: sub.substitutions, unresolved: sub.unresolved, errors: sub.errors, blocking: sub.blocking + dup.length }
  }

  const exceptionErrors = []
  if (inputs.exceptionFiles.length && !decisions) exceptionErrors.push('no --decisions: no exception can be checked against a decision')
  else for (const f of inputs.exceptionFiles) exceptionErrors.push(...exceptionSurfaceErrors(f.json, decisions, f.file, { allowNone: inputs.allowNone }))
  checks.exceptions = { ok: !exceptionErrors.length, files: inputs.exceptionFiles.map((f) => path.basename(f.file)), errors: exceptionErrors }

  // the interaction record(s) of the run this audit covers: the probe's own rules and the attestation of every owed case
  if (inputs.interaction) {
    const errors = []
    let findings = 0
    let notMeasured = 0
    for (const f of inputs.interaction) {
      errors.push(...validateInteractionRecord(f.json, { owed: { site, source, referenceKinds: f.referenceKinds ?? null } }).map((m) => `${path.basename(path.dirname(f.file))}/${path.basename(f.file)}: ${m}`))
      findings += f.json?.findings?.length ?? 0
      notMeasured += f.json?.notMeasured?.length ?? 0
    }
    // findings are advisory (interaction-report.mjs): reported, never an error; a state that was not measured is
    if (notMeasured) errors.push(`${notMeasured} interaction state(s) not measured: a record with an unmeasured state is not clean`)
    checks.interaction = { ok: !errors.length, files: inputs.interaction.length, advisory: findings, notMeasured, errors: errors.slice(0, 20) }
  }

  // only the checks that block this scope count; a fix release carries the bookkeeping classes as advisories (lib/audit-receipt.mjs)
  const owed = checksOwed(scope)
  const blocking = Object.entries(checks).filter(([n, c]) => owed.includes(n) && !c.ok).length
  return {
    tool: PORT_AUDIT_TOOL, site, source, at: new Date().toISOString(), routes: paths, ok: blocking === 0, blocking, checks,
    ...(scope === 'patch' && { advisories: advisoriesOf(checks) })
  }
}

async function defaultFetch(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'user-agent': 'tracy-port-audit' } })
  return { status: res.status, html: await res.text(), url: res.url }
}

/** macOS keeps /tmp, /var and /etc as links into /private: the one place a linked ancestor is ordinary. */
const SYSTEM_ALIAS = (dir) => ['/tmp', '/var', '/etc'].includes(dir)

/** Refuses an output path whose file is a directory or a link, or any of whose ancestors is a link or not a directory (before anything is fetched). */
export function checkOut(file) {
  const target = path.resolve(file)
  const parts = path.dirname(target).split(path.sep).filter(Boolean)
  let dir = path.sep
  for (const part of parts) {
    dir = path.join(dir, part)
    let st
    try {
      st = lstatSync(dir)
    } catch (e) {
      throw new InputError(`--out ${file}: ${e.code === 'ENOENT' ? `the directory ${dir} does not exist` : e.message}`)
    }
    if (st.isSymbolicLink()) {
      if (SYSTEM_ALIAS(dir)) continue
      throw new InputError(`--out ${file}: ${dir} is a symbolic link — the report could be published somewhere else`)
    }
    if (!st.isDirectory()) throw new InputError(`--out ${file}: ${dir} is not a directory`)
  }
  try {
    const st = lstatSync(target)
    if (!st.isFile()) throw new InputError(`--out ${file}: exists and is not a regular file`)
  } catch (e) {
    if (e instanceof InputError) throw e
    if (e.code !== 'ENOENT') throw new InputError(`--out ${file}: ${e.message}`)
  }
}

/** Writes the report atomically: a temporary file next to the target, then a rename. */
export function writeReport(file, report) {
  checkOut(file)
  writeAtomic(file, `${JSON.stringify(report, null, 2)}\n`)
}

const VALUES = ['--site', '--source', '--routes', '--decisions', '--allow', '--behavior-reviews', '--exceptions', '--accept', '--out', '--dossier', '--interaction', '--theme-zip']
const INPUT_FLAGS = ['--decisions', '--allow', '--behavior-reviews', '--exceptions', '--accept']
const MAX_ZIP_BYTES = 512 * 1024 * 1024

export async function main(argv) {
  let args
  try {
    args = parseStrict(argv, { values: VALUES })
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`port-audit: ${e.message}`)
    return 2
  }
  try {
    for (const need of ['--site', '--routes']) if (!args.has(need)) throw new InputError(`port-audit: ${need} is required`)
    const site = originOf(args.opt('--site'), '--site')
    const source = args.has('--source') ? originOf(args.opt('--source'), '--source') : null
    const routes = readRoutes(args.opt('--routes'))
    if (!routes.length) throw new InputError('--routes: no route to audit — a scan of nothing is not clean')
    const startedAt = new Date().toISOString()
    const files = (name) => (args.has(name) ? args.opt(name).split(',').filter(Boolean) : [])
    const jsonBytes = (bytes, file, what) => {
      try {
        return JSON.parse(bytes.toString('utf8'))
      } catch (e) {
        throw new InputError(`${what} ${file}: not valid JSON (${e.message})`)
      }
    }
    const bound = (file, what, max) => {
      try {
        return readBound(file, max ? { max } : {})
      } catch (e) {
        if (e instanceof BoundError) throw new InputError(`${what}: ${e.message}`)
        throw e
      }
    }
    let inputs
    let receiptFor = null
    if (args.has('--dossier')) {
      // the dossier's own files, read once: the bytes audited are the bytes the receipt hashes
      for (const f of INPUT_FLAGS) if (args.has(f)) throw new InputError(`${f} cannot be combined with --dossier: the inputs are the dossier's own files (lib/audit-receipt.mjs)`)
      const dossier = path.resolve(args.opt('--dossier'))
      const inventory = dossierInventory(dossier)
      for (const e of inventory) {
        if (['unsafe', 'oversize', 'unreadable'].includes(e.state)) throw new InputError(`--dossier: ${e.message}`)
        if (e.required && e.state !== 'file') throw new InputError(`--dossier ${dossier}: ${e.name} is required and is not there`)
      }
      const byName = (n) => inventory.find((e) => e.name === n)
      const parsed = (n, what) => (byName(n).state === 'file' ? jsonBytes(byName(n).bytes, n, what) : null)
      const patch = args.has('--theme-zip')
      if (patch && args.has('--interaction')) throw new InputError('--theme-zip (a fix release, no four-tier run) and --interaction (a visual run) are two scopes: name one')
      if (!patch && !args.has('--interaction') && args.has('--out')) throw new InputError('--dossier --out needs the run it covers: --interaction <run>/interaction.json, or --theme-zip <zip> for a fix release')
      const contract = parsed('visual.contract.json', 'visual.contract.json')
      const contractPages = contract?.pages ?? []
      const interaction = patch ? undefined : files('--interaction').map((f) => ({ file: path.resolve(f), r: bound(f, '--interaction') })).map((x) => ({ file: x.file, json: jsonBytes(x.r.bytes, x.file, '--interaction'), hash: sha256(x.r.bytes) }))
      let referenceKinds = null
      if (!patch && args.has('--interaction')) {
        const declaresNone = contractPages.some((p) => p.referenceKind === 'none')
        const claimsNotApplicable = interaction.some((x) => x.json?.coverage?.some((row) => row?.status === 'not-applicable'))
        if (declaresNone || claimsNotApplicable) {
          if (byName('page-map.json').state !== 'file' || byName('reference.json').state !== 'file')
            throw new InputError('interaction N/A needs the dossier page-map.json and reference.json to bind the exemption')
          const pageMap = parsed('page-map.json', 'page-map.json')
          const reference = parsed('reference.json', 'reference.json')
          const binding = bindReferenceKinds(contractPages, pageMap, reference)
          if (binding.errors.length) throw new InputError(binding.errors[0])
          referenceKinds = binding.referenceKinds
        }
      }
      if (interaction) for (const item of interaction) item.referenceKinds = referenceKinds
      const theme = patch ? sha256(bound(args.opt('--theme-zip'), '--theme-zip', MAX_ZIP_BYTES).bytes) : null
      inputs = {
        decisions: byName('DECISIONS.md').bytes.toString('utf8'),
        allow: parsed('cms-allow.json', 'cms-allow.json'),
        reviews: parsed('behavior-copy.reviews.json', 'behavior-copy.reviews.json'),
        exceptionFiles: inventory.filter((e) => e.role === 'acceptance' && e.state === 'file').map((e) => ({ file: path.join(dossier, e.name), json: jsonBytes(e.bytes, e.name, e.name) })),
        allowNone: true,
        ...(interaction ? { interaction } : {})
      }
      receiptFor = (report) => receiptOf({ site, source, routes: report.routes, inventory, interaction: (interaction ?? []).map((x) => x.hash), theme, scope: patch ? 'patch' : 'visual', at: startedAt, advisories: report.advisories ?? null })
    } else {
      for (const f of ['--interaction', '--theme-zip']) if (args.has(f)) throw new InputError(`${f} needs --dossier`)
      const exceptionPaths = [...new Set([...files('--exceptions'), ...files('--accept')].map((f) => path.resolve(f)))]
      const exceptionFiles = exceptionPaths.map((file) => ({ file, json: jsonOf(file, '--exceptions') }))
      const decisionsFile = args.has('--decisions') ? args.opt('--decisions') : null
      const allowFile = args.has('--allow') ? args.opt('--allow') : null
      const reviewsFile = args.has('--behavior-reviews') ? args.opt('--behavior-reviews') : null
      inputs = {
        decisions: decisionsFile ? (() => { try { return readSmallFile(decisionsFile, '--decisions') } catch (e) { throw new InputError(e.message) } })() : null,
        allow: allowFile ? jsonOf(allowFile, '--allow') : null,
        reviews: reviewsFile ? jsonOf(reviewsFile, '--behavior-reviews') : null,
        exceptionFiles,
      }
    }
    const rerrors = reviewErrors(inputs.reviews)
    if (rerrors.length) throw new InputError(`--behavior-reviews: ${rerrors.join('; ')}`)
    if (args.has('--out')) checkOut(args.opt('--out'))
    const report = await runPortAudit({ site, source, routes, inputs, scope: args.has('--theme-zip') ? 'patch' : 'visual' })
    for (const [name, c] of Object.entries(report.checks)) console.log(`${c.ok ? 'ok ' : report.advisories && !checksOwed('patch').includes(name) ? 'WARN' : 'FAIL'} ${name}${c.error ? ` — ${c.error}` : c.findings?.length ? ` — ${c.findings.length} finding(s)` : c.unmeasured?.length ? ` — ${c.unmeasured.length} unmeasured` : c.errors?.length ? ` — ${c.errors[0]}` : ''}`)
    if (receiptFor) report.receipt = receiptFor(report)
    else if (args.has('--out')) console.error('port-audit: no --dossier, so the report is not a receipt: no gate accepts it')
    if (args.has('--out')) writeReport(args.opt('--out'), report)
    return report.ok ? 0 : 1
  } catch (e) {
    if (!(e instanceof InputError)) throw e
    console.error(e.message)
    return 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
