// The undo doors of the blank site in memory (#599), as the door client `siteDoors` sends them and as they were measured
// on plugin 0.24.85 (docs/references/ai-quickstart-contract.md, "Door measurements"):
//   hide({applyId, kind, id})              `content.update` `{published: 0}` (an article: `{state: 0}`): the record
//                                          stays, shown on no page; publishing it again brings it back as it was
//   unassign({applyId, id})                `content.update` `moduleAssignment` `{menuids: "[]"}`: the module prints on
//                                          no page
//   deleteMedia({applyId, path, dryRun})   `media.delete`: a picture under `images/` with an allowed extension, else
//                                          refused `bad_params`; `dryRun` answers the file (size, sha256) and `usedIn`
//                                          (the articles, modules and menu items that name it, a module's contract
//                                          slots included) and deletes nothing; the delete answers `storageDeleted`
// Hide and unassign are the memory site's own `update` (counted, scripted failures and crashes apply, no replay, as
// `content.update`). The delete is one counted call (`act`). Not measured, so modelled the simplest way: a path that
// holds no file is refused `NOT_FOUND`, dry run or not.
import { createHash } from 'node:crypto'
import { DoorRefusal } from './write-order-memory-rules.mjs'

const PICTURE = /^images\/(?:[\w.-]+\/)*[\w.-]+\.(?:jpe?g|png|gif|webp|svg|avif|ico)$/i
/** The record kinds a dry run looks through (the plugin also reads template styles, which the memory site has none of). */
const USED_IN = ['article', 'module', 'menuItem']

/** The fields a hide writes on a record of `kind`, as the door client sends them. */
export const hideFieldsOf = (kind) => (kind === 'article' ? { state: 0 } : { published: 0 })

/**
 * @param {{doors: object, site: {records: object, slots: Map, uploads: Map}, act: Function}} memory the memory site's
 *   doors, its tables and its counted call (`act(name, applyId, payload, check, run)`)
 */
export function memoryUndoDoors({ doors, site, act }) {
  const usedIn = (path) => {
    const out = []
    for (const kind of USED_IN)
      for (const [id, row] of site.records[kind] ?? [])
        if (JSON.stringify(row).includes(path)) out.push({ kind, id })
    for (const slot of site.slots.values()) {
      const id = Number(String(slot.entity ?? '').replace(/^module-/, ''))
      if (!slot.removed && String(slot.current ?? '').includes(path) && id && !out.some((u) => u.id === id))
        out.push({ kind: 'module', id })
    }
    return out
  }
  const fileOf = (path) => {
    if (typeof path !== 'string' || !PICTURE.test(path) || path.includes('..'))
      throw new DoorRefusal('bad_params', 'path must be a safe relative file beneath images/')
    const bytes = site.uploads.get(path)
    if (!bytes) throw new DoorRefusal('NOT_FOUND', `no file at ${path}`)
    return bytes
  }
  return {
    hide: ({ applyId, kind, id }) => doors.update({ applyId, kind, id, fields: hideFieldsOf(kind) }),
    unassign: ({ applyId, id }) =>
      doors.update({ applyId, kind: 'moduleAssignment', id, fields: { menuids: '[]' } }),
    async deleteMedia({ applyId, path, dryRun = false }) {
      if (dryRun) {
        const bytes = fileOf(path)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        return { dryRun: true, files: [{ path, size: bytes.length, sha256 }], usedIn: usedIn(path) }
      }
      return act(
        'media.delete',
        applyId,
        { path },
        () => fileOf(path),
        () => {
          site.uploads.delete(path)
          return { storageDeleted: true, filesLeft: [] }
        }
      )
    }
  }
}
