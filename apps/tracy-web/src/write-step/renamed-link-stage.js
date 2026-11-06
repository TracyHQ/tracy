// Links that still name an address the route stage moved (card AD; page-route-stage.js). Renaming a menu item moves every
// link Joomla builds from it, but not one written as a string: a url menu item (`/index.php/classes/tennis` in a footer menu)
// or an anchor inside the words of a slot. Each answers 404 once `/classes` is `/services`. So, after the renames, every url
// menu item and every slot of the content contract is read, each link naming a moved address (or a page under one) is written
// to the address it answers at now, and read back. A link that cannot be rewritten is a refused line with the reason; a link
// the plugin refused is a failed line in its words. Nothing is left silent.
import { createHash } from 'node:crypto'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { addressMoves, movedLink, movedLinksIn } from '../lib/renamed-addresses.js'
import { refusalWords } from './contract-write.js'
import { holdsAddress } from './link-doors.js'
import { doorCall, readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const applyIdOf = (what) =>
  `renamed-links-${createHash('sha256').update(JSON.stringify(what)).digest('hex').slice(0, 32)}`

/** One url menu item to its new link, read back on its row. */
async function rewriteItem(call, row, found) {
  const id = Number(row.id)
  const base = { kind: 'menuItem', id, before: row.link, value: found.href, from: found.from, to: found.to }
  if (found.refused) return { ...base, value: row.link, status: 'refused', reason: found.refused }
  try {
    await call('content.update', {
      apply_id: applyIdOf(['menuItem', id, found.href]),
      kind: 'menuItem',
      id,
      fields: { link: found.href }
    })
    const now = (await call('content.get', { kind: 'menuItem', id }))?.item?.link
    return now === found.href
      ? { ...base, status: 'written' }
      : { ...base, status: 'failed', reason: `the site holds the link ${now ?? '(none)'} after the write` }
  } catch (error) {
    return { ...base, status: 'failed', reason: String(error?.message ?? error) }
  }
}

async function menuRewrites(call, moves, hosts) {
  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    return [{ kind: 'menu', status: 'refused', reason: `the menu could not be read: ${error.message}` }]
  }
  const out = []
  for (const row of rows) {
    if (row?.type !== 'url' || Number(row.client_id ?? 0) !== 0) continue
    const found = movedLink(row.link, moves, { hosts })
    if (found) out.push(await rewriteItem(call, row, found))
  }
  return out
}

/** Every slot of the contract whose words or address name a moved address, through the contract door (`writeSlots`). */
async function slotRewrites({ door, siteKey, moves, hosts, writeSlots }) {
  let reading
  try {
    reading = await door.apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
  } catch (error) {
    reading = { ok: false, message: String(error?.message ?? error) }
  }
  if (!reading?.ok)
    return [
      {
        kind: 'content',
        status: 'refused',
        reason: `the content could not be read to find links to a renamed address: ${reading?.message ?? reading?.error ?? 'no answer'}`
      }
    ]
  const found = []
  for (const slot of each(reading.slots)) {
    if (typeof slot?.current !== 'string' || !slot.key) continue
    const whole = holdsAddress(slot)
    const moved = movedLinksIn(slot.current, moves, { hosts, whole })
    if (!moved.moved.length && !moved.refused.length) continue
    const [first] = moved.moved
    found.push({
      kind: 'slot',
      key: slot.key,
      whole,
      before: slot.current,
      value: moved.text,
      from: first?.from ?? null,
      to: first?.to ?? null,
      ...(moved.refused.length ? { refusedLinks: moved.refused } : {})
    })
  }
  const changes = Object.fromEntries(found.filter((f) => f.value !== f.before).map((f) => [f.key, f.value]))
  let wrote = { written: [], refused: new Map() }
  if (Object.keys(changes).length) {
    if (!writeSlots)
      wrote = { written: [], refused: new Map(), stop: { reason: 'no contract door was given to the stage' } }
    else {
      const evidence = Object.fromEntries(
        found.map((f) => [f.key, `The write step renamed ${f.from} to ${f.to}; this link follows it`])
      )
      try {
        wrote = await writeSlots({ reading, changes, evidence })
      } catch (error) {
        wrote = { written: [], refused: new Map(), stop: { reason: String(error?.message ?? error) } }
      }
    }
  }
  const written = new Set(wrote.written ?? [])
  return found.map((f) => {
    const why = f.refusedLinks?.join('; ')
    if (written.has(f.key))
      return why ? { ...f, status: 'refused', reason: why } : { ...f, status: 'written' }
    if (f.value === f.before) return { ...f, status: 'refused', reason: why }
    const entry = wrote.refused?.get?.(f.key)
    const reason = entry ? refusalWords(entry) : (wrote.stop?.reason ?? 'the contract door did not take it')
    return { ...f, value: f.before, status: 'failed', reason }
  })
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, routes: object[], hosts?: string[],
 *   writeSlots?: (input: { reading: object, changes: Record<string, string>, evidence: Record<string, string> }) =>
 *   Promise<{ written: string[], refused: Map<string, object>, stop?: { reason: string } }> }} input `routes`: the route
 *   table of this run; `hosts`: the host names this site answers at; `writeSlots`: the contract door (contract-write.js)
 * @returns {Promise<{ rewrites: object[], lines: object[], moves: object[], hosts: string[] }>} empty when no address moved
 */
export async function rewriteRenamedLinks({ door, siteKey, routes, hosts = [], writeSlots = null }) {
  const moves = addressMoves(routes)
  if (!moves.length) return { rewrites: [], lines: [], moves, hosts }
  const call = doorCall(door, siteKey)
  const rewrites = [
    ...(await menuRewrites(call, moves, hosts)),
    ...(await slotRewrites({ door, siteKey, moves, hosts, writeSlots }))
  ]
  return { rewrites, lines: rewrites.map(lineOf), moves, hosts }
}

/** The report's line of one rewrite, read back on the row it was written to or through inspect by its key. */
function lineOf(r) {
  const slot =
    r.kind === 'menuItem'
      ? `menuItem-${r.id}:link`
      : r.kind === 'slot'
        ? `${r.key}:renamed-link`
        : `renamed-links:${r.kind}`
  return {
    slot,
    key: r.kind === 'slot' ? r.key : null,
    owner: 'plan',
    part: 'renamed-link',
    status: r.status,
    reason: r.reason ?? null,
    readBack: null,
    ordered: r.value ?? null,
    ...(r.kind === 'menuItem' && r.status === 'written'
      ? { readFrom: readRow('menuItem', r.id, 'link') }
      : {}),
    outcome: r.status === 'written' ? 'written' : 'refused',
    evidence: { before: r.before ?? null, from: r.from ?? null, to: r.to ?? null }
  }
}

/**
 * The other lines of the report that ordered a value this stage rewrote say the value the site holds now, so read-back
 * compares the site with what it was last sent.
 * @param {object[]} lines
 * @param {{ rewrites?: object[], moves?: object[], hosts?: string[] } | null} renamed what rewriteRenamedLinks answered
 */
export function followRenamedLinks(lines, renamed) {
  const { rewrites = [], moves = [], hosts = [] } = renamed ?? {}
  const items = new Map()
  const slots = new Map()
  for (const r of each(rewrites)) {
    if (r.status !== 'written') continue
    if (r.kind === 'menuItem') items.set(r.id, r)
    if (r.kind === 'slot') slots.set(r.key, r)
  }
  if (!items.size && !slots.size) return lines
  return lines.map((line) => {
    if (line.part === 'renamed-link' || typeof line.ordered !== 'string') return line
    const read = line.readFrom
    const item =
      read?.params?.kind === 'menuItem' && read.path?.[1] === 'link' && items.get(Number(read.params.id))
    if (item) return { ...line, ordered: item.value }
    const slot = line.key && line.status === 'written' && slots.get(line.key)
    if (slot)
      return { ...line, ordered: movedLinksIn(line.ordered, moves, { hosts, whole: slot.whole }).text }
    return line
  })
}
