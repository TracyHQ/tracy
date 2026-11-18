/**
 * The confirmation before a pasted source leaves the Sources table of Details (#537), drawn like the Delete dialog of
 * My opportunities: a title, one lead sentence naming the source and its short link, Cancel and a danger Remove. The
 * dialog stays open with a spinner while the call runs, closes once the source went, and shows a refusal inside
 * itself with Remove enabled again. Escape and Cancel close it with nothing changed (not while the call runs).
 */
import type { JSX } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner
} from '@tracy/ui'

import type { RemoveStep } from './source-remove-model.ts'
import type { Translate } from './strings.ts'

export function SourceRemoveDialog({
  t,
  step,
  onCancel,
  onConfirm
}: {
  t: Translate
  /** The source asked about; null keeps the dialog closed. */
  step: RemoveStep
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const busy = step?.phase === 'pending'
  return (
    <Dialog open={step !== null} onOpenChange={(open) => (open || busy ? undefined : onCancel())}>
      <DialogContent
        className="tracy-wo tracy-wo-delete-dialog tracy-wo-source-remove-dialog"
        closeLabel={t('source.remove.cancel')}
      >
        <DialogHeader>
          <DialogTitle>{t('source.remove.title')}</DialogTitle>
          <DialogDescription>
            {t('source.remove.lead', { name: step?.name ?? '', link: step?.link ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {step?.error != null ? (
          <p className="tracy-wo-error" role="alert">
            {t(step.error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t('source.remove.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? <Spinner label={t('source.remove.removing')} /> : null}
            {t('source.remove.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
