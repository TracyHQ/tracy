// What a bench CLI shows and downloads of one run (ADR 0041, #301; shared by every bench step since #327). Pure: a run
// as readRun returns it and its turns in, text and files out. Nothing here carries a key: the door snapshot names the
// provider and model, never the credential, and a turn is summarised (tool calls, sizes, usage, cost), not copied.
// What differs per step (the round key and file stem of its document, its fix round limit) comes in benchExport.
import { balanceLine } from './provider-balance.js'

const usd = (value) => `$${Number(value ?? 0).toFixed(4)}`

function duration(run, now) {
  const from = Date.parse(run.createdAt)
  const to = run.finishedAt ? Date.parse(run.finishedAt) : now
  const s = Math.max(0, Math.round((to - from) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n) => String(n).padStart(2, '0')
  return `${h ? `${h}h ` : ''}${pad(m)}m ${pad(s % 60)}s${run.finishedAt ? '' : ' (still running)'}`
}

function checkerLine(run) {
  const checked = [...run.rounds].reverse().find((r) => r.checkResult?.summary)
  if (!checked) return 'no round checked yet'
  const { pass, fail, skip } = checked.checkResult.summary
  return `${run.checkerVersion}: ${pass} pass, ${fail} fail, ${skip} skip (round ${checked.round})`
}

/** What the run is doing now, or the round it ended after. */
function progressOf(run, maxFixRounds) {
  if (run.status !== 'queued') {
    const last = run.rounds.at(-1)
    return last ? `${run.status} (after round ${last.round})` : run.status
  }
  if (run.step === 'waiting') return 'queued (waiting)'
  if (run.step === 'fixing') return `queued (fixing round ${run.round}/${maxFixRounds})`
  return `queued (${run.step} round ${run.round})`
}

const k = (chars) => (chars >= 1000 ? `${Math.round(chars / 1000)}k` : String(chars))
const ago = (at, now) => `${Math.max(0, Math.round((now - Date.parse(at)) / 1000))}s`

/**
 * The model call in flight: what a streamed call has received so far and how long since its last byte. The last byte
 * time is the one of the newest report (every 15 s), so the silence shown can be up to one report interval too long.
 */
function inFlightLine(f, now) {
  const head = `turn ${f.n} (round ${f.round})`
  if (!f.streamed)
    return `${head}: waiting for the answer, sent ${ago(f.dispatchedAt, now)} ago (not streamed)`
  const p = f.progress
  if (!p) return `${head}: streamed, nothing reported yet, sent ${ago(f.dispatchedAt, now)} ago`
  const tools = p.toolArgumentChars ? `, ${k(p.toolArgumentChars)} tool arguments` : ''
  return `${head} writing: ${k(p.contentChars)} chars of answer, ${k(p.reasoningChars)} of reasoning${tools}, ${ago(p.lastByteAt, now)} since last byte`
}

/** The failures still standing when the run ended, one line each; empty when none. */
export const standingLines = (run) => (run.standingFailures ?? '').split('\n').filter(Boolean)

/** The status of one run, one "label  value" line each. */
function statusLinesOf(run, now, maxFixRounds) {
  const rows = [
    ['run', run.id],
    ['state', progressOf(run, maxFixRounds)],
    ['started', `by ${run.startedBy} at ${run.createdAt}`],
    ['brief', briefLabel(run.briefSource)],
    ['kit', run.kitRef],
    ['model', run.model],
    ['turns', `${run.totals.turns} answered of ${run.totals.calls} calls`],
    [
      'cost',
      `${usd(run.costUsd)} (cached tokens ${run.totals.cachedTokens}, without cost ${run.totals.turnsWithoutCost})`
    ],
    ...(run.balance ? [['balance', balanceLine(run.balance)]] : []),
    ['duration', duration(run, now)],
    ...(run.status === 'queued' && run.inFlight ? [['call', inFlightLine(run.inFlight, now)]] : []),
    ['checker', checkerLine(run)],
    ['attempts', String(run.attempts)]
  ]
  const standing = standingLines(run)
  if (standing.length)
    rows.push(['standing', `${standing.length} failures after round ${run.rounds.at(-1)?.round ?? 0}`])
  if (run.cancelRequestedAt) rows.push(['cancel', `asked at ${run.cancelRequestedAt}`])
  if (run.error) rows.push(['error', run.error])
  return rows.map(([label, value]) => `${label.padEnd(9)} ${value}`)
}

/** One line per run, newest first. */
export function listLines(runs) {
  if (!runs.length) return ['no runs yet']
  return runs.map((r) =>
    [r.id, r.status.padEnd(9), r.step.padEnd(8), usd(r.costUsd), r.kitRef, r.startedBy, r.createdAt].join(
      '  '
    )
  )
}

export function briefLabel(source) {
  if (source?.kind === 'revision') return `WO revision ${source.revisionId}`
  if (source?.kind === 'file') return `file ${source.name}`
  return 'unknown'
}

/** One turn, compact: what was asked of the tools, how much went each way, usage, cost and the run's cost so far. */
export function compactTurn(turn, runningCostUsd = null) {
  const content = turn.message?.content
  return {
    n: turn.n,
    round: turn.round,
    state: turn.state,
    finishReason: turn.finishReason ?? null,
    toolCalls: (turn.message?.tool_calls ?? []).map((c) => ({
      name: c.function?.name ?? null,
      arguments: c.function?.arguments ?? null
    })),
    answerCharacters: typeof content === 'string' ? content.length : 0,
    reasoningCharacters: reasoningCharacters(turn.message),
    sent: (turn.sent ?? []).map((m) => ({
      role: m.role,
      ...(m.tool_call_id ? { toolCallId: m.tool_call_id } : {}),
      characters: JSON.stringify(m.content ?? '').length
    })),
    usage: turn.usage ?? null,
    costUsd: turn.cost ?? null,
    ...(turn.costSource ? { costSource: turn.costSource } : {}),
    ...(turn.request?.priceRate ? { priceRate: turn.request.priceRate } : {}),
    runningCostUsd,
    ...(turn.resendOf !== undefined ? { resendOf: turn.resendOf } : {}),
    ...(turn.retries?.length ? { retries: turn.retries } : {}),
    providerModel: turn.providerModel ?? null,
    generationId: turn.generationId ?? null,
    ...(turn.refusal ? { refusal: turn.refusal } : {}),
    ...(turn.error ? { error: turn.error } : {}),
    dispatchedAt: turn.dispatchedAt,
    answeredAt: turn.answeredAt ?? null
  }
}

/** Every file `get` writes, as [name, text]. Round r is version r + 1 (plan-v1.json is the planner's round 0). */
function runFilesOf(run, turns, doc) {
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`
  const { brief, rounds, standingFailures, ...meta } = run
  const files = [
    [
      'run.json',
      json({
        ...meta,
        // The round's answer, change list, document, check and failure list are files of their own.
        rounds: rounds.map((r) => ({
          round: r.round,
          state: r.state,
          costUsd: r.costUsd,
          error: r.error,
          reading: r.reading ?? null,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          summary: r.checkResult?.summary ?? null
        }))
      })
    ],
    ['brief.json', json(brief)]
  ]
  for (const r of rounds) {
    const v = r.round + 1
    if (r.changes) files.push([`changes-v${v}.json`, json(r.changes)])
    if (r[doc]) files.push([`${doc}-v${v}.json`, json(r[doc])])
    else if (r.answer) files.push([`answer-v${v}.txt`, r.answer])
    if (r.checkResult) files.push([`check-v${v}.json`, json(r.checkResult)])
    if (r.failureList !== null && r.failureList !== undefined)
      files.push([`failures-v${v}.txt`, r.failureList])
  }
  if (standingFailures) files.push(['failures-standing.txt', standingFailures])
  let running = 0
  const lines = turns.map((t) => {
    running = Math.round((running + (t.cost ?? 0)) * 1e9) / 1e9
    return JSON.stringify(compactTurn(t, running))
  })
  files.push(['turns.jsonl', lines.join('\n') + (lines.length ? '\n' : '')])
  return files
}

// Thinking text in either field: OpenRouter's reasoning or DeepSeek's own reasoning_content.
const reasoningCharacters = (message) =>
  ['reasoning', 'reasoning_content'].reduce(
    (sum, k) => sum + (typeof message?.[k] === 'string' ? message[k].length : 0),
    0
  )

/**
 * The status lines and run files of one step. `doc` is the round key of the step's document and the stem of its
 * files (plan: plan-v1.json); `maxFixRounds` the step's fix round limit, shown while a run is fixing.
 * @param {{ doc: string, maxFixRounds: number }} step
 */
export function benchExport({ doc, maxFixRounds }) {
  return {
    statusLines: (run, now = Date.now()) => statusLinesOf(run, now, maxFixRounds),
    runFiles: (run, turns) => runFilesOf(run, turns, doc)
  }
}
