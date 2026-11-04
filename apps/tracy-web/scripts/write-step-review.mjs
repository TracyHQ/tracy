#!/usr/bin/env node
/**
 * The review page of a write run (#357): one self-contained HTML file, built on the operator's machine, outside the repo.
 * It reads a run's output and the frozen picture package, takes captures of the written site at 1440 and 390 wide with a
 * headless browser (reading the site only), and writes the page. Failed slots come first; a Pictures tab shows each frame
 * cropped from the real page, with Approve, Reject, a note and a button that copies the frames to redo.
 *
 *   node scripts/write-step-review.mjs --report <site-write-report.json> --package <picture package folder> --out <review.html>
 *     [--check <site-check.json>] [--site <https://site>] [--routes <routes.json>] [--labels <labels.json>]
 *     [--playwright <folder holding the playwright package>] [--no-capture]
 *
 * --report  `node scripts/write-step-bench.mjs get <run> --out <dir>` writes it (with the site check merged in once
 *           `check` has run); the picture package is the folder holding plan.json, site-copy.json, site-pictures.json, files/.
 * --routes  a JSON object from plan page id to the path on the site, for pages whose path is not "/" + slug.
 * --labels  a JSON object of visible words that replaces the English defaults (src/write-step/review-page/labels.js).
 */
import { parseArgs } from 'node:util'
import { buildReviewPage } from '../src/write-step/review-page/build.js'

const USAGE =
  'usage: node scripts/write-step-review.mjs --report <file> --package <folder> --out <file.html> [--check <file>] [--site <url>] [--routes <file>] [--labels <file>] [--playwright <folder>] [--no-capture]'

export async function main(argv, io = { out: console.log, err: console.error }) {
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        report: { type: 'string' },
        package: { type: 'string' },
        out: { type: 'string' },
        check: { type: 'string' },
        site: { type: 'string' },
        routes: { type: 'string' },
        labels: { type: 'string' },
        playwright: { type: 'string' },
        'no-capture': { type: 'boolean' }
      }
    }))
  } catch (error) {
    io.err(`${error.message}\n${USAGE}`)
    return 2
  }
  if (!values.report || !values.package || !values.out) {
    io.err(USAGE)
    return 2
  }
  try {
    const r = await buildReviewPage({
      reportFile: values.report,
      packageDir: values.package,
      outFile: values.out,
      checkFile: values.check,
      siteUrl: values.site,
      routesFile: values.routes,
      labelsFile: values.labels,
      playwrightDir: values.playwright,
      ...(values['no-capture'] ? { chromium: null } : {}),
      onProgress: (line) => io.out(`capturing ${line}`)
    })
    io.out(`wrote ${values.out}: ${r.pages} pages, ${r.frames} frames, ${r.crops} cropped, ${r.bytes} bytes`)
    return 0
  } catch (error) {
    io.err(`write-step-review: ${error.message}`)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2))
