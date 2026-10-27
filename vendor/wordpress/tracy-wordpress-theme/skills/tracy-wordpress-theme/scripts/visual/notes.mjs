#!/usr/bin/env node
// Notes are todos (EmDash qa-lenses.md, adapted): the machine writes notes/machine.json, each QA
// lens writes notes/<lens>.md, the coding agent writes notes/fix.md (or fix-<group>.md), each lens
// later writes notes/<lens>-close.md — nobody writes the same file — and this script folds them into
// ONE list per stage, NOTES-<stage>.{md,json}. Ids are content-addressed (page|axis|what), so a
// re-merge after fixes keeps them and a lens can close by id. The person who closes is never the one
// who fixed: a lens closes its own rows, the machine closes its rows on a clean rerun.
//
//   node scripts/visual/notes.mjs merge <run-dir> --stage <id>    → NOTES-<stage>.md + .json; exit 1 when a
//                                                                  picture with consumers was not opened
//   node scripts/visual/notes.mjs status <run-dir> --stage <id>   → counts
//   node scripts/visual/notes.mjs plan <run-dir> --stage <id> --lens layout|color --chunks N [--contract <file>]
//                                                                → notes/lens-work/<stage>--<lens>/manifest.json + one
//                                                                  chunk-<n>.prompt.md per parallel lens subagent
//   node scripts/visual/notes.mjs merge-chunks <run-dir> --stage <id> --lens layout|color
//                                                                → notes/<lens>.md, only when every chunk came back whole
//
// Lens work (lens-work.mjs): a planned lens is heard only through its manifest. merge and status check
// every manifest of the stage — bindings (contract, index.json, visual.json, tile bytes), each chunk
// output, the merged note naming the manifest — and a lens that fails is not heard: its pictures count
// as not opened, so an older notes/<lens>.md cannot stand in for a chunk that never came back.
//
// Shapes (Markdown tables; the first table after the heading is read; `|` in cells escaped as \|):
//   notes/<lens>.md        ## Opened: one absolute picture path per `- ` line — what the lens looked at.
//                          ## Notes: | Page | Axis | What | Where | Fix | Verify | Flag |   Flag: empty, LEE (a design
//                          decision the agent may not take) or SOURCE (the source has the same defect; the rule is to do
//                          better than the source, so it is fixed like any todo and only counted apart)
//   notes/fix.md           | Id | Status | Fix |        Status: done | skipped | lee
//   notes/<lens>-close.md  | Id | Status | Reason |     Status: closed | reopened
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LENSES } from './contract.mjs'
import { clusterDigest } from './cluster.mjs'
import { CLUSTERS, INDEX, MACHINE, MANIFEST, MAX_EVIDENCE_BYTES, MAX_SMALL_EVIDENCE_BYTES, NOTES, VISUAL, indexInventory, readEvidence } from './evidence.mjs'
import { readJsonFile, readRegularFile } from './pattern-registry.mjs'
import { contractHash } from '../lib/canonical.mjs'
import { SAMPLED_LENSES, buildLensWork, identityLine, lensWorkDir, manifestId, recommendedModelOf } from './lens-work.mjs'

export const noteId = (prefix, ...parts) => `${prefix}-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 6)}`
const escapeCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const unescapeCell = (s) => s.replace(/\\\|/g, '|').trim()

/** The first Markdown table after `heading` (or the first table in the text), as rows keyed by header. */
export function readTable(text, heading = null) {
  let body = text
  if (heading) {
    const i = text.indexOf(heading)
    if (i < 0) return []
    body = text.slice(i + heading.length)
  }
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith('|'))
  if (start < 0) return []
  const header = lines[start].split(/(?<!\\)\|/).slice(1, -1).map((h) => h.trim().toLowerCase())
  const rows = []
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map(unescapeCell)
    rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])))
  }
  return rows
}

export function readOpened(text) {
  const i = text.indexOf('## Opened')
  if (i < 0) return []
  return text
    .slice(i)
    .split('\n')
    .slice(1)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
}

/**
 * Fold machine findings, lens notes, fixes, closes and the prior merge into one todo list.
 * Pure; the CLI reads the files. `shots` is index.json's list (stage-filtered here).
 */
/** sha256 of a file's bytes, null when it is not there; memoised per process. */
const fileHashes = new Map()
function fileHash(file) {
  if (!fileHashes.has(file)) fileHashes.set(file, existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null)
  return fileHashes.get(file)
}

/** sha256 of a file's bytes read now, not memoised: lens work compares bytes against its plan. */
const bytesHash = (file) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null)

export function mergeNotes({ stage, machine = [], lensNotes = {}, fixes = [], closes = {}, prior = null, shots = [], hashOf = fileHash }) {
  const todos = new Map()
  const add = (row) => {
    const t = todos.get(row.id)
    if (t) {
      for (const l of row.lenses) if (!t.lenses.includes(l)) t.lenses.push(l)
      if (row.flag && !t.flag) t.flag = row.flag
      return
    }
    todos.set(row.id, row)
  }
  for (const m of machine) {
    if (m.stage && m.stage !== stage) continue
    const id = noteId('M', m.page, m.axis, m.what)
    add({ id, lenses: [m.lens], page: m.page, layout: m.layout ?? '', axis: m.axis, what: m.what, where: '', fix: m.fix ?? '', verify: m.verify ?? '', flag: '', status: 'open' })
  }
  const opened = {}
  for (const lens of LENSES) {
    const text = lensNotes[lens]
    if (text == null) continue
    opened[lens] = readOpened(text)
    for (const r of readTable(text, '## Notes')) {
      if (!r.page || !r.what) continue
      const id = noteId('N', r.page, r.axis, r.what)
      add({ id, lenses: [lens], page: r.page, layout: '', axis: r.axis ?? '', what: r.what, where: r.where ?? '', fix: r.fix ?? '', verify: r.verify ?? '', flag: ['LEE', 'SOURCE'].includes((r.flag ?? '').toUpperCase()) ? (r.flag ?? '').toUpperCase() : '', status: 'open' })
    }
  }
  // Several coding agents may answer the same id (a group hands a row to another with `skipped →
  // group`); the strongest verdict wins: done > lee > skipped, and the fix notes are joined.
  const RANK = { done: 3, lee: 2, skipped: 1 }
  for (const r of fixes) {
    const t = todos.get(r.id)
    if (!t) continue
    const status = r.status === 'skipped' ? 'skipped' : r.status === 'lee' ? 'lee' : 'done'
    if (t.fixRank && t.fixRank >= RANK[status]) {
      if (r.fix && !(t.fixNote ?? '').includes(r.fix)) t.fixNote = `${t.fixNote} · ${r.fix}`
      continue
    }
    t.fixNote = r.fix ?? ''
    t.status = status
    t.fixRank = RANK[status]
  }
  for (const [lens, rows] of Object.entries(closes))
    for (const r of rows) {
      const t = todos.get(r.id)
      if (!t || !t.lenses.includes(lens)) continue
      t.closeNote = r.reason ?? ''
      t.status = r.status === 'reopened' ? 'reopened' : 'closed'
    }
  // Machine rows close themselves: absent from the rerun's machine.json = gone; present again after a
  // `done` fix = reopened.
  if (prior)
    for (const p of prior.todos ?? []) {
      if (!p.id.startsWith('M-')) continue
      if (!todos.has(p.id)) todos.set(p.id, { ...p, status: 'closed', closeNote: 'gone on rerun' })
      else if (['done', 'skipped', 'lee'].includes(p.status)) {
        const t = todos.get(p.id)
        t.fixNote = p.fixNote
        t.status = p.status === 'done' ? 'reopened' : p.status
        if (p.status === 'done') t.closeNote = 'still present after the fix'
      }
    }
  // A picture cut into tiles (index.json `tiles`, visual-qa --tile-height) is opened only when EVERY tile
  // was: the reader downsamples a full-page file past legibility, so opening it proves nothing.
  // A tile the lens opened under another path — the same bytes in an earlier run's folder, the
  // page unchanged between them — was looked at: what the rule wants is the eyes on the picture,
  // not on the path (a CSS change re-shoots every page; only the changed ones draw differently).
  const filesOf = (s) => (Array.isArray(s.tiles) && s.tiles.length ? s.tiles : [s.file])
  const openedHashes = {}
  const sawBytes = (lens, f) => {
    const h = hashOf(f)
    if (!h) return false
    openedHashes[lens] ??= new Set((opened[lens] ?? []).map(hashOf).filter(Boolean))
    return openedHashes[lens].has(h)
  }
  const coverage = { missing: [], extra: [] }
  for (const s of shots.filter((s) => s.stage === stage))
    for (const c of s.consumers ?? [])
      if (LENSES.includes(c)) for (const f of filesOf(s)) if (!(opened[c] ?? []).includes(f) && !sawBytes(c, f)) coverage.missing.push({ file: f, lens: c })
  for (const [lens, files] of Object.entries(opened))
    for (const f of files) if (!shots.some((s) => s.consumers?.includes(lens) && (s.file === f || filesOf(s).includes(f)))) coverage.extra.push({ file: f, lens })
  const list = [...todos.values()].sort((a, b) => a.page.localeCompare(b.page) || a.axis.localeCompare(b.axis))
  const counts = Object.fromEntries(['open', 'done', 'skipped', 'lee', 'closed', 'reopened'].map((s) => [s, list.filter((t) => t.status === s).length]))
  counts.leeFlagged = list.filter((t) => t.flag === 'LEE' && t.status !== 'closed').length
  counts.sourceFlagged = list.filter((t) => t.flag === 'SOURCE' && t.status !== 'closed').length
  return { stage, counts, lenses: Object.keys(opened), coverage, todos: list }
}

export function notesMarkdown(result) {
  const { stage, counts, lenses, coverage, todos } = result
  return [
    `# Notes — stage ${stage} — ${result.at ?? ''}`,
    '',
    `Open ${counts.open} · done ${counts.done} · skipped ${counts.skipped} · [LEE] ${counts.lee + counts.leeFlagged} · [SOURCE] ${counts.sourceFlagged ?? 0} · closed ${counts.closed} · reopened ${counts.reopened}. Lenses heard: ${lenses.join(', ') || 'none'}. Pictures (tiles) not opened by a consumer: ${coverage.missing.length}.`,
    '',
    'The coding agent fills **Fix** (notes/fix.md by Id: done/skipped/lee); the lens that wrote a row closes it (notes/<lens>-close.md: closed/reopened). Machine rows close on a clean rerun.',
    '',
    // The machine rows below are sightings; clusters.json (cluster.mjs) groups them by probable root
    // cause. Shown first so a fix is chosen per cluster; ids, closing and reopening are unchanged.
    ...(result.clusters ? ['## Clusters first (machine findings by probable root cause)', '', ...clusterDigest(result.clusters), '', '## Todos', ''] : []),
    '| Id | Lens | Page | Axis | What | Where | Fix hint | Verify | Flag | Status | Fix | Close |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...todos.map((t) => `| ${t.id} | ${t.lenses.join(', ')} | ${t.page} | ${t.axis} | ${escapeCell(t.what)} | ${escapeCell(t.where)} | ${escapeCell(t.fix)} | ${escapeCell(t.verify)} | ${t.flag ?? ''} | ${t.status} | ${escapeCell(t.fixNote)} | ${escapeCell(t.closeNote)} |`),
    todos.length ? '' : 'none',
    '',
    '## Pictures with a consumer that did not open them',
    '',
    ...(coverage.missing.length ? coverage.missing.map((m) => `- ${m.lens}: ${m.file}`) : ['none']),
    '',
    '## Opened but not assigned (contract lists no such consumer)',
    '',
    ...(coverage.extra.length ? coverage.extra.map((m) => `- ${m.lens}: ${m.file}`) : ['none']),
    '',
    '## Lens work not whole (the lens is not heard until every chunk is back and merged)',
    '',
    ...((result.lensWork ?? []).some((w) => w.errors.length) ? result.lensWork.flatMap((w) => w.errors.map((e) => `- ${w.lens}: ${e}`)) : ['none']),
    ''
  ].join('\n')
}

export function mergeRun(runDir, stage) {
  const notesDir = path.join(runDir, 'notes')
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)
  // evidence files are read once, bounded, and validated (evidence.mjs); an absent one is absent, a present malformed one is an Error
  const evidence = (f, schema, what) => (existsSync(f) ? readEvidence(f, schema, { what }) : null)
  const machine = evidence(path.join(notesDir, 'machine.json'), MACHINE, 'notes/machine.json')
  const lensNotes = {}
  const lensWork = checkLensWork(runDir, stage)
  for (const lens of LENSES) {
    const t = read(path.join(notesDir, `${lens}.md`))
    // a planned lens whose chunks are missing, stale or unmerged is not heard at all
    if (t != null && !lensWork.some((w) => w.lens === lens && w.errors.length)) lensNotes[lens] = t
  }
  const fixes = (existsSync(notesDir) ? readdirSync(notesDir) : [])
    .filter((f) => /^fix(-[a-z0-9-]+)?\.md$/.test(f))
    .flatMap((f) => readTable(readFileSync(path.join(notesDir, f), 'utf8')))
  const closes = {}
  for (const lens of LENSES) {
    const t = read(path.join(notesDir, `${lens}-close.md`))
    if (t != null) closes[lens] = readTable(t)
  }
  const prior = evidence(path.join(runDir, `NOTES-${stage}.json`), NOTES, `NOTES-${stage}.json`)
  const clusters = evidence(path.join(runDir, 'clusters.json'), CLUSTERS, 'clusters.json')
  const index = evidence(path.join(runDir, 'index.json'), INDEX, 'index.json')
  const result = mergeNotes({
    stage,
    machine: machine ?? [],
    lensNotes,
    fixes,
    closes,
    prior,
    shots: index ? index.shots : []
  })
  result.lensWork = lensWork
  result.at = new Date().toISOString()
  // The digest only (no members): the members stay in clusters.json, which the digest links to.
  if (clusters) {
    result.clusters = { totals: clusters.totals, clusters: clusters.clusters.map(({ members, ...rest }) => rest) }
  }
  return result
}

const NOTE_HEADER = ['page', 'axis', 'what', 'where', 'fix', 'verify', 'flag']

/** Why a chunk output is not a lens note of this chunk: [] when it is one. */
function chunkOutputErrors(text, { id, chunk, of }) {
  if (text == null) return ['not written']
  if (!text.trim()) return ['empty']
  const errors = []
  const first = text.split('\n').find((l) => l.trim())
  if (first.trim() !== identityLine(id, chunk, of)) errors.push(`first line is not "${identityLine(id, chunk, of)}" (another manifest or chunk)`)
  if (!text.includes('## Opened')) errors.push('no ## Opened')
  const i = text.indexOf('## Notes')
  const lines = i < 0 ? [] : text.slice(i).split('\n')
  const h = lines.findIndex((l) => l.trim().startsWith('|'))
  const cellsOf = (l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim())
  const cells = h < 0 ? [] : cellsOf(lines[h]).map((c) => c.toLowerCase())
  if (i < 0 || cells.join('|') !== NOTE_HEADER.join('|')) {
    errors.push('no ## Notes table with | Page | Axis | What | Where | Fix | Verify | Flag |')
    return errors
  }
  // readTable skips the line after the header as the separator: without one, the first row would be lost
  const sep = lines[h + 1] ?? ''
  if (!sep.trim().startsWith('|') || cellsOf(sep).length !== NOTE_HEADER.length || !cellsOf(sep).every((c) => /^:?-{3,}:?$/.test(c)))
    errors.push('## Notes header is not followed by its |---| separator line')
  // readTable stops at the first line that is not a row: a row after a gap would be lost
  let end = h + 2
  while (end < lines.length && lines[end].trim().startsWith('|')) end++
  const late = lines.slice(end).findIndex((l) => l.trim().startsWith('|'))
  if (late >= 0) errors.push(`## Notes has a table row after the table ended (line "${lines[end + late].trim().slice(0, 60)}"); keep every row in one table`)
  for (const [n, line] of lines.slice(h + 2, end).entries()) {
    const c = cellsOf(line)
    if (c.length !== NOTE_HEADER.length) errors.push(`## Notes row ${n + 1} has ${c.length} cells, not ${NOTE_HEADER.length} (escape a | inside a cell as \\|)`)
    else if (!c[0] || !c[2]) errors.push(`## Notes row ${n + 1} has no Page or What`)
  }
  return errors
}

/**
 * Every lens-work manifest of `stage` in `runDir`, checked: the manifest unedited, its contract,
 * index.json, visual.json and tile bytes unchanged, every chunk output there, of this manifest, well
 * formed and opening every tile of its chunk (by path or same bytes). With `merged` (the default) the
 * lens note must also name the manifest (merge-chunks wrote it). One entry per manifest: {lens, errors}.
 */
export function checkLensWork(runDir, stage, { merged = true, hashOf = bytesHash, only = null } = {}) {
  const root = path.join(runDir, 'notes', 'lens-work')
  if (!existsSync(root)) return []
  const out = []
  for (const name of readdirSync(root).sort()) {
    if (!name.startsWith(`${stage}--`)) continue
    const lens = name.slice(stage.length + 2)
    if (only && lens !== only) continue
    const errors = []
    out.push({ lens, manifest: path.join(root, name, 'manifest.json'), errors })
    let m
    try {
      m = readEvidence(path.join(root, name, 'manifest.json'), MANIFEST, { what: 'lens-work manifest', max: MAX_SMALL_EVIDENCE_BYTES })
    } catch (e) {
      errors.push(`manifest unreadable: ${String(e.message).split('\n')[0]}`)
      continue
    }
    if (m.kind !== 'lens-work' || m.stage !== stage || m.lens !== lens || manifestId(m) !== m.id) {
      errors.push('manifest edited or misplaced (id, stage or lens does not match)')
      continue
    }
    const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)
    // the contract is evidence too: read bounded, as a regular file
    let contract = null
    try {
      contract = existsSync(m.contract.path) ? readRegularFile(m.contract.path, 'contract', MAX_EVIDENCE_BYTES).toString('utf8') : null
    } catch (e) {
      errors.push(`contract unreadable: ${String(e.message).split('\n')[0]}`)
    }
    let hash = null
    try {
      hash = contract == null ? null : contractHash(JSON.parse(contract))
    } catch {
      hash = null
    }
    if (hash !== m.contract.hash) errors.push(`stale: contract ${m.contract.path} changed since the plan`)
    for (const k of ['index', 'visual']) if (hashOf(m[k].path) !== m[k].hash) errors.push(`stale: ${m[k].path} changed since the plan`)
    const byKey = new Map(m.groups.map((g) => [g.key, g]))
    for (const g of m.groups) for (const t of g.tiles) if (hashOf(t.file) !== t.hash) errors.push(`stale: tile ${t.file} changed since the plan`)
    for (const a of m.assignments) {
      const text = read(a.output)
      const bad = chunkOutputErrors(text, { id: m.id, chunk: a.chunk, of: m.chunks })
      for (const e of bad) errors.push(`chunk ${a.chunk} (${a.output}): ${e}`)
      if (bad.length) continue
      const opened = new Set(readOpened(text))
      const openedBytes = new Set([...opened].map(hashOf).filter(Boolean))
      const unopened = a.groups.flatMap((k) => byKey.get(k).tiles).filter((t) => !opened.has(t.file) && !openedBytes.has(t.hash))
      if (unopened.length) errors.push(`chunk ${a.chunk}: ${unopened.length} tile(s) not opened, e.g. ${unopened[0].file}`)
    }
    if (merged) {
      const note = read(path.join(runDir, 'notes', `${lens}.md`))
      if (!note || !note.split('\n').some((l) => l.trim() === identityLine(m.id))) errors.push(`notes/${lens}.md was not merged from this manifest (notes.mjs merge-chunks)`)
      // same manifest is not enough: the note must be what the chunks say now (only when every chunk is whole)
      else if (!errors.length && note !== mergedLensNote(m)) errors.push(`notes/${lens}.md differs from its chunks as they are now (a chunk changed after the merge, or the note was edited) — run notes.mjs merge-chunks again`)
    }
  }
  return out
}

/**
 * The lens note merge-chunks writes from the chunk outputs of manifest `m`, as they are now. merge and
 * status compare notes/<lens>.md with it byte for byte: a chunk edited after the merge (a row added,
 * a tile opened) makes the merged note stale, so it is merged again before it is heard.
 */
function mergedLensNote(m) {
  const opened = []
  const rows = []
  for (const a of m.assignments) {
    const text = readFileSync(a.output, 'utf8')
    for (const f of readOpened(text)) if (!opened.includes(f)) opened.push(f)
    rows.push(...readTable(text, '## Notes'))
  }
  return [
    `# ${m.lens} lens — stage ${m.stage} — merged from ${m.chunks} chunk(s)`,
    '',
    identityLine(m.id),
    '',
    '## Opened',
    ...opened.map((f) => `- ${f}`),
    '',
    '## Notes',
    '| Page | Axis | What | Where | Fix | Verify | Flag |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${NOTE_HEADER.map((h) => escapeCell(r[h])).join(' | ')} |`),
    ''
  ].join('\n')
}

/** Fold the chunks of a checked manifest into notes/<lens>.md. Throws with the reasons when any chunk is not whole. */
export function mergeChunks(runDir, stage, lens) {
  const dir = lensWorkDir(runDir, stage, lens)
  if (!existsSync(path.join(dir, 'manifest.json'))) throw new Error(`no lens-work manifest for ${lens} in ${stage} (notes.mjs plan first)`)
  const [check] = checkLensWork(runDir, stage, { merged: false, only: lens })
  if (check.errors.length) throw new Error(check.errors.join('\n'))
  const m = readEvidence(path.join(dir, 'manifest.json'), MANIFEST, { what: 'lens-work manifest', max: MAX_SMALL_EVIDENCE_BYTES })
  const target = path.join(runDir, 'notes', `${lens}.md`)
  if (existsSync(target) && !readFileSync(target, 'utf8').split('\n').some((l) => l.trim() === identityLine(m.id)))
    throw new Error(`${target} exists and was not merged from this manifest; move it aside first — one lens note per run`)
  const text = mergedLensNote(m)
  writeFileSync(target, text)
  return { lens, stage, chunks: m.chunks, opened: readOpened(text).length, notes: readTable(text, '## Notes').length, file: target }
}

/** Write the manifest and chunk prompts of one lens for one stage of a run (lens-work.mjs buildLensWork). */
export function planRun(runDir, { stage, lens, chunks, contractPath = null }) {
  // each evidence file: bounded regular-file read → parse → its closed schema (evidence.mjs), once
  const visualFile = path.resolve(runDir, 'visual.json')
  const visual = readEvidence(visualFile, VISUAL, { what: 'visual.json' })
  const contractFile = path.resolve(contractPath ?? visual.contract ?? '')
  const files = { contract: contractFile, index: path.resolve(runDir, 'index.json'), visual: visualFile }
  const contract = readJsonFile(contractFile, 'contract')
  const index = readEvidence(files.index, INDEX, { what: 'index.json' })
  // the lens obligations come from the pictures the axes produced: an index that lost or changed a row would drop them
  const held = indexInventory(index, visual, runDir)
  if (held.refusals.length) throw new Error(held.refusals.slice(0, 8).join('\n'))
  const dir = lensWorkDir(runDir, stage, lens)
  if (existsSync(dir) && readdirSync(dir).some((f) => /^chunk-\d+\.md$/.test(f)))
    throw new Error(`${dir} already holds chunk output; a plan never overwrites what a lens wrote`)
  const { manifest, prompts } = buildLensWork({ runDir, stage, lens, chunks, contract, visual, index, files: { ...files, indexHash: bytesHash(files.index), visualHash: bytesHash(files.visual) }, hashOf: bytesHash })
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const p of prompts) writeFileSync(p.file, p.text)
  return manifest
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const [command, runDir] = process.argv.slice(2)
  const opt = (n) => {
    const i = process.argv.indexOf(n)
    return i === -1 ? null : process.argv[i + 1]
  }
  const stage = opt('--stage')
  const lens = opt('--lens')
  if (!['merge', 'status', 'plan', 'merge-chunks'].includes(command) || !runDir || !stage || (['plan', 'merge-chunks'].includes(command) && !lens)) {
    console.error('usage: notes.mjs merge|status <run-dir> --stage <id>\n       notes.mjs plan <run-dir> --stage <id> --lens layout|color --chunks N [--contract <file>]\n       notes.mjs merge-chunks <run-dir> --stage <id> --lens layout|color')
    process.exit(2)
  }
  if (command === 'plan' || command === 'merge-chunks') {
    if (!SAMPLED_LENSES.includes(lens)) {
      console.error(`notes.mjs ${command}: --lens must be one of ${SAMPLED_LENSES.join(', ')} (got ${lens})`)
      process.exit(2)
    }
    const raw = opt('--chunks')
    if (command === 'plan' && !/^[1-9]\d*$/.test(raw ?? '')) {
      console.error(`notes.mjs plan: --chunks must be a positive integer (got ${raw})`)
      process.exit(2)
    }
    try {
      if (command === 'merge-chunks') console.log(JSON.stringify(mergeChunks(runDir, stage, lens)))
      else {
        const m = planRun(runDir, { stage, lens, chunks: Number(raw), contractPath: opt('--contract') })
        console.log(JSON.stringify({ id: m.id, stage, lens, chunks: m.chunks, model: recommendedModelOf(m), tiles: m.tiles, load: m.load, selection: { representatives: m.selection.representatives.length, extras: m.selection.extras.map((x) => x.page), notMeasured: m.selection.notMeasured }, dispatch: m.assignments.map((a) => ({ chunk: a.chunk, tiles: a.tiles, prompt: a.prompt, output: a.output })) }, null, 2))
      }
      process.exit(0)
    } catch (e) {
      console.error(`notes.mjs ${command}: ${e.message}`)
      process.exit(1)
    }
  }
  const result = mergeRun(runDir, stage)
  const lensWork = result.lensWork.filter((w) => w.errors.length).map((w) => ({ lens: w.lens, errors: w.errors }))
  if (command === 'status') {
    console.log(JSON.stringify({ stage, counts: result.counts, lenses: result.lenses, missing: result.coverage.missing.length, lensWork }, null, 2))
    process.exit(0)
  }
  writeFileSync(path.join(runDir, `NOTES-${stage}.json`), JSON.stringify(result, null, 2) + '\n')
  writeFileSync(path.join(runDir, `NOTES-${stage}.md`), notesMarkdown(result))
  console.log(JSON.stringify({ stage, counts: result.counts, lenses: result.lenses, missing: result.coverage.missing.length, extra: result.coverage.extra.length, lensWork }))
  process.exit(result.coverage.missing.length || lensWork.length ? 1 : 0)
}
