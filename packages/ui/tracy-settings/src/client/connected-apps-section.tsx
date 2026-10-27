/**
 * Settings › Connected apps: apps connected to the whole account through "Connect Tracy" (OAuth
 * device flow, e.g. a self-hosted Website Opportunities). Read from `GET /api/me/connected-apps`;
 * Disconnect is `DELETE /api/me/connected-apps/:id`, permanent: the app must connect again.
 * Seat keys of one site are not listed here.
 */
import { useCallback, useEffect, useState, type JSX } from 'react'
import { Button } from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'

export const CONNECTED_APPS_SECTION_ID = 'tracy-connected-apps'

const DOOR = '/api/me/connected-apps'

/** One app as the door answers it. */
export interface ConnectedApp {
  readonly id: string
  readonly clientId: string
  readonly name: string
  readonly scopes: readonly string[]
  readonly createdAt: string
  readonly lastUsedAt: string | null
  readonly expiresAt: string
}

type Translate = (key: string, params?: Record<string, unknown>) => string

export const withoutApp = (apps: readonly ConnectedApp[], id: string): ConnectedApp[] =>
  apps.filter((app) => app.id !== id)

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString(interfaceLocale(), { year: 'numeric', month: 'short', day: 'numeric' })

/** The list itself: `apps` null while loading; `failed` when the load did not answer. */
export function ConnectedAppsList({
  t,
  apps,
  failed,
  busy = null,
  onDisconnect
}: {
  t: Translate
  apps: readonly ConnectedApp[] | null
  failed: boolean
  busy?: string | null
  onDisconnect: (id: string) => void
}): JSX.Element {
  if (failed)
    return (
      <p className="ts-row-desc ts-nnote" role="alert">
        {t('connectedApps.loadFailed')}
      </p>
    )
  if (apps === null) return <div className="ts-nloading" aria-busy="true" />
  if (apps.length === 0) return <p className="ts-row-desc ts-nnote">{t('connectedApps.empty')}</p>
  return (
    <div className="ts-connected-apps">
      {apps.map((app) => (
        <div key={app.id} className="ts-row" data-connected-app={app.clientId}>
          <span className="ts-row-text">
            <span className="ts-row-title">{app.name}</span>
            {app.scopes.map((scope) => (
              <span key={scope} className="ts-row-desc">
                {t(`connectedApps.scope.${scope}`)}
              </span>
            ))}
            <span className="ts-row-desc">
              {t('connectedApps.connectedOn', { date: day(app.createdAt) })}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy === app.id}
            onClick={() => {
              onDisconnect(app.id)
            }}
          >
            {t('connectedApps.disconnect')}
          </Button>
        </div>
      ))}
    </div>
  )
}

/** The section: loads the apps, disconnects one on request. */
export function ConnectedAppsSection({ t }: { t: Translate }): JSX.Element {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [revokeFailed, setRevokeFailed] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await fetch(DOOR, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        if (!res.ok) throw new Error(`connected apps answered ${res.status}`)
        const body = (await res.json()) as { apps?: ConnectedApp[] }
        if (!Array.isArray(body.apps)) throw new Error('connected apps answered no list')
        if (live) setApps(body.apps)
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const disconnect = useCallback((id: string) => {
    setBusy(id)
    setRevokeFailed(false)
    void (async () => {
      let ok = false
      try {
        const res = await fetch(`${DOOR}/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'same-origin'
        })
        // 404: already gone (another window) — the list should drop it either way.
        ok = res.ok || res.status === 404
      } catch {
        ok = false
      }
      setBusy(null)
      if (ok) setApps((current) => (current ? withoutApp(current, id) : current))
      else setRevokeFailed(true)
    })()
  }, [])

  return (
    <div>
      <p className="ts-row-desc">{t('connectedApps.desc')}</p>
      <ConnectedAppsList t={t} apps={apps} failed={failed} busy={busy} onDisconnect={disconnect} />
      {revokeFailed && (
        <p className="ts-row-desc ts-nnote" role="alert">
          {t('connectedApps.revokeFailed')}
        </p>
      )}
    </div>
  )
}
