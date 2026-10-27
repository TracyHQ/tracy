/**
 * The Design inspiration card as the operations page presses it: which release may carry one, what
 * the server composes around what an administrator typed, and which categories a card may pick.
 *
 * 🔒 THE SERVER COMPOSES THE FILE; THE BROWSER TYPES ONLY WHAT IS THE ADMINISTRATOR'S. Three of a
 * card's fields are not an opinion — `schemaVersion` is the format, `template` is the release's own
 * (`tracy_setting.json`), and `demo` is refused outright because a card's preview is the demo of
 * the environment SERVING it. Taking those from the request body would let one press pin a card to
 * one server, name a template no release installs, or write a file of a format nothing reads — and
 * all three fail silently, on a customer's screen, long after the press.
 *
 * 🔒 THE REFUSALS ARE SENTENCES, NOT CODES. Every one of them is shown under a disabled button on
 * the sheet, so "a draft is not published" has to be readable as it stands. They live here rather
 * than in the door because the screen asks the same question before it enables the button, and two
 * spellings of "may this release be a card" is how one of them silently becomes the wrong one.
 */
import { cardIdOf, cardOf, shownOnInspiration } from './quickstart-releases.js'
import { templateIdOf } from './template-shots.js'
import { DESIGN_INSPIRATION_SCHEMA, validateDesignInspiration } from './tracy-setting.mjs'

/**
 * The categories a card may pick — the DISTINCT `category` of the OpenDesign catalogue
 * (`vendor/tracy/od-design-system/catalog.json`), which is what Design inspiration groups by.
 *
 * A copy rather than a read, because this process ships alone in its own image and that catalogue
 * is not in it (`apps/tracy-web/Dockerfile` copies `src/` and four named files). `check-templates`
 * holds this list equal to the catalogue's, so the copy cannot drift in silence.
 */
export const DESIGN_CATEGORIES = Object.freeze([
  'AI & LLM',
  'Automotive',
  'Backend & Data',
  'Bold & Expressive',
  'Creative & Artistic',
  'Design & Creative',
  'Developer Tools',
  'E-Commerce & Retail',
  'Editorial & Print',
  'Editorial / Personal / Publication',
  'Editorial · Studio',
  'Fintech & Crypto',
  'Layout & Structure',
  'Media & Consumer',
  'Modern & Minimal',
  'Morphism & Effects',
  'Productivity & SaaS',
  'Professional & Corporate',
  'Retro & Nostalgic',
  'Social & Messaging',
  'Starter',
  'Themed & Unique'
])

/** The fields of a card an administrator owns. Anything else in a request body is ignored. */
const TYPED = Object.freeze([
  'provider',
  'category',
  'blurb',
  'image',
  'nav',
  'hero',
  'dark',
  'defaultTheme',
  'languages',
  'layouts'
])

/**
 * Why this release cannot be a card on Design inspiration, or null when it can.
 *
 * The same four states the column draws its "—" from, in the order a person reads them: what the
 * release IS first, then how GitHub holds it, then whether Tracy could read it at all, then whether
 * it names the template a card is filed under.
 * @param {any} release one row of `readReleases`
 * @returns {string | null}
 */
export function cardRefusal(release) {
  if (!release) return 'No such release.'
  if (release.kind === 'design-pack')
    return 'A design pack is applied on top of a site; it is not a site somebody starts from.'
  if (release.github === 'draft') return 'A draft is not published, so nothing could install it.'
  if (!release.setting || release.tracy !== 'ready')
    return 'The release needs a tracy_setting.json that Tracy reads as Ready before it can have a listing.'
  if (typeof release.setting.template !== 'string' || release.setting.template === '')
    return 'tracy_setting.json names no template, and a card is filed under the template it builds.'
  // Said HERE rather than left to the validator: a template that cannot be an id is a reason this
  // release has no card, and the column's "—" should carry the reason like every other one.
  if (templateIdOf(release.setting.template) === null)
    return `tracy_setting.json names the template ${JSON.stringify(release.setting.template)}, which cannot be a card id. Use only letters, digits, dashes and underscores, like ja_restaurant.`
  return null
}

/**
 * The file to attach to the release, from what the administrator typed.
 *
 * `problems` is the validator's own list, so the sheet shows the same sentences the reader would
 * have shown had the file arrived from GitHub — one grammar of refusal, not two.
 * @param {any} release one row of `readReleases`
 * @param {unknown} typed the request body
 * @returns {{ card: any, problems: string[] }}
 */
export function composeCard(release, typed) {
  const from = typed && typeof typed === 'object' && !Array.isArray(typed) ? typed : {}
  /** @type {Record<string, any>} */
  const card = {
    schemaVersion: DESIGN_INSPIRATION_SCHEMA,
    // The id, not the raw field: a Joomla release names its template DIRECTORY (`ja_voyara`), and
    // a card carrying that is refused by `validateDesignInspiration`'s own slug rule — so every
    // Joomla card would have failed to publish for the same reason captures failed.
    // 🔒 A card already on the release keeps the id it is filed under (`cardIdOf`): `tracy-base/wp7`
    // says "tracy-base" in its install file while its card is the `tracy` one, and re-filing it on
    // Save would take WordPress off the card customers see and give it a second one.
    template: cardIdOf(release)
  }
  for (const field of TYPED) if (/** @type {any} */ (from)[field] !== undefined) card[field] = from[field]
  // A demo in the body is refused by name rather than dropped: a caller that sent one believes it
  // is being stored, and a card that quietly lost a field it thinks it has is the worse answer.
  if (/** @type {any} */ (from).demo !== undefined) card.demo = from.demo
  const problems = validateDesignInspiration(card)
  if (card.category !== undefined && !DESIGN_CATEGORIES.includes(card.category))
    problems.push(`category must be one of Design templates' own: ${DESIGN_CATEGORIES.join(', ')}`)
  return { card, problems }
}

/**
 * Every picture a card names, once each — the thumbnail and both shots of every layout.
 *
 * The door counts what the store holds against this list, so "2 layouts not shot yet" is one query
 * rather than a guess, and a thumbnail that names a picture nobody uploaded is caught before the
 * card reaches a customer's screen with a grey rectangle on it.
 * @param {any} card
 * @returns {string[]}
 */
export function picturesOf(card) {
  const names = new Set()
  if (typeof card?.image === 'string' && card.image !== '') names.add(card.image)
  for (const layout of Array.isArray(card?.layouts) ? card.layouts : []) {
    for (const which of ['desktop', 'mobile']) {
      const file = layout?.shots?.[which]
      if (typeof file === 'string' && file !== '') names.add(file)
    }
  }
  return [...names]
}

/**
 * What a card on Design inspiration is missing on THIS server — never a gate.
 *
 * 🔒 A WARNING DOES NOT TAKE A CARD OFF (04/10/2026). Customers are offered every card
 * `shownOnInspiration` admits, pictures or not, demo or not; the operations page says what a card
 * lacks so somebody fixes it, and it must not say "not on Design inspiration" about a card a
 * customer is looking at.
 *
 * Each warning is `{ code, params, text }`: `text` is the English sentence the operations page
 * shows, `code` + `params` say the same for a reader that words it in another language (Admin
 * attention, 04/10/2026) and must not parse the sentence. The first six codes are the ones the
 * column's old `card` state carried, in the same order.
 * A card with no live demo whose latest demo job failed says so (`demo-failed`, with the reason the
 * job died on) instead of `no-demo`: the press that fixes it is a retry, not a first install.
 * @param {any} release one row of `readReleases`
 * @param {{ demo?: { url: string, version?: string | null } | null, failed?: { reason: string | null } | null, has?: (file: string) => boolean }} [world]
 * @returns {{ code: string, params: Record<string, unknown>, text: string }[]}
 */
export function cardWarnings(release, { demo = null, failed = null, has = () => false } = {}) {
  const card = cardOf(release)
  if (!card) return []
  /** @type {{ code: string, params: Record<string, unknown>, text: string }[]} */
  const out = []
  const warn = (code, text, params = {}) => out.push({ code, params, text })
  const pictures = picturesOf(card)
  const missing = pictures.filter((file) => !has(file))
  if (missing.length > 0)
    warn(
      'pictures-missing',
      `${missing.length} of ${pictures.length} pictures are not on this server yet: ${missing.join(', ')}`,
      { missing: missing.length, total: pictures.length, files: missing }
    )
  const layoutsWithoutShots = (Array.isArray(card.layouts) ? card.layouts : []).filter(
    (l) => typeof l?.shots?.desktop !== 'string'
  ).length
  if (layoutsWithoutShots > 0)
    warn('layouts-without-shots', `${layoutsWithoutShots} layouts have no shots yet`, {
      layouts: layoutsWithoutShots
    })
  if (!demo && failed)
    warn(
      'demo-failed',
      failed.reason ? `The demo install failed: ${failed.reason}` : 'The demo install failed',
      { reason: failed.reason ?? null }
    )
  else if (!demo) warn('no-demo', 'No demo on this server to preview')
  if (typeof card.category !== 'string' || card.category === '')
    warn('no-category', 'The card names no category, so no filter finds it')
  if (typeof card.image !== 'string' || card.image === '') warn('no-thumbnail', 'The card has no thumbnail')
  if (typeof card.blurb !== 'string' || card.blurb === '') warn('no-blurb', 'The card has no blurb')
  // The preview a customer opens should be the site they would get: a demo left on an older cut
  // (dev 04/10: tracy-business/j6 released 1.2.0, demo on 1.1.0) shows another site.
  const version = release.setting?.version
  if (demo && typeof demo.version === 'string' && typeof version === 'string' && demo.version !== version)
    warn('demo-version', `The demo on this server runs ${demo.version}, not the release’s ${version}`, {
      demoVersion: demo.version,
      version
    })
  // The files a build downloads, against the assets GitHub lists for the release — read from the row
  // already in hand, no call. A local pack is read off a disk and lists no assets, so it is not asked.
  if (!release.local && release.setting?.install && typeof release.setting.install === 'object') {
    const names = new Set((release.assets ?? []).map((/** @type {any} */ a) => a?.name))
    for (const part of Object.values(release.setting.install)) {
      const file = /** @type {any} */ (part)?.file
      if (typeof file === 'string' && file !== '' && !names.has(file))
        warn('asset-missing', `The release has no asset ${file}, so a build cannot download it`, { file })
    }
  }
  const raw = release.setting?.template
  if (typeof raw === 'string' && raw !== '' && templateIdOf(raw) === null)
    warn(
      'template-not-an-id',
      `tracy_setting.json names the template ${JSON.stringify(raw)}, which cannot be a card id — its pictures cannot be stored`,
      { template: raw }
    )
  return out
}

/**
 * Why a release that carries a card does not put it on Design inspiration, or null when it does.
 *
 * In the order a person acts on it: an operator's own Unpublish first (the press that undoes it is
 * on this page), then what the release is or how GitHub holds it (`cardRefusal`'s sentences, so the
 * sheet and the list say the same words).
 * @param {any} release one row of `readReleases`
 * @returns {{ code: string, why: string } | null}
 */
function notShown(release) {
  if (!cardOf(release) || shownOnInspiration(release)) return null
  if (release.inspirationHidden) return { code: 'unpublished', why: 'Saved but hidden from Design templates' }
  const refusal = cardRefusal(release)
  if (refusal) return { code: 'refused', why: refusal }
  if (!release.choosable)
    return {
      code: 'not-choosable',
      why: 'Tracy cannot start a site from this release, so its card is not offered.'
    }
  return {
    code: 'no-template',
    why: 'The card is filed under no template, so Design templates has nowhere to show it.'
  }
}

/** `notShown`'s sentence alone — what the operations screen's Not shown tab prints. */
export function notShownWhy(release) {
  return notShown(release)?.why ?? null
}

/**
 * Where this release stands on Design inspiration — the column's four states, decided once.
 *
 * 🔒 `on` MEANS A CUSTOMER SEES IT, AND NOTHING ELSE (04/10/2026). It is `shownOnInspiration`,
 * the same predicate `GET /api/templates` answers with, so the column cannot call a card off while
 * customers are choosing it. What a shown card lacks (pictures, a demo, a blurb) is `warnings`.
 *
 * `card` is a card customers do NOT see, and `why` says why (unpublished, a draft, …). `none` is a
 * release that could carry a card and has none. `n/a` is a release that could never be a card, and
 * its `why` is `cardRefusal`'s. Where the old stricter rule and the customer's disagreed on an edge
 * (a choosable release Tracy marked anything but `ready`; a template that cannot be a picture id),
 * the customer's rule wins and the edge becomes a warning — `test/ops-inspiration.test.mjs` pins
 * each one.
 *
 * `code` + `params` say what `why` says, for a reader that words it in another language (Admin
 * attention): null and `{}` when the state needs no reason. `warnings` are sentences (the column's
 * tooltip); `issues` are the same warnings as `{ code, params }`.
 * @param {any} release one row of `readReleases`
 * @param {{ demo?: { url: string, version?: string | null } | null, failed?: { reason: string | null } | null, has?: (file: string) => boolean }} [world] this server's
 *   live demo of the release, its failed demo job when it has no live one, and which of the card's
 *   pictures this server holds.
 * @returns {{ state: 'on' | 'card' | 'none' | 'n/a', why: string | null, code: string | null,
 *   params: Record<string, unknown>, warnings: string[], issues: { code: string, params: Record<string, unknown> }[] }}
 */
export function inspirationState(release, world = {}) {
  const say = (state, why = null, code = null, found = []) => ({
    state,
    why,
    code,
    params: {},
    warnings: found.map((w) => w.text),
    issues: found.map(({ code: c, params }) => ({ code: c, params }))
  })
  if (!release) return say('n/a', cardRefusal(release), 'refused')
  if (shownOnInspiration(release)) return say('on', null, null, cardWarnings(release, world))
  const off = notShown(release)
  if (off) return say('card', off.why, off.code, cardWarnings(release, world))
  const refusal = cardRefusal(release)
  if (refusal) return say('n/a', refusal, 'refused')
  return say('none')
}
