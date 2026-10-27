#!/usr/bin/env node
// A port made with an older version of this skill, held to the gates of this one: a diagnostic first, a
// fixer second.
//
//   node scripts/migrate-port.mjs --run-root <dossier> [--spec <spec-pack>] [--theme-zip <zip>]
//        [--routes <seed report>] [--theme <overlay>] [--pairs <pairs.json>] [--decisions <DECISIONS.md>]
//        [--write] [--report <file.json>] [--examples N]
//
// The cycle's contract preflight (cycle.mjs freshness → release.mjs contractProblems) refuses a dossier whose
// contracts are stale, unbound or invalid. This tool runs THAT function, then asks the validators it calls
// (validateContract, validateDesign, validateExceptionRows, citationErrors — imported, not copied) why each
// row is refused, and groups what it finds into classes. Every class is MECHANICAL (the tool can repair it
// without inventing anything) or MANUAL (a person has to decide), and says why. Nothing is written without
// `--write`.
//
// What is mechanical — only what can be PROVEN:
//   exception-key-derivable   the row cites exactly ONE decision, defined once, and a token of the row's own `match`
//                             that is specific (a selector, a number, a hyphenated id — not a plain word) and that no
//                             other decision mentions is in that decision's text. The token becomes the row's `key`,
//                             in review.config.json `visual.exceptions` (the source the contract copies), and the
//                             validator is run on the row again before the edit counts.
//   visual-contract-stale-    the visual contract is stale, unbound or behind its review.config.json, and rebuilding
//   regenerable               it with the skill's own generator (contract.mjs initContract) from the inputs it records
//                             (spec-pack, seed report, theme zip, overlay, pairs, the page templates it recorded)
//                             reproduces EVERY field but bindings, revision, source.hash and design.exceptions. A
//                             rebuild that differs anywhere else is a different contract, not a refreshed one.
//   design-contract-stale-    the design contract differs from the spec-pack's own design-contract.json in its
//   regenerable               bindings only; `design-contract.mjs adopt` re-binds it.
// What is never done: citing a decision that was not cited, choosing one of several, writing a decision. Those
// rows are listed (id, what the row accepts, the candidates) for a person.
//
// `--write` edits the SOURCE first (review.config.json), regenerates what is generated, writes the old files
// under <run-root>/attempts/migrate-<stamp>/ (a superseded contract goes there too) and validates again. It
// refuses — and writes nothing — when a generated file holds edits it cannot account for (the contract's
// exceptions differ from the review.config.json they were copied from, which has not changed since), or when
// a source file cannot be rewritten byte for byte except for the edit. A second run changes nothing.
//
// The report (`--report <file>.json`, plus <file>.md) lists, per file, what changed and what remains.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStrict, UsageError } from './lib/cli-args.mjs'
import { CANONICAL, identityOf, resolveContract, supersede } from './lib/canonical.mjs'
import { citationErrors, citedDecisionIds, fold, parseDecisions, readSmallFile, validateExceptionRows } from './lib/parity-acceptance.mjs'
import { contractErrors, contractProblems } from './quickstart/release.mjs'
import { initContract } from './visual/contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const obj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const stable = (x) => JSON.stringify(x, (_k, v) => (obj(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v))
const clip = (s, n = 140) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s))

/** Every class the tool knows. `mechanical` is what the tool does with `--write`; `why` is the reason it is or is not. */
export const CLASSES = Object.freeze({
  'exception-key-derivable': { mechanical: true, why: 'the row cites exactly one decision, defined once, and a specific token of its own match appears in that decision and in no other — it becomes the row\'s `key`, and the validator accepts the row again' },
  'exception-key-underivable': { mechanical: false, why: 'the decision exists but nothing specific in the row occurs in it (or the word also occurs in other decisions): whether the decision is about this row is a person\'s call — name what the decision talks about as `key`, or cite another decision' },
  'exception-key-wrong': { mechanical: false, why: 'the row already names a key/selector the cited decision does not mention — the tool does not replace a key a person wrote' },
  'exception-decision-none': { mechanical: false, why: 'the row cites no decision; which decision (if any) justifies it is not in the file' },
  'exception-decision-unknown': { mechanical: false, why: 'the row cites text that is not a decision id (D-n / S-n / D-ns-n)' },
  'exception-decision-missing': { mechanical: false, why: 'the row cites a decision id that DECISIONS.md does not define; the decision cannot be written by a tool' },
  'exception-decision-several': { mechanical: false, why: 'the row cites more than one decision; the tool never picks one' },
  'exception-decision-duplicate': { mechanical: false, why: 'the cited decision id is defined more than once in DECISIONS.md (an amendment or a sub-line that opens with the id); the citation is ambiguous until a person renames or merges them' },
  'exception-malformed': { mechanical: false, why: 'the row breaks a rule that is not about its citation (kind, reason, match, routes, an unmeasured kind)' },
  'exceptions-drift': { mechanical: false, why: 'visual.contract.json holds exceptions that are not the review.config.json ones it was generated from, and that file has not changed since: someone edited the generated file; the tool will not overwrite what it cannot account for' },
  'menu-pair-citation': { mechanical: false, why: 'a declared menu pair cites a decision that does not name its selectors; the selectors are a person\'s statement' },
  'design-exception-citation': { mechanical: false, why: 'a design-contract.json exception cites a decision that does not name its rule; there is no key to add, the rule is the key' },
  'decisions-unreadable': { mechanical: false, why: 'DECISIONS.md is missing or unreadable, so no citation can be checked or fixed; a decision log cannot be reconstructed by a tool' },
  'visual-contract-stale-regenerable': { mechanical: true, why: 'rebuilding the visual contract with the skill\'s generator from the inputs it records reproduces it exactly, apart from bindings, revision and the exceptions' },
  'visual-contract-stale-differs': { mechanical: false, why: 'the visual contract is stale (or behind its source) and a rebuild would differ from it, or cannot be made from the inputs given: it must be re-initialised (contract.mjs init) by a person who has the stand' },
  'design-contract-stale-regenerable': { mechanical: true, why: 'the design contract equals the spec-pack\'s design-contract.json apart from its bindings; adopting it again re-binds it' },
  'design-contract-stale-differs': { mechanical: false, why: 'the design contract differs from the spec-pack\'s design-contract.json (or the pack has none): re-binding would hide the difference' },
  'contract-invalid-other': { mechanical: false, why: 'the validators refuse the contract for a reason that is not an exception citation' },
  'contract-missing': { mechanical: false, why: 'the canonical contract is not in the dossier' },
  'contract-ambiguous': { mechanical: false, why: 'a second candidate sits beside the canonical contract' },
  'contract-unreadable': { mechanical: false, why: 'the contract cannot be read as a JSON object' },
  'contract-group': { mechanical: false, why: 'the contract is a page group\'s, not the site\'s' },
  'spec-unreadable': { mechanical: false, why: 'the spec-pack cannot be read' },
  'spec-missing': { mechanical: false, why: 'no --spec (and no spec/ in the dossier)' },
  'theme-zip-invalid': { mechanical: false, why: 'the theme zip cannot be read' },
  'run-root-missing': { mechanical: false, why: 'no dossier' },
  'routes-invalid': { mechanical: false, why: 'the routes the cycle compares cannot be read' }
})

const PASS_THROUGH = new Set(['contract-missing', 'contract-ambiguous', 'contract-unreadable', 'contract-group', 'spec-unreadable', 'spec-missing', 'theme-zip-invalid', 'run-root-missing'])

class Refusal extends Error {}

// ---------------------------------------------------------------- reading the dossier
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** The review.config.json a visual contract was generated from: the review*config*.json whose hash it recorded, else review.config.json. */
export function configOf(runRoot, contract) {
  const names = existsSync(runRoot) ? readdirSync(runRoot).filter((f) => /^review[.-]config.*\.json$/.test(f)).sort() : []
  const recorded = contract?.bindings?.configHash
  const byHash = recorded ? names.find((n) => sha(readFileSync(path.join(runRoot, n))) === recorded) : null
  const name = byHash ?? (names.includes('review.config.json') ? 'review.config.json' : null)
  if (!name) return null
  const file = path.join(runRoot, name)
  const text = readFileSync(file, 'utf8')
  return { file, name, text, json: JSON.parse(text), unchangedSinceContract: Boolean(byHash) }
}

/**
 * A JSON text read with the offsets of its values: `{start, end, value, members?: [{key, keyStart, node}], items?: node[]}`.
 * The review.config.json files are hand-formatted (short arrays inline), so an edit is made in the text, not by writing
 * the object back.
 */
function parseOffsets(text) {
  let i = 0
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++
  }
  const fail = (m) => {
    throw new Error(`${m} at offset ${i}`)
  }
  const value = () => {
    ws()
    const start = i
    const c = text[i]
    if (c === '{') {
      i++
      const members = []
      ws()
      if (text[i] === '}') i++
      else
        for (;;) {
          ws()
          const keyStart = i
          if (text[i] !== '"') fail('expected a key')
          const k = string()
          ws()
          if (text[i++] !== ':') fail('expected :')
          members.push({ key: JSON.parse(k), keyStart, node: value() })
          ws()
          if (text[i] === ',') i++
          else if (text[i] === '}') {
            i++
            break
          } else fail('expected , or }')
        }
      return { start, end: i, members }
    }
    if (c === '[') {
      i++
      const items = []
      ws()
      if (text[i] === ']') i++
      else
        for (;;) {
          items.push(value())
          ws()
          if (text[i] === ',') i++
          else if (text[i] === ']') {
            i++
            break
          } else fail('expected , or ]')
        }
      return { start, end: i, items }
    }
    if (c === '"') string()
    else {
      const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i))
      if (!m) fail('unexpected token')
      i += m[0].length
    }
    return { start, end: i }
  }
  const string = () => {
    const from = i++
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
    if (text[i] !== '"') fail('unterminated string')
    i++
    return text.slice(from, i)
  }
  const root = value()
  ws()
  if (i !== text.length) fail('trailing characters')
  return root
}
const member = (node, key) => node?.members?.find((m) => m.key === key)?.node

/**
 * `text` with `"key": …` inserted after the `match` of each `visual.exceptions[index]` row — an insertion and nothing
 * else — or null when the text has no such row. The result is parsed again and must equal the original plus those keys.
 */
export function insertKeys(text, edits) {
  const rows = member(member(parseOffsets(text), 'visual'), 'exceptions')?.items
  if (!rows) return null
  const inserts = []
  for (const { index, key } of edits) {
    const row = rows[index]
    const m = row?.members?.find((x) => x.key === 'match')
    if (!m) return null
    const inline = !text.slice(row.start, row.end).includes('\n')
    const lineStart = text.lastIndexOf('\n', m.keyStart) + 1
    const indent = text.slice(lineStart, m.keyStart)
    inserts.push({ at: m.node.end, text: inline ? `, "key": ${JSON.stringify(key)}` : `,\n${/^\s*$/.test(indent) ? indent : '    '}"key": ${JSON.stringify(key)}` })
  }
  let out = text
  for (const ins of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at)
  const want = JSON.parse(text)
  for (const { index, key } of edits) want.visual.exceptions[index].key = key
  if (stable(JSON.parse(out)) !== stable(want)) throw new Refusal('an inserted key would change the file in another way than adding the key')
  return out
}

// ---------------------------------------------------------------- keys a person can check
// Words of a finding's JSON that name its fields or its kind, not the thing it is about.
const STRUCTURAL = new Set(['page', 'axis', 'kind', 'element', 'property', 'expected', 'observed', 'what', 'trigger', 'selector', 'route', 'source', 'site', 'examined', 'sourcecount', 'count', 'value', 'text', 'class', 'region', 'scrollwidth', 'true', 'false', 'null'])
const SPECIFIC = /[0-9._#-]/

/** The literal tokens of a regular expression's source, in order, once each: what the row names. */
export function tokensOf(row) {
  const src = [row.match, ...(Array.isArray(row.selector) ? row.selector : [row.selector])].filter((s) => typeof s === 'string')
  const kind = String(row.kind ?? '').toLowerCase()
  const out = []
  for (const s of src) {
    const plain = s.replace(/\\[bBdDsSwW]/g, ' ').replace(/\\(.)/g, '$1')
    for (const m of plain.matchAll(/[A-Za-z0-9][A-Za-z0-9_.#-]*/g)) {
      const t = m[0].replace(/[.#_-]+$/, '')
      if (t.length >= 4 && !STRUCTURAL.has(t.toLowerCase()) && t.toLowerCase() !== kind && !out.includes(t)) out.push(t)
    }
  }
  return out
}

/**
 * The key a row can be given without guessing: a specific token of the row itself that the cited decision mentions and
 * no other decision does. Longest wins; a tie goes to the one the match names first. Null when there is none.
 */
export function deriveKey(row, id, decisionsParsed, bodies = null) {
  const d = decisionsParsed.decisions.get(id)
  if (!d) return null
  const all = bodies ?? [...decisionsParsed.decisions.values()].map((x) => [x.id, fold(x.text)])
  const mine = fold(d.text)
  const found = tokensOf(row).filter((t) => SPECIFIC.test(t) && mine.includes(fold(t)) && all.filter(([, b]) => b.includes(fold(t))).length === 1)
  if (!found.length) return null
  const key = found.reduce((a, b) => (b.length > a.length ? b : a))
  return validateExceptionRows([{ ...row, key }], decisionsParsed).length ? null : key
}

/** Decisions a person could look at for a row: those it names in its reason, then those that mention a specific token of it. */
function candidatesFor(row, decisionsParsed, limit = 5) {
  const out = new Map()
  for (const id of citedDecisionIds(`${row.reason ?? ''} ${row.decision ?? ''}`)) if (decisionsParsed.decisions.has(id)) out.set(id, 'named in the row')
  for (const t of tokensOf(row).filter((x) => SPECIFIC.test(x)))
    for (const [id, d] of decisionsParsed.decisions) if (out.size < limit && !out.has(id) && fold(d.text).includes(fold(t))) out.set(id, `mentions ${JSON.stringify(t)}`)
  return [...out].slice(0, limit).map(([id, why]) => ({ id, why }))
}

// ---------------------------------------------------------------- one exception row
/**
 * Why a row is refused, as a finding `{class, …}`, or null when the validators accept it. The validators decide whether
 * a row stands; this only names the reason.
 */
export function classifyRow(row, n, { surface, decisions, bodies = null, file = null, fixable = false }) {
  const refusals = validateExceptionRows([row], decisions, { surface })
  if (!refusals.length) return null
  // the validator's own words for the row, without the `surface[n] "kind": ` it prefixes
  const said = (m) => m.slice(m.indexOf('": ') + 3)
  const base = { surface, index: n, kind: row?.kind ?? null, accepts: clip(row?.match ?? ''), decision: row?.decision ?? null }
  if (!obj(row)) return { ...base, class: 'exception-malformed', detail: 'the row is not an object' }
  const structural = validateExceptionRows([row], decisions, { surface, needDecisions: false })
  if (structural.length) return { ...base, class: 'exception-malformed', detail: said(structural[0]) }
  const ids = citedDecisionIds(row.decision)
  if (!ids.length) return { ...base, class: typeof row.decision === 'string' && row.decision.trim() ? 'exception-decision-unknown' : 'exception-decision-none', detail: `cites ${JSON.stringify(row.decision ?? null)}`, candidates: candidatesFor(row, decisions) }
  if (ids.length > 1) return { ...base, class: 'exception-decision-several', detail: `cites ${ids.join(', ')}`, candidates: ids.map((id) => ({ id, why: decisions.decisions.has(id) ? 'cited' : 'cited, not defined' })) }
  const [id] = ids
  if (decisions.duplicates.includes(id)) return { ...base, class: 'exception-decision-duplicate', detail: `${id} is defined more than once`, candidates: [{ id, why: 'defined more than once' }] }
  if (!decisions.decisions.has(id)) return { ...base, class: 'exception-decision-missing', detail: `${id} is not in DECISIONS.md`, candidates: candidatesFor(row, decisions) }
  if (row.key !== undefined || row.selector !== undefined) return { ...base, class: 'exception-key-wrong', detail: citationErrors(row.decision, [row.key, row.selector].flat().filter((k) => typeof k === 'string'), decisions)[0] ?? 'the key is not in the decision', candidates: [{ id, why: 'cited' }] }
  const key = fixable ? deriveKey(row, id, decisions, bodies) : null
  if (key) return { ...base, class: 'exception-key-derivable', detail: `${id} mentions ${JSON.stringify(key)}, which no other decision does`, key, file }
  return { ...base, class: 'exception-key-underivable', detail: clip(said(refusals[0]), 200), candidates: [{ id, why: 'cited' }, ...candidatesFor(row, decisions).filter((c) => c.id !== id)] }
}

// ---------------------------------------------------------------- the visual contract, rebuilt
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })

/** Extract a theme zip into a temp dir; `{dir, theme, cleanup}` where `theme` is the one top-level folder (or dir itself). */
function unzipTheme(zip) {
  const dir = mkdtempSync(path.join(tmpdir(), 'migrate-port-'))
  try {
    sh('unzip', ['-q', zip, '-d', dir])
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`${zip} cannot be unzipped (${String(e.stderr ?? e.message).trim().split('\n')[0]})`)
  }
  const tops = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory())
  return { dir, theme: tops.length === 1 ? path.join(dir, tops[0]) : dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

// What a refreshed contract may change: the bindings it records, its revision, and the exceptions copied from the source.
const refreshable = (c) => {
  const y = structuredClone(c)
  delete y.bindings
  delete y.revision
  if (y.source) delete y.source.hash
  if (y.design) delete y.design.exceptions
  return y
}

/**
 * Rebuild the visual contract with the generator (contract.mjs initContract) from what the contract itself records:
 * its id, source and target origins and hooks, the page templates it recorded (replayed, not re-read from a site), plus
 * the inputs given (spec-pack, config text, seed report, theme zip, overlay, pairs). `{ok, contract, differs[], reason}`:
 * ok only when the rebuild is the same contract in every field but the ones a refresh may change.
 */
export async function rebuildVisual({ old, specDir, configText, configName, routesFile, themeZip, overlay, pairsFile }) {
  if (!themeZip) return { ok: false, reason: 'no --theme-zip: the page templates cannot be checked against the built theme' }
  if (!specDir) return { ok: false, reason: 'no spec-pack' }
  const tmp = mkdtempSync(path.join(tmpdir(), 'migrate-port-cfg-'))
  let unzipped = null
  try {
    unzipped = unzipTheme(themeZip)
    const cfg = path.join(tmp, configName)
    writeFileSync(cfg, configText)
    const templates = Object.fromEntries((old.pages ?? []).filter((p) => p.template).map((p) => [p.id, { template: p.template.replace(/^templates\//, '').replace(/\.html$/, ''), from: p.templateFrom ?? 'site' }]))
    const contract = await initContract({
      specDir,
      configFile: cfg,
      themeDir: overlay ?? null,
      routesFile: routesFile ?? null,
      artifactPath: themeZip,
      id: old.id,
      pairsFile: pairsFile ?? null,
      sourceSite: old.source?.site ?? null,
      sourceLightHook: old.source?.lightHook ?? null,
      sourceDarkRequestHook: old.source?.darkRequestHook ?? null,
      site: old.target?.site ?? null,
      builtTheme: unzipped.theme,
      templates
    })
    contract.bindings.configHash = sha(Buffer.from(configText))
    const a = refreshable(old)
    const b = refreshable(contract)
    const differs = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stable(a[k]) !== stable(b[k]))
    if (differs.includes('design')) {
      const dk = [...new Set([...Object.keys(a.design ?? {}), ...Object.keys(b.design ?? {})])].filter((k) => stable(a.design?.[k]) !== stable(b.design?.[k]))
      differs.splice(differs.indexOf('design'), 1, ...dk.map((k) => `design.${k}`))
    }
    return differs.length ? { ok: false, contract, differs, reason: `a rebuild differs from the contract in ${differs.join(', ')}` } : { ok: true, contract, differs: [] }
  } catch (e) {
    return { ok: false, reason: `the contract cannot be rebuilt (${String(e.message).split('\n')[0]})` }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    unzipped?.cleanup()
  }
}

// ---------------------------------------------------------------- diagnosis
/**
 * Read the dossier and say what is wrong with it. Pure with respect to the dossier: nothing is written (the rebuild
 * works in a temp dir). Returns `{ctx, before, findings, plan}`: `findings` carry their class; `plan` is what `--write` would do.
 */
export async function diagnose(o) {
  const runRoot = path.resolve(o.runRoot)
  const specDir = o.spec ? path.resolve(o.spec) : existsSync(path.join(runRoot, 'spec')) ? path.join(runRoot, 'spec') : null
  const themeZip = o.themeZip ? path.resolve(o.themeZip) : null
  const ctx = { runRoot, specDir, themeZip, routes: o.routes ? path.resolve(o.routes) : null, overlay: o.theme ? path.resolve(o.theme) : null, pairs: o.pairs ? path.resolve(o.pairs) : existsSync(path.join(runRoot, 'pairs.json')) ? path.join(runRoot, 'pairs.json') : null, decisionsFile: o.decisions ? path.resolve(o.decisions) : path.join(runRoot, 'DECISIONS.md') }
  const preflight = contractProblems({ runRoot, specDir, artifactPath: themeZip })
  const before = { ok: preflight.problems.length === 0, problems: preflight.problems }
  const findings = []
  const plan = { configEdits: [], visual: null, design: null, notes: [] }
  const add = (f) => findings.push(f)

  let decisions = null
  try {
    decisions = parseDecisions(readSmallFile(ctx.decisionsFile, 'DECISIONS.md'))
  } catch (e) {
    decisions = null
    ctx.decisionsError = e.message
  }

  // ---- the visual contract
  const visual = readContract(runRoot, 'visual')
  if (visual.contract && !visual.group) {
    const c = visual.contract
    const cfg = (() => {
      try {
        return configOf(runRoot, c)
      } catch {
        return null
      }
    })()
    const rows = c.design?.exceptions ?? []
    const cfgRows = cfg?.json?.visual?.exceptions ?? []
    const inSync = cfg ? stable(rows) === stable(cfgRows) : false
    const editable = Boolean(cfg && (() => { try { return parseOffsets(cfg.text) } catch { return false } })())
    const drift = rows.length > 0 && (!cfg || (!inSync && cfg.unchangedSinceContract))
    if (drift) add({ refuse: Boolean(cfg), class: 'exceptions-drift', surface: 'visual.contract.json design.exceptions', detail: cfg ? `${cfg.name} (unchanged since the contract was generated) holds ${cfgRows.length} exception(s), the contract ${rows.length}` : `the contract holds ${rows.length} exception(s) and no review.config.json they came from is in the dossier`, index: null, kind: null, accepts: '', decision: null })
    // The rows to judge are the CONFIG's when the config is ahead of the contract (the contract is regenerated from it).
    const judged = cfg && !drift ? cfgRows : rows
    if (rows.length || judged.length) {
      if (!decisions) add({ class: 'decisions-unreadable', surface: 'DECISIONS.md', detail: ctx.decisionsError, index: null, kind: null, accepts: '', decision: null })
      else {
        const bodies = [...decisions.decisions.values()].map((x) => [x.id, fold(x.text)])
        const fixable = Boolean(cfg && !drift && editable)
        judged.forEach((row, n) => {
          const f = classifyRow(row, n, { surface: cfg && !drift ? `${cfg.name} visual.exceptions` : 'design.exceptions', decisions, bodies, file: cfg?.name ?? null, fixable })
          if (f) add(f)
        })
        if (cfg && !drift && !editable) plan.notes.push(`${cfg.name} is not JSON this tool can edit in place: no key is written to it`)
        ;(Array.isArray(c.design?.menus?.pairs) ? c.design.menus.pairs : []).forEach((x, n) => {
          const errs = citationErrors(x?.decision, [x?.site, x?.source].filter((v) => typeof v === 'string'), decisions)
          if (errs.length) add({ class: 'menu-pair-citation', surface: 'visual.contract.json design.menus.pairs', index: n, kind: 'menu-pair', accepts: clip(`${x?.site} ↔ ${x?.source}`), decision: x?.decision ?? null, detail: errs[0] })
        })
      }
    }
    const other = contractErrors('visual', c, decisions ?? null).filter((e) => !/^design\.(exceptions|menus\.pairs)\[\d+\]/.test(e))
    if (other.length) add({ class: 'contract-invalid-other', surface: 'visual.contract.json', index: null, kind: null, accepts: '', decision: null, detail: other.slice(0, 3).join('; '), count: other.length })
    plan.configEdits = findings.filter((f) => f.class === 'exception-key-derivable').map((f) => ({ file: cfg.name, index: f.index, key: f.key }))
    plan.cfg = cfg && !drift ? { name: cfg.name, file: cfg.file, text: cfg.text } : null
    // the source moved under the contract (a key written by hand, say): the contract is behind it until it is regenerated
    plan.behind = Boolean(cfg && !drift && !inSync)
  } else if (visual.contract && visual.group) {
    // reported by contractProblems as contract-group
  }

  // ---- staleness: does a refresh reproduce the contract?
  const staleOf = (r) => {
    if (!r.contract || r.group || !specDir) return null
    const id = (() => {
      try {
        return identityOf({ contractPath: r.path, contract: r.contract, specDir, artifactPath: themeZip })
      } catch {
        return null
      }
    })()
    const unbound = typeof r.contract.bindings?.specHash !== 'string'
    return id && (id.stale.length || unbound) ? { stale: id.stale, unbound } : null
  }
  const vStale = staleOf(visual) ?? (plan.behind ? { stale: ['review.config.json changed after the contract was generated'], unbound: false } : null)
  const configBehind = plan.configEdits.length > 0
  if (visual.contract && !visual.group && (vStale || configBehind) && plan.cfg !== undefined) {
    const cfg = plan.cfg
    const useText = cfg ? (configBehind ? insertKeys(cfg.text, plan.configEdits) : cfg.text) : null
    const r = cfg ? await rebuildVisual({ old: visual.contract, specDir, configText: useText, configName: cfg.name, routesFile: ctx.routes, themeZip, overlay: ctx.overlay, pairsFile: ctx.pairs }) : { ok: false, reason: 'the review.config.json the contract was generated from is not in the dossier' }
    plan.visual = { stale: vStale, regenerable: r.ok, reason: r.reason ?? null, differs: r.differs ?? [], contract: r.ok ? r.contract : null }
    if (vStale) add({ class: r.ok ? 'visual-contract-stale-regenerable' : 'visual-contract-stale-differs', surface: 'visual.contract.json', index: null, kind: null, accepts: '', decision: null, detail: `${vStale.unbound ? 'no specHash binding' : vStale.stale.map((s) => s.split(':')[0]).join(', ') + ' moved'}${r.ok ? '' : ` — ${r.reason}`}` })
  }

  // ---- the design contract
  const design = readContract(runRoot, 'design')
  if (design.contract && !design.group) {
    const c = design.contract
    if (decisions && Array.isArray(c.exceptions))
      c.exceptions.forEach((e, n) => {
        const errs = citationErrors(e?.decision, [e?.rule], decisions)
        if (errs.length) add({ class: 'design-exception-citation', surface: 'design-contract.json exceptions', index: n, kind: e?.rule ?? null, accepts: clip(`${e?.page}/${e?.rule}/${e?.variant}`), decision: e?.decision ?? null, detail: errs[0] })
      })
    const dStale = staleOf(design)
    if (dStale) {
      const adopted = specDir && existsSync(path.join(specDir, 'design-contract.json')) ? safeJson(path.join(specDir, 'design-contract.json')) : null
      const same = adopted && stable(withoutBindings(adopted)) === stable(withoutBindings(c))
      plan.design = { stale: dStale, regenerable: Boolean(same) }
      add({ class: same ? 'design-contract-stale-regenerable' : 'design-contract-stale-differs', surface: 'design-contract.json', index: null, kind: null, accepts: '', decision: null, detail: `${dStale.unbound ? 'no specHash binding' : dStale.stale.map((s) => s.split(':')[0]).join(', ') + ' moved'}${same ? '' : adopted ? ' — differs from the spec-pack\'s design-contract.json in ' + Object.keys({ ...withoutBindings(adopted), ...withoutBindings(c) }).filter((k) => stable(withoutBindings(adopted)[k]) !== stable(withoutBindings(c)[k])).join(', ') : ' — the spec-pack has no design-contract.json'}` })
    }
    const errs = contractErrors('design', c, decisions ?? null).filter((e) => !/^Exception \S+\/\S+: /.test(e))
    if (errs.length) add({ class: 'contract-invalid-other', surface: 'design-contract.json', index: null, kind: null, accepts: '', decision: null, detail: errs[0], count: errs.length })
  }

  // ---- whatever the preflight says that none of the above explains
  for (const p of preflight.problems) if (PASS_THROUGH.has(p.code)) add({ class: p.code, surface: 'preflight', index: null, kind: null, accepts: '', decision: null, detail: clip(p.message, 220) })
  return { ctx, before, findings, plan }
}

const withoutBindings = (c) => {
  const { bindings: _b, ...rest } = c
  return rest
}
const safeJson = (file) => {
  try {
    return readJson(file)
  } catch {
    return null
  }
}

/** `{contract, path, group}` of a canonical contract, or `{}` when it cannot be read (the preflight names why). */
function readContract(runRoot, key) {
  try {
    const resolved = resolveContract({ runRoot, name: CANONICAL[key] })
    const contract = readJson(resolved.path)
    return { contract, path: resolved.path, group: Boolean(contract.group) }
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------- the fixer
/** Apply the mechanical part of `plan`, then diagnose again. Throws Refusal (nothing written) when the state is not explained. */
export async function migrate(o) {
  const first = await diagnose(o)
  const { ctx, plan } = first
  if (first.findings.some((f) => f.refuse))
    throw new Refusal('visual.contract.json holds exceptions that are not the ones in the review.config.json it was generated from, and that file has not changed since — refusing to overwrite edits the tool cannot account for (see exceptions-drift)')
  const changes = []
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(ctx.runRoot, 'attempts', `migrate-${stamp}`)
  const keep = (file) => {
    mkdirSync(backup, { recursive: true })
    cpSync(file, path.join(backup, path.basename(file)))
  }
  const cfg = plan.cfg
  let configText = null
  if (plan.configEdits.length) {
    configText = insertKeys(readFileSync(cfg.file, 'utf8'), plan.configEdits)
    if (!configText) throw new Refusal(`${cfg.name} has no visual.exceptions rows to edit`)
  }
  // The visual contract is refreshed when it is stale, or when its source moved under it — and only when the rebuild is exact.
  const wantVisual = Boolean(plan.visual && (plan.visual.stale || plan.configEdits.length))
  if (wantVisual && !plan.visual.regenerable && plan.configEdits.length === 0) plan.notes.push(`visual.contract.json is not regenerated: ${plan.visual.reason}`)
  if (plan.configEdits.length) {
    keep(cfg.file)
    writeFileSync(cfg.file, configText)
    changes.push({ file: cfg.name, what: `set \`key\` on ${plan.configEdits.length} visual.exceptions row(s)`, count: plan.configEdits.length, rows: plan.configEdits.map((e) => ({ index: e.index, key: e.key })) })
  }
  if (wantVisual && plan.visual.regenerable) {
    const visualPath = path.join(ctx.runRoot, CANONICAL.visual)
    const old = readJson(visualPath)
    const next = plan.visual.contract
    next.revision = old.revision
    if (stable(old) !== stable(next)) next.revision = (old.revision ?? 1) + 1
    const moved = supersede({ runRoot: ctx.runRoot, name: CANONICAL.visual, reason: 'migrate-port.mjs regenerated it from the inputs it records' })
    writeFileSync(visualPath, JSON.stringify(next, null, 2) + '\n')
    changes.push({ file: CANONICAL.visual, what: 'regenerated with contract.mjs initContract (bindings, exceptions)', superseded: moved && path.relative(ctx.runRoot, moved) })
  }
  if (plan.design?.regenerable) {
    const args = ['adopt', '--run-root', ctx.runRoot, '--from', path.join(ctx.specDir, 'design-contract.json'), '--spec', ctx.specDir, ...(ctx.themeZip && safeJson(path.join(ctx.runRoot, CANONICAL.design))?.bindings?.artifactHash ? ['--artifact', ctx.themeZip] : [])]
    sh(process.execPath, [path.join(HERE, 'design-contract.mjs'), ...args])
    changes.push({ file: CANONICAL.design, what: 'adopted again from the spec-pack (design-contract.mjs adopt): bindings re-recorded' })
  }
  const after = await diagnose(o)
  return { first, after, changes, backup: changes.length ? path.relative(ctx.runRoot, backup) : null, notes: plan.notes }
}

// ---------------------------------------------------------------- report
const group = (findings) => {
  const by = new Map()
  for (const f of findings) by.set(f.class, [...(by.get(f.class) ?? []), f])
  return [...by].map(([id, list]) => ({ class: id, mechanical: CLASSES[id]?.mechanical ?? false, why: CLASSES[id]?.why ?? '', count: list.reduce((n, f) => n + (f.count ?? 1), 0), findings: list }))
}
const exampleOf = (f) => ({ surface: f.surface, index: f.index, kind: f.kind, accepts: f.accepts, decision: f.decision, detail: f.detail, ...(f.key ? { key: f.key } : {}), ...(f.candidates ? { candidates: f.candidates } : {}) })

/** The JSON report: before/after problems by class, what changed per file, what remains. */
export function reportOf({ first, after = null, changes = [], backup = null, notes = [] }, { examples = 3, write = false } = {}) {
  const summarize = (d) => ({ preflightOk: d.before.ok, preflight: d.before.problems.map((p) => `[${p.code}] ${clip(p.message, 200)}`), classes: group(d.findings).map((g) => ({ class: g.class, mechanical: g.mechanical, why: g.why, count: g.count, examples: g.findings.slice(0, examples).map(exampleOf) })) })
  const remaining = after ?? null
  return { tool: 'migrate-port', runRoot: first.ctx.runRoot, spec: first.ctx.specDir, themeZip: first.ctx.themeZip, mode: write ? 'write' : 'diagnose', before: summarize(first), changes, backup, notes: [...new Set([...first.plan.notes, ...notes])], after: remaining ? summarize(remaining) : null }
}

export function markdownOf(r) {
  const L = [`# migrate-port — ${path.basename(r.runRoot)}`, '', `mode: ${r.mode} · spec: ${r.spec ?? '—'} · theme zip: ${r.themeZip ?? '—'}`, '']
  const section = (title, s) => {
    L.push(`## ${title}`, '', `cycle contract preflight: ${s.preflightOk ? 'passes' : `refuses (${s.preflight.length})`}`, '')
    for (const p of s.preflight) L.push(`- ${p}`)
    if (s.preflight.length) L.push('')
    if (!s.classes.length) L.push('No problem class.', '')
    for (const c of s.classes) {
      L.push(`### ${c.class} — ${c.count} — ${c.mechanical ? 'MECHANICAL' : 'MANUAL'}`, '', c.why, '')
      for (const e of c.examples) L.push(`- ${e.surface}${e.index === null ? '' : `[${e.index}]`} ${e.kind ?? ''} ${e.accepts ? `\`${e.accepts}\`` : ''} — ${e.decision ?? 'no decision'} — ${e.detail ?? ''}${e.key ? ` → key ${JSON.stringify(e.key)}` : ''}${e.candidates?.length ? ` · candidates: ${e.candidates.map((x) => `${x.id} (${x.why})`).join(', ')}` : ''}`)
      L.push('')
    }
  }
  section('Before', r.before)
  if (r.mode === 'write') {
    L.push('## Changed', '')
    if (!r.changes.length) L.push('Nothing.', '')
    for (const c of r.changes) L.push(`- ${c.file}: ${c.what}${c.superseded ? ` (old file: ${c.superseded})` : ''}`)
    if (r.changes.length) L.push('', `Originals: ${r.backup}`, '')
    for (const n of r.notes) L.push(`- note: ${n}`)
    if (r.after) section('After', r.after)
  }
  return L.join('\n') + '\n'
}

function printSummary(r) {
  const say = (s) => console.log(s)
  const show = (title, s) => {
    say(`${title}: cycle contract preflight ${s.preflightOk ? 'PASSES' : `REFUSES (${s.preflight.length} problem(s))`}`)
    for (const p of s.preflight) say(`  ${clip(p, 260)}`)
    for (const c of s.classes) {
      say(`  ${c.mechanical ? 'MECHANICAL' : 'MANUAL    '}  ${c.class} × ${c.count} — ${c.why}`)
      for (const e of c.examples) say(`      · ${e.surface}${e.index === null ? '' : `[${e.index}]`} ${e.kind ?? ''} ${e.accepts ? clip(e.accepts, 70) : ''} — ${e.decision ?? 'no decision'} — ${clip(e.detail ?? '', 110)}${e.key ? ` → key ${JSON.stringify(e.key)}` : ''}${e.candidates?.length ? ` · candidates ${e.candidates.map((x) => x.id).join(', ')}` : ''}`)
    }
  }
  show(r.mode === 'write' ? 'before' : 'diagnosis', r.before)
  if (r.mode === 'write') {
    for (const c of r.changes) say(`changed  ${c.file}: ${c.what}`)
    if (!r.changes.length) say('changed  nothing')
    for (const n of r.notes) say(`note     ${n}`)
    if (r.after) show('after', r.after)
  } else {
    for (const n of r.notes) say(`note     ${n}`)
    say('nothing was written (add --write to apply the MECHANICAL classes)')
  }
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const usage = 'usage: migrate-port.mjs --run-root <dossier> [--spec <spec-pack>] [--theme-zip <zip>] [--routes <seed report>] [--theme <overlay>] [--pairs <pairs.json>] [--decisions <DECISIONS.md>] [--write] [--report <file.json>] [--examples N]'
  try {
    const a = parseStrict(process.argv.slice(2), { values: ['--run-root', '--spec', '--theme-zip', '--routes', '--theme', '--pairs', '--decisions', '--report', '--examples'], flags: ['--write'] })
    if (!a.opt('--run-root')) throw new UsageError('--run-root <dossier> is required')
    const o = { runRoot: a.opt('--run-root'), spec: a.opt('--spec'), themeZip: a.opt('--theme-zip'), routes: a.opt('--routes'), theme: a.opt('--theme'), pairs: a.opt('--pairs'), decisions: a.opt('--decisions') }
    const examples = a.opt('--examples') ? Number(a.opt('--examples')) : 3
    if (!Number.isInteger(examples) || examples < 1) throw new UsageError('--examples must be a positive integer')
    const write = a.flag('--write')
    const result = write ? await migrate(o) : { first: await diagnose(o), after: null, changes: [], backup: null, notes: [] }
    const report = reportOf(result, { examples, write })
    printSummary(report)
    const target = a.opt('--report')
    if (target) {
      mkdirSync(path.dirname(path.resolve(target)), { recursive: true })
      writeFileSync(target, JSON.stringify(report, null, 2) + '\n')
      writeFileSync(target.replace(/\.json$/, '') + '.md', markdownOf(report))
      console.log(`report: ${target} (+ .md)`)
    } else if (write && report.changes.length) {
      const dir = path.join(report.runRoot, report.backup ?? 'attempts')
      writeFileSync(path.join(dir, 'migrate-port.report.json'), JSON.stringify(report, null, 2) + '\n')
      writeFileSync(path.join(dir, 'migrate-port.report.md'), markdownOf(report))
      console.log(`report: ${path.join(dir, 'migrate-port.report.json')} (+ .md)`)
    }
    const final = report.after ?? report.before
    process.exit(final.preflightOk ? 0 : 1)
  } catch (e) {
    console.error(`migrate-port: ${e.message}`)
    if (e instanceof UsageError) console.error(usage)
    process.exit(e instanceof UsageError ? 2 : e instanceof Refusal ? 3 : 2)
  }
}
