/**
 * The header of a Details sub-page (#537, option B with the round back button of option E): ONE title row with a
 * round back button to the place's Details page, the page title, a "Step 1 of 3" chip, the page's short count, and the
 * page's actions at the right end (secondary first, the primary last). Under it a thin passive progress line of the
 * three steps, each segment with its name: the current step filled terracotta with a bold name, a done step a lighter
 * terracotta with a check, an upcoming step grey. The states come from `stepperView`, the model the Progress band of
 * Details draws, so the line and the band never disagree.
 */
import type { JSX, ReactNode } from 'react'
import { ArrowLeft, Check } from 'lucide-react'

import type { StepId, StepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'

/** The name of each step on the line: the titles of the sub-pages, and the last step's own name. */
const LABEL_OF: Record<StepId, string> = {
  research: 'details.section.profile',
  brief: 'details.section.brief',
  build: 'step.build'
}

export function SubPageHeader({
  t,
  title,
  step,
  count,
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
  /** The page's short count ("6 fields"), or null when it has none. */
  count: string | null
  /** The place's name: the back button says where it goes. */
  name: string
  /** The steps of the place (`stepperView`): done, current, upcoming. */
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
        {count ? <span className="tracy-wo-subhead-count">{count}</span> : null}
        <span className="tracy-wo-subhead-acts">{children}</span>
      </div>
      {view.errorKey !== null ? (
        <p className="tracy-wo-error tracy-wo-small tracy-wo-subhead-error" role="alert">
          {t(view.errorKey)}
        </p>
      ) : null}
      <ol className="tracy-wo-subhead-line" aria-label={t('progress.title')}>
        {view.steps.map((s, i) => (
          <li
            key={s.id}
            data-state={s.state}
            aria-current={s.state === 'current' ? 'step' : undefined}
            className="tracy-wo-subhead-seg"
          >
            <span className="tracy-wo-subhead-bar" aria-hidden="true" />
            <span className="tracy-wo-subhead-label">
              {s.state === 'done' ? <Check aria-hidden="true" /> : null}
              {`${i + 1}. ${t(LABEL_OF[s.id])}`}
            </span>
          </li>
        ))}
      </ol>
    </header>
  )
}
