#!/usr/bin/env node
/**
 * Run the Template Design System Readiness check on one release folder of this machine — the same
 * check /ops runs for the Road to live step "Design system" (ADR 0031).
 *
 *   node scripts/template-design-system-readiness.mjs <dir> [--tag <tag>] [--only CSS-1] [--json]
 *   node scripts/template-design-system-readiness.mjs <empty dir> --tag <tag> --fetch
 *
 * `<dir>` holds the release's files as GitHub serves them. `--fetch` fills it first with only the
 * files the check reads (`dsAssetsOf`: the setting and the one archive holding the template's
 * stylesheets), through `gh`, so a Joomla release's older webroots are never downloaded.
 *
 *   node scripts/template-design-system-readiness.mjs --all <cacheDir> [--json-out <file>] [--md-out <file>]
 *
 * `--all` checks every release folder of a cache (`<cacheDir>/<tag with "/" as "_">/`) and prints one
 * table, a row per release and a column per rule id.
 *
 * Exit code: 0 when no rule fails, 1 when one does, 2 when the release cannot be read at all.
 */
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { dsAssetsOf } from '../apps/tracy-web/src/lib/template-design-system-readiness/assets.js'
import { checkRelease } from '../apps/tracy-web/src/lib/template-design-system-readiness/index.js'
import {
  buildReadinessTable,
  renderReadinessTable
} from '../apps/tracy-web/src/lib/template-customization-question-readiness/readiness-table.js'
import { directoryReleaseSource } from '../apps/tracy-web/src/lib/template-customization-question-readiness/release-source.js'

const run = promisify(execFile)
const REPO = 'JoomlArt-Products/joomlart-products'
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
    fetch: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--tag') out.tag = argv[++i]
    else if (a === '--all') out.all = argv[++i]
    else if (a === '--json-out') out.jsonOut = argv[++i]
    else if (a === '--md-out') out.mdOut = argv[++i]
    else if (a === '--only') out.only = argv[++i].split(',')
    else if (a === '--json') out.json = true
    else if (a === '--fetch') out.fetch = true
    else if (!a.startsWith('--') && !out.dir) out.dir = a
    else throw new Error(`unknown argument ${a}`)
  }
  if (!out.dir && !out.all)
    throw new Error(
      'usage: template-design-system-readiness.mjs <dir> [--tag <tag>] [--fetch] [--only CSS-1] [--json]\n' +
        '   or: template-design-system-readiness.mjs --all <cacheDir> [--json-out <file>] [--md-out <file>]'
    )
  if (out.fetch && !out.tag) throw new Error('--fetch needs --tag')
  return out
}

/** A cache folder spelled from a tag (`quickstart_ja-essence_j6`), back to the tag. */
function tagOfFolder(/** @type {string} */ dir) {
  const parts = path.basename(path.resolve(dir)).split('_')
  return parts.length === 2 || parts.length === 3 ? parts.join('/') : null
}

/** Download only what the check reads, one file at a time. */
async function fetchRelease(/** @type {string} */ tag, /** @type {string} */ dir) {
  await mkdir(dir, { recursive: true })
  const { stdout } = await run('gh', [
    'release',
    'view',
    tag,
    '-R',
    REPO,
    '--json',
    'assets',
    '-q',
    '.assets[].name'
  ])
  const names = stdout.split('\n').filter(Boolean)
  if (!names.includes('tracy_setting.json')) throw new Error(`${tag} carries no tracy_setting.json`)
  await run('gh', [
    'release',
    'download',
    tag,
    '-R',
    REPO,
    '-p',
    'tracy_setting.json',
    '-D',
    dir,
    '--clobber'
  ])
  const setting = JSON.parse(await readFile(path.join(dir, 'tracy_setting.json'), 'utf8'))
  for (const name of dsAssetsOf(setting, names)) {
    if (name === 'tracy_setting.json') continue
    // eslint-disable-next-line no-await-in-loop -- one file at a time keeps memory and bandwidth flat.
    await run('gh', ['release', 'download', tag, '-R', REPO, '-p', name, '-D', dir, '--clobber'], {
      maxBuffer: 16 * 1024 * 1024
    })
  }
}

/** `--all`: every release folder of a cache, one table. */
async function runAll(/** @type {ReturnType<typeof parse>} */ args) {
  const cacheDir = /** @type {string} */ (args.all)
  const folders = (await readdir(cacheDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => ({ tag: tagOfFolder(e.name) ?? e.name, dir: path.join(cacheDir, e.name) }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
  const outcomes = []
  for (const { tag, dir } of folders) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one release at a time keeps memory flat.
      const report = await checkRelease(
        directoryReleaseSource(dir, { tag }),
        args.only ? { only: args.only } : {}
      )
      outcomes.push({ tag, template: null, report })
    } catch (e) {
      outcomes.push({ tag, template: null, error: e instanceof Error ? e.message : String(e) })
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
  const dir = /** @type {string} */ (args.dir)
  let report
  try {
    if (args.fetch) await fetchRelease(/** @type {string} */ (args.tag), dir)
    const source = directoryReleaseSource(dir, { tag: args.tag ?? tagOfFolder(dir) })
    report = await checkRelease(source, args.only ? { only: args.only } : {})
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
