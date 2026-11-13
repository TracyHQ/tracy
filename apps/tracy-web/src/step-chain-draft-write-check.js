// The read back of a draft write (#597): after every door call the record is read from the site and compared with what
// was meant: the columns a created record, a copy or a library module was sent (title, alias, menutype, home, link,
// catid, content, the rows cut, the elements removed), every value at its location (an HTML piece read as its node's
// text), a module's pages, a contract apply's record columns whole, the site identity, and the bytes behind an
// uploaded path. A difference stops the write with `read_back_mismatch`, naming the operation, the column or slot and
// lengths, never the customer's text.
import { createHash } from 'node:crypto'
import { addressOf, getAt, movedAfterCut } from 'website-opportunities/domain/draft-write-codec.mjs'
import { DraftWriteError, lengthOf } from 'website-opportunities/domain/draft-write-error.mjs'
import {
  elementStepsOf,
  movedAfterRemove,
  restOf
} from 'website-opportunities/domain/draft-write-html-rest.mjs'
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

/** A location without its xpath: the whole stored value its pieces sit in. */
const wholeOf = ({ xpath: _xpath, ...loc }) => loc

/**
 * The untouched parts of every HTML value the op wrote pieces of: the value before the write (`base`) and the value the
 * site holds (`row`) read apart from the piece functions (`restOf`), every element a piece names left out, every
 * element a `removes` took out gone; they must be equal. A fault of the piece functions that changes a sibling (an
 * entity escaped twice, a node dropped or moved) stops the write here, typed.
 */
export function readRest(base, row, op, ctx) {
  const groups = new Map()
  for (const v of list(op.values)) {
    if (!v.loc.xpath) continue
    const at = wholeOf(v.loc)
    const group = groups.get(addressOf(at)) ?? { at, masks: [], drops: [] }
    group.masks.push(elementStepsOf(v.loc.xpath))
    groups.set(addressOf(at), group)
  }
  for (const r of list(op.removes)) groups.get(addressOf(r.loc))?.drops.push(elementStepsOf(r.xpath))
  for (const { at, masks, drops } of groups.values()) {
    // A piece at the wrapper itself writes the whole value: nothing is left untouched.
    if (masks.some((m) => m.length === 0)) continue
    let moved = at
    for (const cut of list(op.cuts)) moved = moved && movedAfterCut(moved, cut.row, cut.kept)
    if (!moved) continue
    const after = masks.map((m) => drops.reduce((steps, d) => movedAfterRemove(steps, d), m))
    let before
    let got
    try {
      before = restOf(getAt(base, at, ctx.html) ?? '', masks, drops)
      got = restOf(getAt(row, moved, ctx.html) ?? '', after)
    } catch (error) {
      throw mismatch(op, 'untouched value', '', error?.code ?? 'unreadable', { column: at.column })
    }
    const k = before.findIndex((x, n) => x !== got[n])
    const i = k === -1 ? Math.min(before.length, got.length) : k
    if (k !== -1 || before.length !== got.length)
      throw mismatch(op, 'untouched value', before[i] ?? '', got[i] ?? '', {
        entity: at.entity ?? null,
        column: at.column,
        // Where the values part: an element path of the value, never its words.
        at: (before[i] ?? got[i] ?? '').split(/[ #]/)[0]
      })
  }
}

/** A module's pages as the site holds them. */
export async function readAssignment(op, id, menuids, ctx) {
  const got = parsed((await ctx.doors.get({ kind: 'moduleAssignment', id })).menuids)
  if (!holds(menuids, got)) throw mismatch(op, 'pages', menuids, got)
}

/**
 * A contract apply's record columns as the site holds them, whole: every slot it wrote holds its value, every slot it
 * removed is gone, and every other slot of those columns (`before`, read before the apply) holds what it held.
 */
export async function readContract(op, changes, removes, ctx, before = {}) {
  const others = Object.keys(before)
  const read = await ctx.doors.read({ slots: [...Object.keys(changes), ...removes, ...others] })
  for (const [slot, value] of Object.entries(changes))
    if (read[slot] !== value) throw mismatch(op, 'slot', value, read[slot], { slot })
  for (const slot of removes)
    if (read[slot] !== null && read[slot] !== undefined)
      throw mismatch(op, 'removed slot', null, read[slot], { slot })
  for (const slot of others)
    if ((read[slot] ?? null) !== (before[slot] ?? null))
      throw mismatch(op, 'untouched slot', before[slot], read[slot], { slot })
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
