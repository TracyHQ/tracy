#!/usr/bin/env node
/**
 * Produce the blank site of an AI quickstart from a Joomla human quickstart installer (ADR 0045, ticket #582).
 *
 *   node scripts/ai-quickstart/blank-site.mjs <human quickstart .zip> --out <blank site .zip> [--report <file.json>]
 *                                             [--mapping <AI quickstart mapping.json>]
 *                                             [--contract <released contract folder> --contract-out <folder>]
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
 * With `--contract` and `--contract-out` (ticket #584) it also writes the blank site contract into `--contract-out`
 * (`manifest.json`, `content-map.json`, `presentation-lock.json`, made by `blank-site-contract.mjs`): the released contract
 * restricted to the records the blank site keeps, each slot the step empties opened (its sample the blank value, and
 * `opensEmpty`), which the Claude Cowork plugin is bound to on the blank site. It needs `--mapping`. For an AI
 * quickstart folder that is `<folder>/blank-site-contract/`. The records it removes are read from the demo data
 * before and after the step, and must be the ones the step removes from the contract's own rows (`lockDump`); the
 * released folder is only read.
 *
 * Deterministic: the same input gives the same archive and the same report, byte for byte. The command checks its own
 * result (`checkBlankSite`, and every other entry identical to the source) and exits 1 when anything is not blank.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  BLANK_CONTRACT_FILES,
  blankSiteContract,
  lockDump,
  removedEntities
} from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-contract.mjs'
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
    'usage: blank-site.mjs <human quickstart .zip> --out <blank site .zip> [--report <file.json>] [--mapping <file>]'
  )
  console.error('                      [--contract <released contract folder> --contract-out <folder>]')
  console.error('       blank-site.mjs --check <installer .zip>')
  process.exit(2)
}

function args(argv) {
  const out = {
    input: null,
    out: null,
    report: null,
    check: null,
    mapping: null,
    contract: null,
    contractOut: null
  }
  const options = { '--out': 'out', '--report': 'report', '--check': 'check', '--mapping': 'mapping' }
  Object.assign(options, { '--contract': 'contract', '--contract-out': 'contractOut' })
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (options[a]) {
      if (!argv[i + 1]) usage(`${a} needs a file`)
      out[options[a]] = argv[++i]
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

/** The blank site contract (`blank-site-contract.mjs`) of a released contract folder and the step's demo data. */
function contractOf(folder, mapping, before, after, files) {
  const raw = Object.fromEntries(BLANK_CONTRACT_FILES.map((f) => [f, readFileSync(path.join(folder, f))]))
  const json = (f) => JSON.parse(raw[f].toString('utf8'))
  const input = {
    manifest: json('manifest.json'),
    contentMap: json('content-map.json'),
    lock: json('presentation-lock.json')
  }
  const own = lockDump(input)
  const fromLock = removedEntities({
    contentMap: input.contentMap,
    before: own,
    after: produceBlankSite(own, { steps: BLANK_SITE_STEPS }).sql
  })
  const made = blankSiteContract({
    ...input,
    mapping,
    before,
    after,
    released: Object.fromEntries(BLANK_CONTRACT_FILES.map((f) => [f, sha256(raw[f])])),
    addedFiles: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)]))
  })
  if (JSON.stringify(made.removed) !== JSON.stringify(fromLock))
    throw new Error(
      `the demo data and the contract's own rows disagree on what the blank site removes: ${made.removed.length} and ${fromLock.length} records`
    )
  return made
}

function produce({ input, out, report: reportFile, mapping: mappingFile, contract, contractOut }) {
  if (!input || !out) usage()
  if (!contract !== !contractOut) usage('--contract and --contract-out go together')
  if (contract && !mappingFile)
    usage('--contract needs --mapping: the contract opens the places the mapping empties')
  if (existsSync(out) && realpathSync(out) === realpathSync(input))
    usage('--out must not be the input archive')
  const source = readFileSync(input)
  const entries = listEntries(source)
  const others = entries.filter((e) => OTHER_DEMO_DATA.test(e.name) && e.name !== DEMO_DATA)
  if (others.length)
    throw new Error(`demo data for another database is not handled: ${others.map((e) => e.name).join(', ')}`)
  const names = new Set(entries.map((e) => e.name))
  const mapping = mappingFile ? JSON.parse(readFileSync(mappingFile, 'utf8')) : null
  const steps = mapping
    ? [
        ...BLANK_SITE_STEPS,
        emptyDeclaredFieldsStep({
          mapping,
          readFile: (name) => (names.has(name) ? readEntry(source, name) : null)
        })
      ]
    : BLANK_SITE_STEPS
  const demo = readEntry(source, DEMO_DATA).toString('utf8')
  const { sql, report, files } = produceBlankSite(demo, { steps })
  const made = contract ? contractOf(contract, mapping, demo, sql, files) : null
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
  else {
    writeFileSync(out, blank)
    if (made) {
      mkdirSync(contractOut, { recursive: true })
      for (const [name, text] of Object.entries(made.files)) writeFileSync(path.join(contractOut, name), text)
    }
  }
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
    ...(made
      ? {
          blankSiteContract: {
            id: made.id,
            removed: made.removed,
            opened: made.opened,
            files: Object.fromEntries(
              Object.entries(made.files).map(([f, t]) => [f, sha256(Buffer.from(t, 'utf8'))])
            )
          }
        }
      : {}),
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
  if (made && !problems.length)
    console.log(
      `blank site contract ${made.id}: ${made.removed.length} records removed, written to ${contractOut}`
    )
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
