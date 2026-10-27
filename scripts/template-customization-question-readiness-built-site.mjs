#!/usr/bin/env node
/**
 * Audit a site Tracy built from a template against the template's demo: what the static Template
 * Customization Question Readiness check cannot see (spec
 * `tasks/spec-template-customization-question-readiness.md`, section "measured on a real built site").
 *
 *   node scripts/template-customization-question-readiness-built-site.mjs --site <url> --demo <url> --set full|blank [--lang vi]
 *     [--unticked /a,/b] [--name "Tiệm Bánh Tamarind & Co"] [--demo-name "Northgate Industrial"]
 *     [--allow sourdough,Dubai] [--kit /pages/typography] [--max-pages 160] [--json-out <file>]
 *
 * `--name` is the business name the site was built with, `--demo-name` the demo company's (both
 * repeatable or comma separated): the BLANK comparison takes them out, and the English scan never
 * counts them. `--allow` adds words that may stay as they are (the customer's own words). `--kit`
 * lists kit pages beyond those the path names (typography, style guide…): their lines are compared
 * with the demo's, and their sample buttons are not counted by `dead-buttons`. Prints a short
 * summary; `--json-out` writes the whole report. Read only: GET requests to both sites. The checks
 * and their rules are listed at the top of `lib/template-customization-question-readiness-built-site/audit.mjs`.
 *
 * Exit code: 0 when no check fails (NOTE checks never fail), 1 when one does, 2 on a usage error.
 */
import { writeFile } from 'node:fs/promises'

import { auditBuiltSite } from './lib/template-customization-question-readiness-built-site/audit.mjs'
import { summary } from './lib/template-customization-question-readiness-built-site/tallies.mjs'

const LIST = new Set(['--unticked', '--name', '--demo-name', '--allow', '--kit'])

/** @param {string[]} argv */
function parse(argv) {
  /** @type {Record<string, any>} */
  const out = { unticked: [], name: [], 'demo-name': [], allow: [], kit: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const v = argv[i + 1]
    if (!a.startsWith('--') || v === undefined) throw new Error(`unknown argument ${a}`)
    const key = a.slice(2)
    if (LIST.has(a))
      out[key].push(
        ...(a === '--name' || a === '--demo-name' ? [v] : v.split(',')).map((s) => s.trim()).filter(Boolean)
      )
    else if (['--site', '--demo', '--set', '--lang', '--max-pages', '--json-out'].includes(a)) out[key] = v
    else throw new Error(`unknown argument ${a}`)
    i += 1
  }
  if (!out.site || !out.demo || !['full', 'blank'].includes(out.set))
    throw new Error(
      'usage: template-customization-question-readiness-built-site.mjs --site <url> --demo <url> --set full|blank [--lang vi] [--unticked /a,/b] [--name <n>] [--demo-name <n>] [--json-out <file>]'
    )
  return out
}

async function main() {
  let args
  try {
    args = parse(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 2
  }
  const report = await auditBuiltSite({
    site: args.site,
    demo: args.demo,
    set: args.set,
    lang: args.lang,
    unticked: args.unticked,
    names: args.name,
    demoNames: args['demo-name'],
    allow: args.allow,
    kit: args.kit,
    maxPages: args['max-pages'] ? Number(args['max-pages']) : undefined
  })
  console.log(summary(report))
  if (args['json-out']) await writeFile(args['json-out'], `${JSON.stringify(report, null, 2)}\n`)
  return report.checks.some((c) => c.outcome === 'FAIL') ? 1 : 0
}

process.exitCode = await main()
