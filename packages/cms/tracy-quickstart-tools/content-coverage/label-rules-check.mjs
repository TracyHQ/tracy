#!/usr/bin/env node
// The label rules R2 to R9 on a contract's content map, with no crawl and no stand: the static gate to run after any
// change of slot roles or groups and BEFORE a coverage measure (an audit takes an hour; this takes seconds). The same
// rules the audit writes into content-coverage.json (lib/label-rules.mjs); a failing rule prints as `label-rule-<id>`.
// With --findings (a previous audit's findings.json of the same site) R8 reads its page snapshots and R9 its holes;
// without it those two see nothing.
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/label-rules-check.mjs --contract <contract folder> \
//     [--findings <audit out>/findings.json]
//
// Exit: 0 every rule at 0 · 1 a rule fails (each printed with its count and first keys) · 2 usage or unreadable input.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASS_NAME } from './lib/coverage-file.mjs'
import { labelRulesOf } from './lib/label-rules.mjs'

const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > 0 ? process.argv[i + 1] : undefined
}
const contract = arg('--contract')
const findingsFile = arg('--findings')
if (!contract) {
  console.error('usage: label-rules-check.mjs --contract <dir> [--findings <findings.json>]')
  process.exit(2)
}
let map
let findings = { pages: [] }
try {
  map = JSON.parse(readFileSync(join(contract, 'content-map.json'), 'utf8'))
  if (findingsFile) findings = JSON.parse(readFileSync(findingsFile, 'utf8'))
} catch (e) {
  console.error(`label-rules-check: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(2)
}
const pages = Array.isArray(findings.pages) ? findings.pages : []
// Holes as the coverage file passes them (coverage-file.mjs), one per distinct item.
const unique = new Map()
for (const p of pages) for (const it of p.items ?? []) if (!unique.has(it.key)) unique.set(it.key, it)
const holes = [...unique.values()]
  .filter((it) => it.status === 'hole')
  .map((it) => ({
    kind: it.kind === 'attr' || it.kind === 'meta' ? `${it.kind}:${it.attr}` : it.kind,
    value: String(it.remainder ?? it.path ?? it.value ?? ''),
    class: CLASS_NAME[it.class] ?? 'unknown',
    ...(it.inCode ? { inCode: true } : {})
  }))
const res = labelRulesOf({ map, pages, holes })
if (!res.applies) {
  console.log(`label rules: not applicable (vocabulary ${res.roleVocabularyVersion ?? 'none'})`)
  process.exit(0)
}
const failing = Object.entries(res.rules).filter(([, r]) => r.count > 0)
for (const [id, r] of failing) console.log(`label-rule-${id} ${r.count} ${r.title}: ${r.keys.join(' ')}`)
console.log(`label rules: ${failing.length} failing${findingsFile ? '' : ' (R8 and R9 need --findings)'}`)
process.exit(failing.length ? 1 : 0)
