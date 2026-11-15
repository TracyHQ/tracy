#!/usr/bin/env node
// The release refusal (ticket #586): an AI quickstart is released only with a fresh passing check record. The publish
// step calls `assertReleasable(folder)` before it uploads anything; it throws, listing every problem
// (`release-binding.mjs`), when the kit has no verdict, its verdict failed, a kit file changed since the record, or the
// record ran another plugin or human quickstart than Tracy pins (`apps/tracy-web/src/quickstarts.json`).
//
//   node scripts/ai-quickstart/gate/release-guard.mjs <AI quickstart folder> [--blank-site <blank site .zip>]
//                                                     [--pins <pins.json>]
//
// Exits 0 when the kit may be released, 1 with the problems listed, 2 on a usage error. `--pins` replaces the pins
// read from the quickstart list (`{"plugin": "<version>", "humanQuickstartSha256": "<hex>"}`), for a test.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseProblems } from './release-binding.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const QUICKSTARTS = 'apps/tracy-web/src/quickstarts.json'

/**
 * What Tracy pins for the template of a kit folder (`<slug>/<cms>/<version>`, named by its `kit-manifest.json` or the
 * folder path): the plugin version and the human quickstart installer's sha256; null when the template is not listed.
 */
export function pinsFor(folder, root = ROOT) {
  const parts = path.resolve(folder).split(path.sep)
  const manifest = path.join(folder, 'kit-manifest.json')
  const t = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, 'utf8')).template ?? {}) : {}
  const slug = t.slug ?? parts.at(-3)
  const cms = parts.at(-2)
  const entry = JSON.parse(readFileSync(path.join(root, QUICKSTARTS), 'utf8'))[
    'quickstart/' + slug + '/' + cms
  ]
  if (!entry) return null
  return {
    version: entry.version,
    plugin: entry.cowork?.version,
    humanQuickstartSha256: entry.installer?.sha256
  }
}

/** Every reason the kit may not be released, the pin lookup included. */
export function releaseRefusals(folder, { root = ROOT, pins, blankSiteSha } = {}) {
  const pinned = pins ?? pinsFor(folder, root)
  const out = []
  if (!pinned)
    out.push({ code: 'no_pin', message: 'the quickstart list pins no human quickstart for this kit' })
  const version = path.basename(path.resolve(folder))
  if (pinned?.version && pinned.version !== version)
    out.push({
      code: 'pin_version',
      message: 'the quickstart list pins ' + pinned.version + ', the kit is ' + version
    })
  return [...out, ...releaseProblems(folder, { pins: pinned ?? {}, blankSiteSha })]
}

/** Throws, with `problems` on the error, unless the kit may be released. */
export function assertReleasable(folder, options = {}) {
  const problems = releaseRefusals(folder, options)
  if (problems.length === 0) return
  const error = new Error(
    'the AI quickstart may not be released:\n' +
      problems.map((p) => '  ' + p.code + ': ' + p.message).join('\n')
  )
  error.problems = problems
  throw error
}

function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
  const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
  if (!folder || !existsSync(folder)) {
    console.error('usage: release-guard.mjs <AI quickstart folder> [--blank-site <zip>] [--pins <pins.json>]')
    return 2
  }
  const blank = flag('--blank-site')
  const options = {
    pins: flag('--pins') ? JSON.parse(readFileSync(flag('--pins'), 'utf8')) : undefined,
    blankSiteSha: blank ? createHash('sha256').update(readFileSync(blank)).digest('hex') : undefined
  }
  try {
    assertReleasable(folder, options)
  } catch (error) {
    if (!error.problems) throw error
    console.error(error.message)
    return 1
  }
  console.log('release-guard: the AI quickstart may be released')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)))
