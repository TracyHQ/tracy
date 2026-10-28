#!/usr/bin/env node
// Content coverage audit: does a Joomla quickstart's content contract declare every piece of demo
// text, every demo image and every demo link a visitor sees? The same crawl checks page hygiene:
// raw language constants, PHP error text and unfilled placeholders a customer must never see. Read-only on the site (every request
// that is not GET/HEAD/OPTIONS is aborted). Writes the evidence to --out (findings.json,
// report.html with annotated screenshots: never commit those) and, with --write, the compact
// content-coverage.json beside the contract, which /ops reads (Road to live, step Content coverage).
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs \
//     --site <url of a site built from the quickstart> --contract <contract folder> --out <dir> \
//     [--db-dump <database.sql[.gz]>] [--webroot <unpacked webroot>] [--site-config <json>] \
//     [--max-pages 150] [--viewports desktop,phone] [--write] [--no-report] \
//     [--report-only | --reclassify]   (rebuild from an existing findings.json, no browser run)
//     [--fit]   Slot fit (ADR 0039): measure a `fit` on every text and image slot from this run and settle each
//               picture's keep flag by its kind; with --write the content map gets them, BEFORE content-coverage.json
//               is built, so the coverage file names the map with its fit. Without --write: <out>/content-map.fit.json.
//     [--no-judge]
//               The label judge (spec #37): no model is called. For every component with a slot whose verdict is not
//               cached in content-coverage.json, the audit writes <out>/label-judge/request.json (the question, the
//               allowed answers, and per component its crop with numbered slots and the slots to judge). The agent
//               that runs the release answers it and records the answers with record-judge.mjs. Until then, and with
//               --no-judge, those slots stay `not judged`, never right.
//
// Exit: 0 the policy passes · 1 holes, page problems (or an incomplete run) hold Publish · 2 usage or run error.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { COVERAGE_POLICY, judgeCoverage } from '../../../../apps/tracy-web/src/lib/content-coverage/judge.js'
import { guessEntity, runAudit, summarize } from './lib/audit.mjs'
import { createClassifier } from './lib/classify.mjs'
import { runLabelJudge } from './lib/label-judge-run.mjs'
import { loadContract } from './lib/contract.mjs'
import { buildCoverageFile, COVERAGE_FILE } from './lib/coverage-file.mjs'
import { buildDbIndex } from './lib/db-index.mjs'
import { annotate, count } from './lib/items.mjs'
import { createMatcher } from './lib/match.mjs'
import { buildReport } from './lib/report-html.mjs'
import { groupByCause } from './lib/root-cause.mjs'
import { createShrinker } from './lib/shrink.mjs'
import { readSiteConfig } from './lib/site-config.mjs'
import { measureSlotFit } from './lib/slot-fit.mjs'
import { buildSourceIndex } from './lib/sources.mjs'

const USAGE =
  'usage: cli.mjs --site <url> --contract <dir> --out <dir> [--db-dump f] [--webroot d] [--site-config f] [--max-pages 150] [--viewports desktop,phone] [--write] [--no-report] [--report-only | --reclassify] [--fit] [--no-judge]'

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const k = a.slice(2)
    o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

/** Playwright from the workspace root (`@playwright/test` is a root dev dependency), or an override. */
async function chromiumOf() {
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
  return mod.chromium ?? mod.default?.chromium
}

function loadIndexes(o, contract) {
  const siteConfig = readSiteConfig({ siteConfig: o['site-config'], webroot: o.webroot })
  const dbIndex = o['db-dump'] && existsSync(o['db-dump']) ? buildDbIndex(o['db-dump'], siteConfig) : null
  const webrootOk = o.webroot && existsSync(o.webroot) && statSync(o.webroot).isDirectory()
  const sourceIndex = webrootOk ? buildSourceIndex(o.webroot, contract.template, contract.platform) : null
  return { siteConfig, dbIndex, sourceIndex }
}

/** Match and classify again the items of an earlier findings.json (new rules, no browser run). */
function reclassify(result, contract, siteUrl, o) {
  const { dbIndex, sourceIndex } = loadIndexes(o, contract)
  const match = createMatcher(contract, siteUrl)
  const classify = createClassifier(contract, dbIndex, sourceIndex)
  const derived = [
    'status',
    'matchBy',
    'slots',
    'reason',
    'path',
    'remainder',
    'remainderParts',
    'class',
    'classLabel',
    'evidence',
    'lockState',
    '_n'
  ]
  for (const p of result.pages) {
    for (const it of p.items) for (const k of derived) delete it[k]
    annotate(p.items, match, classify)
    p.counts = count(p.items)
    if (p.unmapped) p.rendersEntity = guessEntity(contract, p)
  }
  result.summary = summarize(result.pages)
  result.reclassifiedAt = new Date().toISOString()
  return result
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** Slot fit from this run's findings into the content map (or beside the evidence), formatted as capture formats it. */
function writeSlotFit({ result, contractDir, outDir, write }) {
  const mapFile = join(contractDir, 'content-map.json')
  const { map, summary } = measureSlotFit({
    map: JSON.parse(readFileSync(mapFile, 'utf8')),
    findings: result
  })
  const file = write ? mapFile : join(outDir, 'content-map.fit.json')
  writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`)
  try {
    execFileSync('pnpm', ['exec', 'biome', 'format', '--write', '--files-max-size=4000000', file], {
      cwd: REPO_ROOT,
      stdio: 'ignore'
    })
  } catch (error) {
    // The copy beside the evidence is for reading; only the contract's own map must be formatted.
    if (write) throw error
  }
  return { ...summary, file }
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (!o.site || !o.contract || !o.out) {
    console.error(USAGE)
    return 2
  }
  const siteUrl = new URL(o.site.endsWith('/') ? o.site : `${o.site}/`).href
  const outDir = resolve(o.out)
  const contractDir = resolve(o.contract)
  mkdirSync(outDir, { recursive: true })
  let contract = loadContract(contractDir, siteUrl)
  const viewports = String(o.viewports ?? 'desktop,phone').split(',')
  const findings = join(outDir, 'findings.json')
  const chromium = o['report-only'] && o['no-report'] ? null : await chromiumOf()

  let result
  if (o['report-only'] || o.reclassify) {
    result = JSON.parse(readFileSync(findings, 'utf8'))
    if (o.reclassify) result = reclassify(result, contract, siteUrl, o)
  } else {
    const t0 = Date.now()
    const { dbIndex, sourceIndex } = loadIndexes(o, contract)
    console.error(
      `[audit] contract ${contract.manifest.id}: ${contract.map.slots.length} slots, ${contract.pages.length} pages; DB ${dbIndex ? `${dbIndex.cells.length} cells` : 'none'}; sources ${sourceIndex ? `${sourceIndex.files.length} files, ${sourceIndex.ini.length} language strings` : 'none'}`
    )
    const cap = Number(o['max-pages'] ?? 150)
    const run = await runAudit({ chromium, siteUrl, contract, dbIndex, sourceIndex, outDir, cap, viewports })
    result = {
      site: siteUrl,
      contractId: contract.manifest.id,
      generatedAt: new Date().toISOString(),
      viewports,
      inputs: { dbDump: dbIndex ? o['db-dump'] : null, webroot: sourceIndex ? o.webroot : null },
      seconds: Math.round((Date.now() - t0) / 1000),
      ...run
    }
  }
  const unique = new Map()
  for (const p of result.pages)
    for (const it of p.items) if (it.status === 'hole' && !unique.has(it.key)) unique.set(it.key, it)
  result.summary.byCause = groupByCause([...unique.values()])
  writeFileSync(findings, JSON.stringify(result, null, 1))

  if (!o['no-report'] && chromium) {
    const shrinker = await createShrinker(chromium)
    try {
      const meta = {
        site: result.site,
        contractId: contract.manifest.id,
        generatedAt: result.generatedAt,
        viewports: result.viewports
      }
      writeFileSync(join(outDir, 'report.html'), await buildReport({ result, outDir, shrinker, meta }))
    } finally {
      await shrinker.close()
    }
  }

  const slotFit = o.fit ? writeSlotFit({ result, contractDir, outDir, write: Boolean(o.write) }) : null
  if (slotFit && o.write) contract = loadContract(contractDir, siteUrl)

  const target = join(contractDir, COVERAGE_FILE)
  const previous = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null
  const coverageFiles = [join(outDir, COVERAGE_FILE), ...(o.write ? [target] : [])]
  const judge = await runLabelJudge({ o, result, contract, outDir, chromium, previous, coverageFiles })
  const labelJudge = judge.block
  const doc = buildCoverageFile({ result, contract, previous, labelJudge })
  writeFileSync(join(outDir, COVERAGE_FILE), `${JSON.stringify(doc, null, 2)}\n`)
  if (o.write) writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`)
  const verdict = judgeCoverage(doc, COVERAGE_POLICY)
  console.log(
    JSON.stringify(
      {
        contract: doc.contract.id,
        pages: doc.pages,
        coverage: doc.coverage,
        holds: verdict.holds,
        holes: verdict.blocking.length,
        byClass: verdict.byClass,
        lockedContent: verdict.lockedContent,
        accepted: verdict.accepted,
        hygiene: verdict.hygiene.length,
        hygieneByKind: verdict.hygieneByKind,
        hygieneAccepted: verdict.hygieneAccepted,
        incomplete: verdict.incomplete,
        written: o.write ? target : null,
        slotFit,
        labelRules: {
          applies: doc.labelRules.applies,
          factSharePercent: doc.labelRules.r1.percent,
          failing: Object.fromEntries(
            Object.entries(doc.labelRules.rules)
              .filter(([, r]) => r.count > 0)
              .map(([id, r]) => [id, r.count])
          )
        },
        labelJudge: {
          state: labelJudge.state,
          reason: labelJudge.reason,
          ...labelJudge.counts,
          asked: judge.asked,
          request: judge.requestFile
        },
        findings,
        report: o['no-report'] ? null : join(outDir, 'report.html')
      },
      null,
      1
    )
  )
  return verdict.holds ? 1 : 0
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e)
    process.exit(2)
  }
)
