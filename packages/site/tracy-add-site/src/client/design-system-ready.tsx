/**
 * The design system picked in the Add site form, after Create site (`wizard.tsx`): the pick travels with the press, the
 * server puts it on at the end of the build, and the console and the ready screen say how that went, as one row like
 * the milestones. On the ready screen a pick the server could not put on says so, with Try again: the same door the
 * Design system panel presses (`applyPick`, `design-system-pick.mjs`).
 */
import { Alert, AlertDescription, cn } from '@tracy/ui'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { type JSX, useState } from 'react'

import { applyPick, type JobPick, pickLine } from './design-system-pick.mjs'
import type { Translate } from './strings'

type PickAt = 'running' | 'done' | 'failed'
type Line = { at: PickAt; name: string }

/**
 * The design system picked in the form, as one row like the milestones: under way while the server puts it on (and
 * during Try again), done once it is on, failed when it was not. The words are the pick's name in the one sentence.
 */
export function PickStep({ t, line }: { t: Translate; line: Line }): JSX.Element {
  return (
    <div
      data-design-system-apply={line.at}
      className={cn('flex items-center gap-2 text-xs', line.at === 'running' && 'text-muted-foreground')}
    >
      {line.at === 'done' ? (
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
      ) : line.at === 'failed' ? (
        <XCircle className="size-4 shrink-0 text-destructive" />
      ) : (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      )}
      {t('ds_applying', { name: line.name })}
    </div>
  )
}

/**
 * Try again on the ready screen, after the server said its own write of the pick did not land: under way, done, or
 * failed again. Kept by the wizard (not the ready screen), so it outlives a re-render of that screen. `isMounted`: the
 * wizard's own, so an answer after it is gone changes nothing.
 */
export function usePickRetry(isMounted: () => boolean): {
  /** The pick as the server ended it; once Try again was pressed for this site, that press's own state. */
  lineFor: (siteKey: string, pick: JobPick | null | undefined) => Line | null
  /** Done, the page goes on into the workspace as it would have (`land`). */
  retry: (siteKey: string, pick: JobPick, land: () => void) => Promise<void>
} {
  const [retried, setRetried] = useState<{ siteKey: string; at: PickAt } | null>(null)
  return {
    lineFor(siteKey, pick) {
      const ended = pickLine(pick)
      const mine = retried?.siteKey === siteKey ? retried : null
      return ended && mine ? { ...ended, at: mine.at } : ended
    },
    async retry(siteKey, pick, land) {
      setRetried({ siteKey, at: 'running' })
      const result = await applyPick(siteKey, pick.id)
      if (!isMounted()) return
      setRetried({ siteKey, at: result.ok ? 'done' : 'failed' })
      if (result.ok) land()
    }
  }
}

/** The ready screen's pick: its row, and the failure with Try again when the server could not put it on. */
export function ReadyPick({
  t,
  line,
  pick,
  onRetry
}: {
  t: Translate
  line: Line | null
  pick: JobPick | null | undefined
  onRetry: (pick: JobPick) => void
}): JSX.Element | null {
  if (!line) return null
  return (
    <>
      <PickStep t={t} line={line} />
      {pick && line.at === 'failed' ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t('ds_apply_failed', { name: line.name })}{' '}
            <button
              type="button"
              className="border-0 bg-transparent p-0 font-medium underline underline-offset-2"
              onClick={() => onRetry(pick)}
            >
              {t('ds_apply_retry')}
            </button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
