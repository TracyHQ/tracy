/**
 * The customer's own photographs in the demo pictures' places, instead of drawn ones — for a site an opportunity built
 * (Website Opportunities: the restaurant's collected pictures). Same road as the drawn pictures (`pictures.js`): the demo's
 * shape is read from the site, each picture is cut to it, uploaded one at a time and its path rides the one contract write
 * with the words. What differs is WHICH picture goes WHERE: the Website Opportunities planner decides
 * (`domain/pictures/placement.mjs`), from the contract's picture slots and what is known of each photograph.
 *
 *   prepare  (no site)    read the build's pictures (`realPictures.forSite`, injected: `sites/` never reads `wo_media`)
 *   shape    (site up)    measure the demo files (size; a PNG's transparency) → plan, written ONCE before any upload
 *                         (`recordPlan`: a retry places what the first run chose) → cut each picture, a neutral
 *                         placeholder where nothing fits (never another restaurant's demo photo beside real ones)
 *   audit    (after the write)  read the slots back: what the site holds now, and every content place still on its demo
 *
 * 🔒 NEVER IN THE WAY OF A SITE'S OWN BUILD. No reader, no build behind the site, no pictures, a reader that fails: the
 * engine draws (or keeps the template's pictures) exactly as before.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cutForPlace, demoTransparency, initialsAvatar, placeholderPicture } from '../../lib/picture-cut.js'
import { drawForPlace, drawKey } from '../../lib/picture-draw.js'
import { seeder } from '../../lib/seeder.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DRAW_MS, sizeOf } from './pictures.js'
import { picturePolicy } from '../../lib/wo-picture-policy.js'
import { customizableSlots } from '../../lib/contract-customize.js'
import { pool } from './shared.js'

/** Pictures cut at once: each holds a decoded photograph in memory (C15). */
const CUT_AT_ONCE = 4
/** Demo files read at once from the site. */
const READ_AT_ONCE = 8
/** The widest placeholder written: a flat gradient gains nothing from more pixels. */
const PLACEHOLDER_MAX_W = 1600
/** Pictures drawn at once: each is a paid model call of ~8 s. */
const DRAW_AT_ONCE = 2

/**
 * The build's pictures, or null when the site is not one an opportunity built (or they cannot be read).
 * @param {{forSite: Function} | null} realPictures
 * @param {{siteKey: string, email: string, note: (n: string) => void, time?: (phase: string, n: number) => void}} ctx
 */
export async function realPicturesOf(realPictures, ctx) {
  if (!realPictures) return null
  const real = await realPictures.forSite({ siteKey: ctx.siteKey, email: ctx.email }).catch(() => null)
  if (!real || real.pictures.length === 0) return null
  // What the vision model cost this run (nothing when every label was already kept): for the report.
  if (real.vision?.calls) {
    ctx.time?.('visionCalls', real.vision.calls)
    ctx.time?.('visionTokens', real.vision.tokens)
    ctx.time?.('visionMs', real.vision.ms)
    ctx.time?.('visionLabelled', real.vision.labelled)
  }
  return real
}

/**
 * Which pages the site keeps, from the brief's Pages answer (`brief.pages = {all, picked}`): all of them when it has none.
 * @param {{all?: Array<{id: string, home?: boolean}>, picked?: string[]} | null | undefined} pages
 */
export function keptPages(pages) {
  const home = pages?.all?.find((p) => p.home)?.id ?? null
  if (!pages || !Array.isArray(pages.picked)) return { keepRoute: () => true, homeRoute: home }
  const picked = new Set(pages.picked)
  return {
    keepRoute: (/** @type {string} */ route) =>
      route === home ||
      route === 'homepage' ||
      route === 'home' ||
      picked.has(route) ||
      picked.has(route.split('/')[0]),
    homeRoute: home
  }
}

/** The contract's picture slots and pages, as the planner reads them. */
export function contentMapOf(contract) {
  const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
  // A slot the profile only declares (`customize: "keep"`) keeps the demo's picture (`lib/contract-customize.js`).
  // The vocabulary version and the entities (their `demoOnly` mark) decide whether the fill plan places the pictures.
  return {
    slots: customizableSlots(map.slots ?? []),
    pages: map.pages ?? [],
    roleVocabularyVersion: map.roleVocabularyVersion ?? null,
    entities: map.entities ?? []
  }
}

/**
 * Measure, plan (once), cut. Never throws for one picture; answers `shaped` in the shape `uploadPictures` takes.
 * @param {object} input
 * @param {any} input.real - `realPicturesOf`'s answer
 * @param {{slots: any[], pages?: any[]}} input.contentMap
 * @param {'joomla' | 'wordpress'} input.cms
 * @param {{keepRoute: (route: string) => boolean, homeRoute?: string | null}} input.pages
 * @param {(path: string) => Promise<Buffer | null>} input.siteFile - the first bytes of a file the site serves
 * @param {(path: string) => Promise<Uint8Array | null>} input.siteBytes - a whole file the site serves
 * @param {{recordPlan: Function}} input.realPictures
 * @param {(note: string) => void} input.note
 * @param {(phase: string, ms: number) => void} [input.time]
 * @param {() => Promise<any>} [input.loadDomain]
 * @param {{url: string, key: string, imageModel: string} | null} [input.drawDoor] - the picture model; with it an empty hero,
 *   banner or background is drawn from the restaurant's own photographs (plan §8), without it it takes a placeholder
 * @param {Function | null} [input.chat] - the seeder's model call (a test's stand-in)
 * @param {number} [input.maxDraws]
 * @param {AbortSignal} [input.signal] - the Apply's own: at its deadline a drawing still waited on is given up, and the
 *   place takes a placeholder instead of holding back the words
 * @param {number} [input.drawMs] - one drawing's own limit (a test's stand-in for {@link DRAW_MS})
 * @param {Record<string, string | {space: true} | null>} [input.bound] - a slot plan's card pictures (`slotFillPins`): each
 *   card slot of an entity takes that entity's own picture, the place's space or the placeholder (`planPlacement`)
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null} [input.copy] - the text path's copy
 *   pins (`copyPinsOf`): the fill plan gives each offering card the photo of the offering its pinned name says
 */
export async function shapeReal({
  real,
  contentMap,
  cms,
  pages,
  siteFile,
  siteBytes,
  realPictures,
  note,
  time = () => {},
  loadDomain = websiteOpportunitiesDomain,
  drawDoor = null,
  chat = null,
  maxDraws,
  signal,
  drawMs = DRAW_MS,
  bound = {},
  copy = null
}) {
  const domain = await loadDomain()
  const policy = picturePolicy(real.picturePolicy)
  const clock = (phase, started) => time(phase, Date.now() - started)
  const keep = { cms, keepRoute: pages.keepRoute, ...(pages.homeRoute ? { homeRoute: pages.homeRoute } : {}) }

  // The demo files: their size from a header, a PNG's transparency from the whole file.
  let started = Date.now()
  const first = domain.slotMap(contentMap, keep)
  // Every demo file is read from the site: a sealed site checks a picture's shape against the file it serves, which can
  // differ from the size the contract declares (ja-impact 1.0.3 declares item-2 3500×2388; the file is 1920×824).
  const files = [
    ...first.groups.map((g) => g.file),
    ...first.never.filter((n) => /may be a cut-out/.test(n.reason)).map((n) => n.file)
  ]
  const demo = new Map()
  await pool(
    files.map((file) => async () => {
      const png = /\.png$/i.test(file)
      const bytes = png ? await siteBytes(file).catch(() => null) : await siteFile(file)
      const size = bytes ? await sizeOf(Buffer.from(bytes)) : null
      if (!size) return
      demo.set(file, {
        width: size[0],
        height: size[1],
        ...(png ? { alpha: (await demoTransparency(bytes)) ?? undefined } : {})
      })
    }),
    READ_AT_ONCE
  )
  let map = domain.slotMap(contentMap, { ...keep, demo })
  clock('pictureDemoMs', started)

  // The plan: the one a run before wrote, else made now and written before anything is uploaded.
  started = Date.now()
  const labels = real.pictures.map((p) => domain.labelPicture(p))
  const labelOf = new Map(labels.map((l) => [l.id, l]))
  // A Joomla contract whose map says each slot's v3 role (ADR 0040) is filled by the fill plan from the brief's links:
  // a card takes only its own offering's photo, a general slot only a general one; no role is guessed from a name.
  let made
  if (cms === 'joomla' && real.brief && domain.roleDecidesKeep(contentMap)) {
    const readable = new Map(real.pictures.map((p) => [p.id, p]))
    const assets = (real.brief.assets ?? [])
      .filter((a) => readable.has(a?.id))
      .map((a) => ({ ...a, width: readable.get(a.id).width, height: readable.get(a.id).height }))
    // A card's offering is the one its name says, and the name is the text path's (`copy`): one decider for both.
    const cardNames = domain.cardNamesOf(contentMap, copy)
    const fill = domain.planFill({ contentMap, brief: { ...real.brief, assets }, demo, cardNames })
    const placed = domain.placementOfFill({ fill, groups: map.groups })
    map = { ...map, groups: placed.groups, never: [...map.never, ...placed.dropped] }
    made = placed.plan
  } else {
    const { clusterOf } = domain.nearCopies(labels)
    made = domain.planPlacement({ groups: map.groups, labels, clusterOf, bound })
  }
  const fresh = {
    ...made,
    versions: {
      slotMap: domain.SLOT_MAP_VERSION,
      labels: domain.LABELS_VERSION,
      planner: domain.PLANNER_VERSION,
      ...(made.fill ? { fill: made.fill } : {})
    },
    media: labels.map((l) => l.id).sort()
  }
  const plan = real.plan ?? (await realPictures.recordPlan(real.buildId, fresh))
  clock('picturePlanMs', started)

  const byGroup = new Map(map.groups.map((g) => [g.id, g]))
  const asGroup = (g) => ({ sample: g.file, role: g.role, slots: g.occurrences })

  // An empty hero, banner or background: drawn from the restaurant's own photographs when a picture model is set (§8).
  /** @type {Map<string, any>} */
  const drawn = new Map()
  if (policy.missingHeroMode !== 'real-only' && drawDoor?.imageModel && plan.unfilled.length > 0) {
    started = Date.now()
    const draws = domain
      .drawPlan({
        plan,
        groups: map.groups,
        labels,
        ...(maxDraws !== undefined ? { max: maxDraws } : {})
      })
      .filter((item) => policy.missingHeroMode !== 'outpaint' || item.mode === 'outpaint')
    const shaOf = new Map(real.pictures.map((p) => [p.id, p.sha256]))
    const talk = chat ?? (await seeder('model')).chat
    const drawing = await pool(
      draws.map((item) => async () => {
        const group = byGroup.get(item.groupId)
        const key = drawKey(item, {
          model: drawDoor.imageModel,
          shas: item.referenceIds.map((id) => shaOf.get(id))
        })
        let got = await (real.drawing?.get(key) ?? Promise.resolve(null)).catch(() => null)
        let costUsd = 0
        if (!got) {
          const references = (await Promise.all(item.referenceIds.map((id) => real.bytes(id)))).filter(
            Boolean
          )
          if (references.length === 0) return
          // Bounded on its own and by the Apply: the words wait for the pictures, so a model that never answers
          // must not hold them past the Apply's deadline (#1367: the site then keeps the template's words).
          const cutoff = AbortSignal.any([AbortSignal.timeout(drawMs), ...(signal ? [signal] : [])])
          got = await drawForPlace({ door: drawDoor, chat: talk, item, references, signal: cutoff })
          costUsd = got.costUsd ?? null
          await (real.drawing?.put(key, got.bytes) ?? Promise.resolve()).catch(() => {})
        }
        const size = await sizeOf(Buffer.from(got.bytes))
        if (!size) return
        // A drawing is a picture like any other: never enlarged past the role's limit (C9).
        const box = domain.cropBox(size[0], size[1], item.aspect)
        const target = Math.min(group.demo.width, (domain.ROLES[group.role] ?? domain.ROLES.section).min)
        if (target / box.width > domain.MAX_SCALE) {
          note(`a picture drawn for ${group.file} came back too small, so it takes a placeholder`)
          return
        }
        const output = domain.outputSize(box, item.aspect, group.demo.width)
        if (!output) return
        const cut = await cutForPlace(got.bytes, {
          aspect: item.aspect,
          source: box,
          output,
          strategy: 'centre'
        })
        drawn.set(group.id, {
          group: asGroup(group),
          bytes: cut.bytes,
          ext: cut.ext,
          hash: cut.sha256,
          receipt: {
            kind: 'drawn',
            origin: item.mode === 'outpaint' ? 'outpainted' : 'generated',
            referenceIds: item.referenceIds,
            model: drawDoor.imageModel,
            costUsd,
            width: cut.width,
            height: cut.height
          }
        })
      }),
      DRAW_AT_ONCE
    )
    for (const answer of drawing)
      if (!answer.ok)
        note(
          `a picture could not be drawn: ${answer.error instanceof Error ? answer.error.message : answer.error}`
        )
    clock('pictureDrawMs', started)
  }

  // Cut, four at a time; a placeholder where nothing fits.
  started = Date.now()
  const jobs = [
    ...plan.placements.map((p) => async () => {
      const group = byGroup.get(p.groupId)
      if (!group) return null
      const bytes = await real.bytes(p.mediaId)
      if (!bytes) {
        note(`a collected picture could not be read, so ${group.file} takes a placeholder`)
        return placeholderFor(group, real.colours)
      }
      const cut = await cutForPlace(bytes, p.crop)
      return {
        group: asGroup(group),
        bytes: cut.bytes,
        ext: cut.ext,
        hash: cut.sha256,
        receipt: {
          kind: 'photo',
          origin: p.origin ?? 'real',
          mediaId: p.mediaId,
          ...(p.dish ? { dish: p.dish } : {}),
          ...(labelOf.get(p.mediaId)?.subject ? { subject: labelOf.get(p.mediaId).subject } : {}),
          rect: cut.rect,
          width: cut.width,
          height: cut.height
        }
      }
    }),
    ...plan.unfilled
      .filter((u) => u.action === 'placeholder')
      .map((u) => async () => {
        if (drawn.has(u.groupId)) return drawn.get(u.groupId)
        const group = byGroup.get(u.groupId)
        return group?.demo ? placeholderFor(group, real.colours, u.avatar) : null
      })
  ]
  // A person picture's substitute is an initials avatar (#134); every other place takes the plain placeholder.
  async function placeholderFor(group, colours, avatar = null) {
    const aspect = group.demo.width / group.demo.height
    const out = domain.outputSize(
      { width: group.demo.width, height: group.demo.height },
      aspect,
      Math.min(group.demo.width, PLACEHOLDER_MAX_W)
    )
    if (!out) return null
    const fill = avatar
      ? await initialsAvatar({ ...out, initials: avatar.initials, colours })
      : await placeholderPicture({ ...out, colours })
    const receipt = avatar
      ? {
          kind: 'avatar',
          origin: 'placeholder',
          initials: avatar.initials,
          width: out.width,
          height: out.height
        }
      : { kind: 'placeholder', origin: 'placeholder', width: out.width, height: out.height }
    return { group: asGroup(group), bytes: fill.bytes, ext: fill.ext, hash: fill.sha256, receipt }
  }
  const answers = await pool(jobs, CUT_AT_ONCE)
  const shaped = []
  for (const answer of answers) {
    if (answer.ok && answer.value) shaped.push(answer.value)
    else if (!answer.ok)
      note(
        `a picture could not be cut: ${answer.error instanceof Error ? answer.error.message : answer.error}`
      )
  }
  clock('pictureCutMs', started)
  return { shaped, plan, map }
}

/**
 * What became of each place, read back from the site after the write: `verified` when the slot holds the uploaded path,
 * `applied` when the write named it but the readback could not say, `uploaded` when it went up but the write did not take
 * it. And every content place still on its demo file.
 * @param {object} input
 * @param {Awaited<ReturnType<typeof shapeReal>>} input.shaped
 * @param {Record<string, string>} input.values - slot key → path, from `uploadPictures`
 * @param {Set<string>} input.refused - slot keys the write set aside
 * @param {Map<string, string> | null} input.readback - slot key → what the site holds now, or null when it could not be read
 * @param {string | null} [input.homeHtml] - the home page as a visitor gets it: the template's pictures no slot names
 *   (a section the contract does not seal) are listed for the agent, never guessed at here
 */
export function pictureReport({ shaped, values, refused, readback, homeHtml = null }) {
  const receipts = {}
  const demoLeft = []
  for (const { group, hash, receipt } of shaped.shaped) {
    const keys = group.slots.map((s) => s.key)
    const value = values[keys[0]]
    const state = !value
      ? 'refused'
      : keys.some((k) => refused.has(k))
        ? 'uploaded'
        : readback
          ? keys.every((k) => readback.get(k) === value)
            ? 'verified'
            : 'applied'
          : 'applied'
    receipts[group.sample] = { state, path: value ?? null, sha256: hash, ...receipt }
  }
  if (readback)
    for (const group of shaped.map.groups)
      for (const slot of group.occurrences) {
        const now = readback.get(slot.key)
        if (now !== undefined && String(now).split('#')[0].replace(/^\/+/, '') === group.file)
          demoLeft.push({ file: group.file, key: slot.key, routes: group.routes })
      }
  const states = Object.values(receipts).map((r) => r.state)
  // The folders the template keeps its demo pictures in (`images/joomlart/`), from the slots' own samples.
  const folders = new Set(
    [...shaped.map.groups.map((g) => g.file), ...shaped.map.never.map((n) => n.file)]
      .filter((f) => !/^https?:/i.test(f) && f.includes('/'))
      .map((f) => f.split('/').slice(0, 2).join('/') + '/')
  )
  const known = new Set([...shaped.map.groups.map((g) => g.file), ...shaped.map.never.map((n) => n.file)])
  const demoOutside = homeHtml
    ? [
        ...new Set(
          [...homeHtml.matchAll(/[\w./%-]+\.(?:jpe?g|png|webp)/gi)].map((m) =>
            decodeURIComponent(m[0]).replace(/^(?:\.?\/)+/, '')
          )
        )
      ]
        .filter((f) => [...folders].some((d) => f.startsWith(d)) && !known.has(f))
        .sort()
    : []
  return {
    receipts,
    report: {
      groups: shaped.map.groups.length,
      photos: shaped.plan.placements.length,
      // An initials avatar is a person picture's placeholder: it counts as one.
      placeholders: Object.values(receipts).filter((r) => r.kind === 'placeholder' || r.kind === 'avatar')
        .length,
      drawn: Object.values(receipts).filter((r) => r.kind === 'drawn').length,
      drawCostUsd: Number(
        Object.values(receipts)
          .reduce((sum, r) => sum + (r.kind === 'drawn' ? Number(r.costUsd) || 0 : 0), 0)
          .toFixed(4)
      ),
      verified: states.filter((s) => s === 'verified').length,
      unfilled: shaped.plan.unfilled,
      never: shaped.map.never.map((n) => ({ file: n.file, reason: n.reason })),
      demoLeft,
      demoOutside,
      unused: shaped.plan.unused.length
    }
  }
}
