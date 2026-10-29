/**
 * Sync from your original site, the step right before the last of each flow on an imported Joomla
 * or WordPress site. What it says follows the sync door (`useLiveSync`); its footer follows what can be done
 * now. Skip goes on without syncing and records nothing.
 */
import { type JSX, useEffect, useState } from 'react'
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@tracy/ui'
import { ChevronRight } from 'lucide-react'
import { interfaceLocale } from '../../interface-languages/index.mjs'
import type { Translate } from '../../team/translate'
import {
  agoText,
  busyPartsText,
  droppedReason,
  durationText,
  failureText,
  heldText,
  STAGES,
  sideText,
  stageSeconds,
  whereText
} from './sync-words'
import { broughtChanges } from './live-sync-follow'
import type { LiveSync, SyncConflict } from './use-live-sync'
import { Checklist, Notice, type PageFooter, StepPage, Working } from './page'

/** Both sides of a kept place, one line each. */
function Sides({ c, t }: { c: SyncConflict; t: Translate }): JSX.Element {
  return (
    <>
      <span>
        {t('sync.keptTracy')} {sideText(c, 'ours', t('sync.deleted'))}
      </span>
      <span>
        {t('sync.keptLive')} {sideText(c, 'theirs', t('sync.deleted'))}
      </span>
    </>
  )
}

/** What a kept place says under its name, by its kind. */
function KeptBody({ c, t }: { c: SyncConflict; t: Translate }): JSX.Element {
  // A file has no field to quote: say what was kept of it.
  if (c.kind === 'file')
    return <span>{t(c.reason === 'both-changed' ? 'sync.keptFileLines' : 'sync.keptFile')}</span>
  // A whole table has no one value either (its rows could not be matched, or its shape changed).
  if (c.kind === 'table') return <span>{t('sync.keptTable')}</span>
  if (c.kind === 'order')
    return (
      <>
        <span>{t('sync.keptOrder')}</span>
        <Sides c={c} t={t} />
      </>
    )
  // Inside a JSON column: each key both changed, with both values, never the whole JSON.
  if (c.fieldValues?.length)
    return (
      <ul className="tv-pub-list tv-pub-kept-fields">
        {c.fieldValues.map((f) => (
          <li key={f.path} data-kept-field={f.path}>
            <strong>{f.path}</strong>
            <span>
              {t('sync.keptTracy')} {f.ours ?? t('sync.deleted')}
            </span>
            <span>
              {t('sync.keptLive')} {f.theirs ?? t('sync.deleted')}
            </span>
          </li>
        ))}
      </ul>
    )
  return <Sides c={c} t={t} />
}

export function SyncStep({
  live,
  onBack,
  onNext,
  t
}: {
  live: LiveSync
  onBack?: () => void
  /** On to the flow's last step, synced or not. */
  onNext: () => void
  t: Translate
}): JSX.Element {
  const { phase, sync } = live
  // Re-render each half minute so "5 minutes ago" stays true while the step is open.
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])
  const failure = live.error || sync?.error || ''
  const files = (sync?.summary?.files?.fromTheirs ?? 0) + (sync?.summary?.files?.merged ?? 0)
  const db = sync?.summary?.database
  // Records a person edits (the host's `records`): a title changed on the live site is one, the
  // version and log rows its CMS wrote with it none. A host before 27/10/2026 sent row counts only.
  const records =
    typeof db?.records === 'number'
      ? db.records
      : (db?.rowsFromTheirs ?? 0) + (db?.rowsMerged ?? 0) + (db?.rowsDeleted ?? 0)
  // Anything at all came, a whole table taken included: a title the live site changed in a table the
  // copy left alone came over, and the step said nothing had changed (dev, 26/10/2026).
  const brought = broughtChanges(sync?.summary)
  const stageAt = STAGES.indexOf((sync?.step ?? '') as (typeof STAGES)[number])
  const took = stageSeconds(sync?.timing, sync?.startedAt)
  // Content records only: a log row both sites wrote under one number is not one the owner lost.
  const dropped = (sync?.dropped ?? []).filter((d) => d.reason !== 'log-added-both')
  const notCarried = sync?.notCarried ?? null
  const busyParts = failure === 'LIVE_BUSY' ? busyPartsText(sync?.busy?.parts, t) : ''
  const footer: PageFooter = {}
  if (phase !== 'running' || !live.starting) footer.onBack = onBack
  if (phase === 'unreadable' || phase === 'held' || phase === 'never' || phase === 'failed')
    footer.onSkip = onNext
  if (phase === 'running' && !live.starting) footer.onSkip = onNext
  if (phase === 'unavailable' || phase === 'applied')
    footer.primary = { label: t('flow.continue'), onPress: onNext, attrs: { 'data-publish-next': '1' } }
  if (phase === 'never')
    footer.primary = {
      label: t('sync.now'),
      onPress: () => live.start(false),
      attrs: { 'data-sync-now': '1' }
    }
  if (phase === 'failed')
    footer.primary = {
      label: t('sync.retry'),
      onPress: () => live.start(false),
      attrs: { 'data-sync-now': '1' }
    }
  return (
    <StepPage
      step="sync"
      title={t('flow.sync.title')}
      desc={t('flow.sync.desc')}
      footer={footer}
      attrs={{ 'data-live-sync': '1', 'data-live-sync-phase': phase }}
      t={t}
    >
      {phase === 'loading' && <Working words={t('sync.status.loading')} />}
      {phase === 'unreadable' && (
        <Notice severity="error" title={t('sync.status.unreadable')}>
          <p>{t('sync.status.unreadableBody', { error: live.unreadable })}</p>
          <div className="tv-pub-notice-actions">
            <Button type="button" size="sm" variant="outline" onClick={live.load}>
              {t('sync.retry')}
            </Button>
          </div>
        </Notice>
      )}
      {phase === 'unavailable' && (
        <Notice severity="info" title={t('sync.status.unavailable')}>
          <p>{t(`sync.why.${live.why || 'not-imported'}`)}</p>
        </Notice>
      )}
      {phase === 'never' && (
        <Notice severity="info" title={t('sync.status.never')}>
          <p>{t('sync.status.neverBody')}</p>
        </Notice>
      )}
      {phase === 'running' && (
        <>
          <Working words={t('sync.status.running')}>
            <p>{t('sync.status.runningBody')}</p>
          </Working>
          <Checklist
            attrs={{ 'data-live-sync-steps': '1' }}
            items={STAGES.map((stage, i) => {
              const state = i < stageAt ? 'done' : i === stageAt || (stageAt < 0 && i === 0) ? 'now' : 'next'
              const seconds = took[stage]
              return {
                id: stage,
                label: t(`sync.stage.${stage}`),
                state,
                note: seconds !== undefined && state !== 'next' ? durationText(seconds) : undefined,
                attrs: {
                  'data-live-sync-step': stage,
                  'data-live-sync-step-seconds': seconds === undefined ? undefined : String(seconds)
                }
              }
            })}
          />
          {sync?.startedAt && (
            <p className="tv-pub-line tv-pub-small">
              {t('sync.status.started', { when: agoText(sync.startedAt) })}
            </p>
          )}
        </>
      )}
      {phase === 'applied' && (
        <Notice severity="success" title={t('sync.status.upToDate')}>
          <p
            title={sync?.liveReadAt ? new Date(sync.liveReadAt).toLocaleString(interfaceLocale()) : undefined}
          >
            {t('sync.status.upToDateBody', { when: agoText(sync?.liveReadAt) })}
          </p>
          {sync?.summary && (
            <p className="tv-pub-small" data-live-sync-brought>
              {!brought
                ? t('sync.status.nothingNew')
                : files + records === 0
                  ? t('sync.status.broughtSmall')
                  : t('sync.status.brought', { files: String(files), records: String(records) })}
            </p>
          )}
          <div className="tv-pub-notice-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-sync-again
              onClick={() => live.start(false)}
            >
              {t('sync.again')}
            </Button>
          </div>
        </Notice>
      )}
      {phase === 'held' && (
        <Notice severity="warning" title={t('sync.status.held')}>
          <p>{t('sync.held', { count: String(sync?.held?.length ?? 0) })}</p>
          {(sync?.held?.length ?? 0) > 0 && (
            <ul className="tv-pub-list" data-live-sync-held>
              {sync?.held?.map((h) => (
                <li key={h.id} data-held={h.id}>
                  {heldText(h, t)}
                </li>
              ))}
            </ul>
          )}
          <div className="tv-pub-notice-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-sync-allow-held
              onClick={() => live.start(true)}
            >
              {t('sync.allowHeld')}
            </Button>
          </div>
        </Notice>
      )}
      {phase === 'failed' && (
        <Notice severity="error" title={t('sync.status.failed')}>
          <p>{failureText(failure, t)}</p>
          {busyParts && (
            <p className="tv-pub-small" data-live-sync-busy>
              {busyParts}
            </p>
          )}
          {failure && (
            <p className="tv-pub-small" data-live-sync-code>
              {t('sync.status.code', { code: failure })}
            </p>
          )}
        </Notice>
      )}
      {phase === 'applied' && sync && sync.kept.length > 0 && (
        <Collapsible className="tv-pub-collapse" data-live-sync-kept>
          <CollapsibleTrigger className="tv-pub-collapse-trigger">
            <ChevronRight className="tv-pub-chevron" aria-hidden="true" />
            {t('sync.kept', { count: String(sync.kept.length) })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="tv-pub-list tv-pub-kept">
              {sync.kept.map((c) => (
                <li key={c.id} data-kept={c.id}>
                  <strong>{whereText(c, t)}</strong>
                  <KeptBody c={c} t={t} />
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {phase === 'applied' &&
        notCarried &&
        (notCarried.triggers.length > 0 || notCarried.tables.length > 0) && (
          <Notice severity="info" title={t('sync.notCarried')} attrs={{ 'data-live-sync-not-carried': '1' }}>
            {notCarried.triggers.length > 0 && (
              <p>
                {t('sync.notCarriedTriggers', { names: notCarried.triggers.map((x) => x.name).join(', ') })}
              </p>
            )}
            {notCarried.tables.length > 0 && (
              <p>{t('sync.notCarriedTables', { names: notCarried.tables.join(', ') })}</p>
            )}
          </Notice>
        )}
      {phase === 'applied' && dropped.length > 0 && (
        <Collapsible className="tv-pub-collapse" data-live-sync-dropped>
          <CollapsibleTrigger className="tv-pub-collapse-trigger">
            <ChevronRight className="tv-pub-chevron" aria-hidden="true" />
            {t('sync.dropped', { count: String(dropped.length) })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="tv-pub-list tv-pub-kept">
              {dropped.map((d) => (
                <li key={d.id} data-dropped={d.id}>
                  <strong>{heldText(d, t)}</strong>
                  {d.values?.theirs && (
                    <span>
                      {t('sync.keptLive')} {sideText(d, 'theirs', t('sync.deleted'))}
                    </span>
                  )}
                  <span>{droppedReason(d, t)}</span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </StepPage>
  )
}
