// Reading a bench agent's final answer as one JSON object (ADR 0041, #301; shared by every bench step since #327).
// Pure: text in, an object or a reason out.
//
// An answer is one JSON object, bare or in one markdown code fence around the whole answer. An answer with text
// around exactly one fenced block whose content is one JSON object is read as that block, and the dropped text is
// recorded. Two fenced blocks or none stay unread. In a fix round the answer may be a change list instead:
// { "changes": [ ... ] } and nothing else (bench-changes.js).

const FENCE_WHOLE = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/i
const FENCE_ANY = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/gi

function parseObject(text, codePrefix) {
  let value
  try {
    value = JSON.parse(text.trim())
  } catch (error) {
    return {
      ok: false,
      error: `${codePrefix}_ANSWER_NOT_JSON: ${String(error?.message ?? error).slice(0, 200)}`
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, error: `${codePrefix}_ANSWER_NOT_OBJECT: the answer is JSON but not one object` }
  return { ok: true, value }
}

/**
 * The JSON object in an answer: `{ ok, value, droppedText }`, or `{ ok: false, error }` whose code starts with the
 * step's `codePrefix` (SITE_PLANNER). droppedText is true when text around the one fenced block was dropped.
 *
 * A change list that is not valid JSON as a whole keeps its changes that are (salvagedChangeList), with `repaired`
 * saying how many were kept and lost: a fix round's list is a series of independent edits, each checked again when it
 * is applied, so one broken edit need not cost the others. Dev lat24b (21/11/2026): BXR London's first plan fix round
 * answered a list of about 21k tokens that was not valid JSON; the whole round was lost (146 s) and the next one wrote
 * the whole plan again (47k tokens, 135 s). A whole document is still read only as above.
 */
export function objectOf(answer, { codePrefix }) {
  const text = String(answer).trim()
  const whole = parseObject(FENCE_WHOLE.exec(text)?.[1] ?? text, codePrefix)
  if (whole.ok) return { ...whole, droppedText: false }
  const blocks = [...text.matchAll(FENCE_ANY)]
  const inner = blocks.length === 1 ? parseObject(blocks[0][1], codePrefix) : null
  if (inner?.ok) return { ...inner, droppedText: true }
  const salvaged = salvagedChangeList(text)
  return salvaged ?? whole
}

const CHANGES_START = /\{\s*"changes"\s*:\s*\[/

/**
 * The changes of a change list that is not valid JSON as a whole: each element of its `changes` array that parses on
 * its own as an object, in order, up to the array's end or the answer's end. Null when the answer holds no change list
 * or no element of it parses. Strings are followed with their escapes, so a bracket inside a value never ends an element.
 */
export function salvagedChangeList(text) {
  const src = String(text)
  // Two lists are two answers: which one is meant is not for code to choose.
  if (src.match(new RegExp(CHANGES_START.source, 'g'))?.length !== 1) return null
  const start = CHANGES_START.exec(src)
  const kept = []
  let lost = 0
  let depth = 0
  let inString = false
  let escaped = false
  let from = -1
  for (let i = start.index + start[0].length; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      if (depth === 0 && from < 0) from = i
    } else if (c === '{' || c === '[') {
      if (depth === 0) from = i
      depth++
    } else if (c === '}' || c === ']') {
      if (depth === 0) break
      depth--
      if (depth === 0) {
        try {
          const value = JSON.parse(src.slice(from, i + 1))
          if (value && typeof value === 'object' && !Array.isArray(value)) kept.push(value)
          else lost++
        } catch {
          lost++
        }
        from = -1
      }
    } else if (c === ',' && depth === 0) {
      if (from >= 0) lost++
      from = -1
    }
  }
  if (from >= 0) lost++
  if (!kept.length) return null
  return { ok: true, value: { changes: kept }, droppedText: true, repaired: { kept: kept.length, lost } }
}

/** True when the object is a change list rather than a whole document. */
export const isChangeList = (value) => Object.keys(value).length === 1 && Object.hasOwn(value, 'changes')
