// The edits of a bench fix round's change list inside one part of a document (bench-changes.js; ADR 0041, #301; shared
// by every bench step since #327): a whole part replaced, one value at a path replaced ("field"), one entry added to a
// list ("add"), one value or the part itself removed ("remove"). A path is keys and list positions joined by dots,
// relative to the part or section the change names: "says", "hiddenSlots", "story.2.step", "footerMenu[1].heading" (a
// bracketed position reads as one more dot). Which kinds of part exist, the key holding each kind's id, and which
// kinds may be removed whole are the step's (ctx.rules: { partKinds, removable, noun }). Pure.
import { measureReplacement } from './bench-change-size.js'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isContainer = (v) => v !== null && typeof v === 'object'

/** Keys a path may not step through: they reach the object's prototype, not the document. */
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor'])

/** The steps of a path, or null when it is not a non-empty path with no empty or forbidden step. */
export function pathSteps(path) {
  if (typeof path !== 'string' || !path) return null
  const steps = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  return steps.every((s) => s.length && !FORBIDDEN.has(s)) ? steps : null
}

/**
 * Where a path ends inside a root value: `{ parent, key }` (the key a list position, as a number, when the parent is
 * a list), or `{ reason }` when a step on the way is missing or is not an object or list.
 */
export function walkPath(root, steps) {
  let parent = root
  for (const [i, step] of steps.entries()) {
    if (!isContainer(parent))
      return { reason: `${steps.slice(0, i).join('.') || 'it'} is not an object or list` }
    const key = Array.isArray(parent) ? positionIn(parent, step) : step
    if (key === null) return { reason: `${steps.slice(0, i + 1).join('.')} is not a position in that list` }
    if (i === steps.length - 1) return { parent, key }
    if (!Object.hasOwn(parent, key)) return { reason: `${steps.slice(0, i + 1).join('.')} does not exist` }
    parent = parent[key]
  }
  return { reason: 'the path is empty' }
}

function positionIn(list, step) {
  if (!/^\d+$/.test(step)) return null
  const n = Number(step)
  return n < list.length ? n : null
}

// A path inside the target: where it ends, or the reason it cannot be edited. The id of a part is not a field.
function placeOf(target, path, op, { at, rules }) {
  const steps = pathSteps(path)
  if (!steps) return { reason: `${at} names no path to ${op}` }
  if (target.kind !== 'section' && steps.length === 1 && steps[0] === rules.partKinds[target.kind])
    return { reason: `${at} cannot ${op} the ${target.kind} id; replace the whole ${target.kind} instead` }
  const root = target.get()
  if (root === undefined)
    return { reason: `${at} names ${target.label}, which the ${rules.noun} does not have` }
  const place = walkPath(root, steps)
  return place.reason ? { reason: `${at} cannot ${op} ${path} of ${target.label}: ${place.reason}` } : place
}

const sameShape = (current, value) => current === undefined || Array.isArray(current) === Array.isArray(value)

// The whole part or section replaced by "with".
function replaceWhole(target, value, { n, at, replacements, rules }) {
  const current = target.get()
  if (target.kind === 'section') {
    if (!sameShape(current, value)) return `${at} replaces section ${target.id} with a value of another type`
  } else {
    const idKey = rules.partKinds[target.kind]
    if (!isObject(value) || value[idKey] !== target.id)
      return `${at} must replace ${target.kind} ${target.id} with one object whose ${idKey} is ${target.id}`
  }
  replacements.push(measureReplacement(n, target.label, value, current))
  target.set(value)
  return null
}

// One value inside the part replaced ("field"), one entry added to a list in it ("add"), or one value removed.
function edit(target, change, op, ctx) {
  const { n, at, replacements, rules } = ctx
  const value = change.with
  if (op === 'remove' && change.remove === true) {
    if (!rules.removable.includes(target.kind))
      return `${at}: a ${target.kind} cannot be removed, only a ${rules.removable.join(', ')}`
    target.remove()
    return null
  }
  if (op === 'remove' && typeof change.remove !== 'string') return `${at}: remove must be true or a path`
  if (op === 'add' && (value === undefined || Array.isArray(value)))
    return `${at} must add one object or value, not a list`
  if (op === 'add' && change.add === true) {
    const list = target.get()
    if (!Array.isArray(list)) return `${at} adds to ${target.label}, which is not a list`
    list.push(value)
    return null
  }
  const path = change[op]
  const place = placeOf(target, path, op === 'field' ? 'replace' : op, ctx)
  if (place.reason) return place.reason
  const { parent, key } = place
  const current = Object.hasOwn(parent, key) ? parent[key] : undefined
  if (op === 'remove') {
    if (current === undefined) return `${at} cannot remove ${path} of ${target.label}: it does not exist`
    if (Array.isArray(parent)) parent.splice(key, 1)
    else delete parent[key]
    return null
  }
  if (op === 'add') {
    if (current !== undefined && !Array.isArray(current))
      return `${at} adds to ${path} of ${target.label}, which is not a list`
    parent[key] = [...(current ?? []), value]
    return null
  }
  if (!sameShape(current, value))
    return `${at} replaces field ${path} of ${target.label} with a value of another type`
  replacements.push(measureReplacement(n, `${path} of ${target.label}`, value, current))
  parent[key] = value
  return null
}

/**
 * One change applied to its target (a part or a section, as bench-changes.js resolves it), in place: op is "replace"
 * (the whole part), "field", "add" or "remove". Returns null, or the reason it cannot be applied. Every replaced
 * value is measured into ctx.replacements; ctx.rules holds the step's part kinds and removable kinds.
 */
export const applyEdit = (target, change, op, ctx) =>
  op === 'replace' ? replaceWhole(target, change.with, ctx) : edit(target, change, op, ctx)
