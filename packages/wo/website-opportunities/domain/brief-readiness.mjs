// Whether a brief is ready to build a site from (#50, spec #38): measured checks and one verdict, computed beside brief
// validation and stored on the revision. A build reads the verdict: `block` stops it and asks the owner or researches
// again, `warn` builds and carries owner questions, `pass` builds.
//
// 🔒 UNLABELLED IS NOT GENERAL. A photo no model looked at and no words linked carries depicts "general" with evidence
// `{via: 'none'}`: it counts as unlabelled, never as a photo someone decided shows nothing in particular.
// 🔒 UNKNOWN IS NEVER A PASS. A check that cannot be measured (the template's content kinds before a template is chosen)
// is `unknown`: it is listed, and it never makes the verdict better or worse.
import { GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { closedListOf, GENERAL } from './pictures/picture-links.mjs'
import { creditRequiredOf } from './pictures/asset-origin.mjs'
import { itemKindsOfBrief, ownerQuestionsOf, routesOfBrief } from './brief-item-routes.mjs'

export const BRIEF_READINESS_VERSION = 'brief-readiness/1'
/** The edges of each measured check (spec #38): at or above `pass` passes, at or above `warn` warns, under it blocks. */
export const READINESS_THRESHOLDS = Object.freeze({
  'own-usable-photos': Object.freeze({ pass: 8, warn: 4 }),
  'labelled-share': Object.freeze({ pass: 0.9, warn: 0.6 }),
  'hero-candidates': Object.freeze({ pass: 2, warn: 1 }),
  // Light gaps: under `warn` still warns, it never blocks.
  'offerings-with-photo': Object.freeze({ pass: 0.6, warn: 0.3 }),
  'offerings-with-description': Object.freeze({ pass: 0.8, warn: 0.5 })
})
const RANK = { pass: 0, warn: 1, block: 2 }
/** A photo this small is a thumbnail at most (`resolutionGradeOf`): not usable on a site. */
const USABLE_QUALITY = new Set(['high', 'medium'])
const NOT_A_PHOTO = new Set(['logo', 'text-graphic'])

const list = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const ratio = (n, of) => (of > 0 ? Math.round((n / of) * 1000) / 1000 : null)
/** pass / warn / block by the edges; `floor` is the verdict under `warn` (light gaps never block). */
const graded = (value, { pass, warn }, floor = 'block') =>
  value >= pass ? 'pass' : value >= warn ? 'warn' : floor
const isLabelled = (a) => nonEmpty(a?.depicts?.evidence?.via) && a.depicts.evidence.via !== 'none'

/** The brief's photographs: its images that are neither the brand's logo nor a picture a model called a logo. */
function photosOf(brief) {
  const logo = brief?.brand?.logo
  return list(brief?.assets).filter((a) => a?.kind === 'image' && a.id !== logo && a.content !== 'logo')
}

/** An own photo a site can show: the business published it, it is no graphic, and it is not a thumbnail. */
const ownUsable = (a) =>
  a.isOwnPhoto === true &&
  a.isGraphic !== true &&
  USABLE_QUALITY.has(a.quality) &&
  !NOT_A_PHOTO.has(a.content)

const ASK_PHOTOS = (n) =>
  `Can you send more photos of your business, your place, your team and what you offer? Only ${n} usable photo${n === 1 ? '' : 's'} of your own ${n === 1 ? 'was' : 'were'} found.`

/** The group kinds a brief can fill a card of (`GROUP_KINDS_V3`), from the items it holds. */
export function heldKindsOf(brief) {
  const kinds = itemKindsOfBrief(brief)
  const has = (...k) => k.some((x) => (kinds.get(x) ?? 0) > 0)
  const closed = closedListOf(brief?.reading)
  const held = new Set(['business', 'contact'])
  if (has('menu-item', 'section.dishes', 'content.dish', 'content.product')) held.add('menu_item')
  if (closed.offerings.length || has('service', 'content.service')) held.add('service')
  if (closed.people.length) held.add('person')
  if (has('social-figure')) held.add('stat_item')
  if (has('review')) held.add('quote')
  if (has('content.event', 'content.offer', 'section.events', 'section.offers')) held.add('event')
  if (has('section.posts', 'content.news')) held.add('post')
  if (photosOf(brief).some((a) => a.isGraphic !== true)) held.add('gallery')
  return held
}

/**
 * The readiness of a brief (pure). `templateKinds`: the group kinds the chosen template's cards hold; without it the
 * template check is `unknown` (a brief names no template). Each check `{id, verdict, measured, remedy?, questions?}`;
 * `verdict` is the worst measured one; `next` says what the build does; `ownerQuestions` holds every check's questions
 * and the brief's withheld facts (`ownerQuestionsOf`).
 * @param {any} brief
 * @param {{templateKinds?: string[] | null}} [opts]
 */
export function briefReadinessOf(brief, { templateKinds = null } = {}) {
  const T = READINESS_THRESHOLDS
  const assets = list(brief?.assets)
  const photos = photosOf(brief)
  const closed = closedListOf(brief?.reading)
  const checks = []

  const own = photos.filter(ownUsable).length
  const ownVerdict = graded(own, T['own-usable-photos'])
  checks.push({
    id: 'own-usable-photos',
    verdict: ownVerdict,
    measured: { count: own },
    remedy: 'owner',
    questions:
      ownVerdict === 'pass' ? [] : [{ id: 'owner.photos', field: 'photos', question: ASK_PHOTOS(own) }]
  })

  const labelled = photos.filter(isLabelled).length
  const share = ratio(labelled, photos.length) ?? 0
  checks.push({
    id: 'labelled-share',
    verdict: graded(share, T['labelled-share']),
    measured: { labelled, photos: photos.length, share },
    remedy: 'research'
  })

  const unsourced = assets.filter((a) => !nonEmpty(a?.source) || a.source === 'unknown').map((a) => a.id)
  const uncredited = assets
    .filter((a) => typeof a?.credit !== 'string' || (creditRequiredOf(a) && a.credit.trim() === ''))
    .map((a) => a.id)
  checks.push({
    id: 'source-and-credit',
    verdict: unsourced.length || uncredited.length ? 'block' : 'pass',
    measured: { assets: assets.length, unsourced, uncredited },
    remedy: 'research'
  })

  const hero = list(brief?.sitemap)
    .flatMap((p) => list(p?.sections))
    .find((s) => s?.kind === 'hero')
  const heroes = list(hero?.heroCandidates).length
  const heroVerdict = graded(heroes, T['hero-candidates'])
  checks.push({
    id: 'hero-candidates',
    verdict: heroVerdict,
    measured: { count: heroes },
    remedy: 'owner',
    questions:
      heroVerdict === 'pass'
        ? []
        : [
            {
              id: 'owner.hero',
              field: 'hero',
              question:
                'Can you send a wide, sharp photo of your place or your work to open your site with? Too few were found.'
            }
          ]
  })

  const offerings = closed.offerings
  const depicted = new Set(assets.map((a) => a?.depicts?.id).filter((id) => id && id !== GENERAL))
  const unphotographed = offerings.filter((o) => !depicted.has(o.id))
  checks.push({
    id: 'offerings-with-photo',
    verdict: offerings.length
      ? graded(
          ratio(offerings.length - unphotographed.length, offerings.length),
          T['offerings-with-photo'],
          'warn'
        )
      : 'pass',
    measured: {
      offerings: offerings.length,
      linked: offerings.length - unphotographed.length,
      share: ratio(offerings.length - unphotographed.length, offerings.length)
    },
    remedy: 'owner',
    questions: questionOf(
      'owner.offering-photos',
      'offering-photos',
      unphotographed,
      (names) => `Can you send a photo of each of these: ${names}? No photo of them was found.`
    )
  })

  const described = new Set(
    list(brief?.reading?.services)
      .filter((s) => list(s?.mentions).length > 0 || nonEmpty(s?.description))
      .map((s) => s.id)
  )
  const undescribed = offerings.filter((o) => !described.has(o.id))
  checks.push({
    id: 'offerings-with-description',
    verdict: offerings.length
      ? graded(
          ratio(offerings.length - undescribed.length, offerings.length),
          T['offerings-with-description'],
          'warn'
        )
      : 'pass',
    measured: {
      offerings: offerings.length,
      described: offerings.length - undescribed.length,
      share: ratio(offerings.length - undescribed.length, offerings.length)
    },
    remedy: 'owner',
    questions: questionOf(
      'owner.offering-descriptions',
      'offering-descriptions',
      undescribed,
      (names) =>
        `How would you describe each of these in a sentence or two: ${names}? No description of them was found.`
    )
  })

  const portrayed = new Set(assets.map((a) => a?.portraitOf?.id).filter(Boolean))
  const unportrayed = closed.people.filter((p) => !portrayed.has(p.id))
  checks.push({
    id: 'people-with-portrait',
    verdict: unportrayed.length ? 'warn' : 'pass',
    measured: { people: closed.people.length, portrayed: closed.people.length - unportrayed.length },
    remedy: 'owner',
    questions: questionOf(
      'owner.portraits',
      'portraits',
      unportrayed,
      (names) => `Can you send a portrait photo of ${names}? None was found.`
    )
  })

  const { unrouted } = routesOfBrief(brief)
  checks.push({
    id: 'items-routed',
    verdict: unrouted.length ? 'warn' : 'pass',
    measured: { unrouted: unrouted.map((u) => u.kind) }
  })

  checks.push(templateKindsCheck(brief, templateKinds))

  const measured = checks.filter((c) => c.verdict !== 'unknown')
  const verdict = measured.reduce((worst, c) => (RANK[c.verdict] > RANK[worst] ? c.verdict : worst), 'pass')
  const blocking = measured.filter((c) => c.verdict === 'block')
  const next =
    verdict === 'pass'
      ? 'build'
      : verdict === 'warn'
        ? 'build-and-ask'
        : blocking.some((c) => c.remedy === 'research')
          ? 'research-again'
          : 'ask-owner'
  const ownerQuestions = []
  const seen = new Set()
  for (const q of [...checks.flatMap((c) => c.questions ?? []), ...ownerQuestionsOf(brief)]) {
    if (seen.has(q.id)) continue
    seen.add(q.id)
    ownerQuestions.push(q)
  }
  return { version: BRIEF_READINESS_VERSION, verdict, next, checks, ownerQuestions }
}

/** One question naming the items it is about, or none when every item is covered. */
function questionOf(id, field, items, ask) {
  if (!items.length) return []
  const names = items.map((i) => i.label)
  return [{ id, field, question: ask(names.join(', ')), items: names }]
}

/** Whether the brief holds something for every kind of card the template shows: `block` when it does not. */
function templateKindsCheck(brief, templateKinds) {
  if (!Array.isArray(templateKinds))
    return { id: 'template-kinds', verdict: 'unknown', measured: { why: 'no template chosen yet' } }
  const held = heldKindsOf(brief)
  const missing = [...new Set(templateKinds)].filter(
    (k) => !(GROUP_KINDS_V3[k]?.allowedKinds ?? [k]).some((a) => held.has(a))
  )
  return {
    id: 'template-kinds',
    verdict: missing.length ? 'block' : 'pass',
    measured: { needed: [...new Set(templateKinds)], missing },
    remedy: 'owner',
    questions: missing.length
      ? [
          {
            id: 'owner.template-kinds',
            field: 'template-kinds',
            question: `The chosen design shows ${missing.join(', ').replace(/_/g, ' ')} items, and none were found. Can you tell us about them?`,
            items: missing
          }
        ]
      : []
  }
}
