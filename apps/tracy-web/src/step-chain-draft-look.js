// The second look at a placed picture (#575 pictures gap audit, port 5, owner approved the extra vision pass): the step
// chain's looker (`site-pictures/looker-call.js`, prompt `site-pictures/looker-prompt.md`, ADR 0043 section 3) looks at
// every finished picture, an owner photo cut to its frame or a drawing, at the size the site shows it, with the plan's
// words for its frame, and writes its alt text in the site's language (section 3f, `alt-ask.js`).
//
// Copied as it is: the picture shown (`lookImage`), the message (`lookMessage`: the fault list, the any-real lines, the
// surface lines when text sits over the picture), the reading of the answer (`readLook`), one ask again when the answer
// cannot be read, then the fault "look unreadable" (`looker-step.js`), the alt made safe (`cleanAlt`). Changed by the
// new model only: the call is the standard build model's vision call (one model door, ADR 0047), not the looker door;
// an owner photo has no planner wish, so it is looked at as an `any-real` frame (the step chain's gallery rule: failed
// only for a visible fault, never for its scene).
import { cleanAlt, ALT_MAX } from './site-pictures/alt-ask.js'
import {
  LOOK_UNREADABLE,
  lookImage,
  lookMessage,
  lookWords,
  readLook,
  surfaceFacts
} from './site-pictures/looker-call.js'
import { picturePrompts } from './site-pictures/picture-prompts.js'

/** How many times one picture is asked when its answer cannot be read (the step chain asks once more). */
export const LOOK_TRIES = 2

/**
 * One look.
 * @param {{model: Function, bytes: Uint8Array, size: {width: number, height: number}, wish?: object | null,
 *   frame?: object, alt?: {language: string, business: string | null, limit?: number} | null}} input `wish`: the
 *   frame's words (`shows`, `mustInclude`, `avoid`, `mood`), null for an owner photo (any-real); `frame` its surface
 *   facts (`textOver`, `shownAs`, `templateOverlay`)
 * @returns {Promise<{verdict: 'pass' | 'fail' | null, faults: string[], seen: string | null, alt: string | null,
 *   calls: number, unread?: true}>} `verdict` null and `unread` when sharp cannot read the picture: nothing is asked
 */
export async function lookAt({ model, bytes, size, wish = null, frame = {}, alt = null }) {
  const words = lookWords(wish ?? { match: 'any-real' })
  const anyReal = !wish
  const surface = surfaceFacts(frame)
  let image
  try {
    image = await lookImage(bytes, size)
  } catch {
    return { verdict: null, faults: [], seen: null, alt: null, calls: 0, unread: true }
  }
  const ask = alt ? { ...alt, limit: alt.limit ?? ALT_MAX } : null
  const [text, picture] = lookMessage({ words, image, outlined: false, anyReal, surface, alt: ask })
  let calls = 0
  for (let tries = 1; tries <= LOOK_TRIES; tries++) {
    calls += 1
    let said
    try {
      said = readLook(
        await model({
          system: picturePrompts().looker,
          user: text.text,
          images: [picture.image_url.url]
        }),
        { anyReal, surface }
      )
    } catch (error) {
      said = { problem: String(error?.message ?? error) }
    }
    if (!said.problem)
      return {
        verdict: said.verdict,
        faults: said.faults,
        seen: said.seen,
        alt: ask ? cleanAlt(said.alt, ask.limit) : null,
        calls
      }
  }
  return { verdict: 'fail', faults: [LOOK_UNREADABLE], seen: null, alt: null, calls }
}
