// The whole kit in one run, the same for every template: crawl and capture, the minimum of every list (row
// sets found on their own, sparse rows caught and a centering fix tried), every picture frame measured and
// emptied, icons classified by the vision door, the kit assembled, contact sheets and the review sheet.
// Nothing here knows a template: what differs per template is read from the site and the contract.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runSite } from '../site-cli.mjs'
import { assembleKit, readIf, readJson, writeJson } from './assemble.mjs'
import { crawlSite, httpFetcher } from './crawl.mjs'
import { classifyIcons, mergeClasses } from './icon-classify.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { measureFrames } from './measure-frames.mjs'
import { measureMin } from './measure-min.mjs'
import { measureWordsLinks } from './measure-words-links.mjs'
import { pictureBytes } from './picture-bytes.mjs'
import { matchRepeat } from './rows.mjs'
import { captureSite, phase, reshootChanged } from './capture-site.mjs'
import { applyExclusions, seedsOf } from './read-pass.mjs'
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
    // The page the block was cut from: its reading (rows, boxes) is the one the list was built on.
    const slug = rec?.widths?.[desk]?.shotOn ?? rec?.widths?.[desk]?.pages?.[0]
    if (!slug) continue
    const used = new Set()
    for (const l of b.lists) {
      // A measured list is kept: a person's always, the pipeline's own unless asked to measure again, or unless it
      // was judged left-packed before the alignment around the rows was read (that judgement may be wrong).
      const had = existing[l.id]
      const stale = had?.auto && had.sparseRow === 'left-packed' && !had.context
      if ((had && (!had.auto || (!remeasure && !stale))) || l.minSource === 'content map') continue
      let repeat
      let max
      if (l.rowKind === 'items' && l.maxEvidence?.rows) {
        if (!(l.maxEvidence.rowsShown >= 2)) continue
        repeat = l.maxEvidence.rows
        max = l.maxEvidence.rowsShown
      } else {
        // A card row, or a block's item list (the cards of the items it shows): the row set of that many rows. An
        // items list tries the count of items the map saw, then its maximum (the page may show one item the map
        // leaves out, such as an author with no shipped user).
        const sizes = l.rowKind === 'items' ? [...new Set([l.shown?.length, l.max])] : [l.max]
        let r = null
        let size = null
        for (const n of sizes.filter((n) => n >= 2)) {
          r = matchRepeat(rec.widths[desk].details?.repeats, n, used)
          if (r) {
            size = n
            break
          }
        }
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
async function classifyKitIcons({ kit, out, trade, log, site }) {
  const file = join(out, 'icon-classes.json')
  const existing = readIf(file) ?? {}
  const ask = { icons: [], faces: [] }
  const wanted = []
  for (const b of kit.blocks)
    for (const f of b.frames) {
      if (f.twinOf || existing[f.id] || !f.picture) continue
      const q = f.kind === 'icon' ? 'icons' : f.kind === 'photo' || f.kind === 'cutout' ? 'faces' : null
      if (q) wanted.push({ q, f })
    }
  const { visionDoor } = await import(`${VISION}picture-vision.js`)
  const door = visionDoor(process.env)
  if (!wanted.length || !door) {
    if (wanted.length) log('classes: no vision door (TRACY_VISION_API_KEY): left unclassified', wanted.length)
    return
  }
  // The picture files themselves, not crops of the page: nothing is screenshotted for this.
  const bytes = await pictureBytes({
    ...site,
    pictures: wanted.map(({ f }) => ({ id: f.id, path: f.picture }))
  })
  for (const { q, f } of wanted)
    if (bytes.has(f.id))
      ask[q].push({ id: f.id, bytes: bytes.get(f.id), note: f.role ? `field ${f.role}` : '' })
  const waiting = ask.icons.length + ask.faces.length
  if (!waiting) return
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
    const tr = phase(log, 'reshoot')
    await reshootChanged({ o, out, tool, chromium, map, capture, hide: { paths: hide, hosts }, log })
    tr.done()
  } else {
    const r = await captureSite({ o, out, tool, chromium, map, widths, log })
    capture = r.capture
    hide = r.hide
  }
  const hideArg = { paths: hide, hosts }
  // The site part (logo spots, colours, head, forms, main titles); with no --db-command/--files-command it
  // reads the pages only and names what it could not read in errors. A failure leaves no site.json behind.
  rmSync(join(out, 'site.json'), { force: true })
  let t = phase(log, 'site')
  try {
    await runSite({ o, out, chromium, capture, log: (...a) => log('site', ...a) })
  } catch (e) {
    log('site part failed', e.message)
  }
  t.done()
  let kit = await assembleKit(o, out, tool)
  // The icon each link draws and whether each piece of template words can be taken off (DOM only).
  t = phase(log, 'words and links')
  try {
    await measureWordsLinks({
      chromium,
      siteUrl: o.site,
      hostHeader: host,
      kit,
      capture,
      map,
      out,
      hide: hideArg,
      log
    })
  } catch (e) {
    log('words and links failed', e.message)
  }
  t.done()
  kit = await assembleKit(o, out, tool)
  t = phase(log, 'min')
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
        hide: hideArg
      })
      minEv[job.listId] = { ...ev, rowKind: job.rowKind, auto: true }
      writeJson(minFile, minEv)
      log('min', job.listId, ev.min, 'of', job.max, ev.sparseRow)
    } catch (e) {
      log('min failed', job.listId, e.message)
    }
  }
  t.done()
  const fixes = templateFixes(minEv)
  writeJson(join(out, 'template-fixes.json'), fixes)
  t = phase(log, 'frames')
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
  t.done()
  kit = await assembleKit(o, out, tool)
  t = phase(log, 'classify')
  const manifest = readJson(join(o.contract, 'manifest.json'))
  const trade = typeof o.trade === 'string' ? o.trade : `the template named "${manifest.template}"`
  await classifyKitIcons({ kit, out, trade, log, site: { chromium, siteUrl: o.site, hostHeader: host } })
  t.done()
  t = phase(log, 'assemble, sheets and pack')
  kit = await assembleKit(o, out, tool)
  for (const kind of ['blocks', 'review']) {
    const r = await writeSheets({ out, kit, kind, fixes: fixes.fixes })
    log('sheet', kind, r.count, 'items on', r.files.length, 'page(s)')
  }
  const pack = packKitFolder(out)
  log('pack', pack.file, pack.images, 'images,', pack.blocksWithoutImage.length, 'blocks without a shot')
  t.done()
  return { kit, capture, fixes, pack }
}
