// Closed shapes and text limits of Contract B (ticket #590): every object of every document accepts only the fields
// listed here, and a field outside the list is reported, so written copy cannot ride along under a key the check does
// not know. The tables are the single source the doc mirrors (`docs/references/build-contract.md`, sections "Closed
// shapes" and "Text limits"); a test compares the two. Lengths are counted by code point, as a customer counts them.
import { isName } from './build-contract-shared.mjs'

const shape = (required, optional = [], { plan = false } = {}) =>
  Object.freeze({ required: Object.freeze(required), optional: Object.freeze(optional), plan })

/** Object name -> its required and optional fields. `plan` marks the objects of a build plan. */
export const CONTRACT_SHAPES = Object.freeze({
  'build scenario': shape(['schema', 'name', 'plan'], ['summary', 'questions', 'answers', 'edits', 'runs']),
  'scenario run': shape([], ['events', 'outcome']),
  question: shape(['schema', 'id', 'topic', 'prompt', 'choices', 'freeText'], ['fact', 'skippable']),
  choice: shape(['id', 'label'], ['detail', 'recommended']),
  'free text': shape(['maxLength'], ['placeholder']),
  answer: shape(['schema', 'question'], ['choice', 'text', 'skipped']),
  plan: shape(
    [
      'schema',
      'id',
      'revision',
      'language',
      'facts',
      'items',
      'pages',
      'look',
      'pictures',
      'assumptions',
      'leftOut'
    ],
    ['rows'],
    { plan: true }
  ),
  fact: shape(['id', 'kind', 'label', 'value', 'sources'], [], { plan: true }),
  item: shape(['id', 'kind', 'label', 'sources'], ['count'], { plan: true }),
  source: shape(['kind', 'name'], [], { plan: true }),
  page: shape(['id', 'name', 'pageType', 'blocks'], [], { plan: true }),
  block: shape(['id', 'type', 'block', 'source', 'label', 'data', 'reason'], ['lists'], { plan: true }),
  row: shape(['id', 'label', 'sources'], [], { plan: true }),
  'child list': shape(['name', 'rows'], ['item'], { plan: true }),
  'planned row': shape([], ['data', 'page', 'lists'], { plan: true }),
  look: shape(['template', 'accent', 'logo'], [], { plan: true }),
  template: shape(['slug', 'name', 'version'], [], { plan: true }),
  logo: shape(['kind'], ['source'], { plan: true }),
  pictures: shape(['own', 'generated'], [], { plan: true }),
  'own pictures': shape(['frames'], ['from'], { plan: true }),
  'generated pictures': shape(['frames'], ['reason'], { plan: true }),
  assumption: shape(['id', 'field', 'said'], ['alternatives'], { plan: true }),
  alternative: shape(['value', 'sources'], [], { plan: true }),
  'left out entry': shape(['what', 'kind', 'reason'], [], { plan: true }),
  'plan edit': shape(['schema', 'id', 'plan', 'changes']),
  'plan reference': shape(['id', 'revision']),
  change: shape(['field', 'value']),
  'progress event': shape(['schema', 'planId', 'planRevision', 'run', 'seq', 'elapsedSeconds', 'steps']),
  outcome: shape(
    ['schema', 'planId', 'planRevision', 'run', 'result', 'elapsedSeconds', 'steps'],
    ['stopped']
  ),
  run: shape(['id', 'kind'], ['edit']),
  step: shape(['id', 'kind', 'label', 'state', 'attempt'], ['page']),
  'stop report': shape(['step', 'reason', 'teamNotified'])
})

/** Longest text, in code points, per field. A card shows a label on one line and a reason in a sentence or two. */
export const TEXT_LIMITS = Object.freeze({
  label: 80,
  'lists[].name': 64,
  'pages[].name': 40,
  'sources[].name': 80,
  what: 80,
  detail: 80,
  placeholder: 80,
  'look.template.name': 80,
  'look.logo.source': 80,
  'pictures.own.from[]': 80,
  'facts[].value': 200,
  reason: 200,
  said: 200,
  prompt: 200
})

/** The length a customer sees: code points, so one emoji counts once. */
export const textLength = (value) => [...value].length

/** C0 and C1 control characters, and DEL. */
const CONTROL_RANGES = [
  [0x00, 0x1f],
  [0x7f, 0x9f]
]
export const CONTROL_CHARACTER = {
  test: (text) =>
    [...text].some((ch) =>
      CONTROL_RANGES.some(([from, to]) => ch.codePointAt(0) >= from && ch.codePointAt(0) <= to)
    )
}

const article = (name) => (/^[aeiou]/.test(name) ? 'an' : 'a')
const fieldAt = (at, key) => (at ? `${at}.${key}` : key)

/** Report every key of `value` that the shape `name` does not list. */
export function closedShapeProblems(value, name, at, report) {
  const { required, optional, plan } = CONTRACT_SHAPES[name]
  const fields = [...required, ...optional]
  for (const key of Object.keys(value ?? {}))
    if (!fields.includes(key))
      report(
        fieldAt(at, key),
        `${JSON.stringify(key)} is not a field of ${article(name)} ${name} (fields: ${fields.join(', ')})` +
          (plan ? '; a plan carries no written copy: headings and body text are written after approval' : '')
      )
}

/**
 * A non-empty text within the limit of `limitKey`. `missing` is the message when the value is not a text.
 * Returns true when the value is a valid text.
 */
export function textProblems(value, at, report, limitKey, missing) {
  if (!isName(value)) {
    report(at, missing)
    return false
  }
  const limit = TEXT_LIMITS[limitKey]
  const length = textLength(value)
  if (length > limit) {
    report(at, `at most ${limit} characters (${limitKey}), not ${length}`)
    return false
  }
  return true
}
