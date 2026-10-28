#!/usr/bin/env node
// Record the label judge's verdicts (spec #37, issue #46). The content coverage audit (`cli.mjs`) calls no model: it
// writes <out>/label-judge/request.json with a crop per component and the slots still to judge. The agent that runs
// the release looks at each crop, writes a verdicts file, and this command checks it strictly
// (`lib/label-judge-record.mjs`) and writes the `labelJudge` block into content-coverage.json, the file Road to live
// reads. The verdicts are also the cache: the next audit asks only for slots whose content changed.
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/record-judge.mjs \
//     --request <out>/label-judge/request.json --verdicts <verdicts.json> [--coverage <content-coverage.json>]
//
// Without --coverage it writes the coverage files the audit named in the request (the copy in --out and, after
// --write, the one beside the contract). Exit: 0 written · 1 the verdicts were refused (each problem printed) ·
// 2 usage or file error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { recordLabelJudge } from './lib/label-judge-record.mjs'

const USAGE =
  'usage: record-judge.mjs --request <request.json> --verdicts <verdicts.json> [--coverage <content-coverage.json>]'

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

const readJson = (file, what) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read the ${what} ${file}: ${error.message}`)
  }
}

function main(argv) {
  const o = parseArgs(argv)
  if (typeof o.request !== 'string' || typeof o.verdicts !== 'string') {
    console.error(USAGE)
    return 2
  }
  const request = readJson(resolve(o.request), 'request')
  const verdicts = readJson(resolve(o.verdicts), 'verdicts file')
  const targets = typeof o.coverage === 'string' ? [resolve(o.coverage)] : (request.coverageFiles ?? [])
  if (targets.length === 0) {
    console.error('no coverage file to write: pass --coverage')
    return 2
  }
  const { problems, block } = recordLabelJudge({ request, verdicts })
  if (problems.length > 0) {
    console.error(`refused, nothing written (${problems.length} problem${problems.length === 1 ? '' : 's'}):`)
    for (const p of problems) console.error(`  - ${p}`)
    return 1
  }
  const docs = targets.map((file) => {
    if (!existsSync(file)) throw new Error(`no coverage file at ${file}: run the audit first`)
    const doc = readJson(file, 'coverage file')
    const want = request.contract?.contentMapSha256
    if (want && doc.contract?.contentMapSha256 !== want)
      throw new Error(`${file} was measured on another content map than the request: run the audit again`)
    return { file, doc }
  })
  for (const { file, doc } of docs)
    writeFileSync(file, `${JSON.stringify({ ...doc, labelJudge: block }, null, 2)}\n`)
  console.log(
    JSON.stringify({ written: targets, state: block.state, reason: block.reason, ...block.counts }, null, 1)
  )
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
