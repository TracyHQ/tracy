#!/usr/bin/env node
// Notes are todos. The machine writes notes/machine.json, each QA lens writes notes/<lens>.md, the
// coding agent writes notes/fix.md, each lens later writes notes/<lens>-close.md — nobody writes the
// same file, and this script folds them, sequentially, into ONE list per stage.
//
//   node tools/qa-notes.mjs merge <run-dir> --stage <id>      → NOTES-<stage>.md + .json, exit 1 when
//                                                              a picture with consumers was not opened
//   node tools/qa-notes.mjs status <run-dir> --stage <id>     → counts (open/done/closed/reopened/lee)
//
// Shapes (Markdown tables; the first table after the heading is read, `|` inside cells escaped as \|):
//   notes/<lens>.md        ## Opened: one absolute picture path per `- ` line — what the lens actually
//                          looked at. ## Notes: | Page | Axis | What | Where | Fix | Verify | Flag |
//                          Flag is empty, LEE (a design decision the agent may not take) or SOURCE (the
//                          source has the same defect; the rule is to do better than the source, so it
//                          is fixed like any other todo and only counted apart).
//   notes/fix.md or notes/fix-<group>.md (one per coding agent, disjoint file groups)
//                          | Id | Status | Fix |   Status: done | skipped | lee
//   notes/<lens>-close.md  | Id | Status | Reason |   Status: closed | reopened
//
// Ids are content-addressed (page|axis|lens|what), so a re-merge after fixes keeps them and a lens can
// close by id. Two lenses reporting the same page/axis/what become one row with both lens tags.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const LENSES = ['layout', 'typography', 'color', 'images', 'interaction']
const id = (prefix, ...parts) =>
  `${prefix}-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 6)}`
const unescape = (s) => s.replace(/\\\|/g, '|').trim()
const escape = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
/** Rows of the first Markdown table under `heading` (or the first table in the file). */
export function readTable(text, heading) {
  let body = text
  if (heading) {
    const i = text.indexOf(heading)
    if (i < 0) return []
    body = text.slice(i + heading.length)
  }
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith('|'))
  if (start < 0) return []
  // split on unescaped pipes only; `\|` inside a cell is a literal pipe
  // A row may lack its closing pipe (agents do that); keep the last cell in that case.
  const cellsOf = (line) => {
    const t = line.trim()
    const parts = t.split(/(?<!\\)\|/)
    return parts.slice(1, t.endsWith('|') && !t.endsWith('\\|') ? -1 : undefined)
  }
  const header = cellsOf(lines[start]).map((h) => h.trim().toLowerCase())
  const rows = []
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break
    const cells = cellsOf(line)
    if (cells.length < header.length) continue
    rows.push(Object.fromEntries(header.map((h, i) => [h, unescape(cells[i] ?? '')])))
  }
  return rows
}
const readOpened = (text) => {
  const i = text.indexOf('## Opened')
  if (i < 0) return []
  return text
    .slice(i)
    .split('\n')
    .slice(1)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
}

export function main(argv = process.argv.slice(2)) {
  const args = argv
  const [command, runDir] = args
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
  const stage = opt('--stage')
  if (!['merge', 'status'].includes(command) || !runDir || !stage) {
    console.error('usage: qa-notes.mjs merge|status <run-dir> --stage <id>')
    process.exit(2)
  }
  const notesDir = path.join(runDir, 'notes')

  // ── gather ─────────────────────────────────────────────────────────────────────────────────────
  // A rerun carries the previous merge forward: every todo keeps its status until a fix or a close
  // moves it; a machine finding that is present again reopens its row, one that is gone closes it.
  const priorPath = path.join(runDir, `NOTES-${stage}.json`)
  const prior = existsSync(priorPath) ? JSON.parse(readFileSync(priorPath, 'utf8')) : null
  const todos = new Map()
  const seenNow = new Set()
  for (const t of prior?.todos ?? []) todos.set(t.id, { ...t })
  const add = (key, row) => {
    seenNow.add(key)
    if (todos.has(key)) {
      const t = todos.get(key)
      for (const l of row.lenses) if (!t.lenses.includes(l)) t.lenses.push(l)
      if (row.flag && !t.flag) t.flag = row.flag
      // reported again after the coding agent said done → the fix did not hold
      if (key.startsWith('M-') && ['done', 'skipped', 'lee'].includes(t.status) && t.status === 'done') {
        t.status = 'reopened'
        t.closeNote = 'still present after the fix'
      }
      return
    }
    todos.set(key, row)
  }
  const machinePath = path.join(notesDir, 'machine.json')
  if (existsSync(machinePath))
    for (const m of JSON.parse(readFileSync(machinePath, 'utf8'))) {
      if (m.stage && m.stage !== stage) continue
      const key = id('M', m.page, m.axis, m.lens, m.what)
      add(key, {
        id: key,
        lenses: [m.lens],
        page: m.page,
        layout: m.layout ?? '',
        axis: m.axis,
        what: m.what,
        where: '',
        fix: m.fix,
        verify: m.verify,
        flag: '',
        status: 'open'
      })
    }
  const opened = {}
  for (const lens of LENSES) {
    const f = path.join(notesDir, `${lens}.md`)
    if (!existsSync(f)) continue
    const text = readFileSync(f, 'utf8')
    opened[lens] = readOpened(text)
    for (const r of readTable(text, '## Notes')) {
      if (!r.page || !r.what) continue
      const key = id('N', r.page, r.axis, lens, r.what)
      add(key, {
        id: key,
        lenses: [lens],
        page: r.page,
        layout: '',
        axis: r.axis ?? '',
        what: r.what,
        where: r.where ?? '',
        fix: r.fix ?? '',
        verify: r.verify ?? '',
        flag: ['LEE', 'SOURCE'].includes((r.flag ?? '').toUpperCase()) ? (r.flag ?? '').toUpperCase() : '',
        status: 'open'
      })
    }
  }
  // Fix rows (coding agents) and close rows (lenses) are applied in the order the files were written:
  // a fix answers the latest lens verdict and a verdict judges the latest fix, so mtime is the order.
  const ops = []
  for (const f of existsSync(notesDir) ? readdirSync(notesDir) : []) {
    const fix = /^fix(-[a-z0-9-]+)?\.md$/.test(f)
    const close = f.match(/^([a-z]+)-close\.md$/)
    if (!fix && !close) continue
    const full = path.join(notesDir, f)
    ops.push({
      at: statSync(full).mtimeMs,
      fix,
      lens: close?.[1],
      rows: readTable(readFileSync(full, 'utf8'))
    })
  }
  ops.sort((x, y) => x.at - y.at)
  for (const op of ops)
    for (const r of op.rows) {
      const t = todos.get(r.id)
      if (!t) continue
      if (op.fix) {
        t.fixNote = r.fix ?? ''
        t.status = r.status === 'skipped' ? 'skipped' : r.status === 'lee' ? 'lee' : 'done'
      } else {
        if (!LENSES.includes(op.lens) || !t.lenses.includes(op.lens)) continue
        t.closeNote = r.reason ?? ''
        t.status = r.status === 'reopened' ? 'reopened' : 'closed'
      }
    }

  // Machine rows close themselves: a finding absent from this run's machine.json is gone.
  for (const t of todos.values())
    if (t.id.startsWith('M-') && !seenNow.has(t.id) && t.status !== 'closed') {
      t.status = 'closed'
      t.closeNote = t.closeNote || 'gone on rerun'
    }

  // ── coverage: every picture with consumers must have been opened by each consumer ─────────────
  // A picture cut into tiles (index.json `tiles`, visual-qa --tile-height) is opened only when EVERY
  // tile was: a full-page file is downsampled past legibility by the reader, so opening it proves nothing.
  const indexPath = path.join(runDir, 'index.json')
  const shots = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')).shots : []
  const filesOf = (s) => (Array.isArray(s.tiles) && s.tiles.length ? s.tiles : [s.file])
  const coverage = { missing: [], extra: [] }
  for (const s of shots.filter((s) => s.stage === stage))
    for (const c of s.consumers)
      if (LENSES.includes(c))
        for (const f of filesOf(s))
          if (!(opened[c] ?? []).includes(f)) coverage.missing.push({ file: f, lens: c })
  for (const [lens, files] of Object.entries(opened))
    for (const f of files)
      if (!shots.some((s) => s.consumers.includes(lens) && (s.file === f || filesOf(s).includes(f))))
        coverage.extra.push({ file: f, lens })

  const list = [...todos.values()].sort(
    (a, b) => a.page.localeCompare(b.page) || a.axis.localeCompare(b.axis)
  )
  const counts = Object.fromEntries(
    ['open', 'done', 'skipped', 'lee', 'closed', 'reopened'].map((s) => [
      s,
      list.filter((t) => t.status === s).length
    ])
  )
  counts.leeFlagged = list.filter((t) => t.flag === 'LEE' && t.status !== 'closed').length
  counts.sourceFlagged = list.filter((t) => t.flag === 'SOURCE' && t.status !== 'closed').length
  const lensesSeen = Object.keys(opened)
  const result = { stage, at: new Date().toISOString(), counts, lenses: lensesSeen, coverage, todos: list }

  if (command === 'status') {
    console.log(
      JSON.stringify({ stage, counts, lenses: lensesSeen, missing: coverage.missing.length }, null, 2)
    )
    process.exit(0)
  }
  writeFileSync(priorPath, JSON.stringify(result, null, 2) + '\n')
  writeFileSync(
    path.join(runDir, `NOTES-${stage}.md`),
    [
      `# Notes — stage ${stage} — ${result.at}`,
      '',
      `Open ${counts.open} · done ${counts.done} · skipped ${counts.skipped} · [LEE] ${counts.lee + counts.leeFlagged} · [SOURCE] ${counts.sourceFlagged} · closed ${counts.closed} · reopened ${counts.reopened}. Lenses heard: ${lensesSeen.join(', ') || 'none'}. Pictures (tiles) not opened by a consumer: ${coverage.missing.length}.`,
      '',
      'The coding agent fills **Fix** (notes/fix.md by Id: done/skipped/lee); the lens that wrote a row closes it (notes/<lens>-close.md: closed/reopened). Machine rows close on a clean rerun.',
      '',
      '| Id | Lens | Page | Axis | What | Where | Fix hint | Verify | Flag | Status | Fix | Close |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...list.map(
        (t) =>
          `| ${t.id} | ${t.lenses.join(', ')} | ${t.page} | ${t.axis} | ${escape(t.what)} | ${escape(t.where)} | ${escape(t.fix)} | ${escape(t.verify)} | ${t.flag} | ${t.status} | ${escape(t.fixNote)} | ${escape(t.closeNote)} |`
      ),
      list.length ? '' : 'none',
      '',
      '## Pictures with a consumer that did not open them',
      '',
      ...(coverage.missing.length ? coverage.missing.map((m) => `- ${m.lens}: ${m.file}`) : ['none']),
      '',
      '## Opened but not assigned (contract lists no such consumer)',
      '',
      ...(coverage.extra.length ? coverage.extra.map((m) => `- ${m.lens}: ${m.file}`) : ['none']),
      ''
    ].join('\n')
  )
  console.log(
    JSON.stringify({
      stage,
      counts,
      lenses: lensesSeen,
      missing: coverage.missing.length,
      extra: coverage.extra.length
    })
  )
  process.exit(coverage.missing.length ? 1 : 0)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
