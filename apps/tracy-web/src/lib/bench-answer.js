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
 */
export function objectOf(answer, { codePrefix }) {
  const text = String(answer).trim()
  const whole = parseObject(FENCE_WHOLE.exec(text)?.[1] ?? text, codePrefix)
  if (whole.ok) return { ...whole, droppedText: false }
  const blocks = [...text.matchAll(FENCE_ANY)]
  if (blocks.length !== 1) return whole
  const inner = parseObject(blocks[0][1], codePrefix)
  return inner.ok ? { ...inner, droppedText: true } : whole
}

/** True when the object is a change list rather than a whole document. */
export const isChangeList = (value) => Object.keys(value).length === 1 && Object.hasOwn(value, 'changes')
