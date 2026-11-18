/**
 * The sub-page frame of Details (layout C, spec #512; the overview is the Workspace card, `workspace-card.tsx`): the
 * sub-page a section opens into (one title row with a round back button to Details and a one line description,
 * `sub-page-header.tsx`; and the section alone).
 */
import type { JSX, ReactNode } from 'react'

import { ApprovalActions, type ApprovalView } from './seller-review.tsx'
import { type SubSection, pageOf } from './section-model.ts'
import type { StepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'
import { SubPageHeader } from './sub-page-header.tsx'

/** The step each sub-page belongs to, from 1: the chip of its title row. */
const STEP_OF: Record<SubSection, number> = { profile: 1, brief: 2, media: 1 }

/** A section opened as a sub-page: its header and the section. */
export function SubPage({
  t,
  section,
  name,
  view,
  stepAction = null,
  onSection,
  actions,
  approval = null,
  locked = false,
  children
}: {
  t: Translate
  section: SubSection
  /** The place's name, as Details titles it. */
  name: string
  /** The steps of the place (`stepperView`): the step chip and a stopped step's reason. */
  view: StepperView
  /** The one action of the current step (`StepButton`), or null. */
  stepAction?: ReactNode
  /** Another section, or null for Details. */
  onSection: (section: SubSection | null) => void
  /** Secondary buttons in the title row, before the primary one. */
  actions?: ReactNode
  /** Approve in the title row (#537); null: none. */
  approval?: ApprovalView | null
  /** The page's content is approved and locked: its description says so (#537). */
  locked?: boolean
  children: ReactNode
}): JSX.Element {
  // Photos & video open the Profile sub-page (#537).
  const title = t(`details.section.${pageOf(section)}`)
  return (
    <div className="tracy-wo-subpage" data-section={pageOf(section)}>
      <SubPageHeader
        t={t}
        title={title}
        step={STEP_OF[pageOf(section)]}
        description={t(
          locked || approval?.approvedLine != null
            ? `subhead.desc.${pageOf(section)}.locked`
            : `subhead.desc.${pageOf(section)}`
        )}
        name={name}
        view={view}
        onBack={() => onSection(null)}
      >
        {actions}
        {stepAction}
        {approval === null ? null : <ApprovalActions t={t} view={approval} />}
      </SubPageHeader>
      <section className="tracy-wo-psec" aria-label={title}>
        {children}
      </section>
    </div>
  )
}
