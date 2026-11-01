// The whole kit in one run, the same for every template: crawl and capture, the minimum of every list (row
// sets found on their own, sparse rows caught and a centering fix tried), every picture frame measured and
// emptied, icons classified by the vision door, the kit assembled, contact sheets and the review sheet.
// Nothing here knows a template: what differs per template is read from the site and the contract.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runSite } from '../site-cli.mjs'
import { assembleKit, readIf, readJson, writeJson } from './assemble.mjs'
import { crawlSite, httpFetcher } from './crawl.mjs'
import { classifyIcons, mergeClasses } from './icon-classify.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { measureFrames } from './measure-frames.mjs'
import { measureMin } from './measure-min.mjs'
import { matchRepeat } from './rows.mjs'
import { applyExclusions, runCapture, seedsOf } from './run-capture.mjs'
import { writeLayoutProfiles } from './layout-profiles.mjs'
import { packKitFolder } from './pack.mjs'
import { writeSheets } from './sheets.mjs'
import { templateFixes } from './template-fixes.mjs'

const VISION = '../../../../../apps/tracy-web/src/lib/'

/** Every list whose minimum can be measured, with the row set to remove rows from. */
export function minPlan(kit, capture, existing = {}, { remeasure = false } = {}) {
  const desk = String(kit.widths[0])
  const pathOfSlug = new Map(capture.pages.map((p) => [p.slug, p.path]))
  const jobs = []
  for (const b of kit.blocks) {
    const rec = capture.blocks[b.id]
    const slug = rec?.widths?.[desk]?.pages?.[0]
    if (!slug) continue
    const used = new Set()
    for (const l of b.lists) {
      // A measured list is kept: a person's always, the pipeline's own unless asked to measure again.
      const had = existing[l.id]
      if ((had && (!had.auto || !remeasure)) || l.minSource === 'content map') continue
      let repeat
      let max
      if (l.rowKind === 'items' && l.maxEvidence?.rows) {
        if (!(l.maxEvidence.rowsShown >= 2)) continue
        repeat = l.maxEvidence.rows
        max = l.maxEvidence.rowsShown
      } else {
        // A card row, or a block's item list (the cards of the items it shows): the row set of that many rows.
        const size = l.rowKind === 'items' ? (l.shown?.length ?? l.max) : l.max
        if (!(size >= 2)) continue
        const r = matchRepeat(rec.widths[desk].details?.repeats, size, used)
        if (!r || r.inSlider || r.inTabs || r.shownCount === 0) continue
        repeat = { path: r.path, shape: r.shape }
        max = size
      }
      jobs.push({
        listId: l.id,
        rowKind: l.rowKind,
        source: rec.source,
        path: pathOfSlug.get(slug),
        max,
        repeat
      })
    }
  }
  return jobs
}

/** Classify by looking: icons (fixed or demo) and pictures that may show faces (demo-faces or not). */
async function classifyKitIcons({ kit, out, trade, log }) {
  const file = join(out, 'icon-classes.json')
  const existing = readIf(file) ?? {}
  const desk = kit.widths[0]
  const ask = { icons: [], faces: [] }
  for (const b of kit.blocks)
    for (const f of b.frames) {
      const crop = join(out, 'images', `${f.id}-crop-${desk}.jpg`)
      if (f.twinOf || existing[f.id] || !existsSync(crop)) continue
      const q = f.kind === 'icon' ? 'icons' : f.kind === 'photo' || f.kind === 'cutout' ? 'faces' : null
      if (q) ask[q].push({ id: f.id, bytes: readFileSync(crop), note: f.role ? `field ${f.role}` : '' })
    }
  const { visionDoor } = await import(`${VISION}picture-vision.js`)
  const door = visionDoor(process.env)
  const waiting = ask.icons.length + ask.faces.length
  if (!waiting || !door) {
    if (waiting) log('classes: no vision door (TRACY_VISION_API_KEY): left unclassified', waiting)
    return
  }
  const vc = await import(`${VISION}vision-challenge.js`)
  let all = existing
  for (const question of ['icons', 'faces']) {
    if (!ask[question].length) continue
    const { classes, unanswered } = await classifyIcons({
      door,
      icons: ask[question],
      trade,
      question,
      challengeFor: vc.createVisionChallenge,
      codeMatches: vc.imageCodeMatches,
      instruction: vc.IMAGE_CODE_INSTRUCTION
    })
    all = mergeClasses(all, classes)
    log(question, 'classified', Object.keys(classes).length, 'unanswered', unanswered.length)
  }
  writeJson(file, all)
}

/**
 * @param {{o: object, out: string, tool: string, chromium: object, log: Function}} a
 */
export async function runFull({ o, out, tool, chromium, log }) {
  const map = readJson(join(o.contract, 'content-map.json'))
  const host = typeof o['host-header'] === 'string' ? o['host-header'] : undefined
  const hosts = host ? [host] : []
  const widths = String(o.widths ?? '1440,390')
    .split(',')
    .map(Number)
    .filter(Boolean)
  const patterns = typeof o['exclude-path'] === 'string' ? o['exclude-path'].split(',') : []
  let capture
  let hide
  if (o['reuse-capture'] && existsSync(join(out, 'capture-index.json'))) {
    capture = readJson(join(out, 'capture-index.json'))
    const fetchPage = httpFetcher({ siteUrl: o.site, hostHeader: host })
    const crawl = await crawlSite({ seeds: seedsOf(map), fetchPage, siteUrl: o.site, aliasHosts: hosts })
    hide = applyExclusions(crawl, { map, patterns }).hide
  } else {
    const { hide: left, ...rest } = await runCapture({
      chromium,
      siteUrl: o.site,
      hostHeader: host,
      map,
      out,
      widths,
      cap: Number(o['max-pages'] ?? 400),
      only: typeof o.only === 'string' ? o.only.split(',') : undefined,
      excludePaths: patterns
    })
    capture = rest
    hide = left
    writeJson(join(out, 'capture-index.json'), capture)
  }
  const hideArg = { paths: hide, hosts }
  // The site part (logo spots, colours, head, forms, main titles); with no --db-command/--files-command it
  // reads the pages only and names what it could not read in errors. A failure leaves no site.json behind.
  rmSync(join(out, 'site.json'), { force: true })
  try {
    await runSite({ o, out, chromium, capture, log: (...a) => log('site', ...a) })
  } catch (e) {
    log('site part failed', e.message)
  }
  let kit = await assembleKit(o, out, tool)
  // How each body shot is laid out, for telling pages of one layout apart (layouts.mjs); assembled again with it.
  await writeLayoutProfiles({ chromium, out, kit })
  kit = await assembleKit(o, out, tool)
  const minFile = join(out, 'min-evidence.json')
  const minEv = readIf(minFile) ?? {}
  const idx = indexMap(map)
  for (const job of minPlan(kit, capture, minEv, { remeasure: !!o.remeasure })) {
    try {
      const ev = await measureMin({
        chromium,
        siteUrl: o.site,
        hostHeader: host,
        url: urlOfPath(job.path, o.site),
        assigned: assignedAt(idx, job.path),
        source: job.source,
        listId: job.listId,
        max: job.max,
        repeat: job.repeat,
        widths,
        out,
        hide: hideArg
      })
      minEv[job.listId] = { ...ev, rowKind: job.rowKind, auto: true }
      writeJson(minFile, minEv)
      log('min', job.listId, ev.min, 'of', job.max, ev.sparseRow)
    } catch (e) {
      log('min failed', job.listId, e.message)
    }
  }
  const fixes = templateFixes(minEv)
  writeJson(join(out, 'template-fixes.json'), fixes)
  // Frames of pages sharing a layout are emptied once, on the layout's exemplar page (layouts.mjs).
  const inherit = new Map(
    kit.blocks.flatMap((b) => (b.frames ?? []).filter((f) => f.canHideFrom).map((f) => [f.id, f.canHideFrom]))
  )
  log('frames', inherit.size, 'take canHide from the same place on a page of the same layout')
  await measureFrames({
    chromium,
    siteUrl: o.site,
    hostHeader: host,
    capture,
    map,
    out,
    hide: hideArg,
    inherit,
    log
  })
  kit = await assembleKit(o, out, tool)
  const manifest = readJson(join(o.contract, 'manifest.json'))
  const trade = typeof o.trade === 'string' ? o.trade : `the template named "${manifest.template}"`
  await classifyKitIcons({ kit, out, trade, log })
  kit = await assembleKit(o, out, tool)
  for (const kind of ['blocks', 'evidence', 'review']) {
    const r = await writeSheets({ out, kit, chromium, kind, fixes: fixes.fixes })
    log('sheet', kind, r.count, 'items on', r.files.length, 'page(s)')
  }
  const pack = packKitFolder(out)
  log('pack', pack.file, pack.images, 'images,', pack.blocksWithoutImage.length, 'blocks without a shot')
  return { kit, capture, fixes, pack }
}
