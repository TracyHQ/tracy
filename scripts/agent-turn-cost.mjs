#!/usr/bin/env node
/**
 * How much time and how many tokens one agent turn costs — read from the session that ran.
 *
 * WHY IT MUST BE A MACHINE. `tasks/todo-beta-01-10.md` §3 opens with "measure the current state: time and tokens of
 * one agent turn on three platforms, record the baseline", and a hand-pasted baseline cannot be compared by the next
 * measurement: nobody knows what it counted. The only figures present everywhere are in `session.vN.jsonl.zstd` — every event
 * has a `time`, and every `assistant/message` carries a full `usage`. This tool reads exactly those two, so
 * "before" and "after" are always the same measurement.
 *
 * 🔒 `totalTokens` IN THE LOG IS NOT THE COST, AND MISTAKING IT IS AN ORDER OF MAGNITUDE OFF. Measured 19/09
 * on the heaviest turn of `demowp`: the log says `total = 923,027`, of which `cacheRead = 845,312`
 * — tokens re-read from the prompt cache, far cheaper. The NEW tokens are only `input = 60,286` + `output = 17,429`.
 * So the column worth optimising is `new` (input+output), while `cacheRead` is **a measure of context length**: it is
 * the integral of the context over the steps, so it grows with the SQUARE of the step count. Cutting steps cuts both.
 *
 * 🔒 AND IT PRINTS THE `preset` RATHER THAN INFERRING FROM THE DIRECTORY NAME. A turn's platform must be readable from
 * the session itself, because a site's directory is deleted with the site while its sessions remain — measured 19/09: 18
 * sessions under `--site-demojoomla--` still there while `/site/demojoomla` was gone. And when
 * `agentPreset` is ABSENT, say it is absent: none of those 18 sessions carried a preset, so no turn could be
 * attributed to Joomla. Guessing from the directory name is the cheapest way to record a baseline on the wrong platform.
 *
 * 🔒 BUT A TURN'S PRESET IS THE PRESET IN FORCE, NOT THE BOOT PRESET — fixed 19/09, and
 * before the fix this very tool recorded a baseline mixing two platforms. `session.agentPreset` is the bundle
 * default: `designer-wordpress` for EVERY site, Joomla sites included. `presetForSite`
 * (`@tracy/dsh-mode-picker`) changes it later, with an `agent-preset/selected` event, once the page knows
 * which CMS the site runs. Measured on `--site-demojlnam--`: all three sessions declare `designer-wordpress` in the
 * head, two of the three emit `designer-joomla` BEFORE the first turn. Reading only the head puts two Joomla turns
 * in the `wordpress` bucket, and that bucket's median is no longer the median of any platform.
 *
 * Usage:
 *   node scripts/agent-turn-cost.mjs                     # read from the running tracy-dsh container
 *   node scripts/agent-turn-cost.mjs <dir>               # read from an unpacked .jsonl tree
 *   node scripts/agent-turn-cost.mjs --json              # for machine-to-machine comparison
 *   TRACY_DSH_CONTAINER=tracy-dsh node scripts/agent-turn-cost.mjs
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { newestSessionLog, parseSessionBytes, restoreSession } from './measure/session-metrics.mjs'

/** Where dsh keeps sessions in the image. */
const SESSIONS = '/desk-home/sessions'

/**
 * Pull every session out of the running container.
 *
 * `docker cp` file by file instead of `tar` on the whole tree: lane names start with `--`, and every command that takes flags reads
 * that as a flag — `ls`, `tar`, `find` all died exactly there while this tool was written.
 * @param {string} container
 * @returns {string} temp directory holding `<lane>/<session>.jsonl`
 */
function pullFromContainer(container) {
  const out = mkdtempSync(path.join(tmpdir(), 'tracy-turns-'))
  const listed = execFileSync(
    'docker',
    ['exec', container, 'find', SESSIONS, '-name', 'session.v*.jsonl.zstd'],
    {
      encoding: 'utf8'
    }
  )
  // The newest generation of each session only: since dsh 0.1.7 a converted session keeps its
  // untouched `session.v3` beside the `session.v4` that grows (see `newestSessionLog`).
  const byDir = new Map()
  for (const file of listed.split('\n').filter(Boolean)) {
    const dir = path.dirname(file)
    byDir.set(dir, [...(byDir.get(dir) ?? []), path.basename(file)])
  }
  const newest = [...byDir].map(([dir, names]) => path.join(dir, newestSessionLog(names) ?? names[0]))
  for (const file of newest) {
    const session = path.basename(path.dirname(file))
    const lane = path.basename(path.dirname(path.dirname(file)))
    const zstd = path.join(out, `${lane}__${session}.jsonl.zstd`)
    execFileSync('docker', ['cp', `${container}:${file}`, zstd], { stdio: 'ignore' })
    execFileSync('zstd', ['-d', '-f', '-q', '-o', zstd.replace(/\.zstd$/, ''), zstd], { stdio: 'ignore' })
  }
  return out
}

const GENERATION = /^session\.v\d+\.jsonl$/

/**
 * Every `.jsonl` file under a directory, one or two levels down. Where a directory holds several
 * `session.vN.jsonl` generations, only the newest is the session (dsh 0.1.7 leaves the V3 beside V4).
 */
function jsonlFiles(root) {
  const found = []
  const entries = readdirSync(root)
  const newest = newestSessionLog(entries)
  for (const entry of entries) {
    const full = path.join(root, entry)
    if (statSync(full).isDirectory()) found.push(...jsonlFiles(full))
    else if (GENERATION.test(entry) ? entry === newest : entry.endsWith('.jsonl')) found.push(full)
  }
  return found
}

/** Logs the rc.2 catalog could not restore to V4, read as stored instead — reported once by `main`. */
const unrestored = []

/**
 * Each `tracy_site` action is a verb of its own — folding them into "tracy_site" would make the verb
 * table say nothing, since it is the tool the agent calls most.
 * @param {{name?: unknown, arguments?: unknown}} call
 */
function verbOf(call) {
  if (!['tracy_site', 'tracy_emdash'].includes(call?.name)) return String(call?.name ?? '?')
  try {
    const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments
    return `${call.name}:${args?.action ?? '?'}`
  } catch {
    return `${call.name}:?`
  }
}

/** A refusal can be correct protection; retain the code instead of calling every refusal waste. */
export function failureClass(code) {
  if (['BAD_PARAMS', 'INVALID_ARGUMENTS', 'UNKNOWN_ACTION', 'NOT_ON_THIS_PLATFORM'].includes(code))
    return 'arguments'
  if (
    [
      'CONFIRM_FIRST',
      'NO_VIEWER',
      'FORBIDDEN',
      'SITE_OUTSIDE_CONVERSATION',
      'NOT_EDITABLE',
      'NOT_SUPPORTED_HERE',
      'BODY_SHRINK'
    ].includes(code)
  )
    return 'protection'
  if (['STORE_CHANGED', 'STALE_REVISION', 'SITE_BUSY', 'RATE_LIMITED'].includes(code)) return 'contention'
  if (['OUTCOME_UNKNOWN', 'WRITE_OUTCOME_UNKNOWN'].includes(code)) return 'uncertain-write'
  if (['COWORK_WEB_UNREACHABLE', 'TOOL_FAILED', 'READ_FAILED'].includes(code)) return 'execution'
  if (['NOT_FOUND', 'AMBIGUOUS'].includes(code)) return 'targeting'
  return 'unclassified'
}

/** Parse the outer receipt only: nested failed items do not make a successful batch a refusal. */
function resultOutcome(text) {
  try {
    const result = JSON.parse(text)
    if (result?.ok === true) return { outcome: 'ok', code: null, failureClass: null }
    if (result?.ok === false) {
      const code =
        typeof result.code === 'string'
          ? result.code
          : typeof result.error === 'string'
            ? result.error
            : '(no code)'
      return { outcome: 'refused', code, failureClass: failureClass(code) }
    }
  } catch {
    // Plain text and mixed content have no trustworthy outer receipt.
  }
  return { outcome: 'unknown', code: null, failureClass: null }
}

/** Every text fragment in a content structure, however deeply nested. */
function textIn(node, out = []) {
  if (Array.isArray(node)) for (const item of node) textIn(item, out)
  else if (node !== null && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text)
    for (const value of Object.values(node)) textIn(value, out)
  }
  return out
}

/**
 * Split a session file into TURNS, because the turn is the unit the user feels: one sentence typed
 * in, one answer out. The step is the model's unit, and the step count is what produces the cost.
 * @param {string} file
 */
export function turnsIn(file) {
  const rows = []
  let head = null
  let prompter = null
  // THE PRESET IN FORCE, not the boot preset. `session.agentPreset` is the bundle default
  // (`designer-wordpress` for every site), and `presetForSite` changes it once the page knows which CMS the site
  // runs — the turn must carry the preset the agent ACTUALLY holds. See `livePreset` below.
  let livePreset = null
  let liveRequest = null
  const turns = new Map()
  // Every log is read in V4 shape (restored through the rc.2 catalog), so a converted session and its
  // V3 original count the same turns; `textIn` below reads either tool-result shape regardless.
  const parsed = parseSessionBytes(readFileSync(file), false)
  const { header, events, restored, reason } = restoreSession(parsed.header, parsed.rows)
  if (!restored) unrestored.push(`${file}: ${reason}`)
  for (const event of header === null ? events : [header, ...events]) {
    if (event.type === 'session') {
      head = event
      livePreset = typeof event.agentPreset === 'string' ? event.agentPreset : null
      continue
    }
    const data = event.data ?? {}
    // Headers have no turn number. Keep the effective header for each answered model step,
    // including additions and resumed sessions; do not copy arguments or descriptions into reports.
    if (event.type === 'request/header' && data.header) {
      const tools = data.header.tools ?? []
      const schema = JSON.stringify(tools)
      const config = data.header.config ?? {}
      liveRequest = {
        provider: config.provider ?? null,
        model: config.model ?? null,
        reasoningEffort: config.reasoningEffort ?? null,
        toolNames: tools.map((tool) => tool.name),
        schemaChars: schema.length,
        schemaHash: createHash('sha256').update(schema).digest('hex')
      }
    }
    // 🔒 THE PRESET CHANGES MID-SESSION, AND `session.agentPreset` DOES NOT FOLLOW. Measured 19/09 on
    // `--site-demojlnam--` (a real Joomla site, `site.platform = joomla`): all three sessions carry
    // `agentPreset: designer-wordpress` in the `session` event, but two of the three emit
    // `agent-preset/selected → designer-joomla` BEFORE the first turn — `presetForSite` changes it once
    // the page knows which CMS the site runs. Reading only the head labels Joomla turns `wordpress`, and this tool's
    // "wordpress" bucket swallowed 2 turns of that lane: a baseline mixing two platforms, unseen.
    // This event does NOT carry `data.turn`, so it must be read before the `continue` just below.
    if (event.type === 'agent-preset/selected' && typeof data.agentPreset === 'string') {
      livePreset = data.agentPreset
    }
    // WHO TYPED, if anybody did. This is not bookkeeping: `planFor` mints the door's assertion from
    // the prompter, and with no prompter it falls through to the viewer and then to `NO_VIEWER`. Measured
    // 19/09: all 39 `NO_VIEWER` calls in this session store were in the 17/09 sessions WITHOUT a
    // prompter, while the two 19/09 sessions WITH a prompter had none. Without this column,
    // `NO_VIEWER` reads as "the door asks the customer to open a browser", when it really is "nobody is in this session".
    if (event.type === 'user/message') {
      const typed = data.source?.prompter?.email
      if (typeof typed === 'string' && typed !== '') prompter = typed
    }
    if (data.turn === undefined) continue
    if (!turns.has(data.turn)) {
      turns.set(data.turn, {
        start: null,
        end: null,
        steps: 0,
        verbs: [],
        usage: [],
        refused: 0,
        codes: [],
        resultChars: 0,
        preset: livePreset,
        // Where the turn's time went (#1403 item 14): the model's part of each step, the tools' (their
        // own waits included: the write lease, the turn's open, a door), and what came after the last step.
        stepAt: null,
        modelMs: 0,
        callAt: new Map(),
        callVerb: new Map(),
        callTimes: [],
        results: [],
        requests: [],
        toolSpans: [],
        lastStepEnd: null
      })
    }
    const turn = turns.get(data.turn)
    // A turn's preset is fixed at `turn/start`: that is the toolset the agent holds when the turn begins. A turn
    // that changes preset midway still counts for the preset it started with, since every earlier step ran
    // on that set — and a mid-turn change has never been measured once.
    if (event.type === 'turn/start') {
      turn.start = event.time
      turn.preset = livePreset
    } else if (event.type === 'turn/end') {
      turn.end = event.time
      turn.reason = data.reason?.kind ?? null
    } else if (event.type === 'step/start') {
      turn.steps += 1
      turn.stepAt = event.time
    } else if (event.type === 'step/end') turn.lastStepEnd = event.time
    else if (event.type === 'tool/call') {
      turn.verbs.push(verbOf(data))
      if (typeof data.callId === 'string') {
        turn.callAt.set(data.callId, event.time)
        turn.callVerb.set(data.callId, verbOf(data))
      }
    } else if (event.type === 'assistant/message') {
      turn.requests.push(liveRequest)
      // The model's part of a step: from the step's start to its answer (the request built and streamed).
      if (turn.stepAt !== null && typeof event.time === 'number') turn.modelMs += event.time - turn.stepAt
      turn.stepAt = null
      if (data.usage) turn.usage.push(data.usage)
    } else if (event.type === 'tool/result') {
      const id = data.message?.toolCallId ?? data.message?.source?.callId
      const at = turn.callAt.get(id)
      if (at !== undefined && typeof event.time === 'number') {
        turn.toolSpans.push([at, event.time])
        turn.callTimes.push({
          verb: turn.callVerb.get(id),
          seconds: Math.round((event.time - at) / 100) / 10
        })
      }
      const text = textIn(data.message?.content).join('')
      turn.resultChars += text.length
      const outcome = resultOutcome(text)
      turn.results.push({
        verb: turn.callVerb.get(id) ?? '(unmatched)',
        chars: text.length,
        ...outcome
      })
      if (outcome.outcome === 'refused') {
        turn.refused += 1
        turn.codes.push(outcome.code)
      }
    }
  }
  for (const [number, turn] of turns) {
    if (turn.start === null) continue
    const sum = (key) => turn.usage.reduce((total, one) => total + (one[key] ?? 0), 0)
    rows.push({
      // `<session>/session.vN.jsonl` names the session by its directory, not by the generation.
      session: GENERATION.test(path.basename(file))
        ? path.basename(path.dirname(file))
        : path.basename(file).replace(/\.jsonl$/, ''),
      preset: turn.preset ?? null,
      // The boot preset is kept ALONGSIDE, not instead: when these two columns differ, the turn
      // changed platform, and that is exactly what a measurement mixing two platforms looks like it lacks.
      bootPreset: head?.agentPreset ?? null,
      prompter,
      createdAt: head?.createdAt ?? null,
      cwd: head?.cwd ?? null,
      turn: number,
      seconds: turn.end === null ? null : Math.round((turn.end - turn.start) / 100) / 10,
      steps: turn.steps,
      calls: turn.verbs.length,
      refused: turn.refused,
      resultChars: turn.resultChars,
      results: turn.results,
      requests: turn.requests,
      input: sum('inputTokens'),
      output: sum('outputTokens'),
      cacheRead: sum('cacheReadTokens'),
      cacheWrite: sum('cacheWriteTokens'),
      usageComplete:
        turn.steps > 0 &&
        turn.usage.length === turn.steps &&
        turn.usage.every((u) => Number.isFinite(u.inputTokens) && Number.isFinite(u.outputTokens)),
      reason: turn.reason ?? '(unfinished)',
      verbs: turn.verbs,
      codes: turn.codes,
      modelSeconds: Math.round(turn.modelMs / 100) / 10,
      // Each call's own time, by verb: which tool holds the turn (#1403 item 16, measured before any change).
      callTimes: turn.callTimes,
      // Calls run side by side are counted once: the span the tools held the turn, not their sum.
      toolSeconds: Math.round(spanUnion(turn.toolSpans) / 100) / 10,
      // After the last step: the visual check and the turn's close (null while the turn is open).
      tailSeconds:
        turn.end === null || turn.lastStepEnd === null
          ? null
          : Math.round(Math.max(0, turn.end - turn.lastStepEnd) / 100) / 10
    })
  }
  return rows
}

/**
 * How long a set of [start, end] spans covers, overlaps counted once.
 * @param {[number, number][]} spans
 */
function spanUnion(spans) {
  const sorted = [...spans].filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0])
  let total = 0
  let open = null
  for (const [a, b] of sorted) {
    if (open === null || a > open[1]) {
      if (open !== null) total += open[1] - open[0]
      open = [a, b]
    } else open[1] = Math.max(open[1], b)
  }
  return open === null ? total : total + open[1] - open[0]
}

/**
 * The value under which `q` of the numbers fall (nearest rank); 0 for none. p90 is what a customer meets one
 * turn in ten — the figure a median hides.
 * @param {number[]} numbers @param {number} q - 0..1
 */
const quantile = (numbers, q) => {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
}

/** A turn's platform, READ from the preset — `null` when the session declares none, and null must show. */
function platformOf(preset) {
  if (typeof preset !== 'string') return '(preset not declared)'
  for (const name of ['wordpress', 'joomla', 'emdash']) if (preset.includes(name)) return name
  return preset
}

/**
 * The true median, even when n is even.
 *
 * 🔒 THE OLD VERSION TOOK THE UPPER-MIDDLE ELEMENT AND CALLED IT THE MEDIAN, and on the §3 sample size that is not
 * rounding — it is a different number entirely. Measured 19/09: 6 WordPress turns of 2.9 · 18 · 66.1 · 122.4 · 127.3 ·
 * 424.3 seconds; `sorted[3]` gives **122.4** while the median is **94.3**. A "before/after" table that jumps
 * from 66 to 122 when ONE turn is ADDED to the sample does not measure an improvement, it measures how many turns were measured.
 */
const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
}

function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const given = args.find((one) => !one.startsWith('--'))
  const root = given ?? pullFromContainer(process.env.TRACY_DSH_CONTAINER ?? 'tracy-dsh')

  const rows = jsonlFiles(root).flatMap(turnsIn)
  if (unrestored.length > 0)
    process.stderr.write(
      `agent-turn-cost: ${unrestored.length} session(s) read as stored, not restored to V4:\n${unrestored.map((one) => `  ${one}\n`).join('')}`
    )
  if (rows.length === 0) {
    process.stderr.write(`agent-turn-cost: no turns found under ${root}\n`)
    process.exit(1)
  }
  if (asJson) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
    return
  }

  const groups = new Map()
  for (const row of rows) {
    const key = platformOf(row.preset)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  /**
   * Median calls per step, to one decimal — how much the model batched into each round trip.
   *
   * Per TURN and then medianed, never `sum(calls) / sum(steps)`: one 125-step turn would otherwise
   * set the figure for every other turn in the group. Turns with no step at all (a refusal before the
   * first one) are left out rather than counted as zero, which would read as "did not batch".
   *
   * @param {{steps: number, calls: number}[]} group
   * @returns {string} e.g. `1.5`, or `-` when no turn in the group ran a step.
   */
  function density(group) {
    const ratios = group.filter((row) => row.steps > 0).map((row) => row.calls / row.steps)
    if (ratios.length === 0) return '-'
    return (Math.round(median(ratios) * 10) / 10).toFixed(1)
  }

  const sessions = new Set(rows.map((row) => row.session)).size
  process.stdout.write(`agent-turn-cost: ${sessions} session(s), ${rows.length} turns, read from ${root}\n\n`)
  process.stdout.write('platform           turns    sec  step  call  c/s  NEW tokens   cacheRead  refused\n')
  for (const [name, group] of [...groups].sort()) {
    const finished = group.filter((row) => row.seconds !== null)
    const fresh = group.map((row) => row.input + row.output)
    process.stdout.write(
      `${name.padEnd(20)}${String(group.length).padStart(4)}` +
        `${String(median(finished.map((row) => Math.round(row.seconds)))).padStart(7)}` +
        `${String(median(group.map((row) => row.steps))).padStart(6)}` +
        `${String(median(group.map((row) => row.calls))).padStart(6)}` +
        // 🔒 CALLS PER STEP IS THE ONE COLUMN THAT SAYS WHETHER BATCHING HAPPENED, and it is not
        // derivable from the two beside it: those are medians of different turns, and the median of
        // a ratio is not the ratio of two medians. Measured 19/09 on WordPress — 14 steps, 21.5
        // calls — this reads 1.5, and the whole point of the batching rule in the site context is
        // to move it up. The bill is per STEP: the conversation is re-sent on every one of them,
        // and cacheRead is the integral of that, so it grows with the SQUARE of the step count.
        // Ten reads spread over ten steps cost ten re-reads; the same ten together cost one.
        `${density(group).padStart(5)}` +
        `${median(fresh).toLocaleString('en-US').padStart(12)}` +
        `${median(group.map((row) => row.cacheRead))
          .toLocaleString('en-US')
          .padStart(12)}` +
        `${String(group.reduce((total, row) => total + row.refused, 0)).padStart(9)}\n`
    )
  }

  // Where the time goes, p50 / p90 per platform (#1403 item 14): the model, the tools (their waits included),
  // and the tail after the last step. Finished turns only.
  process.stdout.write('\ntime (sec, p50 / p90)      turns     total        model        tool        tail\n')
  for (const [name, group] of [...groups].sort()) {
    const done = group.filter((row) => row.seconds !== null)
    const pair = (pick) => {
      const values = done.map(pick).filter((v) => v !== null)
      return `${String(Math.round(quantile(values, 0.5))).padStart(5)} / ${String(Math.round(quantile(values, 0.9))).padEnd(5)}`
    }
    process.stdout.write(
      `${name.padEnd(28)}${String(done.length).padStart(4)}  ${pair((r) => r.seconds)} ${pair((r) => r.modelSeconds)} ${pair((r) => r.toolSeconds)} ${pair((r) => r.tailSeconds)}\n`
    )
  }

  process.stdout.write('\ndearest turns by NEW tokens — the step count is what produces them\n')
  const dearest = [...rows].sort((a, b) => b.input + b.output - (a.input + a.output)).slice(0, 8)
  for (const row of dearest) {
    process.stdout.write(
      `${String(row.input + row.output).padStart(7)} new  ${String(row.cacheRead).padStart(8)} cacheRead  ` +
        `${String(row.steps).padStart(3)} step  ${String(row.calls).padStart(3)} call  ` +
        `${String(row.refused).padStart(2)} refused  ${String(row.seconds ?? '?').padStart(6)}s  ` +
        `${platformOf(row.preset).padEnd(20)}${row.session.slice(-12)}\n`
    )
  }

  process.stdout.write('\nverbs called, and how many characters they pour into the context\n')
  const verbs = new Map()
  for (const row of rows) for (const verb of row.verbs) verbs.set(verb, (verbs.get(verb) ?? 0) + 1)
  const charsByVerb = new Map()
  for (const row of rows)
    for (const result of row.results)
      charsByVerb.set(result.verb, (charsByVerb.get(result.verb) ?? 0) + result.chars)
  for (const [verb, count] of [...verbs].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    process.stdout.write(
      `${String(count).padStart(5)}  ${String(charsByVerb.get(verb) ?? 0).padStart(10)} chars  ${verb}\n`
    )
  }
  // Which calls hold a turn longest, per platform (#1403 item 16): count, p50 and p90 seconds of each call.
  process.stdout.write('\nslowest calls by platform (sec)             n    p50    p90\n')
  for (const [name, group] of [...groups].sort()) {
    const byVerb = new Map()
    for (const row of group)
      for (const call of row.callTimes)
        byVerb.set(call.verb, [...(byVerb.get(call.verb) ?? []), call.seconds])
    const slowest = [...byVerb]
      .map(([verb, seconds]) => ({
        verb,
        n: seconds.length,
        p50: quantile(seconds, 0.5),
        p90: quantile(seconds, 0.9)
      }))
      .filter((v) => v.n >= 3)
      .sort((a, b) => b.p90 - a.p90)
      .slice(0, 6)
    for (const v of slowest)
      process.stdout.write(
        `${`${name} ${v.verb}`.slice(0, 40).padEnd(40)}${String(v.n).padStart(5)}${String(v.p50).padStart(7)}${String(v.p90).padStart(7)}\n`
      )
  }

  process.stdout.write('\nREFUSED calls — includes protective refusals; code and whether anyone typed\n')
  const codes = new Map()
  for (const row of rows) {
    for (const code of row.codes) {
      const key = `${code}\u0000${row.prompter === null ? 'session WITHOUT a prompter' : 'with a prompter'}`
      codes.set(key, (codes.get(key) ?? 0) + 1)
    }
  }
  const calls = rows.reduce((total, row) => total + row.calls, 0)
  const refused = rows.reduce((total, row) => total + row.refused, 0)
  for (const [key, count] of [...codes].sort((a, b) => b[1] - a[1])) {
    const [code, who] = key.split('\u0000')
    process.stdout.write(`${String(count).padStart(5)}  ${code.padEnd(24)} ${who}\n`)
  }
  process.stdout.write(
    `${String(refused).padStart(5)}  of ${calls} calls = ${Math.round((100 * refused) / calls)}%\n`
  )

  const chars = rows.reduce((total, row) => total + row.resultChars, 0)
  process.stdout.write(
    `\ntool results combined: ${chars.toLocaleString('en-US')} characters ≈ ${Math.round(chars / 4).toLocaleString('en-US')} tokens — ` +
      `against ${rows.reduce((t, r) => t + r.input + r.output, 0).toLocaleString('en-US')} new tokens across all turns.\n`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
