/**
 * Add source (#537, option C): a small outlined button that opens a popover under it with one field for a link of
 * the business, Cancel and Add side by side, and the server's refusal under the field. Escape and a press outside
 * close it. The state is `add-source-model.ts`; the caller's `onAdd` sends the link.
 */
import { Plus } from 'lucide-react'
import { type JSX, useEffect, useId, useReducer, useRef } from 'react'
import { Button, Input, Spinner } from '@tracy/ui'

import { ADD_SOURCE_CLOSED, addSourceLinkOf, addSourceStep } from './add-source-model.ts'
import { en, type Translate } from './strings.ts'

const known = (key: string): boolean => Object.prototype.hasOwnProperty.call(en, key)

/** The words of a refusal (`source.add.error.<code>`), or the plain fallback. */
const errorText = (t: Translate, code: string): string =>
  t(known(`source.add.error.${code}`) ? `source.add.error.${code}` : 'source.add.error.other')

export function AddSourcePopover({
  t,
  researched,
  onAdd
}: {
  t: Translate
  /** Research has run: adding a source asks for it again (said under the field). */
  researched: boolean
  /** Adds the link; answers the refusal code, or null when it was added. */
  onAdd: (url: string) => Promise<string | null>
}): JSX.Element {
  const [state, dispatch] = useReducer(addSourceStep, ADD_SOURCE_CLOSED)
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
      // Back to the Add source button (the first button of the wrapper), so the keyboard does not lose its place.
      wrap.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [state.open])

  const submit = async (): Promise<void> => {
    const link = addSourceLinkOf(state)
    dispatch({ type: 'submit' })
    if (link === null) return
    dispatch({ type: 'done', code: await onAdd(link) })
  }

  return (
    <span className="tracy-wo-addsrc" ref={wrap}>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="tracy-wo-addsrc-btn"
        data-on={state.open ? '' : undefined}
        aria-expanded={state.open}
        aria-controls={state.open ? popId : undefined}
        onClick={() => dispatch({ type: 'toggle' })}
      >
        <Plus aria-hidden="true" />
        {t('source.add')}
      </Button>
      {state.open ? (
        <form
          id={popId}
          className="tracy-wo-addsrc-pop"
          role="dialog"
          aria-label={t('source.add')}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="tracy-wo-addsrc-label" htmlFor={field}>
            {t('source.add.label')}
          </label>
          <Input
            id={field}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoFocus
            placeholder={t('source.add.placeholder')}
            value={state.url}
            aria-invalid={state.error !== null ? true : undefined}
            aria-describedby={state.error !== null || researched ? hintId : undefined}
            onChange={(e) => dispatch({ type: 'type', url: e.target.value })}
          />
          {state.error !== null ? (
            <p id={hintId} className="tracy-wo-error tracy-wo-small" role="alert">
              {errorText(t, state.error)}
            </p>
          ) : researched ? (
            <p id={hintId} className="tracy-wo-muted tracy-wo-small">
              {t('source.add.afterResearch')}
            </p>
          ) : null}
          <span className="tracy-wo-addsrc-acts">
            <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: 'close' })}>
              {t('source.add.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={state.busy}>
              {state.busy ? <Spinner label={t('source.add.saving')} /> : null}
              {t(state.busy ? 'source.add.saving' : 'source.add.submit')}
            </Button>
          </span>
        </form>
      ) : null}
    </span>
  )
}
