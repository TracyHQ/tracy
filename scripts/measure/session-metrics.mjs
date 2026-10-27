#!/usr/bin/env node
/**
 * What one agent turn COST — read off the session log dsh already writes, not off a stopwatch.
 *
 * Task §3 of `tasks/todo-beta-01-10.md` asks for "time and tokens per agent turn" (22/09) and then
 * for two improvements "with before/after numbers" (26/09). Both are this file.
 *
 * 🔒 COUNT TOOL CALLS, NOT BYTES, AND THE DIFFERENCE IS NOT PEDANTRY. Token cost grows roughly with
 * the SQUARE of the step count, because every step re-reads the whole history: measured across four
 * real sessions on 17/09, 1.85x the calls came to 5.8x the tokens. A change that trims the injected
 * prompt moves the small term; a change that removes a call moves the large one. So calls are the
 * headline here and tokens are reported beside them, never instead.
 *
 * 🔒 A FAILED TOOL RESULT IS NOT `isError`. The result carries `isError: false` (on the V3 wrapper
 * block then, on the V4 tool message now) for a perfectly ordinary
 * `{"ok": false, …}` payload from the site door, so counting the flag answers zero failures on a
 * session with twelve. Measured 17/09: reading the flag gave 0/212 and reading the payload gave 12,
 * one of them a component bug that fires in every single session. Both are counted below and they
 * are reported separately, because they mean different things.
 *
 * 🔒 A SINGLE RUN IS NOT A MEASUREMENT. The model is not deterministic — the same prompt on the same
 * site measured 12 calls and then 9. `compare` therefore refuses to print a ratio from one sample
 * per arm and says what it wants instead.
 *
 * Usage:
 *   node scripts/measure/session-metrics.mjs report [n]        # the last n sessions, newest last
 *   node scripts/measure/session-metrics.mjs compare <marker>  # split by a string in the context
 */
import { readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { loadCatalog } from '../session-v4-audit.mjs'
import { newestSessionLog, parseSessionBytes } from './session-log.mjs'
export { newestSessionLog, parseSessionBytes } from './session-log.mjs'

/** Where dsh keeps its session logs on the host — the bind mount, readable without the container. */
const HOME = process.env.TRACY_DSH_HOME ?? `${process.env.HOME}/tracy-data/dsh-home`

// ---------------------------------------------------------------------------------------------------
// Reading a stored session, shared with `scripts/agent-turn-cost.mjs` and `scripts/e2e/wp-business.mjs`.
//
// 🔒 THE NEWEST GENERATION, NOT `session.v3`. dsh 0.1.7 converts a session on its first write open:
// it publishes `session.v4.jsonl.zstd` BESIDE the untouched V3 file, and from then on only V4 grows.
// A reader pinned to `session.v3.jsonl.zstd` keeps answering — with the history as it stood before
// the upgrade, and no error. So the highest `session.vN` in a directory is the log, the same rule
// dsh opens by (`session-persistence-jsonl` README "Reading the logs"; `sessionFiles` in
// `scripts/session-v4-audit.mjs`).
//
// 🔒 ONE SHAPE, V4, WHICHEVER FILE WAS READ. Rows go through the rc.2 format catalog the way
// persistence restores a historical generation (`catalogVerdict` in `scripts/session-v4-audit.mjs`),
// so a V3 log comes back in V4 shape: a tool result is a `role: 'tool'` message whose `isError` sits
// on the message, not on a `tool-result` block inside a user message.
// ---------------------------------------------------------------------------------------------------

const catalog = await loadCatalog()

/**
 * The events of one session in V4 shape, restored through the rc.2 catalog.
 *
 * When the catalog cannot be imported (submodule unbuilt) or refuses the log, the rows come back AS
 * STORED with `restored: false` and the reason — callers say so rather than drop the session, and
 * {@link toolResultOf} still reads a stored V3 tool result.
 * @param {Record<string, any> | null} header
 * @param {any[]} rows
 * @returns {{ header: Record<string, any> | null, events: any[], restored: boolean, reason?: string }}
 */
export function restoreSession(header, rows) {
  if (!catalog.module)
    return { header, events: rows, restored: false, reason: `catalog not importable: ${catalog.error}` }
  if (header === null) return { header, events: rows, restored: false, reason: 'no session header' }
  try {
    const restore = catalog.module.createSessionFormatCatalogWithChildren([]).createRestore(
      structuredClone(header),
      // A native V4 log is opened as the current generation; an older one as persistence restores it.
      { recovery: 'recoverable', validation: header.version >= 4 ? 'current' : 'transformed' }
    )
    for (const row of rows) restore.decodeRow(structuredClone(row))
    const artifact = restore.finish()
    return { header: { type: 'session', ...artifact.header }, events: artifact.events, restored: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { header, events: rows, restored: false, reason: reason.slice(0, 300) }
  }
}

/**
 * Read one session log file into V4-shaped events.
 * @param {string} file - `session.vN.jsonl.zstd`, or any raw `.jsonl` log.
 */
export function readSessionLog(file) {
  const { header, rows } = parseSessionBytes(readFileSync(file), file.endsWith('.zstd'))
  return { file, ...restoreSession(header, rows) }
}

/**
 * A `tool/result` event's flag and text. V4 (every restored event): `data.message` is the tool
 * message, `isError` on it and its content the result parts. A row that could not be restored may
 * still be a stored V3 user message wrapping one `tool-result` block that carries both.
 * @param {any} event
 * @returns {{ isError: boolean, text: string }}
 */
export function toolResultOf(event) {
  const message = event?.data?.message ?? {}
  const content = Array.isArray(message.content) ? message.content : []
  const wrapper = content.length === 1 && content[0]?.type === 'tool-result' ? content[0] : null
  const parts = wrapper ? (Array.isArray(wrapper.content) ? wrapper.content : []) : content
  let text = ''
  for (const part of parts) text += typeof part?.text === 'string' ? part.text : ''
  return { isError: (wrapper ?? message).isError === true, text }
}

/** Every session log under `$DSH_HOME/sessions`, oldest first. */
async function sessionLogs() {
  const root = path.join(HOME, 'sessions')
  const out = []
  let workspaces = []
  try {
    workspaces = await readdir(root)
  } catch {
    return out
  }
  for (const workspace of workspaces) {
    let sessions = []
    try {
      sessions = await readdir(path.join(root, workspace))
    } catch {
      continue
    }
    for (const session of sessions) {
      try {
        const dir = path.join(root, workspace, session)
        const name = newestSessionLog(await readdir(dir))
        if (name === null) continue
        const file = path.join(dir, name)
        out.push({ file, workspace, at: (await stat(file)).mtimeMs })
      } catch {
        /* a session directory without a log is a session that never started */
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * One session, measured.
 * @param {string} file
 */
export async function measure(file) {
  const { header, events, restored, reason } = readSessionLog(file)
  if (!restored) console.error(`session-metrics: ${file} read as stored, not restored to V4 (${reason})`)
  /** @type {Record<string, number>} */
  const byTool = {}
  let calls = 0
  let bash = 0
  let internet = 0
  let failed = 0
  let refused = 0
  let tokens = 0
  let llmMs = 0
  let steps = 0
  let prompt = null
  let preset = null
  const context = []
  for (const event of header === null ? events : [header, ...events]) {
    const line = JSON.stringify(event)
    const kind = event.type
    if (kind === 'session') preset = event.agentPreset ?? preset
    if (kind === 'agent-preset/selected') preset = event.data?.agentPreset ?? preset
    if (kind === 'step/start') steps += 1
    if (kind === 'tool/call') {
      const data = event.data ?? {}
      let name = String(data.name ?? '?')
      if (name === 'tracy_site') {
        try {
          name = `tracy_site.${JSON.parse(data.arguments ?? '{}').action}`
        } catch {
          /* an unparsable argument string is still one call on the door */
        }
      }
      calls += 1
      if (name === 'bash' || name === 'pwsh') bash += 1
      if (name === 'web_fetch' || name === 'web_search') internet += 1
      byTool[name] = (byTool[name] ?? 0) + 1
    }
    // 🔒 THE PAYLOAD, PARSED — not the flag, and not a regex over the raw line either. Reading the
    // flag answers zero (the result carries `isError: false` on an ordinary `{ok:false}`), and matching
    // the raw line answers zero too, because the payload is NESTED JSON: on disk it reads
    // `{\"ok\":false}`, so a pattern written for `"ok":false` never fires. Both mistakes were made
    // here in turn, and both report a clean run on a session where every call was refused.
    if (kind === 'tool/result') {
      const { isError, text } = toolResultOf(event)
      if (/"ok"\s*:\s*false/.test(text) || isError) failed += 1
      // A door that refuses EVERY call is not a slow agent, it is a broken measurement: the bench has
      // no browser, so `tracy_site` answers NO_VIEWER and the run measures what the agent TRIED.
      if (text.includes('"NO_VIEWER"')) refused += 1
    }
    if (kind === 'assistant/message') {
      const usage = event.data?.usage ?? {}
      tokens +=
        (usage.cacheReadTokens ?? 0) +
        (usage.uncachedInputTokens ?? usage.inputTokens ?? 0) +
        (usage.outputTokens ?? 0)
      llmMs += usage.llmMs ?? 0
    }
    if (kind === 'agent/inbox/spliced' && prompt === null) {
      prompt = event.data?.inserted?.[0]?.content?.[0]?.text ?? null
    }
    if (line.includes('<system-reminder>')) context.push(line)
  }
  return {
    file,
    preset,
    prompt: prompt === null ? null : prompt.replace(/\s+/g, ' ').slice(0, 64),
    steps,
    calls,
    bash,
    internet,
    failed,
    refused,
    tokens,
    llmMs,
    byTool,
    context: context.join('\n')
  }
}

/** @param {number} n */
export async function report(n = 4) {
  const logs = (await sessionLogs()).slice(-n)
  if (logs.length === 0) {
    console.log(`session-metrics: no sessions under ${HOME}/sessions — run one first`)
    return []
  }
  const rows = []
  for (const one of logs) rows.push(await measure(one.file))
  console.log(
    `${'preset'.padEnd(20)}${'steps'.padStart(6)}${'calls'.padStart(7)}${'bash'.padStart(6)}${'net'.padStart(5)}${'failed'.padStart(8)}${'refused'.padStart(9)}${'tokens'.padStart(12)}${'tok/call'.padStart(10)}`
  )
  let degraded = 0
  for (const r of rows) {
    if (r.refused > 0) degraded += 1
    console.log(
      `${String(r.preset ?? '?').padEnd(20)}${String(r.steps).padStart(6)}${String(r.calls).padStart(7)}${String(r.bash).padStart(6)}${String(r.internet).padStart(5)}${String(r.failed).padStart(8)}${String(r.refused).padStart(9)}${r.tokens.toLocaleString().padStart(12)}${(r.calls ? Math.round(r.tokens / r.calls) : 0).toLocaleString().padStart(10)}`
    )
    if (r.prompt) console.log(`  “${r.prompt}”`)
  }
  // 🔒 SAY WHEN THE DOOR WAS SHUT. The bench runs headless, so nobody has the site open in a browser
  // and `tracy_site` answers NO_VIEWER to every call. The run still produces an answer and a call
  // count, and that count is what the agent TRIED, not what a working site would have cost. Both
  // arms of a comparison are affected equally, so a ratio still means something — an absolute number
  // does not, and reporting one without this line would be reporting a different system's cost.
  if (degraded > 0) {
    console.log(
      `\n⚠ ${degraded}/${rows.length} session(s) had calls refused NO_VIEWER — no browser had the site open.`
    )
    console.log('  Ratios between arms hold; absolute call counts are what the agent ATTEMPTED.')
  }
  return rows
}

/**
 * Split the recent sessions by whether their injected context carried `marker`, and compare.
 * @param {string} marker @param {number} n
 */
export async function compare(marker, n = 8) {
  const all = await report(n)
  /**
   * 🔒 ONE PROMPT, OR THE ARMS ARE NOT COMPARABLE. This pooled every recent session regardless of
   * what was asked, and a `say OK` smoke test — 0 calls, and it happened to carry the marker — sat
   * in the treatment arm and pulled its mean from 4.5 down to 3.6, turning a 2.3x into a 2.9x. The
   * most-repeated prompt is the experiment; anything else in the window is a different question.
   */
  const counts = new Map()
  for (const r of all) counts.set(r.prompt, (counts.get(r.prompt) ?? 0) + 1)
  const subject = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const rows = all.filter((r) => r.prompt === subject)
  if (rows.length < all.length) {
    console.log(`\nignoring ${all.length - rows.length} session(s) that asked something else`)
  }
  const withIt = rows.filter((r) => r.context.includes(marker))
  const without = rows.filter((r) => !r.context.includes(marker))
  const mean = (list, pick) => (list.length === 0 ? 0 : list.reduce((a, b) => a + pick(b), 0) / list.length)
  console.log(`\nsplit on ${JSON.stringify(marker)}: ${without.length} without, ${withIt.length} with`)
  if (withIt.length < 2 || without.length < 2) {
    // The same prompt on the same site measured 12 calls and then 9. One sample an arm is an anecdote,
    // and an anecdote with a ratio printed next to it reads like a result.
    console.log('not enough repeats to compare — run each arm at least twice (--repeat 2)')
    return
  }
  const a = { calls: mean(without, (r) => r.calls), tokens: mean(without, (r) => r.tokens) }
  const b = { calls: mean(withIt, (r) => r.calls), tokens: mean(withIt, (r) => r.tokens) }
  console.log(`  without: ${a.calls.toFixed(1)} calls, ${Math.round(a.tokens).toLocaleString()} tokens`)
  console.log(`  with:    ${b.calls.toFixed(1)} calls, ${Math.round(b.tokens).toLocaleString()} tokens`)
  if (b.calls > 0)
    console.log(`  calls  ${(a.calls / b.calls).toFixed(1)}x    tokens ${(a.tokens / b.tokens).toFixed(1)}x`)
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (invokedDirectly) {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'compare' && rest[0]) await compare(rest[0], Number(rest[1]) || 8)
  else if (command === 'report' || command === undefined) await report(Number(rest[0]) || 4)
  else {
    console.error('use: session-metrics.mjs report [n] | compare <marker> [n]')
    process.exit(2)
  }
}
