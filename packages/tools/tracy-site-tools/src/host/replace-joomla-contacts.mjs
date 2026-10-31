/**
 * The contact records a sealed Joomla site's `content.replace {all:true}` reaches too (#204).
 *
 * A sealed site's replace writes through its content contract, whose slots are modules and articles; a
 * contact record (`com_contact`: its telephone, e-mail, address, free text) is not a slot. "Change our
 * phone number everywhere" therefore wrote the four home-page slots and left the Contact page on the
 * old number, and the agent spent 80 s finding it on its own. The open road has read contacts since
 * 02/10/2026 (`replace-joomla-open.mjs` `contactStores`); this reads the same columns (`CONTACT_WORDS`)
 * and writes them through the contact's own door (`content.update`), beside the contract apply.
 */
import { CONTACT_WORDS } from './replace-joomla-open.mjs'

/** Contacts read, at most this many pages of `PAGE` rows (a site with more is named, never guessed). */
const PAGE = 50
const PAGES = 4

/** The columns of a contact that print words on its page, the free text (`misc`, HTML) last. */
export const CONTACT_FIELDS = Object.freeze([...CONTACT_WORDS.map(([field]) => field), 'misc'])

/**
 * Every published contact, whole (`include_body`), one list page at a time.
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} read
 * @returns {Promise<{ rows: Record<string, any>[], whole: boolean }>}
 */
export async function readContacts(read) {
  /** @type {Record<string, any>[]} */
  const rows = []
  for (let n = 0; n < PAGES; n += 1) {
    const got = /** @type {any} */ (
      await read('content.list', { kind: 'contact', limit: PAGE, offset: n * PAGE, include_body: true })
    )
    if (!got || got.ok !== true || !Array.isArray(got.items)) return { rows, whole: false }
    for (const row of got.items) if (row && typeof row === 'object') rows.push(row)
    if (got.items.length < PAGE) return { rows, whole: true }
  }
  return { rows, whole: false }
}

/** A published contact (`published` 1), as the open road counts one. */
const published = (/** @type {Record<string, any>} */ row) =>
  String(row.published ?? row.state ?? '1') === '1'

/**
 * What the changes do to each contact: its id, the fields that change (new values) and one row per
 * field, as the receipt names a place (`at`, `before`, `after`, `label`). A find that is empty or not
 * in a column changes nothing there.
 * @param {Record<string, any>[]} rows
 * @param {{ find: string, replace: string }[]} changes
 * @returns {{ id: number, fields: Record<string, string>, places: { at: string, before: string, after: string, label: string }[] }[]}
 */
export function contactChanges(rows, changes) {
  const out = []
  for (const row of rows) {
    const id = Number(row.id)
    if (!(id > 0) || !published(row)) continue
    /** @type {Record<string, string>} */
    const fields = {}
    const places = []
    for (const field of CONTACT_FIELDS) {
      const before = row[field]
      if (typeof before !== 'string' || before === '') continue
      let after = before
      for (const c of changes)
        if (c.find !== '' && after.includes(c.find)) after = after.split(c.find).join(c.replace)
      if (after === before) continue
      fields[field] = after
      const name =
        typeof row.name === 'string' && row.name ? `contact "${row.name.slice(0, 60)}"` : `contact ${id}`
      places.push({
        at: `contact:${id}.${field}`,
        before: before.slice(0, 200),
        after: after.slice(0, 200),
        label: `${name}, ${field}`
      })
    }
    if (places.length) out.push({ id, fields, places })
  }
  return out
}

/** What the agent reads about the contacts beside a contract replace (agent-facing, not shown to the customer). */
export const CONTACT_NOTE = {
  dryRun: (/** @type {number} */ n) =>
    `${n} contact field(s) hold these words too (a contact record is not a contract slot): the same call without dryRun writes them through content.update, beside the slots. They are listed in contacts, not counted in count or expect.`,
  written: (/** @type {number} */ n) =>
    `${n} contact field(s) written too, through content.update; their undo is contactsUndo.`,
  partial:
    'some contact records were not written: contactsFailed names them; write each with content.update {kind:"contact", id, fields}.',
  cut: 'the site has more contacts than one replace reads: a contact past the first 200 was not looked at.'
}

/**
 * Write each contact the changes reach, all under one apply id (one `apply.revert` takes them back).
 * A throw is a lost answer: named as failed with the code the road gives it, never retried here.
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} write
 * @param {() => string} mintApplyId
 * @param {ReturnType<typeof contactChanges>} contacts
 */
export async function writeContacts(write, mintApplyId, contacts) {
  const applyId = mintApplyId()
  const written = []
  const failed = []
  for (const c of contacts) {
    /** @type {any} */
    let answer
    try {
      answer = await write('content.update', {
        kind: 'contact',
        id: c.id,
        fields: c.fields,
        apply_id: applyId
      })
    } catch {
      answer = { ok: false, code: 'COWORK_WEB_UNREACHABLE' }
    }
    if (answer?.ok === true) written.push(...c.places)
    else failed.push({ id: c.id, code: String(answer?.code ?? answer?.error ?? 'WRITE_FAILED').slice(0, 60) })
  }
  return { applyId, written, failed }
}
