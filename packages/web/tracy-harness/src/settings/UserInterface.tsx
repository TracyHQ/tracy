/**
 * `/ops/ui` — User Interface: which pieces of the customer's dsh page this deployment hides
 * (`tasks/plan-ui-switches.md`, phase C; mockup `Mockups/Ops User Interface`, variant A).
 *
 * ITS OWN SCREEN BESIDE General, NOT A PANEL IN IT (Lee, 28/09): 55 switches in six areas do not
 * fit one panel, the same reason Model & AI left General on 22/09. Inside, a rail of AREAS of the
 * customer's page, in the order Lee set: Settings dialog, Left column, Right column, New session,
 * Composer, DSH.
 *
 * 🔒 DRAWN FROM THE DOOR, NEVER FROM A COPY OF THE LIST. `GET /api/ops/ui` hands over the catalogue
 * (`@tracy/core/ui-switches/catalogue.json`) with each switch's state, so a switch added there
 * appears here with no change to this file. A press takes effect on the customer's next page load:
 * no release, no rebuild.
 *
 * NUMBERED PICTURES, as the mockup Lee approved. Under each area's switches, the customer's page as
 * it looks with every piece shown, one outlined box per switch carrying the number printed beside
 * that switch. Boxes come from `./ui-shots/shots.ts` (captured on the local stand); a switch whose
 * piece is not drawn on that page gets no box and is listed under the picture instead.
 */
import {
  Badge,
  Card,
  CardContent,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Skeleton,
  Switch,
  cn
} from '@tracy/ui'
import { AlertTriangle, Lock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Trans, tr, useT } from '../i18n'
import { DesktopApp } from './DesktopApp'
import { type ShotBox, UI_SHOTS } from './ui-shots/shots'

interface Area {
  id: string
  label: string
  blurb: string
  groups: string[]
}
interface Group {
  id: string
  title: string
  blurb: string
}
interface UiSwitch {
  id: string
  group: string
  label: string
  hint: string
  drawnBy: 'dsh' | 'Tracy'
  defaultOn: boolean
  on: boolean
  pending?: boolean
  warning?: string
  /** A switch whose piece sits inside this one's: turning the parent off hides it too. */
  parent?: string
  /** Why this switch cannot be pressed: it stays at its default (its plugin is off). */
  locked?: string
}
interface UiDocument {
  areas: Area[]
  groups: Group[]
  switches: UiSwitch[]
  updatedBy: string | null
  updatedAt: string | null
  writable: boolean
}

/** Which picture shows which area (the capture script names them after the page region). */
const SHOT_OF: Record<string, string> = {
  settings: 'settings-dialog',
  sidebar: 'left-column',
  'right-column': 'right-column',
  'new-session': 'new-session',
  composer: 'composer',
  dsh: 'dsh'
}
const SHOT_URL: Record<string, string> = {
  'settings-dialog': new URL('./ui-shots/settings-dialog.png', import.meta.url).href,
  'left-column': new URL('./ui-shots/left-column.png', import.meta.url).href,
  'right-column': new URL('./ui-shots/right-column.png', import.meta.url).href,
  'new-session': new URL('./ui-shots/new-session.png', import.meta.url).href,
  composer: new URL('./ui-shots/composer.png', import.meta.url).href,
  dsh: new URL('./ui-shots/dsh.png', import.meta.url).href
}

function Num({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-primary font-mono font-semibold text-primary-foreground',
        small ? 'size-4 text-[10px]' : 'size-5 text-[11px]'
      )}
    >
      {n}
    </span>
  )
}

/** The customer's page for one area, each switch's piece boxed with its number. */
function AreaShot({ area, label, switches }: { area: string; label: string; switches: UiSwitch[] }) {
  const t = useT()
  const shot = SHOT_OF[area]
  const boxes = shot ? (UI_SHOTS.shots[shot] ?? {}) : {}
  if (!shot || !SHOT_URL[shot]) return null
  const numbered = switches.map((s, i) => ({ s, n: i + 1, box: boxes[s.id] ?? null }))
  const offScreen = numbered.filter((x) => x.box === null)
  const context = Object.entries(boxes).filter(([k, b]) => k.startsWith('_') && b !== null) as [
    string,
    ShotBox
  ][]
  return (
    <figure className="mt-6">
      <figcaption className="mb-2 text-muted-foreground text-xs">
        {t('settings.ui.shot.caption', { area: label.toLowerCase() })}
      </figcaption>
      <div
        className="relative overflow-hidden rounded-lg border bg-muted"
        style={{ aspectRatio: `${UI_SHOTS.viewport.w} / ${UI_SHOTS.viewport.h}` }}
      >
        <img src={SHOT_URL[shot]} alt="" className="block h-full w-full" />
        {context.map(([k, b]) => (
          <div
            key={k}
            className="absolute rounded-sm border border-muted-foreground/60 border-dashed"
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
          />
        ))}
        {numbered
          .filter((x) => x.box !== null)
          .map(({ s, n, box }) => {
            const b = box as ShotBox
            return (
              <div
                key={s.id}
                title={s.label}
                className={cn(
                  'absolute rounded-sm border-2 shadow-[0_0_0_2px_rgba(255,255,255,0.7)]',
                  s.on ? 'border-primary/80' : 'border-muted-foreground/70 border-dashed'
                )}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
              >
                <span className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 shadow">
                  <Num n={n} />
                </span>
              </div>
            )
          })}
      </div>
      {offScreen.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          <span>{t('settings.ui.shot.notDrawn')}</span>
          {offScreen.map(({ s, n }) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <Num n={n} small /> {s.label}
            </span>
          ))}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">
        <Trans
          i18nKey="settings.ui.shot.legend"
          values={{ date: UI_SHOTS.capturedAt.slice(0, 10), site: UI_SHOTS.site }}
          components={{ code: <span className="font-mono" /> }}
        />
      </p>
    </figure>
  )
}

/**
 * The Desktop App area: first in the rail, and not an area of the catalogue — it holds the app's own
 * settings (`./DesktopApp.tsx`), while every catalogue area applies to the app as it is (Lee, 07/10).
 */
const DESKTOP_AREA = 'desktop-app'

/** The area the address asks for, kept only if it exists once the catalogue has answered. */
const askedArea = () => new URLSearchParams(window.location.search).get('area') ?? DESKTOP_AREA
const knownArea = (areas: Area[], id: string) =>
  id === DESKTOP_AREA || areas.some((a) => a.id === id) ? id : DESKTOP_AREA

export function UserInterface() {
  const t = useT()
  const [doc, setDoc] = useState<UiDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [area, setArea] = useState(askedArea)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/ui', { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(tr('settings.ui.readFailed', { status: response.status }))
      const body = (await response.json()) as UiDocument
      setDoc(body)
      setArea((current) => knownArea(body.areas, current))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const pickArea = (id: string) => {
    setArea(id)
    const url = new URL(window.location.href)
    url.searchParams.set('area', id)
    window.history.replaceState(window.history.state, '', url)
  }

  const press = async (id: string, on: boolean) => {
    setBusy(id)
    setError(null)
    try {
      const response = await fetch('/api/ops/ui', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ switches: { [id]: on } })
      })
      if (!response.ok) throw new Error(tr('settings.ui.pressFailed', { status: response.status }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const current = doc?.areas.find((a) => a.id === area)
  // The area's switches in display order; index + 1 is the number on the switch and on its box.
  const areaSwitches =
    doc && current
      ? doc.groups
          .filter((g) => current.groups.includes(g.id))
          .flatMap((g) => doc.switches.filter((s) => s.group === g.id))
      : []
  const numberOf = (id: string) => areaSwitches.findIndex((s) => s.id === id) + 1
  // A child switch (an item of a menu) cannot show while its parent (the menu) is off.
  const parentOff = (s: UiSwitch) =>
    s.parent !== undefined && doc?.switches.find((p) => p.id === s.parent)?.on === false
  const changed = doc?.switches.filter((s) => s.on !== s.defaultOn).length ?? 0

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-start justify-between gap-3 px-8 pt-7 pb-4">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">{t('settings.ui.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{t('settings.ui.blurb')}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-muted-foreground text-xs">
          <Badge variant="outline" className="font-mono text-[11px]">
            {window.location.host}
          </Badge>
          {doc ? (
            <span>
              {changed === 0
                ? t('settings.ui.allDefaults')
                : t('settings.ui.changedCount', { count: changed })}
              {doc.updatedBy ? t('settings.ui.lastPress', { name: doc.updatedBy }) : ''}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 px-8 pb-8 lg:flex-row">
        <nav className="flex flex-none flex-row flex-wrap gap-1 lg:w-48 lg:flex-col">
          {[{ id: DESKTOP_AREA, label: t('settings.desktop.title') }, ...(doc?.areas ?? [])].map((a) => (
            <a
              key={a.id}
              href={`?area=${a.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                pickArea(a.id)
              }}
              aria-current={a.id === area ? 'page' : undefined}
              className={
                a.id === area
                  ? 'rounded-lg bg-muted px-3 py-1.5 font-medium text-foreground text-sm no-underline'
                  : 'rounded-lg px-3 py-1.5 text-foreground/80 text-sm no-underline hover:bg-muted/60'
              }
            >
              {a.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {area === DESKTOP_AREA ? (
            <DesktopApp />
          ) : (
            <>
              {error ? <p className="mb-3 text-destructive text-sm">{error}</p> : null}
              {!doc || !current ? (
                error ? null : (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                )
              ) : (
                <>
                  <h2 className="font-medium text-base">{current.label}</h2>
                  <p className="mt-0.5 mb-4 text-muted-foreground text-sm">{current.blurb}</p>
                  {!doc.writable ? (
                    <p className="mb-3 text-muted-foreground text-xs">{t('settings.common.readOnlyRole')}</p>
                  ) : null}
                  <div className="flex flex-col gap-4">
                    {doc.groups
                      .filter((g) => current.groups.includes(g.id))
                      .map((g) => (
                        <Card key={g.id} className="py-0">
                          <CardContent className="px-0">
                            <div className="px-5 pt-4 pb-2">
                              <div className="font-medium text-sm">{g.title}</div>
                              <div className="text-muted-foreground text-xs">{g.blurb}</div>
                            </div>
                            <ItemGroup>
                              {doc.switches
                                .filter((s) => s.group === g.id)
                                .map((s, i) => (
                                  <div key={s.id}>
                                    {i > 0 ? <ItemSeparator /> : null}
                                    <Item size="sm" className="px-5">
                                      <ItemMedia>
                                        <Num n={numberOf(s.id)} />
                                      </ItemMedia>
                                      <ItemContent>
                                        <ItemTitle>
                                          {s.label}
                                          {s.pending ? (
                                            <Badge variant="outline" className="ms-2 text-[10px]">
                                              {t('settings.ui.notWired')}
                                            </Badge>
                                          ) : null}
                                          {s.on !== s.defaultOn ? (
                                            <Badge variant="secondary" className="ms-2 text-[10px]">
                                              {t('settings.ui.changed')}
                                            </Badge>
                                          ) : null}
                                        </ItemTitle>
                                        <ItemDescription>{s.hint}</ItemDescription>
                                        {parentOff(s) ? (
                                          <p className="mt-1 text-muted-foreground text-xs">
                                            {t('settings.ui.offWithParent', {
                                              parent: doc.switches.find((p) => p.id === s.parent)?.label ?? ''
                                            })}
                                          </p>
                                        ) : null}
                                        {s.locked ? (
                                          <p className="mt-1 flex items-start gap-1 text-muted-foreground text-xs">
                                            <Lock className="mt-0.5 size-3 flex-none" /> {s.locked}
                                          </p>
                                        ) : null}
                                        {s.warning && !s.on ? (
                                          <p className="mt-1 flex items-center gap-1 text-amber-700 text-xs dark:text-amber-400">
                                            <AlertTriangle className="size-3" /> {s.warning}
                                          </p>
                                        ) : null}
                                      </ItemContent>
                                      <ItemActions>
                                        <Switch
                                          checked={s.on}
                                          disabled={
                                            !doc.writable ||
                                            s.pending === true ||
                                            parentOff(s) ||
                                            s.locked !== undefined ||
                                            busy !== null
                                          }
                                          onCheckedChange={(on) => void press(s.id, on)}
                                          aria-label={s.label}
                                        />
                                      </ItemActions>
                                    </Item>
                                  </div>
                                ))}
                            </ItemGroup>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                  <AreaShot area={current.id} label={current.label} switches={areaSwitches} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
