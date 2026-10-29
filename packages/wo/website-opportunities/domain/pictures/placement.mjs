// Which collected picture goes into which demo picture's place, and why — or why none does.
//
//   tier 1  hero, slideshow, banner, background: one at a time, strictest first
//   tier 2  sections with a subject (dishes, about, call to action): the cluster with the fewest fitting pictures
//           chooses first, and inside a cluster (seven dishes of one menu section) the best assignment as a whole
//   tier 3  gallery, small section pictures, article pictures
//
// 🔒 HARD CONSTRAINTS, NOT SCORES (plan §7 C9, C10): the crop that keeps the demo's shape must not need more than
// `MAX_SCALE` to reach the role's target size; a picture that reads as a graphic (poster, menu board, text on a flat
// ground) never takes a place that carries words over it; a picture is never shown twice on one page, nor a near-copy of
// one already there.
// 🔒 NO DEMO PICTURE OF ANOTHER RESTAURANT BESIDE THE REAL ONES (C6): a content place nothing fits is answered
// `placeholder` (a neutral picture in the brand's colours), never left with the demo's photo and never given a picture of
// another subject. Only space pictures (an about, a call to action, a background) may repeat a picture of the inside or the
// outside that another page already shows.
// Deterministic: the same groups and labels give the same plan; ties break on ids, never on time or a database's order.
import { foldWords } from './slot-map.mjs'

export const PLANNER_VERSION = 1
/** The most a crop may be enlarged to reach its role's target (C9). */
export const MAX_SCALE = 1.25
/** The most of a picture a crop may cut away; past `CROP_WARN` the score pays for it. */
const CROP_MAX_LOSS = 0.5
const CROP_WARN = 0.35
/** The most an output's width / height may differ from the demo's, in absolute terms: a sealed site refuses past 0.02. */
const ASPECT_TOLERANCE = 0.005

const SPACE = {
  interior: 1,
  exterior: 1,
  room: 1,
  equipment: 0.9,
  people: 0.7,
  'service-in-action': 0.7,
  food: 0.6,
  'work-result': 0.6,
  product: 0.6,
  drink: 0.5,
  dessert: 0.4,
  event: 0.5
}
/** What each role wants, by subject (0..1), its tier, its target width, and its rules. */
export const ROLES = Object.freeze({
  hero: {
    tier: 1,
    min: 1400,
    want: {
      exterior: 1,
      interior: 1,
      room: 1,
      equipment: 0.9,
      food: 0.75,
      'work-result': 0.75,
      product: 0.7,
      'service-in-action': 0.6,
      drink: 0.6,
      dessert: 0.5,
      people: 0.35,
      event: 0.3
    },
    noText: true,
    lit: true
  },
  banner: {
    tier: 1,
    min: 1000,
    want: {
      interior: 1,
      exterior: 1,
      room: 1,
      equipment: 0.9,
      food: 0.8,
      'work-result': 0.8,
      product: 0.75,
      'service-in-action': 0.65,
      drink: 0.7,
      dessert: 0.6,
      people: 0.4,
      event: 0.4
    },
    noText: true,
    lit: true
  },
  background: {
    tier: 1,
    min: 1000,
    want: {
      interior: 1,
      exterior: 1,
      room: 1,
      equipment: 0.9,
      food: 0.7,
      'work-result': 0.7,
      product: 0.65,
      'service-in-action': 0.5,
      drink: 0.7,
      dessert: 0.5,
      people: 0.3,
      event: 0.4
    },
    noText: true,
    lit: true,
    space: true
  },
  'section-main': { tier: 2, min: 1000, want: { ...SPACE, people: 0.9 }, noText: true, space: true },
  cta: { tier: 2, min: 600, want: SPACE, noText: true, space: true },
  dish: {
    tier: 2,
    min: 600,
    want: {
      food: 1,
      'work-result': 1,
      product: 1,
      'service-in-action': 0.85,
      dessert: 0.9,
      drink: 0.8
    },
    strict: true,
    topical: true
  },
  gallery: {
    tier: 3,
    min: 600,
    want: {
      food: 1,
      'work-result': 1,
      product: 1,
      drink: 1,
      dessert: 1,
      interior: 1,
      exterior: 1,
      room: 1,
      equipment: 0.9,
      'service-in-action': 0.9,
      people: 0.8,
      event: 0.8,
      unknown: 0.5
    },
    noText: true
  },
  'section-sub': { tier: 3, min: 600, want: { ...SPACE, unknown: 0.3 }, noText: true },
  section: { tier: 3, min: 600, want: { ...SPACE, unknown: 0.3 }, noText: true },
  article: {
    tier: 3,
    min: 600,
    want: {
      ...SPACE,
      food: 0.9,
      'work-result': 0.9,
      product: 0.9,
      'service-in-action': 0.8,
      drink: 0.8,
      event: 0.8,
      unknown: 0.3
    },
    noText: true
  },
  video: { tier: 3, min: 600, want: { ...SPACE, unknown: 0.3 }, noText: true }
})
/** How much a subject guess is trusted, by where it came from. */
const TRUST = { vision: 1, words: 0.7, none: 0.4 }
/** Topic words of a section that name a subject a picture should have (`Icream and Juice`). */
const TOPIC_SUBJECT = {
  icream: 'dessert',
  ice: 'dessert',
  cream: 'dessert',
  dessert: 'dessert',
  desserts: 'dessert',
  cake: 'dessert',
  juice: 'drink',
  drinks: 'drink',
  drink: 'drink',
  cocktail: 'drink',
  cocktails: 'drink',
  wine: 'drink',
  beer: 'drink',
  coffee: 'drink',
  sea: 'food',
  seafood: 'food',
  food: 'food',
  grill: 'food',
  starters: 'food',
  mains: 'food'
}

/** The largest box of `aspect` inside `width × height`, in whole pixels. */
export function cropBox(width, height, aspect) {
  let w = width
  let h = Math.round(width / aspect)
  if (h > height) {
    h = height
    w = Math.round(height * aspect)
  }
  return { width: w, height: h, loss: 1 - (w * h) / (width * height) }
}

/**
 * The size a crop is written at: no larger than the crop (never enlarged) nor than the demo, in whole pixels whose shape is
 * within `ASPECT_TOLERANCE` (absolute) of the demo's. Null when no such pair exists.
 */
export function outputSize(crop, aspect, demoWidth) {
  for (let w = Math.min(crop.width, demoWidth ?? crop.width); w >= 16; w -= 1) {
    const h = Math.round(w / aspect)
    if (h > 0 && h <= crop.height && Math.abs(w / h - aspect) <= ASPECT_TOLERANCE)
      return { width: w, height: h }
  }
  return null
}

/**
 * Whether a picture of `size` can take a frame of the demo's shape at all, by the planner's hard limits alone (C9): the
 * crop that keeps the demo's shape loses at most `CROP_MAX_LOSS` of the picture, is enlarged at most `MAX_SCALE` to reach
 * `min` (the role's target width, never more than the demo's), and has a whole-pixel output of the demo's shape. What the
 * picture shows is not judged here; `fitOf` adds that. Null when no such crop exists.
 * @param {{width: number, height: number}} size - the picture's
 * @param {{width: number, height: number}} demo - the frame's (the demo picture's, or the box it is drawn in)
 * @param {{min?: number}} [opts]
 * @returns {{aspect: number, box: {width: number, height: number, loss: number}, output: {width: number, height: number}, scale: number} | null}
 */
export function shapeFit(size, demo, { min = ROLES.section.min } = {}) {
  if (!size?.width || !size?.height || !demo?.width || !demo?.height) return null
  const aspect = demo.width / demo.height
  const box = cropBox(size.width, size.height, aspect)
  if (box.loss > CROP_MAX_LOSS) return null
  const scale = Math.min(demo.width, min) / box.width
  if (scale > MAX_SCALE) return null
  const output = outputSize(box, aspect, demo.width)
  if (!output) return null
  return { aspect, box, output, scale }
}

/**
 * The crop recipe that cuts a picture of `size` to the demo's shape, keeping its subject where its label says (`focus`,
 * subject), else by attention. Null when `shapeFit` says no crop is acceptable.
 * @param {{width: number, height: number}} size
 * @param {{width: number, height: number}} demo
 * @param {{min?: number, label?: object}} [opts]
 */
export function fitCrop(size, demo, { min, label = {} } = {}) {
  const fit = shapeFit(size, demo, min === undefined ? {} : { min })
  if (!fit) return null
  const strategy =
    label.focus || label.subject
      ? cropStrategy({ focus: label.focus, subject: label.subject })
      : { strategy: 'attention' }
  return {
    aspect: Number(fit.aspect.toFixed(6)),
    source: { width: fit.box.width, height: fit.box.height },
    output: fit.output,
    ...strategy
  }
}

function cropStrategy(label) {
  if (label.focus && label.focus !== 'center') return { strategy: 'anchor', anchor: label.focus }
  if (['food', 'drink', 'dessert', 'work-result', 'product'].includes(label.subject))
    return { strategy: 'attention' }
  if (['people', 'service-in-action'].includes(label.subject))
    return { strategy: 'anchor', anchor: 'centre-low' }
  return { strategy: 'centre' }
}

/** The subject a section's own words ask for, or null (`Sea food` → food). */
function topicSubject(topic) {
  for (const w of topic) if (TOPIC_SUBJECT[w]) return TOPIC_SUBJECT[w]
  return null
}

/**
 * Whether `label` may take `group`'s place, and how well. Null when a hard constraint says no.
 * @returns {{score: number, crop: object, why: string} | null}
 */
export function fitOf(label, group) {
  const role = ROLES[group.role] ?? ROLES.section
  const shape = shapeFit(label, group.demo, { min: role.min })
  if (!shape) return null
  const { aspect, box, output, scale } = shape
  const targetW = Math.min(group.demo.width, role.min)
  if (label.collage) return null
  // A picture the vision model calls a graphic (a flyer, a banner, a logo) takes no photo place of any role (#48).
  if (label.isGraphic) return null
  if (role.noText && (label.graphic || label.textPresence === 'present')) return null
  if (['logo', 'menu-board', 'poster'].includes(label.subject)) return null
  // Without a look at it, a picture whose words cannot be ruled out is a hero only when wide enough to be a photograph (C10).
  if (group.role === 'hero' && label.textPresence === 'unknown' && label.aspect < 1.35) return null
  if (label.quality !== 'unknown' && label.quality !== 'good' && role.tier === 1) return null
  const want = role.want[label.subject] ?? 0
  if (want <= 0) return null
  const wanted = topicSubject(group.topic)
  // A section that names its subject takes that subject only: a steak is not an ice cream (C13).
  if (role.strict && (label.subjectFrom === 'none' || (wanted && label.subject !== wanted))) return null
  const trust = TRUST[label.subjectFrom] ?? TRUST.none
  let score = 4 * want * trust
  score += 1.5 * (1 - box.loss) - (box.loss > CROP_WARN ? 1.5 : 0)
  score += Math.min(1, box.width / targetW)
  const topicHits = group.topic.filter((w) => label.words.includes(w)).length
  score += Math.min(1, topicHits * 0.5) + (wanted && label.subject === wanted ? 0.8 : 0)
  if (label.quality === 'good') score += 0.5
  // Words on a dish photo (a watermark, a flyer) are allowed where nothing cleaner fits, never preferred.
  if (label.textPresence === 'present') score -= 1
  if (label.heroWorthy === true && role.tier === 1) score += 1
  // A photo shown to be of a menu dish is that dish's card picture before any other food photo.
  if (label.dish && group.role === 'dish') score += 3
  if (role.lit && label.centreLuminance !== null) {
    if (label.centreLuminance > 0.78) score -= 2
    else if (label.centreLuminance >= 0.2 && label.centreLuminance <= 0.65) score += 0.5
  }
  // A rare wide picture spent on a square place is a hero lost (C5).
  if (role.tier > 1 && aspect < 1.2 && label.aspect >= 1.35 && label.width >= ROLES.hero.min / MAX_SCALE)
    score -= 0.8
  const why = `${label.subject} (${label.subjectFrom})${label.dish ? `, photo of ${JSON.stringify(label.dish)}` : ''}${wanted ? `, section asks ${wanted}` : ''}, crop keeps ${Math.round((1 - box.loss) * 100)}%, ${scale > 1 ? `${scale.toFixed(2)}× enlarged` : 'no enlargement'}`
  return {
    score: Number(score.toFixed(4)),
    crop: {
      aspect: Number(aspect.toFixed(6)),
      source: { width: box.width, height: box.height },
      output,
      ...cropStrategy(label)
    },
    why
  }
}

/** Max-score assignment of rows to columns (Hungarian, on costs), every row taking a distinct column or none. */
function assign(scores) {
  const n = scores.length
  const m = scores[0]?.length ?? 0
  if (n === 0 || m === 0) return []
  const size = Math.max(n, m)
  const BIG = 1e6
  const cost = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      i < n && j < m && scores[i][j] !== null ? -scores[i][j] : i < n && j < m ? BIG : 0
    )
  )
  const u = Array.from({ length: size + 1 }, () => 0)
  const v = Array.from({ length: size + 1 }, () => 0)
  const p = Array.from({ length: size + 1 }, () => 0)
  const way = Array.from({ length: size + 1 }, () => 0)
  for (let i = 1; i <= size; i += 1) {
    p[0] = i
    let j0 = 0
    const minv = Array.from({ length: size + 1 }, () => Infinity)
    const used = Array.from({ length: size + 1 }, () => false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= size; j += 1) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= size; j += 1) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const out = Array.from({ length: n }, () => -1)
  for (let j = 1; j <= size; j += 1)
    if (p[j] >= 1 && p[j] <= n && j <= m && scores[p[j] - 1][j - 1] !== null) out[p[j] - 1] = j - 1
  return out
}

/** @typedef {string | {space: true} | null} Bound */
/** The subjects a picture of the place's space has. */
const SPACE_SUBJECTS = new Set(['interior', 'exterior', 'room'])

/**
 * A bound picture in its own card: the role's fit when it passes, else the crop that keeps the demo's shape, never enlarged.
 * Null when no output of the demo's shape exists.
 */
function boundFit(label, group) {
  const fit = fitOf(label, group)
  if (fit) return fit
  if (!group.demo || !label.width || !label.height) return null
  const aspect = group.demo.width / group.demo.height
  const box = cropBox(label.width, label.height, aspect)
  const output = outputSize(box, aspect, group.demo.width)
  if (!output) return null
  return {
    score: 0,
    crop: {
      aspect: Number(aspect.toFixed(6)),
      source: { width: box.width, height: box.height },
      output,
      ...cropStrategy(label)
    },
    why: `the photo of this card's own entity, crop keeps ${Math.round((1 - box.loss) * 100)}%`
  }
}

/**
 * @param {{groups: ReturnType<import('./slot-map.mjs').slotMap>['groups'], labels: ReturnType<import('./picture-labels.mjs').labelPicture>[], clusterOf?: Map<string, number>, bound?: Map<string, Bound> | Record<string, Bound>}} input
 *   `bound`: slot key → the picture id of the entity its card shows (a slot plan's `depicts`), `{space: true}` when that
 *   entity has none and the card may show the place's own inside or outside (a team member), or null: the placeholder.
 *   🔒 A BOUND CARD SHOWS ITS OWN ENTITY'S PICTURE, THE PLACE'S SPACE OR THE PLACEHOLDER (plan §7): never another dish's photo.
 * @returns {{version: number, placements: Array<{groupId: string, mediaId: string, score: number, crop: object, why: string, reused: boolean}>, unfilled: Array<{groupId: string, role: string, routes: string[], reason: string, action: 'placeholder'}>, unused: string[]}}
 */
export function planPlacement({ groups, labels, clusterOf = new Map(), bound = new Map() }) {
  const binding = bound instanceof Map ? bound : new Map(Object.entries(bound ?? {}))
  const pictures = [...labels].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const identity = (label) => (clusterOf.has(label.id) ? `c${clusterOf.get(label.id)}` : `m${label.id}`)
  /** routes each picture (by near-copy cluster) already shows on */
  const shownOn = new Map()
  const usedIds = new Set()
  const placements = []
  const unfilled = []

  const allowed = (label, group) => {
    const seen = shownOn.get(identity(label))
    if (!seen) return true
    if (group.routes.some((r) => seen.has(r))) return false
    const role = ROLES[group.role] ?? ROLES.section
    // Only a space picture of the inside or the outside is shown again, on another page (C6).
    return (
      Boolean(role.space) &&
      ['interior', 'exterior', 'room', 'equipment'].includes(label.subject) &&
      !group.home
    )
  }
  const candidates = (group) =>
    pictures
      .filter((label) => allowed(label, group))
      .map((label) => ({ label, fit: fitOf(label, group) }))
      .filter((c) => c.fit)
      .map((c) => ({ ...c, score: c.fit.score - (usedIds.has(c.label.id) ? 0.5 : 0) }))
      .sort((a, b) => b.score - a.score || String(a.label.id).localeCompare(String(b.label.id)))
  const place = (group, c) => {
    const key = identity(c.label)
    const seen = shownOn.get(key) ?? new Set()
    for (const r of group.routes.length ? group.routes : [`?${group.id}`]) seen.add(r)
    shownOn.set(key, seen)
    const reused = usedIds.has(c.label.id)
    usedIds.add(c.label.id)
    // `origin` says what the picture is (plan §8.4): a collected photograph here; `outpainted`/`generated` come from a later layer.
    placements.push({
      groupId: group.id,
      mediaId: c.label.id,
      origin: 'real',
      score: Number(c.score.toFixed(4)),
      crop: c.fit.crop,
      why: c.fit.why,
      reused,
      ...(c.label.dish ? { dish: c.label.dish } : {})
    })
  }
  const miss = (group) => {
    const role = ROLES[group.role] ?? ROLES.section
    const reason = !group.demo
      ? 'the demo picture’s size is not known'
      : `no picture fits: needs ${Object.keys(role.want)
          .filter((s) => s !== 'unknown')
          .join(
            '/'
          )} at least ${Math.round(Math.min(group.demo.width, role.min) / MAX_SCALE)}px wide after cropping to ${(group.demo.width / group.demo.height).toFixed(2)}${role.noText ? ', without words on it' : ''}`
    unfilled.push({
      groupId: group.id,
      role: group.role,
      routes: group.routes,
      reason,
      action: 'placeholder'
    })
  }

  // A card bound to an entity first: its own picture, or the placeholder.
  const boundOf = (g) => (g.occurrences ?? []).map((o) => o.key).find((k) => binding.has(k))
  const free = []
  for (const group of groups) {
    const key = boundOf(group)
    if (key === undefined) {
      free.push(group)
      continue
    }
    const want = binding.get(key)
    if (want && typeof want === 'object' && want.space) {
      // A card whose entity has no picture and may show the place itself (a team member): its inside or outside.
      const [best] = pictures
        .filter((l) => SPACE_SUBJECTS.has(l.subject) && allowed(l, group))
        .map((l) => ({ label: l, fit: boundFit(l, group) }))
        .filter((c) => c.fit)
        .sort((a, b) => b.fit.score - a.fit.score || String(a.label.id).localeCompare(String(b.label.id)))
      if (best) place(group, { ...best, score: best.fit.score })
      else
        unfilled.push({
          groupId: group.id,
          role: group.role,
          routes: group.routes,
          reason: 'no picture of the place’s space fits this card',
          action: 'placeholder'
        })
      continue
    }
    const label = pictures.find((l) => l.id === want)
    const fit = label ? boundFit(label, group) : null
    if (label && fit) place(group, { label, fit, score: fit.score })
    else
      unfilled.push({
        groupId: group.id,
        role: group.role,
        routes: group.routes,
        reason: label
          ? 'its entity’s own picture cannot be cut to this shape'
          : 'its entity has no picture of its own',
        action: 'placeholder'
      })
  }

  // Only the home page's top pictures choose first; a banner of another page competes like any section (C5).
  const tierOf = (g) => {
    const tier = (ROLES[g.role] ?? ROLES.section).tier
    return tier === 1 && g.role !== 'hero' && !g.home ? 2 : tier
  }
  for (const group of free.filter((g) => tierOf(g) === 1)) {
    const [best] = candidates(group)
    if (best) place(group, best)
    else miss(group)
  }

  // Tier 2 and 3: clusters of one role, one section and one set of pages, the most constrained first.
  for (const tier of [2, 3]) {
    const clusters = new Map()
    for (const g of free.filter((x) => tierOf(x) === tier)) {
      const key = `${g.role}|${g.topic.join(' ')}|${g.routes.join(',')}`
      clusters.set(key, [...(clusters.get(key) ?? []), g])
    }
    const pending = [...clusters.entries()]
    while (pending.length) {
      const counted = pending.map(([key, members]) => [
        key,
        members,
        Math.min(...members.map((m) => candidates(m).length)) / members.length
      ])
      counted.sort((a, b) => a[2] - b[2] || String(a[0]).localeCompare(String(b[0])))
      const [key, members] = counted[0]
      pending.splice(
        pending.findIndex(([k]) => k === key),
        1
      )
      const lists = members.map((m) => candidates(m))
      const pool = [...new Map(lists.flat().map((c) => [c.label.id, c.label])).values()].sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      )
      // A picture and its near-copy are one column: they may not both go to one page.
      const columns = [...new Map(pool.map((l) => [identity(l), l])).values()]
      const scores = members.map((m, i) =>
        columns.map((l) => lists[i].find((c) => identity(c.label) === identity(l))?.score ?? null)
      )
      const chosen = assign(scores)
      members.forEach((m, i) => {
        const col = chosen[i]
        const c = col >= 0 ? lists[i].find((x) => identity(x.label) === identity(columns[col])) : null
        if (c) place(m, c)
        else miss(m)
      })
    }
  }
  const order = new Map(groups.map((g, i) => [g.id, i]))
  placements.sort((a, b) => order.get(a.groupId) - order.get(b.groupId))
  unfilled.sort((a, b) => order.get(a.groupId) - order.get(b.groupId))
  return {
    version: PLANNER_VERSION,
    placements,
    unfilled,
    unused: pictures.filter((l) => !usedIds.has(l.id)).map((l) => l.id)
  }
}

/** The places a picture may be drawn for (plan §8): wide pictures of the place, never a dish, a person or a logo. */
const DRAWABLE = new Set(['hero', 'banner', 'background'])
/** The most pictures drawn or extended for one site (§8.5). */
export const DRAW_MAX = 3
/** An extension keeps the real photo in the middle: it must fill at least this share of the new frame's width. */
const OUTPAINT_MIN_SHARE = 0.4
const SUBJECT_RANK = ['exterior', 'interior', 'food', 'drink', 'dessert']

/**
 * Which empty places get a drawn picture, and from what (plan §8): an empty hero, banner or background only; first by
 * extending a real photograph whose subject fits but whose size or shape does not (`outpaint`), else a scene drawn with
 * the place's own photographs as references (`scene`). Nothing is drawn without a photograph of the place to start from.
 * @returns {Array<{groupId: string, mode: 'outpaint' | 'scene', sourceId?: string, referenceIds: string[], aspect: number}>}
 */
export function drawPlan({ plan, groups, labels, max = DRAW_MAX }) {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const pictures = [...labels].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const photo = (l) =>
    !l.graphic &&
    !l.collage &&
    l.textPresence !== 'present' &&
    l.subjectFrom !== 'none' &&
    !['logo', 'menu-board', 'poster'].includes(l.subject) &&
    ['unknown', 'good'].includes(l.quality)
  const rank = (l) => (SUBJECT_RANK.includes(l.subject) ? SUBJECT_RANK.indexOf(l.subject) : 9)
  const shownOn = new Map()
  for (const p of plan.placements)
    for (const r of byId.get(p.groupId)?.routes ?? []) shownOn.set(`${p.mediaId}@${r}`, true)
  const extended = new Set()
  const out = []
  for (const u of plan.unfilled) {
    if (out.length >= max) break
    const group = byId.get(u.groupId)
    if (!group || !DRAWABLE.has(group.role) || !group.demo) continue
    const role = ROLES[group.role]
    const aspect = group.demo.width / group.demo.height
    const sources = pictures
      .filter((l) => photo(l) && (role.want[l.subject] ?? 0) >= 0.6 && !extended.has(l.id))
      .filter(
        (l) =>
          l.aspect / aspect >= OUTPAINT_MIN_SHARE && !group.routes.some((r) => shownOn.has(`${l.id}@${r}`))
      )
      .sort(
        (a, b) =>
          (role.want[b.subject] ?? 0) - (role.want[a.subject] ?? 0) ||
          rank(a) - rank(b) ||
          b.width * b.height - a.width * a.height
      )
    if (sources[0]) {
      extended.add(sources[0].id)
      out.push({
        groupId: group.id,
        mode: 'outpaint',
        sourceId: sources[0].id,
        referenceIds: [sources[0].id],
        aspect
      })
      continue
    }
    const references = pictures
      .filter((l) => photo(l) && ['exterior', 'interior'].includes(l.subject))
      .sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 4)
      .map((l) => l.id)
    if (references.length) out.push({ groupId: group.id, mode: 'scene', referenceIds: references, aspect })
  }
  return out
}

/** Topic words of free text, for a caller that wants them the planner's way. */
export const topicWords = foldWords
