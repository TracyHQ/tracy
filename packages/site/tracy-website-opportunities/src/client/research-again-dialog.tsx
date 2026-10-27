/**
 * Research again on the place card (Steps › Research) and the public Find: a button, a line saying how many
 * parts need a new look, and a dialog listing what will run, why and the most it may cost, what is kept, and
 * who pays. The same view for both; only the doors behind `useResearchAgain` differ.
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner
} from '@tracy/ui'

import { sourceLabel } from './cms-label.ts'
import { type AgainPreview, againRefusalKey, againView, readAgainPreview } from './research-again.ts'
import type { Translate } from './strings.ts'

/** A door's answer, as `api.ts` settles it. */
type Settled = { ok: true; body: unknown } | { ok: false; code: string }

export interface AgainControl {
  /** `idle`: not asked yet (the public Find asks on the first press). */
  phase: 'idle' | 'loading' | 'ready' | 'failed'
  preview: AgainPreview | null
  open: boolean
  busy: boolean
  errorKey: string | null
  onOpen(): void
  onClose(): void
  onConfirm(): void
}

/**
 * `key` changes (another place, or its research moved on) ask the preview again when `eager`; otherwise the
 * first press asks. `start` answers ok once a run is queued or joined; `after` then refreshes the page.
 */
export function useResearchAgain({
  key,
  eager,
  load,
  start,
  after
}: {
  key: string | null
  eager: boolean
  load: () => Promise<Settled>
  start: () => Promise<{ ok: true } | { ok: false; code: string }>
  after?: () => unknown
}): AgainControl {
  const [phase, setPhase] = useState<AgainControl['phase']>('idle')
  const [preview, setPreview] = useState<AgainPreview | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const asked = useRef(0)
  const doors = useRef({ load, start, after })
  doors.current = { load, start, after }

  const ask = async (): Promise<void> => {
    const turn = ++asked.current
    setPhase('loading')
    const answer = await doors.current.load()
    if (turn !== asked.current) return
    const read = answer.ok ? readAgainPreview(answer.body) : null
    setPreview(read)
    setPhase(read ? 'ready' : 'failed')
    if (!answer.ok) setErrorKey(againRefusalKey(answer.code))
  }

  useEffect(() => {
    setPreview(null)
    setPhase('idle')
    setErrorKey(null)
    setOpen(false)
    if (key !== null && eager) void ask()
  }, [key, eager])

  return {
    phase,
    preview,
    open,
    busy,
    errorKey,
    onOpen: () => {
      setErrorKey(null)
      setOpen(true)
      if (phase !== 'ready' && phase !== 'loading') void ask()
    },
    onClose: () => {
      if (!busy) setOpen(false)
    },
    onConfirm: () => {
      if (busy) return
      void (async () => {
        setBusy(true)
        setErrorKey(null)
        const answer = await doors.current.start()
        setBusy(false)
        if (answer.ok) {
          setOpen(false)
          await doors.current.after?.()
          void ask()
          return
        }
        setErrorKey(againRefusalKey(answer.code))
        // Nothing due any more, or the limit moved: show the plan as it is now.
        if (answer.code === 'NOTHING_DUE' || answer.code === 'RESEARCH_AGAIN_LIMIT') void ask()
      })()
    }
  }
}

const dueKey = (count: number, locale?: string): string =>
  new Intl.PluralRules(locale).select(count) === 'one' ? 'again.due.one' : 'again.due.other'

/** The button with its line; draws nothing for a place that was never researched. */
export function ResearchAgainButton({
  t,
  locale,
  name,
  control
}: {
  t: Translate
  locale?: string
  /** The place's name, for the dialog's question. */
  name: string
  control: AgainControl
}): JSX.Element | null {
  const { phase, preview } = control
  if (phase === 'ready' && preview?.plan === null) return null
  const due = preview?.plan ? preview.plan.run.length : null
  const closed = phase === 'ready' && preview !== null && !preview.open
  const upToDate = due === 0
  return (
    <div className="tracy-wo-again">
      <span className="tracy-wo-row tracy-wo-wrap">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={upToDate || closed || phase === 'loading'}
          onClick={control.onOpen}
        >
          <RefreshCw aria-hidden="true" />
          {t(upToDate ? 'again.upToDate' : 'again.button')}
        </Button>
        {due !== null && due > 0 && !closed ? (
          <span className="tracy-wo-muted tracy-wo-small">{t(dueKey(due, locale), { count: due })}</span>
        ) : null}
        {closed ? (
          <span className="tracy-wo-muted tracy-wo-small">
            {t(preview.payer === 'tracy' ? 'again.closed.public' : 'again.closed.account')}
          </span>
        ) : null}
      </span>
      <ResearchAgainDialog t={t} locale={locale} name={name} control={control} />
    </div>
  )
}

/** The dialog's words: Research again by default; Read menu again limits it to the menu parts. */
export interface AgainCopy {
  titleKey: string
  leadKey: string
  buttonKey: string
  /** The note on pages found by a web search; irrelevant when no search can run. */
  pagesNote: boolean
}

const RESEARCH_AGAIN_COPY: AgainCopy = {
  titleKey: 'again.title',
  leadKey: 'again.lead',
  buttonKey: 'again.button',
  pagesNote: true
}

export function ResearchAgainDialog({
  t,
  locale,
  name,
  control,
  copy = RESEARCH_AGAIN_COPY
}: {
  t: Translate
  locale?: string
  name: string
  control: AgainControl
  copy?: AgainCopy
}): JSX.Element {
  const { preview, phase, busy, errorKey } = control
  const view = preview?.plan ? againView(preview.plan, locale) : null
  const canRun = view !== null && view.due > 0 && preview?.open === true && !busy
  const label = (part: string) => sourceLabel(t, part)
  return (
    <Dialog open={control.open} onOpenChange={(open) => (open ? undefined : control.onClose())}>
      <DialogContent className="tracy-wo tracy-wo-again-dialog" closeLabel={t('again.cancel')}>
        <DialogHeader>
          <DialogTitle>{t(copy.titleKey, { name })}</DialogTitle>
          <DialogDescription>{t(copy.leadKey)}</DialogDescription>
        </DialogHeader>
        {phase === 'loading' || phase === 'idle' ? (
          <span className="tracy-wo-row">
            <Spinner label={t('loading.label')} />
            <span className="tracy-wo-muted">{t('loading.label')}</span>
          </span>
        ) : null}
        {view !== null ? (
          <ul className="tracy-wo-again-list">
            {view.run.map((r) => (
              <li key={r.part} className="tracy-wo-again-item">
                <b>{label(r.part)}</b>
                <span className="tracy-wo-muted">{t(r.reasonKey)}</span>
                <span className="tracy-wo-again-price">{`≈ ${r.price}`}</span>
              </li>
            ))}
            {view.kept.map((k) => (
              <li key={k.reasonKey} className="tracy-wo-again-item is-kept">
                <span>{k.parts.map(label).join(', ')}</span>
                <span className="tracy-wo-muted">{t(k.reasonKey)}</span>
                <span className="tracy-wo-again-price">{t('again.kept')}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {view !== null && view.due > 0 ? (
          <p className="tracy-wo-small">
            {t(preview?.payer === 'tracy' ? 'again.total.tracy' : 'again.total.account', {
              total: view.total
            })}{' '}
            {copy.pagesNote ? <span className="tracy-wo-muted">{t('again.pagesNote')}</span> : null}
          </p>
        ) : null}
        {view !== null && view.due === 0 ? <p className="tracy-wo-muted">{t('again.nothingDue')}</p> : null}
        {preview?.left != null && preview.left > 0 && view !== null && view.due > 0 ? (
          <p className="tracy-wo-muted tracy-wo-small">{t('again.left', { count: preview.left })}</p>
        ) : null}
        {preview !== null && !preview.open ? (
          <p className="tracy-wo-muted tracy-wo-small">
            {t(preview.payer === 'tracy' ? 'again.closed.public' : 'again.closed.account')}
          </p>
        ) : null}
        {errorKey !== null ? (
          <p className="tracy-wo-error tracy-wo-small" role="alert">
            {t(errorKey)}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={control.onClose}>
            {t('again.cancel')}
          </Button>
          <Button type="button" disabled={!canRun} onClick={control.onConfirm}>
            {busy ? <Spinner label={t('again.starting')} /> : null}
            {t(copy.buttonKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
