#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/checkpoint.mjs — WordPress changes: the phase list is the WordPress build (0 provision … 10 quickstart, no separate intake phase) and carries names.
// Durable phase evidence. Changed inputs invalidate completion, never silently skip work.
import { realpathSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { assertNotProtected, emitResult, takeOutputFlags } from './lib/cli-output.mjs'
// Ordered list first: an object keyed by phase id would put '10' before '6b' (integer-like keys
// enumerate first), and the order is what `complete` checks.
const PHASE_LIST = [
  ['0', 'provision'],
  ['1', 'scaffold'],
  ['2', 'ingest'],
  ['3', 'chrome'],
  ['4', 'theme-json'],
  ['5', 'templates-patterns'],
  ['6', 'css-dark'],
  ['6b', 'imagery'],
  ['7', 'content'],
  ['7b', 'i18n'],
  ['8', 'verify'],
  ['8b', 'review'],
  ['9', 'package'],
  ['10', 'quickstart']
]
export const PHASES = PHASE_LIST.map(([id]) => id)
export const PHASE_NAMES = Object.fromEntries(PHASE_LIST)
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const skillVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version
export function checkpoint(file, command, args) {
  file = resolve(file)
  if (command === 'init') {
    if (existsSync(file)) throw new Error('Checkpoint already exists; use status')
    const [mode, source, target, selected] = args
    if (!['website', 'template', 'edit'].includes(mode) || !source || !target)
      throw new Error('init requires mode, source and target')
    const defaults =
      mode === 'template'
        ? PHASES
        : mode === 'website'
          ? PHASES.filter((p) => !['9', '10'].includes(p))
          : ['1', '2', '6', '8', '8b']
    const phases = selected ? selected.split(',') : defaults
    const mandatory = mode === 'template' ? PHASES : ['1', '2', '8', '8b']
    if (
      mandatory.some((p) => !phases.includes(p)) ||
      phases.some((p) => !PHASES.includes(p)) ||
      new Set(phases).size !== phases.length ||
      phases.join() !== PHASES.filter((p) => phases.includes(p)).join()
    )
      throw new Error(
        'Phase list must be ordered, unique and retain required scaffold/ingest/verify/review phases'
      )
    writeFileSync(
      file,
      JSON.stringify({ version: 1, skillVersion, mode, source, target, phases, completed: {} }, null, 2) +
        '\n',
      { flag: 'wx' }
    )
  }
  const state = JSON.parse(readFileSync(file))
  if (state.version !== 1 || !Array.isArray(state.phases)) throw new Error('Unsupported checkpoint')
  const valid = (entry) =>
    entry &&
    state.skillVersion === skillVersion &&
    entry.evidence.length > 0 &&
    entry.evidence.every((e) => {
      try {
        return hash(resolve(dirname(file), e.path)) === e.sha256
      } catch {
        return false
      }
    })
  if (command === 'complete') {
    const [phase, ...files] = args
    if (!state.phases.includes(phase) || !files.length)
      throw new Error('complete requires a planned phase and evidence files')
    const earlier = state.phases.slice(0, state.phases.indexOf(phase))
    if (earlier.some((p) => !valid(state.completed[p])))
      throw new Error('An earlier phase needs verification first')
    state.completed[phase] = {
      at: new Date().toISOString(),
      evidence: files.map((p) => {
        const full = resolve(p),
          rel = relative(dirname(file), full)
        if (rel.startsWith('..') || isAbsolute(rel))
          throw new Error('Evidence must stay beside the checkpoint')
        return { path: rel, sha256: hash(full) }
      })
    }
    for (const later of state.phases.slice(state.phases.indexOf(phase) + 1)) delete state.completed[later]
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
    renameSync(tmp, file)
  } else if (!['init', 'status'].includes(command)) throw new Error('Use init, complete or status')
  let stale = state.skillVersion !== skillVersion
  const phases = state.phases.map((phase) => {
    const ok = !stale && valid(state.completed[phase])
    if (!ok) stale = true
    return { phase, name: PHASE_NAMES[phase], status: ok ? 'complete' : 'needs-verification' }
  })
  return {
    ...state,
    phases,
    next: phases.find((p) => p.status !== 'complete')?.phase ?? null,
    note: 'Hashes prove evidence is unchanged; recheck the live target before resuming. Skill version changes require a new checkpoint.'
  }
}
export const STATUS_NOW_LIMIT = 40

/**
 * The `Now` block of a STATUS.md: from its `# Now` / `## Now` heading to the next heading of level 1–2
 * (trailing blank lines do not count). Returns null when the text has no such heading.
 */
export function statusNowBlock(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^#{1,2}\s+Now\b/i.test(l))
  if (start === -1) return null
  let end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l))
  if (end === -1) end = lines.length
  while (end > start + 1 && lines[end - 1].trim() === '') end--
  return { start: start + 1, lines: end - start }
}

/** Warnings about the STATUS.md beside a checkpoint. Advisory only: never read by the phase logic. */
export function statusWarnings(file) {
  const status = resolve(dirname(file), 'STATUS.md')
  if (!existsSync(status)) return []
  const block = statusNowBlock(readFileSync(status, 'utf8'))
  if (!block) return [`STATUS.md has no "## Now" block; keep the current state in a block of at most ${STATUS_NOW_LIMIT} lines and the history in STATUS-log.md`]
  // `head -40 STATUS.md` is how the state is read: the block must start on line 1 and end within line 40
  if (block.start !== 1)
    return [`STATUS.md "Now" block starts at line ${block.start}; it must be the first thing in the file so that \`head -${STATUS_NOW_LIMIT} STATUS.md\` shows it`]
  if (block.lines > STATUS_NOW_LIMIT)
    return [`STATUS.md "Now" block is ${block.lines} lines (limit ${STATUS_NOW_LIMIT}); move older entries to STATUS-log.md`]
  return []
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const { argv, json, out } = takeOutputFlags(process.argv.slice(2))
    const [command, file, ...args] = argv
    if (!file) throw new Error('checkpoint.mjs init|complete|status <file> ... [--json] [--out FILE]')
    const protect = [file, resolve(dirname(file), 'STATUS.md'), resolve(dirname(file), 'STATUS-log.md'), ...(command === 'complete' ? args : [])]
    // the result destination is checked before the command changes anything
    if (out) assertNotProtected(out, protect)
    const result = checkpoint(file, command, args)
    const warnings = statusWarnings(resolve(file))
    for (const w of warnings) console.error(`warning: ${w}`)
    if (warnings.length) result.warnings = warnings
    const done = result.phases.filter((p) => p.status === 'complete').length
    emitResult({
      result,
      json,
      out,
      script: 'checkpoint',
      label: command,
      key: resolve(file),
      protect,
      summary: `complete=${done}/${result.phases.length} next=${result.next ?? 'none'}${warnings.length ? ` warnings=${warnings.length}` : ''}`
    })
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
