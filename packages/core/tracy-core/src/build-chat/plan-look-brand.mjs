/**
 * The business's look as the plan card shows it (#575, P9 of the brand audit): the logo pictures the brand step made
 * for a light and a dark ground, the site icon, and the accent with where it came from and the sentence that says so.
 * Read from the draft's `lookSources` (`GET /api/build-draft`): the plan itself names no picture (Contract B). A picture
 * is named by its draft picture id (`picture`), never by an address; this module draws nothing. Pure.
 */
import { plainTextOf as text } from './plain-text.mjs'

const PLAIN_ID = /^[A-Za-z0-9-]{1,64}$/
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** A kept picture reference: `{picture, mime?}`, or null when there is none or it is not a plain draft picture id. */
function pictureOf(value) {
  if (!isPlainObject(value) || typeof value.picture !== 'string' || !PLAIN_ID.test(value.picture)) return null
  return { picture: value.picture, ...(typeof value.mime === 'string' ? { mime: value.mime } : {}) }
}

/**
 * @param {any} plan the plan the card reads (its accent assumption)
 * @param {any} lookSources the draft's `lookSources`
 */
export function lookBrandOf(plan, lookSources) {
  const pictures = isPlainObject(lookSources?.pictures) ? lookSources.pictures : {}
  const accent = isPlainObject(lookSources?.accent) ? lookSources.accent : {}
  const logo = isPlainObject(lookSources?.logo) ? lookSources.logo : {}
  const said = (Array.isArray(plan?.assumptions) ? plan.assumptions : []).find(
    (a) => a?.field === 'look.accent'
  )
  return {
    logo: {
      light: pictureOf(pictures.logoLight),
      dark: pictureOf(pictures.logoDark),
      from: typeof logo.from === 'string' ? logo.from : null,
      name: typeof logo.name === 'string' ? text(logo.name) : null
    },
    favicon: pictureOf(pictures.favicon),
    accent: {
      from: typeof accent.from === 'string' ? accent.from : null,
      name: typeof accent.name === 'string' ? text(accent.name) : null,
      said: typeof said?.said === 'string' ? text(said.said) : null,
      ...(typeof said?.code === 'string' && said.code !== ''
        ? { code: said.code, params: isPlainObject(said.params) ? said.params : {} }
        : {})
    }
  }
}
