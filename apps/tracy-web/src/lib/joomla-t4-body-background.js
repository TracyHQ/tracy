/**
 * The picture a T4 template paints behind the top of its pages (JA Boxing: a boxing gym behind the heading of about forty
 * inner pages). It is ONE site setting, `body_bg_img` in the template's site profile (`etc/site/<profile>.json`), which
 * T4 compiles into the page CSS on every page; the template kit names it as the setting slot `site.body-background`
 * (`kind: template-background`) that every frame painted behind with it points at.
 *
 *   set     a picture already uploaded to the site (`media.upload`) → `template.siteSettings` `fields.body_bg_img`, so
 *           every profile a site style uses takes it
 *   clear   no picture → `body_bg_img: ""`: T4 drops the background-image rule, and the template's own background
 *           colour shows with its gradient and overlay
 *
 * 🔒 THE KEY IS NEWER THAN THE ACTION. Claude Cowork for Joomla takes `body_bg_img` from BODY_BACKGROUND_SINCE on; an
 * older plugin is refused here before any call, with a message naming that release, and a plugin whose version cannot
 * be read is tried and its `unsupported` read the same way. The undo is the plugin's: one step under the apply id.
 */
import { componentOf, versionAtLeast } from './plugin-version.js'

/** The first Claude Cowork for Joomla release whose `template.siteSettings` writes `body_bg_img`. */
export const BODY_BACKGROUND_SINCE = '0.24.78'
export const BODY_BACKGROUND_KEY = 'body_bg_img'

/** A template folder name, as the plugin takes one. */
const TEMPLATE = /^[A-Za-z0-9_-]{1,100}$/
/** A picture under `images/` (where `media.upload` puts it), plain segments, a picture's extension. */
const PICTURE = /^images\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|gif|avif)$/i

const tooOld = (/** @type {string | null} */ component) =>
  `Claude Cowork for Joomla ${BODY_BACKGROUND_SINCE} or later writes the template background (${BODY_BACKGROUND_KEY}); this site runs ${component ?? 'an older release'}`

/**
 * Set or clear the template background.
 * @param {object} input
 * @param {string} input.template - the site template's folder (the slot's `writeTo.template`)
 * @param {string | null} input.path - the uploaded picture, relative to the site root; null or empty clears it
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.read
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.write - the Apply door; a refusal
 *   throws (with `answer`) or answers `ok: false`
 * @param {string} [input.applyId]
 * @returns {Promise<{ ok: true, value: string } | { ok: false, reason: string, tooOld?: true }>}
 */
export async function writeT4BodyBackground({ template, path, read, write, applyId }) {
  const value = String(path ?? '')
    .trim()
    .replace(/^\/+/, '')
  if (!TEMPLATE.test(String(template ?? '')))
    return { ok: false, reason: 'no site template to write the background of' }
  if (value && (!PICTURE.test(value) || /(^|\/)\.{1,2}(\/|$)/.test(value)))
    return { ok: false, reason: `${value.slice(0, 120)} is not a picture under images/ on the site` }
  const component = await componentOf(read)
  if (versionAtLeast(component, BODY_BACKGROUND_SINCE) === false)
    return { ok: false, reason: tooOld(component), tooOld: true }
  try {
    const answer = await write('template.siteSettings', {
      operation: 'set',
      template,
      fields: { [BODY_BACKGROUND_KEY]: value },
      ...(applyId ? { apply_id: applyId } : {})
    })
    if (answer?.ok === false)
      throw Object.assign(new Error(answer?.message ?? answer?.error ?? 'refused'), { answer })
    return { ok: true, value }
  } catch (error) {
    const answer = /** @type {any} */ (error)?.answer
    // A plugin without the key refuses it as unsupported; so does any plugin on a template without T4, which says so.
    const unknownKey =
      answer?.error === 'bad_action' ||
      (answer?.error === 'unsupported' && !/without T4/.test(String(answer?.message ?? '')))
    if (unknownKey) return { ok: false, reason: tooOld(component), tooOld: true }
    return {
      ok: false,
      reason: `the site refused the template background (${error instanceof Error ? error.message : String(error)})`
    }
  }
}
