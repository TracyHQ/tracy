/**
 * The share picture of a site (TCH #1013, D5): when the customer uploaded a logo, a link to their site shared on
 * Facebook, Zalo or X previews that logo (`brand-share-card.js` makes the card), not a demo photograph.
 *
 *   WordPress     `media.upload` → option `tracy_share_image` = the new attachment (Claude Cowork for WordPress 0.18.5+
 *                 prints og:image, og:title, og:description and og:site_name from it, the title and description being
 *                 the site's own, which the Apply wrote from the answers)
 *   Joomla        `media.upload` → `template.siteSettings` `other_shareImage`, the same call on every framework (Claude
 *                 Cowork for Joomla 0.24.5+). Without T4 the plugin prints it as og:image on every page. On T4 it prints
 *                 it only where the page's head has no og:image of its own: T4 prints Open Graph only when its
 *                 `system_opengraph` is on (off on every release but JA Phio), from a menu entry's `og_*` or an
 *                 article's picture, and those pages keep theirs
 *   EmDash        the card goes with the other pictures to the template's tool (`brand-emdash.js`), which writes core
 *                 `seo.defaultOgImage`
 *
 * 🔒 A PAGE WITH A SHARE PICTURE OF ITS OWN KEEPS IT. The plugins print the card only where the page has none
 * (WordPress: no `og:image` in the head yet; EmDash: a page that passes no image of its own), so an article keeps its
 * own picture; so does a Joomla T4 page T4 gives an og:image. Joomla without T4 prints no og:image anywhere, so there
 * the card is every page's.
 * 🔒 NO LOGO, NO WRITE: the site shares what it shared before. A plugin too old for the key is skipped before anything
 * is uploaded, in its own call, so a refusal never takes another brand write down with it.
 */
import { createHash } from 'node:crypto'
import { atLeast } from './brand-joomla.js'
import { templateFolderOf, uploader } from './brand-joomla-places.js'

/** The first plugin releases that print the share picture. */
export const WORDPRESS_SHARE_SINCE = '0.18.5'
export const JOOMLA_SHARE_SINCE = '0.24.5'

/** Where the card lands in the WordPress media library, beside the other brand pictures. */
const WORDPRESS_FOLDER = 'wp-content/uploads/tracy-brand'
const TOO_OLD = 'plugin too old'
const WHY = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))

/** The plugin's own version, or null when the site does not say. */
async function componentOf(/** @type {Function} */ read) {
  const info = await read('info', {}).catch(() => null)
  return info?.ok === false ? null : (info?.info?.component ?? null)
}

/** @param {import('./brand.js').BrandWriterInput} input */
export async function writeWordpressShare({ prepared, stamp, write, read, wrote, skip }) {
  const card = prepared.share
  if (!card) return
  if (atLeast(await componentOf(read), WORDPRESS_SHARE_SINCE) === false) return skip('share', TOO_OLD)
  const sha256 = createHash('sha256').update(card).digest('hex')
  const path = `${WORDPRESS_FOLDER}/share-${sha256.slice(0, 16)}-${stamp}.png`
  let attachment
  try {
    const answer = await write('media.upload', {
      path,
      content_b64: Buffer.from(card).toString('base64'),
      sha256
    })
    attachment = Number(answer?.attachment)
  } catch (error) {
    return skip('share', `the site refused the picture (${WHY(error)})`)
  }
  if (!Number.isInteger(attachment) || attachment <= 0)
    return skip('share', 'the site did not make a new picture of it')
  try {
    await write('content.update', {
      kind: 'option',
      id: 0,
      key: 'tracy_share_image',
      fields: { value: attachment }
    })
    wrote('share')
  } catch (error) {
    skip('share', `the site refused tracy_share_image (${WHY(error)})`)
  }
}

/** @param {import('./brand.js').BrandWriterInput} input */
export async function writeJoomlaShare({ prepared, profile, stamp, write, read, wrote, skip }) {
  const card = prepared.share
  if (!card) return
  const folder = templateFolderOf(profile?.release)
  if (!profile?.framework || !folder) return skip('share', 'Tracy does not know this design yet')
  if (atLeast(await componentOf(read), JOOMLA_SHARE_SINCE) === false) return skip('share', TOO_OLD)
  const path = await uploader({ write, stamp, skip }, { share: card })('share', 'share')
  if (!path) return
  try {
    await write('template.siteSettings', {
      operation: 'set',
      template: folder,
      fields: { other_shareImage: path }
    })
    wrote('share')
  } catch (error) {
    const answer = /** @type {any} */ (error)?.answer
    const old = answer?.error === 'bad_action' || answer?.error === 'unsupported'
    skip('share', old ? TOO_OLD : `the site refused the share picture (${WHY(error)})`)
  }
}
