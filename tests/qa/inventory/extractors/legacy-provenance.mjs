// One validator for the provenance block of the two copied legacy sources, shared by the importers, the
// extractors and the selftests. A "verified" label alone is worth nothing: the block must carry the exact
// metadata (all eight ledger shards, a sha256 per file, a probe that matches the status) and every
// finding must belong to a declared shard. Returns a list of problems; empty means well formed.

const HASH = /^[0-9a-f]{64}$/
const SHARD_FILES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `ledger-S${n}.md`)
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** `verification` must be `{status:'verified',probe:'read'}` or `{status:'unverified',probe:<non-empty string>}`. */
function verificationProblem(v, label) {
  if (!isObject(v)) return `${label}: verification is missing`
  if (v.status === 'verified') return v.probe === 'read' ? null : `${label}: verified needs probe "read"`
  if (v.status === 'unverified')
    return typeof v.probe === 'string' && v.probe.trim() ? null : `${label}: unverified needs a probe`
  return `${label}: unknown verification status`
}

const revisionProblem = (r, label) =>
  r === null || (typeof r === 'string' && /^[0-9a-f]{7,64}$/.test(r))
    ? null
    : `${label}: revision must be a git hash or null`

const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim())
const nullableString = (v) => v === null || (typeof v === 'string' && v.trim() !== '')
const FINDING_KEYS = [
  'id',
  'shard',
  'severity',
  'title',
  'items',
  'evidence',
  'evidenceNote',
  'repro',
  'fixRefs',
  'ledger',
  'line'
]

/** Every field the copy keeps, with its type; a copy that fails here is never reused as evidence. */
function findingFieldProblems(f) {
  const out = []
  const bad = (field, why) => out.push(`${f.id}: ${field} ${why}`)
  for (const k of Object.keys(f)) if (!FINDING_KEYS.includes(k)) bad(k, 'is not a finding field')
  if (!(f.severity === null || ['P0', 'P1', 'P2', 'P3', 'INFO'].includes(f.severity)))
    bad('severity', 'must be P0..P3, INFO or null')
  if (typeof f.title !== 'string' || !f.title.trim()) bad('title', 'must be a non-empty string')
  if (!isStringList(f.items)) bad('items', 'must be a list of strings')
  if (!isStringList(f.evidence)) bad('evidence', 'must be a list of strings')
  if (!nullableString(f.evidenceNote)) bad('evidenceNote', 'must be a string or null')
  if (!nullableString(f.repro)) bad('repro', 'must be a string or null')
  if (!isStringList(f.fixRefs)) bad('fixRefs', 'must be a list of strings')
  if (!Number.isInteger(f.line) || f.line < 1) bad('line', 'must be a positive integer')
  return out
}

export function validateFindingsDoc(doc) {
  const problems = []
  if (!isObject(doc) || !isObject(doc.source)) return ['audit-findings: source block is missing']
  const { source } = doc
  if (typeof source.repo !== 'string' || !source.repo) problems.push('source.repo is missing')
  if (typeof source.directory !== 'string' || !source.directory) problems.push('source.directory is missing')
  const rev = revisionProblem(source.revision, 'source')
  if (rev) problems.push(rev)
  if (!Array.isArray(source.files)) return [...problems, 'source.files is missing']
  const seen = new Set()
  for (const f of source.files) {
    if (!isObject(f) || typeof f.file !== 'string') {
      problems.push('source.files has a malformed entry')
      continue
    }
    if (!SHARD_FILES.includes(f.file)) problems.push(`${f.file}: not one of ledger-S1..S8`)
    if (seen.has(f.file)) problems.push(`${f.file}: listed twice`)
    seen.add(f.file)
    if (typeof f.sha256 !== 'string' || !HASH.test(f.sha256)) problems.push(`${f.file}: sha256 is invalid`)
    if (!Number.isInteger(f.lines) || f.lines < 1) problems.push(`${f.file}: lines is invalid`)
    const v = verificationProblem(f.verification, f.file)
    if (v) problems.push(v)
  }
  for (const file of SHARD_FILES) if (!seen.has(file)) problems.push(`${file}: no provenance metadata`)
  if (!Array.isArray(doc.findings)) return [...problems, 'findings[] is missing']
  const perShard = new Map()
  const ids = new Set()
  for (const f of doc.findings) {
    if (!isObject(f) || typeof f.id !== 'string' || typeof f.shard !== 'string') {
      problems.push('a finding has no id or shard')
      continue
    }
    const m = /^F-S([1-8])-\d{3}$/.exec(f.id)
    if (!m) problems.push(`${f.id}: not a finding id`)
    else if (`S${m[1]}` !== f.shard) problems.push(`${f.id}: id belongs to S${m[1]}, filed under ${f.shard}`)
    if (f.ledger !== `ledger-${f.shard}.md`)
      problems.push(`${f.id}: ledger ${f.ledger} does not match ${f.shard}`)
    if (ids.has(f.id)) problems.push(`${f.id}: duplicate finding`)
    ids.add(f.id)
    problems.push(...findingFieldProblems(f))
    perShard.set(f.shard, (perShard.get(f.shard) ?? 0) + 1)
  }
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8])
    if (!perShard.get(`S${n}`)) problems.push(`ledger-S${n}.md: no finding copied`)
  return problems
}

export function validatePlanDoc(doc) {
  const problems = []
  if (!isObject(doc) || !isObject(doc.source)) return ['audit-plan: source block is missing']
  const { source } = doc
  if (typeof source.repo !== 'string' || !source.repo) problems.push('source.repo is missing')
  if (typeof source.path !== 'string' || !source.path) problems.push('source.path is missing')
  if (typeof source.sha256 !== 'string' || !HASH.test(source.sha256))
    problems.push('source.sha256 is invalid')
  if (!Number.isInteger(source.lines) || source.lines < 1) problems.push('source.lines is invalid')
  const rev = revisionProblem(source.revision, 'source')
  if (rev) problems.push(rev)
  const v = verificationProblem(source.verification, 'source')
  if (v) problems.push(v)
  if (!Array.isArray(doc.items) || doc.items.length === 0) problems.push('items[] is missing or empty')
  else {
    const ids = new Set()
    for (const i of doc.items) {
      if (!isObject(i) || typeof i.id !== 'string' || !i.id) problems.push('an item has no id')
      else if (ids.has(i.id)) problems.push(`${i.id}: duplicate item`)
      else ids.add(i.id)
      if (isObject(i) && typeof i.id === 'string' && i.id) {
        if (typeof i.group !== 'string' || !i.group) problems.push(`${i.id}: group is missing`)
        if (i.level !== 'main' && i.level !== 'sub') problems.push(`${i.id}: level must be main or sub`)
        if (!(i.parent === null || (typeof i.parent === 'string' && i.parent)))
          problems.push(`${i.id}: parent must be an id or null`)
        if (typeof i.title !== 'string' || !i.title.trim()) problems.push(`${i.id}: title is missing`)
        if (typeof i.section !== 'string') problems.push(`${i.id}: section is missing`)
        if (!Number.isInteger(i.line) || i.line < 1) problems.push(`${i.id}: line is invalid`)
      }
    }
  }
  return problems
}
