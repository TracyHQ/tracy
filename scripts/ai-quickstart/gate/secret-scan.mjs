// The secret scan of the release gate (ticket #586): every file that gets published (the kit folder, the blank site
// archive with its demo data, the check record's JSON and HTML) read down to its text and searched by the value-shape
// rules (`secret-rules.mjs`), the CMS adapter (`adapters/joomla-secrets.mjs`) and the pinned gitleaks
// (`secret-gitleaks.mjs`). A finding is `{file, at, rule, fingerprint}`: where it is, which rule saw it, and the first
// 12 hex characters of the value's sha256; the value itself is never kept, printed or written.
//
// A finding the allow file (`check-record/secret-allow.json`, `[{file, rule, fingerprint, why}]`) names exactly is
// allowed, with its reason: a vendor's documentation sample, never a scrub gap. The scan has a negative control: the
// untouched human quickstart installer holds accounts and secrets, so the same rules must find some there; none means
// the scan is blind (`control: 'scan_blind'`). The measurement is `failed` on any finding not allowed, `incomplete`
// when the control is blind or not run, or gitleaks did not run, and `passed` only otherwise.
//
//   node scripts/ai-quickstart/gate/secret-scan.mjs [--kit <AI quickstart folder>] [--blank-site <blank site .zip>]
//     [--files <file or folder>...] [--control <human quickstart .zip>] [--allow <secret-allow.json>]
//     [--cms joomla] [--no-gitleaks] [--out <result.json>]
//
// Kit files are named `kit/<path>`, the blank site archive `blank-site.zip`, any other file by its base name (a
// folder by its name and the path under it). The allow file defaults to the kit's `check-record/secret-allow.json`.
// Exits 0 when the measurement passed, 1 when it did not, 2 on a usage error.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { joomlaSecrets } from './adapters/joomla-secrets.mjs'
import { gitleaksFindings } from './secret-gitleaks.mjs'
import { jsonFindings, textFindings } from './secret-rules.mjs'
import { publishedFiles, textsOf, textsOfFiles } from './secret-sources.mjs'

/** The CMS adapters the scan knows, by platform. */
export const ADAPTERS = Object.freeze({ joomla: joomlaSecrets })

const keyOf = (f) => [f.file, f.at, f.rule, f.fingerprint].join('\0')

/** The findings of one text: the adapter's for a dump, the rules by JSON pointer or by line otherwise. */
export function textSecrets({ file, text }, adapter, unparsed = []) {
  if (adapter?.isDump(file)) {
    try {
      return adapter.sql(file, text)
    } catch {
      // A dump the adapter cannot read is searched line by line, and the measurement cannot pass.
      unparsed.push(file)
    }
  }
  const own = adapter?.file ? adapter.file(file, text) : []
  if (/\.json$/i.test(file)) {
    try {
      return [...own, ...jsonFindings(file, JSON.parse(text))]
    } catch {
      // Not JSON after all: read as lines below.
    }
  }
  return [...own, ...textFindings(file, text)]
}

/** The findings of many texts, each once. */
export function scanTexts(texts, adapter, unparsed = []) {
  const seen = new Map()
  for (const t of texts) for (const f of textSecrets(t, adapter, unparsed)) seen.set(keyOf(f), f)
  return [...seen.values()]
}

/** The allow file's entries, checked: each names a file, a rule, a 12 hex fingerprint and why. */
export function readAllow(file) {
  if (!file || !existsSync(file)) return []
  const entries = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(entries)) throw new Error('the allow file is a list of {file, rule, fingerprint, why}')
  for (const [i, e] of entries.entries()) {
    if (!e.file || !e.rule || !/^[0-9a-f]{12}$/.test(e.fingerprint ?? '') || !String(e.why ?? '').trim())
      throw new Error('allow entry ' + i + ' needs a file, a rule, a 12 hex fingerprint and why')
  }
  return entries
}

/** The findings split by the allow file: `{findings, allowed, unusedAllows}`. */
export function applyAllow(findings, allow = []) {
  const used = new Set()
  const out = { findings: [], allowed: [] }
  for (const f of findings) {
    const i = allow.findIndex(
      (a) => a.file === f.file && a.rule === f.rule && a.fingerprint === f.fingerprint
    )
    if (i === -1) out.findings.push(f)
    else {
      used.add(i)
      out.allowed.push({ ...f, why: allow[i].why })
    }
  }
  return { ...out, unusedAllows: allow.filter((_, i) => !used.has(i)) }
}

const byRule = (findings) => {
  const out = {}
  for (const f of findings) out[f.rule] = (out[f.rule] ?? 0) + 1
  return out
}

/** The negative control: the rules on the untouched human quickstart installer, counted by rule. */
export function controlOf(name, bytes, adapter) {
  const counts = { texts: 0, binary: 0, archives: 0 }
  const found = scanTexts(textsOf(name, bytes, counts), adapter)
  return {
    file: name,
    status: found.length ? 'right' : 'scan_blind',
    findings: found.length,
    byRule: byRule(found)
  }
}

/**
 * The secret scan as a measurement of the check record.
 * @param {{files: {name: string, path: string}[], allow?: object[], control?: {name: string, bytes: Buffer} | null,
 *   cms?: string, gitleaks?: boolean | {bin: string}}} input
 */
export function secretScan({ files, allow = [], control = null, cms = 'joomla', gitleaks = true }) {
  const adapter = ADAPTERS[cms]
  if (!adapter) throw new Error('no secret adapter for ' + cms)
  const scanned = { files: files.length, texts: 0, binary: 0, archives: 0 }
  const unparsed = []
  const found = scanTexts(textsOfFiles(files, scanned), adapter, unparsed)
  const leaks = gitleaks
    ? gitleaksFindings(
        textsOfFiles(files, { texts: 0, binary: 0, archives: 0 }),
        gitleaks === true ? {} : gitleaks
      )
    : { status: 'not_available', reason: 'not asked for' }
  const all = [...found, ...(leaks.findings ?? [])]
  const split = applyAllow([...new Map(all.map((f) => [keyOf(f), f])).values()], allow)
  const ctrl = control ? controlOf(control.name, control.bytes, adapter) : { status: 'not_run' }
  const status = split.findings.length
    ? 'failed'
    : ctrl.status !== 'right' || leaks.status !== 'ran' || unparsed.length
      ? 'incomplete'
      : 'passed'
  return {
    status,
    cms,
    scanned,
    unparsed,
    findings: split.findings,
    byRule: byRule(split.findings),
    allowed: split.allowed,
    unusedAllows: split.unusedAllows,
    gitleaks:
      leaks.status === 'ran'
        ? { status: 'ran', version: leaks.version, findings: leaks.findings.length }
        : { status: leaks.status, reason: leaks.reason },
    control: ctrl
  }
}

/** The files the CLI was given, named as they are published. */
export function filesOfArgs({ kit, blankSite, files = [] }) {
  const out = []
  if (kit)
    for (const f of publishedFiles([kit]))
      out.push({ ...f, name: 'kit/' + f.name.split('/').slice(1).join('/') })
  if (blankSite) out.push({ name: 'blank-site.zip', path: blankSite })
  return [...out, ...publishedFiles(files)]
}

function main(argv) {
  const many = (name) => {
    const at = argv.indexOf(name)
    if (at === -1) return []
    const out = []
    for (let i = at + 1; i < argv.length && !argv[i].startsWith('--'); i += 1) out.push(argv[i])
    return out
  }
  const flag = (name) => many(name)[0] ?? null
  const kit = flag('--kit')
  const files = filesOfArgs({ kit, blankSite: flag('--blank-site'), files: many('--files') })
  if (!files.length || files.some((f) => !existsSync(f.path) || !statSync(f.path).isFile())) {
    console.error(
      'usage: secret-scan.mjs [--kit <folder>] [--blank-site <zip>] [--files <path>...] [--control <zip>]'
    )
    return 2
  }
  const allowFile = flag('--allow') ?? (kit ? path.join(kit, 'check-record', 'secret-allow.json') : null)
  const control = flag('--control')
  const result = secretScan({
    files,
    allow: readAllow(allowFile),
    control: control ? { name: path.basename(control), bytes: readFileSync(control) } : null,
    cms: flag('--cms') ?? 'joomla',
    gitleaks: !argv.includes('--no-gitleaks')
  })
  for (const f of result.findings)
    console.log('finding ' + f.file + ' ' + f.at + ' ' + f.rule + ' ' + f.fingerprint)
  for (const f of result.allowed)
    console.log('allowed ' + f.file + ' ' + f.at + ' ' + f.rule + ' ' + f.fingerprint)
  for (const a of result.unusedAllows)
    console.log('unused allow ' + a.file + ' ' + a.rule + ' ' + a.fingerprint)
  const s = result.scanned
  console.log(
    'secret scan ' +
      result.status +
      ': ' +
      result.findings.length +
      ' finding(s), ' +
      result.allowed.length +
      ' allowed; ' +
      s.files +
      ' file(s), ' +
      s.texts +
      ' text(s), ' +
      s.binary +
      ' binary, ' +
      s.archives +
      ' archive(s); gitleaks ' +
      result.gitleaks.status +
      '; control ' +
      result.control.status +
      (result.control.findings == null ? '' : ' (' + result.control.findings + ' finding(s))')
  )
  if (flag('--out')) writeFileSync(flag('--out'), JSON.stringify(result, null, 1) + '\n')
  return result.status === 'passed' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)))
