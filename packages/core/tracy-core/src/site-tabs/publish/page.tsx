/**
 * One page of the Publish wizard: the title and its line, the step's body, and the sticky footer.
 * A fragment, so the body and the footer are children of the wizard's root (`tas-wizard-card`),
 * which is what keeps the footer stuck to the bottom of the panel (`WIZARD_CSS`).
 */
import { type JSX, type ReactNode, useEffect, useRef } from 'react'
import { Check, Circle, CircleCheck, CircleX, Info, Loader2, TriangleAlert } from 'lucide-react'
import { WizardFooter, type WizardFooterWords } from '../../wizard-shell'
import type { Translate } from '../../team/translate'

/** The footer of one page. A page with nothing to press has none. */
export interface PageFooter {
  onBack?: () => void
  onSkip?: () => void
  /** The page's main press; absent when there is nothing to go on with. */
  primary?: {
    label: string
    onPress: () => void
    disabled?: boolean
    busy?: boolean
    /** `data-*` and `form` attributes for the button (tests and a form's submit). */
    attrs?: Record<string, string | undefined>
  }
}

export const footerWords = (t: Translate): WizardFooterWords => ({
  back: t('flow.back'),
  skip: t('flow.skip'),
  continue: t('flow.continue')
})

export function StepPage({
  step,
  title,
  desc,
  footer,
  focusKey,
  children,
  attrs,
  t
}: {
  step: string
  title: string
  desc?: string | null
  footer: PageFooter
  /** The title takes the keyboard whenever this changes (a press replaced its own button). */
  focusKey?: string | null
  children?: ReactNode
  attrs?: Record<string, string | undefined>
  t: Translate
}): JSX.Element {
  const heading = useRef<HTMLHeadingElement | null>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (focusKey === null || focusKey === undefined) return
    heading.current?.focus()
    heading.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusKey])
  const { onBack, onSkip, primary } = footer
  const hasFooter = onBack !== undefined || onSkip !== undefined || primary !== undefined
  return (
    <>
      <div className="tas-wizard-body" data-publish-step={step} {...attrs}>
        <div className="tas-create-step tv-pub-step">
          <div className="tas-wizard-head">
            <h2 ref={heading} className="tas-wizard-title" tabIndex={-1} data-publish-title>
              {title}
            </h2>
            {desc ? <p className="tas-wizard-desc">{desc}</p> : null}
          </div>
          {children}
        </div>
      </div>
      {hasFooter ? (
        <WizardFooter
          words={footerWords(t)}
          onBack={onBack}
          onSkip={onSkip}
          onContinue={primary?.onPress}
          continueLabel={primary?.label}
          continueProps={primary?.attrs}
          disabled={primary?.disabled}
          busy={primary?.busy}
        />
      ) : null}
    </>
  )
}

/**
 * A status line of the wizard: a slim strip tinted by its severity, no border. The icon, a bold
 * line when there is one, the words, and any actions after them.
 */
export function Notice({
  severity,
  title,
  children,
  attrs
}: {
  severity: 'error' | 'warning' | 'info' | 'success'
  title?: string
  children?: ReactNode
  attrs?: Record<string, string | undefined>
}): JSX.Element {
  const Icon =
    severity === 'error'
      ? CircleX
      : severity === 'warning'
        ? TriangleAlert
        : severity === 'success'
          ? CircleCheck
          : Info
  return (
    <div
      className="tv-pub-strip tv-pub-notice"
      data-severity={severity}
      role={severity === 'error' ? 'alert' : 'status'}
      {...attrs}
    >
      <Icon aria-hidden="true" />
      <div className="tv-pub-strip-body">
        {title ? <b className="tv-pub-strip-title">{title}</b> : null}
        {children}
      </div>
    </div>
  )
}

/** A running line: the waiting strip, its pulsing dot, what is under way and what to know meanwhile. */
export function Working({
  words,
  children,
  attrs
}: {
  words: string
  children?: ReactNode
  attrs?: Record<string, string | undefined>
}): JSX.Element {
  return (
    <div className="tv-pub-strip tv-pub-working" data-severity="waiting" role="status" {...attrs}>
      <span className="tas-create-live" aria-hidden="true" />
      <div className="tv-pub-strip-body">
        <b className="tv-pub-strip-title">{words}</b>
        {children}
      </div>
    </div>
  )
}

/** One line of a running list: done, under way, or still to come. */
export interface ChecklistItem {
  id: string
  label: string
  state: 'done' | 'now' | 'next'
  /** A short word after the label, such as how long the step took ("8 min"). */
  note?: string
  /** Extra data attributes of the item's row. */
  attrs?: Record<string, string | undefined>
}

/** The steps of a piece of work that runs on its own (the ZIP, the sync): Add site's checklist. */
export function Checklist({
  items,
  attrs
}: {
  items: ChecklistItem[]
  attrs?: Record<string, string | undefined>
}): JSX.Element {
  return (
    <ol className="tas-create-checklist tv-pub-checklist" {...attrs}>
      {items.map((item) => (
        <li
          key={item.id}
          data-check-step={item.id}
          data-check-state={item.state}
          data-done={item.state === 'done' ? '1' : '0'}
          data-milestone={item.state === 'done' ? 'done' : item.state === 'now' ? 'running' : 'pending'}
          {...item.attrs}
        >
          <span className="tas-create-marker" aria-hidden="true">
            {item.state === 'done' ? (
              <Check />
            ) : item.state === 'now' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Circle />
            )}
          </span>
          <span>{item.label}</span>
          {item.note && <span className="tv-pub-small tabular-nums">{item.note}</span>}
        </li>
      ))}
    </ol>
  )
}
