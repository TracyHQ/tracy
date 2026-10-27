/**
 * Which CMS and which template a brief revision is made for — the pure half of `opportunities-build/revisions.js`,
 * kept in `lib/` so the `/ops/wo` forced brief (`wo-operator-fence.js`) chooses exactly as a customer's
 * revision does: the account's CMS else the `/ops/wo` default, then that CMS's `/ops/wo` pin.
 */
import { createHash } from 'node:crypto'

const CMSS = Object.freeze(['wordpress', 'joomla', 'emdash'])

// Best fit for a restaurant when no template is named, in this order; the first tier that matches wins.
const FIT_TIERS = [
  [
    'restaurant-match',
    /restaurant|food|cafe|café|bistro|dining|kitchen|bakery|coffee|pizza|sushi|nha[- ]?hang/i
  ],
  ['hospitality-match', /hospitality|hotel|resort|\bbar\b|\bpub\b/i],
  ['small-business-match', /small[- ]business|local business/i],
  ['multipurpose-match', /multi-?purpose/i],
  ['business-match', /\bbusiness\b/i]
]
// A template made for another trade (a charity, a beauty spa, a clinic) is taken only when nothing else is offered.
const OTHER_TRADE =
  /charity|non-?profit|donat|beauty|\bspa\b|massage|hospital|clinic|education|course|IT services|agency|industrial|infrastructure|band\b|album|podcast|radio|resume|portfolio|car rental|travel|tour|observability|developer|magazine|community|social network/i

/**
 * The template a revision builds, from the cards `GET /api/templates` offers on this deployment.
 * Requested → that card or `{refusal: 'INVALID_TEMPLATE'}`; nothing requested → the CMS pin from
 * `/ops/wo`, and a pin no longer offered → `{refusal: 'TEMPLATE_PIN_UNAVAILABLE'}` under `strict`,
 * else the restaurant fit with `pin-missing:<tag>;<fit>` as its reason.
 * @param {{ cards: any[] } | { error: string }} templates
 * @param {string} cms
 * @param {{ quickstart: string, design: string } | null | undefined} requested - null: leave unselected
 * @param {{ tag: string, policy: string } | null} [pin]
 */
export function chooseTemplate(templates, cms, requested, pin = null) {
  if (requested === null) return { status: 'unselected', reason: 'NOT_CHOSEN' }
  if ('error' in templates) return { status: 'unavailable', reason: templates.error }
  const offered = offeredOn(templates, [cms])
  if (requested) {
    const hit = offered.find(({ card, p }) => card.id === requested.design && p.tag === requested.quickstart)
    return hit ? shape(hit, 'requested') : { refusal: 'INVALID_TEMPLATE' }
  }
  if (pin) {
    const hit = offered.find(({ p }) => p.tag === pin.tag)
    if (hit) return shape(hit, 'pinned')
    if (pin.policy === 'strict') return { refusal: 'TEMPLATE_PIN_UNAVAILABLE' }
    const fit = fitTemplate(offered)
    return 'status' in fit ? fit : { ...fit, reason: `pin-missing:${pin.tag};${fit.reason}` }
  }
  return fitTemplate(offered)
}

/** Every (card, platform) pair the cards offer on these CMSs, in card order. */
function offeredOn(templates, cmss) {
  return templates.cards.flatMap((card) =>
    (Array.isArray(card?.platforms) ? card.platforms : [])
      .filter((p) => cmss.includes(p?.platform) && typeof p.tag === 'string')
      .map((p) => ({ card, p }))
  )
}

/** The `/ops/wo` pin of each CMS as `chooseTemplate` takes it: `{cms: {tag, policy}}`. */
export function pinsOf(ops) {
  const policy = ops?.templatePinPolicy ?? 'fallback-any-restaurant'
  return Object.fromEntries(
    Object.entries(ops?.pinnedTemplates ?? {}).map(([cms, tag]) => [cms, { tag, policy }])
  )
}

/** What the Build form offers: per CMS its templates, plus the one `/ops/wo` pins there (null when not offered). */
export function templateChoices(templates, ops, cmss = CMSS) {
  if ('error' in templates) return { error: templates.error }
  const pins = pinsOf(ops)
  return Object.fromEntries(
    cmss.map((cms) => {
      const offered = offeredOn(templates, [cms])
      const pinned = offered.find(({ p }) => p.tag === pins[cms]?.tag)
      return [
        cms,
        {
          pinned: pinned ? { design: pinned.card.id, quickstart: pinned.p.tag } : null,
          templates: offered.map(({ card, p }) => ({
            design: card.id,
            quickstart: p.tag,
            label: typeof card.label === 'string' && card.label ? card.label : card.id
          }))
        }
      ]
    })
  )
}

function shape({ card, p }, reason) {
  return {
    platform: p.platform,
    quickstart: p.tag,
    design: card.id,
    version: typeof p.version === 'string' && p.version ? p.version : 'unversioned',
    label: card.label ?? null,
    ...(p.release ? { release: p.release } : {}),
    // The design system a site built from this archive wears (`templateCards` `wears`): the brief names it so
    // the agent is told who keeps the look; the site's own record is written by the create door, not from here.
    designSystem: p.wears ?? null,
    reason
  }
}

// Only the card's id, label and blurb are read: other card fields (layouts…) name demo pages, not the trade.
const cardText = ({ card }) => [card.id, card.label, card.card?.blurb].filter(Boolean).join(' ')

/** Index of the first `FIT_TIERS` row a pair matches; `FIT_TIERS.length` when none does. */
function tierOf(o) {
  const tier = FIT_TIERS.findIndex(
    ([reason, re]) =>
      re.test(cardText(o)) && (reason === 'restaurant-match' || !OTHER_TRADE.test(cardText(o)))
  )
  return tier === -1 ? FIT_TIERS.length : tier
}

/** The best restaurant fit among the offered cards (`FIT_TIERS`), else the first one. */
function fitTemplate(offered) {
  if (offered.length === 0) return { status: 'unavailable', reason: 'NO_TEMPLATE_FOR_CMS' }
  const best = Math.min(...offered.map(tierOf))
  if (best === FIT_TIERS.length) return shape(offered[0], 'first-available')
  return shape(
    offered.find((o) => tierOf(o) === best),
    FIT_TIERS[best][0]
  )
}

// The words a place kind (`place-kinds.mjs` KINDS) looks for in a card of the best tier: a bar takes the
// restaurant-and-bar template over a plain restaurant one, a cafe the diner before the fine-dining one.
const KIND_WORDS = Object.freeze({
  restaurants: /restaurant|dining|bistro|diner/i,
  cafes: /caf[eé]|coffee|\btea\b|brunch|diner/i,
  'fast-food': /diner|burger|fast[- ]food|takeaway/i,
  bakeries: /baker|pastr|caf[eé]|coffee|dessert/i,
  bars: /\bbar\b|\bpub\b|cocktail|\bwine\b|drink/i,
  nightlife: /\bbar\b|\bpub\b|cocktail|nightlife|club|drink/i
})

// What a card says when it is made for one trade (`trades.mjs` TRADES of the Website Opportunities domain), in the
// order a card is read: a card naming one is that trade's, the first tier for a business of it and left out for
// any other. `editorial` (a blog or a magazine), `music` (a band, a podcast) and `personal` (a resume) are no
// business's trade, so their cards are left out for all; a charity says "events", so nonprofit comes first.
const TRADE_WORDS = Object.freeze([
  ['editorial', /\bblog and magazine\b|\bmagazine\b|editorial|publication/i],
  ['music', /\bband\b|album|podcast|radio|concert|tracklist/i],
  ['personal', /\bresume\b|personal (?:site|portfolio)|biography/i],
  ['food', FIT_TIERS[0][1]],
  ['nonprofit', /charity|non-?profit|donat|volunteer/i],
  ['events', /\bevents? (?:venue|planner|agency)|wedding|\bvenue\b/i],
  ['beauty', /beauty|\bspa\b|salon|massage|wellness|cosmetic/i],
  ['health', /hospital|clinic|medical|dental|dentist|health ?care|doctor|pharmacy/i],
  // A boxing studio says "boxing" and "workout", not "gym" (dev catalogue 26/10/2026: JA Boxing matched no trade);
  // a tennis or padel coach names the sport. Measured on the 32 dev cards: these words match JA Boxing only.
  [
    'fitness',
    /\bgym\b|fitness|yoga|pilates|sports? club|boxing|martial arts?|workout|tennis|padel|swimming|personal train(?:ing|er)|coaching/i
  ],
  ['hospitality', /hotel|resort|hospitality|lodging|guest ?house|\binn\b/i],
  ['travel', /travel|\btours?\b|\btrips?\b|destination/i],
  ['professional', /\blaw\b|legal|accounting|consult|finance|insurance|recruit|real estate|corporate/i],
  // A web design, software or digital agency is a trade of its own: a "business site template" made for one (Tracy
  // Base) is not a template for any business (local stand 24/10/2026: suggested to a bakery).
  [
    'creative',
    /portfolio|design studio|creative|photograph|\bstudio\b|web design|digital agency|design agency|software|developer|\bagency\b/i
  ],
  ['education', /education|\bcourses?\b|school|learning|academy|tutor/i],
  ['retail', /e-?commerce|\bshop\b|\bstore\b|retail/i],
  ['auto', /\bcars?\b|automotive|vehicle/i],
  [
    'home',
    /plumb|electrician|roofing|contractor|locksmith|cleaning service|landscap|\bhvac\b|handyman|moving company|painting service/i
  ]
])
// Templates made for no one trade, for a business whose own trade no card names: one tier, so the account's
// Default CMS decides between them and places spread over them (a small-business card is not better than a
// multipurpose one, and one of them exists on one CMS only).
const GENERIC = /small[- ]business|local business|multi-?purpose|\bbusiness\b/i

/** The trades a business can be (`trades.mjs` TRADES); `editorial`, `music` and `personal` are none. */
const BUSINESS_TRADES = new Set(
  TRADE_WORDS.map(([trade]) => trade).filter((t) => !['editorial', 'music', 'personal'].includes(t))
)

/**
 * A business's trade from its own words — its name, its description — when neither Google's types nor its website's
 * schema.org type said one: the first trade whose words they hold, else `other`. Measured 24/10/2026 on a local stand:
 * "Flour Bakery", researched by its link alone, was `other` and was suggested an agency's template.
 * @param {...unknown} texts
 * @returns {string}
 */
export function tradeOfWords(...texts) {
  const text = texts.filter((t) => typeof t === 'string' && t.trim()).join(' \n ')
  if (!text) return 'other'
  for (const [trade, re] of TRADE_WORDS) if (BUSINESS_TRADES.has(trade) && re.test(text)) return trade
  return 'other'
}

/** The card's trade-made-for, or null for a card made for no single trade. */
function cardTrade(o) {
  const text = cardText(o)
  // A multipurpose template is made for no one trade, whatever words its demo copy uses.
  if (/multi-?purpose/i.test(text)) return null
  for (const [trade, re] of TRADE_WORDS) if (re.test(text)) return trade
  return null
}

/** The tier of a pair for a business of `trade` (not food): 0 its own trade's cards, 1 generic ones, 2 the rest. */
function tradeTierOf(o, trade) {
  const made = cardTrade(o)
  if (made === trade) return 0
  // Generic is read in the card's description only: a name is not a promise (owner, 26/10/2026: "Tracy Business"
  // describes an industrial infrastructure company and fits no sports club).
  return made === null && GENERIC.test(o.card?.card?.blurb ?? '') ? 1 : 2
}

/**
 * How the template picker groups the cards for a business of `trade` (`tradeTierOf`): `recommended` holds the ids of
 * the cards made for that trade (tier 0), `generic` the cards made for no single trade that suit any business
 * (tier 1); every other card is the rest, in the catalogue's own order. Null when the trade is unknown (`other`, none,
 * or not a business's trade): the picker then shows the catalogue as it is. Each id once, in card order.
 * @param {{ cards: any[] } | { error: string }} templates
 * @param {string | null | undefined} trade
 * @returns {{ trade: string, recommended: string[], generic: string[] } | null}
 */
export function templateRanking(templates, trade) {
  if (!templates || 'error' in templates || typeof trade !== 'string' || !BUSINESS_TRADES.has(trade))
    return null
  const recommended = []
  const generic = []
  for (const card of templates.cards) {
    if (typeof card?.id !== 'string' || recommended.includes(card.id) || generic.includes(card.id)) continue
    const tier = tradeTierOf({ card }, trade)
    if (tier === 0) recommended.push(card.id)
    else if (tier === 1) generic.push(card.id)
  }
  return { trade, recommended, generic }
}

/**
 * The template Tracy picks when the customer leaves the choice to it (`selection: {auto: true}`), across
 * every CMS the cards offer. A restaurant (`trade` food or none): the best `FIT_TIERS` tier, then the cards of
 * that tier naming the place's kind. Any other trade: the cards made for that trade, else a template made for no
 * single trade (small business, multipurpose or business, one tier), never one made for another trade unless nothing
 * else is offered. Then the account's own Default CMS when that tier has it there. Equal candidates are told
 * apart by `seed` (the opportunity id), so a list of places does not all come out on one template, while the
 * same place always gets the same answer.
 * @param {{ cards: any[] } | { error: string }} templates
 * @param {{ kind?: string | null, trade?: string | null, preferredCms?: string | null, seed?: string, cmss?: string[] }} [want]
 */
export function autoTemplate(
  templates,
  { kind = null, trade = null, preferredCms = null, seed = '', cmss = CMSS } = {}
) {
  if ('error' in templates) return { status: 'unavailable', reason: templates.error }
  const offered = offeredOn(templates, cmss)
  if (offered.length === 0) return { status: 'unavailable', reason: 'NO_TEMPLATE_FOR_CMS' }
  const food = !trade || trade === 'food' || trade === 'other'
  const tierFor = food && trade !== 'other' ? tierOf : (o) => tradeTierOf(o, trade)
  const best = Math.min(...offered.map(tierFor))
  let candidates = offered.filter((o) => tierFor(o) === best)
  const tierName =
    food && trade !== 'other'
      ? best === FIT_TIERS.length
        ? 'first-available'
        : FIT_TIERS[best][0]
      : best === 0
        ? `trade-match:${trade}`
        : best === 1
          ? 'business-match'
          : 'first-available'
  const reason = [`auto:${tierName}`]
  const words = food ? KIND_WORDS[kind] : null
  const kindHits = words ? candidates.filter((o) => words.test(cardText(o))) : []
  if (kindHits.length) {
    candidates = kindHits
    reason.push(`kind:${kind}`)
  }
  const mine = candidates.filter((o) => o.p.platform === preferredCms)
  if (mine.length) {
    candidates = mine
    reason.push(`cms:${preferredCms}`)
  }
  const ordered = candidates.toSorted((a, b) =>
    `${a.card.id}\u0000${a.p.platform}`.localeCompare(`${b.card.id}\u0000${b.p.platform}`)
  )
  const digest = createHash('sha256').update(String(seed)).digest()
  return shape(ordered[digest.readUInt32BE(0) % ordered.length], reason.join(';'))
}

/**
 * The account's Default CMS; with none chosen, the deployment's (`/ops/wo` `defaultCms`) before the
 * domain's own default. `cmsSource` stays `default` either way: the account chose nothing.
 */
export function resolveRevisionCms(domain, pref, at, ops) {
  const resolved = domain.resolveCms(pref, at)
  const deployment = ops?.defaultCms
  if (resolved.cmsSource !== 'default' || !domain.CMS?.includes?.(deployment)) return resolved
  return { ...resolved, cms: deployment }
}

/**
 * Advisory key serialising a preference write against revisions reading it (absent row included).
 * 🔒 The same text as `website-opportunities/src/store.js` `preferenceLockSql`, which `lib/` cannot import (a test pins them equal).
 */
export const PREFERENCE_LOCK_SQL = `hashtextextended('wo_preference:' || $1::text, 0)`

/**
 * The cards of this app's own `GET /api/templates`, or `{error}`: what both the open doors and the
 * builder read templates through (`request` is the app's own door, `origin` its origin).
 */
export async function readTemplateCards(request, origin) {
  try {
    const res = await request('/api/templates', { headers: { origin } })
    const data = res.ok ? await res.json() : null
    return Array.isArray(data?.templates) ? { cards: data.templates } : { error: 'TEMPLATES_UNREADABLE' }
  } catch {
    return { error: 'TEMPLATES_UNREADABLE' }
  }
}
