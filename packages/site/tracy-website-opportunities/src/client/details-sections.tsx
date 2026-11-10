/**
 * The sub-page frame of Details (layout C, spec #512; the overview is the Workspace card, `workspace-card.tsx`): the
 * sub-page a section opens into (a breadcrumb back to the list and to Details, the one line Progress strip, the
 * section alone, and a pager to the section before and after it).
 */
import type { JSX, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button
} from '@tracy/ui'

import { type SectionMeta, type SubSection, pageOf, pagerOf } from './section-model.ts'
import type { Translate } from './strings.ts'

const metaLine = (t: Translate, meta: SectionMeta | undefined): string | null =>
  meta === undefined ? null : meta.status.map((s) => t(s.key, s.params)).join(', ')

/** A section opened as a sub-page: breadcrumb, Progress strip, the section, and the pager. */
export function SubPage({
  t,
  section,
  name,
  meta,
  progress,
  onList,
  onSection,
  actions,
  footer,
  children
}: {
  t: Translate
  section: SubSection
  /** The place's name, as Details titles it. */
  name: string
  meta: SectionMeta | undefined
  /** The one line Progress strip (`stepper.tsx` with `strip`). */
  progress: ReactNode
  onList: () => void
  /** Another section, or null for Details. */
  onSection: (section: SubSection | null) => void
  /** Buttons beside the sub-page title (Add source, #537). */
  actions?: ReactNode
  /** The sticky approval footer under the section (#537). */
  footer?: ReactNode
  children: ReactNode
}): JSX.Element {
  // Photos & video open the Profile sub-page (#537).
  const title = t(`details.section.${pageOf(section)}`)
  const { previous, next } = pagerOf(section)
  const line = metaLine(t, meta)
  return (
    <div className="tracy-wo-subpage" data-section={pageOf(section)}>
      <Breadcrumb label={t('crumbs.label')} className="tracy-wo-crumbs">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<button type="button" onClick={onList} />}>
              {t('list.title')}
            </BreadcrumbLink>
            <BreadcrumbSeparator />
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink render={<button type="button" onClick={() => onSection(null)} />}>
              {name}
            </BreadcrumbLink>
            <BreadcrumbSeparator />
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="tracy-wo-subpage-head">
        <h2 className="tracy-wo-page-title">{title}</h2>
        {line ? <span className="tracy-wo-psec-meta">{line}</span> : null}
        {actions ? <span className="tracy-wo-subpage-acts">{actions}</span> : null}
      </div>
      {progress}
      <section className="tracy-wo-psec" aria-label={title}>
        {children}
      </section>
      {footer}
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
