/**
 * Escape a value for HTML. Shared by `mail/emails.js` and `seats/route.js` — the one escaping
 * rule two callers must not drift apart on. Five characters, in order — `&` must go first, or the
 * escape it produces gets escaped again.
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escaped markup for an email address shown on a page, fenced so Cloudflare Email Obfuscation
 * leaves it alone. With that zone setting on, Cloudflare rewrote "You are signed in as …" into
 * "[email protected]" on cowork.tracy.site (measured 04/10). The markers are what Cloudflare documents
 * for skipping a part of the page, so the address never depends on a dashboard toggle.
 * @param {string} markup the address, already escaped (it may carry its own tags, like <strong>)
 * @returns {string}
 */
export function emailOff(markup) {
  return `<!--email_off-->${markup}<!--email_on-->`
}
