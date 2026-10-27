/**
 * The Questions tab's body: the request pending on the tab's own session, drawn whole by the shared
 * ask form of `@tracy/site-build-core`, answered through `pending.answer()`.
 */
import { MessageCircleQuestion } from 'lucide-react'
import { type JSX, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { entryAnswered } from '../../../../site/tracy-site-build-core/src/client/ask-form/AskCards'
import { AskForm } from '../../../../site/tracy-site-build-core/src/client/ask-form/AskForm'
import {
  type DshAnswerMode,
  visibleItems
} from '../../../../site/tracy-site-build-core/src/client/ask-form/model.ts'
import {
  type AskController,
  answerPending,
  type Drafts,
  formOf,
  type PendingAsk,
  questionOf,
  type SessionStatusSource,
  takeKey
} from './ask-state.ts'
import type { Translate } from './strings'

export function AskTab({
  sessionId,
  status,
  controller,
  t
}: {
  sessionId: string
  status: SessionStatusSource
  controller: Pick<AskController, 'getSnapshot' | 'subscribe' | 'drafts'>
  t: Translate
}): JSX.Element | null {
  const snapshot = useSyncExternalStore(status.subscribe, status.getSnapshot, status.getSnapshot)
  // The form shows only once the operator's switch is known to be on. A tab restored from the saved
  // layout or named by `?tab=` can mount before `/api/ui` answers (the side card's policy still holds
  // the code defaults then); it draws nothing until the controller says on, and when the answer is
  // off the controller closes it (e2e-dev 04/10, F5).
  const enabled = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().enabled,
    () => controller.getSnapshot().enabled
  )
  if (!enabled) return null
  const drafts = controller.drafts
  const pending = questionOf(snapshot.get(sessionId)?.pendingInteraction)
  if (pending === null) {
    return (
      <div className="tracy-ask-form flex h-full items-center justify-center p-6">
        <p className="m-0 text-muted-foreground text-sm">{t('empty.title')}</p>
      </div>
    )
  }
  // Keyed by the request: a replacing request starts with its own draft, and no press of the old one
  // stays busy on the new one.
  return <PendingForm key={takeKey(pending)} pending={pending} drafts={drafts} t={t} />
}

function PendingForm({
  pending,
  drafts,
  t
}: {
  pending: PendingAsk
  drafts: Drafts
  t: Translate
}): JSX.Element {
  const id = takeKey(pending)
  const form = useMemo(() => formOf(pending), [pending])
  const draft = useSyncExternalStore(
    drafts.subscribe,
    () => drafts.get(id),
    () => drafts.get(id)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // A ref, not the state: two presses in one frame both read `busy` as false.
  const sending = useRef(false)

  const press = (mode: DshAnswerMode) => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(undefined)
    answerPending(pending, form, drafts.get(id), mode).then(
      // Answered: the request leaves the session and this form with it. The lock stays on, so the
      // settled request is never answered twice.
      () => drafts.clear(id),
      () => {
        sending.current = false
        setBusy(false)
        setError(t('error.answer'))
      }
    )
  }

  // Send answer stays off until something is picked or typed; Decide for me covers the empty case.
  const answered = visibleItems(form, draft).some((item) => entryAnswered(draft[item.id]))

  return (
    <div className="tracy-ask-form h-full">
      <AskForm
        lead={
          <span className="inline-flex items-center gap-1.5">
            <MessageCircleQuestion size={14} strokeWidth={1.8} aria-hidden="true" className="text-primary" />
            {t('pane.lead')}
          </span>
        }
        model={form}
        draft={draft}
        onDraft={(next) => drafts.set(id, next)}
        busy={busy}
        error={error}
        t={t}
        actions={{
          primary: { label: t('action.submit'), onPress: () => press('submit'), disabled: !answered },
          secondary: { label: t('action.decide'), onPress: () => press('decide') },
          tertiary: { label: t('action.followUp'), onPress: () => press('follow_up') }
        }}
      />
    </div>
  )
}
