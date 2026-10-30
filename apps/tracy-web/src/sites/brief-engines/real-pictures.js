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
import sharp from 'sharp'
import { cutForPlace, demoTransparency } from '../../lib/picture-cut.js'
import { substitutePicture } from '../../lib/substitute-picture.js'
import { drawForPlace, drawKey } from '../../lib/picture-draw.js'
import { seeder } from '../../lib/seeder.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DRAW_MS, sizeOf } from './pictures.js'
import { picturePolicy } from '../../lib/wo-picture-policy.js'
import { customizableSlots } from '../../lib/contract-customize.js'
import { pool } from './shared.js'
import { drawPlanned, shapeDecor } from './drawn-pictures.js'
import { drawingFailureReason } from './drawing-failures.js'
import { unmeasuredFigures } from './unmeasured-figures.js'
import { iconMeanings } from './icon-meanings.js'
import { correctedCut, sharpFill } from './sharpness-gate.js'
import { phosphorCatalog } from '../../lib/phosphor-icons.js'
import { drawingFallbacks } from './drawing-fallbacks.js'
import {
  HIDDEN_BY_PLAN,
  followPlannedIcons,
  followPlannedPictures,
  onlyPhotos,
  settleDrawings
} from './site-plan-pictures.js'

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
 * @param {{siteKey: string, email: string, platform?: string, note: (n: string) => void,
 *   time?: (phase: string, n: number) => void}} ctx
 */
export async function realPicturesOf(realPictures, ctx) {
  if (!realPictures) return null
  const real = await realPictures.forSite({ siteKey: ctx.siteKey, email: ctx.email }).catch(() => null)
  if (!real) return null
  // No photo: only a Joomla brief build goes on, so its plan writes colour blocks, icons and cleared cut-outs (#194).
  if (real.pictures.length === 0 && !(real.briefBuild && ctx.platform === 'joomla')) return null
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
 * @param {any[]} [input.declared] - the picture slots a profile only declares (`customize: "keep"`): the icons and
 *   cut-outs that carry the demo's subject are read from them (#195)
 * @param {Record<string, string> | null} [input.cardNames] - the site plan's label of each kept card, by group id
 *   (`honesty.cardNames`, #192); when given it decides the cards' subjects instead of the copy pins
 * @param {{chat: Function} | null | (() => Promise<{chat: Function} | null>)} [input.textModel] - the text model the
 *   build writes with (or a getter of it): it reads which glyph of the icon set shows each item icon (#189)
 * @param {Record<string, string> | null} [input.written] - the words the build planned, by slot key (copy first, #189):
 *   each frame's photo and drawing follow the record page it sits on and the copy next to it, each icon the words of
 *   its own item
 * @param {ReturnType<typeof import('./site-plan-pictures.js').plannedPictures>} [input.sitePlan] - the accepted site
 *   plan's picture and icon decisions (`plannedPictures`, ticket #239): with them each picture slot takes exactly the
 *   plan's decision and each icon the plan's meaning, and the answer carries what was applied per slot (`sitePlan`)
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
  copy = null,
  declared = [],
  cardNames: plannedNames = null,
  textModel = null,
  written = null,
  sitePlan: planned = null
}) {
  const domain = await loadDomain()
  /** What the accepted site plan applied, per picture and icon slot (ticket #239). */
  let applied = null
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
  let decorPlan = null
  if (cms === 'joomla' && real.brief && domain.roleDecidesKeep(contentMap)) {
    // A cut-out slot may take the owner's own clear-ground picture (ladder step 1): which pictures are, read from them.
    const assets = await briefAssetsOf(
      real,
      contentMap.slots.some((s) => s?.fit?.kind === 'cutout')
    )
    // A card's offering is the one its name says, and the name is the text path's (`copy`): one decider for both.
    // A brief build's site plan names each kept card (#192, `honesty.cardNames`) and decides it; hidden cards have none.
    const cardNames = plannedNames ?? domain.cardNamesOf(contentMap, copy)
    // Per slot (#194): cards that share one demo file each get their own decision and file; where no photo fits, a
    // picture is drawn from the owner's photos (`fill-draw.mjs`), else the slot takes a brand colour block.
    // 🔒 A BRIEF PHOTO THE SITE PLAN DOES NOT USE IS NEVER PLACED, EXTENDED OR DRAWN FROM (ticket #239).
    const brief = {
      ...real.brief,
      assets: planned ? assets.filter((a) => !planned.skipped.has(String(a?.id))) : assets
    }
    // Each slot the site plan decides may take only its planned photo, or none; acceptance and crop still judge it.
    const only = planned ? onlyPhotos(planned) : null
    // Every owner photo placed is judged as it will be shown (`sharpness-gate.js`): an unsharp one loses the slot to the
    // next photo, else to a drawing.
    const {
      fill: judged,
      unsharp,
      sharpness
    } = await sharpFill({
      plan: (refused) =>
        domain.planFill({
          contentMap,
          brief,
          demo,
          cardNames,
          perSlot: true,
          unsharp: refused,
          written,
          ...(only ? { only } : {})
        }),
      contentMap,
      real,
      shownWidthOf: domain.shownWidthOf,
      note
    })
    // 🔒 EACH PICTURE SLOT TAKES EXACTLY THE SITE PLAN'S DECISION (ticket #239, `site-plan-pictures.js`): its photo, a
    // drawing, or hidden; only the slots the plan draws are left for the drawing planner.
    const followed = planned ? followPlannedPictures(judged.slots, planned) : null
    const fill = followed ? { ...judged, slots: followed.slots } : judged
    // Only slots on a page the site keeps are drawn: a demo post the tidy-up takes off never spends the cap.
    const onSite = new Set(map.groups.flatMap((g) => (g.occurrences ?? []).map((o) => o.key)))
    const described = followed
      ? new Map(
          [...followed.record]
            .filter(([, r]) => r.applied === 'draw' && r.describe)
            .map(([key, r]) => [key, r.describe])
        )
      : null
    const drawnPlan = followed
      ? settleDrawings(
          domain.planDrawings({ fill, contentMap, brief, demo, onSite, unsharp, written, described }),
          followed.record
        )
      : domain.planDrawings({ fill, contentMap, brief, demo, onSite, unsharp, written })
    const placed = domain.placementOfFill({ fill: { ...fill, slots: drawnPlan.slots }, groups: map.groups })
    map = { ...map, groups: placed.groups, never: [...map.never, ...placed.dropped] }
    made = { ...placed.plan, drawings: drawnPlan.drawings, drawCapped: drawnPlan.capped, sharpness }
    // Icons and cut-outs that carry the demo's subject follow the business (#195, `decor-plan.mjs`).
    const decorMap = { ...contentMap, slots: [...contentMap.slots, ...declared] }
    // Each item icon's meaning is read by the text model from the item's words; the keywords decide without it (#189).
    const writer = typeof textModel === 'function' ? textModel() : textModel
    // Copy first (#189): each icon reads the words planned for its own item, not only the sourced pins.
    const words = withWritten(copy, written)
    const iconChoices = await iconMeanings({
      domain,
      model: await Promise.resolve(writer).catch(() => null),
      contentMap: decorMap,
      brief,
      copy: words,
      note,
      signal
    })
    decorPlan = domain.planDecor({
      contentMap: decorMap,
      brief,
      copy: words,
      offerings: fill.offerings,
      fill: fill.slots,
      iconChoices,
      iconCatalog: phosphorCatalog()
    })
    if (planned) {
      // Icons follow the plan's meanings, one neutral icon for a row the plan calls neutral (site build rule 4).
      const slotOf = new Map(decorMap.slots.map((s) => [s.key, s]))
      const usable = domain.usableCatalog(phosphorCatalog())
      const sectionOf = (/** @type {string} */ key) => String(slotOf.get(key)?.entity ?? key)
      const icons = followPlannedIcons(decorPlan.slots, planned, {
        rank: (meaning) => [
          ...new Set([...domain.keywordRanking(meaning), ...domain.catalogNameRanking(meaning, usable)])
        ],
        neutral: domain.NEUTRAL_GLYPHS,
        sectionOf,
        rowOf: (key) => {
          const group = slotOf.get(key)?.group?.id
          return group ? `${sectionOf(key)}#${String(group).replace(/\.\d+$/, '')}` : sectionOf(key)
        }
      })
      // A cut-out frame (the decor ladder's) shows only the photo the plan names there; any other decision, or a photo the
      // ladder cannot stand in the frame, clears it and takes it off (ladder step 2). A cut-out is never drawn.
      const slots = icons.slots.map((d) => {
        const r = d.action === 'cut-out' ? followed.record.get(d.key) : null
        if (!r || ['off', 'own-door', 'template'].includes(r.applied)) return d
        const own = planned.pictures.get(d.key)
        if ((d.mode === 'own' || d.mode === 'framed') && d.mediaId && d.mediaId === own?.mediaId) {
          followed.record.set(d.key, { ...r, applied: 'photo', mediaId: d.mediaId, cutOut: d.mode })
          return d
        }
        followed.record.set(d.key, {
          ...r,
          applied: 'hide',
          reason:
            r.applied === 'hide'
              ? r.reason
              : own?.decision === 'photo'
                ? `the planned photo ${own.mediaId} cannot stand in this cut-out frame`
                : 'a cut-out frame is never drawn'
        })
        return { ...d, mode: 'off', step: 2, reason: HIDDEN_BY_PLAN, mediaId: undefined, crop: undefined }
      })
      decorPlan = { ...decorPlan, slots }
      // A picture the slot map leaves on no page the site shows (a demo blog post kept as written) is not written: said so.
      const unshown = new Map((map.skipped ?? []).map((k) => [k.file, k.reason]))
      const sampleOf = new Map(contentMap.slots.map((s) => [s.key, String(s.sample ?? '').split('#')[0]]))
      for (const [key, r] of followed.record) {
        const why = unshown.get(sampleOf.get(key))
        if (why && !['off', 'own-door', 'template'].includes(r.applied))
          followed.record.set(key, { ...r, applied: 'not-shown', reason: why })
      }
      applied = {
        version: 'site-plan-pictures/1',
        pictures: [...followed.record.values()],
        icons: [...icons.record.values()]
      }
    }
  } else {
    const { clusterOf } = domain.nearCopies(labels)
    made = domain.planPlacement({ groups: map.groups, labels, clusterOf, bound })
  }
  // A demo figure the map never measured (a transparent PNG read now) that the labeller says shows a subject climbs the
  // cut-out ladder too, steps 1 and 2 only (`unmeasured-figures.js`); a design piece stays.
  let figures = []
  if (cms === 'joomla' && real.brief) {
    const found = await unmeasuredFigures({
      domain,
      slots: contentMap.slots,
      never: map.never,
      demo,
      siteBytes,
      checkDrawing: real.checkDrawing,
      note
    })
    figures = found.slots
    if (figures.length) {
      const keys = new Set(figures.map((s) => s.key))
      const brief = { ...real.brief, assets: await briefAssetsOf(real, true) }
      const byKey = new Map(figures.map((s) => [s.key, s]))
      const slots = contentMap.slots.map((s) => byKey.get(s.key) ?? s)
      const figurePlan = domain.planDecor({ contentMap: { ...contentMap, slots }, brief, copy })
      const more = figurePlan.slots.filter((d) => keys.has(d.key))
      decorPlan = {
        ...(decorPlan ?? { version: figurePlan.version }),
        slots: [...(decorPlan?.slots ?? []), ...more]
      }
    }
  }
  const fresh = {
    ...made,
    versions: {
      slotMap: domain.SLOT_MAP_VERSION,
      labels: domain.LABELS_VERSION,
      planner: domain.PLANNER_VERSION,
      ...(made.fill ? { fill: made.fill } : {})
    },
    media: labels.map((l) => l.id).sort(),
    ...(applied ? { sitePlan: applied } : {})
  }
  const plan = real.plan ?? (await realPictures.recordPlan(real.buildId, fresh))
  clock('picturePlanMs', started)

  const byGroup = new Map(map.groups.map((g) => [g.id, g]))
  // A group's id is its demo file, or the file and its unit when the fill plan split it (#194): one receipt each.
  const asGroup = (g) => ({ sample: g.id, role: g.role, slots: g.occurrences, routes: g.routes ?? [] })

  // An empty hero, banner or background: drawn from the restaurant's own photographs when a picture model is set (§8).
  /** @type {Map<string, any>} */
  let drawn = new Map()
  let drawing = null
  const talkOnce = async () => chat ?? (await seeder('model')).chat
  if (plan.drawings && policy.missingHeroMode !== 'real-only') {
    // The fill plan's drawings (#194): every slot no photo fits, checked by the labeller, capped per build.
    started = Date.now()
    ;({ drawn, stats: drawing } = await drawPlanned({
      plan,
      byGroup,
      real,
      drawDoor,
      chat: drawDoor?.imageModel ? await talkOnce() : null,
      domain,
      note,
      signal,
      drawMs,
      outpaintOnly: policy.missingHeroMode === 'outpaint'
    }))
    clock('pictureDrawMs', started)
  } else if (
    !plan.drawings &&
    policy.missingHeroMode !== 'real-only' &&
    drawDoor?.imageModel &&
    plan.unfilled.length > 0
  ) {
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
      if (!answer.ok) {
        const reason = drawingFailureReason(answer.error)
        note(`a picture could not be drawn: ${reason === 'timeout' ? 'the picture took too long' : reason}`)
      }
    clock('pictureDrawMs', started)
  }

  // Cut, four at a time; a placeholder where nothing fits.
  started = Date.now()
  const fallbacks = real.brief
    ? await drawingFallbacks({
        plan,
        byGroup,
        drawn,
        real,
        contentMap,
        demo,
        cardNames: plannedNames ?? domain.cardNamesOf(contentMap, copy)
      })
    : new Map()
  // A cut-out slot is the decor step's alone (the ladder): no photo of the fill plan is written into it as it is.
  const decorKeys = new Set((decorPlan?.slots ?? []).filter((d) => d.action === 'cut-out').map((d) => d.key))
  const ownedByDecor = (group) =>
    decorKeys.size > 0 &&
    (group?.occurrences ?? []).length > 0 &&
    group.occurrences.every((o) => decorKeys.has(o.key))
  // The sharpness gate's record of a group's slots (the first slot that has one): the plan keeps it, so a retry writes
  // the same correction it judged.
  const sharpnessOf = (group) =>
    (group?.occurrences ?? []).map((o) => plan.sharpness?.slots?.[o.key]).find(Boolean) ?? null
  const jobs = [
    ...plan.placements.map((p) => async () => {
      const group = byGroup.get(p.groupId)
      if (!group || ownedByDecor(group)) return null
      const bytes = await real.bytes(p.mediaId)
      if (!bytes) {
        note(`a collected picture could not be read, so ${group.file} takes a placeholder`)
        return placeholderFor(group, real.colours)
      }
      const gate = sharpnessOf(group)
      const cut = await correctedCut(await cutForPlace(bytes, p.crop), gate)
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
          height: cut.height,
          ...(gate ? { sharpness: gate } : {})
        }
      }
    }),
    ...plan.unfilled
      .filter((u) => u.action === 'placeholder' || u.action === 'draw')
      .map((u) => async () => {
        const group = byGroup.get(u.groupId)
        const gate = sharpnessOf(group)
        // A slot whose owner photos were all too soft says so on the picture that took its place.
        if (drawn.has(u.groupId))
          return gate
            ? { ...drawn.get(u.groupId), receipt: { ...drawn.get(u.groupId).receipt, sharpness: gate } }
            : drawn.get(u.groupId)
        // A picture the site plan hides is cleared, and the head block takes it off wherever it shows (ticket #239).
        if (u.code === HIDDEN_BY_PLAN && group?.demo) {
          const blank = await placeholderFor(group, real.colours, { kind: 'blank' })
          return blank
            ? { ...blank, hide: true, receipt: { ...blank.receipt, reason: HIDDEN_BY_PLAN } }
            : null
        }
        if (fallbacks.has(u.groupId)) return fallbacks.get(u.groupId)
        if (group?.role === 'gallery') {
          const blank = await placeholderFor(group, real.colours, { kind: 'blank' })
          return blank
            ? { ...blank, hide: true, receipt: { ...blank.receipt, reason: 'gallery-without-picture' } }
            : null
        }
        return group?.demo ? placeholderFor(group, real.colours, u.substitute ?? null) : null
      })
  ]
  // A person picture's substitute is an initials avatar (#134), a signature's the signer's name (#137); every other
  // place takes the plain placeholder (`substitute-picture.js`).
  async function placeholderFor(group, colours, substitute = null) {
    const aspect = group.demo.width / group.demo.height
    const out = domain.outputSize(
      { width: group.demo.width, height: group.demo.height },
      aspect,
      Math.min(group.demo.width, PLACEHOLDER_MAX_W)
    )
    if (!out) return null
    const fill = await substitutePicture({ substitute, ...out, colours })
    const receipt =
      fill.kind === 'avatar'
        ? {
            kind: 'avatar',
            origin: 'placeholder',
            initials: substitute.initials,
            width: out.width,
            height: out.height
          }
        : { kind: fill.kind, origin: 'placeholder', width: out.width, height: out.height }
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
  // The icons and cut-outs (#195): uploaded and written like any other picture, each its own group.
  if (decorPlan?.slots.length) {
    started = Date.now()
    const slotOf = new Map([...contentMap.slots, ...declared, ...figures].map((s) => [s.key, s]))
    const decor = await shapeDecor({
      decisions: decorPlan.slots,
      slotOf,
      siteBytes,
      real,
      note
    })
    shaped.push(...decor.shaped)
    drawing = { ...drawing, decor: decor.stats }
    clock('pictureDecorMs', started)
  }
  return {
    shaped,
    plan,
    map,
    ...(drawing ? { drawing } : {}),
    ...(plan.sitePlan ? { sitePlan: plan.sitePlan } : {})
  }
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
      photos: Object.values(receipts).filter((r) => r.kind === 'photo').length,
      // An initials avatar, a script signature and a blank are a placeholder each: they count as one.
      placeholders: Object.values(receipts).filter((r) =>
        ['placeholder', 'avatar', 'signature', 'blank'].includes(r.kind)
      ).length,
      drawn: Object.values(receipts).filter((r) => r.kind === 'drawn').length,
      drawCostUsd: Number(
        Object.values(receipts)
          .reduce((sum, r) => sum + (['drawn', 'cut-out'].includes(r.kind) ? Number(r.costUsd) || 0 : 0), 0)
          .toFixed(4)
      ),
      // What drawing cost this build (#194): model calls, time, and every drawing the labeller refused, with why.
      ...(shaped.drawing
        ? {
            drawCalls: (shaped.drawing.calls ?? 0) + (shaped.drawing.decor?.calls ?? 0),
            drawMs: shaped.drawing.ms ?? 0,
            drawRefused: shaped.drawing.refused ?? [],
            ...(shaped.drawing.decor ? { decor: shaped.drawing.decor } : {})
          }
        : {}),
      ...(shaped.plan.drawCapped ? { drawCapped: shaped.plan.drawCapped } : {}),
      verified: states.filter((s) => s === 'verified').length,
      unfilled: shaped.plan.unfilled,
      never: shaped.map.never.map((n) => ({ file: n.file, reason: n.reason })),
      demoLeft,
      demoOutside,
      unused: shaped.plan.unused.length
    }
  }
}

/**
 * The brief's assets the build can read, each with its size, and marked `hasAlpha` when it is a clean clear-ground
 * picture (all four corners transparent) and `withClear` asks for it.
 * @param {any} real
 * @param {boolean} withClear
 */
/**
 * The copy pins with the words the build planned laid over them (#189): a planned line is the item's own words, so it is
 * no placeholder any more. The pins alone when nothing was planned.
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null} copy
 * @param {Record<string, string> | null} written
 */
export function withWritten(copy, written) {
  if (!written || typeof written !== 'object') return copy
  const planned = Object.fromEntries(
    Object.entries(written).filter(([, v]) => typeof v === 'string' && v.trim())
  )
  const sources = { ...copy?.sources }
  for (const key of Object.keys(planned)) if (sources[key] === 'placeholder') delete sources[key]
  return { ...copy, pins: { ...copy?.pins, ...planned }, sources }
}

async function briefAssetsOf(real, withClear) {
  const readable = new Map(real.pictures.map((p) => [p.id, p]))
  const clearGround = withClear ? await ownClearGrounds(real) : new Set()
  return (real.brief?.assets ?? [])
    .filter((a) => readable.has(a?.id))
    .map((a) => ({
      ...a,
      width: readable.get(a.id).width,
      height: readable.get(a.id).height,
      ...(clearGround.has(a.id) ? { hasAlpha: true } : {})
    }))
}

/**
 * The owner's pictures with a clean clear ground (every corner fully transparent: an object or a person already cut, not
 * a photo with rounded corners): only these may stand in a cut-out slot as they are. One that cannot be read is not one.
 * @param {{pictures: Array<{id: string}>, bytes: (id: string) => Promise<Uint8Array | null>}} real
 * @returns {Promise<Set<string>>}
 */
export async function ownClearGrounds(real) {
  const out = new Set()
  await pool(
    real.pictures.map((p) => async () => {
      const bytes = await Promise.resolve(real.bytes(p.id)).catch(() => null)
      if (bytes && (await clearCorners(bytes))) out.add(p.id)
    }),
    READ_AT_ONCE
  )
  return out
}

/** Whether all four corners of a picture are fully transparent. @param {Uint8Array} bytes */
async function clearCorners(bytes) {
  try {
    const image = sharp(Buffer.from(bytes), { failOn: 'none', limitInputPixels: 100_000_000 })
    const meta = await image.metadata()
    if (!meta.hasAlpha || !meta.width || !meta.height) return false
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alpha = (x, y) => data[(y * info.width + x) * info.channels + info.channels - 1]
    const w = info.width - 1
    const h = info.height - 1
    return [alpha(0, 0), alpha(w, 0), alpha(0, h), alpha(w, h)].every((a) => a < 16)
  } catch {
    return false
  }
}
