// The demo-leftover check (spec TracyHQ/tracy#189, ticket #191): reads the pages a brief build serves and lists every piece
// of the template's demo still on them, by kind, page and place. The kinds are the 19 of the leftover analysis (C01..C19);
// the same check judges tests, builds and the bounded cleanup turn (#197), which receives its findings.
//
// Input: the served pages (`{path, status, html}`; a page answering 400 or more is the not-found or offline page), the
// template's content map (its slots carry the demo's own samples: a file, a video id, a line of words), the brief (words
// the business itself holds are never leftovers) and optionally the internal paths the site did not serve (`missing`).
// Pure and deterministic: no network, no clock.
//
// 🔒 ONE RULE PER KIND, ADDED BY ADDING A RULE: `LEFTOVER_RULES` is the whole check. A later ticket sharpens a kind by
// replacing its rule's `find`, and says how complete it is (`coverage`: `full` reads every place the kind can sit on the
// page; `basic` reads the common places and may miss some).
import { otherMapLeftovers } from './demo-leftovers-maps.mjs'
import { demoLogoLeftovers, demoPostLeftovers, demoSocialLeftovers } from './demo-leftovers-identity.mjs'
import { labelLeftovers, offeringLeftovers, priceLeftovers } from './demo-leftovers-honesty.mjs'
import { textLeftovers } from './demo-leftovers-text.mjs'
import {
  findCutOuts,
  findDemoIcons,
  findGeneralPictures,
  findSharedPictures,
  onePerFile
} from './demo-leftovers-pictures.mjs'
import {
  addressLeftovers,
  creditLeftovers,
  deadLinkLeftovers,
  demoBackgroundLeftovers,
  demoVideoLeftovers,
  errorPageLeftovers,
  showcaseLeftovers
} from './demo-leftovers-outside.mjs'

export const LEFTOVER_CHECK_VERSION = 'demo-leftovers/1'

/** The 19 kinds of the leftover analysis, with how bad each is for the owner and how complete its rule is today. */
export const LEFTOVER_KINDS = Object.freeze({
  C01: { name: 'demo picture in a general slot', severity: 'blocker', coverage: 'full' },
  C02: { name: 'demo post', severity: 'blocker', coverage: 'full' },
  C03: { name: 'demo offering card or page', severity: 'blocker', coverage: 'full' },
  C04: { name: 'demo icon', severity: 'blocker', coverage: 'full' },
  C05: { name: 'demo cut-out figure', severity: 'major', coverage: 'full' },
  C06: { name: 'demo picture shared by several cards', severity: 'blocker', coverage: 'full' },
  C07: { name: 'demo person', severity: 'blocker', coverage: 'full' },
  C08: { name: 'demo video', severity: 'blocker', coverage: 'full' },
  C09: { name: 'decorative text in the demo’s words', severity: 'blocker', coverage: 'full' },
  C10: { name: 'demo background from the template settings', severity: 'major', coverage: 'full' },
  C11: { name: 'showcase page', severity: 'major', coverage: 'full' },
  C12: { name: 'demo words in a page address', severity: 'major', coverage: 'full' },
  C13: { name: 'demo logo', severity: 'blocker', coverage: 'full' },
  C14: { name: 'template credit line', severity: 'major', coverage: 'full' },
  C15: { name: 'demo proof (avatars, signature)', severity: 'minor', coverage: 'full' },
  C16: { name: 'demo on the not-found or offline page', severity: 'minor', coverage: 'full' },
  C17: { name: 'demo fact (contact, schedule, price, number)', severity: 'minor', coverage: 'full' },
  C18: { name: 'demo social link or map', severity: 'minor', coverage: 'basic' },
  C19: { name: 'link that leads nowhere', severity: 'minor', coverage: 'full' }
})

/** Text and picture roles of a demo post. */
const POST_ROLES = new Set(['article.image', 'article.title', 'article.lead', 'editorial.paragraph'])
/** Decorative words: labels of buttons and menus. */
const LABEL_ROLES = new Set([
  'editorial.button_label',
  'editorial.menu_label',
  'contact.cta_label',
  'package.cta_label',
  'offering.cta_label'
])
/** Facts a demo states: contact lines, schedules, prices and numbers. */
const FACT_ROLES = new Set([
  'contact.phone',
  'contact.email',
  'contact.address',
  'offering.schedule',
  'offering.price',
  'offering.price_note',
  'package.name',
  'package.price',
  'package.period',
  'package.features_list',
  'stat.value',
  'stat.label'
])
const SOCIAL = /facebook|twitter|instagram|telegram|youtube|linkedin|tiktok|pinterest|x\.com/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const SHORTEST_PROBE = 4
const LONGEST_PROBE = 80

/** Lower-case words with the markup, entities and spacing taken out. */
const normalized = (value) =>
  String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whether `probe` stands in `text` as whole words. */
const holds = (text, probe) => new RegExp(`(^|[^a-z0-9])${escapeRe(probe)}($|[^a-z0-9])`).test(text)

/** The `images/...` file a sample or an address names. */
function fileOf(value) {
  const m = String(value ?? '').match(/images\/[^"'?#\s)]+\.(?:jpe?g|png|webp|svg|gif|avif)/i)
  return m ? m[0] : null
}

/** The YouTube id a sample names. */
function videoOf(value) {
  const s = String(value ?? '')
  const m = s.match(/(?:v=|embed\/|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : /^[\w-]{11}$/.test(s) ? s : null
}

/** What one page holds, read once for every rule. */
function readPage({ path, status = 200, html = '' }) {
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].map(([, attrs, inner]) => ({
    href: (attrs.match(/\shref\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? null)?.trim() ?? null,
    attrs,
    inner,
    text: normalized(inner),
    label:
      normalized(inner) &&
      inner
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
  }))
  const sources = [...html.matchAll(/\b(?:src|srcset|href|poster|data-src)\s*=\s*(["'])([\s\S]*?)\1/gi)].map(
    (m) => m[2]
  )
  const backgrounds = [
    ...html.matchAll(/background(?:-image)?\s*:[^;"'}]*url\(\s*["']?([^"'()\s]+)["']?\s*\)/gi)
  ].map((m) => m[1])
  return { path, status, html, text: normalized(html), links, sources, backgrounds }
}

/** The demo's own pieces, read from the content map once. */
function demoOf(contentMap, brief) {
  const own = normalized(JSON.stringify(brief ?? {}))
  const slots = []
  for (const slot of contentMap?.slots ?? []) {
    if (slot?.sample == null || slot.sample === '') continue
    if (slot.type === 'image') {
      const file = fileOf(slot.sample)
      if (file) slots.push({ slot, probe: { file } })
    } else if (slot.type === 'url' || slot.role === 'business.video') {
      const video = slot.role === 'business.video' ? videoOf(slot.sample) : null
      const url = String(slot.sample).trim()
      // An empty or `#` link is no demo address of its own: the generic link rule (C19) reads those.
      if (!video && (url === '' || url.startsWith('#'))) continue
      slots.push({ slot, probe: video ? { video } : { url } })
    } else {
      const words = normalized(slot.sample).slice(0, LONGEST_PROBE).trim()
      // Too short to be the demo's, or the business's own words too.
      if (words.length < SHORTEST_PROBE || holds(own, words)) continue
      slots.push({ slot, probe: { words } })
    }
  }
  const files = new Map()
  // An icon set repeated across sections is one design, not a picture two cards share (C04 reads icons).
  for (const { slot, probe } of slots)
    if (probe.file && slot.role !== 'editorial.item_icon') {
      const at = files.get(probe.file) ?? new Set()
      at.add(slot.entity)
      files.set(probe.file, at)
    }
  const aliases = (contentMap?.entities ?? [])
    .map((e) => {
      const alias =
        e?.identity?.alias ??
        (String(e?.identity?.path ?? '').includes('/') ? e.identity.path.split('/').at(-1) : null)
      return typeof alias === 'string' && alias.length > SHORTEST_PROBE && alias.includes('-') ? alias : null
    })
    .filter((alias) => alias && !alias.split('-').every((w) => holds(own, w)))
  const slotFiles = new Set(slots.map(({ probe }) => probe.file).filter(Boolean))
  return { own, slots, files, slotFiles, aliases }
}

/** Whether a page shows a slot's demo piece, and the piece it shows. */
function shown(page, probe) {
  if (probe.file) return page.sources.some((s) => s.includes(probe.file)) ? probe.file : null
  if (probe.video) return page.html.includes(probe.video) ? probe.video : null
  if (probe.url)
    return page.links.some((l) => l.href === probe.url || l.href?.replace(/&amp;/g, '&') === probe.url)
      ? probe.url
      : null
  return holds(page.text, probe.words) ? probe.words : null
}

/** A rule that reports every slot of `which` whose demo piece a served page still shows. */
const bySlot = (which) => (ctx) => {
  const out = []
  for (const page of ctx.served)
    for (const { slot, probe } of ctx.demo.slots) {
      if (!which(slot, probe)) continue
      const found = shown(page, probe)
      if (found) out.push({ page: page.path, place: slot.key, found })
    }
  return out
}

/** The text roles another kind reads by their first words: a label (C09's own), an offering (C03), a person (C07), a fact
 * (C17), a post's lines (C02), a video (C08), a social line (C18). */
const readByOtherKind = (s) => {
  const role = String(s.role ?? '')
  return (
    LABEL_ROLES.has(role) ||
    FACT_ROLES.has(role) ||
    role.startsWith('offering.') ||
    role.startsWith('person.') ||
    role === 'quote.author_name' ||
    role === 'business.video' ||
    role.startsWith('contact.social') ||
    (String(s.entity).startsWith('article-') && POST_ROLES.has(role))
  )
}

/** Whether a map address names the brief's place or its address. */
const showsBriefPlace = (ctx, src) =>
  ctx.placeKeys.some((k) => src.includes(k)) || Boolean(ctx.addressWord && src.includes(ctx.addressWord))

const isOwnFact = (ctx, value) => holds(ctx.demo.own, normalized(value))

/** The kinds counted once per demo piece and page (see `checkDemoLeftovers`). */
const PIECE_KINDS = new Set(['C02', 'C08', 'C18'])

/** Every rule of the check, one per kind. A new or sharper rule replaces its kind's entry. */
export const LEFTOVER_RULES = Object.freeze([
  // C01, C04, C05, C06: every place a page carries a demo picture, by the slot's label (`demo-leftovers-pictures.mjs`).
  { kind: 'C01', find: findGeneralPictures },
  {
    kind: 'C02',
    find: (ctx) => [
      ...bySlot((s) => String(s.entity).startsWith('article-') && POST_ROLES.has(s.role))(ctx),
      ...demoPostLeftovers(ctx)
    ]
  },
  // An offering's schedule and price are its facts (C17), not its card.
  // C03, C09, C17 sharpened by ticket #192: `demo-leftovers-honesty.mjs`.
  {
    kind: 'C03',
    find: (ctx) =>
      offeringLeftovers(
        ctx,
        bySlot((s) => String(s.role).startsWith('offering.') && !FACT_ROLES.has(s.role))(ctx)
      )
  },
  { kind: 'C04', find: findDemoIcons },
  { kind: 'C05', find: findCutOuts },
  {
    kind: 'C06',
    find: findSharedPictures
  },
  {
    kind: 'C07',
    find: bySlot(
      (s) =>
        String(s.role).startsWith('person.') ||
        String(s.role).startsWith('quote.author_name') ||
        /^user(profile)?-/i.test(String(s.entity))
    )
  },
  // C08..C19 outside the content map: `demo-leftovers-outside.mjs` (ticket #196).
  { kind: 'C08', find: (ctx) => demoVideoLeftovers(ctx, bySlot((s) => s.role === 'business.video')(ctx)) },
  // C09: a label in the demo's words, and the demo's words in any other text slot no other kind reads (`demo-leftovers-text.mjs`).
  {
    kind: 'C09',
    find: (ctx) => [
      ...labelLeftovers(ctx, bySlot((s) => LABEL_ROLES.has(s.role))(ctx)),
      ...textLeftovers(ctx, readByOtherKind)
    ]
  },
  { kind: 'C10', find: demoBackgroundLeftovers },
  { kind: 'C11', find: showcaseLeftovers },
  { kind: 'C12', find: addressLeftovers },
  {
    kind: 'C13',
    // One per page and logo file: the header, its dark twin and the footer often print the same demo file.
    find: (ctx) => onePerFile([...bySlot((s) => s.role === 'business.logo')(ctx), ...demoLogoLeftovers(ctx)])
  },
  { kind: 'C14', find: creditLeftovers },
  {
    kind: 'C15',
    find: bySlot(
      (s, p) =>
        ['stat.proof_image', 'quote.author_image'].includes(s.role) || /(^|\/)sign\.png$/i.test(p.file ?? '')
    )
  },
  { kind: 'C16', find: (ctx) => errorPageLeftovers(ctx, shown) },
  {
    kind: 'C17',
    find: (ctx) => {
      const out = bySlot((s) => FACT_ROLES.has(s.role))(ctx)
      // A mailbox or a phone link the brief does not hold, wherever the content map has no slot for it.
      for (const page of ctx.served) {
        for (const mail of new Set(page.text.match(EMAIL) ?? []))
          if (!isOwnFact(ctx, mail) && !out.some((f) => f.page === page.path && f.found === mail))
            out.push({ page: page.path, place: 'email', found: mail })
        for (const link of page.links) {
          const tel = /^tel:(.+)$/i.exec(link.href ?? '')?.[1]
          const digits = tel?.replace(/\D+/g, '') ?? ''
          if (digits.length >= 6 && !ctx.demo.own.replace(/\D+/g, '').includes(digits))
            out.push({ page: page.path, place: `a[href="tel:${tel}"]`, found: tel })
        }
      }
      return priceLeftovers(ctx, out)
    }
  },
  {
    kind: 'C18',
    find: (ctx) => {
      const out = [
        ...bySlot((s) => String(s.role).startsWith('contact.social'))(ctx),
        ...demoSocialLeftovers(ctx)
      ]
      for (const page of ctx.served)
        for (const link of page.links) {
          const name = `${link.attrs} ${link.text}`.match(SOCIAL)?.[0]?.toLowerCase()
          if (!name || /sharer|share\?|intent\/tweet|share\.php/i.test(link.href ?? '')) continue
          if (link.href === '#' || link.href === '')
            out.push({ page: page.path, place: `a[href="#"] ${name}`, found: name })
          else if (SOCIAL.test(link.href ?? '') && !isOwnFact(ctx, link.href))
            out.push({ page: page.path, place: link.href, found: name })
        }
      // A map that shows somewhere the brief does not name.
      for (const page of ctx.served)
        for (const [, src] of page.html.matchAll(
          /<iframe\b[^>]*\ssrc\s*=\s*["']([^"']*(?:google\.[a-z.]+\/maps|maps\.google)[^"']*)/gi
        ))
          if (!showsBriefPlace(ctx, decodeURIComponent(src).toLowerCase()))
            out.push({ page: page.path, place: 'map', found: src.slice(0, LONGEST_PROBE) })
      // A map that is not Google's: a shortcode, another provider's embed, a container filled from coordinates.
      out.push(...otherMapLeftovers(ctx, showsBriefPlace))
      return out
    }
  },
  {
    kind: 'C19',
    find: (ctx) => deadLinkLeftovers(ctx, bySlot((s) => s.role === 'editorial.navigation_url')(ctx))
  }
])

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>, contentMap?: {slots?: any[], entities?: any[]} | null,
 *   brief?: object | null, missing?: string[], styles?: Array<{href?: string, css: string}>}} input
 * @returns {{version: string, pass: boolean, findings: Array<{kind: string, page: string, place: string, found: string}>,
 *   counts: Record<string, number>}}
 */
export function checkDemoLeftovers({
  pages = [],
  contentMap = null,
  brief = null,
  missing = [],
  styles = [],
  broken = []
}) {
  const read = pages.map(readPage)
  const demo = demoOf(contentMap, brief)
  const address = normalized(brief?.business?.address ?? '')
  const ctx = {
    served: read.filter((p) => p.status < 400),
    failed: read.filter((p) => p.status >= 400),
    demo,
    contentMap,
    // The first word of the business's address a map of it would carry ("14 Quay Street" → "quay").
    addressWord: address.split(/[\s,]+/).find((w) => /^[a-z]{3,}$/.test(w)) ?? null,
    // The business's Google place (its id, or the cid of its maps link): a map of it is the business's own.
    placeKeys: [
      brief?.googlePlace?.placeId,
      /[?&]cid=(\d{5,30})/.exec(brief?.googlePlace?.googleMapsUri ?? '')?.[1]
    ]
      .filter((k) => typeof k === 'string' && k !== '')
      .map((k) => k.toLowerCase()),
    missing: new Set(missing.map((p) => p.replace(/\/+$/, '') || '/')),
    // The site's own stylesheets the pages load (`{href, css}`): a background the template settings paint lives there (C10).
    styles
  }
  const seen = new Set()
  const findings = []
  for (const rule of LEFTOVER_RULES)
    for (const finding of rule.find(ctx)) {
      // One demo piece on one page is ONE leftover, however many slots of the map hold the same sample (four class articles
      // that share one body text, a video id in every copy of a template layout): counting each copy inflated the kinds
      // below by the number of copies. Kinds that read a place (an icon, a picture) still count each place.
      const key = PIECE_KINDS.has(rule.kind)
        ? `${rule.kind}|${finding.page}|${finding.found}`
        : `${rule.kind}|${finding.page}|${finding.place}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({ kind: rule.kind, ...finding })
    }
  const counts = Object.fromEntries(Object.keys(LEFTOVER_KINDS).map((kind) => [kind, 0]))
  for (const f of findings) counts[f.kind] += 1
  // A page the plan keeps that was not served is no clean site: `broken` blocks the pass whatever the findings say.
  return {
    version: LEFTOVER_CHECK_VERSION,
    pass: findings.length === 0 && broken.length === 0,
    broken,
    findings,
    counts
  }
}
