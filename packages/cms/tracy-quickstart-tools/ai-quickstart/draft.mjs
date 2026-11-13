#!/usr/bin/env node
/**
 * Draft an AI quickstart's block store description and page recipes from a template's content contract (ADR 0046,
 * ticket #583), then complete them with the template's reviewed decisions and the limits measured on the template.
 *
 *   node packages/cms/tracy-quickstart-tools/ai-quickstart/draft.mjs \
 *     --contract <contract folder: template-kit.json, content-map.json, manifest.json> \
 *     --out <AI quickstart folder>        reads <out>/draft-decisions.json and <out>/measured-limits.json if present,
 *                                         writes <out>/block-store.json, <out>/page-recipes.json, <out>/draft-report.json
 *
 * Then run the contract check: node scripts/ai-quickstart/check.mjs <out>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { draftAiQuickstart, summaryOf } from './lib/draft.mjs'

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)
const write = (file, doc) => writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)

function argOf(argv, name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function main(argv) {
  const contract = argOf(argv, '--contract')
  const out = argOf(argv, '--out')
  if (!contract || !out) {
    process.stderr.write('usage: draft.mjs --contract <contract folder> --out <AI quickstart folder>\n')
    process.exit(2)
  }
  const manifest = readJson(path.join(contract, 'manifest.json'), {})
  const decisions = readJson(path.join(out, 'draft-decisions.json'), {})
  const measuredDoc = readJson(path.join(out, 'measured-limits.json'), { limits: {} })
  const result = draftAiQuickstart({
    kit: readJson(path.join(contract, 'template-kit.json')),
    contentMap: readJson(path.join(contract, 'content-map.json')),
    decisions,
    measured: measuredDoc.limits ?? {},
    template: {
      slug: manifest.quickstart?.product ?? path.basename(contract),
      version: manifest.quickstart?.version ?? ''
    }
  })
  write(path.join(out, 'block-store.json'), result.blockStore)
  write(path.join(out, 'page-recipes.json'), result.pageRecipes)
  const summary = summaryOf(result)
  write(path.join(out, 'draft-report.json'), { summary, ...result.report })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main(process.argv.slice(2))
