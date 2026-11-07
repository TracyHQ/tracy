#!/usr/bin/env node
// Template kit: the pack made once per template version and reused by every site build, in one file
// (template-kit.json) beside its images. Every page is read (DOM only), grouped by layout, and only what the pack
// holds is shot: per page group one overview image and per block id one clean image, at 1440 and 390; per block its lists (with measured minimums), picture frames (kind, size, canHide, twins, fixed),
// links, template words and demo facts; a version stamp and every gap in `errors`. Read-only on the site.
//
//   cli.mjs build --site <url> [--host-header <host>] --contract <dir> --out <dir> --full
//                 [--reuse-capture] [--trade <words>] [--widths 1440,390] [--max-pages 400] [--only /,/a]
//                 [--template-version x.y.z] [--exclude-path '/test-*,/other']  (a comma inside a pattern: \,)
//                 [--db-command '<client prefix>' | --db mysql://...] [--files-command '<prefix>' --webroot <dir>]
//       --full: the whole pipeline (README "Make a kit for a new template"); without it, read + shoot + assemble only.
//       The database and file reads feed the site part (site-cli.mjs); without them it reads the pages only.
//   cli.mjs assemble ...  (template-kit.json again from the files in --out, no browser)
//       build and assemble keep the site fields a person declared on the kit already in --out (the declare commands
//       below, lib/declared-site-fields.mjs), as written; a build into an empty folder has none to keep.
//   cli.mjs measure-min ... --list <id> --page <path> --max <rows> [--block <id>] [--rows <css>] [--row-kind items]
//                 [--note <why>]   (an override: a person's measurement of one list; the pipeline keeps it)
//   cli.mjs sheet --out <dir> [--review]   (HTML pages of the kit's own images; nothing is shot)
//   cli.mjs approve --out <dir> --by <login>   (ONLY a person, after the review sheet: seals the PACK's image set,
//                 in pack/template-kit.json, the file committed beside the contract)
//   cli.mjs relabel --out <dir> --contract <dir>   (the link labels of the template-kit.json in --out settled
//                 again from the content map: labelId or a fixed-text reason per link; no browser, no capture, no image)
//   cli.mjs setting-slots --out <dir> --contract <dir> [--db-command '<client prefix>' | --db mysql://...]
//                 [--files-command '<prefix>'] [--webroot <dir>]
//                 (the setting slots of the template-kit.json in --out settled again: the map a button opens, read
//                 from the site's database, the contact's mobile line, and with --webroot the picture the template
//                 paints behind its pages; no browser, no capture, no image)
//   cli.mjs slot-roles --out <dir> --contract <dir>   (the template-kit.json in --out settled again from the content
//                 map and field-drives.json: page title slots, sentence groups, stored fields, the gate counted
//                 again; no browser, no capture, no image; it only adds, no slot id, list or role moves)
//                 [--only sentences]: only the sentence groups (a kit whose page titles are not settled yet keeps its gate)
//   cli.mjs samples --out <dir> --contract <dir>   (the text slot samples of the template-kit.json in --out settled
//                 again from the content map: every text slot's whole demo text as `sample` and its lengths as
//                 `demoChars`, its inline emphasis as `inline`; no browser, no capture, no image; nothing else moves, so
//                 an approval stays valid)
//   Every settle command (samples, slot-roles, relabel, setting-slots) counts the slot shape checks again
//   (lib/slot-shape-checks.mjs: samplesCut, sentenceGroupsUnsettled, inlineEmphasisMissing), the reach checks and
//   the row pair check (lib/row-pairs.mjs: rowPartsUnpaired), each with the reasons of reach-accepts.json in --out
//   (lib/check-accepts.mjs), and stamps `tool` and `settledAt`.
//   cli.mjs measure-fields --site <url> --out <dir> --contract <dir> --db-command '<client prefix>' --scratch-site
//                 [--host-header <host>]   (WRITES to the site, each field set to a marker and put back: only on a
//                 throwaway site rebuilt from the quickstart, which --scratch-site says it is; field-drives.json)
//   cli.mjs pack --out <dir>   (pack/ and <name>.zip: only the images a site build reads; fails on a block without
//                 its shot; build --full runs it last)
//   cli.mjs looks --kit <template-kit.json> [--images <dir>] --list [--to <worklist.json>]
//                 (the packed 1440 page and block shots without a current look: id, sha256, absolute file path;
//                 --images is the folder the image paths are relative to, the kit's own folder by default)
//   cli.mjs looks --kit <template-kit.json> --apply <looks.json>   (merge [{image, sha256, text}] written by the
//                 packager's own Claude Code: all entries checked, none written when one is wrong; lib/looks.mjs)
//   cli.mjs legal-layout --kit <template-kit.json> --layout '<template>:<file>' --why '<what it prints>'
//                 (WordPress kit: --layout '<template>' or '<theme>//<template>' --webroot <dir holding the theme>)
//   cli.mjs legal-layout --kit <template-kit.json> --none --why '<words>'
//                 (site.createdPageLayouts.legal, lib/legal-layout.mjs: the plain article layout a created legal page
//                 prints through, never a content page's own file; --none: the component's default. A person reads the
//                 template's article layouts first; nothing is measured, and no image moves, so an approval stays valid)
//   cli.mjs video-buttons --kit <template-kit.json> --selector '<css>' --why '<where the template prints it>'
//   cli.mjs video-buttons --kit <template-kit.json> --none --why '<what was read>'
//                 (site.emptyVideoButtons, lib/video-buttons.mjs: a play button the template prints with an empty video
//                 address, which the write step hides with one CSS rule; --none says the template has none, with its reason in
//                 site.noneWhy (lib/none-why.mjs; every --none of these four commands needs --why). A person reads
//                 the template's layout first; nothing is measured, and no image moves, so an approval stays valid)
//   cli.mjs self-link-buttons --kit <template-kit.json> --container '<css>' --why '<where the template prints it>'
//   cli.mjs self-link-buttons --kit <template-kit.json> --none --why '<what was read>'
//                 (site.selfLinkButtons, lib/self-link-buttons.mjs: the container of a "more" button that may lead to the
//                 page it sits on, which the write step hides on that page only; same reading, no image moves)
//   cli.mjs hidden-page-links --kit <template-kit.json> --container '<css>' --why '<where the template prints it>'
//   cli.mjs hidden-page-links --kit <template-kit.json> --none --why '<what was read>'
//                 (site.hiddenPageLinks: the container of list row links that may lead to a page the plan hides, which the
//                 write step sends to a living page or makes plain text; same reading, no image moves)
//   cli.mjs created-page-hide --kit <template-kit.json> --selector '<css>' --why '<where the template prints it>'
//   cli.mjs created-page-hide --kit <template-kit.json> --none --why '<what was read>'
//                 (site.createdPageHide: a block the template prints hard coded on every article page, such as a share bar,
//                 which the write step hides on the pages it creates only; same reading, no image moves)
//   cli.mjs stock-screens --kit <template-kit.json> --path '<path or path/*>' --why '<why no customer content fills it>'
//   cli.mjs stock-screens --kit <template-kit.json> --none --why '<what was read>'
//                 (site.stockScreens, lib/stock-screens.mjs: a stock screen every plan drops, such as a list of demo writers; the
//                 planner drops it after the model and the write step unpublishes its menu item; same reading, no image moves)
//   cli.mjs baseline --from <measured baseline.json> --contract <dir>
//                 (step 0, #419: demo-baseline.json beside the contract, lib/demo-baseline-file.mjs, from the demo baseline
//                 tracy-web measured on the untouched quickstart site with apps/tracy-web/scripts/site-check-baseline.mjs;
//                 only tracy-web reaches a site's host, so the measuring is there and the writing here. The measuring
//                 time is dropped and a value naming a machine refuses the file; nothing else of the kit moves)
//
// Exit: 0 kit written · 1 written, but a page failed to capture or the page cap was reached · 2 usage or run error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { assembleKit, reachAcceptsOf, readIf, readJson, writeJson } from './lib/assemble.mjs'
import { captureSite } from './lib/capture-site.mjs'
import { readContractMap, readContractSamples } from './lib/contract-read.mjs'
import { contactFieldChecks } from './lib/coverage-gate.mjs'
import { DECLARED_SITE_FIELDS } from './lib/declared-site-fields.mjs'
import { BASELINE_FILE, contractBaselineOf } from './lib/demo-baseline-file.mjs'
import { urlOfPath } from './lib/kit-paths.mjs'
import { declareLegalLayout, themeTemplatesOf } from './lib/legal-layout.mjs'
import { relabelKit } from './lib/link-label-reasons.mjs'
import { linkLabelSlots } from './lib/link-label-slots.mjs'
import { applyLooks, indentOf, lookWorklist } from './lib/looks.mjs'
import { assignedAt, indexMap } from './lib/map-index.mjs'
import { measureMin } from './lib/measure-min.mjs'
import { approvePack, packKitFolder } from './lib/pack.mjs'
import { runFull } from './lib/pipeline.mjs'
import { reachChecks } from './lib/reach-checks.mjs'
import { rowPairChecks } from './lib/row-pairs.mjs'
import { settleSentenceGroups } from './lib/sentence-groups.mjs'
import { settleSettingSlots } from './lib/setting-slots.mjs'
import { writeSheets } from './lib/sheets.mjs'
import { adapterFor, usePlatform } from './lib/site/adapters/index.mjs'
import { siteSource } from './lib/site/adapters/source.mjs'
import { runFieldMeasure } from './lib/site/measure-fields.mjs'
import { settleWordPressSections } from './lib/site/wordpress-sections-file.mjs'
import { settleSlotRoles } from './lib/slot-roles.mjs'
import { settleSamples } from './lib/slot-samples.mjs'
import { slotShapeChecks } from './lib/slot-shape-checks.mjs'
import { fixesOf, templateFixes } from './lib/template-fixes.mjs'
import { stampSettled, TOOL } from './lib/version.mjs'

const COMMANDS = [
  'build',
  'assemble',
  'measure-min',
  'sheet',
  'approve',
  'pack',
  'relabel',
  'setting-slots',
  'slot-roles',
  'samples',
  'measure-fields',
  'looks'
]
const NO_SITE = ['sheet', 'approve', 'pack', 'relabel', 'setting-slots', 'slot-roles', 'samples']
// The no-browser commands that settle a written kit again from the contract.
const SETTLE = ['relabel', 'setting-slots', 'slot-roles', 'samples']

export function parseArgs(argv) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) o._.push(a)
    else o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

/** The content coverage file beside the contract (its `inlineMarkup` measurement), null when there is none. */
const contentCoverageOf = (o) => readIf(join(o.contract, 'content-coverage.json')) ?? null

/** A settled kit: its slot shape checks counted again from the content map, and the tool that settled it. */
const settled = (kit, map, o) => {
  slotShapeChecks(kit, { map, contentCoverage: contentCoverageOf(o) })
  // A person's reasons for reach and row pair failures the template keeps (reach-accepts.json, lib/check-accepts.mjs).
  const accepts = reachAcceptsOf(resolve(o.out))
  reachChecks(kit, { accepts })
  rowPairChecks(kit, { accepts })
  return stampSettled(kit)
}

const str = (v) => (typeof v === 'string' ? v : undefined)
const log = (...a) => console.error('[template-kit]', ...a)

async function chromiumOf() {
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
  return mod.chromium ?? mod.default?.chromium
}

async function sheet(o, out) {
  const kind = o.review ? 'review' : 'blocks'
  const fixes = fixesOf(readIf(join(out, 'template-fixes.json')))
  const kit = readJson(join(out, 'template-kit.json'))
  const r = await writeSheets({ out, kit, kind, fixes })
  console.log(`${r.count} items on ${r.files.length} sheet(s) in ${join(out, 'contact-sheet')}`)
}

/** A person's approval of the image set they looked at; refused when any image on disk differs from the kit. */
function approve(o, out) {
  if (!str(o.by)) throw new Error('approve needs --by <login>')
  const { approval, pack } = approvePack(out, o.by)
  console.log(
    `pack approved by ${o.by}: ${pack.images} images, ${approval.imagesSha256}; ${pack.file} ${pack.sha256}`
  )
  return 0
}

/** The pack (pack.mjs): exit 1 when a block a page lists has no shot, or a packed image is not in the kit. */
function pack(out) {
  const p = packKitFolder(out)
  const mb = (p.bytes / 1024 / 1024).toFixed(1)
  console.log(`${p.file}: ${p.images} images, ${mb} MB, sha256 ${p.sha256}`)
  for (const m of p.blocksWithoutImage) console.error(`block ${m.block} has no shot at ${m.width}`)
  for (const u of p.unknownImages) console.error(`packed image ${u} is not in the kit's images`)
  return p.blocksWithoutImage.length || p.unknownImages.length ? 1 : 0
}

/** Settle page titles, sentence groups and stored fields of the kit in `out` again; exit 1 when a page has no one title. */
function slotRoles(o, out) {
  const file = join(out, 'template-kit.json')
  const kit = readJson(file)
  const map = readContractSamples(o.contract)
  if (o.only === 'sentences') {
    settleSentenceGroups(kit, { map })
    writeJson(file, settled(kit, map, o))
    console.log(`${kit.blocks.flatMap((b) => b.sentences ?? []).length} sentence groups`)
    return 0
  }
  if (o.only !== undefined) throw new Error('slot-roles --only takes: sentences')
  const r = settleSlotRoles(kit, { map, drives: readIf(join(out, 'field-drives.json')) ?? {} })
  writeJson(file, settled(kit, map, o))
  console.log(JSON.stringify(r, null, 1))
  for (const f of kit.coverage.failures.filter((x) => x.part === 'pageTitleSlots'))
    console.error(`${f.where}: ${f.reason}`)
  return r.pageTitleSlots ? 1 : 0
}

/** Settle every text slot's sample, demoChars and inline of the kit in `out` again (slot-samples.mjs); exit 1 when a
 * slot shape check still fails. */
function samples(o, out) {
  const file = join(out, 'template-kit.json')
  const kit = readJson(file)
  const map = readContractSamples(o.contract)
  const r = settleSamples(kit, { map })
  writeJson(file, settled(kit, map, o))
  const { samplesCut, sentenceGroupsUnsettled, inlineEmphasisMissing, inlineMarkupLost } = kit.checks
  console.log(
    `${r.slots} text slots, ${r.changed} entries rewritten; cut before ${r.cutBefore}, after ${r.cutAfter} (${r.capped} cut at the length cap); ${r.inline} with inline marks; ${r.withoutMapSlot.length} without a content map slot`
  )
  console.log(
    JSON.stringify({ samplesCut, sentenceGroupsUnsettled, inlineEmphasisMissing, inlineMarkupLost })
  )
  return samplesCut || inlineEmphasisMissing || inlineMarkupLost ? 1 : 0
}

/** Measure what each stored field drives on a throwaway site, into field-drives.json. */
async function measureFields(o, out) {
  if (o['scratch-site'] !== true || !str(o['db-command']))
    throw new Error(
      'measure-fields writes to the site: it needs --db-command and --scratch-site, on a throwaway site rebuilt from the quickstart'
    )
  const drives = await runFieldMeasure({
    chromium: await chromiumOf(),
    siteUrl: o.site,
    hostHeader: str(o['host-header']),
    dbCommand: o['db-command'],
    kit: readJson(join(out, 'template-kit.json')),
    map: readContractSamples(o.contract),
    log
  })
  writeJson(join(out, 'field-drives.json'), drives)
  return Object.values(drives).some((d) => d.error) ? 1 : 0
}

/** Settle the link labels of the kit in `out` again (link-label-reasons.mjs); exit 1 when some link has neither. */
function relabel(o, out) {
  const file = join(out, 'template-kit.json')
  const kit = readJson(file)
  const map = readContractMap(o.contract)
  const r = relabelKit(kit, { map, linkLabelSlots })
  writeJson(file, settled(kit, map, o))
  const links = kit.blocks.flatMap((b) => b.links ?? [])
  console.log(
    `${links.filter((l) => l.labelId).length} links name their label slot, ${links.filter((l) => l.fixedLabel).length} carry a fixed-text reason (${r.set} label slots named now), linksWithoutLabel ${r.wrong}`
  )
  for (const e of kit.errors.filter((x) => x.kind === 'link-label')) console.error(`${e.field}: ${e.reason}`)
  return r.wrong ? 1 : 0
}

/**
 * Settle the setting slots of the kit in `out` again (setting-slots.mjs): the map settings are read from the site's
 * database (SELECT only); the contact field check is counted again. Exit 1 when a map button or a contact field is
 * left unresolved.
 */
function settingSlots(o, out) {
  const file = join(out, 'template-kit.json')
  const kit = readJson(file)
  const map = readContractMap(o.contract)
  const manifest = readJson(join(o.contract, 'manifest.json'))
  const source = siteSource({
    db: str(o.db),
    dbCommand: str(o['db-command']),
    filesCommand: str(o['files-command']),
    webroot: str(o.webroot)
  })
  const adapter = adapterFor(manifest.platform, source)
  const mapSettings = adapter.mapSettings?.() ?? null
  if (!mapSettings) throw new Error('setting-slots needs the site database (--db-command or --db)')
  // Without --webroot nothing is read, and the background slots the kit has are kept.
  const backgroundSettings = adapter.backgroundSettings?.() ?? null
  const r = settleSettingSlots(kit, { map, mapSettings, backgroundSettings })
  const failures = []
  const wrong = contactFieldChecks(kit, (part, where, reason) => failures.push({ part, where, reason }))
  if (kit.coverage?.parts) kit.coverage.parts.contactFieldsUnresolved = wrong
  writeJson(file, settled(kit, map, o))
  const maps = kit.blocks.flatMap((b) => (b.links ?? []).filter((l) => l.opens?.shows === 'map'))
  console.log(
    `${r.slots} setting slots: ${r.tied} of ${maps.length} map buttons tied, ${r.mobile} mobile lines opened, ${r.backgrounds} frames painted behind tied${backgroundSettings ? '' : ' (no --webroot: background slots kept)'}; contactFieldsUnresolved ${wrong}`
  )
  for (const f of failures) console.error(`${f.where}: ${f.reason}`)
  return wrong || r.tied < maps.length ? 1 : 0
}

/**
 * Looks (lib/looks.mjs): `--list` prints the shots that still need a look (exit 1 when a file is missing or differs
 * from its sha256); `--apply` merges a looks file into the kit in place, keeping its indent and key order (exit 1,
 * nothing written, when any entry is wrong). No browser, no network, no model call.
 */
function looks(o) {
  if (!str(o.kit) || (!o.list && !str(o.apply)))
    throw new Error('looks needs --kit <template-kit.json> and --list or --apply <looks.json>')
  const file = resolve(o.kit)
  const source = readFileSync(file, 'utf8')
  const kit = JSON.parse(source)
  if (o.list) {
    const w = lookWorklist(kit, resolve(str(o.images) ?? dirname(file)))
    const body = `${JSON.stringify({ kit: file, width: w.width, need: w.need }, null, 2)}\n`
    if (str(o.to)) writeFileSync(resolve(o.to), body)
    else process.stdout.write(body)
    console.error(`${w.need.length} shots need a look, ${w.current} current`)
    for (const p of w.problems) console.error(p)
    return w.problems.length ? 1 : 0
  }
  const r = applyLooks(kit, JSON.parse(readFileSync(resolve(o.apply), 'utf8')))
  for (const e of r.errors) console.error(e)
  if (r.errors.length) {
    console.error(`nothing written: ${r.errors.length} wrong entr${r.errors.length === 1 ? 'y' : 'ies'}`)
    return 1
  }
  if (r.set) writeFileSync(file, `${JSON.stringify(kit, null, indentOf(source))}\n`)
  console.log(`${r.set} looks written, ${r.unchanged} already current`)
  return 0
}

/** Name the article layout of a created legal page in a written kit (lib/legal-layout.mjs). */
function legalLayout(o) {
  if (!str(o.kit) || (!o.none && !str(o.layout)))
    throw new Error(
      "legal-layout needs --kit <template-kit.json> and --layout '<template>:<file>' --why '<words>', or --none"
    )
  const file = resolve(o.kit)
  const source = readFileSync(file, 'utf8')
  const kit = JSON.parse(source)
  // A WordPress kit's layout is checked against the block templates of its theme on --webroot.
  const templates =
    str(o.webroot) && kit.template?.name ? themeTemplatesOf(resolve(o.webroot), kit.template.name) : null
  const r = declareLegalLayout(kit, {
    layout: str(o.layout),
    why: str(o.why),
    none: o.none === true,
    templates
  })
  if (r.error) {
    console.error(`nothing written: ${r.error}`)
    return 1
  }
  if (r.changed) writeFileSync(file, `${JSON.stringify(kit, null, indentOf(source))}\n`)
  const named = kit.site.createdPageLayouts.legal.articleLayout ?? 'the default article'
  console.log(`created legal pages print through ${named}${r.changed ? '' : ', unchanged'}`)
  return 0
}

/** Declare an entry of a `site` list field in a written kit (lib/declared-site-fields.mjs names them). */
function containers(o, command, declare, field, words, flag = 'container') {
  if (!str(o.kit) || (!o.none && !str(o[flag])))
    throw new Error(
      `${command} needs --kit <template-kit.json> and --${flag} '<${flag === 'path' ? 'path' : 'css'}>' --why '<words>', or --none --why '<words>'`
    )
  const file = resolve(o.kit)
  const source = readFileSync(file, 'utf8')
  const kit = JSON.parse(source)
  const r = declare(kit, { [flag]: str(o[flag]), why: str(o.why), none: o.none === true })
  if (r.error) {
    console.error(`nothing written: ${r.error}`)
    return 1
  }
  if (r.changed) writeFileSync(file, `${JSON.stringify(kit, null, indentOf(source))}\n`)
  console.log(`${kit.site[field].length} ${words} named${r.changed ? '' : ', unchanged'}`)
  return 0
}

/** Write the measured demo baseline beside the contract (lib/demo-baseline-file.mjs). */
function baseline(o) {
  if (!str(o.from) || !str(o.contract))
    throw new Error('baseline needs --from <measured baseline.json> and --contract <dir>')
  const dir = resolve(o.contract)
  const contractId = readJson(join(dir, 'manifest.json'))?.id
  const r = contractBaselineOf(readJson(resolve(o.from)), { contractId: String(contractId) })
  if (r.error) {
    console.error(`nothing written: ${r.error}`)
    return 1
  }
  writeFileSync(join(dir, BASELINE_FILE), `${JSON.stringify(r.doc, null, 2)}\n`)
  console.log(
    `${BASELINE_FILE} of ${contractId}: ${r.doc.texts.length} texts, ${r.doc.pictures.files.length} picture files, ${r.doc.unread?.length ?? 0} pages with no demo`
  )
  return 0
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const cmd = o._[0]
  if (cmd === 'baseline') return baseline(o)
  if (cmd === 'looks') return looks(o)
  if (cmd === 'legal-layout') return legalLayout(o)
  // The hand-declared site fields: one list, shared with the merge that keeps them across assemble and build.
  const declared = DECLARED_SITE_FIELDS.find((d) => d.command === cmd)
  if (declared?.list)
    return containers(o, cmd, declared.declare, declared.field, declared.words, declared.flag)
  const needSite = !NO_SITE.includes(cmd)
  if (
    !o.out ||
    !COMMANDS.includes(cmd) ||
    (needSite && !o.site) ||
    ((needSite || SETTLE.includes(cmd)) && !o.contract)
  ) {
    console.error(
      `usage: cli.mjs ${COMMANDS.join('|')} --out <dir> [--site <url> --contract <dir>] (see the head of this file)`
    )
    return 2
  }
  const out = resolve(o.out)
  mkdirSync(join(out, 'images'), { recursive: true })
  // Page addresses are spelled the platform's way (lib/kit-paths.mjs urlOfPath).
  const platform = o.contract ? readIf(join(o.contract, 'manifest.json'))?.platform : undefined
  if (o.contract) usePlatform(platform)
  // A WordPress page is read as its sections (the top-level blocks of its post content), from the database or the
  // work folder's wordpress-sections.json.
  const split = settleWordPressSections({ platform, out, db: str(o.db), dbCommand: str(o['db-command']) })
  if (split) log('wordpress sections', split.pages, 'pages, from', split.from)
  if (cmd === 'sheet') return sheet(o, out).then(() => 0)
  if (cmd === 'approve') return approve(o, out)
  if (cmd === 'pack') return pack(out)
  if (cmd === 'relabel') return relabel(o, out)
  if (cmd === 'setting-slots') return settingSlots(o, out)
  if (cmd === 'slot-roles') return slotRoles(o, out)
  if (cmd === 'samples') return samples(o, out)
  if (cmd === 'measure-fields') return measureFields(o, out)
  const map = readContractMap(o.contract)
  const hostHeader = str(o['host-header'])
  const widths = String(o.widths ?? '1440,390')
    .split(',')
    .map(Number)
    .filter(Boolean)
  if (cmd === 'measure-min') {
    if (!str(o.list) || !str(o.page) || !Number(o.max))
      throw new Error('measure-min needs --list, --page and --max')
    const listId = o.list
    const source = (str(o.block) ?? listId.split('.')[0]).replace(/^block-/, 'module-')
    const evidence = await measureMin({
      chromium: await chromiumOf(),
      siteUrl: o.site,
      hostHeader,
      url: urlOfPath(o.page, o.site),
      assigned: assignedAt(indexMap(map), o.page),
      source,
      listId,
      max: Number(o.max),
      css: str(o.rows),
      widths,
      note: str(o.note)
    })
    const file = join(out, 'min-evidence.json')
    if (str(o['row-kind'])) evidence.rowKind = o['row-kind']
    evidence.by = 'person'
    writeJson(file, { ...readIf(file), [listId]: evidence })
    console.log(
      `${listId}: min ${evidence.min ?? 'none'} of ${evidence.max}, layout right at ${evidence.okCounts.join(', ') || 'no count'}`
    )
    return 0
  }
  let capture
  if (cmd === 'build' && o.full) {
    const r = await runFull({ o, out, tool: TOOL, chromium: await chromiumOf(), log })
    capture = r.capture
  } else {
    if (cmd === 'build')
      await captureSite({ o, out, tool: TOOL, chromium: await chromiumOf(), map, widths, log })
    capture = readJson(join(out, 'capture-index.json'))
    await assembleKit(o, out, TOOL)
    writeJson(join(out, 'template-fixes.json'), templateFixes(readIf(join(out, 'min-evidence.json')) ?? {}))
    if (cmd === 'build') await sheet(o, out)
  }
  const kit = readJson(join(out, 'template-kit.json'))
  console.log(
    `${kit.pages.length} pages in ${kit.pageGroups.length} groups, ${kit.blocks.length} blocks, ${kit.images.length} images, ${kit.errors.length} errors; template ${kit.template.version ?? '?'}, quickstart ${kit.quickstart.version ?? '?'}`
  )
  return capture.failures?.length || capture.capReached ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.message ?? e)
      process.exit(2)
    }
  )
