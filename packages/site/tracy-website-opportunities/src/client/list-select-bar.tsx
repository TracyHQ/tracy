/**
 * The selection bar of My opportunities (#537, header C): it takes the toolbar's place while selection mode is on.
 * Its leading checkbox picks every row shown (or clears them), then the count, Delete (asks first), Cancel research,
 * and Done, which leaves the mode. Building many demos at once is not offered here: each row builds its own.
 */

import { Button, Checkbox } from '@tracy/ui'
import { Trash2, X } from 'lucide-react'
import type { JSX } from 'react'

import type { Translate } from './strings.ts'

export function SelectionBar({
  t,
  count,
  pick,
  busy,
  deleteDisabled,
  cancelDisabled,
  onPickAll,
  onDelete,
  onCancelResearch,
  onDone
}: {
  t: Translate
  /** Places picked (or every one matching the filter). */
  count: number
  pick: 'all' | 'some' | 'none'
  busy: boolean
  deleteDisabled: boolean
  cancelDisabled: boolean
  onPickAll(): void
  onDelete(): void
  onCancelResearch(): void
  onDone(): void
}): JSX.Element {
  return (
    <div className="tracy-wo-my-bar tracy-wo-my-selbar" role="toolbar" aria-label={t('select.bar')}>
      <Checkbox
        checked={pick === 'all'}
        indeterminate={pick === 'some'}
        onCheckedChange={onPickAll}
        aria-label={t('select.allShown')}
      />
      <b className="tracy-wo-my-selcount" aria-live="polite">
        {t('select.count', { count })}
      </b>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="tracy-wo-my-danger"
        disabled={busy || deleteDisabled}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
        {t('delete.button')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || cancelDisabled}
        onClick={onCancelResearch}
      >
        <X aria-hidden="true" />
        {t('bulk.cancel')}
      </Button>
      <span className="tracy-wo-my-bar-grow" aria-hidden="true" />
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        {t('select.done')}
      </Button>
    </div>
  )
}
