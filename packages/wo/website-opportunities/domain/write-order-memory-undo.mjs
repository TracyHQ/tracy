// The undo doors of the blank site in memory (#599), as the door client `siteDoors` sends them and as they were measured
// on plugin 0.24.85 (docs/references/ai-quickstart-contract.md, "Door measurements"):
//   hide({applyId, kind, id})              `content.update` `{published: 0}` (an article: `{state: 0}`): the record
//                                          stays, shown on no page; publishing it again brings it back as it was
//   unassign({applyId, id})                `content.update` `moduleAssignment` `{menuids: "[]"}`: the module prints on
//                                          no page
//   deleteMedia({applyId, path, dryRun})   `media.delete`: a picture under `images/` with an allowed extension, else
//                                          refused `bad_params`; a path with no file (a missing folder too) refused
//                                          `write_failed`, dry run or not, and again for the same apply id (no replay
//                                          answer); the dry run answers `{ok, deleted: {path, files: [{path, size,
//                                          sha256}]}, totalBytes, undoCopyUnderCap, usedIn, usedInScope}` and deletes
//                                          nothing; `usedIn` is one row per record naming the file, `{type, id, title}`
//                                          with a plural type (`articles`, `modules`, `menuItems`), unpublished and
//                                          trashed records included, a module's contract slots too; the delete deletes
//                                          whoever uses the file (the door refuses nothing), `storageDeleted: true`
// Hide and unassign are the memory site's own `update` (counted, scripted failures and crashes apply, no replay, as
// `content.update`). The delete is one counted call (`act`). All as measured on plugin 0.24.85.
import { createHash } from 'node:crypto'
import { DoorRefusal } from './write-order-memory-rules.mjs'

const PICTURE = /^images\/(?:[\w.-]+\/)*[\w.-]+\.(?:jpe?g|png|gif|webp|svg|avif|ico)$/i
/** The record kinds a dry run looks through (the plugin also reads template styles, which the memory site has none of). */
const USED_IN = { article: 'articles', module: 'modules', menuItem: 'menuItems' }
const NO_FILE =
  'could not make and verify the undo copy; nothing was deleted: path must be an existing file whose realpath stays under images/'

/** The fields a hide writes on a record of `kind`, as the door client sends them. */
export const hideFieldsOf = (kind) => (kind === 'article' ? { state: 0 } : { published: 0 })

/**
 * @param {{doors: object, site: {records: object, slots: Map, uploads: Map}, act: Function}} memory the memory site's
 *   doors, its tables and its counted call (`act(name, applyId, payload, check, run)`)
 */
export function memoryUndoDoors({ doors, site, act }) {
  const usedIn = (path) => {
    const out = []
    const titleOf = (kind, id) =>
      String(site.records[kind]?.get(id)?.title ?? site.records[kind]?.get(id)?.name ?? '')
    for (const [kind, type] of Object.entries(USED_IN))
      for (const [id, row] of site.records[kind] ?? [])
        if (JSON.stringify(row).includes(path)) out.push({ type, id, title: titleOf(kind, id) })
    for (const slot of site.slots.values()) {
      const id = Number(String(slot.entity ?? '').replace(/^module-/, ''))
      const listed = out.some((u) => u.type === 'modules' && u.id === id)
      if (!slot.removed && String(slot.current ?? '').includes(path) && id && !listed)
        out.push({ type: 'modules', id, title: titleOf('module', id) })
    }
    return out
  }
  const fileOf = (path) => {
    if (typeof path !== 'string' || !PICTURE.test(path) || path.includes('..'))
      throw new DoorRefusal('bad_params', 'path must be a safe relative file beneath images/')
    const bytes = site.uploads.get(path)
    if (!bytes) throw new DoorRefusal('write_failed', NO_FILE)
    return bytes
  }
  return {
    hide: ({ applyId, kind, id }) => doors.update({ applyId, kind, id, fields: hideFieldsOf(kind) }),
    unassign: ({ applyId, id }) =>
      doors.update({ applyId, kind: 'moduleAssignment', id, fields: { menuids: '[]' } }),
    async deleteMedia({ applyId, path, dryRun = false }) {
      const answerOf = (bytes) => {
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        return {
          ok: true,
          deleted: { path, files: [{ path, size: bytes.length, sha256 }] },
          totalBytes: bytes.length,
          undoCopyUnderCap: true,
          usedIn: usedIn(path),
          usedInScope: 'all pages'
        }
      }
      if (dryRun) return answerOf(fileOf(path))
      return act(
        'media.delete',
        applyId,
        { path },
        () => fileOf(path),
        () => {
          site.uploads.delete(path)
          return { ok: true, storageDeleted: true, filesLeft: [] }
        }
      )
    }
  }
}
