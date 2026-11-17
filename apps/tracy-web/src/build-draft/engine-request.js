/**
 * The request bodies of the build chat's engine doors (#609, `doors.ts` of `tracy_build`), read into plain inputs, or
 * null when a body is not one. Pure.
 */

/** Bounds of what the owner gives research: a few links and a short description. */
export const MAX_LINKS = 10
export const MAX_LINK_LENGTH = 2048
export const MAX_DESCRIPTION = 2000
export const MAX_NAME = 120
export const MAX_REQUEST = 2000
export const MAX_CHANGES = 20

/** A language the owner chats in: two lower case letters. */
const LANGUAGE = /^[a-z]{2}$/

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
  /**
   * `{links: string[], description?, name?, city?}`: at least one link, a description or a name; `name`, the business
   * name the owner typed, is what a research with no link names the business by, and with `city` (where it is) what
   * that research looks it up on Google Maps by (#575).
   */
  research(body) {
    const links = body.links ?? []
    if (!Array.isArray(links) || links.length > MAX_LINKS) return null
    const read = links.map(linkOf)
    if (read.some((l) => l === null)) return null
    const description = optionalText(body.description, MAX_DESCRIPTION)
    const name = optionalText(body.name, MAX_NAME)
    const city = optionalText(body.city, MAX_NAME)
    if (!description || !name || !city || (read.length === 0 && !description.value && !name.value))
      return null
    return {
      links: [...new Set(read)],
      ...(description.value ? { description: description.value } : {}),
      ...(name.value ? { name: name.value } : {}),
      ...(city.value ? { city: city.value } : {})
    }
  },
  /**
   * `{request?, restart?, language?}`: the owner's words for a larger change; `restart: true` only when the owner asked
   * to start the plan over (it discards the living plan and its edits); `language`, the two letter language the owner
   * chats in (#575), which the plan's sentences for the owner are written in.
   */
  compose(body) {
    const request = optionalText(body.request, MAX_REQUEST)
    if (!request) return null
    if (body.restart !== undefined && typeof body.restart !== 'boolean') return null
    if (body.language !== undefined && !LANGUAGE.test(String(body.language))) return null
    return {
      ...(request.value ? { request: request.value } : {}),
      ...(body.restart ? { restart: true } : {}),
      ...(body.language !== undefined ? { language: body.language } : {})
    }
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
