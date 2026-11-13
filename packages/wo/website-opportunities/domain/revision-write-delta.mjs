// The operations a plan revision writes on a site the previous build wrote (ticket #599). Pure.
//
// The write plan of the new revision is made in FULL (`writePlanOf`: every guard over the whole site), then compared
// with the operations the previous build ran, by their stable key:
//   - same      the operation is exactly the one that ran: nothing is called, the site already holds it;
//   - rewrite   the operation changed (`changed`), or it shows a picture whose bytes changed (`ref:<picture op>`): the
//               site's address of that picture is a new file, so every operation naming it writes again;
//   - added     an operation the previous build did not have (a new page, item or record): it runs as in a build;
//   - removed   an operation of the previous build the revision no longer has. Taking a record or a written place off
//               a site has no measured door (`docs/references/ai-quickstart-contract.md` measures writes only), so a
//               revision that removes anything stops before any door (`revision_needs_removal`, unproven
//               `record_removal_no_door`); `dropped` lists the addresses a rewritten operation no longer writes, which
//               would keep the old words: the same stop.
// A picture upload is compared by what gives its bytes (its stored id, its drawing), not its alt text: the alt text is
// written by the operations that show the picture.
import { createHash } from 'node:crypto'

const list = (value) => (Array.isArray(value) ? value : [])
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** The kinds of operation that make a record (its removal needs a door the contract does not measure). */
const MAKES = new Set(['module.copy', 'library.create'])
export const makesRecord = (kind) => MAKES.has(kind) || String(kind).endsWith('.create')
/** The kinds that write some places of a record the blank site keeps: a place no longer sent keeps its old value. */
const IN_PLACE = new Set(['contract.apply', 'record.patch', 'site.identity'])

/** What decides an operation's effect on the site: the operation, or for an upload what gives its bytes. */
const effectOf = (op) => {
  if (op.kind !== 'picture.upload') return op
  const { alt: _alt, entries: _entries, rules: _rules, ...bytes } = op
  return bytes
}

/** The places an operation writes: contract slots, record columns, the pages of a module, the identity fields. */
function addressesOf(op) {
  const out = new Set()
  for (const v of list(op.values)) out.add(v.loc?.slot ?? v.loc?.column ?? JSON.stringify(v.loc))
  for (const r of list(op.removes))
    out.add(typeof r === 'string' ? `removes:${r}` : `removes:${JSON.stringify(r)}`)
  return [...out]
}

/** The picture operations an operation names (`{ref: 'picture:<frame>'}` anywhere in it). */
function picturesOf(op, out = new Set()) {
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    if (typeof value.ref === 'string' && value.ref.startsWith('picture:')) out.add(value.ref)
    for (const v of Object.values(value)) walk(v)
  }
  walk(op.kind === 'picture.upload' ? null : op)
  return [...out]
}

/** The record a build keeps of the operations it ran: per key, its kind, effect hash and addresses. */
export function opsRecordOf(plan) {
  return list(plan.ops).map((op) => ({
    key: op.key,
    kind: op.kind,
    hash: sha(effectOf(op)),
    addresses: addressesOf(op)
  }))
}

/**
 * @param {{previous: Array<{key: string, kind: string, hash: string, addresses: string[]}>, plan: object}} input
 *   `previous`: the ops record of the build the site holds (`opsRecordOf`); `plan`: the revision's full write plan
 * @returns {{same: string[], rewrite: Array<{key: string, reasons: string[]}>, added: string[],
 *   removed: Array<{key: string, kind: string, record: boolean}>, dropped: Array<{key: string, addresses: string[]}>,
 *   orphaned: string[]}}
 */
export function writeDeltaOf({ previous, plan }) {
  const before = new Map(list(previous).map((r) => [r.key, r]))
  const now = opsRecordOf(plan)
  const out = { same: [], rewrite: [], added: [], removed: [], dropped: [], orphaned: [] }
  const changedPictures = new Set()
  const reasons = new Map()
  for (const op of now) {
    const old = before.get(op.key)
    if (!old) continue
    if (old.hash !== op.hash) {
      reasons.set(op.key, ['changed'])
      if (op.kind === 'picture.upload') changedPictures.add(op.key)
      // A made record or a copy is written whole again; a record written in place keeps what is not sent again.
      const gone = list(old.addresses).filter((a) => !op.addresses.includes(a))
      if (gone.length && IN_PLACE.has(op.kind)) out.dropped.push({ key: op.key, addresses: gone })
    }
  }
  const changed = new Set(reasons.keys())
  for (const op of list(plan.ops)) {
    if (!before.has(op.key)) continue
    const refs = picturesOf(op).filter((ref) => changedPictures.has(ref))
    const why = refs.map((r) => `ref:${r}`)
    // A record written whole again loses what a later operation wrote into it (a tab container's position).
    if (op.record && op.record !== op.key && op.kind !== 'module.assign' && changed.has(op.record))
      why.push(`record:${op.record}`)
    if (why.length) reasons.set(op.key, [...(reasons.get(op.key) ?? []), ...why])
  }
  for (const op of now) {
    if (!before.has(op.key)) out.added.push(op.key)
    else if (reasons.has(op.key)) out.rewrite.push({ key: op.key, reasons: reasons.get(op.key) })
    else out.same.push(op.key)
  }
  const keys = new Set(now.map((op) => op.key))
  // An upload no operation needs any more leaves its file on the site, shown by nothing: no door is needed.
  for (const old of before.values())
    if (keys.has(old.key) || old.kind === 'look.accent') continue
    else if (old.kind === 'picture.upload') out.orphaned.push(old.key)
    else out.removed.push({ key: old.key, kind: old.kind, record: makesRecord(old.kind) })
  return out
}
