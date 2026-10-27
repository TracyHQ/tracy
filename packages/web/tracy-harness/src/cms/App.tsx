/**
 * `/ops/cms` — the cms AREA: which ref, which CMS, and the top bar that chooses them.
 *
 * SINCE 19/09 THE RAIL AND THE ROUTER LIVE IN `../App.tsx`. This component receives the route and
 * `go()` from that shell and keeps what is genuinely its own: the environments this build published,
 * the snapshot of the selected one, and the bar that picks env, CMS and — below `md` — the screen.
 * The address rules it used to hold are in `./route`, unchanged. It is loaded lazily, so `/ops` never
 * pays for it; and it UNMOUNTS on a hop to a root screen, so coming back re-reads envs and snapshot —
 * two small GETs, accepted over holding cms state in a shell that has no business knowing it.
 *
 * 🔒 A SLOW ANSWER MAY NOT PAINT UNDER A NEW QUESTION. Every fetch is tied to an `AbortController`
 * that the next choice aborts, and the reducer ignores a result whose `env` is no longer the one
 * selected. Without both, picking Main then Dev lands Main's numbers under Dev's heading — and
 * because every number on this page is plausible for either ref, nothing on screen would look wrong.
 *
 * Historical snapshots remain read-only. The Joomla base setting belongs to the active server
 * and stays accessible even when this build has no historical snapshots.
 */
import { cn, PlatformGlyph, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tracy/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useT } from '../i18n'
import { type EnvironmentRow, fetchEnvironments, fetchSnapshot, type Refusal, type Snapshot } from './api'
import { BuildBase } from './BuildBase'
import { BuildQuestions } from './BuildQuestions'
import { Demos } from './Demos'
import { Inspiration } from './Inspiration'
import { Inventory } from './Inventory'
import { Quickstarts } from './Quickstarts'
import { Templates } from './Templates'
import { RefusalNotice, Spinner } from './parts'
import { CMS, CMS_LABEL, type CmsRoute as Route, cmsHrefFor, readsEnvironment } from './route'
import { renderScreen } from './screens'
import { TOPBAR_SLOT_ID } from '../shell/topbar'

// The screens import these from `./App`; the values live in `./route` (a leaf) — see there for why.
export { CMS_LABEL, type Cms } from './route'

/** What the shell hands down: the cms part of the address, and the one way to change it. */
export interface CmsAreaProps {
  route: Route
  go: (next: Partial<Route>, replace?: boolean) => void
}

export function CmsArea({ route, go }: CmsAreaProps) {
  const [envs, setEnvs] = useState<EnvironmentRow[] | null>(null)
  const [envRefusal, setEnvRefusal] = useState<Refusal | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [snapRefusal, setSnapRefusal] = useState<Refusal | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  /** The env whose response we are willing to accept — compared on arrival, not on request. */
  const wanted = useRef(route.env)
  wanted.current = route.env

  // Which environments this build published.
  useEffect(() => {
    const ac = new AbortController()
    fetchEnvironments(ac.signal).then((r) => {
      if (ac.signal.aborted) return
      if (!r.ok) {
        setEnvRefusal(r.refusal)
        return
      }
      setEnvRefusal(null)
      setEnvs(r.value.environments)
      // Land on the first available environment when the address named none, and REPLACE rather
      // than push so Back does not bounce between "no env" and "env". This lives beside the picker
      // — wherever the picker is, the default belongs with it, or two components call
      // `history.replaceState` for the same reason and the loser's URL wins silently.
      if (!wanted.current) {
        const first = r.value.environments.find((e) => e.available) ?? r.value.environments[0]
        if (first) go({ env: first.id }, true)
      }
    })
    return () => ac.abort()
  }, [go, reloadKey])

  // The snapshot for the selected environment.
  useEffect(() => {
    if (!route.env) return
    const ac = new AbortController()
    setLoading(true)
    setSnapRefusal(null)
    fetchSnapshot(route.env, ac.signal).then((r) => {
      if (ac.signal.aborted || wanted.current !== route.env) return
      setLoading(false)
      if (!r.ok) {
        setSnapshot(null)
        setSnapRefusal(r.refusal)
        return
      }
      setSnapshot(r.value)
    })
    return () => ac.abort()
  }, [route.env, reloadKey])

  const current = useMemo(() => envs?.find((e) => e.id === route.env) ?? null, [envs, route.env])
  const t = useT()

  return (
    <>
      {/*
        🔒 ONLY WHERE IT MEANS SOMETHING. Seven screens read a ref; Design inspiration, Quickstarts
        and Demos answer from live doors and `renderScreen` hands them nothing (`readsEnvironment`). A ref picker
        above those two would be a control with nothing to change — which is exactly how it read
        while it lived in the rail, above a dozen screens it did not govern.

        Portalled onto the row that names the screen (Lee, 22/09) rather than drawn in this area's
        own bar. It unmounts with this component, so a hop to a root screen takes it away without
        the shell having to know it was ever there.
      */}
      {readsEnvironment(route.screen) ? <TopBarEnv envs={envs} route={route} go={go} /> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {/* Design inspiration has no bar: it filters by CMS on its own, with an "All" the bar does
            not have, and reads no ref — a second CMS control above it would change nothing. */}
        {route.screen === 'inspiration' || route.screen === 'templates' ? null : (
          <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-border border-b bg-muted/40 px-6 py-2">
            <Segments route={route} go={go} />

            <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
              {loading ? <Spinner label={t('cms-screens.area.reading')} /> : null}
              {snapshot ? (
                <>
                  <span>
                    {t('cms-screens.area.ref')}{' '}
                    <span className="font-mono text-foreground/80">{snapshot.source.ref}</span>
                  </span>
                  <span>
                    {t('cms-screens.area.commit')}{' '}
                    <span className="font-mono text-foreground/80" title={snapshot.source.sha}>
                      {snapshot.source.sha.slice(0, 9)}
                    </span>
                  </span>
                  <span>
                    {t('cms-screens.area.readAt')}{' '}
                    <span className="font-mono text-foreground/80">
                      {snapshot.source.generatedAt.slice(0, 16)}Z
                    </span>
                  </span>
                </>
              ) : current && !current.available ? (
                <span>{t('cms-screens.area.branchUnreadable')}</span>
              ) : null}
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {route.screen === 'catalog' ? (
            <div className="px-6 pt-6">
              <BuildBase key={route.cms} cms={route.cms} />
            </div>
          ) : null}
          {route.screen === 'questions' ? (
            <div className="px-6 pt-6">
              <BuildQuestions
                key={route.cms}
                cms={route.cms}
                quickstartsHref={cmsHrefFor({ ...route, screen: 'quickstarts', tag: null, set: null })}
              />
            </div>
          ) : null}
          {/* What customers on THIS server are offered: live database state, no ref. */}
          {route.screen === 'inspiration' ? <Inspiration /> : null}
          {/* Design inspiration and Quickstarts in one list, one row per template (10/10/2026). Live
              doors like both of them, so no ref and no CMS bar: it filters by CMS on its own. */}
          {route.screen === 'templates' ? (
            <Templates
              template={route.template ?? null}
              view={route.view ?? null}
              release={route.release ?? null}
              // A tab change keeps the asked release; opening or leaving a template drops it.
              onOpen={(template, view = null) =>
                go(template === route.template ? { template, view } : { template, view, release: null })
              }
            />
          ) : null}
          {/* Quickstarts is LIVE, not a reading of a tree: it answers from what this server last
              read off GitHub, so it draws on its own and carries no ref. */}
          {route.screen === 'quickstarts' ? (
            <Quickstarts
              cms={route.cms}
              setCms={(cms) => go({ cms: cms === 'all' ? 'joomla' : cms })}
              tag={route.tag}
              set={route.set}
              onOpen={(tag, set = null) => go({ tag, set })}
              inspirationHref={cmsHrefFor({ ...route, screen: 'inspiration', tag: null, set: null })}
            />
          ) : null}
          {/* The warm stock reads live doors too — pools, instances and their health as they are
              now, not as some ref described them. */}
          {route.screen === 'inventory' ? <Inventory cms={route.cms} /> : null}
          {/* Demos is live too: the demo host's sites joined with the last read of GitHub. */}
          {route.screen === 'demos' ? <Demos cms={route.cms} /> : null}
          {['templates', 'inspiration', 'quickstarts', 'demos', 'inventory'].includes(
            route.screen
          ) ? null : envRefusal ? (
            <div className="px-6 py-6">
              <RefusalNotice refusal={envRefusal} onRetry={() => setReloadKey((k) => k + 1)} />
            </div>
          ) : snapRefusal ? (
            <div className="px-6 py-6">
              <RefusalNotice refusal={snapRefusal} onRetry={() => setReloadKey((k) => k + 1)} />
            </div>
          ) : (
            renderScreen(route.screen, {
              snapshot,
              loading,
              env: route.env,
              cms: route.cms,
              setCms: (cms) => go({ cms }),
              goToScreen: (screen) => go({ screen })
            })
          )}
        </div>
      </div>
    </>
  )
}

/**
 * The environment control, rendered into the shell's top-bar slot.
 *
 * The slot node is looked up AFTER mount: on the first render of a lazily-loaded area the shell's
 * own markup may not be in the document yet, and `createPortal(…, null)` throws rather than
 * degrading. A state set in an effect means the first paint simply has no picker and the second
 * does, which is a blink nobody sees and no crash.
 */
function TopBarEnv({
  envs,
  route,
  go
}: {
  envs: EnvironmentRow[] | null
  route: Route
  go: (next: Partial<Route>) => void
}) {
  const t = useT()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById(TOPBAR_SLOT_ID)), [])
  if (!slot) return null
  return createPortal(
    <label className="flex items-center gap-2 text-muted-foreground text-xs">
      {t('cms-screens.area.environment')}
      <EnvPicker envs={envs} value={route.env} onChange={(env) => go({ env })} />
    </label>,
    slot
  )
}

/**
 * Which ref the seven snapshot screens are reading — a dropdown, not the segmented control the CMS
 * picker beside it uses (Lee, 22/09).
 *
 * 🔒 THE TWO PICKERS LOOK DIFFERENT BECAUSE THEY ARE DIFFERENT. CMS is a choice among three that a
 * person flips between constantly while reading one screen, so all three stay on screen. The ref
 * is set once and then largely forgotten, and its list grows with the branches this build read —
 * segments would push the bar wider every time somebody published another one. A dropdown states
 * the current answer in fixed width and hides the rest until asked.
 *
 * A ref the build could not read stays in the list, marked, rather than being dropped: "Main is
 * not selectable" is a fact about this build worth seeing, where a silently shorter list just
 * looks like Main does not exist.
 */
function EnvPicker({
  envs,
  value,
  onChange
}: {
  envs: EnvironmentRow[] | null
  value: string
  onChange: (env: string) => void
}) {
  const t = useT()
  if (!envs || envs.length === 0) return null
  return (
    // `value` is typed `string | null` by base-ui (a Select CAN be cleared); this one never is —
    // there is no "no environment" state to fall into, so a null is ignored rather than passed on
    // as an empty ref the snapshot read would then refuse.
    <Select value={value} onValueChange={(next) => next !== null && onChange(next)}>
      <SelectTrigger size="sm" className="w-[9rem]" aria-label={t('cms-screens.area.environment')}>
        {/* The LABEL, not the id. A bare `<SelectValue />` prints the value base-ui holds — `dev`,
            `main` — while every other place this build names a ref says `Dev` and `Main`. Measured
            22/09: the trigger read "dev" under a heading that read "Dev". */}
        <SelectValue>{(id) => envs.find((e) => e.id === id)?.label ?? String(id ?? '')}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {envs.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.label}
            {e.available ? null : (
              <span className="text-muted-foreground text-xs">{t('cms-screens.area.unavailable')}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Segments({ route, go }: { route: Route; go: (next: Partial<Route>) => void }) {
  const t = useT()
  return (
    <div
      className="flex flex-none gap-1 rounded-lg bg-muted p-[3px]"
      role="group"
      aria-label={t('cms-screens.area.cmsPicker')}
    >
      {CMS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => go({ cms: id })}
          aria-pressed={id === route.cms}
          aria-label={CMS_LABEL[id]}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
            'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
            id === route.cms
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <PlatformGlyph platform={id} />
          {CMS_LABEL[id]}
        </button>
      ))}
    </div>
  )
}
