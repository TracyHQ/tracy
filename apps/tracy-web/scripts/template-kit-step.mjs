#!/usr/bin/env node
/**
 * What the Road to live step "Template kit" would answer for a kit that is NOT committed yet (a dry run), with every
 * flow gap it rides along. The step is the one `/ops` runs (`src/lib/template-kit/road-step.js`); only the release is
 * made up from the flags, so nothing is read from GitHub or a server.
 *
 *   node apps/tracy-web/scripts/template-kit-step.mjs --kit <template-kit.json> --contract <contract folder> \
 *        --tag <release tag> --version <x.y.z> [--platform emdash] [--asset <name>]... [--json]
 *
 * `--contract` holds the content map the kit was captured on (an EmDash theme's `contracts/<version>`). `--tag` is the
 * release tag (`tracy-restaurant/emdash-0.x`); the contract id the kit must name is `<tag>/<version>`. Each `--asset`
 * is a file name the release carries (the kit's image zip, `template-kit-<template>-<version>.zip`); with none, the
 * release has no zip. Exit: 0 `kit-approved`, 1 any other answer, 2 usage or file error.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { kitMapOf } from '../src/lib/template-kit/flow-reads.js'
import { kitOfContract } from '../src/lib/template-kit/reader.js'
import { templateKitStep } from '../src/lib/template-kit/road-step.js'

const { values: v } = parseArgs({
  options: {
    kit: { type: 'string' },
    contract: { type: 'string' },
    tag: { type: 'string' },
    version: { type: 'string' },
    platform: { type: 'string', default: 'emdash' },
    asset: { type: 'string', multiple: true, default: [] },
    json: { type: 'boolean', default: false }
  }
})
if (!v.kit || !v.contract || !v.tag || !v.version) {
  console.error(
    'usage: template-kit-step.mjs --kit <file> --contract <dir> --tag <tag> --version <x.y.z> (see the head)'
  )
  process.exit(2)
}

// The reader takes a contract folder; a dry run's kit is somewhere else, so a scratch folder holds both files.
const dir = mkdtempSync(path.join(tmpdir(), 'kit-step-'))
try {
  copyFileSync(path.resolve(v.kit), path.join(dir, 'template-kit.json'))
  copyFileSync(path.join(path.resolve(v.contract), 'content-map.json'), path.join(dir, 'content-map.json'))
  const kit = kitOfContract({ id: `${v.tag}/${v.version}`, dir })
  const map = kitMapOf(JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8')))
  const release = {
    tag: v.tag,
    platform: v.platform,
    setting: { version: v.version },
    assets: v.asset.map((name) => ({ name })),
    choosable: false
  }
  /** @type {any[]} */
  const answers = []
  templateKitStep(
    (step, state, code, params, blockedBy) => answers.push({ step, state, code, params, blockedBy }),
    () => undefined,
    { release, version: v.version, contractId: `${v.tag}/${v.version}`, kit, map }
  )
  const a = answers[0]
  if (v.json) console.log(JSON.stringify(a, null, 2))
  else {
    console.log(`${a.state} ${a.code}`)
    const p = a.params ?? {}
    for (const k of [
      'reason',
      'kitQuickstartVersion',
      'templateVersion',
      'pages',
      'blocks',
      'images',
      'errors',
      'gaps'
    ])
      if (p[k] !== undefined && p[k] !== null) console.log(`  ${k}: ${p[k]}`)
    for (const c of p.checksExplained ?? [])
      console.log(`  explained: ${c.label} ${c.count} (${c.explained})`)
    for (const g of p.flowGaps ?? []) console.log(`  flowGap ${g.severity} ${g.code}: ${g.reason}`)
    if (!(p.flowGaps ?? []).length) console.log('  flowGaps: none')
  }
  process.exitCode = a.code === 'kit-approved' ? 0 : 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
