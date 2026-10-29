/**
 * Quickstarts on Design inspiration: the finished sites a customer can install as seen.
 *
 * The 152 design systems are one publisher's (Tracy) and one shape's — tokens plus a fixture. A
 * quickstart is another publisher's (JoomlArt) and another shape's: a whole site, released with a
 * demo the preview frames and a picture per layout. Both are cards on the same list, told apart by
 * `provider`, and the list does not care which is which; the preview branches on `template`.
 *
 * 🔒 ONE SOURCE FOR A CARD, AND ONLY ONE (Lee, 16/09). `GET /api/templates` on the surface this
 * lane belongs to, which answers from `tracy_design_inspiration.json` on the releases it has read
 * off `joomlart-products`. There is no second copy in the image, and the reason is Publish:
 * an administrator publishes and unpublishes a card with ONE press on the operations screen, and a
 * copy travelling in the image would need a commit and an image build to follow every press — so
 * an Unpublish the image had not caught up with would keep drawing the card just taken down.
 *
 * THE ACCEPTED CONSEQUENCE, stated rather than papered over: a lane that cannot reach Tracy shows
 * NO template cards and NO design systems — only the brands in its own site folder. Whether the
 * library is offered is Tracy's switch too (`GET /api/design-systems`), and a switch that cannot be
 * read is off. That is the honest state — nobody can create a site from a card while Tracy is
 * unreachable either, because the create door is Tracy's too.
 *
 * Pictures come from Tracy too, as absolute addresses (`/api/templates/<id>/shots/<file>`); a
 * picture Tracy does not hold is null on the card (#523). `readPicture` below still answers this
 * plugin's `template/<id>/<file>` door, but the client no longer points a card at it: that door
 * reads the image's `quickstarts.json`, which the image has not carried since 16/09.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

// The mapping of what Tracy's door answers lives in `../client/templates.mjs`: the public Design
// inspiration page draws the same cards and cannot import a module that reads the filesystem.
import { PICTURE, templateRows } from '../client/templates.mjs'

/**
 * Where the catalogue is, in order of preference: beside the design catalogue in the image, then
 * the dev machine's `$DSH_HOME`.
 * @param {string | undefined} configured
 * @returns {string[]}
 */
export function quickstartCandidates(configured) {
  const out = []
  if (configured) out.push(configured)
  out.push('/opt/tracy/quickstarts.json')
  const home = process.env.DSH_HOME
  if (home) out.push(path.join(home, 'quickstarts.json'))
  return out
}

/**
 * Read the catalogue from the first candidate that exists. Null when none does — a lane with no
 * quickstart catalogue has no template cards, and that is not an error.
 * @param {string[]} candidates
 * @returns {Promise<{ catalogue: unknown, dir: string } | null>}
 */
export async function readQuickstarts(candidates) {
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      return { catalogue: JSON.parse(raw), dir: path.join(path.dirname(candidate), 'templates') }
    } catch {
      // next
    }
  }
  return null
}

/**
 * The cards Tracy serves, or null when it could not be asked.
 *
 * 🔒 NULL IS NOT AN EMPTY LIST, and the difference is worth keeping even though both now draw the
 * same thing. An empty array is an ANSWER — this deployment has published no finished sites — while
 * null means the door could not be read at all. The tab shows no template cards either way; only
 * the second one is a reason to look at the door rather than at the operations screen.
 * @param {string | null} origin the Tracy surface this lane belongs to, or null when it has none
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<any[] | null>}
 */
export async function templatesFromTracy(origin, fetchImpl = fetch) {
  if (!origin) return null
  try {
    const response = await fetchImpl(`${origin.replace(/\/+$/, '')}/api/templates`, {
      headers: { accept: 'application/json' }
    })
    if (!response.ok) return null
    return templateRows(await response.json())
  } catch {
    // A door that threw is a door that did not answer; the caller has a road back.
    return null
  }
}

/**
 * Template cards wearing the filter traits of the design system each one wears.
 *
 * `templateRows` stamps `nav: 'top-left', hero: 'split'` on every card — defaults, read as guesses.
 * A card whose sealing profile names a catalogue system (`design`, joined by tracy-web) has a
 * better answer: the traits of that very system, which the catalogue already classified. A card
 * wearing nothing, or a system this image's catalogue does not list, keeps the guesses. `dark` is
 * the card's own (the demo's), never the system's.
 * @template {{ design?: { id: string } | null, nav: string, hero: string, dark: boolean }} T
 * @param {T[]} templates rows from `templateRows`
 * @param {{ id: string, nav: string, hero: string }[]} systems rows from `slimCatalog`
 * @returns {T[]}
 */
export function wearDesignTraits(templates, systems) {
  if (templates.length === 0 || systems.length === 0) return templates
  const byId = new Map(systems.map((s) => [s.id, s]))
  return templates.map((t) => {
    const worn = t.design?.id ? byId.get(t.design.id) : undefined
    // Not `dark`: the system's verdict is about OpenDesign's own fixture under the dark override,
    // while a template's preview is its demo, which answers ?theme=dark or does not. The card says.
    return worn ? { ...t, nav: worn.nav, hero: worn.hero } : t
  })
}

/**
 * The CMSes whose build turns a brand into a look a site can wear.
 *
 * This half is a fact about BUILD CODE, not about any release, so it cannot be read off the
 * quickstart list: only the WordPress build makes a style variation from `Brand/<host>/tokens.css`
 * and has theme `tracy` wear it from uploads (ADR 0023, brand on WordPress). Joomla T4 compiles its
 * tokens when the template is built and EmDash rebuilds `/app`, so neither can wear a brand yet.
 * A CMS joins this list in the same change that teaches its build to wear a brand.
 */
export const BRAND_BUILDS = Object.freeze(['wordpress'])

/**
 * Where a brand (`brand:<host>`) can be made into a site today, read off the quickstarts Tracy
 * publishes right now.
 *
 * 🔒 A BRAND LIGHTS A CREATE BUTTON ONLY WHERE A QUICKSTART CAN WEAR IT (Lee, 29/09/2026). A brand
 * is a look, not a site: it needs a quickstart to be worn on, and that quickstart must be one whose
 * look is a catalogue style (`design.source === 'catalog'`, joined by tracy-web from the sealing
 * profile) — a theme that swaps styles, so the brand becomes one more style of it. A quickstart
 * with its own look (`source: 'quickstart'`) or none named says nothing. The platform must also be
 * one whose build can make a brand into a style ({@link BRAND_BUILDS}). Nothing published, or Tracy
 * unreachable (no template rows): an empty list, and the dialog greys every button with its reason.
 * @param {{ platforms?: unknown, design?: { source?: unknown } | null }[]} templates rows from `templateRows`
 * @returns {string[]} in {@link BRAND_BUILDS} order
 */
export function brandPlatforms(templates) {
  const worn = new Set()
  for (const t of templates) {
    if (t?.design?.source !== 'catalog' || !Array.isArray(t.platforms)) continue
    for (const p of t.platforms) if (typeof p === 'string') worn.add(p)
  }
  return BRAND_BUILDS.filter((p) => worn.has(p))
}

/**
 * Brand rows carrying the platforms {@link brandPlatforms} allows. `brandRows` stamps `[]` (it reads
 * the site folder only and cannot know what Tracy publishes); the catalog door sets the real list.
 * @template {object} B
 * @param {B[]} brands rows from `brandRows`
 * @param {Parameters<typeof brandPlatforms>[0]} templates rows from `templateRows`
 * @returns {(B & { platforms: string[] })[]}
 */
export function withBrandPlatforms(brands, templates) {
  if (brands.length === 0) return []
  const platforms = brandPlatforms(templates)
  return brands.map((b) => ({ ...b, platforms: [...platforms] }))
}

/**
 * Whether Tracy offers the design-system library on Design inspiration.
 *
 * 🔒 ANYTHING BUT A PLAIN `shown: true` IS OFF. No origin, a refusal, a throw, a body of another
 * shape — the operator's switch defaults to off, and a lane that cannot tell must hide the library
 * rather than show it: showing is the fail-open shape this repo refuses.
 * @param {string | null} origin the Tracy surface this lane belongs to, or null when it has none
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function designSystemsShownFromTracy(origin, fetchImpl = fetch) {
  if (!origin) return false
  try {
    const response = await fetchImpl(`${origin.replace(/\/+$/, '')}/api/design-systems`, {
      headers: { accept: 'application/json' }
    })
    if (!response.ok) return false
    return (await response.json())?.shown === true
  } catch {
    return false
  }
}

/**
 * A template's picture from disk, or null. The id and the file are both checked against the
 * shapes the catalogue may name — the path never comes from the request unchecked.
 * @param {string} dir the `templates/` directory beside the catalogue
 * @param {string} templateId
 * @param {string} file
 */
export async function readPicture(dir, templateId, file) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(templateId) || !PICTURE.test(file)) return null
  try {
    return await fs.readFile(path.join(dir, templateId, file))
  } catch {
    return null
  }
}

/** The media type a picture is served as, by extension. @param {string} file */
export function pictureType(file) {
  return file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
}
