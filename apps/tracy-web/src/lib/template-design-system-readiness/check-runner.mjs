#!/usr/bin/env node
/**
 * Run the Template Design System Readiness check on one folder of release files and print the
 * report as JSON on stdout. The server starts this as a child process (`lib/design-system-readiness.js`),
 * so the check's synchronous archive reads never hold the web server's event loop, and a check that
 * runs too long is killed by the parent's time limit.
 *
 *   node check-runner.mjs <dir> <tag>
 *
 * Exit code 0 with the report on stdout; 2 with one line on stderr when the release cannot be read.
 */
import { directoryReleaseSource } from '../template-customization-question-readiness/release-source.js'
import { checkRelease } from './index.js'

const [dir, tag] = process.argv.slice(2)
if (!dir || !tag) {
  process.stderr.write('usage: check-runner.mjs <dir> <tag>\n')
  process.exit(2)
}
try {
  const report = await checkRelease(directoryReleaseSource(dir, { tag }))
  process.stdout.write(JSON.stringify(report))
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(2)
}
