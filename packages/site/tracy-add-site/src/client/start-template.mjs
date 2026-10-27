/**
 * The template a site made in the Add site wizard starts from (tasks/plan-add-site-bat-dau-tu-tracy-business.md).
 *
 * The wizard asks no design question of its own: a new site starts from a ready-made template
 * instead of a blank CMS. The server resolves the release (`templateRelease`,
 * apps/tracy-web/src/sites/route.js); this file only decides whether to NAME the template, from the
 * same card list Design inspiration reads (`GET /api/templates`). A platform the card has no build
 * for is not named, and the server falls back to what it does today.
 *
 * WHICH template is now the customer's answer, not a constant. Design inspiration's gallery hands
 * one over in the address (`?design=`), and `START_TEMPLATE` is what a wizard opened with no
 * answer falls back to — the behaviour every Add site press had before the gallery could reach
 * here (Akemi, 24/09/2026: one creation flow, the gallery is a step inside it).
 *
 * Plain JavaScript so `node --test` runs it without a build step, like `site-label.mjs`.
 */

export const START_TEMPLATE = 'tracy-business'

/**
 * @param {unknown} body The JSON of `GET /api/templates`.
 * @param {string} [wanted] The template the customer chose; absent falls back to {@link START_TEMPLATE}.
 * @returns {any | null} The card to start from, or null when the list does not carry it.
 */
export function startTemplateFrom(body, wanted) {
  const list = /** @type {any} */ (body)?.templates
  if (!Array.isArray(list)) return null
  const id = wanted || START_TEMPLATE
  // A chosen template that is not in the catalogue is NOT silently swapped for the default: the
  // customer picked a look and would get another one without being told. Answering null leaves
  // the wizard with no card, so it creates the site the way it did before templates were named.
  return list.find((/** @type {any} */ t) => t?.id === id) ?? null
}

/**
 * Whether a template card can actually be built on a platform — the question the gallery has to
 * answer for every card it shows, and the wizard for the one it holds.
 *
 * Same rule as {@link designFor}, named for the reader: a card carries one entry per platform it
 * has a build for, so "no entry" means the pairing does not exist. The gallery greys those rather
 * than hiding them: seeing WordPress greyed on a card says this design is Joomla's, where a
 * filtered list says nothing at all.
 *
 * @param {any | null} card
 * @param {string} platform
 * @returns {boolean}
 */
export function buildsOn(card, platform) {
  return designFor(card, platform) !== undefined
}

/**
 * @param {any | null} card
 * @param {string} platform
 * @returns {string | undefined} The `design` to send, or undefined to send none.
 */
export function designFor(card, platform) {
  const platforms = card?.platforms
  const builds =
    Array.isArray(platforms) && platforms.some((/** @type {any} */ p) => p?.platform === platform)
  return builds ? card.id : undefined
}

/**
 * Whether the popup's Apply can write the build this card makes on this platform. The server says so per platform
 * (`apply` on the card's platform entry, `apps/tracy-web/src/lib/brief-support.js`): a build no content contract seals
 * keeps the template's own words, and asking its owner what their site should say would be a promise nobody keeps. A card
 * that says nothing (an older server, a card not read yet) is taken to allow it, so the popup is never withheld for want of
 * the field.
 * @param {any | null} card
 * @param {string | undefined} platform
 * @returns {boolean}
 */
export function appliesTo(card, platform) {
  const entry = Array.isArray(card?.platforms)
    ? card.platforms.find((/** @type {any} */ p) => p?.platform === platform)
    : undefined
  return entry?.apply !== false
}

/** @param {unknown} url */
const absolute = (url) => (typeof url === 'string' && /^https?:\/\//.test(url) ? url : null)

/**
 * What the form says about the template a new site starts from: its name always, its picture when
 * the card carries one the page can load.
 *
 * The name does not wait for a picture. A card whose shots are bare file names (a quickstart pack on
 * a local stand, a release whose images were never imported) used to make this answer null, and the
 * form then named no template at all — the customer pressed Create site without seeing which look
 * the site would get (measured 26/09 on the local stand with `ja_kinetic (local)`).
 *
 * `design` is the design system the card wears, as tracy-web joined it from the sealing profile
 * (`templateCards`): the form can then say which look the site gets. A card saying nothing is
 * null — never a guess from its name or picture.
 * @param {any | null} card
 * @returns {{ name: string, image: string | null, design: { id: string, source: string } | null } | null} What the form shows, or null with no card.
 */
export function previewOf(card) {
  if (!card) return null
  const layouts = card.card?.layouts
  const home = Array.isArray(layouts) ? layouts.find((/** @type {any} */ l) => l?.key === 'home') : null
  const image = absolute(home?.shots?.desktop) ?? absolute(card.card?.image)
  const d = card.design
  const design =
    d && typeof d === 'object' && typeof d.id === 'string' && typeof d.source === 'string'
      ? { id: d.id, source: d.source }
      : null
  return { name: typeof card.label === 'string' && card.label ? card.label : card.id, image, design }
}
