/**
 * The site's Publish tab as one stepped wizard, drawn with the Add site shell (23/10/2026):
 *
 *   Owner   choose the kind, then  online: Tracy address › (Sync) › Your domain
 *                                  zip:    (Sync) › Download
 *                                  live:   Review › Send   (Sync to live, an imported site only)
 *   Editor  Tracy address only (Publish / Back to draft)
 *   Viewer  Tracy address, with the line that only an Owner or an Editor can publish
 *
 * Display only: every press is a door the tab already had (publishing, address, own domain, export,
 * sync, push), asked the same way. The ZIP and the sync keep running while the person is on another
 * step: the sync door is followed from the first frame on a site that syncs (its answer decides the
 * plan), and the ZIP's state lives in a host that stays mounted once its step was first opened.
 */
import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button, useTabLoading } from '@tracy/ui'
import { WizardSteps } from '../../wizard-shell'
import type { Translate } from '../../team/translate'
import type { Snapshot } from '../settings-rows'
import type { PublishingControl } from '../SiteDomains'
import { AddressStep } from './AddressStep'
import { useAddressDoor } from './address-door'
import { DomainStep } from './DomainStep'
import { KindStep } from './KindStep'
import { Notice } from './page'
import { Note } from '../pieces'
import {
  entryKind,
  entryStep,
  kindsFor,
  type PublishEntry,
  type PublishFacts,
  type PublishKind,
  type PublishStep,
  SYNC_PLATFORMS,
  stepsFor,
  syncsFromOriginal
} from './plan'
import { pushStepOf } from './push-words'
import { PushStep } from './PushStep'
import { SyncStep } from './SyncStep'
import { useLivePush } from './use-live-push'
import { type LiveSync, useLiveSync } from './use-live-sync'
import { type SiteExport, useSiteExport } from './use-site-export'
import { useSwitchOff } from './use-switch-off'
import { ZipStep } from './ZipStep'

/** A menu landing: where to go, and a count that changes each time the menu is used again. */
export interface PublishArrival {
  entry: PublishEntry
  n: number
}

/**
 * Keeps the export followed once its step was opened. `runPending`: a sync this flow started for
 * the ZIP is in place, so a fresh export is due; it starts as soon as no export is under way (also
 * on the host's first frame, when the sync is what opened the step) and `onRun` clears the request.
 */
function ZipHost({
  siteKey,
  syncs,
  runPending,
  onRun,
  t,
  children
}: {
  siteKey: string
  syncs: boolean
  runPending: boolean
  onRun: () => void
  t: Translate
  children: (zip: SiteExport) => ReactNode
}): JSX.Element {
  const zip = useSiteExport({ siteKey, backupTitle: t('zip.backupTitle'), syncs })
  const { run, stage } = zip
  useEffect(() => {
    if (!runPending || stage === 'backup' || stage === 'packing') return
    onRun()
    run()
  }, [runPending, onRun, run, stage])
  return <>{children(zip)}</>
}

/** What the wizard is handed by the Publish tab. */
interface WizardProps {
  siteKey: string
  siteName: string
  snapshot: Snapshot
  control: PublishingControl
  refresh: () => void
  role: string | null
  /**
   * Brought in with Import existing site (`/api/sites` `imported`); `loading` while the sites list
   * has not answered yet, `failed` when it could not be read.
   */
  imported: boolean | 'loading' | 'failed'
  /** Ask the sites list again (after `imported: 'failed'`). */
  onRetrySites?: () => void
  /** The "…" menu sent the person here (Export site as ZIP, Sync from live, Sync to live). */
  arrival?: PublishArrival | null
  t: Translate
}

/** The tab's shared loading bar while the plan waits for an answer; the body stays empty. */
function Waiting(): null {
  useTabLoading(true)
  return null
}

/**
 * Whether the site syncs is known before any step is drawn: the plan (and where a menu landing
 * goes) depends on it. A site that may sync waits for the sites list (`imported`) and then for the
 * sync door's own answer (`available`), as the Export dialog did; a list that could not be read is
 * said with a way to ask again, never taken as "no Sync".
 */
export function PublishWizard(props: WizardProps): JSX.Element | null {
  const { siteKey, snapshot, role, imported, onRetrySites, t } = props
  const owner = role === 'owner' || snapshot.addressChange?.allowed === true
  const syncOff = useSwitchOff('site-sync-from-live')
  const pushOff = useSwitchOff('site-sync-to-live')
  const mayAsk = syncsFromOriginal({ owner, imported: true, platform: snapshot.platform, switchOn: !syncOff })
  // Sync to live: the same sites, its own switch (off by default until an operator turns it on).
  const mayPush = syncsFromOriginal({
    owner,
    imported: true,
    platform: snapshot.platform,
    switchOn: !pushOff
  })
  const asks = mayAsk && imported === true
  // A sync this wizard started is applied: the flow on screen decides what follows.
  const synced = useRef<() => void>(() => {})
  const live = useLiveSync({ siteKey, enabled: asks, onReady: () => synced.current() })
  if ((mayAsk || mayPush) && imported === 'failed')
    return (
      <Note>
        {t('state.failed')}
        {onRetrySites && (
          <Button variant="outline" size="sm" onClick={onRetrySites}>
            {t('action.retry')}
          </Button>
        )}
      </Note>
    )
  if (((mayAsk || mayPush) && imported === 'loading') || (asks && live.phase === 'loading'))
    return <Waiting />
  return (
    <PublishFlow
      {...props}
      owner={owner}
      live={asks ? live : null}
      pushes={mayPush && imported === true}
      synced={synced}
    />
  )
}

/** How the ZIP flow was entered: by "Sync from live" in the "…" menu, or by the person. */
type Entered = 'menu-sync' | 'flow'

function PublishFlow({
  siteKey,
  siteName,
  snapshot,
  control,
  refresh,
  role,
  imported,
  arrival,
  owner,
  live,
  pushes,
  synced,
  t
}: WizardProps & {
  owner: boolean
  /** The sync door, followed from the first frame; null when this site has no sync. */
  live: LiveSync | null
  /** Sync to live is offered on this site (its own flow, `live`). */
  pushes: boolean
  synced: { current: () => void }
}): JSX.Element {
  const door = useAddressDoor({ siteKey, snapshot, control, refresh, t })
  const connectOff = useSwitchOff('site-connect-domain')
  // "Sync from live" only syncs, and its step says why when the door has no sync; a sync pressed in
  // the ZIP flow the person entered goes on to the export.
  const [entered, setEntered] = useState<Entered>(arrival?.entry === 'sync' && owner ? 'menu-sync' : 'flow')
  const factsFor = (how: Entered): PublishFacts => ({
    owner,
    // The door said this site has no sync (not connected…): the flow is the one without it.
    syncs: live !== null && (live.phase !== 'unavailable' || how === 'menu-sync'),
    // A domain the site already has is shown to every seat, as the Domains section always did;
    // connecting a new one is the Owner's, while the switch is on.
    domainStep: door.domains.length > 0 || (owner && snapshot.addressChange?.allowed === true && !connectOff),
    pushes
  })
  const facts = factsFor(entered)
  const kinds = kindsFor(facts)
  const [kind, setKind] = useState<PublishKind | null>(
    arrival && owner ? entryKind(facts, arrival.entry) : kinds.length > 1 ? null : 'online'
  )
  const [step, setStep] = useState<PublishStep>(() =>
    arrival && owner ? entryStep(facts, arrival.entry) : kinds.length > 1 ? 'kind' : 'address'
  )
  const [opened, setOpened] = useState(false)
  const [runPending, setRunPending] = useState(false)
  const ranExport = useCallback(() => setRunPending(false), [])
  const flow = kind ?? 'online'
  const steps = stepsFor(facts, flow)
  // Sync to live's door, followed while its flow is on screen; its phase decides Review or Send.
  const pushing = useLivePush({ siteKey, enabled: pushes && flow === 'live' })
  // A step that left the flow (a switch turned off, the site is not the Owner's any more) goes
  // back to where the flow starts.
  const chosen: PublishStep = steps.includes(step) ? step : steps[0]
  const current: PublishStep =
    flow === 'live' && chosen !== 'kind' ? pushStepOf(pushing.phase, pushing.push) : chosen
  const { close } = door
  const go = useCallback(
    (next: PublishStep) => {
      close()
      setStep(next)
      if (next === 'zip') setOpened(true)
    },
    [close]
  )
  // A menu landing, each time the menu is used: the ZIP flow, at its start or its Sync step.
  const landed = useRef<number | null>(null)
  useEffect(() => {
    if (!arrival || !owner || landed.current === arrival.n) return
    landed.current = arrival.n
    const how: Entered = arrival.entry === 'sync' ? 'menu-sync' : 'flow'
    setEntered(how)
    setKind(entryKind(factsFor(how), arrival.entry))
    go(entryStep(factsFor(how), arrival.entry))
  })
  // The ZIP opened on arrival is followed from the first frame.
  useEffect(() => {
    if (current === 'zip') setOpened(true)
  }, [current])
  const at = steps.indexOf(current)
  const back = at > 0 ? () => go(steps[at - 1]) : undefined
  const next = at >= 0 && at < steps.length - 1 ? () => go(steps[at + 1]) : undefined
  const isLast = at === steps.length - 1
  // An imported site on a platform Sync from live cannot read: its last step says what that means.
  const wpLine =
    imported === true && !SYNC_PLATFORMS.has(snapshot.platform ?? '') ? (
      <Notice severity="info" attrs={{ 'data-no-sync-imported': '1' }}>
        <p>{t('flow.wpImported')}</p>
      </Notice>
    ) : null
  const last = isLast ? wpLine : null
  // A sync started in the ZIP flow the person entered goes on to the export once it is in place
  // (the old "Sync from live, then export"). One started from "Sync from live" stays on its result.
  synced.current = () => {
    if (flow !== 'zip' || entered === 'menu-sync') return
    setStep('zip')
    setOpened(true)
    setRunPending(true)
  }
  const showBar = steps.length > 1
  const done = steps.slice(0, Math.max(0, at))
  return (
    <div
      className="tas-root tas-wizard-card tv-pub-wizard"
      data-publish-wizard="1"
      data-publish-kind={kind ?? undefined}
      data-publish-step={current}
    >
      {showBar && (
        <WizardSteps
          steps={steps.map((id) => ({ id, label: t(`flow.step.${id}`) }))}
          current={current}
          done={done}
          onStep={(id) => {
            // Sync to live's Review from its Confirm: back to the groups, nothing sent.
            if (flow === 'live' && id === 'push' && pushing.phase === 'confirm') pushing.backToReview()
            go(id as PublishStep)
          }}
          words={{
            nav: t('flow.steps'),
            position: (n, total) => t('flow.position', { n: String(n), total: String(total) }),
            allDone: ''
          }}
          positionLabel={t(`flow.name.${kind ?? 'choose'}`)}
        />
      )}
      {current === 'kind' && (
        <KindStep
          kinds={kinds}
          chosen={kind}
          onChoose={setKind}
          onContinue={() => {
            setEntered('flow')
            const chosen = stepsFor(factsFor('flow'), kind ?? 'online')
            go(chosen[chosen.indexOf('kind') + 1])
          }}
          t={t}
        />
      )}
      {current === 'address' && (
        <AddressStep
          snapshot={snapshot}
          siteName={siteName}
          control={control}
          door={door}
          onBack={back}
          onNext={next}
          last={last}
          ownDomainHint={
            owner && snapshot.addressChange?.allowed === true && !connectOff && door.domains.length === 0
          }
          ownDomainEditorNote={
            !owner && role !== null && role !== 'viewer' && !connectOff && door.domains.length === 0
          }
          t={t}
        />
      )}
      {current === 'domain' && (
        <DomainStep
          snapshot={snapshot}
          control={control}
          door={door}
          entry={!connectOff}
          onBack={back}
          onSkip={next}
          last={last}
          t={t}
        />
      )}
      {pushes && flow === 'live' && (current === 'push' || current === 'send') && (
        <PushStep page={current} live={pushing} onBack={back} t={t} />
      )}
      {live !== null && current === 'sync' && next && (
        <SyncStep live={live} onBack={back} onNext={next} t={t} />
      )}
      {owner && (opened || current === 'zip') && (
        <ZipHost
          siteKey={siteKey}
          syncs={live !== null && live.phase !== 'unavailable'}
          runPending={runPending}
          onRun={ranExport}
          t={t}
        >
          {(zip) => (current === 'zip' ? <ZipStep zip={zip} onBack={back} last={last} t={t} /> : null)}
        </ZipHost>
      )}
    </div>
  )
}
