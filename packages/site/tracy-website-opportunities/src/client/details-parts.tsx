/**
 * Parts of the Details page (#517) that used to live in the Inspector: a titled section card and the Sources table of
 * the Workspace card (source and state, option C of #537). The table is the whole of Sources: a failed row offers Try
 * again under its pill, and a link the owner pasted can be removed from its row.
 */
import { interfaceLocale } from '@tracy/core/interface-languages'
import { X } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { Spinner } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import { sourceLabel } from './cms-label.ts'
import { pastedLinkOf } from './source-groups.ts'
import { safeHttpUrl, shortUrl } from './source-links-model.ts'
import { SourceLogo } from './source-logo.tsx'
import { type RemoveNotice, type RemoveStep, noticeLineKey, removableLinkOf } from './source-remove-model.ts'
import { type SourceProgress, type SourceState, sourceStateOf } from './source-table-model.ts'
import { type StepNodeState, SubStepNode } from './step-node.tsx'
import { type ShownSource, type SourceInput, isShownSource, sourceRow } from './status.ts'
import type { Translate } from './strings.ts'
export function Section({
  title,
  aside,
  tint = false,
  bare = false,
  children
}: {
  title: string
  aside?: ReactNode
  tint?: boolean
  /** Drawn inside a page section that already carries the title: the content alone, no card. */
  bare?: boolean
  children: ReactNode
}): JSX.Element {
  if (bare) return <>{children}</>
  return (
    <section className={cn('tracy-wo-insp-sec', tint && 'is-tint')} aria-label={title}>
      <div className="tracy-wo-insp-sec-head">
        <h3 className="tracy-wo-h3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Retry on one source row: `busy` is being asked for, `failed` did not start. */
export interface SourceRetry {
  busy: ShownSource | null
  failed: ShownSource | null
  onPress: (source: ShownSource) => void
}

/** Remove on a pasted source row: the row asked about or being removed, and the line left by a press that did not. */
export interface SourceRemove {
  step: RemoveStep
  notice: RemoveNotice | null
  onAsk: (url: string) => void
  onKeep: () => void
  onConfirm: () => void
}

/** The band node each row state is drawn with (the same node as the Progress band's sub-steps). */
const NODE_OF: Readonly<Record<SourceState, StepNodeState>> = {
  waiting: 'waiting',
  new: 'waiting',
  reading: 'running',
  collected: 'done',
  failed: 'failed'
}

/**
 * The Sources table of the Workspace card (#537, option C): one line per source (glyph, name, the link as an anchor,
 * then the state pill on the right with its date or reason under it). A failed row the page can retry offers Try
 * again under the pill; a link the owner pasted has a remove control after the pill, which asks on the row first.
 */
export function SourcesTable({
  t,
  sources,
  researched,
  progress,
  retry,
  remove
}: {
  t: Translate
  sources: SourceInput[]
  /** This card's research has finished and does not run again now (`source-table-model.ts sourceStateOf`). */
  researched: boolean
  /** The band's research items by source key while research runs (`sourceProgressOf`); none: rows keep their own state. */
  progress?: SourceProgress
  /** Absent where the page cannot start a research: no Try again is drawn. */
  retry?: SourceRetry
  /** Absent where the page cannot remove a source: no remove control is drawn. */
  remove?: SourceRemove
}): JSX.Element {
  const locale = interfaceLocale() ?? 'en'
  const links = new Set(sources.map(removableLinkOf).filter((l): l is string => l !== null))
  // A notice whose row went with the reload (Already gone) stays at the foot of the table.
  const orphan = remove?.notice != null && !links.has(remove.notice.url) ? remove.notice : null
  const noticeLine = (notice: RemoveNotice): JSX.Element => (
    <p className="tracy-wo-error tracy-wo-stab-notice" role="alert">
      {t(noticeLineKey(notice, links.has(notice.url)))}
    </p>
  )
  if (sources.length === 0)
    return (
      <>
        <p className="tracy-wo-muted">{t('inspector.noSources')}</p>
        {orphan !== null ? noticeLine(orphan) : null}
      </>
    )
  return (
    <ul className="tracy-wo-stab" aria-label={t('details.section.sources')}>
      {sources.map((s) => {
        const pastedLink = pastedLinkOf(s)
        const link = safeHttpUrl(pastedLink) ?? safeHttpUrl(s.ref)
        const view = sourceStateOf(s, researched, locale, progress)
        const detail =
          view.detail === null ? null : 'text' in view.detail ? view.detail.text : t(view.detail.key)
        const name = sourceLabel(t, s.source, pastedLink ?? s.ref)
        const row = sourceRow(s)
        const retrySource: ShownSource | null =
          retry !== undefined && view.state === 'failed' && row.retryable && isShownSource(row.source)
            ? row.source
            : null
        const removeUrl = remove === undefined ? null : removableLinkOf(s)
        const step = removeUrl !== null && remove?.step?.url === removeUrl ? remove.step.phase : null
        const notice = removeUrl !== null && remove?.notice?.url === removeUrl ? remove.notice : null
        return (
          <li
            key={`${s.source}:${s.pastedLink ?? s.ref ?? ''}`}
            className="tracy-wo-stab-row"
            data-state={view.state}
            data-pending={step === 'pending' ? '' : undefined}
            aria-busy={step === 'pending' ? true : undefined}
          >
            <span className="tracy-wo-stab-line">
              <SourceLogo source={s.source} href={link ?? s.ref} />
              <span className="tracy-wo-stab-name">{name}</span>
              {link !== null ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link}
                  className="tracy-wo-src-link tracy-wo-stab-link"
                >
                  {shortUrl(link)}
                </a>
              ) : null}
              {step === 'confirm' && remove !== undefined ? (
                <span className="tracy-wo-stab-state tracy-wo-stab-ask">
                  <span>{t('source.remove.ask')}</span>
                  <span className="tracy-wo-stab-acts">
                    <button
                      type="button"
                      className="tracy-wo-stab-act"
                      data-danger=""
                      onClick={remove.onConfirm}
                    >
                      {t('source.remove.confirm')}
                    </button>
                    <button type="button" className="tracy-wo-stab-act" onClick={remove.onKeep}>
                      {t('source.remove.keep')}
                    </button>
                  </span>
                </span>
              ) : step === 'pending' ? (
                <span className="tracy-wo-stab-state">
                  <Spinner label={t('source.remove.removing')} />
                </span>
              ) : (
                <span className="tracy-wo-stab-state">
                  <span className="tracy-wo-stab-pill" data-state={view.state}>
                    <SubStepNode state={NODE_OF[view.state]} label={t(view.key)} />
                    <span className="tracy-wo-stab-word">{t(view.key)}</span>
                  </span>
                  {detail !== null ? <span className="tracy-wo-stab-detail">{detail}</span> : null}
                  {retrySource !== null && retry !== undefined ? (
                    <button
                      type="button"
                      className="tracy-wo-stab-act"
                      disabled={retry.busy === retrySource}
                      onClick={() => retry.onPress(retrySource)}
                    >
                      {t('action.retry')}
                    </button>
                  ) : null}
                  {retrySource !== null && retry?.failed === retrySource ? (
                    <span className="tracy-wo-error tracy-wo-stab-detail" role="alert">
                      {t('source.retryFailed')}
                    </span>
                  ) : null}
                </span>
              )}
              {removeUrl !== null && remove !== undefined && step !== 'confirm' ? (
                <button
                  type="button"
                  className={cn('tracy-wo-stab-remove', step === 'pending' && 'is-on')}
                  aria-label={t('source.remove.label', { name })}
                  disabled={step === 'pending'}
                  onClick={() => remove.onAsk(removeUrl)}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </span>
            {notice !== null ? noticeLine(notice) : null}
          </li>
        )
      })}
      {orphan !== null ? <li className="tracy-wo-stab-foot">{noticeLine(orphan)}</li> : null}
    </ul>
  )
}
