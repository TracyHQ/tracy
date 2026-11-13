/**
 * The plan review bar of the build chat (#609): Approve and Request changes for the plan the agent handed out.
 *
 * WHY THIS AND NOT dsh's PLAN REVIEW PANEL. `planReviewRequestOf` gives the request `detail` (the plan summary) and
 * `intent` (`plan-review`), which dsh's composer reads to draw its plan review panel. dsh's `ask_user_question` tool
 * passes on only id, question, header, options, multi-select and recommended, so both are gone by the time the
 * request reaches the browser, and dsh would draw a generic two option question. The id survives, and the tool's
 * guard admits it only as the plan review handed out with a plan (`isPlanReviewRequest`). This bar claims exactly
 * that request, ahead of dsh's composer, and draws the panel's shape again: the plan's name as the header, its
 * summary read from the draft, the two options as the agent passed them. The answer is the one dsh's panel sends,
 * `{ answers: [{ id, selected: [label] }] }`, so `approvalOf` reads it unchanged.
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  isBuildChatSession,
  isPlanReviewRequest,
  planCardOf,
  planReviewRequestOf
} from '@tracy/core/build-chat'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DraftSource } from './sources'
import type { Translate } from './strings'

/** The parts of dsh's pending question carrier this bar uses (`PendingQuestion` of ui-user-questions). */
export interface PendingReview {
  sessionId: string
  key: string
  questions: readonly {
    id: string
    question: string
    options?: readonly { label: string; description?: string }[]
  }[]
  answer(answer: { answers: { id: string; selected: string[] }[] }): Promise<void>
  dismiss(): Promise<void>
  snapshot(): { channel: 'waterfall' | 'rpc' | 'none' }
}

/** The composer chain selector: the plan review request of a build chat session, or null for dsh's own flow. */
export function selectPlanReview({
  pendingInteraction
}: {
  pendingInteraction?: unknown
}): PendingReview | null {
  const pending = pendingInteraction as Partial<PendingReview> | null | undefined
  if (!pending || typeof pending.answer !== 'function' || !isBuildChatSession(pending.sessionId)) return null
  return isPlanReviewRequest(pending.questions) ? (pending as PendingReview) : null
}

export function ReviewBar({
  matched,
  drafts,
  t
}: {
  matched: PendingReview
  drafts: DraftSource
  t: Translate
}) {
  const draft = useSyncExternalStore(drafts.subscribe, drafts.read, drafts.read)
  useEffect(() => void drafts.load(), [drafts])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const question = matched.questions[0]
  const [approve, decline] = question.options ?? []
  const plan = draft?.plan
  const name = plan ? planCardOf(plan).name : null
  const summary = plan ? planReviewRequestOf(plan).questions[0].detail.replace(/^#\s*/, '') : null

  const decide = (label: string) => {
    setBusy(true)
    setFailed(false)
    const remote = matched.snapshot().channel === 'rpc'
    matched
      .answer({ answers: [{ id: question.id, selected: [label] }] })
      .then(() => (remote ? matched.dismiss() : undefined))
      .catch(() => {
        setBusy(false)
        setFailed(true)
      })
  }

  return (
    <div className="tv-bc-review-frame" data-plan-review-key={matched.key}>
      <section className="tv-bc-review" aria-label={question.question} aria-busy={busy}>
        <div className="tv-bc-review-strip">
          {name === null ? question.question : t('plan.title', { name })}
        </div>
        <div className="tv-bc-review-body">
          <p className="tv-bc-review-q">{question.question}</p>
          {summary !== null && <p className="tv-bc-muted tv-bc-small">{summary}</p>}
        </div>
        <div className="tv-bc-review-foot">
          <div className="tv-bc-review-err" role="status">
            {failed ? t('review.failed') : null}
          </div>
          <div className="tv-bc-review-actions">
            {decline && (
              <Button variant="outline" disabled={busy} onClick={() => decide(decline.label)}>
                {decline.label}
              </Button>
            )}
            {approve && (
              <Button variant="primary" disabled={busy} onClick={() => decide(approve.label)}>
                {approve.label}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
