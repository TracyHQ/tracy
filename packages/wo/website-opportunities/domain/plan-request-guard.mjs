// The guard on every text the model writes for a change request that a customer may read (ticket #617): the page
// names, section labels and reasons a change brings, and the not done lines (`what`, `why`). The changed lines are
// written by code (`plan-request-lines.mjs`), so a model's note on a change is never shown and needs no guard. Each
// text is held to what holds the plan's own lines: no dash; no held person or held business name, nor a distinctive
// word of one (`heldWordsOf`); no invented phone, email, link, price, hours, year, count or award
// (`page-writer-data-guard.mjs`), counts and prices in number words and "most" superlatives included
// (`plan-request-claims.mjs`); and no line naming the template's look or the template itself (`brand-look-problems.mjs`,
// `namesTemplate`). A not done line says what was NOT done and why, so it may name the kind of thing asked for ("a
// claim about awards", "no source mentions an award"): a bare award word passes there, every concrete claim fails.
// A text that fails is a problem for the re-compose, never shown. The request's own words are data: whatever it asks
// the model to say passes this guard or is not said. Pure.
import { lookProblemsOf } from './brand-look-problems.mjs'
import { TEXT_LIMITS, textLength } from './build-contract-shapes.mjs'
import { numbersOf } from './copy-claims.mjs'
import { knownEntriesOf } from './page-writer-fields.mjs'
import { inventedDataOf } from './page-writer-data-guard.mjs'
import { DASHES } from './plan-gate-rules.mjs'
import { moneyOf } from './price-in.mjs'
import { heldWordsOf, namesTemplate, spokenClaimsOf } from './plan-request-claims.mjs'
import { wordsOf } from './plan-request-words.mjs'
import { heldTextsOf, namesHeld } from './plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** A finding a not done line may hold: one bare award word, the kind of claim that was not made. */
const KIND_WORD = /^(?:awards?|prizes?|certifications?|certified|winners?|medals?|reviews?)$/iu

/** The texts of the model's answer a customer may read, each with its place and its text limit. */
function modelTextsOf(reply) {
  const texts = []
  const add = (text, at, limit, notDone = false) =>
    typeof text === 'string' && texts.push({ text, at, limit, notDone })
  list(reply?.changes).forEach((change, i) => {
    const at = `changes[${i}]`
    add(change.name, `${at}.name`, 'pages[].name')
    const blocks = [...list(change.blocks), ...(change.add ? [change.add] : [])]
    blocks.forEach((b, j) => {
      add(b?.label, `${at}.blocks[${j}].label`, 'label')
      add(b?.reason, `${at}.blocks[${j}].reason`, 'reason')
    })
  })
  list(reply?.notDone).forEach((entry, i) => {
    add(entry?.what, `notDone[${i}].what`, 'what', true)
    add(entry?.why, `notDone[${i}].why`, 'reason', true)
  })
  return texts
}

/** The values of the facts and items the site may show: no withheld one. */
const shownValuesOf = (data) =>
  [...data.byId]
    .filter(([id, r]) => !data.withheld?.has(id) && !data.withheld?.has(r.itemField?.item))
    .flatMap(([, r]) =>
      r.what === 'fact' ? [r.entry?.value] : Object.values(r.source?.fields ?? {}).map((f) => f?.value)
    )
    .filter((v) => typeof v === 'string')

/**
 * Report every model text that fails the guard through `problem(code, at, message)`, code `request_text_invalid`.
 * @param {object} reply the model's answer, shape checked
 * @param {{data: object, profile: object, template: object, lookSources?: object, look: object,
 *   allowTemplateLook?: boolean}} context the composer context of the revision
 */
export function requestTextProblems(reply, context, problem) {
  const known = knownEntriesOf(context.data.byId, context.data.rowsById)
  const facts = {
    numbers: new Set(known.flatMap((e) => numbersOf(e.value))),
    prices: new Set(known.flatMap((e) => moneyOf(e.value).map((m) => String(m.amount)))),
    known: known.map((e) => e.value.toLowerCase()).join(' \n ')
  }
  const held = heldTextsOf(context.profile?.withheld)
  const heldWords = new Set(heldWordsOf(held, shownValuesOf(context.data)))
  const fail = (at, why) => problem('request_text_invalid', at, `${why}: write it again without that`)
  for (const { text, at, limit, notDone } of modelTextsOf(reply)) {
    if (textLength(text) > TEXT_LIMITS[limit]) fail(at, `at most ${TEXT_LIMITS[limit]} characters`)
    if (DASHES.test(text)) fail(at, 'no dash in customer text')
    if (namesHeld([text], held) || wordsOf(text).some((w) => heldWords.has(w)))
      fail(at, 'it names someone or something the customer keeps private')
    const invented = [...inventedDataOf(text, known), ...spokenClaimsOf(text, facts)].filter(
      (x) => !notDone || x.what !== 'award' || !KIND_WORD.test(x.text.trim())
    )
    if (invented.length > 0)
      fail(at, `it states what the business does not have (${invented.map((x) => x.text).join(', ')})`)
    if (context.allowTemplateLook) continue
    const look = lookProblemsOf({
      plan: { look: context.look, assumptions: [{ id: at, said: text }] },
      template: context.template,
      lookSources: context.lookSources
    })
    if (look.some((p) => p.code === 'template_look_said') || namesTemplate(text, context.template))
      fail(at, 'it names the template, its colour or its logo')
  }
}
