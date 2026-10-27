// Items of the old audit plan (212 = main items + sub-items). The plan lives outside this repo, so the
// item list is copied once into tests/qa/inventory/legacy/audit-plan.json (`--import <plan.md>`) with a
// LOGICAL source note; the normal extractor reads that committed JSON.
import { execFileSync } from 'node:child_process'
import { dirname, isAbsolute, resolve } from 'node:path'
import {
  cli,
  DEFAULT_ROOT,
  formatJson,
  isMain,
  parseJson,
  readExternal,
  readPrevious,
  readSource,
  record,
  SourceError,
  usageGuard,
  writeRepoFile
} from './common.mjs'
import { validatePlanDoc } from './legacy-provenance.mjs'

const OUT = 'tests/qa/inventory/legacy/audit-plan.json'
const ITEM = /^(#{4,5})\s+(QA-([A-Z]+)-(\d{3}[a-z]?)(?:-(\d+))?)\s+(.*)$/

/** Parse the plan text into item records. Pure: no I/O. */
export function parsePlan(text) {
  const lines = text.split('\n')
  const items = []
  let section = null
  lines.forEach((line, i) => {
    const sec = /^##\s+(\S+)\s+(.*)$/.exec(line)
    if (sec && !line.startsWith('###')) section = `${sec[1]} ${sec[2]}`.slice(0, 120)
    const m = ITEM.exec(line)
    if (!m) return
    const [, hashes, id, group, num, sub, title] = m
    items.push({
      id,
      group,
      level: hashes.length === 4 ? 'main' : 'sub',
      parent: sub === undefined ? null : `QA-${group}-${num}`,
      title: title.replace(/`/g, '').trim().slice(0, 200),
      section,
      line: i + 1
    })
  })
  return items
}

export function importPlan(file, root) {
  if (!isAbsolute(file)) throw new SourceError(`--import must be an absolute file path: ${file}`)
  const { text, hash } = readExternal(file)
  const items = parsePlan(text)
  if (items.length === 0)
    throw new SourceError('the plan yields no item: the format changed or the file is wrong')
  readPrevious(root, OUT) // refuses an unsafe or malformed earlier copy before anything is replaced
  let revision = null
  try {
    revision = execFileSync('git', ['-C', dirname(file), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    // no git there: the original has no known revision, and an earlier import's revision is not reused
  }
  revision = revision || null
  const doc = {
    note: 'Copied from the old audit plan. Source lives outside this repo; only id, title, level, parent and section are kept.',
    source: {
      repo: 'tch-qa-audit',
      path: 'tasks/ke-hoach-qa-toan-bo-be-mat-tracy.md',
      sha256: hash,
      verification: { status: 'verified', probe: 'read' },
      revision,
      lines: text.split('\n').length
    },
    regenerate:
      'node tests/qa/inventory/extractors/legacy-plan.mjs --import <tch-qa-audit>/tasks/ke-hoach-qa-toan-bo-be-mat-tracy.md',
    items
  }
  const problems = validatePlanDoc(doc)
  if (problems.length) throw new SourceError(`refusing to write: ${problems.join('; ')}`)
  writeRepoFile(root, OUT, formatJson(doc))
  return doc
}

export const def = {
  sourcePath: OUT,
  extractionKind: 'json-copy-of-external-plan',
  extract(root) {
    const src = readSource(root, OUT)
    const doc = parseJson(src)
    if (!Array.isArray(doc.items)) throw new SourceError('audit-plan.json has no items[]')
    const items = doc.items.map((i) => ({
      id: `audit-item:${i.id}`,
      kind: 'audit-item',
      auditId: i.id,
      group: i.group,
      level: i.level,
      parent: i.parent,
      title: i.title,
      section: i.section
    }))
    const unresolved = validatePlanDoc(doc).map((detail) => ({
      kind: 'legacy-provenance-invalid',
      detail,
      blocksComplete: true
    }))
    if (doc.source?.verification?.status !== 'verified')
      unresolved.push({
        kind: 'legacy-plan-unverified',
        detail: 'the original audit plan was not compared with this copy',
        blocksComplete: true
      })
    const main = doc.items.filter((i) => i.level === 'main').length
    const perGroup = {}
    for (const i of doc.items) if (i.level === 'main') perGroup[i.group] = (perGroup[i.group] ?? 0) + 1
    return record({
      sourcePath: OUT,
      read: [src],
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: { main, sub: doc.items.length - main, perGroup, originalSource: doc.source }
    })
  }
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv.includes('--import'))
    usageGuard(argv, ['--import', '--root'], 'node legacy-plan.mjs --import FILE [--root DIR]', (f) => {
      const doc = importPlan(resolve(f['--import']), f['--root'] ? resolve(f['--root']) : DEFAULT_ROOT)
      console.log(`imported ${doc.items.length} plan items`)
    })
  else cli(def)
}
