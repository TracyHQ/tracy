/**
 * Joomla's email cloaking, undone on the server for the design system preview (16/10/2026).
 *
 * With the "Content - Email Cloaking" plugin on (the default), Joomla 4 and later print every address as
 * `<joomla-hidden-mail is-link="1" is-email="1" first="B64" last="B64" text="B64" base="">This email
 * address is being protected from spambots. You need JavaScript enabled to view it.</joomla-hidden-mail>`
 * (`HTMLHelper::_('email.cloak')`), and a web component (`media/system/js/joomla-hidden-mail.js`) builds
 * the link in the browser. The preview frame runs no script, so the visitor read the notice where the demo
 * shows its address (JA Directory's Contact "Mail Us" card, measured on the Joomla 6.1 stands). The same
 * family as `cloudflare-email.js`. Preview only: the site itself is not touched.
 *
 * What the component makes, made here: `is-link="1"` → `<a href="mailto:first@last">` carrying the
 * element's other attributes; otherwise a `<span>`. Its words are `text` when given (the component
 * sanitises it as HTML; here its tags are dropped and the rest escaped), else the address.
 */

const B64 = /^[A-Za-z0-9+/]*={0,2}$/
/** An address part a mailto may carry as it is: printable, no quote, angle bracket, backslash or space. */
const SAFE = /^[^\s"'<>\\]+$/
const printable = (/** @type {string} */ s) => SAFE.test(s) && [...s].every((c) => c.charCodeAt(0) >= 32)

/** One base64 attribute as UTF-8 text, or null when it is not one. */
const b64 = (/** @type {string | null} */ v) => {
  if (typeof v !== 'string' || !B64.test(v) || v.length % 4 !== 0) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(v, 'base64'))
  } catch {
    return null
  }
}

/** @param {string} text */
const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ATTR = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
/** The component's own attributes, which the link does not carry. */
const OWN = new Set(['is-link', 'is-email', 'first', 'last', 'text', 'base'])

/**
 * The page with every cloaked address put back as the web component would show it. A cloak that does
 * not decode to a plain address is left as it was. PURE.
 * @param {string} html
 * @returns {string}
 */
export function decodeJoomlaEmails(html) {
  if (typeof html !== 'string' || !html.includes('<joomla-hidden-mail')) return html
  return html.replace(/<joomla-hidden-mail\b([^>]*)>[\s\S]*?<\/joomla-hidden-mail\s*>/gi, (m, attrs) => {
    /** @type {Map<string, string>} */
    const a = new Map()
    for (const [, name, d, s, bare] of attrs.matchAll(ATTR)) a.set(name.toLowerCase(), d ?? s ?? bare ?? '')
    const first = b64(a.get('first') ?? null)
    const last = b64(a.get('last') ?? null)
    if (!first || !last || !printable(first) || !printable(last)) return m
    const address = `${first}@${last}`
    const given = a.get('text') ? b64(a.get('text') ?? null) : ''
    if (given === null) return m
    const words = escapeHtml((given ? given.replace(/<[^>]*>/g, '') : address).trim() || address)
    if (a.get('is-link') !== '1') return `<span>${words}</span>`
    const kept = [...a]
      .filter(([n]) => !OWN.has(n) && /^[a-z][a-z0-9:_.-]*$/.test(n) && !n.startsWith('on'))
      .map(([n, v]) => ` ${n}="${escapeHtml(v)}"`)
      .join('')
    return `<a${kept} href="mailto:${escapeHtml(address)}">${words}</a>`
  })
}
