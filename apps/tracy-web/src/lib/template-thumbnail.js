/**
 * The picture of the template a site was built from: the card thumbnail /ops Templates Management draws for that
 * release (`ops/quickstarts.js` `cardImageOf`), so the Design system tab's "Template default" card shows the same
 * image instead of a grey box naming the template.
 *
 * One rule for the address, the public door's (`withPictureUrls`): a picture this server does not hold is null,
 * never a bare file name, and a held one carries its digest so a re-shot picture is not served from cache.
 */
import { cardIdOf, cardOf, readReleases } from './quickstart-releases.js'
import { shotFilesFor, withPictureUrls } from './template-shots.js'

/**
 * The card id and thumbnail file of the release tagged `tag`; a release with no card picture of its own borrows
 * the picture of another release filed under the same card (the same template on a newer or older cut).
 * PURE.
 * @param {any[]} releases from `readReleases`
 * @param {string | null | undefined} tag the site's `quickstart_tag`
 * @returns {{ id: string, image: string } | null}
 */
export function templateCardImageOf(releases, tag) {
  if (typeof tag !== 'string' || tag === '') return null
  const own = releases.find((r) => r.tag === tag)
  if (!own) return null
  const id = cardIdOf(own)
  if (!id) return null
  const imageOf = (/** @type {any} */ r) => {
    const image = cardOf(r)?.image
    return typeof image === 'string' && image !== '' ? image : null
  }
  const image =
    imageOf(own) ??
    releases
      .filter((r) => cardIdOf(r) === id)
      .map(imageOf)
      .find(Boolean) ??
    null
  return image ? { id, image } : null
}

/**
 * The absolute thumbnail address of the template site `site` was built from, or null when its release carries no
 * card picture or this server holds none.
 * @param {any} pool
 * @param {{ quickstart_tag?: string | null }} site
 * @param {string} origin this server's public origin (`config.origin`)
 * @returns {Promise<string | null>}
 */
export async function templateThumbnailOf(pool, site, origin) {
  const found = templateCardImageOf(await readReleases(pool), site?.quickstart_tag)
  if (!found) return null
  const held = await shotFilesFor(pool, [found.id])
  return withPictureUrls(
    { id: found.id, card: { image: found.image } },
    {
      origin,
      has: (tid, file) => held.get(tid)?.has(file) === true,
      version: (tid, file) => held.get(tid)?.get(file)
    }
  ).card.image
}
