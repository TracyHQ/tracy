// A fact id the planner shortened is put back whole, when exactly one fact of the brief starts with it. The brief's
// facts are named `fact_` and 24 hex digits (website-opportunities' profile ids); a planner reasoning over a long brief
// sometimes cites them by their first 8 digits (`fact_15bd7b59` for `fact_15bd7b59cd7546464c2f8efa`). Every such cite
// failed R02 ("fact id … not in brief.facts"), and the copy written on that plan cited the same ids (W04 "cites unknown
// fact"): dev lat24b (21/11/2026), BXR London's plan round 0 had 466 R02 failures and its draft copy 199 W04 failures,
// all of them shortened ids, and the copy step's fix round took 296 s. It happened in five of seven BXR builds (8 to
// 466 failures). Only a cite that matches no fact and starts exactly one fact id is changed, so nothing is guessed:
// a cite that matches two facts, or none, stays for R02 and the planner.
//
// The places a plan cites a fact: `factIds` and `factId` anywhere, a picture wish's `person`, and a link target
// `<kind>:<fact id>` (`leadsTo`, primaryAction). Pure: plan and brief in, the same plan when nothing changed.

const SHORT_ID = /^fact_[0-9a-f]{6,23}$/
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The whole id of a shortened fact id, or the id unchanged. */
function fullIdOf(id, ids, known) {
  if (typeof id !== 'string' || known.has(id) || !SHORT_ID.test(id)) return id
  const matches = ids.filter((x) => x.startsWith(id))
  return matches.length === 1 ? matches[0] : id
}

/** A link target `<kind>:<fact id>` with its fact id made whole. */
function fullTargetOf(target, ids, known) {
  if (typeof target !== 'string') return target
  const at = target.indexOf(':')
  if (at < 1) return target
  const id = target.slice(at + 1)
  const whole = fullIdOf(id, ids, known)
  return whole === id ? target : `${target.slice(0, at + 1)}${whole}`
}

/**
 * The plan with every shortened fact id made whole.
 * @param {object} plan @param {object} brief
 * @returns {object} the same object when nothing was shortened
 */
export function withFullFactIds(plan, brief) {
  const ids = (Array.isArray(brief?.facts) ? brief.facts : [])
    .map((f) => f?.id)
    .filter((id) => typeof id === 'string')
  if (!isObject(plan) || !ids.length) return plan
  const known = new Set(ids)
  const whole = (id) => fullIdOf(id, ids, known)
  const walk = (node) => {
    if (Array.isArray(node)) {
      let changed = false
      const out = node.map((v) => {
        const next = walk(v)
        if (next !== v) changed = true
        return next
      })
      return changed ? out : node
    }
    if (!isObject(node)) return node
    let out = node
    const set = (key, value) => {
      if (value === node[key]) return
      if (out === node) out = { ...node }
      out[key] = value
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'factIds' && Array.isArray(value)) {
        const next = value.map(whole)
        if (next.some((id, i) => id !== value[i])) set(key, next)
      } else if (key === 'factId' || key === 'person') set(key, whole(value))
      else if (key === 'leadsTo') set(key, fullTargetOf(value, ids, known))
      else if (value && typeof value === 'object') set(key, walk(value))
    }
    return out
  }
  return walk(plan)
}
