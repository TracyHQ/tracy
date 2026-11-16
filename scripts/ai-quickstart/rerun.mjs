#!/usr/bin/env node
/**
 * Re-run the production step of an AI quickstart on a new template version (ADR 0045 decision 4, ticket #588), and
 * say for every patch the kit records (`template-patches.mjs`) whether it still applies.
 *
 *   node scripts/ai-quickstart/rerun.mjs <AI quickstart folder> --template <new human quickstart .zip | folder>
 *                                        --out <folder>
 *
 * With an archive (the human quickstart installer of the new version) the production step runs on it
 * (`blank-site.mjs` with the kit's mapping file, into `<out>/blank-site.zip`) and the patches are judged on its
 * entries. With a folder (the template release unpacked) only the patches are judged: the production step needs the
 * installer. The report is `<out>/rerun-report.json`. Exit 0 when the production step passed (or did not run) and
 * every patch applies or is already applied, 1 otherwise, 2 on a usage error.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listEntries,
  readEntry
} from '../../packages/cms/tracy-joomla-quickstart/scripts/zip-replace-entry.mjs'
import { patchStatus, readPatches } from './template-patches.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
const source = flag('--template')
const out = flag('--out')
if (!folder || !existsSync(folder) || !source || !existsSync(source) || !out) {
  console.error('usage: rerun.mjs <AI quickstart folder> --template <zip | folder> --out <folder>')
  process.exit(2)
}
mkdirSync(out, { recursive: true })
const isArchive = statSync(source).isFile()
const zip = isArchive ? readFileSync(source) : null
const names = zip ? new Set(listEntries(zip).map((e) => e.name)) : null
const readFile = (rel) => {
  if (zip) return names.has(rel) ? readEntry(zip, rel).toString('utf8') : null
  const file = path.join(source, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

let production = {
  status: 'not_run',
  reason: 'a folder was given: the production step needs the installer archive'
}
if (isArchive) {
  const blank = path.join(out, 'blank-site.zip')
  const step = path.join(ROOT, 'scripts/ai-quickstart/blank-site.mjs')
  const args = [step, source, '--out', blank, '--mapping', path.join(folder, 'mapping.json')]
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' })
  const lines = (run.stdout + run.stderr).trim().split('\n')
  production =
    run.status === 0
      ? { status: 'passed', sha256: createHash('sha256').update(readFileSync(blank)).digest('hex') }
      : { status: 'failed', problems: lines.filter((l) => /not blank|blank-site:/.test(l)) }
}
const { patches, problems } = readPatches(folder)
const results = patches.map((p) => patchStatus(p, readFile))
const report = {
  schema: 'tracy-ai-quickstart-rerun/v1',
  kit: path.resolve(folder).split(path.sep).slice(-3).join('/'),
  template: {
    file: path.basename(source),
    ...(zip ? { sha256: createHash('sha256').update(zip).digest('hex') } : {})
  },
  production,
  patches: results,
  problems
}
writeFileSync(path.join(out, 'rerun-report.json'), JSON.stringify(report, null, 1) + '\n')
console.log(
  'production step: ' +
    production.status +
    (production.sha256 ? ', blank site sha256 ' + production.sha256 : '')
)
for (const p of production.problems ?? []) console.log('  ' + p)
if (!patches.length) console.log('recorded template patches: none, so there is nothing to re-apply')
for (const r of results) console.log('patch ' + r.id + ' (' + r.file + '): ' + r.status + ', ' + r.reason)
for (const p of problems) console.log('problem: ' + p)
const ok =
  production.status !== 'failed' && !problems.length && results.every((r) => r.status !== 'no_longer_applies')
process.exit(ok ? 0 : 1)
