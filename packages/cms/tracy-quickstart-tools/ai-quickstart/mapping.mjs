#!/usr/bin/env node
/**
 * Write an AI quickstart's mapping file (ADR 0046, ticket #584) from its drafted declarations, the template's content
 * map and the template's reviewed mapping decisions.
 *
 *   node packages/cms/tracy-quickstart-tools/ai-quickstart/mapping.mjs \
 *     --contract <contract folder: content-map.json> \
 *     --out <AI quickstart folder>     reads <out>/block-store.json, page-recipes.json, draft-report.json,
 *                                      draft-decisions.json and mapping-decisions.json; writes <out>/mapping.json
 *
 * Then run the contract check: node scripts/ai-quickstart/check.mjs <out>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { draftMapping } from './lib/mapping-draft.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

function argOf(argv, name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function main(argv) {
  const contract = argOf(argv, '--contract')
  const out = argOf(argv, '--out')
  if (!contract || !out) {
    process.stderr.write('usage: mapping.mjs --contract <contract folder> --out <AI quickstart folder>\n')
    process.exit(2)
  }
  const mapping = draftMapping({
    blockStore: readJson(path.join(out, 'block-store.json')),
    pageRecipes: readJson(path.join(out, 'page-recipes.json')),
    report: readJson(path.join(out, 'draft-report.json')),
    contentMap: readJson(path.join(contract, 'content-map.json')),
    draftDecisions: readJson(path.join(out, 'draft-decisions.json')),
    decisions: readJson(path.join(out, 'mapping-decisions.json'))
  })
  writeFileSync(path.join(out, 'mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`)
  process.stdout.write(
    `mapping.json: ${Object.keys(mapping.blocks).length} block(s), ${Object.keys(mapping.facts).length} fact(s), ${Object.keys(mapping.entities).length} entit(ies)\n`
  )
}

main(process.argv.slice(2))
