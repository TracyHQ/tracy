// The guard on every text the model writes for a change request (ticket #617): the changed and not done lines, and the
// page names, section labels and reasons a change brings. They are held to what holds the plan's own lines: no dash,
// no held person or held business name (`plan-withheld.mjs`), no invented phone, email, link, price, hours, year,
// count or award (`page-writer-data-guard.mjs`), and no line naming the template's look (`brand-look-problems.mjs`).
// A not done line says what was NOT done, so it may name the kind of claim it refused ("a claim about awards"): only
// an invented phone, email, link or price fails it, with the other checks.
// A text that fails is a problem for the re-compose, never shown. The request's own words are data: whatever it asks
// the model to say passes this guard or is not said. Pure.
import { lookProblemsOf } from './brand-look-problems.mjs'
import { TEXT_LIMITS, textLength } from './build-contract-shapes.mjs'
import { knownEntriesOf } from './page-writer-fields.mjs'
import { inventedDataOf } from './page-writer-data-guard.mjs'
import { DASHES } from './plan-gate-rules.mjs'
import { heldTextsOf, namesHeld } from './plan-withheld.mjs'

/** The invented values a not done line may never hold. */
const CONCRETE = new Set(['phone', 'email', 'url', 'price'])
const list = (value) => (Array.isArray(value) ? value : [])

/** The texts of the model's answer a customer may read, each with its place and its text limit. */
export function modelTextsOf(reply) {
  const texts = []
  const add = (text, at, limit, notDone = false) =>
    typeof text === 'string' && texts.push({ text, at, limit, notDone })
  list(reply?.changes).forEach((change, i) => {
    const at = `changes[${i}]`
    add(change.said, `${at}.said`, 'changed[]')
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

/**
 * Report every model text that fails the guard through `problem(code, at, message)`, code `request_text_invalid`.
 * @param {object} reply the model's answer, shape checked
 * @param {{data: object, profile: object, template: object, lookSources?: object, look: object,
 *   allowTemplateLook?: boolean}} context the composer context of the revision
 */
export function requestTextProblems(reply, context, problem) {
  const known = knownEntriesOf(context.data.byId, context.data.rowsById)
  const held = heldTextsOf(context.profile?.withheld)
  const fail = (at, why) => problem('request_text_invalid', at, `${why}: write it again without that`)
  for (const { text, at, limit, notDone } of modelTextsOf(reply)) {
    if (textLength(text) > TEXT_LIMITS[limit]) fail(at, `at most ${TEXT_LIMITS[limit]} characters`)
    if (DASHES.test(text)) fail(at, 'no dash in customer text')
    if (namesHeld([text], held)) fail(at, 'it names someone or something the customer keeps private')
    const invented = inventedDataOf(text, known).filter((x) => !notDone || CONCRETE.has(x.what))
    if (invented.length > 0)
      fail(at, `it states what the business does not have (${invented.map((x) => x.text).join(', ')})`)
    if (!context.allowTemplateLook) {
      const look = lookProblemsOf({
        plan: { look: context.look, assumptions: [{ id: at, said: text }] },
        template: context.template,
        lookSources: context.lookSources
      })
      if (look.some((p) => p.code === 'template_look_said'))
        fail(at, "it names the template's colour or logo")
    }
  }
}
