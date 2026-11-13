#!/usr/bin/env node
/**
 * Produce the blank site of an AI quickstart from a Joomla human quickstart installer (ADR 0045, ticket #582).
 *
 *   node scripts/ai-quickstart/blank-site.mjs <human quickstart .zip> --out <blank site .zip> [--report <file.json>]
 *                                             [--mapping <AI quickstart mapping.json>]
 *   node scripts/ai-quickstart/blank-site.mjs --check <installer .zip>
 *
 * The blank site is the same installer with one file changed, its demo data (`installation/sql/mysql/custom.sql`):
 * no pages, empty menus, every demo block kept and assigned to no page, no account, session or secret of the source
 * site (`packages/cms/tracy-joomla-quickstart/scripts/blank-site.mjs`). Every other entry, the template files among
 * them, is copied as its exact compressed bytes. The input is only read.
 *
 * With `--mapping` (ticket #584) the step also empties every content field the mapping file declares
 * (`blank-site-empty-fields.mjs`) and adds the files that step writes: the template's local Site settings and global
 * settings and the site language overrides, new entries after the copied ones. Every entry of the source is still
 * copied unchanged but the demo data.
 *
 * Deterministic: the same input gives the same archive and the same report, byte for byte. The command checks its own
 * result (`checkBlankSite`, and every other entry identical to the source) and exits 1 when anything is not blank.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { emptyDeclaredFieldsStep } from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-empty-fields.mjs'
import {
  BLANK_SITE_STEPS,
  checkBlankSite,
  produceBlankSite
} from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site.mjs'
import {
  addEntries,
  listEntries,
  readEntry,
  replaceEntry
} from '../../packages/cms/tracy-joomla-quickstart/scripts/zip-replace-entry.mjs'

const DEMO_DATA = 'installation/sql/mysql/custom.sql'
const OTHER_DEMO_DATA = /^installation\/sql\/[^/]+\/custom\.sql$/

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function usage(message) {
  if (message) console.error(message)
  console.error(
    'usage: blank-site.mjs <human quickstart .zip> --out <blank site .zip> [--report <file.json>]'
  )
  console.error('       blank-site.mjs --check <installer .zip>')
  process.exit(2)
}

function args(argv) {
  const out = { input: null, out: null, report: null, check: null, mapping: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--out' || a === '--report' || a === '--check' || a === '--mapping') {
      if (!argv[i + 1]) usage(`${a} needs a file`)
      out[a.slice(2)] = argv[++i]
    } else if (a.startsWith('-')) usage(`unknown option ${a}`)
    else if (out.input) usage('one input archive only')
    else out.input = a
  }
  return out
}

function printCounts(label, counts) {
  console.log(
    `${label.padEnd(7)} ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`
  )
}

function check(file) {
  const problems = checkBlankSite(readEntry(readFileSync(file), DEMO_DATA).toString('utf8'))
  for (const p of problems) console.log(`not blank: ${p}`)
  console.log(
    problems.length
      ? `${problems.length} problem(s)`
      : 'blank site: no pages, empty menus, no assigned block, no account, no secret'
  )
  return problems.length ? 1 : 0
}

function produce({ input, out, report: reportFile, mapping: mappingFile }) {
  if (!input || !out) usage()
  if (existsSync(out) && realpathSync(out) === realpathSync(input))
    usage('--out must not be the input archive')
  const source = readFileSync(input)
  const entries = listEntries(source)
  const others = entries.filter((e) => OTHER_DEMO_DATA.test(e.name) && e.name !== DEMO_DATA)
  if (others.length)
    throw new Error(`demo data for another database is not handled: ${others.map((e) => e.name).join(', ')}`)
  const names = new Set(entries.map((e) => e.name))
  const steps = mappingFile
    ? [
        ...BLANK_SITE_STEPS,
        emptyDeclaredFieldsStep({
          mapping: JSON.parse(readFileSync(mappingFile, 'utf8')),
          readFile: (name) => (names.has(name) ? readEntry(source, name) : null)
        })
      ]
    : BLANK_SITE_STEPS
  const { sql, report, files } = produceBlankSite(readEntry(source, DEMO_DATA).toString('utf8'), { steps })
  let blank = replaceEntry(source, DEMO_DATA, Buffer.from(sql, 'utf8'))
  if (files.size) blank = addEntries(blank, [...files], { like: DEMO_DATA })

  const sourceRaw = new Map(entries.map((e) => [e.name, e.raw]))
  const changed = listEntries(blank).filter(
    (e) => e.name !== DEMO_DATA && !files.has(e.name) && !e.raw.equals(sourceRaw.get(e.name))
  )
  if (changed.length)
    throw new Error(`entries changed that must not: ${changed.map((e) => e.name).join(', ')}`)
  const problems = checkBlankSite(sql)

  // The archive exists only when it passed its own check; a failed run leaves nothing a later step could pick up.
  if (problems.length) rmSync(out, { force: true })
  else writeFileSync(out, blank)
  const full = {
    schema: 'tracy-ai-quickstart-blank-site-report/v1',
    source: { file: path.basename(input), sha256: sha256(source), entries: entries.length },
    blankSite: {
      file: path.basename(out),
      sha256: sha256(blank),
      demoDataSha256: sha256(Buffer.from(sql, 'utf8'))
    },
    unchangedEntries: entries.length - 1,
    addedEntries: [...files.keys()],
    ...report,
    problems
  }
  if (reportFile) writeFileSync(reportFile, `${JSON.stringify(full, null, 2)}\n`)

  printCounts('before', report.before)
  printCounts('after', report.after)
  console.log(
    `block store: ${report.blockStore.length} blocks, ${report.after.assignedSiteBlocks} assigned to a page`
  )
  console.log(
    `secrets blanked: ${report.secrets.map((s) => `${s.table} ${s.row} ${s.key}`).join(', ') || 'none'}`
  )
  console.log(`entries copied unchanged: ${full.unchangedEntries} of ${entries.length}`)
  if (files.size) console.log(`entries added: ${[...files.keys()].join(', ')}`)
  if (!problems.length) console.log(`${out}  sha256 ${full.blankSite.sha256}`)
  for (const p of problems) console.log(`not blank: ${p}`)
  return problems.length ? 1 : 0
}

const opts = args(process.argv.slice(2))
try {
  process.exit(opts.check ? check(opts.check) : produce(opts))
} catch (error) {
  console.error(`blank-site: ${error.message}`)
  process.exit(1)
}
