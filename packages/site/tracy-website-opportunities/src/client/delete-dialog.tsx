/**
 * The confirmation before Delete on My opportunities (the bulk bar and the Inspector): how many places go, how many
 * of them have a live demo site that is removed with them, and that it cannot be undone.
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

import type { DeleteAsk } from './delete-model.ts'
import type { Translate } from './strings.ts'

const form = (count: number, locale?: string): 'one' | 'other' =>
  new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'

export function DeleteDialog({
  t,
  locale,
  ask,
  busy,
  onCancel,
  onConfirm
}: {
  t: Translate
  locale?: string
  /** The question; null keeps the dialog closed. */
  ask: DeleteAsk | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const count = ask?.ids.length ?? 0
  const single = count === 1
  const title = !single
    ? t('delete.title.other', { count })
    : ask?.name
      ? t('delete.title.one', { name: ask.name })
      : t('delete.title.unnamed')
  const withSite = ask?.withSite ?? 0
  return (
    <Dialog open={ask !== null} onOpenChange={(open) => (open || busy ? undefined : onCancel())}>
      <DialogContent className="tracy-wo tracy-wo-delete-dialog" closeLabel={t('delete.cancel')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t(single ? 'delete.lead.one' : 'delete.lead.other')}</DialogDescription>
        </DialogHeader>
        {withSite > 0 ? (
          <p className="tracy-wo-small">
            {single ? t('delete.site') : t(`delete.sites.${form(withSite, locale)}`, { count: withSite })}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t('delete.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={busy || count === 0} onClick={onConfirm}>
            {busy ? <Spinner label={t('delete.deleting')} /> : null}
            {t('delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
