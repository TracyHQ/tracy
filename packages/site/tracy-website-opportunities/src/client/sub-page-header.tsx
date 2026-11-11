/**
 * The header of a Details sub-page (#537, option B with the round back button of option E): ONE title row with a
 * round back button to the place's Details page, the page title, a "Step 1 of 3" chip, and the page's actions at the
 * right end (secondary first, the primary last). Under it one muted line says what the page is and what the owner
 * does here. The step number and a stopped step's reason come from `stepperView`, the model the Progress band of
 * Details draws.
 */
import type { JSX, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

import type { StepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'

export function SubPageHeader({
  t,
  title,
  step,
  description,
  name,
  view,
  onBack,
  children
}: {
  t: Translate
  /** The sub-page's title, already in words. */
  title: string
  /** Which of the steps this sub-page belongs to, from 1. */
  step: number
  /** What the page is and what the owner does here, already in words. */
  description: string
  /** The place's name: the back button says where it goes. */
  name: string
  /** The steps of the place (`stepperView`). */
  view: StepperView
  /** Back to the place's Details page. */
  onBack: () => void
  /** The page's actions, the primary one last. */
  children?: ReactNode
}): JSX.Element {
  const back = t('section.backTo', { name })
  return (
    <header className="tracy-wo-subhead">
      <div className="tracy-wo-subhead-row">
        <button
          type="button"
          className="tracy-wo-subhead-back"
          aria-label={back}
          title={back}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <h2 className="tracy-wo-subhead-title">{title}</h2>
        <span className="tracy-wo-subhead-chip">
          {t('band.kicker', { n: step, total: view.steps.length })}
        </span>
        <span className="tracy-wo-subhead-acts">{children}</span>
      </div>
      <p className="tracy-wo-subhead-desc">{description}</p>
      {view.errorKey !== null ? (
        <p className="tracy-wo-error tracy-wo-small tracy-wo-subhead-error" role="alert">
          {t(view.errorKey)}
        </p>
      ) : null}
    </header>
  )
}
