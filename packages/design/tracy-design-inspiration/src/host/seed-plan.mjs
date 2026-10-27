/**
 * The seed plan: what the seeder writes into a CMS so the site shows the pages the customer approved
 * on the preview, with their words, and leads from one page to the next (tasks/todo-seeder.md).
 *
 * Pure. In: the design system and the CMS, the site file (`design-preview.json`: `site`, `pages`),
 * the copy file (`design-copy/<id>.json`: the version the customer chose per chip), the system's
 * fixture and landing artifact with their slot maps, the section library's markup, and what the two
 * model turns wrote (`seed-copy.mjs`). Out: pages with their final bodies, posts, the menu, the style —
 * the same shape for both CMS; `seed-apply-*.mjs` only carries it to `wp` or to `tracy_site`.
 *
 * The fill rules are the preview's own (`planFill`, `planBrandFill` of `src/client/fill.mjs`), so a
 * seeded page is the chip the customer saw. One thing the preview never needed: an `href` on the
 * landing's nav and buttons, which here point at the seeded pages.
 */

import * as linkedom from 'linkedom'
import { artifactSnippet, fixtureSnippet } from '../../../../cms/tracy-cms-sections/lib/fixture.mjs'
import { planBrandFill, planFill } from '../client/fill.mjs'
import { BUILTIN_VERSIONS } from './copy.mjs'
import regions from '../../../../cms/tracy-cms-sections/regions.json' with { type: 'json' }

import { applyFill, fragmentSlots, stripBlocks, swapBrand } from './seed-dom.mjs'

export const SEED_PLAN_SCHEMA = 'tracy-seed-plan/v1'

/** Sample endorsements are layout fixtures, not customer facts. Unapproved contact
 * addresses can also survive in slots that a copy model did not replace.
 * @param {string} html @param {Record<string, unknown> | null} site @param {string} original */
function customerContent(html, site, original) {
  const { document } = linkedom.parseHTML(html)
  // The engine's testimonial card uses ordinary div/p elements, not blockquote.
  // Locate those sample sections BEFORE rewriting their quotes, then remove the same
  // sections in the filled document; slot filling does not alter the tree structure.
  const source = linkedom.parseHTML(original).document
  const sections = [...document.querySelectorAll('section')]
  ;[...source.querySelectorAll('section')].forEach((section, index) => {
    if ([...section.querySelectorAll('p')].some((p) => /^\s*[“"]/.test(p.textContent ?? '')))
      sections[index]?.remove()
  })
  for (const node of document.querySelectorAll(
    'blockquote,[class*="testimonial"],[class*="social-proof"],[class*="logo-strip"],[class*="logos"],[class*="stats"]'
  )) {
    const group = node.closest('section')
    if (group) group.remove()
    else node.remove()
  }
  const supplied = JSON.stringify(site ?? {}).toLowerCase()
  const address = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi
  /** @param {string} value */
  const clean = (value) =>
    value.replace(address, (email) => (supplied.includes(email.toLowerCase()) ? email : ''))
  /** @param {any} node */
  const walk = (node) => {
    if (node.nodeType === 3) node.textContent = clean(node.textContent)
    if (['SCRIPT', 'STYLE'].includes(node.tagName)) return
    for (const attr of ['href', 'title', 'aria-label']) {
      const value = node.getAttribute?.(attr)
      if (value && value.includes('@')) {
        const next = clean(value)
        if (next === 'mailto:') node.removeAttribute(attr)
        else node.setAttribute(attr, next)
      }
    }
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(document.body)
  return document.toString()
}

/** The seeded site's menu, in order — the stands' menu, and the pages below. */
export const MENU = Object.freeze([
  { slug: 'home', label: 'Home' },
  { slug: 'design', label: 'Design' },
  { slug: 'sections', label: 'Sections' },
  { slug: 'product', label: 'Product' },
  { slug: 'service', label: 'Service' },
  { slug: 'blog', label: 'Blog' },
  { slug: 'about', label: 'About us' },
  { slug: 'pricing', label: 'Pricing' },
  { slug: 'style-guide', label: 'Style guide' },
  { slug: 'contact', label: 'Contact' }
])

/**
 * The three pages the form offers that the library had no page for, each as its own run of
 * sections (`@tracy/cms-sections`).
 *
 * 🔒 NO TWO SHARE A SECTION, and `hero` is in none of them. Sections are filled ONCE per name
 * (`fillSections`), so a section used on two pages puts the same words on both — three pages built
 * from overlapping runs would read as one page printed three times, which is worse than not having
 * them. `hero` belongs to the home page: a second one below it says the same thing again.
 */
export const PAGE_SECTIONS = Object.freeze({
  product: Object.freeze(['features', 'proof', 'cta-inline']),
  service: Object.freeze(['how-it-works', 'pillars', 'cta-final']),
  about: Object.freeze(['problem', 'social-proof', 'faq'])
})

/**
 * The landing of the section library, in the library's order: the sections whose marker says
 * `kind: landing`, read from the generated `regions.json` of `@tracy/cms-sections` at bundle time.
 * Until 29/09/2026 this was a second hand-typed copy of that order; a section added to the library
 * had to be added here too, and nothing said so.
 */
export const SECTION_ORDER = Object.freeze(
  regions.order.filter(
    (name) => /** @type {Record<string, { kind?: string }>} */ (regions.sections)[name]?.kind === 'landing'
  )
)

export const CMS = Object.freeze(['wordpress', 'joomla'])

/**
 * Where a slug lives on each CMS, root-relative: WordPress with pretty permalinks, Joomla as the
 * stand routes it (`index.php/<alias>`, no SEF rewrite assumed).
 * @param {'wordpress' | 'joomla'} cms
 * @param {string} slug
 */
export function urlOf(cms, slug) {
  if (slug === 'home') return '/'
  return cms === 'joomla' ? `/index.php/${slug}` : `/${slug}/`
}

/**
 * The slot texts of the version the customer chose on a chip, or `null` when they left the
 * built-ins (the site's own words, the author's) — then the cut rule of the preview applies.
 * @param {{ pages?: Record<string, { versions: { id: string, slots: Record<string, string> }[], selected: string | null }> } | null | undefined} copyFile
 * @param {string} chip
 * @returns {Record<string, string> | null}
 */
export function copyFor(copyFile, chip) {
  const c = copyFile?.pages?.[chip]
  if (!c || typeof c.selected !== 'string' || BUILTIN_VERSIONS.includes(c.selected)) return null
  const v = c.versions.find((x) => x.id === c.selected)
  return v && v.slots && typeof v.slots === 'object' ? v.slots : null
}

/**
 * The engine's landing writes the brand as a plain span in the header, which the slot map reads as
 * a nav label — the preview fixes that by swapping the name across the document. Here the same:
 * the header slot that holds the system's name is the brand, filled with the site's name and
 * linked home, and kept out of the nav queue.
 * @param {{ id: string, role: string, text?: string, inNav?: boolean }[]} slots
 * @param {string} systemName
 */
export function brandSlotOf(slots, systemName) {
  const name = systemName.trim().toLowerCase()
  if (name === '') return null
  return (
    slots.find((s) => s.inNav && s.role !== 'button' && (s.text ?? '').trim().toLowerCase() === name) ?? null
  )
}

/**
 * The landing artifact's links: nav entries to the menu in order, the brand to home, the buttons
 * (outside the nav) to Pricing and Contact — as `{ id, href }` to merge into the fill.
 * @param {{ id: string, role: string, inNav?: boolean, tag?: string }[]} slots
 * @param {{ slug: string, url: string }[]} menu
 * @param {string | null} [brandId] - the brand slot, linked home instead of into the nav
 */
export function landingHrefs(slots, menu, brandId = null) {
  const nav = menu.filter((m) => m.slug !== 'home').map((m) => m.url)
  const buttons = ['pricing', 'contact'].map((s) => menu.find((m) => m.slug === s)?.url).filter(Boolean)
  const out = []
  for (const s of slots) {
    const role =
      s.id === brandId ? 'brand' : s.inNav && (s.role === 'button' || s.role === 'label') ? 'nav' : s.role
    if (role === 'nav') {
      const href = nav.shift()
      if (href) out.push({ id: s.id, href })
    } else if (role === 'brand') {
      // The engine writes the brand as a span; only a link can lead home.
      if (s.tag === 'a') out.push({ id: s.id, href: '/' })
    } else if (role === 'button') {
      const href = buttons.shift()
      if (href) out.push({ id: s.id, href })
    }
  }
  return out
}

/** Merge `hrefs` into `fills` by slot id; a slot with an href and no text keeps its drawn text.
 * @param {{id: string, text?: string, role?: string, href?: string}[]} fills
 * @param {{id: string, href: string}[]} hrefs */
function withHrefs(fills, hrefs) {
  const byId = new Map(fills.map((f) => [f.id, { ...f }]))
  for (const h of hrefs) {
    const f = byId.get(h.id)
    if (f) f.href = h.href
    else byId.set(h.id, { id: h.id, href: h.href })
  }
  return [...byId.values()]
}

/**
 * The section library with the model's words in it: one filled fragment per section, block
 * comments stripped (the HTML that is left renders the same on both CMS).
 * @param {Record<string, string>} markups - section name → markup (a pattern's body, or the Joomla snippet)
 * @param {Record<string, Record<string, string>> | null | undefined} copy - section → slot id → text
 * @returns {Record<string, string>}
 */
export function fillSections(markups, copy) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [name, markup] of Object.entries(markups)) {
    const html = stripBlocks(markup)
    const texts = copy?.[name]
    if (!texts || Object.keys(texts).length === 0) {
      out[name] = html
      continue
    }
    const roles = new Map(fragmentSlots(html).map((s) => [s.id, s.role]))
    const fills = Object.entries(texts)
      .filter(([id, text]) => roles.has(id) && typeof text === 'string' && text.trim() !== '')
      .map(([id, text]) => ({ id, text: text.trim(), role: roles.get(id) }))
    out[name] = applyFill(html, fills)
  }
  return out
}

/**
 * The Pricing page from the section library's pricing section — its plan cards take the site's
 * plan names and prices in order (the section's own eyebrow → name, subtitle → price); cards the
 * site has no plan for are dropped, so a two-plan site shows two cards, not three with a sample
 * third. The library's own words stay elsewhere (title, features), or the model's when it wrote
 * them. Measured 07/09: the fixture with the prices poured into its `number` slots put "$29 ·
 * $299 · 3.2s" into "Signal quality · Active flows · Response time" — a fixture is a component
 * board, not a pricing page.
 * @param {string} markup - the library's pricing.html (block markup or stripped)
 * @param {{ plans?: unknown, prices?: unknown } | null | undefined} data - the pricing page's data
 * @param {Record<string, string> | null | undefined} copy - the model's words for this section
 * @returns {string | null} the section, or null when the site names no plans
 */
export function pricingFromSection(markup, data, copy) {
  const plans = Array.isArray(data?.plans)
    ? data.plans.map((p) => String(p ?? '').trim()).filter(Boolean)
    : []
  if (plans.length === 0) return null
  const prices = Array.isArray(data?.prices) ? data.prices.map((p) => String(p ?? '').trim()) : []
  const html = stripBlocks(markup)
  const slots = fragmentSlots(html)
  // The cards: each opens with an eyebrow (the plan name) followed by a subtitle (the price).
  const cards = []
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].role === 'eyebrow' && slots[i + 1]?.role === 'subtitle')
      cards.push({ name: slots[i], price: slots[i + 1] })
  }
  const fills = []
  for (const [id, text] of Object.entries(copy ?? {})) {
    const slot = slots.find((s) => s.id === id)
    if (slot && typeof text === 'string' && text.trim() !== '')
      fills.push({ id, text: text.trim(), role: slot.role })
  }
  cards.forEach((card, i) => {
    if (!plans[i]) return
    fills.push({ id: card.name.id, text: plans[i], role: 'eyebrow' })
    if (prices[i]) fills.push({ id: card.price.id, text: prices[i], role: 'subtitle' })
  })
  let out = applyFill(html, fills)
  // Cards beyond the site's plans go: the plan cards are the direct children of the plans grid.
  if (cards.length > plans.length) {
    const { parseHTML } = linkedom
    const { document } = parseHTML(`<!doctype html><html><body>${out}</body></html>`)
    const grid = document.querySelector('.tracy-plans__grid')
    if (grid) {
      const children = Array.from(grid.children)
      for (const child of children.slice(plans.length)) child.remove()
      out = document.body.innerHTML
    }
  }
  return out
}

/**
 * @typedef {{ path: string, type: string, label: string, data?: Record<string, unknown> }} Page
 * @typedef {{ slug: string, title: string, kind: 'artifact' | 'fixture' | 'landing' | 'page', artifact?: string, body: string }} PlanPage
 * @typedef {{ title: string, slug: string, excerpt: string, paragraphs: string[], imagePrompt: string }} Post
 * @typedef {{
 *   system: string,
 *   cms: 'wordpress' | 'joomla',
 *   site: Record<string, unknown> | null | undefined,
 *   pages?: Page[] | null,
 *   copy?: object | null,
 *   wanted?: string[],
 *   systemName?: string,
 *   siteKey?: string | null,
 *   fixtureHtml: string,
 *   fixtureSlots: { id: string, role: string, words: number, inNav?: boolean }[],
 *   landingHtml: string,
 *   landingSlots: { id: string, role: string, words: number, inNav?: boolean }[],
 *   sections?: Record<string, string> | null,
 *   sectionsCopy?: Record<string, Record<string, string>> | null,
 *   posts?: Post[] | null
 * }} SeedInput
 */

/**
 * The text of the first match of each selector in a fragment. Used to lift the contact section's
 * heading and lead out of the page body, for the CMS that keeps those two fields of its own.
 * @param {string} html @param {string[]} selectors @returns {Record<string, string>}
 */
export function textOf(html, selectors) {
  const { document } = linkedom.parseHTML(`<body>${html}</body>`)
  /** @type {Record<string, string>} */
  const out = {}
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    const text = el ? el.textContent.replace(/\s+/g, ' ').trim() : ''
    if (text !== '') out[selector === 'h2' ? 'h2' : selector] = text
  }
  return out
}

/**
 * @param {SeedInput} input
 * @returns {{ ok: true, plan: { schemaVersion: string, system: string, cms: string, style: { inspiration: string }, contact: {email: string | null, name: string, lead: string}, menu: { slug: string, label: string, url: string }[], pages: PlanPage[], posts: Post[] } } | { ok: false, error: string }}
 */
export function buildSeedPlan(input) {
  const { system, cms } = input
  if (!CMS.includes(cms)) return { ok: false, error: `unknown cms ${String(cms)}` }
  const site = input.site && typeof input.site === 'object' ? input.site : null
  const name = typeof site?.name === 'string' ? site.name.trim() : ''
  const headline = typeof site?.headline === 'string' ? site.headline.trim() : ''
  if (name === '' && headline === '') return { ok: false, error: 'NO_WORDS' }

  const pages = Array.isArray(input.pages) ? input.pages : []
  const menu = MENU.map((m) => ({ ...m, url: urlOf(cms, m.slug) }))
  /** @type {PlanPage[]} */
  const out = []

  /**
   * Which slugs the customer asked for — the form's Pages answer, carried here as `site.wanted`.
   *
   * 🔒 EMPTY MEANS EVERYTHING, and that is not laziness. A design system's own stand is seeded with
   * no answers at all, and it is the one place Design · Sections · Style guide belong; a customer's
   * build always names its pages, so those three simply never come up (decided 08/09: "drop them, they
   * do not reach customers"). Gating on the list rather than deleting the three keeps the stand buildable.
   */
  const asked = Array.isArray(input.wanted) && input.wanted.length > 0 ? new Set(input.wanted) : null
  /** @param {string} slug */
  const want = (slug) => asked === null || asked.has(slug)

  // Home — the landing artifact, the preview's Landing chip, its nav and buttons leading somewhere.
  // The author's words stay (as on the preview); the system's name becomes the site's everywhere.
  const landingChip = input.siteKey ? `${input.siteKey}_landing` : 'landing'
  const systemName =
    typeof input.systemName === 'string' && input.systemName.trim() !== '' ? input.systemName : system
  const navLabels = menu.filter((m) => m.slug !== 'home').map((m) => m.label)
  const brand = brandSlotOf(input.landingSlots, systemName)
  const navSlots = input.landingSlots.filter((s) => s !== brand)
  const homeFills = planBrandFill(navSlots, {
    site: { ...site, nav: navLabels },
    copy: copyFor(input.copy, landingChip)
  })
  if (brand && name !== '') homeFills.push({ id: brand.id, text: name, role: 'brand' })
  let homeHtml = swapBrand(
    applyFill(
      input.landingHtml,
      withHrefs(homeFills, landingHrefs(input.landingSlots, menu, brand?.id ?? null))
    ),
    systemName,
    name
  )
  if (asked !== null) homeHtml = customerContent(homeHtml, site, input.landingHtml)
  if (want('home'))
    out.push({
      slug: 'home',
      title: name || 'Home',
      kind: 'artifact',
      artifact: 'landing',
      body: artifactSnippet(homeHtml, system, 'landing')
    })

  // Design — the system's fixture with the home page's words, the preview's Home chip.
  const homePage = pages.find((p) => p.type === 'home') ?? null
  const designFills = planFill(input.fixtureSlots, {
    site: site ?? {},
    pages,
    page: homePage,
    copy: copyFor(input.copy, homePage?.path ?? '/')
  })
  if (want('design'))
    out.push({
      slug: 'design',
      title: 'Design',
      kind: 'fixture',
      body: fixtureSnippet(applyFill(input.fixtureHtml, designFills), system)
    })

  // Pricing — the library's pricing section with the site's plans and prices; only when the site
  // has a pricing page with plans, and only when the library is at hand.
  const pricingPage = pages.find((p) => p.type === 'pricing') ?? null
  if (want('pricing') && pricingPage && input.sections?.pricing) {
    const body = pricingFromSection(input.sections.pricing, pricingPage.data, input.sectionsCopy?.pricing)
    if (body) out.push({ slug: 'pricing', title: pricingPage.label || 'Pricing', kind: 'page', body })
  }
  // A customer selecting Pricing still gets that page when no prices were supplied.
  // Keep the demo's invented tiers out; the contact page is the next useful step.
  if (asked?.has('pricing') && !out.some((page) => page.slug === 'pricing')) {
    const contact = asked.has('contact')
      ? `<p><a href="${urlOf(cms, 'contact')}">Contact us for current prices</a></p>`
      : ''
    out.push({
      slug: 'pricing',
      title: 'Pricing',
      kind: 'page',
      body: `<section class="tracy-plans"><h1>Pricing</h1><p>Prices have not been published yet.</p>${contact}</section>`
    })
  }

  // Sections, Style guide, Contact — the library, with the model's words where it wrote them.
  if (input.sections) {
    const filled = fillSections(input.sections, input.sectionsCopy)
    const landing = SECTION_ORDER.filter((n) => filled[n])
      .map((n) => filled[n])
      .join('\n')
    // Product · Service · About us — the three the form offers, each its own run of sections.
    for (const [slug, names] of Object.entries(PAGE_SECTIONS)) {
      if (!want(slug)) continue
      const body = names
        .filter((n) => filled[n])
        .map((n) => filled[n])
        .join('\n')
      if (body !== '')
        out.push({
          slug,
          title: MENU.find((m) => m.slug === slug)?.label ?? slug,
          kind: 'landing',
          body
        })
    }
    if (want('sections') && landing !== '')
      out.push({ slug: 'sections', title: 'Sections', kind: 'landing', body: landing })
    if (want('style-guide') && filled.styleguide)
      out.push({ slug: 'style-guide', title: 'Style guide', kind: 'page', body: filled.styleguide })
    if (want('contact') && filled.contact)
      out.push({ slug: 'contact', title: 'Contact', kind: 'page', body: filled.contact })
  }

  const posts = Array.isArray(input.posts) ? input.posts : []
  // Where the contact form's mail goes. Each CMS wires the form its own way — Joomla's own
  // com_contact (the template overrides its markup), the WordPress theme's own handler — and both
  // need the address the customer gave.
  const email =
    typeof site?.contact === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.contact.trim())
      ? site.contact.trim()
      : null
  // Joomla draws the left column from the contact record, not from the page body, so the heading
  // and the lead of the filled section travel with the plan. Without them the two CMS show the
  // same form under different words.
  const contactPage = out.find((p) => p.slug === 'contact')
  const contactWords = contactPage ? textOf(contactPage.body, ['h2', '.tracy-lead']) : {}
  return {
    ok: true,
    plan: {
      schemaVersion: SEED_PLAN_SCHEMA,
      system,
      cms,
      style: { inspiration: system },
      contact: { email, name: contactWords.h2 || name || 'Contact', lead: contactWords['.tracy-lead'] || '' },
      // Blog is the theme's own listing, so it has no entry in `out` — it is in the menu when it
      // was asked for (or, with no answers, always, as before).
      menu: menu.filter((m) => (m.slug === 'blog' ? want('blog') : out.some((p) => p.slug === m.slug))),
      pages: out,
      posts
    }
  }
}
