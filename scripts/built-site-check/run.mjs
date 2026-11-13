#!/usr/bin/env node
// The built site check, one command (ticket #601). Doc: docs/references/built-site-check.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBuiltSite, summaryOf } from './check-built-site.mjs'
import { approvalOf, expectedPagesOf, loadKit, writeResultOf } from './inputs.mjs'
import { BuiltSiteCheckError, localBaseOf } from './local-fetch.mjs'
import { loadPartOne } from './part-one.mjs'
import { crawlSite, pagesOfFolder } from './site-pages.mjs'

export const HELP = `Usage:
  node scripts/built-site-check/run.mjs (--site <local base address> | --pages <folder>)
    [--plan <file>] [--kit <dir>] [--write-result <file>] [--stored <file>] --out <report.json>

Checks a site just built from an AI quickstart during a LOCAL TRIAL RUN and writes a report
(<report.json> and a readable <report>.txt). It decides nothing and is never part of a build.

  --site          the base address of a locally built site: localhost, 127.x, *.localhost, *.test
                  or *.ddev.site only. Never point it at a customer site: any other host is refused,
                  no redirect off the base is followed, and only GET requests are sent.
  --pages         a folder of saved rendered pages instead (index.html is the home page)
  --plan          the approved plan, {plan, profile} or the plan alone (held names come from it)
  --kit           the AI quickstart kit folder (block-store.json, mapping.json, blank-site-contract/)
  --write-result  the write step's result, {plan: <write plan>, report: <run report>}, or the write plan
  --stored        optional: {slots: {<slot>: <value>}} read back from the built site after the build
  --out           where to write the JSON report

Exit code 0 when the tool ran, whatever it found; 1 when it could not run; 2 on a usage error.
A check that cannot run says not_run with its reason.`

const FLAGS = ['site', 'pages', 'plan', 'kit', 'write-result', 'stored', 'out']

export function argsOf(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)$/.exec(argv[i])
    if (m?.[1] === 'help') return { help: true }
    if (!m || !FLAGS.includes(m[1]) || argv[i + 1] === undefined)
      throw new BuiltSiteCheckError('usage', `unknown or empty argument ${argv[i]}`)
    out[m[1]] = argv[++i]
  }
  if (!out.out) throw new BuiltSiteCheckError('usage', '--out is required')
  if (Boolean(out.site) === Boolean(out.pages))
    throw new BuiltSiteCheckError('usage', 'give exactly one of --site and --pages')
  return out
}

const readJson = (file, code) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new BuiltSiteCheckError(code, `${code}: ${error?.code ?? 'not JSON'}`)
  }
}

/** Run the tool; returns the exit code. */
export async function main(argv, { fetchImpl, partOne, log = console.log } = {}) {
  let args
  try {
    args = argsOf(argv)
  } catch (error) {
    log(`${error.message}\n\n${HELP}`)
    return 2
  }
  if (args.help) {
    log(HELP)
    return 0
  }
  try {
    const approval = args.plan ? approvalOf(readJson(args.plan, 'plan_unreadable')) : { plan: null, held: [] }
    const write = args['write-result']
      ? writeResultOf(readJson(args['write-result'], 'write_result_unreadable'))
      : null
    if (args['write-result'] && !write)
      throw new BuiltSiteCheckError('write_result_unreadable', 'no write plan in it')
    let kit = null
    if (args.kit) {
      try {
        kit = loadKit(args.kit)
      } catch (error) {
        throw new BuiltSiteCheckError('kit_unreadable', `kit_unreadable: ${error?.code ?? 'error'}`)
      }
    }
    const stored = args.stored ? (readJson(args.stored, 'stored_unreadable').slots ?? null) : null
    let base
    let pages
    let capped = false
    if (args.site) {
      base = localBaseOf(args.site)
      // The plan's pages are read even when no page links to them, so a missing one answers its own status.
      const seeds = approval.plan ? expectedPagesOf(approval.plan, write).map((e) => e.path) : []
      ;({ pages, capped } = await crawlSite(base, { seeds, fetchImpl }))
      if (!pages.some((p) => p.status > 0))
        throw new BuiltSiteCheckError('site_unreachable', 'the site answered nothing')
    } else {
      if (!existsSync(args.pages))
        throw new BuiltSiteCheckError('pages_missing', 'the pages folder does not exist')
      base = new URL('http://pages.invalid/')
      pages = pagesOfFolder(args.pages)
    }
    const { demoScan, linkCheck } = partOne ?? (await loadPartOne())
    const report = await checkBuiltSite({
      pages,
      base,
      capped,
      source: { kind: args.site ? 'site' : 'pages' },
      plan: approval.plan,
      held: approval.held,
      write,
      kit,
      stored,
      demoScan,
      linkCheck
    })
    writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`)
    const text = summaryOf(report)
    writeFileSync(args.out.replace(/\.json$/i, '') + '.txt', text)
    log(text)
    return 0
  } catch (error) {
    log(`The built site check could not run: ${error?.code ?? error?.name ?? 'error'}`)
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2))
