/**
 * Sync to live, the flow of an imported Joomla or WordPress site whose changes go back to the live site
 * it came from (25/10/2026; the dialog of `@tracy/dsh-my-sites` it replaces said the same things):
 *
 *   Review  what happens first, the preview under way, then what Tracy would send, in groups;
 *           removals and PHP files only with their own tick, and what stays behind with why
 *   Send    Confirm with the count, the push under way, its result, and Undo asked once more
 *
 * What each page says follows the push door (`useLivePush`); which page is on screen follows its
 * phase (`pushStepOf`), so a push started from another tab or window lands on the right one. Nothing
 * on the live site changes before Confirm.
 */
import type { JSX, ReactNode } from 'react'
import { Button, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@tracy/ui'
import { ChevronRight } from 'lucide-react'
import type { Translate } from '../../team/translate'
import { agoText } from './sync-words'
import { Checklist, Notice, type PageFooter, StepPage, Working } from './page'
import {
  itemLine,
  itemName,
  PUSH_STAGES,
  type PushItem,
  type PushView,
  conflictGroups,
  pushFailureText,
  unsupportedReasonText,
  withNotes
} from './push-words'
import type { LivePush } from './use-live-push'

/** One list of changes, closed or open; `tick` puts one box under it (removals: all or none). */
function Group({
  id,
  title,
  hint,
  items,
  open,
  tick,
  fields = true,
  t
}: {
  t: Translate
  id: string
  title: string
  hint?: string
  items: PushItem[]
  open?: boolean
  /**
   * Name the fields of each change. False for Will add: a new record's every field is "changed", so the
   * list said nothing but its columns (dev, 25/10/2026: "note, urls, alias, catid, state, title, …").
   */
  fields?: boolean
  tick?: { label: string; checked: boolean; onTick: (on: boolean) => void; disabled: boolean; name?: string }
}): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <Collapsible className="tv-pub-collapse tv-pub-push-group" defaultOpen={open} data-push-group={id}>
      <CollapsibleTrigger className="tv-pub-collapse-trigger">
        <ChevronRight className="tv-pub-chevron" aria-hidden="true" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {hint && <p className="tv-pub-push-hint">{hint}</p>}
        <ul className="tv-pub-list tv-pub-kept">
          {items.map((item) => (
            <li key={item.id} data-push-item={item.id}>
              <strong>{itemName(item, t)}</strong>
              <span>
                {itemLine(item, t, fields)}
                {item.note ? ` · ${item.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {tick && (
          <label className="tv-pub-push-tick">
            <Checkbox
              checked={tick.checked}
              disabled={tick.disabled}
              data-push-tick={tick.name ?? 'remove'}
              {...(tick.name === undefined ? { 'data-push-remove': '' } : {})}
              onCheckedChange={(on: boolean) => tick.onTick(on === true)}
            />
            <span>{tick.label}</span>
          </label>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The stages of the phase under way, the one now marked: the wizard's running list. */
function Stages({ push, t }: { push: PushView; t: Translate }): JSX.Element {
  const stages = PUSH_STAGES[push.phase]
  const at = stages.indexOf((push.step ?? '') as never)
  return (
    <Checklist
      attrs={{ 'data-push-steps': '1' }}
      items={stages.map((stage, i) => ({
        id: stage,
        label: t(`push.stage.${stage}`),
        state: i < at ? 'done' : i === at || (at < 0 && i === 0) ? 'now' : 'next',
        attrs: {
          'data-push-step': stage,
          'data-push-step-state': i < at ? 'done' : i === at || (at < 0 && i === 0) ? 'now' : 'next'
        }
      }))}
    />
  )
}

/** The code a person can give support, with the host's one line of why when it sent one. */
function Code({ code, detail, t }: { code: string; detail?: string | null; t: Translate }): JSX.Element {
  return (
    <p className="tv-pub-small" data-push-code>
      {t('sync.status.code', { code: [code, detail].filter(Boolean).join(' — ') })}
    </p>
  )
}

/** Undo while the newest push can be undone: asked once more, since it writes the live site too. */
function UndoBlock({ live, t }: { live: LivePush; t: Translate }): JSX.Element | null {
  const target = live.undoTarget
  if (!target || live.running || live.phase === 'confirm') return null
  const busy = live.pressed || live.running
  return (
    <Notice
      severity={target.undoError ? 'error' : live.askUndo ? 'warning' : 'info'}
      title={live.askUndo ? t('push.undoConfirm') : undefined}
      attrs={{ 'data-push-undo': '1' }}
    >
      {target.id !== live.push?.id && (
        <p className="tv-pub-small">
          {t('push.lastPush', { when: agoText(target.pushedAt), count: target.result?.pushed.length ?? 0 })}
        </p>
      )}
      {target.undoError && <p>{pushFailureText(target.undoError, t, live.max, target.undoPhp)}</p>}
      {target.undoError && target.undoErrorDetail && (
        <Code code={target.undoError} detail={target.undoErrorDetail} t={t} />
      )}
      <div className="tv-pub-notice-actions">
        {live.askUndo ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              data-push-undo-now
              onClick={live.undo}
            >
              {t('push.undoNow')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => live.setAskUndo(false)}>
              {t('push.keep')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            data-push-undo-ask
            onClick={() => live.setAskUndo(true)}
          >
            {t('push.undo')}
          </Button>
        )}
      </div>
    </Notice>
  )
}

/** The groups of a preview: what goes (with its ticks), then what was found and stays. */
function PreviewGroups({ live, t }: { live: LivePush; t: Translate }): JSX.Element | null {
  const v = live.push?.preview
  if (!v) return null
  const { phase } = live
  const locked = phase === 'confirm' || live.pressed || live.running
  const goes = phase === 'review' || phase === 'confirm'
  return (
    <>
      {goes && (
        <div className="tv-pub-push-groups" data-push-preview>
          <Group
            t={t}
            id="add"
            title={t('push.group.add', { count: v.add.length })}
            items={v.add}
            open
            fields={false}
          />
          <Group
            t={t}
            id="change"
            title={t('push.group.change', { count: v.change.length })}
            items={v.change}
            open
          />
          <Group
            t={t}
            id="files"
            title={t('push.group.files', { count: v.files?.length ?? 0 })}
            hint={t('push.group.filesHint')}
            items={withNotes(v.files ?? [], t, v.platform)}
            open
          />
          <Group
            t={t}
            id="settings"
            title={t('push.group.settings', { count: v.settings?.length ?? 0 })}
            items={v.settings ?? []}
            open
          />
          <Group
            t={t}
            id="php"
            title={t('push.group.php', { count: v.php?.length ?? 0 })}
            hint={t('push.group.phpHint')}
            items={withNotes(v.php ?? [], t, v.platform)}
            open
            tick={{
              name: 'php',
              label: t('push.sendPhp', { count: v.php?.length ?? 0 }),
              checked: live.phpTicked,
              disabled: locked,
              onTick: live.setPhpTicked
            }}
          />
          <Group
            t={t}
            id="remove"
            title={t('push.group.remove', { count: v.remove.length })}
            hint={t('push.group.removeHint')}
            items={withNotes(v.remove, t, v.platform)}
            open
            tick={{
              label: t('push.removeAll', { count: v.remove.length }),
              checked: live.ticked,
              disabled: locked,
              onTick: live.setTicked
            }}
          />
          {/* Over the host's limit: the first ones go now, in order, and the rest next time. */}
          {live.counts.total > live.max && (
            <p className="tv-pub-small" data-push-over-limit>
              {t('push.overLimit', { max: live.max })}
            </p>
          )}
        </div>
      )}
      <div className="tv-pub-push-groups">
        <Group
          t={t}
          id="liveChanged"
          title={t('push.group.liveChanged', { count: v.liveChanged.length })}
          hint={t('push.group.liveChangedHint')}
          items={v.liveChanged}
        />
        {v.unsupported.length > 0 && (
          <Group
            t={t}
            id="unsupported"
            title={t('push.group.unsupported', { count: v.unsupportedTotal })}
            hint={t('push.group.unsupportedHint')}
            items={v.unsupported.map((u, i) => ({
              id: `u${i}`,
              kind: u.kind,
              title: u.name || null,
              note: unsupportedReasonText(u.reason, t, { platform: v.platform, limit: u.limit }),
              ...(u.size !== undefined && u.reason === 'too-large' ? { size: u.size } : {})
            }))}
          />
        )}
      </div>
    </>
  )
}

/** Review: what happens first, the preview under way, and what it found. */
function ReviewPage({ live, onBack, t }: { live: LivePush; onBack?: () => void; t: Translate }): JSX.Element {
  const { phase, push } = live
  const busy = live.pressed || live.running
  const failure = live.error || (phase === 'failed' ? (push?.error ?? '') : '')
  const footer: PageFooter = { onBack }
  const again = {
    label: t('push.previewAgain'),
    onPress: live.preview,
    busy: live.pressed,
    attrs: { 'data-push-go': '1' }
  }
  if (phase === 'ready')
    footer.primary = {
      label: t('push.preview'),
      onPress: live.preview,
      busy: live.pressed,
      attrs: { 'data-push-go': '1' }
    }
  if (phase === 'failed' || phase === 'expired' || phase === 'nothing') footer.primary = again
  if (phase === 'review')
    footer.primary = {
      label: t('push.continue'),
      onPress: live.toConfirm,
      disabled: busy || live.counts.total === 0,
      attrs: { 'data-push-go': '1' }
    }
  let state: ReactNode = null
  if (phase === 'loading') state = <Working words={t('sync.status.loading')} />
  if (phase === 'unreadable')
    state = (
      <Notice severity="error" title={t('push.status.unreadable')}>
        <p>{t('push.status.unreadableBody', { error: live.unreadable })}</p>
        <div className="tv-pub-notice-actions">
          <Button type="button" size="sm" variant="outline" onClick={live.load}>
            {t('sync.retry')}
          </Button>
        </div>
      </Notice>
    )
  if (phase === 'unavailable')
    state = (
      <Notice severity="info" title={t('push.status.unavailable')}>
        <p>{t(`push.why.${live.answer?.why || 'not-imported'}`)}</p>
      </Notice>
    )
  if (phase === 'ready')
    state = (
      <Notice severity="info" title={t('push.status.ready')}>
        <p>{t('push.status.readyBody')}</p>
      </Notice>
    )
  if (phase === 'previewing' && push)
    state = (
      <>
        <Working words={t('push.status.previewing')}>
          <p>{t('push.status.runningBody')}</p>
        </Working>
        <Stages push={push} t={t} />
      </>
    )
  if (phase === 'held')
    state = (
      <Notice severity="warning" title={t('push.status.held')}>
        <p>{t('push.status.heldBody')}</p>
      </Notice>
    )
  if (phase === 'review')
    state = (
      <Notice severity="info" title={t('push.status.review')}>
        <p>{t('push.status.reviewBody')}</p>
      </Notice>
    )
  if (phase === 'nothing')
    state = (
      <Notice severity="success" title={t('push.status.nothing')}>
        <p>{t('push.status.nothingBody')}</p>
      </Notice>
    )
  if (phase === 'expired')
    state = (
      <Notice severity="info" title={t('push.status.expired')}>
        <p>{t('push.status.expiredBody')}</p>
      </Notice>
    )
  if (phase === 'failed')
    state = (
      <Notice severity="error" title={t('push.status.failed')}>
        <p>{pushFailureText(failure, t, live.max, live.error ? null : push?.php)}</p>
        {failure && <Code code={failure} detail={live.error ? null : push?.errorDetail} t={t} />}
      </Notice>
    )
  return (
    <StepPage
      step="push"
      title={t('push.dialogTitle')}
      desc={t('push.dialogBody')}
      footer={footer}
      focusKey={phase}
      attrs={{ 'data-live-push': '1', 'data-live-push-phase': phase }}
      t={t}
    >
      {state}
      {live.error && phase !== 'failed' && (
        <Notice severity="error" attrs={{ 'data-push-error': '1' }}>
          <p>{pushFailureText(live.error, t, live.max)}</p>
          <Code code={live.error} t={t} />
        </Notice>
      )}
      {(phase === 'review' || phase === 'nothing') && <PreviewGroups live={live} t={t} />}
      <UndoBlock live={live} t={t} />
    </StepPage>
  )
}

/** Send: Confirm, the push under way, its result, its undo. */
function SendPage({ live, t }: { live: LivePush; t: Translate }): JSX.Element {
  const { phase, push } = live
  const busy = live.pressed || live.running
  const failure = live.error || (phase === 'failed' ? (push?.error ?? '') : '')
  const footer: PageFooter = {}
  if (phase === 'confirm') {
    footer.onBack = busy ? undefined : live.backToReview
    footer.primary = {
      label: t('push.confirm'),
      onPress: live.confirm,
      disabled: busy,
      busy: live.pressed,
      attrs: { 'data-push-go': '1', 'data-push-phase': 'confirm' }
    }
  }
  // While the host works, the running list says so: no button that cannot act.
  if (phase === 'pushed' || phase === 'undone' || phase === 'failed')
    footer.primary = {
      label: t('push.previewAgain'),
      onPress: live.preview,
      disabled: busy,
      busy: live.pressed,
      attrs: { 'data-push-go': '1' }
    }
  const v = push?.preview ?? null
  const partial = phase === 'pushed' && push?.state === 'failed'
  // Nothing reached the live site (each change open in an editor there, changed there, or left out):
  // said as that, never as a success with "0 changes" (dev, 26/10/2026).
  const sent = push?.result?.pushed.length ?? 0
  const notSent = conflictGroups(push?.result?.conflicts ?? [], t)
  let state: ReactNode = null
  if (phase === 'confirm')
    state = (
      <Notice severity="warning" title={t('push.status.confirm')}>
        <p>
          {t('push.status.confirmBody', {
            count: live.counts.total,
            add: live.counts.add,
            change: live.counts.change,
            remove: live.counts.remove
          })}
        </p>
      </Notice>
    )
  if ((phase === 'pushing' || phase === 'undoing') && push)
    state = (
      <>
        <Working words={t(phase === 'pushing' ? 'push.status.pushing' : 'push.status.undoing')}>
          <p>{t('push.status.runningBody')}</p>
        </Working>
        <Stages push={push} t={t} />
      </>
    )
  if (phase === 'pushed')
    state = partial ? (
      <Notice severity="error" title={t('push.status.partial')}>
        <p>{t('push.status.partialBody', { count: push?.result?.pushed.length ?? 0 })}</p>
        {push?.error === 'LIVE_PHP_TOO_OLD' && <p>{pushFailureText(push.error, t, live.max, push.php)}</p>}
        {push?.error && <Code code={push.error} detail={push.errorDetail} t={t} />}
      </Notice>
    ) : sent === 0 ? (
      <Notice
        severity="warning"
        title={t('push.status.nothingSent')}
        attrs={{ 'data-push-nothing-sent': '1' }}
      >
        <p>{t(notSent.open.length ? 'push.status.nothingSentOpen' : 'push.status.nothingSentBody')}</p>
      </Notice>
    ) : (
      <Notice severity="success" title={t('push.status.pushed')}>
        <p>
          {t('push.status.pushedBody', {
            count: push?.result?.pushed.length ?? 0,
            when: agoText(push?.pushedAt)
          })}
        </p>
      </Notice>
    )
  if (phase === 'undone')
    state = (
      <Notice severity="success" title={t('push.status.undone')}>
        <p>{t('push.status.undoneBody', { count: push?.undo?.restored.length ?? 0 })}</p>
      </Notice>
    )
  if (phase === 'failed')
    state = (
      <Notice severity="error" title={t('push.status.failed')}>
        <p>{pushFailureText(failure, t, live.max, live.error ? null : push?.php)}</p>
        {failure && <Code code={failure} detail={live.error ? null : push?.errorDetail} t={t} />}
      </Notice>
    )
  return (
    <StepPage
      step="send"
      title={t('flow.send.title')}
      desc={t('flow.send.desc')}
      footer={footer}
      focusKey={phase}
      attrs={{ 'data-live-push': '1', 'data-live-push-phase': phase }}
      t={t}
    >
      {state}
      {live.error && phase !== 'failed' && (
        <Notice severity="error" attrs={{ 'data-push-error': '1' }}>
          <p>{pushFailureText(live.error, t, live.max)}</p>
          <Code code={live.error} t={t} />
        </Notice>
      )}
      {phase === 'confirm' && v && <PreviewGroups live={live} t={t} />}
      {phase === 'pushed' && push?.result && (
        <div className="tv-pub-push-groups" data-push-result>
          <Group
            t={t}
            id="pushed"
            title={t('push.result.pushed', { count: push.result.pushed.length })}
            items={withNotes(push.result.pushed, t, push.preview?.platform)}
          />
          <Group
            t={t}
            id="open"
            title={t('push.result.open', { count: notSent.open.length })}
            hint={t('push.result.openHint')}
            items={notSent.open}
            fields={false}
            open
          />
          <Group
            t={t}
            id="conflicts"
            title={t('push.result.conflicts', { count: notSent.changed.length })}
            hint={t('push.result.conflictsHint')}
            items={notSent.changed}
            open
          />
          <Group
            t={t}
            id="failed"
            title={t('push.result.failed', { count: push.result.failed.length })}
            items={withNotes(push.result.failed, t, push.preview?.platform)}
            open
          />
          <Group
            t={t}
            id="skipped"
            title={t('push.result.skipped', { count: push.result.skipped.length })}
            hint={t('push.result.skippedHint')}
            items={push.result.skipped}
          />
        </div>
      )}
      {phase === 'undone' && push?.undo && (
        <div className="tv-pub-push-groups" data-push-undone>
          <Group
            t={t}
            id="undoConflicts"
            title={t('push.undo.conflicts', { count: push.undo.conflicts.length })}
            hint={t('push.undo.conflictsHint')}
            items={withNotes(push.undo.conflicts, t, push.preview?.platform)}
            open
          />
          <Group
            t={t}
            id="undoFailed"
            title={t('push.undo.failed', { count: push.undo.failed.length })}
            items={withNotes(push.undo.failed, t, push.preview?.platform)}
            open
          />
        </div>
      )}
      <UndoBlock live={live} t={t} />
    </StepPage>
  )
}

export function PushStep({
  page,
  live,
  onBack,
  t
}: {
  page: 'push' | 'send'
  live: LivePush
  /** Review's Back: to where the flow starts (the kind). */
  onBack?: () => void
  t: Translate
}): JSX.Element {
  return page === 'send' ? <SendPage live={live} t={t} /> : <ReviewPage live={live} onBack={onBack} t={t} />
}
