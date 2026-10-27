/**
 * The three presses on a Design inspiration card, shared by the Design Inspiration tab and the template header.
 *
 *   - Save card (`PUT /api/ops/quickstart/inspiration`): writes the card; a card customers do not
 *     see yet stays hidden.
 *   - Publish (`POST /api/ops/quickstart/inspiration/publish`): shows the card already saved.
 *   - Unpublish (`DELETE /api/ops/quickstart/inspiration`): hides it again and keeps it.
 *
 * 🔒 A REQUEST THAT DROPS IS SAID, AND ONLY THE DOOR'S OWN `ok: true` IS A DONE (#800). Neither a
 * drop nor an unconfirmed 2xx can say the write did not land (each press writes a release asset
 * and then this server's row, and can fail between the two), so the sentence says to look before
 * pressing again; nothing here retries.
 */
import { tr } from '../i18n'
import {
  jsonObject,
  type Refusals,
  readAnswer,
  refusedBy,
  textField,
  textList,
  thrownText
} from './response-error'

export type CardPress = 'save' | 'publish' | 'unpublish'

/** What each door answers before it touches the release: code → the statuses it sends it with. */
const REFUSALS: Record<CardPress, Refusals> = {
  save: { UNKNOWN_QUICKSTART: [404], NOT_A_CARD: [400], INVALID_CARD: [400] },
  publish: {
    UNKNOWN_QUICKSTART: [404],
    NOT_A_CARD: [400],
    NO_CARD: [400],
    LISTING_INCOMPLETE: [400],
    NO_CONTRACT: [400],
    NOT_SHOWABLE: [400]
  },
  unpublish: { UNKNOWN_QUICKSTART: [404] }
}

/** The "look before pressing again" sentence of each press. */
const UNSURE: Record<CardPress, string> = {
  save: 'cms-demos.press.unsure.save',
  publish: 'cms-demos.press.unsure.publish',
  unpublish: 'cms-demos.press.unsure.unpublish'
}

/** The `text` of each caution Publish answered with; anything of another shape is dropped. */
function warningTexts(body: unknown): string[] {
  const list = jsonObject(body)?.warnings
  if (!Array.isArray(list)) return []
  return list.flatMap((w) => {
    const text = jsonObject(w)?.text
    return typeof text === 'string' && text !== '' ? [text] : []
  })
}

export type CardPressResult = { ok: true; warnings: string[] } | { ok: false; error: string }

/** One press on one release's card. `card` is the form, sent by Save card only. */
export async function pressCard(tag: string, press: CardPress, card?: unknown): Promise<CardPressResult> {
  const q = `?tag=${encodeURIComponent(tag)}`
  const [method, url] =
    press === 'save'
      ? ['PUT', `/api/ops/quickstart/inspiration${q}`]
      : press === 'publish'
        ? ['POST', `/api/ops/quickstart/inspiration/publish${q}`]
        : ['DELETE', `/api/ops/quickstart/inspiration${q}`]
  const unsure = tr(UNSURE[press])
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(press === 'save' ? { body: JSON.stringify(card) } : press === 'publish' ? { body: '{}' } : {})
    })
  } catch (e) {
    return { ok: false, error: tr('cms-demos.press.dropped', { error: thrownText(e), unsure }) }
  }
  const answer = await readAnswer(response)
  if (!response.ok) {
    // Only this door's own refusal says nothing was written; a status does not. `GITHUB_REFUSED`
    // is not one: it can come after one of the two writes landed.
    const sure = refusedBy(REFUSALS[press], answer, response.status)
    const told =
      textList(answer.body, 'problems')?.join(' · ') ??
      textField(answer.body, 'reason') ??
      tr('cms-demos.door.answered', { status: response.status })
    return { ok: false, error: told + (sure ? '' : ` ${unsure}`) }
  }
  if (jsonObject(answer.body)?.ok !== true)
    return {
      ok: false,
      error: tr('cms-demos.press.unconfirmed', { status: response.status, unsure })
    }
  return { ok: true, warnings: warningTexts(answer.body) }
}
