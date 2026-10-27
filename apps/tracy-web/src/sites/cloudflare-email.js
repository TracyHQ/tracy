/**
 * Cloudflare's email obfuscation, undone on the server for the design system preview.
 *
 * A demo behind Cloudflare with Email Address Obfuscation on serves every address as
 * `<a href="/cdn-cgi/l/email-protection#HEX">` and `<span class="__cf_email__" data-cfemail="HEX">`,
 * with a script (`email-decode.min.js`) that puts the address back in the browser. The preview frame
 * runs no script (`sandbox` without `allow-scripts`, `preview-stage.tsx`), so the visitor read
 * "[email&#160;protected]" where the demo says its address (measured 13/10/2026 on the Business
 * Joomla and EmDash demos). The encoding is public: the first byte is an XOR key for the rest.
 *
 * Decoding here is half of it: the answer leaves cowork.tracy.site through the SAME Cloudflare zone,
 * which obfuscated the put-back addresses again on the way out (measured 13/10/2026: two
 * `data-cfemail` spans and the decode script came back in the door's answer). Every preview answer
 * therefore carries `Cache-Control: no-transform`, the header Cloudflare documents for leaving a
 * response alone (`sendPreview`, `design-system-preview.js`).
 */

const HEX = /^[0-9a-f]+$/i

/**
 * The address behind one `HEX` value, or null when it is not one.
 * @param {string} hex
 * @returns {string | null}
 */
export function decodeCloudflareEmail(hex) {
  if (typeof hex !== 'string' || hex.length < 4 || hex.length % 2 !== 0 || !HEX.test(hex)) return null
  const key = Number.parseInt(hex.slice(0, 2), 16)
  const bytes = []
  for (let i = 2; i < hex.length; i += 2) bytes.push(Number.parseInt(hex.slice(i, i + 2), 16) ^ key)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
    return text.includes('@') ? text : null
  } catch {
    return null
  }
}

/** @param {string} text */
const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The page with every obfuscated address put back and the decoding script dropped. A value that
 * does not decode is left as it was.
 * @param {string} html
 * @returns {string}
 */
export function decodeCloudflareEmails(html) {
  if (
    typeof html !== 'string' ||
    (!html.includes('cdn-cgi/l/email-protection') &&
      !html.includes('data-cfemail') &&
      !html.includes('email-decode.min.js'))
  ) {
    return html
  }
  return (
    html
      // The protection link, on any host: `mailto:` the address.
      .replace(
        /(href=["'])(?:https?:)?(?:\/\/[^"'/]+)?\/cdn-cgi\/l\/email-protection#([0-9a-f]+)(["'])/gi,
        (m, pre, hex, post) => {
          const address = decodeCloudflareEmail(hex)
          return address === null ? m : `${pre}mailto:${escapeHtml(address)}${post}`
        }
      )
      // An element carrying `data-cfemail`, whatever its other attributes and their order (the class may come
      // after it): its content, a placeholder or a nested span, becomes the address and the attribute goes.
      .replace(
        /<(a|span)\b([^>]*\bdata-cfemail=["'][0-9a-f]+["'][^>]*)>[\s\S]*?<\/\1\s*>/gi,
        (m, tag, attrs) => {
          const hex = /\bdata-cfemail=["']([0-9a-f]+)["']/i.exec(attrs)?.[1] ?? ''
          const address = decodeCloudflareEmail(hex)
          if (address === null) return m
          const kept = attrs.replace(/\s*\bdata-cfemail=["'][0-9a-f]+["']/i, '').replace(/\s+$/, '')
          return `<${tag}${kept}>${escapeHtml(address)}</${tag}>`
        }
      )
      // The decoding script, on any host, with any attributes: nothing is left for it to do.
      .replace(/<script\b[^>]*\bsrc=["'][^"']*email-decode\.min\.js[^"']*["'][^>]*>\s*<\/script\s*>/gi, '')
  )
}
