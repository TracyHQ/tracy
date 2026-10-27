/**
 * What a demo site takes from the business's brand and contact beyond words and photos (#1780 items 15 to 17, Akemi
 * 26/10/2026): ONE accent colour from its logo, a WhatsApp button beside Call, and one line naming the areas it serves.
 * PURE: brief in, the build's steps and the values the QA gate allows out.
 *
 * 🔒 ONE ACCENT, NOTHING ELSE OF THE LOOK (ADR 0023, amended 26/10/2026). The accent goes on the template's standard
 * accent role variables (`--ds-c-accent`, its hover, pressed and on-accent text; `@tracy/ds-slot` `role-variables.mjs`):
 * a template that reads them (`var(--ds-c-accent, <its own>)`) paints its buttons, rules and accent fills with it, and
 * one that does not stays exactly as it was. Every other colour, the fonts and the layout stay the template's. The text
 * on the accent is white or black, whichever reads better, and always at least 4.5:1 (WCAG AA).
 *
 * 🔒 LINKS TAKE THE ACCENT ONLY WHERE IT READS (option A, 27/10/2026). Links are the readable accent as text
 * (`--ds-c-accent-text` and its hover). They take the logo accent only when it reaches 4.5:1 (WCAG AA, normal text)
 * against EVERY page ground the template paints (light and dark, `ds-slot.js` `pageGroundsOf`); otherwise, or with
 * no ground known, the template keeps its own link colour. One rule for every template.
 *
 * 🔒 THE WHATSAPP BUTTON MAY REST ON AN INFERENCE (ADR 0037, amended 26/10/2026): a UAE mobile number with no source
 * saying WhatsApp is still shown as a button; the brief and profile keep it `verified: false`. A number without
 * WhatsApp gives a broken button: the risk Akemi accepted.
 */
import { whatsappLinkOf } from 'website-opportunities/domain/business-phones.mjs'

/** The accent role variables the site's accent sets, in the order the rule declares them. */
export const ACCENT_TOKENS = Object.freeze([
  '--ds-c-accent',
  '--ds-c-accent-hover',
  '--ds-c-accent-active',
  '--ds-c-accent-on'
])

/** The link role variables, set only when the accent reads on every page ground (`siteAccentOf`). */
export const ACCENT_LINK_TOKENS = Object.freeze(['--ds-c-accent-text', '--ds-c-accent-text-hover'])

/** WCAG AA for normal text. */
const AA = 4.5
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#abc` and `#AABBCC` as `#aabbcc`; anything else null. */
function hexOf(value) {
  const m = HEX.exec(String(value ?? '').trim())
  if (!m) return null
  const h = m[1].toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

const channels = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** `hex` moved `share` of the way to `toward` (sRGB), as `#rrggbb`. */
function mix(hex, toward, share) {
  const [a, b] = [channels(hex), channels(toward)]
  return `#${a
    .map((c, i) =>
      Math.round(c + (b[i] - c) * share)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/**
 * The site's accent from the brief's logo accent (`brief.brand.accent`, agent D's contract: `{hex, source: 'logo',
 * share}`), or null when the logo gave none. `grounds`: the page grounds the template paints (`#rrggbb`, light and
 * dark); `links` is whether the accent reads on all of them at AA and so paints the links too.
 * @param {any} brief
 * @param {{grounds?: string[]}} [page]
 * @returns {null | {hex: string, on: string, contrast: number, links: boolean, tokens: Record<string, string>, css: string}}
 */
export function siteAccentOf(brief, { grounds = [] } = {}) {
  const given = brief?.brand?.accent
  if (!given || given.source !== 'logo') return null
  const hex = hexOf(given.hex)
  if (!hex) return null
  const white = contrastRatio(hex, '#ffffff')
  const black = contrastRatio(hex, '#000000')
  const on = white >= black ? '#ffffff' : '#000000'
  const contrast = Math.max(white, black)
  // Every colour has one of the two at 4.58:1 or more; the check stays so a change of rule cannot ship less.
  if (contrast < AA) return null
  // Hover and pressed move away from the text colour: darker under white words, lighter under black ones.
  const away = on === '#ffffff' ? '#000000' : '#ffffff'
  const tokens = {
    '--ds-c-accent': hex,
    '--ds-c-accent-hover': mix(hex, away, 0.12),
    '--ds-c-accent-active': mix(hex, away, 0.22),
    '--ds-c-accent-on': on
  }
  const pages = (Array.isArray(grounds) ? grounds : []).map(hexOf).filter(Boolean)
  const readsOn = (colour) => pages.length > 0 && pages.every((g) => contrastRatio(colour, g) >= AA)
  const links = readsOn(hex)
  if (links) {
    tokens['--ds-c-accent-text'] = hex
    // Hover moves away from the page as the button does; where that would read worse, it stays the accent.
    tokens['--ds-c-accent-text-hover'] = readsOn(tokens['--ds-c-accent-hover'])
      ? tokens['--ds-c-accent-hover']
      : hex
  }
  const css = `:root{${Object.entries(tokens)
    .map(([t, v]) => `${t}:${v}`)
    .join(';')}}`
  return { hex, on, contrast: Math.round(contrast * 100) / 100, links, tokens, css }
}

/**
 * The WhatsApp button's number and link (`brief.contact.whatsapp`: schema 2 `{number, href, factId}`, schema 1
 * `{number, verified, basis}`), or null. `verified` is whether a source states it: schema 2 reads the WhatsApp fact's
 * confidence (#1791). The link is the one outreach builds (`business-phones.mjs` `whatsappLinkOf`).
 * @param {any} brief
 * @returns {null | {number: string, href: string, verified: boolean}}
 */
export function siteWhatsAppOf(brief) {
  const given = brief?.contact?.whatsapp
  const number = typeof given?.number === 'string' ? given.number.trim() : ''
  if (!/^\+?[\d\s().-]+$/.test(number) || !/^\d{8,15}$/.test(number.replace(/\D/g, ''))) return null
  const fact = given.factId ? (brief.facts ?? []).find((f) => f?.id === given.factId) : null
  const verified = fact ? fact.confidence !== 'inferred' : given.verified === true
  return { number, href: whatsappLinkOf(number), verified }
}

/**
 * The areas the business serves, in its own words, each once (`brief.business.serviceAreas`: `[{text, quote, source}]`).
 * @param {any} brief
 * @returns {string[]}
 */
export function siteServiceAreasOf(brief) {
  const areas = Array.isArray(brief?.business?.serviceAreas) ? brief.business.serviceAreas : []
  return [...new Set(areas.map((a) => (typeof a?.text === 'string' ? a.text.trim() : '')).filter(Boolean))]
}

/**
 * The build's steps for the three, one paragraph each, or '' when the brief has none of them. Said to the site's agent
 * (`agent-demo.js` `agentDemoPrompt`).
 *
 * Where each goes, checked 26/10/2026:
 * - the accent rule goes where the CMS keeps the site's own extra CSS, the place a readability fix goes (`demo-qa.js`):
 *   WordPress Additional CSS, the Joomla template's custom.css, an EmDash site's own stylesheet then `site.rebuild`;
 * - no template's content contract has a slot for a WhatsApp button or for the areas served: the slot roles
 *   (`PLACE_CONTENT_ROLES`, `slot-roles/*.json`) name one call to action and an address, and the latest `content-map.json`
 *   of Tracy Business (WordPress 1.3.8, Joomla 1.2.6) and of JA Boxing (1.0.4) holds address slots, never an area;
 *   Tracy Business on EmDash has no content map. So the WhatsApp link takes a second button the template already shows
 *   beside Call, else a link beside the phone in the contact text; the areas are one line beside the address. Where a
 *   map names demo fact blocks (`facts`, ja-restaurant on WordPress), `contactOf` gives both as lines of those blocks.
 * @param {any} brief
 * @param {{grounds?: string[]}} [page] the template's page grounds (`brand-on-site-grounds.js`)
 * @returns {string}
 */
export function brandOnSiteSteps(brief, page = {}) {
  const steps = []
  const accent = siteAccentOf(brief, page)
  if (accent)
    steps.push(
      `Brand accent (from the business's logo, ADR 0023 as amended 26/10/2026): the site takes this ONE colour on the template's accent, and nothing else of its look changes. Put this rule, exactly as written, where the CMS keeps the site's own extra CSS (WordPress: Additional CSS; Joomla: the template's custom.css; EmDash: the site's own stylesheet, then site.rebuild): ${accent.css} It sets the template's accent role variables: buttons, rules and accent fills take ${accent.hex} with ${accent.on} words on them (${accent.contrast}:1). ${accent.links ? `The links take ${accent.hex} too: it reads at 4.5:1 or more on every page ground of this template.` : "The links keep the template's own colour: the accent does not read at 4.5:1 on every page ground of this template, or no ground is known."} Add no other colour, background or font rule for it; a template that does not read these variables keeps its own look, which is right. tracy_site and tracy_design_check read these values off the page as the site's accent and do not report them as OFF_PALETTE_COLOR; any other colour is still reported.`
    )
  const whatsapp = siteWhatsAppOf(brief)
  if (whatsapp)
    steps.push(
      `WhatsApp: wherever the site shows a Call button or link (tel:), show WhatsApp beside it as the second action, never instead of Call: its words are "WhatsApp" and its link ${whatsapp.href}. Use a second button the template already has in that group; where it has none, put the link beside the phone in the contact text. Add no new section. Say nothing on the site about how the number was found.`
    )
  const areas = siteServiceAreasOf(brief)
  if (areas.length)
    steps.push(
      `Areas served: show one line, in the site's language, such as "Serving: ${areas.join('; ')}", in the contact section beside the address (in the same text, or the line under it), never in place of the address. No template's content contract has a slot for it, so it is one line in the text that is already there, no new block.`
    )
  return steps.join('\n')
}
