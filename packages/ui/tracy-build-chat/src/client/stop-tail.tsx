/**
 * The stop card's tail (#575). The `tracy_build:retry` definition publishes on the session's last turn only, and this
 * tail follows that turn's live source, so the card stays at the end of the conversation: once a newer turn carries
 * the value, this turn draws nothing, and no older card keeps buttons that act. On a chat opened again it reads the
 * engine door once (`GET /api/build-draft/engine`), so the buttons are those of the CURRENT state: no card while a
 * step runs again, and the card of a stop the chat never heard (the step ended while the chat was closed).
 */
import { type StopCard as StopCardValue, stopCardOf } from '@tracy/core/build-chat'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { RETRY_KEY, type RetryValue } from './definitions'
import { ENGINE_PATH } from './engine-feed'
import { startOverDraft } from './start-over'
import { StopCard } from './StopCard'
import type { TailDeps, TailProps, TurnDataLike } from './tails'

const noSubscribe = () => () => {}
const NO_SOURCE = { getSnapshot: () => undefined, subscribe: noSubscribe }

/** One read of the engine door: its state, or null when it could not be read. */
function useEngineOnce(fetchImpl: typeof fetch | undefined, key: string) {
  const [engine, setEngine] = useState<unknown>(undefined)
  useEffect(() => {
    let live = true
    const read = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
    read(ENGINE_PATH, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body) => {
        if (live) setEngine(body ?? null)
      })
    return () => {
      live = false
    }
  }, [fetchImpl, key])
  return engine
}

/** The clock, moved on once when a waiting Try again may be pressed. */
function useNowUntil(card: StopCardValue | null) {
  const [now, setNow] = useState(() => Date.now())
  const at = card?.retry === 'waiting' && card.retryAt ? Date.parse(card.retryAt) : Number.NaN
  useEffect(() => {
    if (!Number.isFinite(at)) return
    // A timer longer than about 24 days fires at once; a day limit opens within one.
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(at - Date.now(), 0) + 500, 2 ** 31 - 1)
    )
    return () => clearTimeout(timer)
  }, [at])
  return now
}

export function StopTail({
  deps,
  value,
  sessionId,
  turn,
  data,
  useChat,
  retryMessage,
  navigate
}: {
  deps: TailDeps
  value: RetryValue
  sessionId: string
  turn: number
  data?: TurnDataLike
  useChat: NonNullable<TailProps['useChat']>
  retryMessage: string
  navigate: (href: string) => void
}) {
  const source = data?.source?.(RETRY_KEY) ?? NO_SOURCE
  const readLive = () => (data?.source ? source.getSnapshot() : value)
  const live = useSyncExternalStore(source.subscribe, readLive, readLive) as RetryValue | undefined
  const last = useChat((snapshot) => snapshot.timeline.turnOrder.at(-1))
  const readRun = () => deps.runs.read(sessionId)
  const run = useSyncExternalStore(deps.runs.subscribe, readRun, readRun)
  const stop = live?.stop ?? null
  const engine = useEngineOnce(deps.fetch, `${live?.turn}:${stop?.seq ?? ''}`)
  const card = engine === undefined && stop === null ? null : stopCardOf({ stop, engine })
  const now = useNowUntil(card)
  // An older turn, a build run (it has its own notice), or nothing stopped: no card.
  if (!live || (last !== undefined && last !== turn) || run !== null) return null
  const shown = stopCardOf({ stop, engine: engine ?? null, now })
  if (shown === null) return null
  return (
    <StopCard
      card={shown}
      t={deps.t(sessionId, stop?.language)}
      locale={interfaceLocale()}
      now={now}
      retry={() => deps.send?.(sessionId, retryMessage) ?? Promise.resolve('no-chat' as const)}
      startOver={async () => {
        const open = await startOverDraft(sessionId, deps.fetch)
        if (open === null) return false
        navigate(open)
        return true
      }}
    />
  )
}
