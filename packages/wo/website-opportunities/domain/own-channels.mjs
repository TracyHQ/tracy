// The contact channels a business invites people to use in its own words (#1791): "DM us", "message us on Facebook",
// "WhatsApp us". Pure: no network, no clock. Each invitation keeps the sentence it was read from as its quote, so the
// channel rests on the business's own words.
//
// Measured on dev (27/10/2026): a coaching business wrote "DM us today to book your spot!" on its Instagram posts, and
// the brief offered no Instagram DM, only a WhatsApp number Tracy inferred from its phone.

import { linkKind } from './link-kinds.mjs'

/** The networks a message can be sent on, and the words that name each one. */
const NETWORKS = [
  ['whatsapp', /\bwhats\s?app\b/i],
  ['instagram', /\b(?:instagram|insta|ig)\b/i],
  ['facebook', /\b(?:facebook|fb|messenger)\b/i],
  ['tiktok', /\btik\s?tok\b/i],
  ['x', /\b(?:twitter|x\.com)\b/i]
]
/** The social pages a direct message goes to, by the network the words were read from. */
export const DM_NETWORKS = Object.freeze(new Set(['instagram', 'facebook', 'tiktok', 'x']))

// "DM us", "PM me", "inbox us", "send us a DM", "drop us a message", "DMs are open", "via DM".
const DIRECT =
  /\b(?:(?:dm|pm|inbox|direct\s+message)\s+(?:us|me)|(?:send|drop)\s+(?:us|me)\s+an?\s+(?:dm|pm|direct\s+message|message)|(?:our\s+)?dms\s+(?:are\s+)?open|(?:via|by|in\s+(?:the|our))\s+dms?)\b/i
// "message us", "write to us", "reach us", "contact us": an invitation only where it names its network.
const MESSAGE = /\b(?:message|write\s+to|reach|contact|chat\s+with|text)\s+(?:us|me)\b/i
const WHATSAPP_US = /\bwhats\s?app\s+(?:us|me)\b/i
const MAX_QUOTE = 200

/** The sentences of a text: lines, then sentence ends, each kept with its own punctuation. */
function sentencesOf(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+[.!?]*/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
}

/** The network a sentence names after its invitation ("message us on Facebook"), else null. */
function namedNetwork(sentence) {
  for (const [network, words] of NETWORKS) if (words.test(sentence)) return network
  return null
}

/**
 * The channels a text invites people to use: `instagram-dm`, `facebook-dm`, `tiktok-dm`, `x-dm` or `whatsapp`, each
 * once, with the sentence that says it. A direct message with no network named goes to the page the text was read from
 * (`readOn`); read from no social page, it names no channel.
 * @param {unknown} text the business's own words: its bio, the caption of a post it wrote
 * @param {string | null} readOn the network the text was read on (`instagram`), or null
 * @returns {{ channel: string, quote: string }[]}
 */
export function ownChannelInvitesOf(text, readOn) {
  if (typeof text !== 'string' || !text.trim()) return []
  const out = []
  const add = (channel, quote) => {
    if (!out.some((c) => c.channel === channel)) out.push({ channel, quote: quote.slice(0, MAX_QUOTE) })
  }
  for (const sentence of sentencesOf(text)) {
    const named = namedNetwork(sentence)
    if (
      WHATSAPP_US.test(sentence) ||
      (named === 'whatsapp' && (MESSAGE.test(sentence) || DIRECT.test(sentence)))
    ) {
      add('whatsapp', sentence)
      continue
    }
    if (named && DM_NETWORKS.has(named) && (DIRECT.test(sentence) || MESSAGE.test(sentence))) {
      add(`${named}-dm`, sentence)
      continue
    }
    if (!named && DIRECT.test(sentence) && DM_NETWORKS.has(readOn)) add(`${readOn}-dm`, sentence)
  }
  return out
}

const SOCIAL_KINDS = new Set(['instagram', 'facebook', 'tiktok', 'youtube'])

/**
 * The social network a link is a page of (`instagram`, `facebook`, `tiktok`, `youtube`, `x`), else null: a website
 * field that holds one of these is that social page, not a website.
 * @param {unknown} url
 */
export function socialNetworkOfUrl(url) {
  const info = typeof url === 'string' ? linkKind(url) : null
  if (!info) return null
  if (SOCIAL_KINDS.has(info.kind)) return info.kind
  const host = (() => {
    try {
      return new URL(info.url).hostname.toLowerCase().replace(/^(www|mobile)\./, '')
    } catch {
      return ''
    }
  })()
  return host === 'x.com' || host === 'twitter.com' ? 'x' : null
}

/**
 * Where a direct message to a social page goes: Instagram's and Facebook's own message links for a page with a handle
 * (`https://ig.me/m/<handle>`, `https://m.me/<handle>`), else the page itself.
 * @param {string} network @param {string} pageUrl
 */
export function directMessageUrlOf(network, pageUrl) {
  const info = linkKind(pageUrl)
  const handle = info?.handle && info.key === `${info.kind}:${info.handle.toLowerCase()}` ? info.handle : null
  if (handle && network === 'instagram') return `https://ig.me/m/${encodeURIComponent(handle)}`
  if (handle && network === 'facebook') return `https://m.me/${encodeURIComponent(handle)}`
  return pageUrl
}
