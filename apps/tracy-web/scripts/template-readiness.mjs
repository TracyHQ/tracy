#!/usr/bin/env node
/**
 * Print the template readiness verdict (`src/lib/template-readiness/verdict.js`) of one template: the pieces the
 * Website opportunity flow reads, each with its state and its Road to live code, as text or as JSON.
 *
 *   node apps/tracy-web/scripts/template-readiness.mjs <template> [--json] [--cache <dir>]
 *   node apps/tracy-web/scripts/template-readiness.mjs <template> --readiness <file> [--ds-readiness <file>] [--json]
 *   node apps/tracy-web/scripts/template-readiness.mjs <template> --pin-only [--json]
 *
 * `<template>` is a quickstart tag (`quickstart/ja-boxing/j6`) or a slug (`ja-boxing`); the release is the one the
 * quickstart list pins (`quickstarts.json`), judged with the repository's contracts.
 *
 *   local (default)  the release is read from GitHub through `gh` and the Customize your site and Design system
 *                    checks run on this machine with the server's own code (`template-readiness-local.mjs`), on files
 *                    downloaded into `--cache` (default `<home>/.cache/tracy-template-readiness`). DEMO-1 and the
 *                    preview door health are server facts and are not judged; the output says so.
 *   stored           `--readiness` / `--ds-readiness` hand in a stored check (`{ state, version, report }`, as /ops
 *                    stores it); the release is the pin's row, GitHub is not asked.
 *   --pin-only       nothing is downloaded or run: the pin's row alone, the two stored checks read "not checked".
 *
 * Exit code 0 when every piece is done (green), 1 when one warns or holds, 2 when the template or a file cannot be read.
 * A warning counts as not green: on a release already published, Road to live only warns where a new release would
 * be held, so the JA Boxing level is every piece done.
 */
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { defaultContracts } from '../src/lib/contracts.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { passed, readinessVerdict } from '../src/lib/template-readiness/verdict.js'

/** The facts a server alone knows, never judged by this command. */
const SERVER_ONLY = Object.freeze([
  'DEMO-1 (this server has a live demo of the release for the Add site preview)',
  'the preview door health'
])

/** One line per piece: state, piece, code, and the step that decided it. */
export function verdictText(verdict, { pin, source }) {
  const from =
    source === 'github' ? 'read from GitHub, checks run on this machine' : `read from the quickstart list pin`
  const head = `${verdict.tag} ${verdict.version ?? '(no version)'} (${from}; pinned ${pin.version}, Cowork pin ${pin.cowork ?? 'none'})`
  const lines = verdict.pieces.map((p) => {
    const by = p.blockedBy ? `, waiting for ${p.blockedBy}` : ''
    return `  ${p.state.padEnd(8)} ${p.piece.padEnd(20)} ${p.code} (step ${p.step}${by})`
  })
  const warned = verdict.pieces.filter((p) => p.state === 'warn').map((p) => p.piece)
  const held = verdict.pieces.filter((p) => !passed(p)).map((p) => p.piece)
  const summary =
    held.length > 0
      ? `Not green: ${held.join(', ')} hold${held.length === 1 ? 's' : ''} a new release.`
      : warned.length > 0
        ? `Not green: ${warned.join(', ')} warn${warned.length === 1 ? 's' : ''} (a release already published only warns where a new one would be held).`
        : 'Every piece is green.'
  return [head, ...lines, `Not judged here: ${SERVER_ONLY.join('; ')}.`, summary].join('\n')
}

/** @param {string | undefined} file */
const storedCheck = (file) => (file ? JSON.parse(readFileSync(file, 'utf8')) : null)

/**
 * @param {string[]} argv
 * @param {{ out?: (s: string) => void, err?: (s: string) => void }} [io]
 * @returns {Promise<number>} the exit code
 */
export async function main(
  argv,
  { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}
) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      'pin-only': { type: 'boolean' },
      cache: { type: 'string' },
      readiness: { type: 'string' },
      'ds-readiness': { type: 'string' }
    }
  })
  const name = positionals[0]
  if (!name) {
    err(
      'usage: template-readiness.mjs <template> [--json] [--cache <dir>] [--readiness <file>] [--ds-readiness <file>] [--pin-only]\n'
    )
    return 2
  }
  const pin = latestPin(name)
  if (!pin) {
    err(`The quickstart list pins no release named ${name}.\n`)
    return 2
  }
  const contracts = defaultContracts()
  const stored = Boolean(values.readiness || values['ds-readiness'])
  let world
  let source = 'pin'
  try {
    if (values['pin-only'] || stored)
      world = {
        release: releaseOfPin(pin, contracts),
        readiness: storedCheck(values.readiness),
        dsReadiness: storedCheck(values['ds-readiness'])
      }
    else {
      const { localWorld } = await import('./template-readiness-local.mjs')
      const cacheDir = values.cache ?? path.join(os.homedir(), '.cache', 'tracy-template-readiness')
      world = await localWorld(pin.tag, { cacheDir, log: (s) => err(`${s}\n`) })
      source = 'github'
    }
  } catch (e) {
    err(`The release or a stored check could not be read: ${e instanceof Error ? e.message : String(e)}\n`)
    return 2
  }
  const { release, readiness, dsReadiness } = world
  const verdict = readinessVerdict(release, { contracts, readiness, dsReadiness, server: false })
  if (!verdict) {
    err(`${pin.tag} is not a quickstart release.\n`)
    return 2
  }
  if (values.json) out(`${JSON.stringify({ source, pin, notJudged: SERVER_ONLY, ...verdict }, null, 2)}\n`)
  else out(`${verdictText(verdict, { pin, source })}\n`)
  return verdict.pieces.every((p) => p.state === 'done') ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main(process.argv.slice(2))
