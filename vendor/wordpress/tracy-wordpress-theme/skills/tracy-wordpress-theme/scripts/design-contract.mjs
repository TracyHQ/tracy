#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/design-contract.mjs — WordPress changes: the
// contract a gate reads is the run-root's CANONICAL one (scripts/lib/canonical.mjs) — `--run-root <dir>`
// resolves `<dir>/design-contract.json`, `--contract <file>` names one explicitly; a file picked any
// other way is not a gate input. `adopt --run-root <dir> --from <spec>/design-contract.json` promotes
// the adapter's contract to canonical (the previous one is superseded into attempts/, never deleted)
// and records bindings (spec-pack hash, artifact hash) so a later run can call it stale. Every
// result carries `identity` (contractPath, contractHash, sourceHash, artifactHash, capturedAt, stale).
// Output: one summary line plus the path of the complete JSON result (default: a deterministic file under
// the OS temp dir; `--out FILE` chooses it, never an input). `--json` prints the complete result instead.
/** Versioned design expectations and complete page/variant render coverage. */
import { closeSync, constants as fsConstants, copyFileSync, fstatSync, openSync, readSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { CANONICAL, bindingsFrom, identityOf, resolveContract, supersede } from './lib/canonical.mjs'
import { fileURLToPath } from 'node:url'
import { assertNotProtected, emitResult, summarizeResult, takeOutputFlags } from './lib/cli-output.mjs'
import { citationErrors } from './lib/parity-acceptance.mjs'
import { contractHash } from './content-contract.mjs'
import { diffSnapshots } from './verify-render.mjs'
export { contractHash as designHash }
const obj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const str = (x) => typeof x === 'string' && x.trim().length > 0
const need = (x, message) => {
  if (!x) throw new Error(message)
}
function keys(x, allowed, label) {
  need(obj(x), `${label} must be an object`)
  for (const k of Object.keys(x)) need(allowed.includes(k), `${label}: unknown field ${k}`)
}
function list(x, label) {
  need(
    Array.isArray(x) && x.length > 0 && x.every(str) && new Set(x).size === x.length,
    `${label} must contain distinct strings`
  )
}
function styles(x, label) {
  need(
    obj(x) && Object.keys(x).length > 0 && Object.values(x).every((v) => str(v) && !/(?:var|calc)\(/.test(v)),
    `${label} must contain resolved computed CSS property strings`
  )
}
const own = (x, k) => Object.hasOwn(x, k)
export function validateDesign(c, { decisions } = {}) {
  keys(
    c,
    [
      'schemaVersion',
      'id',
      'revision',
      'source',
      'theme',
      'variants',
      'tokens',
      'rules',
      'coverage',
      'pages',
      'pilotPages',
      'exceptions',
      'pending',
      // bindings: the input hashes the canonical contract was adopted against (lib/canonical.mjs)
      'bindings'
    ],
    'design contract'
  )
  need(
    c.schemaVersion === 1 && str(c.id) && Number.isInteger(c.revision) && c.revision > 0,
    'Invalid design identity/version'
  )
  keys(c.source, ['reference', 'inspiration', 'version', 'capturedAt'], 'source')
  need(
    Object.values(c.source).length === 4 &&
      Object.values(c.source).every(str) &&
      Number.isFinite(Date.parse(c.source.capturedAt)),
    'Pin the reference, inspiration/version and capture time'
  )
  keys(c.theme, ['selector', 'attribute', 'darkValue', 'lightValue'], 'theme')
  need(
    ['selector', 'attribute', 'darkValue', 'lightValue'].every((k) => str(c.theme[k])) &&
      c.theme.darkValue !== c.theme.lightValue,
    'theme requires distinct observed dark/light values'
  )
  need(
    Array.isArray(c.pending) && c.pending.length === 0,
    'Resolve pending design decisions before validation'
  )
  need(Array.isArray(c.variants) && c.variants.length >= 4, 'Declare desktop/mobile in light/dark')
  const variants = new Set()
  for (const v of c.variants) {
    keys(v, ['id', 'mode', 'width', 'height'], 'variant')
    need(str(v.id) && !variants.has(v.id) && ['light', 'dark'].includes(v.mode), 'Invalid/duplicate variant')
    variants.add(v.id)
    need(
      Number.isInteger(v.width) && v.width > 0 && Number.isInteger(v.height) && v.height > 0,
      'Variant dimensions must be positive integers'
    )
  }
  for (const mode of ['light', 'dark'])
    for (const size of ['mobile', 'desktop'])
      need(
        c.variants.some((v) => v.mode === mode && (size === 'mobile' ? v.width <= 430 : v.width >= 1280)),
        `Missing ${mode} ${size} variant`
      )
  need(
    obj(c.tokens) && Object.keys(c.tokens).length === variants.size,
    'Token variants must match viewport/theme variants'
  )
  for (const v of variants) {
    // A variant may declare no root tokens (a LESS/T3 template has none in light mode): `{}` is
    // accepted, and the audit measures the rules instead — but the value is still an object of `--*`
    // names with resolved strings, never a missing key.
    need(obj(c.tokens[v]), `tokens.${v} must be an object`)
    if (Object.keys(c.tokens[v]).length) styles(c.tokens[v], `tokens.${v}`)
    need(
      Object.keys(c.tokens[v]).every((k) => k.startsWith('--')),
      'Use CSS custom property names for tokens'
    )
  }
  need(Array.isArray(c.rules) && c.rules.length > 0, 'Design rules are required')
  const rules = new Map()
  for (const r of c.rules) {
    keys(r, ['id', 'category', 'selector', 'styles'], 'rule')
    need(str(r.id) && !rules.has(r.id) && str(r.selector), 'Invalid/duplicate rule or empty selector')
    rules.set(r.id, r)
    need(['typography', 'color', 'layout', 'component'].includes(r.category), 'Unknown design rule category')
    need(
      obj(r.styles) && Object.keys(r.styles).length === variants.size,
      'Rule styles must cover every variant'
    )
    for (const v of variants) styles(r.styles[v], `${r.id}.${v}`)
  }
  for (const category of ['typography', 'color', 'layout', 'component'])
    need(
      c.rules.some((r) => r.category === category),
      `Missing ${category} rules`
    )
  need(
    Array.isArray(c.coverage) && c.coverage.length > 0,
    'Declare selectors/properties that must be classified'
  )
  for (const group of c.coverage) {
    keys(group, ['selector', 'properties'], 'coverage')
    need(str(group.selector), 'Coverage selector required')
    list(group.properties, 'coverage.properties')
  }
  need(Array.isArray(c.pages) && c.pages.length > 0, 'Page inventory is required')
  const pages = new Set()
  for (const p of c.pages) {
    keys(p, ['id', 'url', 'expectedUrl', 'identity', 'rules', 'requiredRules'], 'page')
    need(str(p.id) && !pages.has(p.id) && str(p.identity), 'Invalid/duplicate page')
    pages.add(p.id)
    for (const key of ['url', 'expectedUrl'])
      need(str(p[key]) && /^https?:$/.test(new URL(p[key]).protocol), `Invalid ${key}`)
    list(p.rules, 'page.rules')
    list(p.requiredRules, 'page.requiredRules')
    for (const id of p.rules) need(rules.has(id), `Unknown rule ${id}`)
    for (const id of p.requiredRules) need(p.rules.includes(id), `Required rule ${id} is not applied`)
  }
  list(c.pilotPages, 'pilotPages')
  for (const p of c.pilotPages) need(pages.has(p), `Unknown pilot page ${p}`)
  need(Array.isArray(c.exceptions), 'exceptions must be an array')
  const exceptions = new Set()
  for (const e of c.exceptions) {
    keys(e, ['page', 'rule', 'variant', 'reason', 'decision', 'styles'], 'exception')
    need(
      pages.has(e.page) &&
        c.pages.find((p) => p.id === e.page).rules.includes(e.rule) &&
        variants.has(e.variant),
      'Exception must name a page/rule/variant in scope'
    )
    need(str(e.reason) && str(e.decision), 'Exception needs rationale and a user/design decision reference')
    // With the dossier's decisions given, the citation names ONE existing decision that is about this rule.
    if (decisions !== undefined) {
      const refusals = citationErrors(e.decision, [e.rule], decisions)
      need(!refusals.length, `Exception ${e.page}/${e.rule}: ${refusals[0]}`)
    }
    const key = JSON.stringify([e.page, e.rule, e.variant])
    need(!exceptions.has(key), 'Duplicate exception')
    exceptions.add(key)
    styles(e.styles, 'exception.styles')
    for (const k of Object.keys(e.styles))
      need(own(rules.get(e.rule).styles[e.variant], k), `Exception adds unknown property ${k}`)
  }
  return c
}
const TARGET_KEYS = ['schemaVersion', 'contractHash', 'origin', 'pages', 'rules', 'coverage', 'theme', 'tokens', 'tokenRoot']
const PAGE_TARGET_KEYS = ['url', 'expectedUrl', 'identity']
const THEME_TARGET_KEYS = ['selector', 'attribute', 'darkValue', 'lightValue']
/**
 * Validate a target map — where and how the SAME contract is measured on a different site (the port,
 * not the source). The contract's expectations (token values, rule styles, coverage properties) are
 * never remapped; only the addresses are: the origin of every page URL, per-page URL / expected URL /
 * identity selector, a rule selector, a coverage selector, the theme hook, the name a source token has
 * on the port (`tokens`: source name → port name) and the element the tokens are read from
 * (`tokenRoot`, default the document root). `contractHash` binds the
 * map to the contract it was written for, so a map for an older contract fails instead of auditing it.
 */
export function validateTarget(c, t) {
  keys(t, TARGET_KEYS, 'target map')
  need(t.schemaVersion === 1, 'target map: schemaVersion must be 1')
  need(t.contractHash === contractHash(c), 'target map: stale — it was written for a different contract (contractHash)')
  if (t.origin !== undefined) {
    need(str(t.origin), 'target map: origin must be a string')
    let u
    try {
      u = new URL(t.origin)
    } catch {
      throw new Error('target map: origin is not a URL')
    }
    need(/^https?:$/.test(u.protocol) && u.origin === t.origin && !u.username, 'target map: origin must be a bare http(s) origin')
  }
  const mapOf = (x, label) => {
    need(x === undefined || obj(x), `target map: ${label} must be an object`)
    return x ?? {}
  }
  for (const [id, m] of Object.entries(mapOf(t.pages, 'pages'))) {
    need(c.pages.some((p) => p.id === id), `target map: unknown page ${id}`)
    keys(m, PAGE_TARGET_KEYS, `target map page ${id}`)
    for (const [k, v] of Object.entries(m)) {
      need(str(v), `target map page ${id}.${k} must be a non-empty string`)
      if (k !== 'identity') need(absoluteHttpUrl(v), `target map page ${id}.${k} must be an absolute http(s) URL`)
    }
    need(Object.keys(m).length > 0, `target map page ${id} maps nothing`)
  }
  for (const [id, sel] of Object.entries(mapOf(t.rules, 'rules'))) {
    need(c.rules.some((r) => r.id === id), `target map: unknown rule ${id}`)
    need(str(sel), `target map rule ${id} must be a non-empty selector`)
  }
  for (const [from, sel] of Object.entries(mapOf(t.coverage, 'coverage'))) {
    need(c.coverage.some((g) => g.selector === from), `target map: unknown coverage selector ${from}`)
    need(str(sel), `target map coverage ${from} must be a non-empty selector`)
  }
  const names = mapOf(t.tokens, 'tokens'),
    known = new Set(Object.values(c.tokens).flatMap((m) => Object.keys(m)))
  for (const [from, to] of Object.entries(names)) {
    need(known.has(from), `target map: unknown token ${from}`)
    need(str(to) && /^--[A-Za-z0-9_-]+$/.test(to), `target map token ${from} must map to a CSS custom property name`)
  }
  const targets = Object.values(names)
  need(new Set(targets).size === targets.length, 'target map: two tokens map to the same port token')
  if (t.tokenRoot !== undefined) need(str(t.tokenRoot), 'target map: tokenRoot must be a non-empty selector')
  if (t.theme !== undefined) {
    keys(t.theme, THEME_TARGET_KEYS, 'target map theme')
    need(Object.keys(t.theme).length > 0 && Object.values(t.theme).every(str), 'target map theme must map strings')
    const th = { ...c.theme, ...t.theme }
    need(th.darkValue !== th.lightValue, 'target map theme requires distinct dark/light values')
  }
  return t
}
export const targetHash = (t) => contractHash(t)
const withOrigin = (url, origin) => (origin ? url.replace(/^https?:\/\/[^/?#]+/, origin) : url)
export function designRequest(c, pageId, variantId, target = null) {
  validateDesign(c)
  if (target) validateTarget(c, target)
  const page = c.pages.find((p) => p.id === pageId),
    variant = c.variants.find((v) => v.id === variantId)
  need(page && variant, 'Unknown page/variant')
  const pm = target?.pages?.[page.id] ?? {}
  const addr = (key) => withOrigin(pm[key] ?? page[key], pm[key] ? null : target?.origin).replaceAll('{mode}', variant.mode)
  return {
    contractId: c.id,
    contractHash: contractHash(c),
    ...(target ? { targetMapHash: targetHash(target) } : {}),
    page: page.id,
    variant: variant.id,
    url: addr('url'),
    expectedUrl: addr('expectedUrl'),
    identity: pm.identity ?? page.identity,
    theme: { ...c.theme, ...target?.theme },
    width: variant.width,
    height: variant.height,
    mode: variant.mode,
    tokens: Object.keys(c.tokens[variant.id]),
    ...(target?.tokens ? { tokenNames: target.tokens } : {}),
    ...(target?.tokenRoot ? { tokenRoot: target.tokenRoot } : {}),
    coverage: c.coverage.map((g) => ({ ...g, selector: target?.coverage?.[g.selector] ?? g.selector })),
    rules: page.rules.map((id) => {
      const rule = c.rules.find((r) => r.id === id)
      const override = c.exceptions.find(
        (e) => e.page === page.id && e.rule === id && e.variant === variant.id
      )
      return {
        id,
        selector: target?.rules?.[id] ?? rule.selector,
        required: page.requiredRules.includes(id),
        properties: Object.keys({ ...rule.styles[variant.id], ...override?.styles })
      }
    })
  }
}
function equalStyle(property, expected, actual) {
  if (typeof actual !== 'string' || !actual.trim()) return false
  const px = /^(-?\d+(?:\.\d+)?)px$/
  const a = expected.match(px),
    b = actual.match(px)
  if (a && b) return Math.abs(Number(a[1]) - Number(b[1])) <= 0.1
  // Exact CSS colors (including alpha) and normalized strings; no permissive color tolerance.
  return (
    diffSnapshots({ rule: { [property]: expected } }, { rule: { [property]: actual } }, { hexTolerance: 0 })
      .mismatches.length === 0
  )
}
/**
 * `scope` audits a named subset of the inventory — a migration that finishes one group of pages
 * before the rest can be accepted without either waiting for the whole matrix or deleting pages
 * from the contract to fake a pass. The report keeps `contractCases` alongside the scoped count,
 * so a partial run can never be quoted as full-site acceptance.
 */
export function auditDesign(c, observations, { pilot = false, scope = null, target = null } = {}) {
  validateDesign(c)
  if (target) validateTarget(c, target)
  need(Array.isArray(observations), 'Observations must be an array')
  need(!(pilot && scope), 'Choose the pilot page set or an explicit scope, not both')
  if (scope !== null) {
    list(scope, 'scope')
    for (const id of scope)
      need(
        c.pages.some((p) => p.id === id),
        `Unknown scope page ${id}`
      )
  }
  const pages = pilot
    ? c.pages.filter((p) => c.pilotPages.includes(p.id))
    : scope
      ? c.pages.filter((p) => scope.includes(p.id))
      : c.pages
  const expected = new Set(pages.flatMap((p) => c.variants.map((v) => JSON.stringify([p.id, v.id]))))
  const seen = new Set(),
    findings = []
  let elements = 0,
    properties = 0
  for (const o of observations) {
    const key = JSON.stringify([o.page, o.variant])
    need(expected.has(key) && !seen.has(key), 'Unexpected or duplicate page/variant observation')
    seen.add(key)
    need(
      o.contractId === c.id && o.contractHash === contractHash(c),
      'Stale/different design contract observation'
    )
    const request = designRequest(c, o.page, o.variant, target),
      v = c.variants.find((v) => v.id === o.variant)
    need(o.url === request.expectedUrl, `Unexpected final URL for ${o.page}`)
    need(
      o.targetMapHash === request.targetMapHash,
      `Observation of ${o.page} was captured ${o.targetMapHash ? 'with a different target map' : 'without the target map'} than the one audited (targetMapHash)`
    )
    need(
      o.width === v.width && o.height === v.height && o.mode === v.mode,
      'Wrong viewport or observed theme'
    )
    need(
      Number.isFinite(Date.parse(o.capturedAt)) &&
        Date.parse(o.capturedAt) >= Date.parse(c.source.capturedAt),
      'Missing/stale capture timestamp'
    )
    need(
      o.fontsReady === true && Number.isInteger(o.identityMatches) && o.identityMatches > 0,
      'Fonts/page identity not ready'
    )
    need(Number.isFinite(o.scrollWidth) && o.scrollWidth > 0, 'Missing page geometry')
    if (o.scrollWidth > o.width + 1)
      findings.push({ page: o.page, variant: o.variant, issue: 'horizontal-overflow' })
    need(
      obj(o.tokens) && Object.keys(o.tokens).length === request.tokens.length,
      'Incomplete token measurements'
    )
    for (const token of request.tokens) {
      properties++
      if (!equalStyle(token, c.tokens[v.id][token], o.tokens[token]))
        findings.push({
          page: o.page,
          variant: o.variant,
          token,
          expected: c.tokens[v.id][token],
          actual: o.tokens[token]
        })
    }
    need(Array.isArray(o.rules) && o.rules.length === request.rules.length, 'Incomplete rule measurements')
    const measured = new Map(o.rules.map((r) => [r.id, r]))
    need(measured.size === o.rules.length, 'Duplicate rule measurements')
    for (const rule of request.rules) {
      const measuredRule = measured.get(rule.id)
      need(measuredRule && Array.isArray(measuredRule.elements), 'Missing rule elements')
      if (rule.required && measuredRule.elements.length === 0)
        findings.push({ page: o.page, variant: o.variant, rule: rule.id, issue: 'zero-matches' })
      const base = c.rules.find((r) => r.id === rule.id).styles[v.id],
        exception = c.exceptions.find((e) => e.page === o.page && e.rule === rule.id && e.variant === v.id),
        values = { ...base, ...exception?.styles }
      need(
        new Set(measuredRule.elements.map((e) => e.path)).size === measuredRule.elements.length,
        'Duplicate measured element identity'
      )
      for (const element of measuredRule.elements) {
        elements++
        need(str(element.path) && obj(element.styles), 'Missing element identity/styles')
        for (const [property, value] of Object.entries(values)) {
          properties++
          if (!equalStyle(property, value, element.styles[property]))
            findings.push({
              page: o.page,
              variant: o.variant,
              rule: rule.id,
              element: element.path,
              property,
              expected: value,
              actual: element.styles[property]
            })
        }
      }
    }
    need(
      Array.isArray(o.unclassified) && Number.isInteger(o.coverageCount) && o.coverageCount > 0,
      'Missing or empty classification coverage'
    )
    for (const item of o.unclassified)
      findings.push({ page: o.page, variant: o.variant, issue: 'unclassified', ...item })
  }
  const missing = [...expected].filter((k) => !seen.has(k)).map((k) => JSON.parse(k))
  need(elements > 0 && properties > 0, 'No elements were measured')
  return {
    ok: missing.length === 0 && findings.length === 0,
    scope: pilot ? 'pilot' : scope ? 'partial' : 'full',
    expectedCases: expected.size,
    observedCases: seen.size,
    contractCases: c.pages.length * c.variants.length,
    scopePages: pages.map((p) => p.id),
    elements,
    properties,
    missing,
    findings,
    contractHash: contractHash(c),
    ...(target ? { targetMapHash: targetHash(target) } : {})
  }
}
/** A bare absolute http(s) URL in its literal form (`scheme://host…`: a non-empty authority, no whitespace or backslash): `new URL()` alone would repair `http:host/x` or `http:\\host`. */
function absoluteHttpUrl(v) {
  if (typeof v !== 'string' || !/^https?:\/\/[^\s\\/?#]+(?:[/?#][^\s\\]*)?$/i.test(v)) return false
  try {
    const u = new URL(v)
    return /^https?:$/.test(u.protocol) && Boolean(u.hostname) && !u.username && !u.password
  } catch {
    return false
  }
}
/**
 * Read a JSON file that must be a regular file (not a link) with JSON. The file is opened ONCE — no
 * follow, no block — and judged by the descriptor it gave, then read within the bound from that
 * descriptor: a path swapped for a link, a FIFO or a larger file after the check is never followed.
 */
/**
 * The first key an object of this (already valid) JSON text repeats, or null. JSON.parse keeps the last
 * of two equal keys, so a mapping written twice would otherwise be read as one.
 */
export function duplicateJsonKey(text) {
  const stack = []
  const re = /\s+|"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s"{}[\],:]+/gy
  let prev = null
  let end = 0
  for (let m; (m = re.exec(text)); ) {
    const t = m[0]
    end = m.index + t.length
    if (t === '{') stack.push(new Set())
    else if (t === '[') stack.push(null)
    else if (t === '}' || t === ']') stack.pop()
    else if (t[0] === '"' && stack.at(-1) && (prev === '{' || prev === ',')) {
      const k = JSON.parse(t)
      if (stack.at(-1).has(k)) return k
      stack.at(-1).add(k)
    }
    if (!/^\s/.test(t)) prev = t
  }
  // the scan must reach the end of the text: stopping early would leave the rest unchecked
  if (end !== text.length) throw new Error('duplicate-key scan stopped before the end of the JSON text')
  return null
}
function readJsonFile(file, label) {
  const MAX = 4 * 1024 * 1024
  let fd
  try {
    fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`${label} ${file}: no such file`)
    throw new Error(`${label} ${file}: not a non-empty regular file (no link) of at most 4 MB`)
  }
  try {
    const st = fstatSync(fd)
    need(st.isFile() && st.size > 0 && st.size <= MAX, `${label} ${file}: not a non-empty regular file (no link) of at most 4 MB`)
    const buf = Buffer.alloc(MAX + 1)
    let n = 0
    for (let r; n < buf.length && (r = readSync(fd, buf, n, buf.length - n, null)) > 0; ) n += r
    need(n > 0 && n <= MAX, `${label} ${file}: not a non-empty regular file (no link) of at most 4 MB`)
    // complete: the bytes read are the file that was judged, not a file that shrank, grew or was rewritten meanwhile
    const after = fstatSync(fd)
    need(n === st.size && after.size === st.size && after.mtimeMs === st.mtimeMs, `${label} ${file}: changed while it was read`)
    const text = buf.toString('utf8', 0, n)
    let value
    try {
      value = JSON.parse(text)
    } catch {
      throw new Error(`${label} ${file}: not valid JSON`)
    }
    const dup = duplicateJsonKey(text)
    need(dup === null, `${label} ${file}: the key ${JSON.stringify(dup)} is written twice — the mapping would be ambiguous`)
    return value
  } finally {
    closeSync(fd)
  }
}
const main = process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)
const VALUE_FLAGS = ['--run-root', '--contract', '--spec', '--artifact', '--routes', '--from', '--target-map']
/**
 * Split a CLI call into the command, its positionals and its flags. A flag takes exactly one value
 * (`--flag value`) or is the `--scope=A,B` form; an unknown or repeated flag, or a flag with no value,
 * is an error — a flag's value is never mistaken for a positional, nor a positional for a flag value.
 */
export function parseCli(argv) {
  const flags = {},
    positional = []
  let scope = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--scope=')) {
      need(scope === null, 'Repeated flag --scope')
      scope = a
    } else if (a.startsWith('--')) {
      need(VALUE_FLAGS.includes(a), `Unknown flag ${a}`)
      need(!(a in flags), `Repeated flag ${a}`)
      need(i + 1 < argv.length && !argv[i + 1].startsWith('--'), `Flag ${a} needs a value`)
      flags[a] = argv[++i]
    } else positional.push(a)
  }
  return { command: positional[0], positional: positional.slice(1), flags, scope }
}
/**
 * Resolve the contract file of a CLI call: `--run-root <dir>` (canonical) or `--contract <file>`, else the
 * old positional form `CMD CONTRACT ARGS…` (explicit). With a flag, EVERY positional after the command is
 * an argument of the command (an observations file is never the contract).
 */
function contractFromArgs(argv) {
  const { positional, flags, scope } = parseCli(argv)
  const byFlag = '--run-root' in flags || '--contract' in flags
  const explicit = flags['--contract'] ?? (byFlag ? null : (positional[0] ?? null))
  const rest = byFlag ? positional : positional.slice(1)
  need(
    !('--run-root' in flags && '--contract' in flags) || resolve(flags['--run-root'], CANONICAL.design) === resolve(flags['--contract']),
    `--run-root ${flags['--run-root']} and --contract ${flags['--contract']} name two contracts — give one`
  )
  const r = resolveContract({ runRoot: flags['--run-root'] ?? null, explicit, name: CANONICAL.design })
  return {
    ...r,
    rest: scope ? [...rest, scope] : rest,
    specDir: flags['--spec'] ?? null,
    artifactPath: flags['--artifact'] ?? null,
    seedReportPath: flags['--routes'] ?? null,
    targetMapPath: flags['--target-map'] ?? null
  }
}

if (main) {
  try {
    const { argv, json, out } = takeOutputFlags(process.argv.slice(2))
    const cli = parseCli(argv)
    const command = cli.command
    const opt = (n) => cli.flags[n] ?? null
    if (command === 'adopt') {
      need(!cli.positional.length && cli.scope === null, 'adopt takes no positional arguments')
      const runRoot = opt('--run-root')
      const from = opt('--from')
      if (!runRoot || !from) throw new Error('Usage: design-contract.mjs adopt --run-root DIR --from <spec>/design-contract.json [--spec DIR] [--artifact ZIP]')
      const c = validateDesign(readJsonFile(from, '--from'))
      const specDir = opt('--spec') ?? resolve(from, '..')
      c.bindings = bindingsFrom({ specDir, artifactPath: opt('--artifact'), seedReportPath: opt('--routes') })
      const dest = join(runRoot, CANONICAL.design)
      const protectAdopt = [dest, from, specDir, opt('--artifact'), opt('--routes')]
      // the result destination is checked before the previous contract is superseded
      if (out) assertNotProtected(out, protectAdopt)
      const old = supersede({ runRoot, name: CANONICAL.design, reason: `adopt ${resolve(from)}` })
      writeFileSync(dest, JSON.stringify(c, null, 2) + '\n')
      emitResult({
        result: { ok: true, canonical: dest, superseded: old, identity: identityOf({ contractPath: dest, contract: c, specDir }) },
        json,
        out,
        script: 'design-contract',
        label: 'adopt',
        key: dest,
        protect: protectAdopt,
        summary: `ok=true canonical=${dest}`
      })
      process.exit(0)
    }
    const { path: file, canonical, rest, specDir, artifactPath, seedReportPath, targetMapPath } = contractFromArgs(argv)
    const c = validateDesign(readJsonFile(file, 'contract'))
    const identity = identityOf({ contractPath: file, contract: c, specDir, artifactPath, seedReportPath })
    const args = rest
    const target = targetMapPath ? validateTarget(c, readJsonFile(targetMapPath, '--target-map')) : null
    let result
    if (command === 'validate' && !args.length)
      result = { ok: !identity.stale.length, contractHash: contractHash(c), cases: c.pages.length * c.variants.length }
    else if (command === 'request' && args.length === 2) result = designRequest(c, ...args, target)
    else if (command === 'audit' && args.length === 1)
      result = auditDesign(c, readJsonFile(args[0], 'observations'), { target })
    else if (command === 'audit' && args.length === 2 && args[1].startsWith('--scope='))
      result = auditDesign(c, readJsonFile(args[0], 'observations'), {
        target,
        scope: args[1]
          .slice('--scope='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      })
    else if (command === 'pilot' && args.length === 1)
      result = auditDesign(c, readJsonFile(args[0], 'observations'), { pilot: true, target })
    else
      throw new Error(
        'Usage: design-contract.mjs validate|request|pilot|audit (--run-root DIR | --contract FILE | CONTRACT) [PAGE VARIANT | OBSERVATIONS [--scope=PAGE_ID,...]] [--target-map FILE] [--spec DIR] [--artifact ZIP]  |  adopt --run-root DIR --from FILE'
      )
    result.identity = identity
    result.canonical = canonical
    if (identity.stale.length) {
      result.ok = false
      result.stale = identity.stale
    }
    if (!canonical && (command === 'audit' || command === 'validate')) result.note = 'not the canonical contract of a run-root — this result is not a gate input'
    emitResult({
      result,
      json,
      out,
      script: 'design-contract',
      label: command,
      key: `${file}\0${args.join('\0')}`,
      protect: [file, ...args.filter((a) => !a.startsWith('--scope=')), targetMapPath, specDir, artifactPath, seedReportPath],
      summary: summarizeResult({ ...result, identity: undefined, canonical: undefined })
    })
    if (result.ok === false) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
