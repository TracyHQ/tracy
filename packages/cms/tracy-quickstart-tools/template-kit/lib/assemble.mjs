// template-kit.json from what is on disk in the kit folder: capture-index.json, min-evidence.json,
// frame-evidence.json, icon-classes.json, frame-review.json (a person's canHide verdicts), site.json (the site
// part), template-fixes.json, gap-accepts.json (a person's accepted template gaps), reach-accepts.json (a person's
// reasons for reach and row pair check failures, check-accepts.mjs) and card-fields.json (a person's
// decision of which item field a card prints), text-fit.json (the character limit each text frame holds), plus the
// stamp.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readManifest } from './contract-manifest.mjs'
import { readCheckAccepts } from './check-accepts.mjs'
import { readContractCoverage, readContractMap } from './contract-read.mjs'
import { applyCoverage, coverageGate } from './coverage-gate.mjs'
import { httpFetcher } from './crawl.mjs'
import { buildKit } from './kit.mjs'
import { mergeSite } from './kit-site.mjs'
import { fixedLinkLabels, linkLabelChecks } from './link-label-reasons.mjs'
import { keepLooks } from './looks.mjs'
import { keepEmbeddedMaps, reachChecks } from './reach-checks.mjs'
import { pairListRows, rowPairChecks } from './row-pairs.mjs'
import { showcaseViewFor, templateFileOf } from './site/adapters/index.mjs'
import { logoFrameIds } from './site/logo-spots.mjs'
import { slotOwnerChecks } from './slot-owners.mjs'
import { slotShapeChecks } from './slot-shape-checks.mjs'
import { buildStamp, imageChecksums } from './stamp.mjs'
import { fixesOf } from './template-fixes.mjs'
import { errorsBesideGaps, templateGaps } from './template-gaps.mjs'
import { limitChecks } from './text-limits.mjs'

export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
export const readIf = (f) => (existsSync(f) ? readJson(f) : null)
export const writeJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 1)}\n`)
/** A person's reasons for reach and row pair check failures in the kit work folder `out` (check-accepts.mjs). */
export const reachAcceptsOf = (out) => readCheckAccepts(join(out, 'reach-accepts.json'))

/**
 * An EmDash theme's version: its `package.json` in the site folder (`--webroot`), the file the theme is released from;
 * without a folder, the version of the contract, which is the theme's own (`contracts/<version>`).
 */
function emdashTemplateVersion(o, manifest) {
  const webroot = typeof o.webroot === 'string' ? o.webroot : null
  const file = webroot ? join(webroot, 'package.json') : null
  if (file && existsSync(file)) {
    const version = readJson(file).version
    if (typeof version === 'string') return { version, from: 'package.json in the site folder' }
  }
  return {
    version: manifest.quickstart?.version ?? null,
    from: 'the contract folder name (no --webroot to read package.json)'
  }
}

/** The template version: the flag, else the one already in the kit, else the template's own file read on the site. */
async function templateVersion(o, manifest, previous) {
  if (typeof o['template-version'] === 'string')
    return { version: o['template-version'], from: 'flag --template-version' }
  if (previous?.version) return { version: previous.version, from: previous.measuredFrom }
  if (manifest.platform === 'emdash') return emdashTemplateVersion(o, manifest)
  const file = templateFileOf(manifest)
  if (!file) return { version: null, from: 'the contract names no template' }
  const host = typeof o['host-header'] === 'string' ? o['host-header'] : undefined
  const r = await httpFetcher({ siteUrl: o.site, hostHeader: host })(new URL(file.path, o.site).href)
  const version = r.status === 200 ? file.versionOf(r.html) : null
  return { version, from: version ? `${file.path} on the site` : `${file.path} answered ${r.status}` }
}

/** Assemble and write template-kit.json; returns the kit. */
export async function assembleKit(o, out, tool) {
  const capture = readJson(join(out, 'capture-index.json'))
  const manifest = readManifest(o.contract, {
    release: typeof o['release-tag'] === 'string' ? o['release-tag'] : undefined
  })
  const previous = readIf(join(out, 'template-kit.json'))
  const tv = await templateVersion(o, manifest, previous?.template)
  const stamp = buildStamp({
    manifest,
    templateVersion: tv.version,
    templateVersionFrom: tv.from,
    images: imageChecksums(join(out, 'images')),
    tool
  })
  if (typeof o['quickstart-version'] === 'string') stamp.quickstart.version = o['quickstart-version']
  const host = typeof o['host-header'] === 'string' ? o['host-header'] : null
  const map = readContractMap(o.contract)
  const siteDoc = readIf(join(out, 'site.json'))
  const wordsLinks = readIf(join(out, 'words-links.json')) ?? {}
  const frameEvidence = readIf(join(out, 'frame-evidence.json')) ?? {}
  const kit = buildKit({
    map,
    capture,
    stamp,
    coverage: readContractCoverage(o.contract),
    minEvidence: readIf(join(out, 'min-evidence.json')) ?? {},
    cardFields: readIf(join(out, 'card-fields.json')) ?? {},
    frameKit: {
      evidence: frameEvidence,
      classes: readIf(join(out, 'icon-classes.json')) ?? {},
      review: readIf(join(out, 'frame-review.json')) ?? {},
      logoIds: logoFrameIds(map, siteDoc?.site)
    },
    wordsLinks,
    textFit: readIf(join(out, 'text-fit.json')) ?? {},
    showcaseView: showcaseViewFor(manifest.platform),
    siteUrl: o.site,
    aliasHosts: host ? [host] : []
  })
  mergeSite(kit, siteDoc, map, wordsLinks, previous)
  // What the platform's content map does not declare (a WordPress map has no menu blocks or item lists): the kit
  // leaves those fields empty and says why, once each (wordpress-map.mjs).
  for (const g of map.platformGaps ?? [])
    kit.errors.push({ kind: 'not-on-platform', field: g.field, reason: g.reason })
  // A WordPress page whose post content could not be split into its sections (wordpress-map.mjs).
  for (const g of map.sectionGaps ?? [])
    kit.errors.push({ kind: 'missing', field: g.field, reason: g.reason })
  // The coverage gate (coverage-gate.mjs): complete the kit from the contract, then count what it still lacks. The
  // list and owner checks run again over the completed kit.
  const desk = String(capture.widths?.[0] ?? '1440')
  const readings = new Map(
    Object.entries(capture.blocks ?? {}).map(([id, r]) => [id, r.widths?.[desk]?.details ?? null])
  )
  applyCoverage(kit, {
    map,
    readings,
    textFit: readIf(join(out, 'text-fit.json')) ?? {},
    rowFit: readIf(join(out, 'row-fit.json')) ?? {},
    drives: readIf(join(out, 'field-drives.json')) ?? {},
    classes: readIf(join(out, 'icon-classes.json')) ?? {}
  })
  // Which text slots print in the same card as each list row's picture (row-pairs.mjs, from the frames pass).
  pairListRows(kit, frameEvidence)
  kit.errors = kit.errors.filter((e) => !/^(list-limits-differ|slot-in-two-blocks)$/.test(e.kind))
  kit.checks.listLimitsDiffering = limitChecks({ blocks: kit.blocks, errors: kit.errors })
  kit.checks.slotsInTwoBlocks = slotOwnerChecks({ blocks: kit.blocks, errors: kit.errors })
  kit.checks.slotCoverage = coverageGate(kit, {
    map,
    readings,
    gapAccepts: readIf(join(out, 'gap-accepts.json')) ?? {},
    accepts: reachAcceptsOf(out)
  })
  // Text slot shape against the content map: whole samples, sentence groups, inline marks (slot-shape-checks.mjs).
  slotShapeChecks(kit, { map, contentCoverage: readIf(join(o.contract, 'content-coverage.json')) ?? null })
  // What a visitor reaches: a button with no door, a map no slot moves, a phone outside a link (reach-checks.mjs).
  keepEmbeddedMaps(kit, readings)
  const accepts = reachAcceptsOf(out)
  reachChecks(kit, { accepts })
  // A list mixing a lone row with card rows, where a card row pairs no text slot (row-pairs.mjs).
  rowPairChecks(kit, { accepts })
  // One source for a link's label: its labelId, or the reason its words are fixed (link-label-reasons.mjs).
  fixedLinkLabels(kit)
  kit.checks.linksWithoutLabel = linkLabelChecks({ kit, errors: kit.errors })
  const unchecked = kit.blocks.flatMap((b) => b.frames.filter((f) => f.faces === null && !f.twinOf))
  if (unchecked.length)
    kit.errors.push({
      kind: 'missing',
      field: 'frames[].faces',
      reason: `${unchecked.length} pictures not checked for strangers' faces (no model answer and no person entry in icon-classes.json)`,
      frames: unchecked.map((f) => f.id)
    })
  // A dead path is a defect of the demo, not a measurement the kit missed: it is a gap, not an error.
  kit.errors = kit.errors.filter((e) => e.kind !== 'dead-path')
  kit.templateGaps = templateGaps({
    kit,
    mainHeadings: siteDoc?.mainHeadings,
    dead: capture.dead,
    fixes: fixesOf(readIf(join(out, 'template-fixes.json'))),
    accepts: readIf(join(out, 'gap-accepts.json')) ?? {}
  })
  kit.errors = errorsBesideGaps(kit.errors, kit.templateGaps)
  if (!kit.template.version) kit.errors.push({ kind: 'missing', field: 'template.version', reason: tv.from })
  // A look (looks.mjs) is written by a person's Claude Code once per kit version: a shot that did not change keeps it.
  keepLooks(kit, previous)
  writeJson(join(out, 'template-kit.json'), kit)
  return kit
}
