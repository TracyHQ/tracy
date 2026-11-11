/**
 * The Site content brief sub-page as a checklist, one section at a time (#537, option E). A rail lists the five steps
 * (`brief-steps-model.ts`) with a number, or a check once reviewed, and Approve and continue at its foot; the pane shows
 * the current step's items (`brief-checklist-item.tsx`) and its footer marks the step reviewed and moves on. Once the
 * brief is approved it is locked: no Edit, no switch, no Mark reviewed and no Approve, with one line saying how to
 * change it (add the business again as a new card).
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button } from '@tracy/ui'

import { type BriefEditDoor, BriefChecklistItem } from './brief-checklist-item.tsx'
import type { BriefMediaView } from './brief-media-model.ts'
import {
  type BriefReviewView,
  type BriefStepNumber,
  type BriefStepView,
  firstOpenStep,
  stepAfterMark
} from './brief-steps-model.ts'
import type { BriefRow } from './business-brief-model.ts'
import { ApprovalActions, type ApprovalView, gateText } from './seller-review.tsx'
import type { Translate } from './strings.ts'

export function BriefChecklist({
  t,
  steps,
  review,
  locked,
  approval,
  media,
  siteName,
  editDoor,
  onMark,
  onToggle
}: {
  t: Translate
  steps: BriefStepView[]
  review: BriefReviewView
  /** The brief is approved: read only (`approval.brief === 'approved'`). */
  locked: boolean
  /** Approve and continue at the foot of the rail, the same action as the header's; null: none. */
  approval: ApprovalView | null
  media: BriefMediaView | null
  /** The Site name on Tracy item, first in step 1. */
  siteName: ReactNode
  /** How the seller edits an item, or null when the brief does not let it be edited. */
  editDoor: (row: BriefRow) => BriefEditDoor | null
  onMark: (step: BriefStepView) => void
  /** Saves the person's choice for one fact; answers null once saved, else the refusal code. */
  onToggle: (id: string, onSite: boolean) => Promise<string | null>
}): JSX.Element {
  const [current, setCurrent] = useState<BriefStepNumber>(() => (locked ? 1 : firstOpenStep(review)))
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ id: string; text: string } | null>(null)
  const step = steps.find((s) => s.n === current) ?? steps[0]
  const total = steps.length
  const go = (n: BriefStepNumber): void => {
    setCurrent(n)
    setEditing(new Set())
  }
  const edit = (id: string, open: boolean): void =>
    setEditing((now) => {
      const next = new Set(now)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  const toggle = async (row: BriefRow, onSite: boolean): Promise<void> => {
    if (busy !== null) return
    setBusy(row.id)
    setRefused(null)
    const code = await onToggle(row.id, onSite)
    setBusy(null)
    if (code !== null)
      setRefused({
        id: row.id,
        text: code === '' ? t('facts.failed') : (gateText(t, code) ?? t('facts.failed'))
      })
  }
  const editable = locked ? [] : step.items.filter((row) => editDoor(row) !== null)
  const editingAll = editable.length > 0 && editable.every((row) => editing.has(row.id))
  const mark = (): void => {
    onMark(step)
    go(stepAfterMark(step.n, { ...review, reviewed: { ...review.reviewed, [step.n]: true } }))
  }
  const blocked = t('brief.steps.approveBlocked', { total })
  // The Site name item of step 1 is always on the site: it counts in the step's chip.
  const extra = step.n === 1 ? 1 : 0
  return (
    <div className="tracy-wo-brief-check">
      {locked ? (
        <p className="tracy-wo-brief-locked" role="status">
          {t('brief.steps.locked')}
        </p>
      ) : null}
      <div className="tracy-wo-brief-wrap">
        <aside className="tracy-wo-brief-rail" aria-label={t('brief.steps.title')}>
          <h4>{t('brief.steps.title')}</h4>
          <ol>
            {steps.map((s) => {
              const done = review.reviewed[s.n]
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    className="tracy-wo-brief-st"
                    data-done={done ? 'true' : undefined}
                    aria-current={s.n === current ? 'step' : undefined}
                    onClick={() => go(s.n)}
                  >
                    <span className="tracy-wo-brief-ck" aria-hidden="true">
                      {done ? <Check /> : s.n}
                    </span>
                    <span className="tracy-wo-brief-nm">{t(s.titleKey)}</span>
                    {done ? <span className="tracy-wo-brief-sr">{t('brief.steps.reviewed')}</span> : null}
                  </button>
                </li>
              )
            })}
          </ol>
          {locked ? null : (
            <div className="tracy-wo-brief-foot">
              {approval === null ? null : (
                <ApprovalActions t={t} view={{ ...approval, blockedReason: review.all ? null : blocked }} />
              )}
              <small>{t('brief.steps.count', { n: review.count, total })}</small>
            </div>
          )}
        </aside>
        <section className="tracy-wo-brief-pane" aria-label={t(step.titleKey)}>
          <div className="tracy-wo-brief-ph">
            <h3>{t(step.titleKey)}</h3>
            <span className="tracy-wo-brief-count">
              {t('brief.steps.onSite', { n: step.on + extra, total: step.items.length + extra })}
            </span>
            {editable.length > 0 ? (
              <button
                type="button"
                className="tracy-wo-brief-edit"
                onClick={() => setEditing(editingAll ? new Set() : new Set(editable.map((row) => row.id)))}
              >
                <Pencil aria-hidden="true" />
                {t(editingAll ? 'brief.steps.doneEditing' : 'brief.steps.editSection')}
              </button>
            ) : null}
          </div>
          <div className="tracy-wo-brief-items">
            {step.n === 1 ? siteName : null}
            {step.items.map((row) => (
              <BriefChecklistItem
                key={row.id}
                t={t}
                row={row}
                media={media}
                door={locked ? null : editDoor(row)}
                editing={editing.has(row.id)}
                locked={locked}
                busy={busy !== null}
                refusal={refused?.id === row.id ? refused.text : null}
                onEdit={(open) => edit(row.id, open)}
                onToggle={(on) => void toggle(row, on)}
              />
            ))}
            {step.items.length === 0 && step.n !== 1 ? (
              <p className="tracy-wo-muted tracy-wo-brief-empty">{t('brief.steps.empty')}</p>
            ) : null}
          </div>
          <div className="tracy-wo-brief-pf">
            <span className="tracy-wo-muted">{t('brief.steps.position', { n: step.n, total })}</span>
            <span className="tracy-wo-brief-sp" />
            {step.n > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => go((step.n - 1) as BriefStepNumber)}
              >
                {t('brief.steps.previous')}
              </Button>
            ) : null}
            {locked ? (
              step.n < total ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => go((step.n + 1) as BriefStepNumber)}
                >
                  {t('brief.steps.next')}
                </Button>
              ) : null
            ) : (
              <Button type="button" size="sm" onClick={mark}>
                {t(step.n === total ? 'brief.steps.mark' : 'brief.steps.markNext')}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
