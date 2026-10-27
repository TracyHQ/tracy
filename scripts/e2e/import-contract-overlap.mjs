/** Observed session intervals, not simultaneous browser submissions, prove runtime overlap. */
export function overlapSummary(streams) {
  const intervals = streams.flatMap((stream) =>
    stream.turns
      .filter(
        (turn) =>
          Number.isFinite(turn.startedAt) && Number.isFinite(turn.endedAt) && turn.endedAt > turn.startedAt
      )
      .map((turn) => ({ session: stream.session, start: turn.startedAt, end: turn.endedAt }))
  )
  const overlapObserved = intervals.some((a, index) =>
    intervals
      .slice(index + 1)
      .some((b) => a.session !== b.session && Math.max(a.start, b.start) < Math.min(a.end, b.end))
  )
  const uniqueSessions =
    streams.every((stream) => stream.session) &&
    new Set(streams.map((stream) => stream.session)).size === streams.length
  return {
    overlapObserved,
    uniqueSessions,
    groupWallMs: intervals.length
      ? Math.max(...intervals.map((i) => i.end)) - Math.min(...intervals.map((i) => i.start))
      : null,
    summedTurnMs: intervals.length ? intervals.reduce((sum, i) => sum + i.end - i.start, 0) : null
  }
}

export function modelEvidence(rows, model) {
  const configs = rows.filter((row) => row.type === 'request/header').map((row) => row.data?.header?.config)
  return {
    modelPinned:
      configs.length > 0 &&
      configs.every((config) => config?.provider === model.provider && config?.model === model.id),
    observedRequests: configs.length
  }
}
