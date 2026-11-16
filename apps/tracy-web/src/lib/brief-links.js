// The off-site links a research brief gives the business's site: its WhatsApp and its own social profiles. The build
// places them (opportunities-build/brand-on-site.js) and both demo checks let a button lead there (tracy-host
// `cta-real`: the finished build's demo QA, opportunities-build/demo-qa.js, and the write step's site check,
// site-check/host-pages.js), so one reading serves all three.
import { whatsappLinkOf } from 'website-opportunities/domain/business-phones.mjs'

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

/** The networks `brief.business.socials` keeps a profile of (`public-demo-profile.js`). */
const SOCIAL_NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x']

/**
 * The business's own social profile addresses the brief gives (`brief.business.socials`, network -> URL), https or http
 * only, each once. The site's demo may send a visitor there from a button (tracy-host `cta-real`, ADR 0037 amended
 * 16/11/2026), as it may to the brief's WhatsApp.
 * @param {any} brief
 * @returns {string[]}
 */
export function siteSocialLinksOf(brief) {
  const socials = brief?.business?.socials
  if (!socials || typeof socials !== 'object') return []
  const out = []
  for (const network of SOCIAL_NETWORKS) {
    const href = typeof socials[network] === 'string' ? socials[network].trim() : ''
    if (/^https?:\/\/[^\s]+$/i.test(href) && href.length <= 300 && !out.includes(href)) out.push(href)
  }
  return out
}
