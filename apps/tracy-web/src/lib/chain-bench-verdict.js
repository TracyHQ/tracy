// A bench can finish execution with checked failures still standing. The chain keeps its best output, but must
// record that step as failed rather than turning an exhausted fix budget into a successful customer handover.
export const CHAIN_BENCH_CHECK_FAILED = 'CHAIN_BENCH_CHECK_FAILED'

/** Final site checks cannot discharge unresolved factual or picture checks from an upstream bench. */
export const chainHasCheckFailures = (chain) =>
  Array.isArray(chain?.steps) && chain.steps.some((step) => step?.code === CHAIN_BENCH_CHECK_FAILED)

/** A terminal frame and a successful write do not erase unresolved bench checks. */
export function chainQaPassed(run) {
  const chain = run?.timings?.chain
  const write = Array.isArray(chain?.steps) ? chain.steps.findLast((step) => step?.step === 'write') : null
  return (
    run?.state === 'applied' &&
    ['complete', 'soft-failure'].includes(chain?.ending) &&
    !(Array.isArray(chain?.running) && chain.running.length) &&
    !chainHasCheckFailures(chain) &&
    write?.outcome === 'done'
  )
}

export function chainBenchFailure(name, runId, row, exported) {
  if (row.status !== 'succeeded')
    return `the ${name} run ${runId} ended ${row.status}: ${String(row.error ?? '').slice(0, 200)}`
  if (exported.code !== 0) return `the ${name} run ${runId} files: ${exported.err.join(' ').slice(0, 200)}`
  if (String(row.standing_failures ?? '').trim())
    return `the ${name} run ${runId} exhausted its fix rounds with check failures: ${String(row.standing_failures).slice(0, 200)}`
  return null
}
