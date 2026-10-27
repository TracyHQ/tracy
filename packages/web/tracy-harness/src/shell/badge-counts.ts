type BadgeWindow = Pick<
  Window,
  'setInterval' | 'clearInterval' | 'addEventListener' | 'removeEventListener'
> & {
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
}

type BadgeReader = (signal: AbortSignal) => Promise<number | null>

/** Keep a visible tab's badges current, even while their own screens are not mounted. */
export function watchBadgeCounts({
  win,
  fetchAttentionCount,
  fetchStuckCount,
  onAttentionCount,
  onStuckCount
}: {
  win: BadgeWindow
  fetchAttentionCount: BadgeReader
  fetchStuckCount: BadgeReader
  onAttentionCount: (count: number | null) => void
  onStuckCount: (count: number | null) => void
}): () => void {
  let stopped = false
  let current: AbortController | null = null
  const read = async (reader: BadgeReader, publish: (count: number | null) => void, signal: AbortSignal) => {
    try {
      const count = await reader(signal)
      if (!signal.aborted) publish(count)
    } catch {
      // A refusal or outage is unknown, never a cached count presented as current.
      if (!signal.aborted) publish(null)
    }
  }
  const refresh = () => {
    if (stopped || win.document.visibilityState !== 'visible') return
    current?.abort()
    current = new AbortController()
    void read(fetchAttentionCount, onAttentionCount, current.signal)
    void read(fetchStuckCount, onStuckCount, current.signal)
  }
  const onStuckChanged = () => {
    // A successful page action makes any pre-action response obsolete, even in a hidden tab.
    current?.abort()
    refresh()
  }
  const timer = win.setInterval(refresh, 30_000)
  win.addEventListener('focus', refresh)
  win.addEventListener('tracy:stuck-changed', onStuckChanged)
  win.document.addEventListener('visibilitychange', refresh)
  refresh()
  return () => {
    stopped = true
    current?.abort()
    win.clearInterval(timer)
    win.removeEventListener('focus', refresh)
    win.removeEventListener('tracy:stuck-changed', onStuckChanged)
    win.document.removeEventListener('visibilitychange', refresh)
  }
}
