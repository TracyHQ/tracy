#!/usr/bin/env node
/**
 * Run the Template Customization Question Readiness check on one folder of release files and print
 * the report as JSON on stdout. The server starts this as a child process
 * (`lib/customize-readiness.js`), so the check's synchronous archive reads never hold the web
 * server's event loop, and a check that runs too long is killed by the parent's time limit.
 *
 *   node check-runner.mjs <dir> <tag> [<evidence.json>]
 *
 * `<evidence.json>`: what the Claude Cowork plugin a new site gets carries, read by the parent
 * (`collectCoworkEvidence`) before the check; without it STAB-1 says `not-checked`.
 *
 * Exit code 0 with the report on stdout; 2 with one line on stderr when the release cannot be read.
 */
import { readFile } from 'node:fs/promises'

import { checkRelease } from './index.js'
import { directoryReleaseSource } from './release-source.js'

/**
 * Reads a public address for the rules that ask one (LANG-2 asks Google Fonts which subsets a
 * family has). Bounded, and no redirect is followed.
 * @param {string} url @param {Record<string, string>} [headers]
 */
async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

const [dir, tag, evidenceFile] = process.argv.slice(2)
if (!dir || !tag) {
  process.stderr.write('usage: check-runner.mjs <dir> <tag> [<evidence.json>]\n')
  process.exit(2)
}
try {
  const coworkEvidence = evidenceFile ? JSON.parse(await readFile(evidenceFile, 'utf8')) : null
  const report = await checkRelease(directoryReleaseSource(dir, { tag }), { fetchText, coworkEvidence })
  process.stdout.write(JSON.stringify(report))
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(2)
}
