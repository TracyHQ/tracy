#!/usr/bin/env node
/**
 * Run the Template Customization Question Readiness check on one release folder of this machine.
 *
 *   node scripts/template-customization-question-readiness.mjs <dir> [--tag <tag>] [--only REL-2] [--json]
 *
 * `<dir>` holds the release's files as GitHub serves them (`gh release download <tag> -D <dir>`), or
 * is a local pack (`$TRACY_LOCAL_RELEASES_DIR/<slug>/<cms>`). `--tag` names the release, so a
 * failure's fix can say which release to upload to; without it the tag is guessed from a cache
 * folder name (`quickstart_ja-essence_j6` -> `quickstart/ja-essence/j6`) only when that folder's
 * name looks like one. Reading GitHub is not done here.
 *
 *   node scripts/template-customization-question-readiness.mjs --all <cacheDir> [--only REL-2] [--json-out <file>] [--md-out <file>]
 *
 * `--all` checks every release of a download cache (what
 * `scripts/template-customization-question-readiness-download.mjs` fills): in the gallery's order
 * when the cache holds its `gallery-releases.json`, else every folder holding a `tracy_setting.json`.
 * It prints one table, a row per release and a column per rule id; `--json-out` writes every report.
 *
 * Google Fonts is asked which subsets a family the template loads has (LANG-2 fonts); `--offline` asks nothing and the
 * rule lists those families as not checked.
 *
 * Exit code: 0 when no rule fails, 1 when one does, 2 when the release cannot be read at all.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { checkRelease } from '../apps/tracy-web/src/lib/template-customization-question-readiness/index.js'
import {
  directoryReleaseSource,
  releaseCacheDir
} from '../apps/tracy-web/src/lib/template-customization-question-readiness/release-source.js'
import {
  buildReadinessTable,
  renderReadinessTable
} from '../apps/tracy-web/src/lib/template-customization-question-readiness/readiness-table.js'

/**
 * Reads a public address for the rules that ask one (the LANG-2 fonts part asks Google Fonts which subsets a family has).
 * @param {string} url @param {Record<string, string>} [headers]
 */
async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

const MARKS = { pass: 'PASS', fail: 'FAIL', 'live-only': 'LIVE', 'not-applicable': 'N/A ' }

/** @param {string[]} argv */
function parse(argv) {
  const out = {
    dir: null,
    all: null,
    tag: null,
    only: null,
    json: false,
    jsonOut: null,
    mdOut: null,
    offline: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--tag') out.tag = argv[++i]
    else if (a === '--all') out.all = argv[++i]
    else if (a === '--json-out') out.jsonOut = argv[++i]
    else if (a === '--md-out') out.mdOut = argv[++i]
    else if (a === '--only') out.only = argv[++i].split(',')
    else if (a === '--json') out.json = true
    else if (a === '--offline') out.offline = true
    else if (!a.startsWith('--') && !out.dir) out.dir = a
    else throw new Error(`unknown argument ${a}`)
  }
  if (!out.dir && !out.all)
    throw new Error(
      'usage: template-customization-question-readiness.mjs <dir> [--tag <tag>] [--only REL-2] [--json]\n' +
        '   or: template-customization-question-readiness.mjs --all <cacheDir> [--only REL-2] [--json-out <file>] [--md-out <file>]'
    )
  return out
}

/** A cache folder spelled from a tag (`quickstart_ja-essence_j6`, `tracy-business_emdash-0.x`), back to the tag. */
function tagOfFolder(/** @type {string} */ dir) {
  const parts = path.basename(path.resolve(dir)).split('_')
  return parts.length === 2 || parts.length === 3 ? parts.join('/') : null
}

/** The releases of a cache, as `{ tag, dir }`: the gallery index when there is one, else every folder. */
async function cachedReleases(/** @type {string} */ cacheDir) {
  try {
    const index = JSON.parse(await readFile(path.join(cacheDir, 'gallery-releases.json'), 'utf8'))
    return index.releases.map((/** @type {{ tag: string, template: string }} */ r) => ({
      tag: r.tag,
      template: r.template,
      dir: releaseCacheDir(cacheDir, r.tag)
    }))
  } catch {
    const entries = await readdir(cacheDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ tag: tagOfFolder(e.name) ?? e.name, template: null, dir: path.join(cacheDir, e.name) }))
      .sort((a, b) => a.tag.localeCompare(b.tag))
  }
}

/** `--all`: every cached release, one table. */
async function runAll(/** @type {ReturnType<typeof parse>} */ args) {
  const outcomes = []
  for (const { tag, template, dir } of await cachedReleases(/** @type {string} */ (args.all))) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one release at a time keeps memory flat.
      const report = await checkRelease(directoryReleaseSource(dir, { tag }), {
        ...(args.offline ? {} : { fetchText }),
        ...(args.only ? { only: args.only } : {})
      })
      outcomes.push({ tag, template, report })
    } catch (e) {
      outcomes.push({ tag, template, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const table = buildReadinessTable(outcomes)
  const markdown = renderReadinessTable(table)
  console.log(markdown)
  if (args.mdOut) await writeFile(args.mdOut, `${markdown}\n`)
  if (args.jsonOut) await writeFile(args.jsonOut, `${JSON.stringify(outcomes, null, 2)}\n`)
  if (table.rows.some((r) => r.error)) return 2
  return table.rows.some((r) => Object.values(r.cells).includes('fail')) ? 1 : 0
}

async function main() {
  let args
  try {
    args = parse(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 2
  }
  if (args.all) return runAll(args)
  let report
  try {
    const source = directoryReleaseSource(/** @type {string} */ (args.dir), {
      tag: args.tag ?? tagOfFolder(/** @type {string} */ (args.dir))
    })
    report = await checkRelease(source, {
      ...(args.offline ? {} : { fetchText }),
      ...(args.only ? { only: args.only } : {})
    })
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 2
  }
  if (args.json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(
      `${report.template ?? '(no template)'} ${report.cms} ${report.version}${report.tag ? `  [${report.tag}]` : ''}`
    )
    for (const r of report.results) {
      console.log(`\n${MARKS[r.status] ?? r.status} ${r.id}  (owner: ${r.owner})\n  ${r.message}`)
      if (r.fix) console.log(`  fix: ${r.fix}`)
      for (const d of r.details ?? []) console.log(`  note: ${d}`)
    }
  }
  return report.results.some((r) => r.status === 'fail') ? 1 : 0
}

process.exitCode = await main()
