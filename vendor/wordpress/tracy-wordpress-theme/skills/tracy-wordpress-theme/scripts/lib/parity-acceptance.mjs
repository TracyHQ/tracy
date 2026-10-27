// Acceptance and decision hygiene — one place for the rules a finish gate applies to what a port wrote down.
//
// An independent audit of two ports that passed every gate found the written-down exceptions were the hole:
// `parity-accepted.json` rows scoped to every route (`"routes":["*"]`), a footer-text row citing a decision about
// hit counts, and decisions that swapped a source feature for something functionally different (author cards →
// post cards, slider → stacked images) recorded as a default "applied" and never put to the owner.
//
//   parseDecisions(markdown)      DECISIONS.md → { decisions: Map<id, {id, text, line}>, duplicates: [id] }.
//                                 A decision starts at a table row, bullet or heading that opens with a `D-n`/`S-n` id
//                                 and runs to the next such line.
//   validateAcceptRows(rows, d)   rows of `parity-accepted.json` → [error]. A row needs `match` and `reason`, an EXPLICIT
//                                 `routes` list of exact paths (no `*`, glob or regex scope, none omitted) and a
//                                 `decision` that names ONE existing decision whose own text mentions the row's key.
//   substitutionReport(d)         the decisions that replace a source feature: classified by a structured declaration
//                                 `[substitution feature=… effect=… class=defect|owner-question status=open|fixed|owner-approved]`;
//                                 a legacy decision that reads like a substitution and has no declaration is `unresolved`.
//
// Nothing here guesses a legacy decision safe: what cannot be classified blocks, and says why.
import { lstatSync, readFileSync } from 'node:fs'

// An id is `D-12`, or a namespaced form a dossier uses for a group of sites: `D-ji-gb-1`. A citation is looked up as the
// WHOLE id, so `D-gb-1` never resolves to `D-ji-gb-1` and `D-1` never to `D-12`.
const ID_BODY = '[SD](?:-[a-z][a-z0-9]*)*-\\d+'
export const DECISION_ID = new RegExp(`^${ID_BODY}$`)
const ID_LINE = new RegExp(`^\\s*(?:[|*-]\\s*|#{1,6}\\s*)\\**\\s*(${ID_BODY})(?![\\w-])`)
const ID_REF = new RegExp(`(?<![\\w-])${ID_BODY}(?![\\w-])`, 'g')
/** A route scope is an exact path: nothing a matcher could read as a pattern. */
const ROUTE_PATTERN_CHARS = /[*?[\]{}()|^$\\+]/
export const SUBSTITUTION_CLASSES = Object.freeze(['defect', 'owner-question'])
export const SUBSTITUTION_STATUSES = Object.freeze(['open', 'fixed', 'owner-approved'])
const DECLARATION = /\[substitution\s+([^\]]*)\]/gi
/** Words that say a feature of the source is replaced, and the features whose loss the audit found. */
const SUBSTITUTION_CUE = /\b(replac\w*|becom\w*|turn\w* into|swap\w*|instead of|substitut\w*|stacked|tag cloud|not ported|no equivalent|not drawn|missing|dropped)\b|→/i
const FEATURE_NOUN = /\b(slider|carousel|author|filter\w*|recovery|back to|prev(?:ious)?\/next|tag cloud|stacked|gallery|thumbnail|pagination|pager|search)\b/i

const MAX_BYTES = 2 * 1024 * 1024

/** Read a small regular file; refuses a symlink, a directory, a FIFO, an empty or oversized one. */
export function readSmallFile(file, what) {
  let st
  try {
    st = lstatSync(file) // a link is refused whatever it points at
  } catch (e) {
    throw new Error(`${what} ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`)
  }
  if (st.isSymbolicLink()) throw new Error(`${what} ${file}: a symbolic link is refused`)
  if (!st.isFile()) throw new Error(`${what} ${file}: not a regular file`)
  if (st.size === 0) throw new Error(`${what} ${file}: empty`)
  if (st.size > MAX_BYTES) throw new Error(`${what} ${file}: larger than ${MAX_BYTES} bytes`)
  return readFileSync(file, 'utf8')
}

export function parseDecisions(markdown) {
  const decisions = new Map()
  const duplicates = []
  let cur = null
  const lines = String(markdown ?? '').split('\n')
  lines.forEach((line, i) => {
    const m = ID_LINE.exec(line)
    if (m) {
      if (decisions.has(m[1])) duplicates.push(m[1])
      cur = { id: m[1], text: line, line: i + 1 }
      if (!decisions.has(m[1])) decisions.set(m[1], cur)
      else cur = { id: m[1], text: '', line: i + 1, duplicate: true }
    } else if (cur && !cur.duplicate && !/^\s*#{1,6}\s/.test(line)) cur.text += `\n${line}`
    else if (/^\s*#{1,6}\s/.test(line)) cur = null
  })
  return { decisions, duplicates: [...new Set(duplicates)] }
}

export const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/** The literal words an accepted regex stands for: one per alternative, regex syntax dropped. */
export function keysOfMatch(match) {
  return String(match)
    .split('|')
    .map((alt) => fold(alt.replace(/\\[bBdDsSwW]/g, ' ').replace(/\\(.)/g, '$1').replace(/[.*+?^${}()[\]]/g, ' ')))
    .filter((k) => k.length >= 3)
}

/** A regex that matches an empty text, or text that has nothing to do with any key, accepts every finding. */
export const universalRegex = (re) => ['', 'zzz unrelated 0000', '{"kind":"x","element":"zzz"}', '{"page":"q","axis":"a"}'].some((t) => re.test(t))
/** Does a finding's text carry the row's explicit key? Without one, the regex itself is the key. */
export const rowKeyHolds = (row, text) => !row.key || fold(text).includes(fold(row.key))

export const keysOfRow = (row) => (row.key ? [fold(row.key)] : row.selector ? [fold(row.selector)] : keysOfMatch(row.match))

/**
 * Errors of one route scope; empty when it is a non-empty list of exact routes. An exact route is a path, and the
 * literal query string of a page that is one (`/search?q=zqxwv`, as the page-map names it): the `?` that starts the
 * query is not a pattern, every pattern character after it still is (ja-restaurant S-35: a search route's accepted
 * difference had no row it could be written in).
 */
export function routeScopeErrors(routes) {
  if (routes === undefined || routes === null) return ['routes is omitted — a row names the routes it covers']
  if (!Array.isArray(routes) || !routes.length) return ['routes must be a non-empty list of exact paths']
  const errors = []
  for (const r of routes) {
    const q = typeof r === 'string' ? r.indexOf('?') : -1
    const pathPart = q === -1 ? r : r.slice(0, q)
    if (typeof r === 'string' && (ROUTE_PATTERN_CHARS.test(pathPart) || (q !== -1 && (q === r.length - 1 || ROUTE_PATTERN_CHARS.test(r.slice(q + 1))))))
      errors.push(`route ${r} is a wildcard, glob or regex — name each route`)
    else if (typeof r !== 'string' || !r.startsWith('/')) errors.push(`route ${JSON.stringify(r)} is not an exact path starting with /`)
  }
  return errors
}

/** @returns {string[]} one line per refusal; empty when every row stands. */
export function validateAcceptRows(rows, decisionsParsed) {
  const errors = []
  if (!Array.isArray(rows)) return ['accepted rows are not a list']
  if (!decisionsParsed) return ['no decisions were given: every accepted row must cite one (--decisions DECISIONS.md)']
  const { decisions, duplicates } = decisionsParsed
  rows.forEach((row, n) => {
    const at = `accept[${n}] ${JSON.stringify(row?.match ?? null)}`
    const E = (m) => errors.push(`${at}: ${m}`)
    if (!row || typeof row !== 'object' || Array.isArray(row)) return E('is not an object')
    if (typeof row.match !== 'string' || !row.match) E('needs a match')
    else {
      try {
        if (universalRegex(new RegExp(row.match, 'i'))) E('match accepts every finding — it must name the text it accepts')
      } catch {
        E('match is not a valid regular expression')
      }
    }
    if (typeof row.reason !== 'string' || !row.reason.trim()) E('needs a reason')
    for (const m of routeScopeErrors(row.routes)) E(m)
    const id = row.decision
    if (typeof id !== 'string' || !DECISION_ID.test(id)) return E(`needs a decision id (D-n / S-n), got ${JSON.stringify(id ?? null)}`)
    if (duplicates.includes(id)) return E(`decision ${id} is defined more than once — the citation is ambiguous`)
    const d = decisions.get(id)
    if (!d) return E(`decision ${id} does not exist`)
    const keys = keysOfRow(row)
    if (!keys.length) return E('has no key to look for in the decision (give "key")')
    const body = fold(d.text)
    const missing = keys.filter((k) => !body.includes(k))
    if (missing.length) E(`decision ${id} does not mention ${missing.map((k) => JSON.stringify(k)).join(', ')} — a citation must be about what it accepts`)
  })
  return errors
}

/** The decision ids a citation names (`D-12`, `DECISIONS.md D-ji-gb-1`): unique, in order. */
export const citedDecisionIds = (citation) => [...new Set(String(citation ?? '').match(ID_REF) ?? [])]

/**
 * The refusals of one citation: it names exactly ONE decision, that decision exists once, and its own text
 * mentions every key the row accepts. A reason on the row is not the decision's text.
 */
export function citationErrors(citation, keys, decisionsParsed) {
  if (!decisionsParsed) return ['no decisions were given: every exception must cite one that can be read (--decisions DECISIONS.md)']
  const ids = citedDecisionIds(citation)
  if (ids.length !== 1) return [`needs exactly one decision id (D-n / S-n / D-ns-n), got ${JSON.stringify(citation ?? null)}`]
  const [id] = ids
  if (decisionsParsed.duplicates.includes(id)) return [`decision ${id} is defined more than once — the citation is ambiguous`]
  const d = decisionsParsed.decisions.get(id)
  if (!d) return [`decision ${id} does not exist`]
  const wanted = (keys ?? []).map(fold).filter(Boolean)
  if (!wanted.length) return ['has no key or selector to look for in the decision (give "key" or "selector")']
  const body = fold(d.text)
  const missing = wanted.filter((k) => !body.includes(k))
  return missing.length ? [`decision ${id} does not mention ${missing.map((k) => JSON.stringify(k)).join(', ')} — a citation must be about what it accepts`] : []
}

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

// These findings name no element. Every other kind is element-level and scoped rows must name
// its structured selector or text subject.
export const PAGE_LEVEL_EXCEPTION_KINDS = Object.freeze([
  'identity-mismatch', 'theme-not-applied', 'horizontal-overflow',
  'source-shot-missing', 'source-theme-not-applied', 'examined-too-few',
  'source-not-rendered', 'image-missing', 'image-broken', 'image-placeholder', 'mega-menu'
])

const SCOPE_KEYS = new Set(['pages', 'routes', 'axes', 'selector', 'text', 'properties'])
const scopeListErrors = (scope, name, errors) => {
  if (scope[name] === undefined) return
  if (!Array.isArray(scope[name])) { errors.push(`scope.${name} must be a list`); return }
  if (!scope[name].length) errors.push(`scope.${name} must not be empty`)
  for (const value of scope[name]) if (typeof value !== 'string' || !value.trim()) errors.push(`scope.${name} values must be non-empty strings`)
}

/**
 * Rows of an exception list (`visual.contract.json` design.exceptions, review.config.json visual.exceptions,
 * design-contract.json exceptions) → [error]. Two rules, nothing more: the match is not universal (it would accept every
 * finding of its kind), and the row cites ONE existing decision whose own text mentions the row's `key`/`selector` (else the
 * literal words of its match). A row that names `routes` must name exact paths. `surface` names the file in the messages.
 */
export function validateExceptionRows(rows, decisionsParsed, { surface = 'exceptions', needDecisions = true } = {}) {
  const errors = []
  if (rows === undefined || rows === null) return errors
  if (!Array.isArray(rows)) return [`${surface} is not a list`]
  rows.forEach((row, n) => {
    const at = `${surface}[${n}] ${JSON.stringify(row?.kind ?? null)}`
    const E = (m) => errors.push(`${at}: ${m}`)
    if (!row || typeof row !== 'object' || Array.isArray(row)) return E('is not an object')
    if (typeof row.kind !== 'string' || !row.kind) E('needs a kind')
    if (typeof row.reason !== 'string' || !row.reason.trim()) E('needs a reason')
    const scoped = row.scope !== undefined
    if (scoped) {
      const scope = row.scope
      if (!scope || typeof scope !== 'object' || Array.isArray(scope)) E('scope must be an object')
      else {
        for (const key of Object.keys(scope)) if (!SCOPE_KEYS.has(key)) E(`scope has unknown key ${JSON.stringify(key)}`)
        for (const key of ['pages', 'routes', 'axes', 'properties']) scopeListErrors(scope, key, errors)
        for (const key of ['selector', 'text']) if (scope[key] !== undefined && (typeof scope[key] !== 'string' || !scope[key].trim())) E(`scope.${key} must be a non-empty string`)
        if (scope.pages === undefined && scope.routes === undefined) E('scope must name pages or routes')
        if (scope.routes !== undefined) for (const m of routeScopeErrors(scope.routes)) E(`scope.${m}`)
        if (!PAGE_LEVEL_EXCEPTION_KINDS.includes(row.kind) && !scope.selector && !scope.text) E('element scope must name selector or text')
      }
    }
    if (row.match === undefined) {
      if (!scoped) E('needs a match')
    } else if (typeof row.match !== 'string' || !row.match) E('match must be a non-empty string')
    else {
      try {
        if (universalRegex(new RegExp(row.match))) E('match accepts every finding of its kind — scope it to a route and a selector')
      } catch {
        E('match is not a valid regular expression')
      }
    }
    if (row.routes !== undefined) for (const m of routeScopeErrors(row.routes)) E(m)
    const selectors = asList(row.selector)
    if (!needDecisions) return
    const explicit = [...asList(row.key), ...selectors].filter((k) => typeof k === 'string')
    const keys = explicit.length ? explicit : typeof row.match === 'string' ? keysOfMatch(row.match) : []
    for (const m of citationErrors(row.decision, keys, decisionsParsed)) E(m)
  })
  return errors
}

/** The `key=value` pairs of one `[substitution …]` declaration. */
function pairsOf(s) {
  const out = {}
  for (const m of s.matchAll(/([a-z-]+)=("[^"]*"|\S+)/gi)) out[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, '')
  return out
}

/**
 * @returns {{substitutions: object[], unresolved: object[], errors: string[], blocking: number}}
 *   `substitutions` are the declared ones (each with its status); `unresolved` the legacy decisions that read like a
 *   substitution without a declaration; `blocking` counts every one that is not `fixed` or `owner-approved`.
 */
export function substitutionReport(decisionsParsed) {
  const substitutions = []
  const unresolved = []
  const errors = []
  for (const [id, d] of decisionsParsed?.decisions ?? []) {
    const declared = [...d.text.matchAll(DECLARATION)]
    if (declared.length) {
      for (const m of declared) {
        const p = pairsOf(m[1])
        const bad = []
        if (!p.feature) bad.push('feature')
        if (!p.effect) bad.push('effect')
        if (!SUBSTITUTION_CLASSES.includes(p.class)) bad.push(`class (${SUBSTITUTION_CLASSES.join('|')}; an accepted deviation is not a class)`)
        if (!SUBSTITUTION_STATUSES.includes(p.status)) bad.push(`status (${SUBSTITUTION_STATUSES.join('|')})`)
        if (bad.length) errors.push(`${id}: [substitution] declaration needs ${bad.join(', ')}`)
        else substitutions.push({ id, feature: p.feature, effect: p.effect, class: p.class, status: p.status })
      }
    } else if (SUBSTITUTION_CUE.test(d.text) && FEATURE_NOUN.test(d.text)) {
      // a decision's own status (CLOSED, applied) says it was handled, not that the feature works: only a declaration classifies it
      unresolved.push({ id, reason: 'reads like a replaced source feature and carries no [substitution …] declaration', text: d.text.replace(/\s+/g, ' ').trim().slice(0, 160) })
    }
  }
  const blocking = substitutions.filter((s) => s.status === 'open').length + unresolved.length + errors.length
  return { substitutions, unresolved, errors, blocking }
}
