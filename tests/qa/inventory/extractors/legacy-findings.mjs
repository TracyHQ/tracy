// Findings of the old audit (ledger-S1..S8). The ledgers live outside this repo, so their needed fields
// are copied once into tests/qa/inventory/legacy/audit-findings.json (`--import <dir>`), with a LOGICAL
// source note (repo name, file name, sha256, revision), never a private path. The normal extractor
// reads that committed JSON. Nothing is invented: repro and fix stay null unless the ledger says them.
import { execFileSync } from 'node:child_process'
import { isAbsolute, join, resolve } from 'node:path'
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
import { validateFindingsDoc } from './legacy-provenance.mjs'

const OUT = 'tests/qa/inventory/legacy/audit-findings.json'
const SHARDS = [1, 2, 3, 4, 5, 6, 7, 8]
const DECL = /^(?:[-*]\s+)?(?:\*\*|#{1,6}\s+|\|\s*)?(F-S([1-8])-(\d{3}))\b/
const FILE_LINE =
  /([A-Za-z0-9_@.\-/]+\.(?:js|mjs|cjs|ts|tsx|json|md|yml|yaml|sh|css|html|py|php)):(\d+(?:[-,]\d+)*)/g
const ITEM_REF =
  /\b(?:QA-)?(SSR|MAIL|DSH|CORE|PUB|REF|CMS|OPS|CONTRACT)-(\d{3}[a-z]?(?:-\d+)?(?:\/\d{3}[a-z]?)*)/g
const FIX_REF = /\b(?:fix(?:ed|es)?(?: in| by)?|PR|issue|closes)\s*#(\d+)/gi

/** Parse one ledger's text into finding records. Pure: no I/O. */
export function parseLedger(text, shard, file) {
  const lines = text.split('\n')
  const starts = []
  lines.forEach((line, i) => {
    const m = DECL.exec(line)
    if (m && Number(m[2]) === shard) starts.push({ i, id: m[1], line, single: !/^(\*\*|#)/.test(line) })
  })
  const found = []
  starts.forEach((s, k) => {
    // A table row or bare pipe line is one line; a heading/bold block runs to the next declaration or heading.
    let end = s.single ? s.i + 1 : (starts[k + 1]?.i ?? lines.length)
    if (!s.table)
      for (let j = s.i + 1; j < end; j++)
        if (/^#{1,3}\s/.test(lines[j])) {
          end = j
          break
        }
    const block = lines.slice(s.i, end).join('\n')
    const head = s.line.replace(/^(?:[-*]\s+)?(\*\*|#{1,6}\s+|\|\s*)?/, '')
    const sev = /\b(P[0-3]|INFO)\b/.exec(head)
    const evidence = [...new Set([...block.matchAll(FILE_LINE)].map((m) => `${m[1]}:${m[2]}`))]
    const reproLine = lines
      .slice(s.i, end)
      .find((l) => /^\s*[-*]?\s*\**\s*(repro|reproduce|steps to reproduce)\b/i.test(l))
    const noteLine = lines.slice(s.i, end).find((l) => /^\s*[-*]?\s*(evidence|claim)\b/i.test(l))
    const fixes = [...new Set([...block.matchAll(FIX_REF)].map((m) => `#${m[1]}`))]
    const items = new Set()
    for (const m of head.matchAll(ITEM_REF))
      for (const part of m[2].split('/')) items.add(`QA-${m[1]}-${part}`)
    const cells = head.split('|').map((x) => x.trim())
    const body = head.replace(/^F-S\d-\d{3}\s*/, '').replace(/\*\*/g, '')
    const parts = body
      .split(/\s+·\s+/)
      .map((x) => x.trim())
      .filter((x) => x && !/^(QA-)?[A-Z]+-\d{3}/.test(x) && !/^(P[0-3]|INFO)\b/.test(x))
    let title = s.single && cells.length >= 4 ? cells[3] : parts.length ? parts.join(' · ') : ''
    for (let k = 0; k < 4; k++)
      title = title
        .replace(/^[\s·|:*-]+/, '')
        .replace(/^(?:QA-)?(?:SSR|MAIL|DSH|CORE|PUB|REF|CMS|OPS)-[\d/a-z.-]+\s*[·|:]?\s*/, '')
        .replace(/^(?:P[0-3]|INFO)\b[^|·]{0,40}[|·]\s*/, '')
    if (!title) title = (lines.slice(s.i + 1, end).find((l) => l.trim()) ?? '').trim()
    found.push({
      id: s.id,
      shard: `S${shard}`,
      severity: sev ? sev[1] : null,
      title: title.slice(0, 200),
      items: [...items],
      evidence,
      evidenceNote: noteLine
        ? noteLine
            .replace(/^\s*[-*]?\s*/, '')
            .trim()
            .slice(0, 400)
        : null,
      repro: reproLine
        ? reproLine
            .replace(/^\s*[-*]?\s*/, '')
            .trim()
            .slice(0, 400)
        : null,
      fixRefs: fixes,
      ledger: file,
      line: s.i + 1
    })
  })
  return found
}

function gitRevision(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return null
  }
}

/**
 * `--import <qa-run dir>`: regenerate the committed JSON from the external ledgers. A ledger that is not
 * there (ENOENT) keeps its previously copied findings and is recorded `unverified` with the probe; it is
 * never counted as checked. Any other read failure (symlink, FIFO, directory...) aborts the import.
 */
export function importLedgers(dir, root) {
  if (!isAbsolute(dir)) throw new SourceError(`--import must be an absolute directory: ${dir}`)
  const previous = readPrevious(root, OUT)
  let previousChecked = false
  const reusable = (file) => {
    // An earlier copy is reused only after the whole document passes the same validator as a fresh one.
    if (previousChecked) return
    if (!previous) throw new SourceError(`${file} is missing and was never imported`)
    const problems = validateFindingsDoc(previous)
    if (problems.length) throw new SourceError(`the earlier copy cannot be reused: ${problems.join('; ')}`)
    previousChecked = true
  }
  const findings = []
  const sources = []
  for (const n of SHARDS) {
    const file = `ledger-S${n}.md`
    let read
    try {
      read = readExternal(join(dir, file))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      reusable(file)
      const had = previous?.source?.files?.find((f) => f.file === file)
      const kept = previous?.findings?.filter((f) => f.shard === `S${n}`)
      if (!had || !kept?.length) throw new SourceError(`${file} is missing and was never imported`)
      sources.push({ ...had, verification: { status: 'unverified', probe: 'ENOENT' } })
      findings.push(...kept)
      continue
    }
    const parsed = parseLedger(read.text, n, file)
    if (parsed.length === 0)
      throw new SourceError(`${file} yields no finding: the ledger format changed or the file is wrong`)
    sources.push({
      file,
      sha256: read.hash,
      lines: read.text.split('\n').length,
      verification: { status: 'verified', probe: 'read' }
    })
    findings.push(...parsed)
  }
  const doc = {
    note: 'Copied from the old audit (ledger-S1..S8). Source lives outside this repo; only fields the ledgers state are kept. repro/fixRefs are null/empty when the ledger names none. `verification` says whether the original was readable when this copy was made: unverified entries keep an earlier copy that could not be compared.',
    source: {
      repo: 'tch-qa-audit',
      directory: 'qa-run',
      revision: gitRevision(dir),
      files: sources
    },
    regenerate: 'node tests/qa/inventory/extractors/legacy-findings.mjs --import <tch-qa-audit>/qa-run',
    findings
  }
  const problems = validateFindingsDoc(doc)
  if (problems.length) throw new SourceError(`refusing to write: ${problems.join('; ')}`)
  writeRepoFile(root, OUT, formatJson(doc))
  return doc
}

export const def = {
  sourcePath: OUT,
  extractionKind: 'json-copy-of-external-ledgers',
  extract(root) {
    const src = readSource(root, OUT)
    const doc = parseJson(src)
    if (!Array.isArray(doc.findings)) throw new SourceError('audit-findings.json has no findings[]')
    const items = doc.findings.map((f) => ({
      id: `audit-finding:${f.id}`,
      kind: 'audit-finding',
      findingId: f.id,
      shard: f.shard,
      severity: f.severity,
      items: f.items,
      title: f.title,
      evidence: f.evidence,
      evidenceNote: f.evidenceNote ?? null,
      repro: f.repro,
      fixRefs: f.fixRefs,
      ledger: f.ledger,
      line: f.line
    }))
    const perShard = {}
    for (const f of doc.findings) perShard[f.shard] = (perShard[f.shard] ?? 0) + 1
    const unresolved = validateFindingsDoc(doc).map((detail) => ({
      kind: 'legacy-provenance-invalid',
      detail,
      blocksComplete: true
    }))
    unresolved.push(
      ...(doc.source?.files ?? [])
        .filter((f) => f?.verification?.status !== 'verified')
        .map((f) => ({
          kind: 'legacy-ledger-unverified',
          detail: `${f?.file}: original not compared (${f?.verification?.probe ?? 'no verification recorded'}); its copied findings are unconfirmed`,
          blocksComplete: true
        }))
    )
    for (const n of SHARDS)
      if (!doc.findings.some((f) => f.shard === `S${n}`))
        unresolved.push({
          kind: 'legacy-ledger-empty',
          detail: `no finding copied from ledger-S${n}`,
          blocksComplete: true
        })
    return record({
      sourcePath: OUT,
      read: [src],
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: { perShard, briefSaid: 155, declared: doc.findings.length, originalSource: doc.source }
    })
  }
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv.includes('--import'))
    usageGuard(argv, ['--import', '--root'], 'node legacy-findings.mjs --import DIR [--root DIR]', (f) => {
      const doc = importLedgers(resolve(f['--import']), f['--root'] ? resolve(f['--root']) : DEFAULT_ROOT)
      console.log(`imported ${doc.findings.length} findings from ${doc.source.files.length} ledgers`)
    })
  else cli(def)
}
