/**
 * The sub-page frame of Details (layout C, spec #512; the overview is the Workspace card, `workspace-card.tsx`): the
 * sub-page a section opens into (a breadcrumb back to the list and to Details, the one line Progress strip, the
 * section alone, and a pager to the section before and after it).
 */
import type { JSX, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@tracy/ui'

import { ApprovalActions, type ApprovalView, useReachedEnd } from './seller-review.tsx'
import { type SectionMeta, type SubSection, pageOf, pagerOf } from './section-model.ts'
import type { StepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'
import { SubPageHeader } from './sub-page-header.tsx'

/** The step each sub-page belongs to, from 1: the chip of its title row. */
const STEP_OF: Record<SubSection, number> = { profile: 1, brief: 2, media: 1 }

const metaLine = (t: Translate, meta: SectionMeta | undefined): string | null =>
  meta === undefined ? null : meta.status.map((s) => t(s.key, s.params)).join(', ')

/** A section opened as a sub-page: its header with the progress line, the section, and the pager. */
export function SubPage({
  t,
  section,
  name,
  meta,
  view,
  stepAction = null,
  onSection,
  actions,
  approval = null,
  children
}: {
  t: Translate
  section: SubSection
  /** The place's name, as Details titles it. */
  name: string
  meta: SectionMeta | undefined
  /** The steps of the place (`stepperView`), drawn as the progress line under the title. */
  view: StepperView
  /** The one action of the current step (`StepButton`), or null. */
  stepAction?: ReactNode
  /** Another section, or null for Details. */
  onSection: (section: SubSection | null) => void
  /** Secondary buttons in the title row, before the primary one. */
  actions?: ReactNode
  /** Approve in the title row (#537); null: none. */
  approval?: ApprovalView | null
  children: ReactNode
}): JSX.Element {
  // Photos & video open the Profile sub-page (#537).
  const title = t(`details.section.${pageOf(section)}`)
  const { previous, next } = pagerOf(section)
  const line = metaLine(t, meta)
  const [endMarker, reached] = useReachedEnd()
  return (
    <div className="tracy-wo-subpage" data-section={pageOf(section)}>
      <SubPageHeader
        t={t}
        title={title}
        step={STEP_OF[pageOf(section)]}
        count={line}
        name={name}
        view={view}
        onBack={() => onSection(null)}
      >
        {actions}
        {stepAction}
        {approval === null ? null : <ApprovalActions t={t} view={approval} reached={reached} />}
      </SubPageHeader>
      <section className="tracy-wo-psec" aria-label={title}>
        {children}
      </section>
      {approval === null ? null : <div ref={endMarker} className="tracy-wo-approve-end" aria-hidden="true" />}
      <nav className="tracy-wo-pager" aria-label={t('section.pager')}>
        {previous !== null ? (
          <button type="button" className="tracy-wo-pager-link" onClick={() => onSection(previous)}>
            <small>
              <ChevronLeft aria-hidden="true" />
              {t('section.previous')}
            </small>
            {t(`details.section.${previous}`)}
          </button>
        ) : (
          <span className="tracy-wo-pager-gap" />
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => onSection(null)}>
          {t('section.backTo', { name })}
        </Button>
        {next !== null ? (
          <button type="button" className="tracy-wo-pager-link" data-next="" onClick={() => onSection(next)}>
            <small>
              {t('section.next')}
              <ChevronRight aria-hidden="true" />
            </small>
            {t(`details.section.${next}`)}
          </button>
        ) : (
          <span className="tracy-wo-pager-gap" />
        )}
      </nav>
    </div>
  )
}
