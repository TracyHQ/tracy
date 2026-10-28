// The second half of the label judge (`label-judge.mjs`): the agent that runs the release answered the audit's judge
// request in a verdicts file; this checks that file strictly and turns it into the `labelJudge` block Road to live
// reads. Strict means: every requested slot answered once, nothing else answered, only `right` or `wrong`, and a wrong
// verdict names a different role of the version 3 vocabulary. Any problem refuses the whole file, so a half-read
// answer is never written as a verdict.
import {
  ROLE_VOCABULARY_V3,
  isRole
} from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import {
  DEFAULT_JUDGE,
  JUDGE_REQUEST_VERSION,
  LABEL_JUDGE_VERSION,
  blockOf,
  cut,
  roleGroupOf
} from './label-judge.mjs'

const FILE_FIELDS = new Set(['judgedBy', 'slots'])
const SLOT_FIELDS = new Set(['key', 'verdict', 'suggestedRole', 'why'])
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const extra = (o, allowed) => Object.keys(o).filter((k) => !allowed.has(k))

/** One answer as a cached verdict, or the problem that refuses it. */
function verdictOf(answer, key, asked) {
  const why = typeof answer.why === 'string' ? cut(answer.why.trim(), 200) : ''
  if (answer.why !== undefined && typeof answer.why !== 'string')
    return { problem: `${key}: "why" must be text` }
  if (answer.verdict === 'right') {
    if (answer.suggestedRole !== undefined)
      return { problem: `${key}: a right verdict takes no suggestedRole` }
    return { verdict: { key, hash: asked.hash, verdict: 'right' } }
  }
  if (answer.verdict !== 'wrong') return { problem: `${key}: verdict must be "right" or "wrong"` }
  const suggested = answer.suggestedRole
  if (!isRole(suggested, ROLE_VOCABULARY_V3))
    return {
      problem: `${key}: suggestedRole ${JSON.stringify(suggested)} is not a ${ROLE_VOCABULARY_V3} role`
    }
  if (suggested === asked.role)
    return { problem: `${key}: suggestedRole is the current role; answer "right" instead` }
  const from = roleGroupOf(asked.role)
  const to = roleGroupOf(suggested)
  return {
    verdict: {
      key,
      hash: asked.hash,
      verdict: 'wrong',
      role: asked.role ?? null,
      suggested,
      groupWrong: from !== to && (from === 'fact' || to === 'fact'),
      why
    }
  }
}

/**
 * @param {{ request: any, verdicts: any }} input `request` = the audit's request.json, `verdicts` = the agent's file
 * @returns {{ problems: string[], block: any }} `block` null when there is any problem
 */
export function recordLabelJudge({ request, verdicts }) {
  const problems = []
  if (request?.requestVersion !== JUDGE_REQUEST_VERSION || request?.judgeVersion !== LABEL_JUDGE_VERSION)
    return {
      problems: [`the request is not a ${JUDGE_REQUEST_VERSION} request: run the audit again`],
      block: null
    }
  if (!isObject(verdicts)) return { problems: ['the verdicts file must be a JSON object'], block: null }
  for (const k of extra(verdicts, FILE_FIELDS)) problems.push(`unknown field "${k}" in the verdicts file`)
  const judgedBy = verdicts.judgedBy ?? DEFAULT_JUDGE
  if (typeof judgedBy !== 'string' || !judgedBy.trim() || judgedBy.length > 80)
    problems.push('judgedBy must be a short name (1 to 80 characters)')
  if (!Array.isArray(verdicts.slots))
    return { problems: [...problems, '"slots" must be a list'], block: null }

  const askedSlots = request.record?.slots ?? {}
  const seen = new Set()
  const held = []
  for (const [i, answer] of verdicts.slots.entries()) {
    if (!isObject(answer)) {
      problems.push(`slots[${i}] must be an object`)
      continue
    }
    const key = answer.key
    for (const k of extra(answer, SLOT_FIELDS)) problems.push(`${key ?? `slots[${i}]`}: unknown field "${k}"`)
    if (typeof key !== 'string' || !Object.hasOwn(askedSlots, key)) {
      problems.push(`${JSON.stringify(key)} was not asked in this request`)
      continue
    }
    if (seen.has(key)) {
      problems.push(`${key}: answered more than once`)
      continue
    }
    seen.add(key)
    const out = verdictOf(answer, key, askedSlots[key])
    if (out.problem) problems.push(out.problem)
    else held.push(out.verdict)
  }
  for (const key of Object.keys(askedSlots)) if (!seen.has(key)) problems.push(`${key}: not answered`)
  if (problems.length > 0) return { problems, block: null }

  const r = request.record
  const block = blockOf({
    roleVocabularyVersion: r.roleVocabularyVersion,
    applies: true,
    total: r.total,
    located: r.located,
    verdicts: [...(Array.isArray(r.cached) ? r.cached : []), ...held],
    reason: r.left,
    judgedBy: judgedBy.trim()
  })
  return { problems: [], block }
}
