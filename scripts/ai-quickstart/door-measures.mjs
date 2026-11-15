#!/usr/bin/env node
/**
 * Measure on a real blank site what the build and an edit after the build may rely on (the questions of the write
 * step, ticket #597 and #599): hiding and removing records, module assignments that mean "no page", deleting a
 * media file, a replayed request id, the HTML piece functions, records written without a title, the JA ACM marker
 * converter and the escaping of field values, and four page facts.
 *
 *   TRACY_DOOR_URL=<site base URL> TRACY_DOOR_TOKEN=<the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/door-measures.mjs <AI quickstart folder> [--report <file.json>]
 *
 * The site is a throwaway blank site of that AI quickstart, bound to its blank site contract, with the plugin's
 * updater off (as for `copy-proof.mjs`). Every door call is kept with its raw answer in the report (`calls`); each
 * measurement records what it sent, what the door answered, what was read back and what the pages show
 * (`facts`). Nothing here passes or fails: it prints the facts. It exits 1 only when the plugin version moved
 * during the run or the site cannot be measured. Needs php on PATH (the plugin's HTML piece functions).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { coworkLib } from '../../packages/cms/tracy-joomla-quickstart/scripts/cowork-lib.mjs'
import { measureMarkers } from './door-measures-acm.mjs'
import { measureAssignments } from './door-measures-assign.mjs'
import { measureEscapes } from './door-measures-escapes.mjs'
import { measureHiding } from './door-measures-hide.mjs'
import { fetchPage, pageFields, recordedDoor } from './door-measures-lib.mjs'
import { measurePages } from './door-measures-pages.mjs'
import { measureWrites } from './door-measures-writes.mjs'

const argv = process.argv.slice(2)
const folder = argv.find((a, i) => !a.startsWith('-') && !['--report', '--only'].includes(argv[i - 1]))
const reportFile = argv.includes('--report') ? argv[argv.indexOf('--report') + 1] : null
// `--only <section>` runs one section (hiding, assignments, writes, markers, pages, escapes) on a fresh site.
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null
const base = (process.env.TRACY_DOOR_URL ?? '').replace(/\/+$/, '')
const token = process.env.TRACY_DOOR_TOKEN ?? ''
if (!folder || !base || !token) {
  console.error(
    'usage: TRACY_DOOR_URL=... TRACY_DOOR_TOKEN=... door-measures.mjs <AI quickstart folder> [--report <file>]'
  )
  process.exit(2)
}
const json = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
const cowork = await coworkLib()
if (cowork.skip) throw new Error(cowork.skip)
const calls = []
const door = recordedDoor(base, token, calls)
const facts = []
const fact = (id, detail) => {
  facts.push({ id, ...detail })
  console.log(`${id}: ${JSON.stringify(detail).slice(0, 400)}`)
}

const version = async () => (await door.call('info', {})).info?.component ?? null
const start = await version()
const bound = await door.call('content.contract', { operation: 'bind' })
fact('bind', { version: start, contract: bound.contract, warnings: bound.warnings ?? [] })

// The pages every section shares: a home page (the featured view), an inner page and a page of each layout style.
const styles = json('blank-site-contract/content-map.json').entities.filter((e) => e.kind === 'templateStyle')
const styleId = (title) => styles.find((s) => s.identity?.title?.includes(title))?.sourceId
const LANDING = styleId('Landing')
const DEFAULT = styleId('Default')
let n = 0
const alias = (name) => `measure-${name}-${Date.now()}-${n++}`
const page = (title, style, link = 'index.php?option=com_content&view=featured', extra = {}) =>
  door.made('menuItem', 0, pageFields(title, alias('page'), style, link, extra))
const home = await page('Measure Home', LANDING, undefined, { home: 1 })
const inner = await page('Measure Inner', DEFAULT)
const ctx = {
  door,
  base,
  lib: cowork.lib,
  mapping: json('mapping.json'),
  store: json('block-store.json'),
  contentMap: json('blank-site-contract/content-map.json'),
  styles: { LANDING, DEFAULT },
  pages: { home, inner },
  page,
  alias,
  fact,
  /** A page by its menu item id, or a path of the site. */
  html: (at) => fetchPage(base, typeof at === 'number' ? `index.php?Itemid=${at}` : at),
  inspect: () => door.call('content.contract', { operation: 'inspect' })
}

const SECTIONS = {
  hiding: measureHiding,
  assignments: measureAssignments,
  writes: measureWrites,
  markers: measureMarkers,
  pages: measurePages,
  escapes: measureEscapes
}
for (const [name, section] of Object.entries(SECTIONS)) {
  if (only && name !== only) continue
  try {
    await section(ctx)
  } catch (error) {
    fact(`${section.name} stopped`, { error: String(error?.stack ?? error).slice(0, 2000) })
  }
}

const end = await version()
fact('plugin version', { start, end, unchanged: start === end })
if (reportFile) writeFileSync(reportFile, `${JSON.stringify({ facts, calls }, null, 2)}\n`)
process.exit(start === end && start ? 0 : 1)
