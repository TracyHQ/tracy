/**
 * The request bodies of the build chat's engine doors (#609, `doors.ts` of `tracy_build`), read into plain inputs, or
 * null when a body is not one. Pure.
 */

/** Bounds of what the owner gives research: a few links and a short description. */
export const MAX_LINKS = 10
export const MAX_LINK_LENGTH = 2048
export const MAX_DESCRIPTION = 2000
export const MAX_REQUEST = 2000
export const MAX_CHANGES = 20

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const optionalText = (value, max) =>
  value === undefined || value === null
    ? { ok: true }
    : isText(value) && value.length <= max
      ? { ok: true, value: value.trim() }
      : null

/** A web address the research may read: http or https only. */
function linkOf(value) {
  if (!isText(value) || value.length > MAX_LINK_LENGTH) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

const READERS = {
  /** `{links: string[], description?}`: at least one link or a description. */
  research(body) {
    const links = body.links ?? []
    if (!Array.isArray(links) || links.length > MAX_LINKS) return null
    const read = links.map(linkOf)
    if (read.some((l) => l === null)) return null
    const description = optionalText(body.description, MAX_DESCRIPTION)
    if (!description || (read.length === 0 && !description.value)) return null
    return { links: [...new Set(read)], ...(description.value ? { description: description.value } : {}) }
  },
  /** `{request?}`: the owner's words for a larger change. */
  compose(body) {
    const request = optionalText(body.request, MAX_REQUEST)
    return request ? (request.value ? { request: request.value } : {}) : null
  },
  /** `{changes: {field, value}[]}`: one simple change or a few, each naming a field of the plan. */
  edit(body) {
    const { changes } = body
    if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) return null
    if (!changes.every((ch) => isObject(ch) && isText(ch.field) && Object.hasOwn(ch, 'value'))) return null
    return { changes: changes.map(({ field, value }) => ({ field, value })) }
  }
}

/** @param {'research' | 'compose' | 'edit'} door */
export function readEngineRequest(door, body) {
  return isObject(body) ? READERS[door](body) : null
}
