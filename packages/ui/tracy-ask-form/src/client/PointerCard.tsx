/**
 * The chat column's card while the Questions tab holds a request: how many questions wait there and
 * a button that brings the tab forward. It takes no answer — the form in the right pane does.
 */
import { Button } from '@tracy/ui'
import { MessageCircleQuestion } from 'lucide-react'
import type { JSX } from 'react'

import type { PendingAsk } from './ask-state.ts'
import type { Translate } from './strings'

export function PointerCard({
  pending,
  open,
  t
}: {
  pending: PendingAsk
  open: (sessionId: string) => void
  t: Translate
}): JSX.Element {
  const count = pending.questions.length
  return (
    <div className="tracy-ask-form px-4 pb-4">
      <div
        className="mx-auto box-border flex w-full max-w-3xl items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground"
        data-tracy-ask-pointer=""
      >
        <MessageCircleQuestion size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
        <p className="m-0 min-w-0 flex-1 text-sm">
          {count === 1 ? t('pointer.one') : t('pointer.many', { count })}
        </p>
        <Button size="sm" className="shrink-0" onClick={() => open(pending.sessionId)}>
          {t('pointer.open')}
        </Button>
      </div>
    </div>
  )
}
