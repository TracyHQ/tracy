// The second half of the label judge (`label-judge.mjs`): the agent that runs the release answered the audit's judge
// request in a verdicts file; this checks that file strictly and turns it into the `labelJudge` block Road to live
// reads. Strict means: every requested slot answered once, nothing else answered, only `right` or `wrong`, and a wrong
// verdict names a different role of the version 3 vocabulary, and every component's crop carries one line of what the
// judge saw in it (`crops`), so a verdicts file written from the slot tables alone, without opening the images, is
// refused rather than recorded. Any problem refuses the whole file, so a half-read answer is never written as a verdict.
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

const FILE_FIELDS = new Set(['judgedBy', 'crops', 'slots'])
const CROP_FIELDS = new Set(['crop', 'seen'])
/** The shortest line that says what a crop shows; shorter is a placeholder, not a look at the image. */
const SEEN_MIN = 12
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

/** Every crop of the request named once in `crops`, each with what the judge saw in it. */
function cropProblems(request, crops) {
  if (!Array.isArray(crops))
    return [
      '"crops" must be a list: for each component crop you opened, {"crop": "<its path>", "seen": "<what it shows>"}'
    ]
  const problems = []
  const asked = new Set((request.components ?? []).map((c) => c.crop))
  const named = new Set()
  // The words said for each crop: the same words for two crops mean one was not looked at (a script wrote them).
  const saidFor = new Map()
  for (const [i, entry] of crops.entries()) {
    if (!isObject(entry)) {
      problems.push(`crops[${i}] must be an object`)
      continue
    }
    for (const k of extra(entry, CROP_FIELDS)) problems.push(`crops[${i}]: unknown field "${k}"`)
    if (typeof entry.crop !== 'string' || !asked.has(entry.crop)) {
      problems.push(`crops[${i}]: ${JSON.stringify(entry.crop)} is not a crop of this request`)
      continue
    }
    if (named.has(entry.crop)) problems.push(`${entry.crop}: named more than once in "crops"`)
    named.add(entry.crop)
    if (typeof entry.seen !== 'string' || entry.seen.trim().length < SEEN_MIN)
      problems.push(`${entry.crop}: "seen" must say in a few words what the crop shows (open the image)`)
    else {
      const said = entry.seen.replace(/\s+/g, ' ').trim().toLowerCase()
      const other = saidFor.get(said)
      if (other && other !== entry.crop)
        problems.push(`${entry.crop}: "seen" repeats the words given for ${other}: say what this crop shows`)
      else saidFor.set(said, entry.crop)
    }
  }
  for (const crop of asked) if (!named.has(crop)) problems.push(`${crop}: not opened (no "crops" entry)`)
  return problems
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

  problems.push(...cropProblems(request, verdicts.crops))
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

/** The shortest reason that can overrule a recorded verdict; shorter is a placeholder, not a decision. */
const REASON_MIN = 12
const OVERRULE_FIELDS = new Set(['key', 'why'])

/**
 * Overrule recorded verdicts that the audit keeps as its cache and `recordLabelJudge` cannot reach (they were not asked
 * in the request it is given). Each overrule names a recorded "wrong" verdict and a reason of at least 12 characters;
 * the verdict becomes "right" with the old suggestion and the reason kept in `overruled`, and the counts are rebuilt.
 * The slot hash is kept, so the cache still holds it until the slot content changes.
 * @param {{ block: any, overrules: any }} input `block` = the `labelJudge` block of a coverage file, `overrules` = [{ key, why }]
 * @returns {{ problems: string[], block: any }} `block` null when there is any problem
 */
export function overruleLabelJudge({ block, overrules }) {
  if (!isObject(block) || !Array.isArray(block.slots))
    return { problems: ['the coverage file has no labelJudge block to overrule'], block: null }
  if (!Array.isArray(overrules) || overrules.length === 0)
    return { problems: ['"overrules" must be a non-empty list of {"key", "why"}'], block: null }
  const problems = []
  const byKey = new Map(block.slots.map((v) => [v.key, v]))
  const named = new Set()
  for (const [i, o] of overrules.entries()) {
    if (!isObject(o)) {
      problems.push(`overrules[${i}] must be an object`)
      continue
    }
    for (const k of extra(o, OVERRULE_FIELDS)) problems.push(`overrules[${i}]: unknown field "${k}"`)
    const held = byKey.get(o.key)
    if (!held) problems.push(`${JSON.stringify(o.key)} has no recorded verdict`)
    else if (held.verdict !== 'wrong') problems.push(`${o.key}: the recorded verdict is not "wrong"`)
    if (named.has(o.key)) problems.push(`${o.key}: overruled more than once`)
    named.add(o.key)
    if (typeof o.why !== 'string' || o.why.trim().length < REASON_MIN)
      problems.push(`${o.key}: "why" must give a reason of at least ${REASON_MIN} characters`)
  }
  if (problems.length > 0) return { problems, block: null }
  const why = new Map(overrules.map((o) => [o.key, cut(o.why.trim(), 200)]))
  const verdicts = block.slots.map((v) =>
    why.has(v.key)
      ? {
          key: v.key,
          hash: v.hash,
          verdict: 'right',
          overruled: { role: v.role ?? null, suggested: v.suggested ?? null, why: why.get(v.key) }
        }
      : v
  )
  return {
    problems: [],
    block: blockOf({
      roleVocabularyVersion: block.roleVocabularyVersion,
      applies: block.applies,
      total: block.counts?.slots ?? 0,
      located: block.counts?.located ?? verdicts.length,
      verdicts,
      reason: block.reason,
      judgedBy: block.judgedBy
    })
  }
}
