/**
 * `?template=<id>` → the build intent the creation workspace already understands.
 *
 * joomlart.com's Download button and the JoomlArt sign-in door name a template the way JoomlArt
 * does (`ja-kinetic`, the product id on the member download page), not the way the creation
 * workspace does (`?inspiration=<card id>&platform=<cms>`). This is the one translation between
 * the two, and it answers from the same place Design inspiration does — `quickstart_releases` —
 * under the same rule (`inspirationState(...).state === 'on'`), so a template the gallery would
 * not show cannot be reached through the back door either (`tasks/todo-tai-joomlart-qua-tracy.md`
 * B5).
 */
import { inspirationState } from '../lib/design-inspiration.js'
import { readReleases } from '../lib/quickstart-releases.js'
import { shotFilesFor } from '../lib/template-shots.js'
import { ONBOARDING_MOUNT, buildIntentOf } from './scope.js'

/** The asset name of an installable quickstart on a release (`src/quickstarts/download.js`). */
const QUICKSTART_ZIP = /-quickstart-\d+\.\d+\.\d+\.zip$/

/** The paths a `?template=` may arrive on: the root and the creation workspace's own mount. */
export const TEMPLATE_DOORS = new Set(['/', '/new', '/new/'])

/** The JoomlArt id a release answers to: the card's own, else the tag's middle segment. */
function templateOf(release) {
  const card = release?.inspiration?.template
  if (typeof card === 'string' && card !== '') return card
  const m = /^quickstart\/([^/]+)\/[^/]+$/.exec(String(release?.tag ?? ''))
  return m ? m[1] : null
}

/**
 * The intent for one JoomlArt template id, or null when Tracy does not offer it.
 *
 * Several releases may answer to one id (a Joomla 6 and a WordPress 7 quickstart of the same
 * design); `offeredRelease` says which one. The result goes through `buildIntentOf`
 * so it is exactly what `/new/?inspiration=…&platform=…` accepts — a platform this door cannot
 * build is still not an intent.
 * @param {Array<any>} releases as `readReleases` returns them
 * @param {string} template
 * @returns {{inspiration: string, platform: string}|null}
 */
export function intentForTemplate(releases, template, options = {}) {
  const pick = offeredRelease(releases, template, options)
  if (!pick) return null
  return buildIntentOf(
    new URLSearchParams({ inspiration: templateOf(pick) ?? '', platform: pick.platform ?? '' })
  )
}

/**
 * The release Design inspiration shows for one JoomlArt template id, or null. The landing page
 * needs more than the intent (the card's picture and blurb, the tag the download door takes), so
 * this is the shared pick and `intentForTemplate` is its narrow view.
 * @param {Array<any>} releases as `readReleases` returns them
 * @param {string} template
 */
export function offeredRelease(releases, template, { platform = null } = {}) {
  if (typeof template !== 'string' || template === '' || !Array.isArray(releases)) return null
  const shown = releases.filter(
    (r) =>
      templateOf(r) === template &&
      inspirationState(r).state === 'on' &&
      (platform === null || r.platform === platform)
  )
  // One JoomlArt id can carry a Joomla and a WordPress quickstart (ja-kinetic: j6 and wp7). The
  // page the person came from says which (`platform=`); with nothing said, Joomla first — it is
  // the product JoomlArt's template pages sell — then the newest.
  shown.sort(
    (a, b) =>
      Number(b.platform === 'joomla') - Number(a.platform === 'joomla') ||
      String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''))
  )
  const pick = shown[0]
  if (!pick) return null
  // A release whose platform this door cannot build is not offered either — `buildIntentOf` is
  // the one judge of that, so a landing page never shows a Build button that leads nowhere.
  return intentOf(pick) ? pick : null
}

function intentOf(release) {
  return buildIntentOf(
    new URLSearchParams({ inspiration: templateOf(release) ?? '', platform: release.platform ?? '' })
  )
}

/**
 * What the landing page draws for one offered release: the intent for its Build button, the
 * download door's path for its Download button, and the card's own words and picture. The web
 * page also offers Tracy Desktop beside them, so the landing names the app's download page
 * (`config.desktopDownloadUrl`, tagged with the template for that page's own campaign count). The
 * page decides where to show it.
 * @param {any} release an `offeredRelease`
 * @param {{ desktopDownloadUrl?: string | null }} [options]
 */
export function landingOf(release, { desktopDownloadUrl = null } = {}) {
  const template = templateOf(release) ?? ''
  const m = /^quickstart\/[^/]+\/([^/]+)$/.exec(String(release.tag ?? ''))
  const cms = m ? m[1] : null
  const card = release.inspiration ?? {}
  return {
    template,
    // Which of the template's quickstarts this is, so a row left for the app names the same one
    // (`desktop_intent.platform`) rather than whatever the app would pick with nothing said.
    platform: typeof release.platform === 'string' && release.platform !== '' ? release.platform : null,
    intent: intentOf(release),
    buildHref: `${ONBOARDING_MOUNT}/?${new URLSearchParams(intentOf(release) ?? {})}`,
    // Only a release that ships an installable quickstart zip gets a Download: a WordPress
    // release carries webroot + database for the fleet and no zip (ja-kinetic/wp7, measured
    // 10/10), and a button that answers 404 is worse than none.
    downloadHref:
      cms && (release.assets ?? []).some((a) => QUICKSTART_ZIP.test(String(a?.name ?? '')))
        ? `/api/quickstarts/${encodeURIComponent(template)}/${encodeURIComponent(cms)}/quickstart.zip`
        : null,
    desktopHref: desktopDownloadUrl ? desktopHrefOf(desktopDownloadUrl, template) : null,
    name:
      typeof release.setting?.label === 'string' && release.setting.label !== ''
        ? release.setting.label
        : template,
    blurb: typeof card.blurb === 'string' ? card.blurb : '',
    picture:
      typeof card.image === 'string' && card.image !== ''
        ? `/api/templates/${encodeURIComponent(template)}/shots/${encodeURIComponent(card.image)}`
        : null
  }
}

/** The app's download page with `from=template-<id>` added to whatever query it already has. */
function desktopHrefOf(base, template) {
  const url = new URL(base)
  url.searchParams.set('from', `template-${template}`)
  return url.toString()
}

/**
 * The landing, read from the database. Throws when the catalogue cannot be read — the caller tells
 * the person to try again rather than sending them to the member area for a template Tracy may
 * well offer.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} template
 */
export async function resolveTemplate(pool, template, { desktopDownloadUrl = null, ...options } = {}) {
  const release = offeredRelease(await readReleases(pool), template, options)
  if (!release) return null
  const landing = landingOf(release, { desktopDownloadUrl })
  // The picture only when this deployment's shot store holds it: a card names its files, the
  // store is per deployment (a fresh stand holds none), and a page that asks for a picture nobody
  // uploaded draws a grey box and logs a 404 (measured 10/10 on the sso stand).
  if (landing.picture) {
    const held = await shotFilesFor(pool, [landing.template])
    const file = landing.picture.slice(landing.picture.lastIndexOf('/') + 1)
    if (!held.get(landing.template)?.has(decodeURIComponent(file))) landing.picture = null
  }
  return landing
}
