/** The system footer of a sent invitation, worded like JoomlArt's Sendy newsletters: why the reader
 * gets it, then the unsubscribe link on its own line. It replaces the placeholder line the renderer
 * puts in every draft (`real-render.js` FOOTER), at send time, so a draft never holds a live token.
 * A customer invitation also carries the 1x1 estimated-opens image inside this footer. Style
 * 'personal' (Setup › Email format) is one plain sentence in the letter's own voice instead. */
import { parseFragment, serialize } from 'parse5'
import { FOOTER_STYLE } from './real-render.js'
import { escapeHtml } from '../lib/html.js'

const PLACEHOLDER = 'Unsubscribe will be available when sending is enabled.'
const REASON = 'You received this email because you signed up on our website or made a purchase from us.'
const LINK_TEXT = 'UNSUBSCRIBE'
const PERSONAL_REASON = 'You are receiving this because you have a JoomlArt account.'
const PERSONAL_LINK = 'unsubscribe here'

const pixel = (openUrl) =>
  openUrl
    ? `<img src="${escapeHtml(openUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;margin:0 auto">`
    : ''

export function footerHtml({ unsubscribeUrl, openUrl = null, style = 'notice' }) {
  if (style === 'personal')
    return `<p>${escapeHtml(PERSONAL_REASON)} If you would rather not hear from me about Tracy, <a href="${escapeHtml(unsubscribeUrl)}">${escapeHtml(PERSONAL_LINK)}</a>.${pixel(openUrl)}</p>`
  return `<p style="${FOOTER_STYLE}">${escapeHtml(REASON)}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b625d;text-decoration:underline">${escapeHtml(LINK_TEXT)}</a>${pixel(openUrl)}</p>`
}

export function footerText({ unsubscribeUrl, style = 'notice' }) {
  if (style === 'personal')
    return `${PERSONAL_REASON} If you would rather not hear from me about Tracy, ${PERSONAL_LINK}: ${unsubscribeUrl}`
  return `${REASON}\n${LINK_TEXT}: ${unsubscribeUrl}`
}

/** Swap the placeholder footer for the live one; a draft without it (edited away) gets it appended. */
export function withLiveFooter({ html, text, unsubscribeUrl, openUrl = null, style = 'notice' }) {
  const tree = parseFragment(html)
  const isPlaceholder = (node) =>
    node.tagName === 'p' && node.childNodes?.length === 1 && node.childNodes[0].value === PLACEHOLDER
  const live = parseFragment(footerHtml({ unsubscribeUrl, openUrl, style })).childNodes[0]
  let replaced = false
  const walk = (node) => {
    node.childNodes = (node.childNodes ?? []).map((child) => {
      if (!replaced && isPlaceholder(child)) {
        replaced = true
        live.parentNode = node
        return live
      }
      walk(child)
      return child
    })
  }
  walk(tree)
  if (!replaced) {
    live.parentNode = tree
    tree.childNodes.push(live)
  }
  const liveText = footerText({ unsubscribeUrl, style })
  return {
    html: serialize(tree),
    text: text.includes(PLACEHOLDER) ? text.replace(PLACEHOLDER, liveText) : `${text}\n\n${liveText}`
  }
}

/** 'simple' HTML (Setup › Email format): drop document-level parts (title, style, meta, link) and
 * wrap what is left the way a mail client composes a letter. Inline styles stay. */
export function simplifyHtml(html) {
  const tree = parseFragment(html)
  const drop = new Set(['title', 'style', 'meta', 'link', 'base'])
  const walk = (node) => {
    node.childNodes = (node.childNodes ?? []).filter((child) => !drop.has(child.tagName))
    for (const child of node.childNodes) walk(child)
  }
  walk(tree)
  return `<div dir="ltr">${serialize(tree).trim()}</div>`
}

/** Estimated clicks (Setup › Email format): every web link (http or https) of the letter points at
 * `trackedUrl(n)` instead, `n` being the link's place in `targets`; the same address twice shares one
 * place. Run before the live footer goes in, so the unsubscribe link is never rewritten. Other links
 * (mailto:, tel:, #anchors) stay as written. At most 50 different addresses are tracked; any more stay
 * as written. */
export function trackLinks(html, trackedUrl) {
  const tree = parseFragment(html)
  const targets = []
  const walk = (node) => {
    if (node.tagName === 'a')
      for (const attr of node.attrs ?? []) {
        const href = attr.name === 'href' ? attr.value.trim() : ''
        if (!/^https?:\/\//i.test(href)) continue
        let n = targets.indexOf(href)
        if (n < 0 && targets.length < 50) n = targets.push(href) - 1
        if (n >= 0) attr.value = trackedUrl(n)
      }
    for (const child of node.childNodes ?? []) walk(child)
    if (node.content) walk(node.content)
  }
  walk(tree)
  return { html: serialize(tree), targets }
}
