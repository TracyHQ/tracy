// The door client of the draft write (ticket #585, for the write step of #597): the doors the write step calls
// (`apps/tracy-web/src/step-chain-draft-write.js`, `docs/references/draft-write-step.md` "The doors") as Claude
// Cowork plugin operations. The one table from a door to a plugin operation; it never touches the network itself:
// every plugin call goes through the injected `send(operation, payload)`, which answers the plugin's answer and throws
// on a refusal (the app passes its Apply door transport, `step-chain-draft-send.js`; the gate passes a direct call,
// `scripts/ai-quickstart/site-doors-send.mjs`).
//
// What it keeps that the plugin does not (measured on 0.24.85, `ai-quickstart-contract.md` "Door measurements"):
//   - a replayed apply id answers its first answer: `content.contract` keeps its own replay (apply id and request id,
//     with a content hash), `content.update`, `media.upload` and `site.identity` keep none, so the client keeps each
//     answer by apply id (in memory, or in an injected `journal` that outlives the process); the same apply id with
//     another payload is a step bug and is refused (`APPLY_ID_REUSED`);
//   - a contract apply id starts with `contract-` (the plugin refuses any other) and its request id is the apply id.
// A door the plugin has no operation for answers a typed error (`DOOR_NOT_AVAILABLE`, with the door's name), never an
// invented call.
import { createHash } from 'node:crypto'
import { memoryHtml } from './write-order-memory-html.mjs'

/** The code of a door the plugin has no operation for. */
export const DOOR_NOT_AVAILABLE = 'DOOR_NOT_AVAILABLE'
/** The doors that answer `DOOR_NOT_AVAILABLE`, and why (until a measurement shows an operation for them). */
export const UNAVAILABLE_DOORS = Object.freeze({
  'contract.removes':
    'content.contract apply has no removes, and rows.remove is refused on the blank site (SLOT_NOT_REMOVABLE)',
  deleteRecord: 'content.delete on a page or a record is not measured',
  revertDelete: 'apply.revert of a delete is not measured',
  media: 'no plugin operation reads a file back: it needs the public file reader (publicFile)'
})

export class DoorError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
  }
}
const unavailable = (door) =>
  new DoorError(DOOR_NOT_AVAILABLE, `${door}: ${UNAVAILABLE_DOORS[door]}`, { door })

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashOf = (payload) =>
  sha256(
    JSON.stringify(payload, (_, v) =>
      v instanceof Uint8Array || Buffer.isBuffer(v)
        ? `bytes:${sha256(v)}`
        : v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
          : v
    )
  )
/** The plugin's contract apply id of a write step apply id. */
export const contractApplyId = (applyId) =>
  String(applyId).startsWith('contract-') ? applyId : `contract-${applyId}`
/** The page a content list asks at most. */
const LIST_PAGE = 25
const LIST_PAGES = 40

/** A memory journal of the answers by apply id (the default: one process). */
export function memoryJournal() {
  const answers = new Map()
  return { get: async (id) => answers.get(id) ?? null, set: async (id, entry) => void answers.set(id, entry) }
}

/**
 * The doors of a site.
 * @param {{send: (operation: string, payload: object) => Promise<object>, siteKey?: string, publicFile?: (path:
 *   string) => Promise<Uint8Array | null>, signal?: AbortSignal, journal?: {get: Function, set: Function},
 *   html?: object}} input `siteKey` names the site in errors; `signal` stops every door before its next plugin call.
 * @returns the write step's doors: get, update, find, inspect, contract, read, upload, media, identity, readIdentity,
 *   html; and the undo doors hide, unassign, deleteMedia, deleteRecord, revertDelete
 */
export function siteDoors({
  send: sendRaw,
  siteKey = null,
  publicFile = null,
  signal = null,
  journal = memoryJournal(),
  html = memoryHtml
}) {
  if (typeof sendRaw !== 'function') throw new TypeError('siteDoors needs send(operation, payload)')
  const send = (operation, payload) => {
    if (signal?.aborted)
      return Promise.reject(new DoorError('ABORTED', `${operation} stopped before it was sent`, { siteKey }))
    return sendRaw(operation, payload)
  }
  /** A write kept by apply id: a replay answers the first answer, another payload under the same id is refused. */
  const once = async (door, applyId, payload, call) => {
    if (typeof applyId !== 'string' || applyId === '')
      throw new DoorError('APPLY_ID_REQUIRED', `${door} has no apply id`)
    const hash = hashOf({ door, payload })
    const had = await journal.get(applyId)
    if (had) {
      if (had.hash !== hash)
        throw new DoorError('APPLY_ID_REUSED', `${applyId} was first used with another call`, { door })
      return structuredClone(had.answer)
    }
    const answer = await call()
    await journal.set(applyId, { hash, answer })
    return answer
  }
  const inspect = () => send('content.contract', { operation: 'inspect' })
  const doors = {
    html,
    async inspect() {
      return { revision: (await inspect()).revision }
    },
    async get({ kind, id }) {
      return (await send('content.get', { kind, id })).item ?? null
    },
    update({ applyId, kind, id, fields }) {
      return once('update', applyId, { kind, id, fields }, async () => {
        const answer = await send('content.update', { apply_id: applyId, kind, id, fields })
        return { id: Number(answer.id ?? id) }
      })
    },
    async find({ kind, mark }) {
      const hit = (row) => row?.note === mark || row?.alias === mark
      for (let page = 0; page < LIST_PAGES; page++) {
        const answer = await send('content.list', {
          kind,
          offset: page * LIST_PAGE,
          limit: LIST_PAGE,
          include_body: true
        })
        const items = Array.isArray(answer.items) ? answer.items : []
        const found = items.find(hit)
        if (found) return Number(found.id)
        if (items.length < LIST_PAGE) return null
      }
      throw new DoorError(
        'FIND_TOO_MANY',
        `more than ${LIST_PAGE * LIST_PAGES} ${kind} records to look through`
      )
    },
    contract({ applyId, expectedRevision, changes, removes = [] }) {
      if (removes.length) return Promise.reject(unavailable('contract.removes'))
      const id = contractApplyId(applyId)
      return once('contract', applyId, { changes }, async () => {
        const evidence = Object.fromEntries(
          Object.keys(changes).map((k) => [k, 'build: written by the write step'])
        )
        await send('content.contract', {
          operation: 'apply',
          apply_id: id,
          request_id: id,
          expected_revision: expectedRevision,
          changes,
          evidence
        })
        return { ok: true }
      })
    },
    async read({ slots }) {
      const state = await inspect()
      const current = new Map((state.slots ?? []).map((s) => [s.key, s.current]))
      const removed = state.removedSlots ?? {}
      return Object.fromEntries(slots.map((k) => [k, k in removed ? null : (current.get(k) ?? null)]))
    },
    upload({ applyId, path, bytes }) {
      return once('upload', applyId, { path, bytes }, async () => {
        const answer = await send('media.upload', {
          apply_id: applyId,
          path,
          content_b64: Buffer.from(bytes).toString('base64')
        })
        return { path: answer.path ?? path }
      })
    },
    async media({ path }) {
      if (typeof publicFile !== 'function') throw unavailable('media')
      const bytes = await publicFile(path)
      return bytes ? { sha256: sha256(bytes) } : null
    },
    identity({ applyId, fields }) {
      return once('identity', applyId, { fields }, async () => {
        await send('site.identity', { operation: 'set', apply_id: applyId, fields })
        return { ok: true }
      })
    },
    async readIdentity() {
      return (await send('site.identity', { operation: 'read' })).fields ?? {}
    },
    // The undo doors (measured on 0.24.85): a hide that publishing again reverses, a module on no page, a media file
    // taken off under images/ (with `dryRun` the files and the records naming them, nothing deleted).
    hide({ applyId, kind, id }) {
      const fields = kind === 'article' ? { state: 0 } : { published: 0 }
      return doors.update({ applyId, kind, id, fields })
    },
    unassign({ applyId, id }) {
      return doors.update({ applyId, kind: 'moduleAssignment', id, fields: { menuids: '[]' } })
    },
    deleteMedia({ applyId, path, dryRun = false }) {
      return once('deleteMedia', applyId, { path, dryRun }, () =>
        send('media.delete', { apply_id: applyId, path, ...(dryRun ? { dry_run: true } : {}) })
      )
    },
    async deleteRecord() {
      throw unavailable('deleteRecord')
    },
    async revertDelete() {
      throw unavailable('revertDelete')
    }
  }
  return doors
}
