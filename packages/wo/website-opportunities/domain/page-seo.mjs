// The search title and description of every page a brief build keeps, and what its not-found page says (spec
// TracyHQ/tracy#189, round 9, class G and I). Pure and CMS neutral; facts of the brief and the site plan only.
//
// 🔒 EVERY KEPT PAGE HAS ITS OWN TITLE AND DESCRIPTION, AND THE SERVED PAGE SAYS EXACTLY THEM (COO, 30/10/2026). Measured on a
// brief build: the home tab read the bare name although the site plan held a search title, every page carried the same
// description written by the copy writer ("Come and find your game with us."), and the inner pages carried none.
//
//   home      the site plan's own search title and description (`place-seo.mjs`)
//   another   "<what the page is> | <name>", and a sentence of facts: who, where, what (the offerings), how to reach them
// A part that does not fit is dropped from the end, never cut mid-word; no fact the brief does not hold is written.
//
// 🔒 THE NOT-FOUND PAGE SPEAKS FOR THE BUSINESS, NEVER IN THE CMS'S WORDS ("An error has occurred while processing your
// request.", "Home Page"): it names the business and leads home and to the Contact page when one is kept.
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from './brief.mjs'
import { heroWhereOf, listed, offeringNames } from './hero-first-screen.mjs'
import { businessWords } from './trade-words.mjs'

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const capitalFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const fits = (text, max) => [...text].length <= max

/** What a page of each role is called in its title; a role not listed is named by its own address. */
const ROLE_LABELS = Object.freeze({
  about: 'About us',
  contact: 'Contact',
  team: 'Our team',
  blog: 'News',
  gallery: 'Gallery',
  pricing: 'Prices',
  faq: 'Questions',
  events: 'Events',
  offers: 'Offers',
  menu: 'Menu',
  history: 'Our story',
  careers: 'Careers',
  donations: 'Donate'
})

/** The words of a page's own address ("about-us/learning-center" gives "Learning center"). */
const wordsOfPath = (id) =>
  capitalFirst(
    String(id ?? '')
      .split('/')
      .at(-1)
      .replace(/[-_]+/g, ' ')
      .trim()
  )

/** The longest of `candidates` that fits `max`, else the last one. */
const firstFitting = (candidates, max) => candidates.find((t) => fits(t, max)) ?? candidates.at(-1)

/**
 * The search title and description of each page the site plan keeps.
 * @param {any} brief
 * @param {{ seo?: {title?: string, description?: string} | null, name?: string | null,
 *   pages?: Array<{id: string, path?: string, role: string, decision: string}>,
 *   contact?: Record<string, {value?: string}> | null }} plan - the site plan's home search result, name, pages and contact
 * @returns {Array<{id: string, path: string | null, role: string, title: string, description: string}>}
 */
export function pageSeoOf(brief, { seo = null, name = null, pages = [], contact = null } = {}) {
  const where = heroWhereOf(brief)
  const city = where?.city ?? null
  const district = where?.district ?? null
  const noun = businessWords(brief?.business).noun
  const own = nonEmpty(name) ? name.trim() : null
  const who = own ?? `the ${noun}`
  const inCity = city ? ` in ${city}` : ''
  const based = district && city ? `, based in ${district}, ${city}` : city ? `, based in ${city}` : ''
  const names = offeringNames(brief)
  const phone = nonEmpty(contact?.phone?.value) ? contact.phone.value.trim() : null
  const booking = nonEmpty(contact?.booking?.value) ? ` ${contact.booking.value.trim()}` : ''
  /** A sentence with as many offerings as fit, dropped from the end; `make` takes the listed offerings ('' for none). */
  const withOfferings = (make) => {
    for (let n = names.length; n >= 1; n -= 1) {
      const text = make(capitalFirst(listed(names.slice(0, n))))
      if (fits(text, SEO_DESCRIPTION_MAX)) return text
    }
    return make('')
  }
  const titled = (label) =>
    firstFitting(own ? [`${label} | ${own}`, label] : [`${label}${inCity}`, label], SEO_TITLE_MAX)
  /** @type {Record<string, (label: string) => string>} */
  const describe = {
    about: () => withOfferings((o) => `About ${who}${based}.${o ? ` ${o}.` : ''}`),
    contact: () =>
      `Contact ${who}${inCity}${phone ? `: call ${phone}` : ''}.${booking}`.replace(/\.\.$/, '.'),
    team: () => withOfferings((o) => `Meet the team of ${who}${inCity}.${o ? ` ${o}.` : ''}`),
    services: () => withOfferings((o) => (o ? `${o} with ${who}${inCity}.` : `What ${who} offers${inCity}.`))
  }
  const out = []
  for (const page of pages) {
    if (page?.decision !== 'keep') continue
    const path = typeof page.path === 'string' ? page.path : null
    if (page.role === 'home' || path === '/') {
      if (!nonEmpty(seo?.title)) continue
      out.push({
        id: page.id,
        path,
        role: 'home',
        title: seo.title.trim(),
        description: nonEmpty(seo?.description) ? seo.description.trim() : ''
      })
      continue
    }
    // An offerings page is called by its offerings, as many as fit beside the name, else "Services".
    const label =
      page.role === 'services'
        ? (names
            .map((_, i) => capitalFirst(listed(names.slice(0, names.length - i))))
            .find((l) => fits(own ? `${l} | ${own}` : l, SEO_TITLE_MAX)) ?? 'Services')
        : (ROLE_LABELS[page.role] ?? wordsOfPath(page.id))
    const description = (describe[page.role] ?? ((l) => `${l} at ${who}${inCity}.`))(label)
    out.push({
      id: page.id,
      path,
      role: page.role,
      title: titled(label),
      description: fits(description, SEO_DESCRIPTION_MAX) ? description : `${capitalFirst(who)}${inCity}.`
    })
  }
  return out
}

/**
 * What the not-found page says: its title, heading, one sentence naming the business, and where it leads.
 * @param {any} brief
 * @param {{ name?: string | null, pages?: Array<{path?: string, role: string, decision: string}> }} plan
 * @returns {{title: string, heading: string, message: string, links: Array<{label: string, path: string}>}}
 */
export function notFoundPageOf(brief, { name = null, pages = [] } = {}) {
  const noun = businessWords(brief?.business).noun
  const own = nonEmpty(name) ? name.trim() : null
  const contactPage = pages.find(
    (p) => p?.decision === 'keep' && p.role === 'contact' && typeof p.path === 'string'
  )
  const links = [
    { label: 'Home', path: '/' },
    ...(contactPage ? [{ label: 'Contact', path: contactPage.path }] : [])
  ]
  const title = own ? `Page not found | ${own}` : 'Page not found'
  const lead = own ? `This page is not on the ${own} site.` : `This page is not on the ${noun}'s site.`
  const message = `${lead} ${contactPage ? 'Go back to the home page, or contact us.' : 'Go back to the home page.'}`
  return {
    title: fits(title, SEO_TITLE_MAX) ? title : 'Page not found',
    heading: 'Page not found',
    message,
    links
  }
}
