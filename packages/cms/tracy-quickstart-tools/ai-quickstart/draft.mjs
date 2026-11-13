#!/usr/bin/env node
/**
 * Draft an AI quickstart's block store description and page recipes from a template's content contract (ADR 0046,
 * ticket #583), then complete them with the template's reviewed decisions and the limits measured on the template.
 *
 *   node packages/cms/tracy-quickstart-tools/ai-quickstart/draft.mjs \
 *     --contract <contract folder: template-kit.json, content-map.json, manifest.json, presentation-lock.json> \
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
  // The reference sweep reads the contract's presentation lock; a contract without one would be drafted with no
  // reference accounted for, so the draft refuses instead of skipping the sweep.
  const lockFile = path.join(contract, 'presentation-lock.json')
  if (!existsSync(lockFile)) {
    process.stderr.write(
      `${lockFile} is missing: the references of surviving records cannot be accounted for without the contract's presentation lock; nothing written.\n`
    )
    process.exit(1)
  }
  const manifest = readJson(path.join(contract, 'manifest.json'), {})
  const decisions = readJson(path.join(out, 'draft-decisions.json'), {})
  const measuredDoc = readJson(path.join(out, 'measured-limits.json'), { limits: {} })
  const result = draftAiQuickstart({
    kit: readJson(path.join(contract, 'template-kit.json')),
    contentMap: readJson(path.join(contract, 'content-map.json')),
    lock: readJson(lockFile),
    decisions,
    measured: measuredDoc.limits ?? {},
    template: {
      slug: manifest.quickstart?.product ?? path.basename(contract),
      version: manifest.quickstart?.version ?? ''
    }
  })
  if (result.coverage.unaccounted.length) {
    process.stderr.write(
      `${result.coverage.unaccounted.length} stored place(s) of the content map are neither a field nor a classed report entry; nothing written:\n${result.coverage.unaccounted.map((k) => `  ${k}`).join('\n')}\n` +
        'Declare each as a field (draft-decisions.json: fields, lists, itemLists) or class it (unlisted, outsideStore, removedWithPage).\n'
    )
    process.exit(1)
  }
  if (result.references?.unaccounted.length) {
    process.stderr.write(
      `${result.references.unaccounted.length} reference(s) of a surviving record to a record the blank site deletes (or to a demo picture) are neither a declared field nor classed; nothing written:\n${result.references.unaccounted.map((r) => `  ${r.at} -> ${r.to}`).join('\n')}\n` +
        'Declare each as a keyed field (lists[].key, keys), a field or design field, or class it (draft-decisions.json: references, with owner for build-sets).\n'
    )
    process.exit(1)
  }
  if (!result.inlineMarkup.owned) {
    process.stderr.write(
      `${result.inlineMarkup.entry.count} text field(s) store inline markup and no owned class holds them; nothing written:\n${result.inlineMarkup.entry.fields.map((f) => `  ${f.block} ${f.list ? `${f.list}/` : ''}${f.field} (${f.markup.join(', ')})`).join('\n')}\n` +
        'Name the class in draft-decisions.json: inlineMarkup {class, why, owners: {"#<ticket>": "<what it owns>"}}.\n'
    )
    process.exit(1)
  }
  write(path.join(out, 'block-store.json'), result.blockStore)
  write(path.join(out, 'page-recipes.json'), result.pageRecipes)
  const summary = summaryOf(result)
  write(path.join(out, 'draft-report.json'), { summary, ...result.report })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main(process.argv.slice(2))
