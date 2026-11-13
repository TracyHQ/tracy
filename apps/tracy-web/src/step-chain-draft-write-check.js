// The read back of a draft write (#597): after every door call the record is read from the site and compared with what
// was meant: the columns a created record, a copy or a library module was sent (title, alias, menutype, home, link,
// catid, content, the rows cut, the elements removed), every value at its location (an HTML piece read as its node's
// text), a module's pages, a contract apply's slots and removed slots, the site identity, and the bytes behind an
// uploaded path. A difference stops the write with `read_back_mismatch`, naming the operation, the column or slot and
// lengths, never the customer's text.
import { createHash } from 'node:crypto'
import { getAt, movedAfterCut } from 'website-opportunities/domain/draft-write-codec.mjs'
import { DraftWriteError, lengthOf } from 'website-opportunities/domain/draft-write-error.mjs'
import { resolved } from './step-chain-draft-write-ops.js'

const list = (value) => (Array.isArray(value) ? value : [])

/** A read back that differs, typed; `what` names a column, a slot or a check. */
export function mismatch(op, what, meant, got, extra = {}) {
  return new DraftWriteError('read_back_mismatch', `${op.key} reads another ${what} than it wrote`, {
    op: op.key,
    what,
    expected: lengthOf(typeof meant === 'string' ? meant : JSON.stringify(meant ?? null)),
    got: lengthOf(typeof got === 'string' ? got : JSON.stringify(got ?? null)),
    ...extra
  })
}

const parsed = (value) => {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
/** Whether `got` holds everything `sent` holds: objects by key (the site may add keys), lists and words exactly. */
function holds(sent, got) {
  const a = parsed(sent)
  const b = parsed(got)
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => holds(v, b[i]))
  if (a && typeof a === 'object')
    return !!b && typeof b === 'object' && Object.keys(a).every((k) => holds(a[k], b[k]))
  return String(a ?? '') === String(b ?? '')
}

/** Every column the record was sent, read back from the row the site holds. */
export function readSent(row, sent, op) {
  for (const [column, value] of Object.entries(sent))
    if (!holds(value, row[column])) throw mismatch(op, `column ${column}`, value, row[column], { column })
}

/** Every value of the op at its location; an element a `removes` took out must be gone. */
export function readValues(row, op, ctx) {
  for (const v of list(op.values)) {
    let loc = v.loc
    for (const cut of list(op.cuts)) loc = loc && movedAfterCut(loc, cut.row, cut.kept)
    if (!loc) continue
    const meant = String(resolved(v.value, ctx))
    // An HTML piece reads as its node's text: the meant value is read the same way from what was sent.
    // A node the site's value no longer holds reads as a difference, not as a refusal of the piece.
    let expected
    let got
    try {
      expected = loc.xpath
        ? ctx.html.get(
            ctx.html.set(getAt(row, { ...loc, xpath: undefined }, ctx.html) ?? '', loc.xpath, meant),
            loc.xpath
          )
        : meant
      got = getAt(row, loc, ctx.html)
    } catch (error) {
      throw mismatch(op, 'value', meant, error?.code ?? 'unreadable', {
        entity: v.loc.entity,
        slot: v.loc.slot ?? null,
        column: v.loc.column
      })
    }
    if (String(got ?? '') !== expected)
      throw mismatch(op, 'value', expected, got, {
        entity: v.loc.entity,
        slot: v.loc.slot ?? null,
        column: v.loc.column
      })
  }
  for (const r of list(op.removes)) {
    let present = true
    try {
      getAt(row, { ...r.loc, xpath: r.xpath }, ctx.html)
    } catch {
      present = false
    }
    if (present) throw mismatch(op, 'removed element', '', 'present', { column: r.loc.column })
  }
}

/** A module's pages as the site holds them. */
export async function readAssignment(op, id, menuids, ctx) {
  const got = parsed((await ctx.doors.get({ kind: 'moduleAssignment', id })).menuids)
  if (!holds(menuids, got)) throw mismatch(op, 'pages', menuids, got)
}

/** A contract apply's slots and removed slots as the site holds them. */
export async function readContract(op, changes, removes, ctx) {
  const read = await ctx.doors.read({ slots: [...Object.keys(changes), ...removes] })
  for (const [slot, value] of Object.entries(changes))
    if (read[slot] !== value) throw mismatch(op, 'slot', value, read[slot], { slot })
  for (const slot of removes)
    if (read[slot] !== null && read[slot] !== undefined)
      throw mismatch(op, 'removed slot', null, read[slot], { slot })
}

/** The bytes behind an uploaded path. */
export async function readUpload(op, path, bytes, ctx) {
  const got = await ctx.doors.media({ path })
  const meant = createHash('sha256').update(bytes).digest('hex')
  if (got?.sha256 !== meant) throw mismatch(op, 'file', meant, got?.sha256 ?? '', { path })
}

/** The site identity fields as the site holds them. */
export async function readIdentity(op, fields, ctx) {
  const got = await ctx.doors.readIdentity()
  for (const [column, value] of Object.entries(fields))
    if (String(got?.[column] ?? '') !== String(value))
      throw mismatch(op, `identity ${column}`, value, got?.[column], { column })
}
