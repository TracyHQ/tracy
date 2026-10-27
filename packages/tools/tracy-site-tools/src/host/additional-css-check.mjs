/**
 * A WRITE INTO A WORDPRESS SITE'S ADDITIONAL CSS IS READ BACK ON THE PAGE (TracyHQ/tch#1710, 25/10/2026).
 *
 * 🔒 WHY. On dev `wp-tracy-ai` (theme `tracy`, a block theme) a customer asked for one CSS rule. The
 * agent saved it into Customizer › Additional CSS — the `custom_css` post — through `content.update`,
 * the receipt said "nothing to read back", and the agent told the customer it was done. The home page
 * printed none of the site's Additional CSS: on a block theme WordPress prints it only inside the
 * `global-styles` sheet, and the theme's design pages (the seeded home page is one) dequeued that
 * sheet. The rule existed only in the database. `look.set` reads its writes back; a write through the
 * content door did not.
 *
 * So after a relayed write that saves a `custom_css` post, the home page's HTML is read once (the one
 * page-read road, `page.mjs` `fetchPageHtml`) and searched for the rule written last:
 * - carried → `additionalCss: "printed"`, the answer otherwise untouched;
 * - not carried → a warning that says where it is missing and why, and a `next` that replaces the
 *   receipt's "tell the customer what changed" with: not done, write it where the page loads it, or
 *   say plainly that it will not show (the undo clause stays);
 * - the page not read → `additionalCss: "unchecked"`, and the `next` asks for the check by hand.
 * 🔒 NEVER A REFUSAL: the write landed; nothing here turns `ok: true` into `ok: false` (as `design-drift.mjs`).
 *
 * Where WordPress prints Additional CSS (7.1.3, `wp-includes/script-loader.php` `wp_enqueue_global_styles`,
 * `theme.php` `wp_custom_css_cb`): a classic theme in `<style id="wp-custom-css">` at `wp_head` 101; a block
 * theme inside `<style id="global-styles-inline-css">`, after theme.json's variables. Pure, but for `read`.
 */
import { WRITE_RECEIPT_NEXT } from './site-call.mjs'

/** The warning code of a saved rule the page does not print. */
export const ADDITIONAL_CSS_NOT_PRINTED = 'ADDITIONAL_CSS_NOT_PRINTED'

/** The page read after the write: the home page, which every site has and a site-wide rule reaches. */
const CHECK_PAGE = '/'

/** The longest the read may take; past it the answer says the page was not checked. */
export const ADDITIONAL_CSS_BUDGET_MS = 12_000

/** Where the undo of the receipt starts: kept whatever the check says. */
const UNDO_TAIL = WRITE_RECEIPT_NEXT.slice(WRITE_RECEIPT_NEXT.indexOf('Keep the apply_id'))

const NOT_DONE_NEXT =
  'Do not tell the customer it is done. Write the rule where this page loads it (page.look {path, style:{selector}} says whether a stylesheet of the page holds it), or tell them plainly it will not show.'
const UNCHECKED_NEXT =
  'The page could not be read to check it: page.look {path, style:{selector:"<the rule\'s selector>"}} says whether the page loads the rule. Say it is done only when it does.'

/**
 * The CSS a relayed write saves into a WordPress site's Additional CSS (a `custom_css` post), or null.
 * The post type comes from what this conversation read for the id (`typeOf`), or the call itself.
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {string} platform
 * @param {{ typeOf?: (id: number) => string | null }} [known]
 * @returns {string | null}
 */
export function additionalCssSent(action, params, platform, known = {}) {
  if (platform !== 'wordpress' || !params || typeof params !== 'object') return null
  if (action === 'content.batch') {
    const items = Array.isArray(params.items) ? params.items : []
    /** @type {string | null} */
    let last = null
    for (const item of items)
      if (item && typeof item === 'object')
        last = additionalCssSent('content.update', item, platform, known) ?? last
    return last
  }
  if (action !== 'content.update' || params.kind !== 'post') return null
  const fields =
    params.fields && typeof params.fields === 'object'
      ? /** @type {Record<string, unknown>} */ (params.fields)
      : {}
  if (typeof fields.post_content !== 'string') return null
  const id = Number(params.id)
  const type =
    (Number.isInteger(id) && id > 0 ? known.typeOf?.(id) : null) ??
    (typeof fields.post_type === 'string' ? fields.post_type : null)
  return type === 'custom_css' ? fields.post_content : null
}

/** CSS with comments gone and whitespace that carries no meaning taken out. @param {string} css */
const flat = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~()])\s*/g, '$1')
    .trim()

/**
 * Where a page prints Additional CSS, and whether it carries the last rule of `css`: `place` is
 * `wp-custom-css`, `global-styles` or null (neither sheet on the page); `carried` is whether a
 * `<style>` of the page holds that rule's selector followed by its block. Only `<style>` bodies count:
 * the same words in the page's text are not CSS.
 * @param {string} html
 * @param {string} css
 * @returns {{ place: 'wp-custom-css' | 'global-styles' | null, carried: boolean }}
 */
export function cssOnPage(html, css) {
  /** @type {string[]} */
  const bodies = []
  let place = /** @type {'wp-custom-css' | 'global-styles' | null} */ (null)
  for (const m of String(html).matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)) {
    const id = /\bid\s*=\s*["']?([\w-]+)/i.exec(m[1])?.[1] ?? ''
    if (id === 'wp-custom-css') place = 'wp-custom-css'
    else if (id === 'global-styles-inline-css' && place === null) place = 'global-styles'
    bodies.push(m[2])
  }
  const rules = [...flat(String(css)).matchAll(/([^{}]+)\{[^{}]*\}/g)]
  const selector = rules.at(-1)?.[1]?.trim() ?? ''
  if (selector === '') return { place, carried: false }
  const styles = flat(bodies.join('\n'))
  return { place, carried: styles.includes(`${selector}{`) }
}

/**
 * The write's answer, with what one read of the page found.
 * @param {object} input
 * @param {unknown} input.answer - the write's answer as the model would read it.
 * @param {string | null} input.css - {@link additionalCssSent} of the call.
 * @param {(path: string) => Promise<{ ok: boolean, html?: string } & Record<string, unknown>>} input.read
 * @param {number} [input.budgetMs]
 * @returns {Promise<unknown>}
 */
export async function withAdditionalCssCheck({ answer, css, read, budgetMs = ADDITIONAL_CSS_BUDGET_MS }) {
  if (css === null || !answer || typeof answer !== 'object') return answer
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (a.ok !== true) return answer
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  let got
  try {
    got = await Promise.race([
      read(CHECK_PAGE),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false }), budgetMs)
      })
    ])
  } catch {
    got = { ok: false }
  } finally {
    clearTimeout(timer)
  }
  const page = /** @type {{ ok?: unknown, html?: unknown }} */ (got ?? {})
  const had = typeof a.next === 'string' && a.next !== '' && a.next !== WRITE_RECEIPT_NEXT ? a.next : null
  const lead = (/** @type {string} */ mine) => (had !== null ? `${mine} ${had}` : `${mine} ${UNDO_TAIL}`)
  if (page.ok !== true || typeof page.html !== 'string')
    return { ...a, additionalCss: 'unchecked', next: lead(UNCHECKED_NEXT) }
  const found = cssOnPage(page.html, css)
  if (found.carried) return { ...a, additionalCss: 'printed' }
  const message =
    found.place === null
      ? `WordPress saved the Additional CSS, but ${CHECK_PAGE} prints none of the site's Additional CSS (no <style id="wp-custom-css">, no global-styles sheet): the theme leaves it out there, so the rule does not show.`
      : `WordPress saved the Additional CSS, but ${CHECK_PAGE} does not carry this rule (a cached page, or WordPress filtered it on save): it does not show there.`
  return {
    ...a,
    additionalCss: 'not printed',
    warnings: [
      ...(Array.isArray(a.warnings) ? a.warnings : []),
      { code: ADDITIONAL_CSS_NOT_PRINTED, page: CHECK_PAGE, message }
    ],
    next: lead(NOT_DONE_NEXT)
  }
}
