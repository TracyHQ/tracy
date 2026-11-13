// The shape of the model's answer to a change request (ticket #617, `plan-request-prompt.md`), checked before any rule
// reads it: a closed list of changes (`op`), each quoting the words of the request that ask for it, and the parts of
// the request that could not be done, each with a reason of `NOT_DONE_REASONS`. A change whose quote is not words of
// the request is `change_unlinked`: the request decides what changes, so a change nothing in it asks for is never
// made. It fails the attempt (rather than being dropped) so the re-compose states its intent, and a half applied
// request (one change kept, the one it depends on dropped) never reaches the customer. Pure.
import { NOT_DONE_REASONS } from './build-contract-plan-request.mjs'

const BLOCK = ['block', 'label', 'data', 'reason']
/** Each op: its required keys, its optional keys (besides `op`, `request` and `said`). */
export const REQUEST_OPS = Object.freeze({
  remove_page: [['page'], []],
  rename_page: [['page', 'name'], []],
  order_pages: [['pages'], []],
  add_page: [['pageType', 'name', 'blocks'], ['after']],
  remove_block: [['page', 'block'], []],
  add_block: [['page', 'add'], ['after']],
  set_block_data: [['page', 'block', 'data'], []]
})
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isIdList = (value) => Array.isArray(value) && value.every((id) => typeof id === 'string')

/** A text as words compare: lower case, one space between words, no quotes or end punctuation around it. */
export const wordsOf = (text) =>
  String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.!?,;:]+$/gu, '')
    .trim()

/** Whether `quote` is words of the request, three characters at least. */
export const quotesRequest = (quote, request) =>
  isText(quote) && wordsOf(quote).length >= 3 && wordsOf(request).includes(wordsOf(quote))

function closed(value, required, optional, at, problem) {
  for (const key of required)
    if (!Object.hasOwn(value, key)) problem('reply_shape', `${at}.${key}`, `missing ${key}`)
  for (const key of Object.keys(value))
    if (!required.includes(key) && !optional.includes(key))
      problem('reply_shape', `${at}.${key}`, `${JSON.stringify(key)} is not a key here`)
}

function blockShape(block, at, problem) {
  if (!isObject(block)) return problem('reply_shape', at, 'a block is {block, label, data, reason}')
  closed(block, BLOCK, ['targets'], at, problem)
  for (const key of ['block', 'label', 'reason'])
    if (typeof block[key] !== 'string') problem('reply_shape', `${at}.${key}`, `${key} must be a text`)
  if (!isIdList(block.data)) problem('reply_shape', `${at}.data`, 'data must be a list of ids')
  if (block.targets !== undefined && !isIdList(block.targets))
    problem('reply_shape', `${at}.targets`, 'targets must be a list of field names')
}

function changeShape(change, at, request, problem) {
  if (!isObject(change)) return problem('reply_shape', at, 'a change is an object with its op')
  const shape = REQUEST_OPS[change.op]
  if (!shape) return problem('reply_shape', `${at}.op`, `op is one of ${Object.keys(REQUEST_OPS).join(', ')}`)
  closed(change, ['op', 'request', 'said', ...shape[0]], shape[1], at, problem)
  for (const key of ['page', 'block', 'name', 'pageType', 'after', 'said'])
    if (change[key] !== undefined && !isText(change[key]))
      problem('reply_shape', `${at}.${key}`, `${key} must be a non-empty text`)
  if (change.pages !== undefined && !isIdList(change.pages))
    problem('reply_shape', `${at}.pages`, 'pages must be a list of page ids')
  if (change.data !== undefined && !isIdList(change.data))
    problem('reply_shape', `${at}.data`, 'data must be a list of ids')
  if (change.add !== undefined) blockShape(change.add, `${at}.add`, problem)
  if (change.blocks !== undefined) {
    if (!Array.isArray(change.blocks) || change.blocks.length === 0)
      problem('reply_shape', `${at}.blocks`, 'a new page lists its blocks, at least one')
    else change.blocks.forEach((b, i) => blockShape(b, `${at}.blocks[${i}]`, problem))
  }
  if (!quotesRequest(change.request, request))
    problem(
      'change_unlinked',
      `${at}.request`,
      'quote the words of the customer request that ask for this change, exactly as typed; make no change the request does not ask for'
    )
}

/**
 * Report every shape problem of the model's answer through `problem(code, at, message)`.
 * @returns {boolean} true when the answer has its shape and its changes may be applied
 */
export function requestReplyProblems(reply, request, problem) {
  let count = 0
  const counted = (code, at, message) => {
    count += 1
    problem(code, at, message)
  }
  if (!isObject(reply)) {
    counted('reply_unreadable', '', 'the reply is not a JSON object')
    return false
  }
  closed(reply, [], ['changes', 'notDone'], '', (code, at, message) =>
    counted(code, at.replace(/^\./, ''), message)
  )
  const changes = reply.changes ?? []
  const notDone = reply.notDone ?? []
  if (!Array.isArray(changes)) counted('reply_shape', 'changes', 'changes must be a list')
  else changes.forEach((change, i) => changeShape(change, `changes[${i}]`, request, counted))
  if (!Array.isArray(notDone)) counted('reply_shape', 'notDone', 'notDone must be a list')
  else
    notDone.forEach((entry, i) => {
      const at = `notDone[${i}]`
      if (!isObject(entry))
        return counted('reply_shape', at, 'a not done entry is {what, reason, why, request}')
      closed(entry, ['what', 'reason', 'why'], ['request'], at, counted)
      for (const key of ['what', 'why'])
        if (!isText(entry[key])) counted('reply_shape', `${at}.${key}`, `${key} must be a non-empty text`)
      if (!NOT_DONE_REASONS.includes(entry.reason))
        counted('reply_shape', `${at}.reason`, `reason is one of ${NOT_DONE_REASONS.join(', ')}`)
    })
  return count === 0
}
