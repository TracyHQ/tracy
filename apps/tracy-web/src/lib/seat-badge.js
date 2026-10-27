/**
 * The seat pill — the floating badge on a customer's working copy, served at `/badge.js`.
 *
 * Ported 19/09/2026 from `tracy-infra/dashboard/src/badge/main.ts`, the last thing a customer's
 * page still fetched from a Cloudflare Worker (`https://tracy.ai/dashboard/badge.js`). It is now
 * a FUNCTION of the setting a staff member edits at `/ops/widget` (`lib/badge-setting.js`), so a
 * label or a colour changes without a deploy, and `bar/badge.js` keeps writing the tag exactly as
 * before — `data-variant`, `data-site`, `data-viewer`, `data-team-href` or `data-create-href` —
 * plus `data-home-href` for the published pill's link home.
 *
 * WHAT DID NOT COME ACROSS, and why: the Publish row (it opened the retired dashboard), Proposals
 * (dropped by `bar/badge.js`'s own design), "Open in Tracy Desk" (this app never passed the href),
 * and the error collector (`collector.ts`, which posted to `/__tracy/errors`). `bar/route.js` does
 * serve that door — reports from anyone, reads only for a live seat on the site — but nothing here
 * posts to it yet. A badge may advertise less; it may not link to a page that is not there
 * (CLAUDE.md §0.3).
 *
 * THE SEAM FOR THE NEXT DOOR. Chat is the planned addition (18/09: only for sites on Tracy's
 * own domain). `rows()` below returns an array; a Chat row is one more element there, reading a
 * `data-chat-href` attribute nobody writes yet. Nothing else in this file needs to move.
 *
 * 🔒 A STRING, NOT A MODULE, AND THE DOCUMENT IS EMBEDDED WHOLE. The script runs on a page Tracy
 * does not own: no bundling, no modules, nothing beyond `document.body`. The setting is inlined
 * as JSON with `<` and the two line separators escaped, so no label can close the tag or break a
 * line — and every label reaches the page through `textContent`, never `innerHTML`. Colours are
 * re-checked at run time against `#rrggbb`; a value that is not one falls back to the default, so
 * even a document the validator missed cannot carry a style rule onto the page.
 */
import { inlineJson } from './badge-setting.js'
import { TRACY_MARK } from './tracy-badge.js'

/** The pill titles are fixed English — they name what the copy IS, not what a team calls it. */
const TITLE = {
  managed: 'This site is managed with Tracy',
  draft: 'This is a draft — not the live site',
  copy: 'A private working copy held by Tracy — not the live site'
}

/**
 * What `/badge.js` serves while the pill is switched off (the default since 01/10/2026,
 * `lib/badge-setting.js`): a statement that does nothing. No element, no style, no cookie read and
 * no listener, so the page and the Preview frame hold nothing of Tracy's. The proxy still writes
 * the tag, so switching the pill on at `/ops/widget` reaches every site within the script's
 * five-minute cache, with no deploy and no per-request read in the proxy.
 */
export const SEAT_BADGE_OFF = '/* Tracy seat badge: off (switch it on at /ops/widget). */\n'

/**
 * @param {object} setting - a document `validateBadgeSetting('seat', …)` accepted.
 * @returns {string} the IIFE to serve as `application/javascript`, or `SEAT_BADGE_OFF`.
 */
export function seatBadgeScript(setting) {
  if (setting?.on !== true) return SEAT_BADGE_OFF
  return `(function () {
  'use strict'
  var el = document.currentScript
  if (!el || window.__tracySeatBadge) return
  window.__tracySeatBadge = true
  var S = ${inlineJson(setting)}
  var TITLE = ${inlineJson(TITLE)}
  var MARK = ${inlineJson(TRACY_MARK)}
  var d = el.dataset || {}
  var variant = d.variant || 'managed'
  if (['managed', 'draft', 'copy'].indexOf(variant) < 0) return
  var viewer = d.viewer || ''
  var teamHref = d.teamHref || ''
  var homeHref = d.homeHref || ''
  var OFF = 'tracy_badge_off'

  function hex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback
  }
  var bg = hex(S.style.bg, '#111111')
  var fg = hex(S.style.fg, '#ffffff')
  var accent = hex(S.style.accent, '#bf5b3d')
  var LEFT = S.style.position === 'left'

  function dismissed() {
    try {
      return document.cookie.split('; ').some(function (c) { return c.indexOf(OFF + '=') === 0 })
    } catch (e) { return false }
  }
  function dismiss() {
    try { document.cookie = OFF + '=1; Path=/; Max-Age=86400; SameSite=Lax' } catch (e) {}
  }

  // The working-copy menu, one row per door the tag carries and the setting keeps on. A row with
  // no href is dropped: the badge never links to a page the copy does not have. Chat goes here —
  // one more element, read off data-chat-href — when that door exists.
  function rows() {
    var out = []
    if (viewer) out.push({ who: viewer })
    else if (S.doors.signIn.on && teamHref) out.push({ label: S.doors.signIn.label, href: teamHref })
    if (S.doors.team.on && teamHref) out.push({ label: S.doors.team.label, href: teamHref })
    return out
  }

  function pillContents(node) {
    if (S.style.mark) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'mark')
      svg.setAttribute('viewBox', '0 0 800 800')
      svg.setAttribute('aria-hidden', 'true')
      svg.innerHTML = MARK
      node.appendChild(svg)
    }
    var text = document.createElement('span')
    text.textContent = S.pillLabel
    node.appendChild(text)
  }

  function render() {
    if (document.getElementById('tracy-badge')) return
    var host = document.createElement('div')
    host.id = 'tracy-badge'
    host.setAttribute('data-tracy-badge', variant)
    host.style.cssText = 'position:fixed;z-index:2147483000;bottom:16px;' + (LEFT ? 'left:16px;' : 'right:16px;')
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
    var style = document.createElement('style')
    style.textContent = [
      ':host,*{box-sizing:border-box}',
      '.wrap{position:relative;display:flex;align-items:center;gap:0;border-radius:999px;',
      'font:500 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'color:' + fg + ';background:' + bg + ';box-shadow:0 2px 12px rgba(0,0,0,.25)}',
      '.pill{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;',
      'padding:10px 6px 10px 14px;color:inherit;text-decoration:none;border-radius:999px 0 0 999px}',
      '.pill:last-child{padding-right:14px;border-radius:999px}',
      '.mark{width:16px;height:16px;flex:0 0 16px;color:' + accent + '}',
      '.off{all:unset;cursor:pointer;padding:10px 12px 10px 8px;opacity:.6;border-radius:0 999px 999px 0;font-size:13px;line-height:1}',
      '.off:hover{opacity:1}',
      '.menu{position:absolute;' + (LEFT ? 'left:0;' : 'right:0;') + 'bottom:calc(100% + 8px);min-width:200px;',
      'display:flex;flex-direction:column;background:' + bg + ';color:' + fg + ';border-radius:12px;',
      'box-shadow:0 4px 16px rgba(0,0,0,.3);padding:6px;font-weight:400}',
      '.menu[hidden]{display:none}',
      '.menu a{color:inherit;text-decoration:none;padding:8px 10px;border-radius:8px;opacity:.85}',
      '.menu a:hover{opacity:1;background:rgba(127,127,127,.18)}',
      '.menu .who{padding:8px 10px 4px;font-size:12px;opacity:.7}',
      '.menu .who b{font-weight:600;opacity:1}',
      '@media (max-width:480px){:host{right:8px;bottom:8px}}'
    ].join('')

    var wrap = document.createElement('div')
    wrap.className = 'wrap'
    wrap.setAttribute('role', 'complementary')
    wrap.setAttribute('aria-label', TITLE[variant])

    var pill
    var linkHref = variant === 'managed' && S.doors.home.on ? homeHref : ''
    if (variant === 'managed') {
      pill = document.createElement(linkHref ? 'a' : 'span')
      if (linkHref) {
        pill.setAttribute('href', linkHref)
        pill.setAttribute('target', '_blank')
        pill.setAttribute('rel', 'noopener')
      }
    } else {
      pill = document.createElement('button')
      pill.type = 'button'
      pill.setAttribute('aria-haspopup', 'true')
      pill.setAttribute('aria-expanded', 'false')
    }
    pill.className = 'pill'
    pill.title = TITLE[variant]
    pillContents(pill)
    wrap.appendChild(pill)

    if (S.doors.hide.on) {
      var off = document.createElement('button')
      off.className = 'off'
      off.type = 'button'
      off.setAttribute('aria-label', S.doors.hide.label)
      off.textContent = '\\u2715'
      off.addEventListener('click', function () {
        dismiss()
        host.remove()
      })
      wrap.appendChild(off)
    }

    if (pill.tagName === 'BUTTON') {
      var menu = document.createElement('div')
      menu.className = 'menu'
      menu.setAttribute('hidden', '')
      rows().forEach(function (row) {
        if (row.who) {
          var who = document.createElement('div')
          who.className = 'who'
          who.textContent = S.signedInAs + ' '
          var b = document.createElement('b')
          b.textContent = row.who
          who.appendChild(b)
          menu.appendChild(who)
        } else {
          var a = document.createElement('a')
          a.setAttribute('href', row.href)
          a.textContent = row.label
          menu.appendChild(a)
        }
      })
      wrap.appendChild(menu)
      pill.addEventListener('click', function () {
        var open = menu.hasAttribute('hidden')
        if (open) menu.removeAttribute('hidden')
        else menu.setAttribute('hidden', '')
        pill.setAttribute('aria-expanded', String(open))
      })
      document.addEventListener('click', function (event) {
        if (event.composedPath && event.composedPath().indexOf(host) < 0) {
          menu.setAttribute('hidden', '')
          pill.setAttribute('aria-expanded', 'false')
        }
      })
    }

    root.appendChild(style)
    root.appendChild(wrap)
    document.body.appendChild(host)
  }

  if (dismissed()) return
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render)
  else render()
})();
`
}
