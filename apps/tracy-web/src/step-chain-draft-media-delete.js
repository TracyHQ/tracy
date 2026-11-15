// The delete of a file a revision uploaded (#599), by a restore or an abandon (`step-chain-draft-write-back.js`), as
// `media.delete` was measured on plugin 0.24.85 (docs/references/draft-revision-run.md, "Deleting an upload"):
//   - the dry run answers `{ok, deleted: {path, files: [{path, size, sha256}]}, totalBytes, undoCopyUnderCap, usedIn,
//     usedInScope}`; `usedIn` is one row per record naming the file, `{type, id, title}` with a plural `type`
//     (`articles`, `modules`, `menuItems`, `templateStyles`), unpublished and trashed records included; nobody: `[]`;
//   - a REAL delete of a file other records use succeeds: the door refuses nothing, it only reports. So no delete is
//     ever sent without a dry run of the same call, read in that shape, that names no record but the ones this undo
//     takes off (`place.mine`);
//   - a path with no file answers `write_failed` (no not-found code), and so does the same apply id called again: an
//     error code never says whether the file is there. Whether it is there is read before the dry run and after any
//     failure, three valued: `presence` ('present', 'absent', 'unread': the site wiring reads the public file, and only
//     a 404 or 410 says absent, `step-chain-draft-site.js`), else, for doors with no such door (the memory site),
//     `media` (null when absent). Absent is done; present, or unread, keeps the file in `left` with why
//     (`presence_unread` before the dry run, `delete_unknown` after a failure), never counted deleted.
// Not measured: `apply.revert` of a delete. Nothing relies on it.

/** The record kinds of the plural types a dry run names. */
const KIND_OF = {
  articles: 'article',
  modules: 'module',
  menuItems: 'menuItem',
  templateStyles: 'templateStyle'
}

/** The records a dry run answer names as `{kind, id}`, else null when the answer has another shape (an unknown type). */
export function usedInOf(dry) {
  if (!dry || typeof dry !== 'object' || Array.isArray(dry) || !Array.isArray(dry.usedIn)) return null
  const out = []
  for (const row of dry.usedIn) {
    const kind = KIND_OF[row?.type]
    if (!kind || row.id === null || row.id === undefined || !Number.isFinite(Number(row.id))) return null
    out.push({ kind, id: Number(row.id) })
  }
  return out
}

/** Whether the file is on the site: true, false, or null when that cannot be read. */
async function presentOf(doors, path) {
  try {
    if (typeof doors.presence === 'function') {
      const got = await doors.presence({ path })
      return got === 'present' ? true : got === 'absent' ? false : null
    }
    if (typeof doors.media !== 'function') return null
    return (await doors.media({ path })) !== null
  } catch (error) {
    if (error?.fatal) throw error
    return null
  }
}

/**
 * A file the revision uploaded, deleted once its dry run names no record but the ones this undo takes off
 * (`place.mine`, `kind:id`): otherwise, or when the site refuses, it stays and is kept in `left` with why.
 * @param {{path: string, mine?: string[]}} place
 * @param {object} doors the site doors (`deleteMedia`, `media`)
 * @param {string} applyId the delete's apply id (the dry run's is `<applyId>:dry`)
 * @param {object[]} left where a file kept goes, `{path, why, usedIn}`
 */
export async function deleteUpload(place, doors, applyId, left) {
  const keep = (why, usedIn = []) => left.push({ path: place.path, why, usedIn })
  if (typeof doors.deleteMedia !== 'function') return keep('door_not_available')
  const present = await presentOf(doors, place.path)
  if (present === false) return
  if (present === null) return keep('presence_unread')
  let dry
  try {
    dry = await doors.deleteMedia({ applyId: `${applyId}:dry`, path: place.path, dryRun: true })
  } catch (error) {
    if (error?.fatal) throw error
    return keep(error?.code ?? 'refused')
  }
  const used = usedInOf(dry)
  if (!used) return keep('used_in_unread', dry?.usedIn === undefined ? [] : [dry.usedIn])
  const mine = new Set(place.mine ?? [])
  const others = used.filter((u) => !mine.has(`${u.kind}:${u.id}`))
  if (others.length) return keep('used_elsewhere', others)
  try {
    await doors.deleteMedia({ applyId, path: place.path })
  } catch (error) {
    if (error?.fatal) throw error
    // The error says nothing of the file: it is read again; gone is done, there or unread is kept.
    const after = await presentOf(doors, place.path)
    if (after !== false) keep(after === null ? 'delete_unknown' : (error?.code ?? 'refused'))
  }
}
