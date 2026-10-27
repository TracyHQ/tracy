#!/usr/bin/env node
// Token report of Claude Code sessions: one row per transcript, totals by kind. No pricing, no weighting.
//
//   node scripts/perf/token-report.mjs [--worktree <abs path>]… [--since <ISO>]   (no --worktree: the current directory)
//        [--projects-root ~/.claude/projects] [--json <file>]
//
// A project dir is named after the worktree path with `/` and `.` replaced by `-`; its transcripts are
// `<dir>/*.jsonl` and `<dir>/<session>/subagents/*.jsonl`. An assistant message is counted once by message.id
// (a message is written once per content block). Per row: first/last timestamp, turns, input / cache-write /
// cache-read / output tokens, context per turn (cache-read ÷ turns), model, label (first 80 chars of the first
// user message) and kind: `lens` when the first 300 chars of the first user message match /lens/i, `subagent`
// for any other subagent transcript, else `main`.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli, parseArgs } from '../quickstart/lib.mjs'

const SPEC = {
  '--worktree': { placeholder: 'abs path', repeat: true, help: 'a worktree whose sessions are reported; repeatable (default: the current directory)' },
  '--since': { placeholder: 'ISO', help: 'only sessions whose last message is at or after this time' },
  '--projects-root': { placeholder: 'dir', default: path.join(homedir(), '.claude', 'projects'), help: 'Claude Code projects directory' },
  '--json': { placeholder: 'file', help: 'write the rows as JSON' }
}

export const projectDirName = (worktree) => path.resolve(worktree).replace(/[/.]/g, '-')

const textOf = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join(' ')
  return ''
}

/** One transcript → a row, or null when it holds no assistant message. */
export function readTranscript(file, subagent = false) {
  const seen = new Set()
  const row = { file, kind: 'main', first: null, last: null, turns: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, contextPerTurn: 0, model: null, label: '' }
  let firstUser = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue
    let d
    try {
      d = JSON.parse(line)
    } catch {
      continue
    }
    if (d.timestamp) {
      row.first ??= d.timestamp
      row.last = d.timestamp
    }
    const m = d.message ?? {}
    if (d.type === 'user' && firstUser === null && !d.isMeta) {
      const t = textOf(m.content).trim()
      if (t) firstUser = t
    }
    if (d.type !== 'assistant' || !m.id || seen.has(m.id)) continue
    seen.add(m.id)
    row.turns++
    row.model = m.model ?? row.model
    const u = m.usage ?? {}
    row.input += u.input_tokens ?? 0
    row.cacheWrite += u.cache_creation_input_tokens ?? 0
    row.cacheRead += u.cache_read_input_tokens ?? 0
    row.output += u.output_tokens ?? 0
  }
  if (!row.turns) return null
  row.contextPerTurn = Math.round(row.cacheRead / row.turns)
  row.label = (firstUser ?? '').replace(/\s+/g, ' ').slice(0, 80)
  row.kind = /lens/i.test((firstUser ?? '').slice(0, 300)) ? 'lens' : subagent ? 'subagent' : 'main'
  return row
}

/** Every transcript of the worktrees' project dirs, as rows sorted by first timestamp. */
export function collect({ projectsRoot, worktrees, since = null }) {
  const rows = []
  const sinceMs = since ? Date.parse(since) : null
  for (const wt of worktrees) {
    const dir = path.join(projectsRoot, projectDirName(wt))
    if (!existsSync(dir)) continue
    const files = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.jsonl')) files.push([path.join(dir, e.name), false])
      if (e.isDirectory()) {
        const sub = path.join(dir, e.name, 'subagents')
        if (existsSync(sub) && statSync(sub).isDirectory()) for (const f of readdirSync(sub)) if (f.endsWith('.jsonl')) files.push([path.join(sub, f), true])
      }
    }
    for (const [file, subagent] of files) {
      const row = readTranscript(file, subagent)
      if (!row) continue
      if (sinceMs !== null && Date.parse(row.last) < sinceMs) continue
      rows.push({ worktree: wt, ...row })
    }
  }
  return rows.sort((a, b) => String(a.first).localeCompare(String(b.first)))
}

export function totalsByKind(rows) {
  const out = {}
  for (const r of rows) {
    const t = (out[r.kind] ??= { sessions: 0, turns: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 })
    t.sessions++
    for (const k of ['turns', 'input', 'cacheWrite', 'cacheRead', 'output']) t[k] += r[k]
  }
  return out
}

const k = (n) => `${(n / 1e3).toFixed(0)}k`
const M = (n) => `${(n / 1e6).toFixed(2)}M`

export function formatReport(rows) {
  const lines = rows.map((r) => `${String(r.first).slice(5, 16)} ${String(r.last).slice(11, 16)} ${r.kind.padEnd(8)} turns=${String(r.turns).padStart(4)} in=${k(r.input).padStart(6)} cw=${M(r.cacheWrite).padStart(7)} cr=${M(r.cacheRead).padStart(8)} out=${k(r.output).padStart(6)} ctx/turn=${k(r.contextPerTurn).padStart(5)} ${(r.model ?? '').padEnd(18)} ${r.label}`)
  lines.push('')
  for (const [kind, t] of Object.entries(totalsByKind(rows)))
    lines.push(`${kind.padEnd(8)} sessions=${t.sessions} turns=${t.turns} in=${k(t.input)} cw=${M(t.cacheWrite)} cr=${M(t.cacheRead)} out=${k(t.output)}`)
  return lines.join('\n')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain)
  cli(async () => {
    const o = parseArgs(process.argv.slice(2), SPEC, 'usage: token-report.mjs [--worktree <abs path>…] [--since <ISO>] [--projects-root <dir>] [--json <file>]')
    const rows = collect({ projectsRoot: o.projectsRoot, worktrees: o.worktree ?? [process.cwd()], since: o.since ?? null })
    console.log(rows.length ? formatReport(rows) : 'no transcripts found')
    if (o.json) writeFileSync(o.json, JSON.stringify({ rows, totals: totalsByKind(rows) }, null, 2) + '\n')
  })
