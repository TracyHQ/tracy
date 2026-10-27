// One site, one canonical contract — the invariant behind every gate that reads a contract.
//
// A run has a run-root (the site's dossier, `tasks/<site>/`). In it, `design-contract.json` and
// `visual.contract.json` are THE contracts a gate may use. Anything experimental lives under
// `attempts/<id>/` and never becomes a gate input by accident: no tool scans a directory and picks
// a contract; a tool takes `--contract <path>` or `--run-root <dir>` and, when the canonical file is
// missing or a second candidate sits beside it, fails naming what it found. A contract is bound to
// the inputs it was written against (spec-pack, page-map, seed report, artifact) by hash; when any
// of those moved on, the contract is STALE — reports say so and a release refuses it. An old
// canonical is superseded into `attempts/superseded-<stamp>/`, never deleted.
//
// A page group has its own run-root (its dossier) and its own canonical contract there, bound to ITS stand
// and ITS page subset (`group: { id, pages }`). It closes the group; it is never an integration checkpoint
// or a release input (round.mjs and release.mjs refuse it).
//
// Every report that reads a contract carries `identity`: contractPath, contractHash, the source
// (spec-pack) hash, the artifact hash and the capture timestamp — so evidence can be traced to the
// exact contract and inputs it was measured against.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { recordPath, recordText, repoRootOf } from './record-paths.mjs'

export const CANONICAL = Object.freeze({ design: 'design-contract.json', visual: 'visual.contract.json' })
export const ATTEMPTS_DIR = 'attempts'

class ContractError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.details = details
  }
}

export const fileHash = (p) => (existsSync(p) ? `sha256:${createHash('sha256').update(readFileSync(p)).digest('hex')}` : null)
const textHash = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`
/** The hash of a contract's bytes with its own `bindings`/`identity` blocks removed, so re-binding does not move it. */
export function contractHash(contract) {
  const { bindings: _b, identity: _i, ...rest } = contract
  return textHash(JSON.stringify(rest))
}

/** sha256 over the spec-pack's page-map + sections + content, byte for byte (the contract is bound to one spec-pack). */
export function specHash(specDir) {
  const h = createHash('sha256')
  for (const f of ['page-map.json', 'sections.json', 'content.json']) {
    const p = path.join(specDir, f)
    if (!existsSync(p)) throw new ContractError(`spec-pack ${specDir} has no ${f}`)
    h.update(readFileSync(p))
  }
  return `sha256:${h.digest('hex')}`
}

/** Candidates for a contract name: the canonical file, siblings that look like one, attempts. */
export function candidatesFor(runRoot, name) {
  const out = []
  const canonical = path.join(runRoot, name)
  if (existsSync(canonical)) out.push({ path: canonical, kind: 'canonical' })
  const stem = name.replace(/\.json$/, '')
  if (existsSync(runRoot))
    for (const e of readdirSync(runRoot)) {
      const p = path.join(runRoot, e)
      if (e !== name && /\.json$/.test(e) && e.includes(stem.split('.')[0]) && statSync(p).isFile()) out.push({ path: p, kind: 'sibling' })
    }
  const attempts = path.join(runRoot, ATTEMPTS_DIR)
  if (existsSync(attempts))
    for (const id of readdirSync(attempts)) {
      const p = path.join(attempts, id, name)
      if (existsSync(p)) out.push({ path: p, kind: 'attempt', id })
    }
  return out
}

/**
 * The one contract a gate may read. `explicit` (--contract) wins and is reported as such; else the
 * canonical file of the run-root must exist and stand alone. Never picks among candidates.
 */
export function resolveContract({ runRoot = null, name, explicit = null }) {
  if (explicit) {
    if (!existsSync(explicit)) throw new ContractError(`--contract ${explicit}: no such file`)
    const abs = path.resolve(explicit)
    const canonical = runRoot ? path.resolve(runRoot, name) === abs : path.basename(abs) === name && !abs.includes(`${path.sep}${ATTEMPTS_DIR}${path.sep}`)
    return { path: abs, canonical, source: 'explicit' }
  }
  if (!runRoot) throw new ContractError(`no --contract and no --run-root: a gate reads exactly one contract, given by path`)
  const candidates = candidatesFor(runRoot, name)
  const canonical = candidates.find((c) => c.kind === 'canonical')
  const siblings = candidates.filter((c) => c.kind === 'sibling')
  if (!canonical)
    throw new ContractError(
      `${path.join(runRoot, name)} is missing — the run-root has no canonical ${name}` +
        (candidates.length ? `; found ${candidates.map((c) => `${c.kind}: ${c.path}`).join(', ')} — promote one with \`adopt\` or pass --contract` : ''),
      { candidates }
    )
  if (siblings.length)
    throw new ContractError(`${runRoot} holds more than one ${name.split('.')[0]} contract beside the canonical one: ${siblings.map((s) => s.path).join(', ')} — move extras under ${ATTEMPTS_DIR}/<id>/`, { candidates })
  return { path: canonical.path, canonical: true, source: 'canonical', attempts: candidates.filter((c) => c.kind === 'attempt') }
}

/** The bindings a contract records at write time, from the inputs it was written against. */
export function bindingsFrom({ specDir = null, pageMapPath = null, seedReportPath = null, artifactPath = null, configPath = null } = {}) {
  const b = {}
  if (specDir) {
    b.specHash = specHash(specDir)
    const ref = path.join(specDir, 'reference.json')
    if (existsSync(ref)) b.referenceHash = fileHash(ref)
  }
  if (pageMapPath) b.pageMapHash = fileHash(pageMapPath)
  else if (specDir && existsSync(path.join(specDir, 'page-map.json'))) b.pageMapHash = fileHash(path.join(specDir, 'page-map.json'))
  if (seedReportPath) b.seedReportHash = fileHash(seedReportPath)
  if (artifactPath) b.artifactHash = fileHash(artifactPath)
  // review.config.json: the contract copies its rules and `visual.exceptions[]`, so a later edit makes the contract stale
  if (configPath) b.configHash = fileHash(configPath)
  return b
}

/** Reasons a contract is stale against the inputs as they are now: only the bindings it recorded are compared. */
export function stalenessOf(contract, current) {
  const reasons = []
  for (const [k, v] of Object.entries(contract.bindings ?? {})) {
    if (current[k] === undefined) continue
    if (current[k] !== v) reasons.push(`${k}: contract ${v} ≠ now ${current[k]}`)
  }
  return reasons
}

/** The page-group id a contract is scoped to (`contract.mjs init --group`), or null for the site's own contract. */
export const groupIdOf = (contract) => (contract?.group && typeof contract.group.id === 'string' ? contract.group.id : null)

/**
 * A page group's contract is canonical only as THE `visual.contract.json` of the dossier it names (`group.dossier`, written
 * into the hashed body at init): a copy elsewhere, a file under attempts/, or a dossier moved without re-init is not.
 */
export function isGroupCanonicalPath(contractPath, contract) {
  const dossier = contract?.group?.dossier
  if (typeof dossier !== 'string' || !path.isAbsolute(dossier) || !contractPath) return false
  const abs = path.resolve(contractPath)
  if (path.basename(abs) !== CANONICAL.visual) return false
  // nothing on disk (a contract not written yet): only the path can be judged
  if (!existsSync(abs)) return abs === path.join(path.resolve(dossier), CANONICAL.visual)
  try {
    // the exact file: a regular file, not a link to one
    if (!lstatSync(abs).isFile()) return false
    // the exact directory: the dossier itself — a directory of the same name under the same parent, not a link to it
    // (`attempts/` linked to the dossier, or any aliasing component, would otherwise resolve to the same real path)
    const dir = path.dirname(abs)
    const want = path.resolve(dossier)
    if (path.basename(dir) !== path.basename(want) || lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) return false
    return realpathSync(path.dirname(dir)) === realpathSync(path.dirname(want)) && realpathSync(dir) === realpathSync(want)
  } catch {
    return false
  }
}

/** The identity block every report carries. */
export function identityOf({ contractPath, contract, specDir = null, artifactPath = null, seedReportPath = null }) {
  const current = bindingsFrom({ specDir, seedReportPath, artifactPath })
  const stale = stalenessOf(contract, current)
  return {
    contractPath: path.resolve(contractPath),
    contractHash: contractHash(contract),
    canonical: groupIdOf(contract)
      ? isGroupCanonicalPath(contractPath, contract)
      : path.basename(contractPath) in Object.fromEntries(Object.values(CANONICAL).map((n) => [n, 1])) && !path.resolve(contractPath).includes(`${path.sep}${ATTEMPTS_DIR}${path.sep}`),
    sourceHash: current.specHash ?? contract.bindings?.specHash ?? null,
    // null for the site's own contract; a page group's contract names its group — evidence from it is group evidence
    group: groupIdOf(contract),
    referenceHash: current.referenceHash ?? contract.bindings?.referenceHash ?? null,
    seedReportHash: current.seedReportHash ?? contract.bindings?.seedReportHash ?? null,
    artifactHash: current.artifactHash ?? contract.bindings?.artifactHash ?? null,
    stale,
    capturedAt: new Date().toISOString()
  }
}

/**
 * Why a contract's declaration that the source has no dark of its own (`source.darkDerived`) cannot close anything now; empty when
 * it can. It stands only on a contract FRESH for the spec-pack being read — the freshness release.mjs reads (identityOf: every
 * recorded binding against the files as they are now, a specHash binding required) — whose page-map still says `theme.darkDerived`,
 * and with no dark switch on the source. No spec-pack given: nothing to check it against, so it does not stand.
 */
export function darkDerivedProblems(contract, { specDir = null } = {}) {
  const s = contract?.source ?? {}
  if (s.darkDerived !== true) return ['the contract declares no source.darkDerived']
  if (s.darkHook || s.darkRequestHook) return ['the contract names a dark switch for the source as well as source.darkDerived']
  if (!specDir) return ['no spec-pack to check source.darkDerived against']
  if (typeof contract.bindings?.specHash !== 'string') return ['the contract records no specHash binding: its freshness cannot be verified']
  const stale = identityOf({ contractPath: CANONICAL.visual, contract, specDir }).stale
  if (stale.length) return stale.map((r) => `the contract is stale for the spec-pack (${r})`)
  let theme
  try {
    theme = JSON.parse(readFileSync(path.join(specDir, 'page-map.json'), 'utf8')).theme
  } catch (e) {
    return [`page-map.json cannot be read (${e.message})`]
  }
  if (theme?.darkDerived !== true) return ['the page-map no longer declares theme.darkDerived']
  return []
}

/** Move the current canonical into attempts/superseded-<stamp>/ with a note; returns the new path (or null when none). */
export function supersede({ runRoot, name, reason = 'replaced by a new canonical' }) {
  const canonical = path.join(runRoot, name)
  if (!existsSync(canonical)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(runRoot, ATTEMPTS_DIR, `superseded-${stamp}`)
  mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, name)
  renameSync(canonical, dest)
  // the note is kept with the dossier: paths in it are written as lib/record-paths.mjs writes them, not as this machine lays them out
  const paths = { repoRoot: repoRootOf(runRoot) }
  const note = { name, from: recordPath(path.resolve(canonical), paths), at: new Date().toISOString(), reason: recordText(reason, paths), status: 'superseded' }
  writeFileSync(path.join(dir, 'SUPERSEDED.json'), JSON.stringify(note, null, 2) + '\n')
  return dest
}
