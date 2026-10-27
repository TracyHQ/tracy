/** A QA deadline covers address probing, queue time and browser work; a partial run is never a verdict. */
export function qaDeadline(asked, parentSignal) {
  const controller = new AbortController()
  const budget = Number.isFinite(asked.budgetMs) && asked.budgetMs > 0 ? asked.budgetMs : 240_000
  const timer = setTimeout(() => controller.abort(qaDeadlineError()), Math.min(budget, 300_000) + 15_000)
  return {
    signal: parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal,
    dispose: () => clearTimeout(timer)
  }
}

export function qaDeadlineError() {
  return Object.assign(
    new Error('QA did not finish within its deadline; no verdict or baseline was produced.'),
    {
      code: 'DEMO_QA_DEADLINE'
    }
  )
}

/** Cancel a queued wait promptly, without starting browser work or changing its place in the queue. */
export async function waitForQaSlot(before, signal) {
  signal.throwIfAborted()
  let abort
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    await Promise.race([before, cancelled])
    signal.throwIfAborted()
  } finally {
    signal.removeEventListener('abort', abort)
  }
}
