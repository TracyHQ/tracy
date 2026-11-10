/**
 * The Workspace card of Details (#537, option D): one full width card under the Progress band, its four sections drawn
 * from `workspace-model.ts`. A section with content is a row that opens and folds on a press (several may be open); a
 * locked section is one muted row with a lock pill. The status pill is the single trailing action. The seller's open/closed choices live in session storage per place.
 */

import { hostOf } from '@tracy/wo-views'
import { AppWindow, Check, ChevronRight, ClipboardList, FileText, Link2, Lock } from 'lucide-react'
import { type JSX, type ReactNode, useCallback, useEffect, useId, useState } from 'react'

import type { DemoCommand } from './demo-block-model.ts'

import type { SubSection } from './section-model.ts'
import type { Translate } from './strings.ts'
import {
  readOpened,
  type WorkspaceId,
  type WorkspaceInput,
  type WorkspaceSection,
  type WorkspaceText,
  workspaceSections,
  workspaceStoreKey
} from './workspace-model.ts'

const ICONS: Record<WorkspaceId, typeof Link2> = {
  sources: Link2,
  profile: ClipboardList,
  brief: FileText,
  demo: AppWindow
}

function readStore(key: string): Partial<Record<WorkspaceId, boolean>> {
  try {
    return readOpened(window.sessionStorage.getItem(key))
  } catch {
    return {}
  }
}

function writeStore(key: string, value: Partial<Record<WorkspaceId, boolean>>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/** The seller's open/closed choice per section of one place, kept for the browser session. */
function useOpened(opportunityId: string) {
  const key = workspaceStoreKey(opportunityId)
  const [opened, setOpened] = useState(() => readStore(key))
  useEffect(() => setOpened(readStore(key)), [key])
  const toggle = useCallback(
    (id: WorkspaceId, now: boolean) =>
      setOpened((prev) => {
        const next = { ...prev, [id]: !now }
        writeStore(key, next)
        return next
      }),
    [key]
  )
  return { opened, toggle }
}

/** The address the ready demo opens at, for its folded row, or null. */
export const demoHostOf = (command: DemoCommand): string | null =>
  command?.kind === 'open' && /^https?:\/\//i.test(command.href) ? hostOf(command.href) : null

const textOf = (t: Translate, parts: WorkspaceText[]): string =>
  parts.map((p) => ('text' in p ? p.text : t(p.key, p.params))).join(' · ')

function Row({
  t,
  section,
  body,
  onToggle,
  onSection
}: {
  t: Translate
  section: WorkspaceSection
  body: ReactNode
  onToggle: (id: WorkspaceId, now: boolean) => void
  onSection: (id: SubSection) => void
}): JSX.Element {
  const bodyId = useId()
  const { id, state, expanded, expandable, linkKey } = section
  const title = t(`details.section.${id}`)
  const Icon = state === 'done' ? Check : ICONS[id]
  const head = (
    <>
      <span className="tracy-wo-ws-tile" aria-hidden="true">
        <Icon />
      </span>
      <span className="tracy-wo-ws-name">{title}</span>
      <span className="tracy-wo-ws-sum">{expanded ? '' : textOf(t, section.summary)}</span>
    </>
  )
  return (
    <div
      className="tracy-wo-ws-sec"
      data-section={id}
      data-state={state}
      data-open={expanded ? '' : undefined}
    >
      <div className="tracy-wo-ws-row">
        {expandable ? (
          <button
            type="button"
            onClick={() => onToggle(id, expanded)}
            className="tracy-wo-ws-toggle"
            aria-expanded={expanded}
            aria-controls={bodyId}
            aria-label={t('workspace.toggle', { section: title })}
          >
            {head}
          </button>
        ) : (
          <span className="tracy-wo-ws-toggle">{head}</span>
        )}
        {state === 'locked' ? (
          <span className="tracy-wo-ws-pill" data-kind="locked" role="img" aria-label={t('workspace.locked')}>
            <Lock aria-hidden="true" />
          </span>
        ) : linkKey !== null && id !== 'demo' ? (
          <button
            type="button"
            className="tracy-wo-ws-pill"
            data-kind={state === 'review' ? 'review' : 'open'}
            aria-label={t(state === 'review' ? 'workspace.reviewNamed' : 'section.openNamed', {
              section: title
            })}
            onClick={() => onSection(id)}
          >
            {t(linkKey)}
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="tracy-wo-ws-body" id={bodyId}>
          {body}
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceCard({
  t,
  opportunityId,
  input,
  bodies,
  onSection
}: {
  t: Translate
  opportunityId: string
  /** What the sections read, without the seller's open/closed choices (this card keeps those). */
  input: Omit<WorkspaceInput, 'opened'>
  /** The content of each section when it is open. */
  bodies: Record<WorkspaceId, ReactNode>
  onSection: (id: SubSection) => void
}): JSX.Element {
  const { opened, toggle } = useOpened(opportunityId)
  const sections = workspaceSections({ ...input, opened })
  return (
    <section className="tracy-wo-ws" aria-label={t('workspace.title')}>
      <div className="tracy-wo-ws-head">
        <h3 className="tracy-wo-ws-title">{t('workspace.title')}</h3>
        <span className="tracy-wo-ws-subtitle">{t('workspace.subtitle')}</span>
      </div>
      {sections.map((s) => (
        <Row key={s.id} t={t} section={s} body={bodies[s.id]} onToggle={toggle} onSection={onSection} />
      ))}
    </section>
  )
}
