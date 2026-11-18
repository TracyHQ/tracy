// What the brand bench shows and downloads (brand step trial bench, #320): the one-line list and status views, and the
// files `get` writes for a run. Nothing in them carries a key or image bytes inside JSON; images are files.
import { callsOf } from './brand-call-store.js'

const money = (n) => `$${Number(n ?? 0).toFixed(4)}`
const seconds = (ms) => `${Math.round(ms / 1000)}s`

const verdictOf = (run) => {
  if (run.outcome === 'safe-version') return `safe-version (${run.safeVersionReason})`
  if (run.outcome === 'brand-file') return 'brand file accepted'
  return run.status === 'queued' ? 'running' : run.status
}

/** One line per run: brief, kit, model, state, rounds used, gate verdict, real-page verdict, cost, duration. */
export function listLines(runs) {
  if (!runs.length) return ['no runs']
  return runs.map((r) => {
    const end = r.finishedAt ? Date.parse(r.finishedAt) : Date.now()
    const gate = r.gate ? (r.gate.ok ? 'gate ok' : 'gate rejected') : 'no gate yet'
    const page = r.realPageVerdict?.verdict ?? 'no real-page check'
    return [
      r.id,
      r.briefSource?.name ?? r.briefSource?.revisionId ?? '?',
      r.kitRef,
      r.model,
      r.status === 'queued' ? `${r.step} (round ${r.round})` : r.status,
      `${r.rounds} round${r.rounds === 1 ? '' : 's'}`,
      gate,
      page,
      money(r.costUsd),
      seconds(end - Date.parse(r.createdAt))
    ].join('  ')
  })
}

/** The status of one run: where it is, what it ran on, the rounds, the cost split. */
export function statusLines(run, calls, now = Date.now()) {
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now
  const lines = [
    `run ${run.id}`,
    `state ${run.status === 'queued' ? (run.attempts ? `${run.step} (round ${run.round})` : 'waiting') : run.status}${verdictOf(run) ? `, ${verdictOf(run)}` : ''}`,
    `duration ${seconds(end - Date.parse(run.createdAt))}`,
    `kit ${run.kitRef}, prompt sha256 ${run.promptSha256}`,
    `agent ${run.door.agent.providerId} ${run.door.agent.model}${run.door.agent.override ? ` (one-off: ${run.door.agent.override.reason})` : ''}`,
    `reviewer ${run.door.reviewer.providerId} ${run.door.reviewer.model}${run.door.reviewer.override ? ` (one-off, replaces ${run.door.reviewer.override.replaces}: ${run.door.reviewer.override.reason})` : ''}`,
    `harness cache ${run.harness.cacheTtl.system}, images ${run.harness.imageLongEdge}px, max tokens ${run.harness.maxTokens}, cap ${run.harness.capUsd == null ? 'none' : money(run.harness.capUsd)}`,
    `cost ${money(run.costUsd)} (agent ${money(run.cost.agent)}, drawing ${money(run.cost.drawing)}, reviewer ${money(run.cost.reviewer)}), ${calls.length} model calls`
  ]
  for (const r of run.rounds) {
    const rejected = r.gateResult?.rejected?.length ?? 0
    lines.push(
      `round ${r.round}: ${r.state}${r.gateResult ? (r.gateResult.ok ? ', gate ok' : `, gate rejected ${rejected} field${rejected === 1 ? '' : 's'}, fault ${r.fault}`) : ''}, ${money(r.costUsd)}`
    )
  }
  if (run.error) lines.push(`error ${run.error}`)
  return lines
}

/** A compact turns log: one entry per agent turn, with the tools it called and a short head of what it said. */
export function turnsLog(rows) {
  return rows.map((r) => ({
    n: r.n,
    round: r.round,
    state: r.state,
    finishReason: r.finish_reason,
    toolCalls: (r.message?.tool_calls ?? []).map((c) => c.function?.name),
    said: typeof r.message?.content === 'string' ? r.message.content.slice(0, 300) : null,
    costUsd: r.cost_usd === null ? null : Number(r.cost_usd)
  }))
}

/** The files `get` writes (besides the images): [name, text]. */
export async function runFiles(pool, run, agentRows) {
  const files = []
  if (run.brandFile) files.push(['brand-file.json', JSON.stringify(run.brandFile, null, 2)])
  for (const r of run.rounds) {
    if (r.attempt && r.state !== 'accepted')
      files.push([`rejected/round-${r.round}.brand-file.json`, JSON.stringify(r.attempt, null, 2)])
    if (r.gateResult)
      files.push([
        `gate/round-${r.round}.json`,
        JSON.stringify({ ...r.gateResult, fault: r.fault, sentBack: r.sentBack }, null, 2)
      ])
  }
  const { brief: _brief, rounds: _rounds, brandFile: _file, ...meta } = run
  files.push(['run.json', JSON.stringify({ ...meta, briefSha256: run.briefSha256 }, null, 2)])
  files.push(['turns.json', JSON.stringify(turnsLog(agentRows), null, 2)])
  const calls = await callsOf(pool, run.id)
  files.push(['calls.json', JSON.stringify(calls, null, 2)])
  files.push(['cost.json', JSON.stringify({ ...run.cost, total: run.costUsd }, null, 2)])
  return files
}
