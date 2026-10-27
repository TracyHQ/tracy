/**
 * The chip at the head of each chat (slot `conversation.session.header.actions`): what the chat runs
 * on. When the model picker is available, its shared catalog supplies the current display names.
 * Profiles without that service retain the account broker display.
 *
 * Two halves: `ModelChipView` draws from a `Chip` alone (rendered in tests);
 * `ModelChip` is the slot entry, reading the chat's own `modelSelection` projection through the
 * slot's `useProjection` and the plans from the page-wide store.
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react'
import { accountStatus } from './account-status.ts'
import { type Chip, type ModelSelectionView, routeVendor } from './model-chip.ts'
import type { Translate } from './strings.ts'

/**
 * The line under the chip after a failover, by the reason the broker stored with it
 * (`switched_from.reason`, `apps/tracy-web/src/seat-plan/broker.js`): a usage limit and a sign-out
 * are said as such; anything else, and a pin written before the reason existed, is "unavailable".
 */
export const switchedKey = (
  reason: unknown
): 'chip.switchedLimit' | 'chip.switchedSignedOut' | 'chip.switched' =>
  reason === 'limit'
    ? 'chip.switchedLimit'
    : reason === 'reconnect'
      ? 'chip.switchedSignedOut'
      : 'chip.switched'

/** The chip, drawn from data alone; nothing when there is nothing true to say. */
export function ModelChipView({
  t,
  chip,
  modelOnly = false
}: {
  t: Translate
  chip: Chip | undefined
  modelOnly?: boolean
}): JSX.Element | null {
  if (chip === undefined) return null
  let label: string
  let hint: string | undefined
  // The vendor half of "<vendor> · <model>" in its own span, so a narrow header row can drop it
  // (model-plan.css container query) and the model name keeps the room.
  let prefix: string | undefined
  switch (chip.kind) {
    case 'plan':
      label =
        chip.model === undefined ? chip.vendor : modelOnly ? chip.model : `${chip.vendor} · ${chip.model}`
      if (chip.model !== undefined && !modelOnly) prefix = `${chip.vendor} · `
      break
    case 'reconnect':
      label = `${chip.vendor} · ${t('chip.reconnect')}`
      hint = t('chip.reconnectHint', { vendor: chip.vendor, section: t('nav') })
      break
    default:
      label = t('chip.tracy')
  }
  return (
    // The hint is the label's accessible name too: the way back must not depend on a mouse.
    <span
      className="tracy-model-chip"
      data-model-chip={chip.kind}
      title={hint ?? label}
      aria-label={hint ?? label}
    >
      {prefix === undefined ? (
        label
      ) : (
        <>
          <span className="tracy-model-chip-vendor">{prefix}</span>
          {label.slice(prefix.length)}
        </>
      )}
    </span>
  )
}

/** The shared directory used by /model and the session header menu. */
export interface ModelDirectories {
  directoryFor(id: string): {
    store: {
      subscribe(listener: () => void): () => void
      getSnapshot(): ModelDirectoryState
    }
    load(): Promise<unknown>
  }
}
interface ModelDirectoryState {
  current: { provider: string; model: string } | null
  groups: readonly { id: string; name: string; models: readonly { id: string; name: string }[] }[]
}
const EMPTY_DIRECTORY: ModelDirectoryState = { current: null, groups: [] }
const noDirectorySubscription = () => () => {}
const emptyDirectorySnapshot = () => EMPTY_DIRECTORY

/** The account broker reports the actual route after automatic switching. */
interface ModelChipProps {
  readonly t: Translate
  readonly sessionId: string
  readonly modelDirectories?: ModelDirectories
  readonly useProjection: (key: 'modelSelection') => ModelSelectionView | undefined
}
export function ModelChip({
  t,
  sessionId,
  useProjection,
  modelDirectories
}: ModelChipProps): JSX.Element | null {
  const selection = useProjection('modelSelection')
  const directory = modelDirectories?.directoryFor(sessionId)
  const directoryState = useSyncExternalStore(
    directory ? directory.store.subscribe.bind(directory.store) : noDirectorySubscription,
    directory ? () => directory.store.getSnapshot() : emptyDirectorySnapshot
  )
  useEffect(() => {
    if (directory) void directory.load().catch(() => {})
  }, [directory])
  const current = directoryState.current
  const group = directoryState.groups.find((group) => group.id === current?.provider)
  const model = group?.models.find((model) => model.id === current?.model)
  const [retained, setRetained] = useState<{ key: string; providerName: string; modelName: string }>()
  const routeKey = current ? JSON.stringify([current.provider, current.model]) : ''
  useEffect(() => {
    if (!directory || model || !current?.provider.startsWith('tp_')) return
    const controller = new AbortController()
    void fetch(new URL('api/session/modelLabels', document.baseURI), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'model-chip-labels',
        method: 'session/modelLabels',
        payload: { args: { request: current } }
      })
    })
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json()
        if (!controller.signal.aborted && data.result?.ok && data.result.value)
          setRetained({ key: routeKey, ...data.result.value })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [directory, routeKey, model])
  const status = useSyncExternalStore(accountStatus.subscribe, accountStatus.current)
  const [route, setRoute] = useState<{
    model: string
    provider: string
    switchedFrom?: { vendor: string; reason?: string }
  } | null>()
  useEffect(() => {
    let disposed = false
    setRoute(undefined)
    const read = async () => {
      try {
        const response = await fetch(`/api/seat-plan/session?${new URLSearchParams({ sessionId })}`)
        if (!response.ok) return
        const data = await response.json()
        if (!disposed) setRoute(data.route)
      } catch {
        /* No claim about a route that cannot be read. */
      }
    }
    void read()
    const timer = window.setInterval(() => {
      if (!document.hidden) void read()
    }, 3000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [sessionId])
  if (directory) {
    // A disabled provider may remain in history; display its label without advertising it as a choice.
    const saved = retained?.key === routeKey ? retained : undefined
    const providerName = group?.name ?? saved?.providerName
    const modelName = model?.name ?? saved?.modelName
    if ((!providerName || !modelName) && !current?.provider.startsWith('seat-plan-')) return null
    const switchedFrom =
      route && route.provider === current?.provider && route.model === current?.model
        ? route.switchedFrom
        : undefined
    if (providerName && modelName)
      return (
        <span className="tracy-model-chip-row flex items-center gap-2">
          <ModelChipView
            t={t}
            modelOnly={current?.provider.startsWith('seat-plan-') === true}
            chip={{ kind: 'plan', vendor: providerName, model: modelName }}
          />
          {switchedFrom && (
            <span className="text-muted-foreground text-xs" role="status">
              {t(switchedKey(switchedFrom.reason), { vendor: switchedFrom.vendor })}
            </span>
          )}
        </span>
      )
  }
  if (route === undefined) return null
  if (!route)
    return selection?.lastUsed && !selection.lastUsed.provider.startsWith('seat-plan-') ? (
      <ModelChipView t={t} chip={{ kind: 'tracy' }} />
    ) : null
  // Tracy AI as the configured default says nothing more; after a failover, where the chat came from.
  const chip: Chip =
    route.provider === 'seat-plan-tracy'
      ? { kind: 'tracy' }
      : { kind: 'plan', vendor: routeVendor(route.provider, status), model: route.model }
  return (
    <span className="tracy-model-chip-row flex items-center gap-2">
      <ModelChipView t={t} chip={chip} modelOnly />
      {route.switchedFrom && (
        <span className="text-muted-foreground text-xs" role="status">
          {t(switchedKey(route.switchedFrom.reason), { vendor: route.switchedFrom.vendor })}
        </span>
      )}
    </span>
  )
}
