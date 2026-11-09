/**
 * The Details route of the Opportunities tab (spec #512, ticket #514): the Details page drawn full width, with a Back
 * control and a menu that holds Delete. Back pops the history entry the list pushed, so the browser's Back does the
 * same. A thin frame on purpose: the Details header (#515) takes Back and Delete into itself later.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { ArrowLeft, MoreHorizontal, Trash2 } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  buttonVariants
} from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { interfaceLocale } from '@tracy/core/interface-languages'

import type { Api } from './api.ts'
import { DeleteDialog } from './delete-dialog.tsx'
import { type DeleteAsk, deleteAsk, deleteFailedKey, deleteOpportunities } from './delete-model.ts'
import { pageAnswer } from './my-list.ts'
import type { RequestIds } from './request-ids.ts'
import type { Translate } from './strings.ts'

export function DetailsShell({
  t,
  api,
  ids,
  id,
  onBack,
  onDeleted,
  children
}: {
  t: Translate
  api: Api
  ids: RequestIds
  id: string
  onBack: () => void
  onDeleted: (id: string) => void
  children: ReactNode
}): JSX.Element {
  const locale = interfaceLocale() ?? 'en'
  const [ask, setAsk] = useState<DeleteAsk | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const askDelete = async (): Promise<void> => {
    setNote(null)
    const answer = await api.listPage(`ids=${id}`)
    const rows = answer.ok ? (pageAnswer(answer.body)?.rows ?? []) : []
    const next = deleteAsk(rows.length ? rows : [{ id }], new Set([id]))
    if (next === null) setNote(t('action.failed'))
    else setAsk(next)
  }
  const confirm = async (): Promise<void> => {
    if (ask === null || busy) return
    setBusy(true)
    const outcome = await deleteOpportunities(api, ids, ask.ids)
    setBusy(false)
    setAsk(null)
    if (!outcome.ok || !outcome.deleted.includes(id)) {
      setNote(t(outcome.ok ? 'action.failed' : deleteFailedKey(outcome.code)))
      return
    }
    onDeleted(id)
  }

  return (
    <div className="tracy-wo-details-shell">
      <div className="tracy-wo-details-bar">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} aria-label={t('my.back.label')}>
          <ArrowLeft aria-hidden="true" />
          {t('my.back')}
        </Button>
        <span className="tracy-wo-stages-grow" aria-hidden="true" />
        <DropdownMenu>
          {/* The trigger IS the button (React 18 drops a ref passed to a function component). */}
          <DropdownMenuTrigger
            type="button"
            className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
            aria-label={t('my.more')}
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => void askDelete()}>
              <Trash2 aria-hidden="true" />
              {t('delete.button')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {note !== null ? (
        <p className="tracy-wo-error" role="alert">
          {note}
        </p>
      ) : null}
      {children}
      <DeleteDialog
        t={t}
        locale={locale}
        ask={ask}
        busy={busy}
        onCancel={() => setAsk(null)}
        onConfirm={() => void confirm()}
      />
    </div>
  )
}
