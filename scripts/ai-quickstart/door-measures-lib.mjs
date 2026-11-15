/**
 * Helpers of `door-measures.mjs`: a recorded door (every call kept with its raw answer), the pages a measurement
 * creates, and what a page shows of a record.
 */
import * as K from './copy-proof-lib.mjs'

/** A door whose every call is kept, in order, with its parameters and its raw answer (for the report). */
export function recordedDoor(base, token, log) {
  const door = K.doorOf(base, token)
  let n = 0
  const stamp = Date.now()
  const applyId = (prefix = 'measure') => `${prefix}-${stamp}-${n++}`
  const call = async (action, params) => {
    const answer = await door.call(action, params)
    log.push({ action, params, answer })
    return answer
  }
  const update = (kind, id, fields, apply_id = applyId()) =>
    call('content.update', { apply_id, kind, id, fields })
  /** An update that must be written: throws with the door's answer when it is refused. */
  const made = async (kind, id, fields) => {
    const answer = await update(kind, id, fields)
    if (answer.ok !== true) throw new Error(`content.update ${kind} ${id}: ${JSON.stringify(answer)}`)
    return answer.id ?? id
  }
  const get = async (kind, id) => (await call('content.get', { kind, id })).item ?? null
  return { call, update, made, get, applyId }
}

/** GET a path of the site: status, HTML and the redirect target, never following a redirect. */
export async function fetchPage(base, path) {
  const response = await fetch(`${base}/${path.replace(/^\//, '')}`, { redirect: 'manual' })
  return { status: response.status, html: await response.text(), location: response.headers.get('location') }
}

/** How many times `needle` occurs in `html`. */
export const count = (html, needle) => String(html ?? '').split(needle).length - 1

/**
 * How a probe printed: `raw` when its special characters came out as written, `escaped` when as entities
 * (`&quot;`, `&#039;`, `&lt;`, `&gt;`, `&amp;`), `absent` when the probe's tag does not occur, `other` otherwise.
 * A probe is `<tag>"'<>&` where the tag is letters only.
 */
export function probeState(html, tag) {
  const text = String(html ?? '')
  if (text.includes(`${tag}"'<>&`)) return 'raw'
  if (
    /&quot;(&#0?39;|&apos;)&lt;&gt;&amp;/.test(text.slice(text.indexOf(tag))) &&
    text.includes(`${tag}&quot;`)
  )
    return 'escaped'
  return text.includes(tag) ? 'other' : 'absent'
}

/** The characters before and after the first occurrence of `tag` (for the report). */
export const around = (html, tag, before = 60, after = before) => {
  const at = String(html ?? '').indexOf(tag)
  return at < 0 ? null : html.slice(Math.max(0, at - before), at + tag.length + after)
}

/** The menu item fields of a page of the main menu (a menu item is a page on Joomla). */
export const pageFields = (title, alias, style, link, extra = {}) => ({
  title,
  alias,
  menutype: 'mainmenu',
  type: 'component',
  component_id: 19,
  link,
  published: 1,
  language: '*',
  access: 1,
  params: '{}',
  template_style_id: style,
  ...extra
})

export { K }
