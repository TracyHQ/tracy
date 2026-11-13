// The shape of the plan composer's reply, checked before any rule reads it (ticket #593): every object is a closed
// shape, every value has its type, no list holds an id twice. A reply that fails here is reported as `reply_shape`
// problems, goes through the one retry with them, then stops as `plan_gate_failed`; no later code of the gate ever
// reads a value of the wrong type. The closed block shape is also the first guard of the design typed fields: a block
// carries only `block`, `label`, `data`, `reason` and `targets`, so no key can address a field (see `plan-gate.mjs`).
import { LEFT_OUT_KINDS } from './build-contract-plan.mjs'

const SHAPES = Object.freeze({
  reply: { required: ['pages'], optional: ['assumptions', 'leftOut'] },
  page: { required: ['pageType', 'name', 'blocks'], optional: [] },
  block: { required: ['block', 'label', 'data', 'reason'], optional: ['targets'] },
  assumption: { required: ['field', 'said'], optional: [] },
  'left out entry': { required: ['reason'], optional: ['item', 'what', 'kind'] }
})
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string'

/** Report an object that is not one, a missing key or a key outside its shape. Returns false when not an object. */
function closed(value, name, at, problem) {
  if (!isObject(value)) {
    problem('reply_shape', at, `${at || 'the reply'} must be an object (${name})`)
    return false
  }
  const { required, optional } = SHAPES[name]
  for (const key of required)
    if (!Object.hasOwn(value, key)) problem('reply_shape', at ? `${at}.${key}` : key, `missing ${key}`)
  for (const key of Object.keys(value))
    if (!required.includes(key) && !optional.includes(key))
      problem('reply_shape', at ? `${at}.${key}` : key, `${JSON.stringify(key)} is not a key of a ${name}`)
  return true
}

function texts(value, at, problem, what) {
  if (value !== undefined && !isText(value)) problem('reply_shape', at, `${what} must be a text`)
}

function idList(value, at, problem, { optional = false } = {}) {
  if (value === undefined && optional) return
  if (!Array.isArray(value)) return problem('reply_shape', at, 'must be a list of ids')
  const seen = new Set()
  value.forEach((id, i) => {
    if (!isText(id)) problem('reply_shape', `${at}[${i}]`, 'an id must be a text')
    else if (seen.has(id)) problem('reply_shape', `${at}[${i}]`, `${JSON.stringify(id)} appears twice`)
    else seen.add(id)
  })
}

function list(value, at, problem, each, { optional = true } = {}) {
  if (value === undefined && optional) return
  if (!Array.isArray(value)) return problem('reply_shape', at, 'must be a list')
  value.forEach((entry, i) => each(entry, `${at}[${i}]`))
}

/**
 * Report every shape problem of a composer reply through `problem(code, at, message)`.
 * @returns {boolean} true when the reply has its shape and the rules may read it
 */
export function replyShapeProblems(reply, problem) {
  let count = 0
  const counted = (code, at, message) => {
    count += 1
    problem(code, at, message)
  }
  if (!closed(reply, 'reply', '', counted)) return false
  list(
    reply.pages,
    'pages',
    counted,
    (page, at) => {
      if (!closed(page, 'page', at, counted)) return
      texts(page.pageType, `${at}.pageType`, counted, 'pageType')
      texts(page.name, `${at}.name`, counted, 'name')
      list(
        page.blocks,
        `${at}.blocks`,
        counted,
        (block, blockAt) => {
          if (!closed(block, 'block', blockAt, counted)) return
          for (const key of ['block', 'label', 'reason']) texts(block[key], `${blockAt}.${key}`, counted, key)
          idList(block.data, `${blockAt}.data`, counted)
          idList(block.targets, `${blockAt}.targets`, counted, { optional: true })
        },
        { optional: false }
      )
    },
    { optional: false }
  )
  list(reply.assumptions, 'assumptions', counted, (a, at) => {
    if (!closed(a, 'assumption', at, counted)) return
    texts(a.field, `${at}.field`, counted, 'field')
    texts(a.said, `${at}.said`, counted, 'said')
  })
  const leftOutItems = new Set()
  list(reply.leftOut, 'leftOut', counted, (entry, at) => {
    if (!closed(entry, 'left out entry', at, counted)) return
    for (const key of ['item', 'what', 'kind', 'reason']) texts(entry[key], `${at}.${key}`, counted, key)
    if (entry.item === undefined && (entry.what === undefined || entry.kind === undefined))
      counted('reply_shape', at, 'a left out entry names an `item` id, or `what` and `kind`')
    if (entry.kind !== undefined && !LEFT_OUT_KINDS.includes(entry.kind))
      counted('reply_shape', `${at}.kind`, `kind is one of ${LEFT_OUT_KINDS.join(', ')}`)
    if (entry.item !== undefined && entry.kind !== undefined && entry.kind !== 'item')
      counted('reply_shape', `${at}.kind`, 'a left out item has the kind "item"')
    if (isText(entry.item) && leftOutItems.has(entry.item))
      counted('reply_shape', `${at}.item`, `${JSON.stringify(entry.item)} is left out twice`)
    if (isText(entry.item)) leftOutItems.add(entry.item)
  })
  return count === 0
}
