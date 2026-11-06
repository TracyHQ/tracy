#!/usr/bin/env node
/**
 * Print the template readiness verdict (`src/lib/template-readiness/verdict.js`) of one template: the pieces the
 * Website opportunity flow reads, each with its state and its Road to live code, as text or as JSON.
 *
 *   node apps/tracy-web/scripts/template-readiness.mjs <template> [--json] [--readiness <file>] [--ds-readiness <file>]
 *
 * `<template>` is a quickstart tag (`quickstart/ja-boxing/j6`) or a slug (`ja-boxing`). The release is the latest one
 * the quickstart list pins (`quickstarts.json`), read with the repository's contracts; GitHub is not asked, so the
 * asset list of the release is not judged (`pinned-release.js`). `--readiness` and `--ds-readiness` hand in a stored
 * Customize your site and Design system check of that version (`{ state, version, report }`, as /ops stores them);
 * without them those two pieces say they are not checked, never that they pass.
 *
 * Exit code 0 when every piece is done or warns, 1 when one is not, 2 when the template or a file cannot be read.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { defaultContracts } from '../src/lib/contracts.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'

const passed = (state) => state === 'done' || state === 'warn'

/** One line per piece: state, piece, code, and the step that decided it when it is not the piece's own name. */
export function verdictText(verdict, pin) {
  const head = `${verdict.tag} ${verdict.version ?? '(no version)'} (read from the quickstart list pin; Cowork pin ${pin.cowork ?? 'none'})`
  const lines = verdict.pieces.map((p) => {
    const by = p.blockedBy ? `, waiting for ${p.blockedBy}` : ''
    return `  ${p.state.padEnd(8)} ${p.piece.padEnd(20)} ${p.code} (step ${p.step}${by})`
  })
  const green = verdict.pieces.every((p) => passed(p.state))
  return [head, ...lines, green ? 'Every piece is green.' : 'Not every piece is green.'].join('\n')
}

/** @param {string | undefined} file */
const storedCheck = (file) => (file ? JSON.parse(readFileSync(file, 'utf8')) : null)

/**
 * @param {string[]} argv
 * @param {{ out?: (s: string) => void, err?: (s: string) => void }} [io]
 * @returns {number} the exit code
 */
export function main(
  argv,
  { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}
) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      readiness: { type: 'string' },
      'ds-readiness': { type: 'string' }
    }
  })
  const name = positionals[0]
  if (!name) {
    err('usage: template-readiness.mjs <template> [--json] [--readiness <file>] [--ds-readiness <file>]\n')
    return 2
  }
  const pin = latestPin(name)
  if (!pin) {
    err(`The quickstart list pins no release named ${name}.\n`)
    return 2
  }
  let readiness
  let dsReadiness
  try {
    readiness = storedCheck(values.readiness)
    dsReadiness = storedCheck(values['ds-readiness'])
  } catch (e) {
    err(`A stored check could not be read: ${e instanceof Error ? e.message : String(e)}\n`)
    return 2
  }
  const contracts = defaultContracts()
  const verdict = readinessVerdict(releaseOfPin(pin, contracts), {
    contracts,
    readiness,
    dsReadiness,
    server: false
  })
  if (!verdict) {
    err(`${pin.tag} is not a quickstart release.\n`)
    return 2
  }
  if (values.json) out(`${JSON.stringify({ source: 'pin', pin, ...verdict }, null, 2)}\n`)
  else out(`${verdictText(verdict, pin)}\n`)
  return verdict.pieces.every((p) => passed(p.state)) ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2))
