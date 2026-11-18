/**
 * Add source (#537): a small outlined button that opens a popover under it with one field for a link of the
 * business, Cancel and Add side by side, and the refusal under the field. The field shows the platform glyph as soon
 * as the text reads as a link, and while the add door checks the link its right end reads Checking the link. Escape
 * and a press outside close it; closed while checking, a notice beside the button reads the answer when it comes.
 * The state is `add-source-model.ts`; the caller's `onAdd` sends the link.
 */
import { Plus, X } from 'lucide-react'
import { type JSX, useEffect, useId, useReducer, useRef, useState } from 'react'
import { Button, Input, Spinner } from '@tracy/ui'

import {
  ADD_SOURCE_ADDED_NOTICE_MS,
  ADD_SOURCE_CLOSED,
  ADD_SOURCE_SLOW_MS,
  type AddSourceMessage,
  type AddSourceRefusal,
  addSourceCheckingKey,
  addSourceGlyphOf,
  addSourceLinkOf,
  addSourceRefusal,
  addSourceStep
} from './add-source-model.ts'
import { sourceLabel } from './cms-label.ts'
import { SourceGlyph } from './source-logo.tsx'
import type { Translate } from './strings.ts'

/** The words of one line, its platform named the way the Sources table names it. */
const lineOf = (t: Translate, m: AddSourceMessage): string =>
  m.params === undefined && m.platform === undefined
    ? t(m.key)
    : t(m.key, { ...m.params, ...(m.platform === undefined ? {} : { platform: sourceLabel(t, m.platform) }) })

/** The link without its scheme and www., as the notice echoes it. */
const shortLink = (url: string): string => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '')

export function AddSourcePopover({
  t,
  locked,
  onAdd
}: {
  t: Translate
  /**
   * Sources are fixed: research runs or ran (`addAllowedIn` is false). The button stays drawn but off, and its reason
   * shows on hover; the door would answer `RESEARCH_STARTED` (or `JOB_ACTIVE` while it runs).
   */
  locked: boolean
  /** Adds the link; answers the door's refusal, or null when it was added. */
  onAdd: (url: string) => Promise<AddSourceRefusal | null>
}): JSX.Element {
  const [state, dispatch] = useReducer(addSourceStep, ADD_SOURCE_CLOSED)
  const [now, setNow] = useState(() => Date.now())
  const wrap = useRef<HTMLSpanElement>(null)
  const field = useId()
  const popId = useId()
  const hintId = useId()

  // Escape and a press outside the button and its popover close it.
  useEffect(() => {
    if (!state.open) return
    const onDown = (e: PointerEvent): void => {
      if (wrap.current !== null && e.target instanceof Node && !wrap.current.contains(e.target))
        dispatch({ type: 'close' })
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      dispatch({ type: 'close' })
      // Back to the Add source button, so the keyboard does not lose its place.
      wrap.current?.querySelector<HTMLButtonElement>('.tracy-wo-addsrc-btn')?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [state.open])

  // While checking, the clock moves once more when the answer is slow, so the field reads Still checking.
  useEffect(() => {
    if (state.checkingSince === null) return
    setNow(Date.now())
    const left = state.checkingSince + ADD_SOURCE_SLOW_MS - Date.now()
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [state.checkingSince])

  // A refusal puts the caret back in the field, with the pasted link kept, to fix it. By id: the shared Input takes
  // no ref on a React 18 host.
  useEffect(() => {
    if (state.open && state.error !== null) document.getElementById(field)?.focus()
  }, [state.open, state.error, field])

  // The notice of an added link goes by itself; a refusal stays until Try again or Dismiss.
  const noticePhase = state.notice?.phase ?? null
  useEffect(() => {
    if (noticePhase !== 'added') return
    const timer = setTimeout(() => dispatch({ type: 'dismiss' }), ADD_SOURCE_ADDED_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [noticePhase])

  const submit = async (): Promise<void> => {
    const link = addSourceLinkOf(state)
    dispatch({ type: 'submit', at: Date.now() })
    if (link === null) return
    let refusal: AddSourceRefusal | null
    try {
      refusal = await onAdd(link)
    } catch {
      refusal = { code: 'NETWORK', status: 0 }
    }
    dispatch({ type: 'done', refusal: refusal === null ? null : addSourceRefusal(refusal) })
  }

  const checking = state.checkingSince !== null
  const checkingKey = addSourceCheckingKey(state, now)
  const glyph = state.open ? addSourceGlyphOf(state.url) : null
  const pending = state.notice?.phase === 'pending'
  const off = locked || pending
  const notice = state.notice

  return (
    <span className="tracy-wo-addsrc" ref={wrap}>
      {notice !== null && !state.open ? (
        <span
          className="tracy-wo-addsrc-notice tracy-wo-small"
          data-phase={notice.phase}
          role={notice.phase === 'failed' ? 'alert' : 'status'}
        >
          {notice.phase === 'pending' ? <Spinner label={t('source.add.pending')} aria-hidden="true" /> : null}
          <span className="tracy-wo-addsrc-notice-text">
            {notice.phase === 'pending'
              ? t('source.add.pending')
              : notice.phase === 'added'
                ? t('source.add.added', {
                    platform: sourceLabel(t, notice.platform ?? 'website')
                  })
                : lineOf(t, notice.error)}
          </span>
          <span className="tracy-wo-addsrc-notice-link" title={notice.url}>
            {shortLink(notice.url)}
          </span>
          {notice.phase === 'failed' ? (
            <>
              <Button type="button" size="xs" variant="ghost" onClick={() => dispatch({ type: 'retry' })}>
                {t('source.add.tryAgain')}
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={t('source.add.dismiss')}
                onClick={() => dispatch({ type: 'dismiss' })}
              >
                <X aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </span>
      ) : null}
      <span className="tracy-wo-addsrc-btnwrap" title={locked ? t('source.add.locked') : undefined}>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="tracy-wo-addsrc-btn"
          disabled={off}
          data-on={state.open ? '' : undefined}
          aria-expanded={state.open}
          aria-controls={state.open ? popId : undefined}
          onClick={() => dispatch({ type: 'toggle' })}
        >
          <Plus aria-hidden="true" />
          {t('source.add')}
        </Button>
      </span>
      {state.open ? (
        <form
          id={popId}
          className="tracy-wo-addsrc-pop"
          role="dialog"
          aria-label={t('source.add')}
          aria-busy={checking ? true : undefined}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="tracy-wo-addsrc-label" htmlFor={field}>
            {t('source.add.label')}
          </label>
          <span
            className="tracy-wo-addsrc-field"
            data-glyph={glyph === null ? undefined : ''}
            data-checking={checking ? '' : undefined}
          >
            {glyph === null ? null : (
              <span className="tracy-wo-addsrc-glyph">
                <SourceGlyph logo={glyph} />
              </span>
            )}
            <Input
              id={field}
              className="tracy-wo-addsrc-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              disabled={checking}
              placeholder={t('source.add.placeholder')}
              value={state.url}
              aria-invalid={state.error !== null ? true : undefined}
              aria-describedby={state.error !== null ? hintId : undefined}
              onChange={(e) => dispatch({ type: 'type', url: e.target.value })}
            />
            {checkingKey === null ? null : (
              <span className="tracy-wo-addsrc-checking" role="status">
                <Spinner label={t(checkingKey)} aria-hidden="true" />
                <span>{t(checkingKey)}</span>
              </span>
            )}
          </span>
          {state.error !== null ? (
            <p id={hintId} className="tracy-wo-error tracy-wo-small" role="alert">
              {lineOf(t, state.error)}
            </p>
          ) : null}
          <span className="tracy-wo-addsrc-acts">
            <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: 'close' })}>
              {t('source.add.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={checking}>
              {t('source.add.submit')}
            </Button>
          </span>
        </form>
      ) : null}
    </span>
  )
}
