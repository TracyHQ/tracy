// Parts of the build plan check of Contract B (ticket #590): sources, the look section, the pictures summary, the
// assumptions (with the alternatives sources disagree on) and the left out list, plus the fields a customer may change.
// `build-contract-plan.mjs` runs them; every object here is a closed shape (`build-contract-shapes.mjs`).

import { closedShapeProblems, textProblems } from './build-contract-shapes.mjs'
import {
  isName,
  isObject,
  isWhole,
  label,
  parseFieldPath,
  resolveFieldPath,
  shapeOfPath
} from './build-contract-shared.mjs'

/** At most six generated frames per site (spec #577, pictures). */
export const MAX_GENERATED_FRAMES = 6
export const SOURCE_KINDS = Object.freeze(['website', 'google', 'social', 'answer', 'assumption'])
export const LEFT_OUT_KINDS = Object.freeze(['page', 'block', 'item', 'feature'])
export const LOGO_KINDS = Object.freeze(['own', 'text'])
/** The plan fields a customer may change, as path shapes (`build-contract-shared.mjs`, `shapeOfPath`). */
export const EDITABLE_FIELDS = Object.freeze([
  'language',
  'look.template',
  'look.accent',
  'look.logo',
  'facts[].value',
  'items[].label',
  'pages[].name',
  'pages[].blocks[].data',
  'pictures.generated.frames'
])
/** The fields an assumption may list alternatives for, with the text limit their values keep. */
const ALTERNATIVE_FIELDS = Object.freeze({ 'facts[].value': 'facts[].value', 'items[].label': 'label' })
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/

export function sourcesProblems(sources, at, report) {
  if (!Array.isArray(sources) || sources.length === 0)
    return report(at, 'sources must list where the value came from, at least one')
  sources.forEach((source, i) => {
    if (!isObject(source)) return report(`${at}[${i}]`, 'a source must be an object {kind, name}')
    closedShapeProblems(source, 'source', `${at}[${i}]`, report)
    if (!SOURCE_KINDS.includes(source.kind))
      report(`${at}[${i}].kind`, `a source kind is one of ${SOURCE_KINDS.join(', ')}`)
    textProblems(
      source.name,
      `${at}[${i}].name`,
      report,
      'sources[].name',
      'a source needs a name the customer can read'
    )
  })
}

export function lookProblems(look, report) {
  if (look === undefined) return report('look', 'missing look section: {template, accent, logo}')
  if (!isObject(look)) return report('look', 'the look section must be an object {template, accent, logo}')
  closedShapeProblems(look, 'look', 'look', report)
  const t = look.template
  if (!isObject(t) || !isName(t.slug) || !isName(t.name) || !isName(t.version))
    report('look.template', 'the chosen template must be {slug, name, version}')
  else {
    closedShapeProblems(t, 'template', 'look.template', report)
    textProblems(t.name, 'look.template.name', report, 'look.template.name', 'a template needs its name')
  }
  if (typeof look.accent !== 'string' || !HEX_COLOUR.test(look.accent))
    report('look.accent', 'the brand accent colour must be a #rrggbb colour')
  const logo = look.logo
  if (!isObject(logo) || !LOGO_KINDS.includes(logo.kind))
    return report(
      'look.logo',
      'the logo must be {kind: "own", source} or {kind: "text"} (the business name set as text)'
    )
  closedShapeProblems(logo, 'logo', 'look.logo', report)
  if (logo.kind === 'own')
    textProblems(
      logo.source,
      'look.logo.source',
      report,
      'look.logo.source',
      'an own logo names where it came from'
    )
  else if (logo.source !== undefined) report('look.logo.source', 'a text logo has no source')
}

export function picturesProblems(pictures, report) {
  if (pictures === undefined) return report('pictures', 'missing pictures summary: {own, generated}')
  if (!isObject(pictures))
    return report('pictures', 'the pictures summary must be an object {own, generated}')
  closedShapeProblems(pictures, 'pictures', 'pictures', report)
  const { own, generated } = pictures
  if (!isObject(own) || !isWhole(own.frames))
    report('pictures.own', 'own must be {frames, from}: frames filled by the business own photos')
  else {
    closedShapeProblems(own, 'own pictures', 'pictures.own', report)
    if (own.frames > 0 && (!Array.isArray(own.from) || own.from.length === 0))
      report('pictures.own.from', 'own photos name the sources they came from')
    else if (own.from !== undefined && !Array.isArray(own.from))
      report('pictures.own.from', 'from is a list of source names')
    else
      (own.from ?? []).forEach((name, i) =>
        textProblems(
          name,
          `pictures.own.from[${i}]`,
          report,
          'pictures.own.from[]',
          'a source name is a short text'
        )
      )
  }
  if (!isObject(generated) || !isWhole(generated.frames))
    return report('pictures.generated', 'generated must be {frames, reason}: frames to be generated')
  closedShapeProblems(generated, 'generated pictures', 'pictures.generated', report)
  if (generated.frames > MAX_GENERATED_FRAMES)
    report(
      'pictures.generated.frames',
      `at most ${MAX_GENERATED_FRAMES} generated frames, not ${generated.frames}`
    )
  if (generated.frames > 0 || generated.reason !== undefined)
    textProblems(
      generated.reason,
      'pictures.generated.reason',
      report,
      'reason',
      'generated frames say why no own photo fits'
    )
}

/** Whether `path` names a field of `plan` the customer may change; returns a reason when it does not. */
export function editableFieldProblem(plan, path) {
  const segments = parseFieldPath(path)
  if (!segments) return `${JSON.stringify(path)} is not a field path like facts[phone].value`
  if (!EDITABLE_FIELDS.includes(shapeOfPath(segments)))
    return `${JSON.stringify(path)} is not a field the customer can change (${EDITABLE_FIELDS.join(', ')})`
  const found = resolveFieldPath(plan, segments)
  return found.found ? null : `${JSON.stringify(path)} does not resolve: ${found.reason}`
}

/** The values sources disagree on for the assumption's field; the composed plan (revision 1) holds one of them. */
function alternativesProblems(plan, assumption, at, report) {
  const segments = parseFieldPath(assumption.field)
  const limitKey = segments && ALTERNATIVE_FIELDS[shapeOfPath(segments)]
  if (!limitKey)
    return report(
      `${at}.alternatives`,
      'alternatives are listed for a facts[].value or items[].label field only'
    )
  const list = assumption.alternatives
  if (!Array.isArray(list) || list.length < 2)
    return report(`${at}.alternatives`, 'alternatives list at least two {value, sources}')
  const values = new Set()
  list.forEach((alt, i) => {
    const altAt = `${at}.alternatives[${i}]`
    if (!isObject(alt)) return report(altAt, 'an alternative must be an object {value, sources}')
    closedShapeProblems(alt, 'alternative', altAt, report)
    if (textProblems(alt.value, `${altAt}.value`, report, limitKey, 'an alternative needs its value')) {
      if (values.has(alt.value)) report(`${altAt}.value`, 'the same alternative appears twice')
      values.add(alt.value)
    }
    sourcesProblems(alt.sources, `${altAt}.sources`, report)
  })
  const current = resolveFieldPath(plan, segments)
  if (plan.revision === 1 && current.found && !values.has(current.value))
    report(
      `${at}.alternatives`,
      `the current value ${JSON.stringify(current.value)} is one of them in the plan as composed`
    )
}

export function assumptionsProblems(plan, report) {
  if (!Array.isArray(plan.assumptions))
    return report(
      'assumptions',
      'missing assumptions: the list of what was assumed where sources were silent'
    )
  const ids = new Set()
  plan.assumptions.forEach((assumption, i) => {
    const at = `assumptions[${label(assumption?.id, i)}]`
    if (!isObject(assumption)) return report(at, 'an assumption must be an object {id, field, said}')
    closedShapeProblems(assumption, 'assumption', at, report)
    if (!isName(assumption.id)) report(`${at}.id`, 'an assumption needs a non-empty id')
    else if (ids.has(assumption.id)) report(`${at}.id`, 'assumption id appears twice')
    else ids.add(assumption.id)
    textProblems(
      assumption.said,
      `${at}.said`,
      report,
      'said',
      'an assumption says what was assumed, for the customer'
    )
    const problem = editableFieldProblem(plan, assumption.field)
    if (problem) return report(`${at}.field`, `an assumption must be correctable: ${problem}`)
    if (assumption.alternatives !== undefined) alternativesProblems(plan, assumption, at, report)
  })
}

export function leftOutProblems(leftOut, report) {
  if (!Array.isArray(leftOut))
    return report('leftOut', 'missing left out list: what was dropped, with the reason')
  leftOut.forEach((entry, i) => {
    const at = `leftOut[${i}]`
    if (!isObject(entry)) return report(at, 'a left out entry must be an object {what, kind, reason}')
    closedShapeProblems(entry, 'left out entry', at, report)
    textProblems(entry.what, `${at}.what`, report, 'what', 'say what was left out')
    if (!LEFT_OUT_KINDS.includes(entry.kind))
      report(`${at}.kind`, `kind is one of ${LEFT_OUT_KINDS.join(', ')}`)
    textProblems(entry.reason, `${at}.reason`, report, 'reason', 'a left out entry needs its reason')
  })
}
