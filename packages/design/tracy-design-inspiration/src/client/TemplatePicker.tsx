/**
 * Reuse the template gallery and its CMS preview buttons without opening Add site or chat. Opened for a business of
 * a known trade, the gallery groups its cards by the server's `ranking` (`trade-groups.mjs`): the trade's own cards
 * first, marked Recommended, in the grid itself (the owner chose this over a separate suggestion block, 26/10/2026).
 */
import { type JSX, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Dialog, DialogContent, DialogTitle, Spinner } from '@tracy/ui'
import { TEMPLATE_PICK_EVENT, type TemplatePick, type TemplateRanking } from '@tracy/core/template-picker'
import { fetchCatalog, type Inspiration } from './api'
import { Gallery } from './Gallery'
import type { Translate } from './strings'

type Request = {
  resolve: (pick: TemplatePick | null) => void
  reject: (error: Error) => void
  ranking?: TemplateRanking | null
}

export function TemplatePicker({
  t,
  finish,
  ranking = null
}: {
  t: Translate
  finish: (pick: TemplatePick | null) => void
  ranking?: TemplateRanking | null
}): JSX.Element {
  const [rows, setRows] = useState<Inspiration[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(false)
    setRows(null)
    void fetchCatalog()
      .then((items) => {
        if (live)
          setRows(items.filter((row) => row.template && Object.keys(row.template.quickstarts).length > 0))
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [attempt])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null)
      }}
    >
      <DialogContent
        className="tracy-design-inspiration flex h-[96vh] w-[98vw] max-w-none flex-col overflow-hidden p-0 sm:max-w-none"
        closeLabel={t('action.close')}
        data-template-picker="1"
      >
        <DialogTitle className="m-0 border-b px-5 py-4 text-base">{t('tab.title')}</DialogTitle>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {failed ? (
            <div className="p-5" role="alert">
              <p>{t('state.failed')}</p>
              <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                {t('action.retry')}
              </Button>
            </div>
          ) : rows === null ? (
            <Spinner label={t('loading.label')} />
          ) : rows.length === 0 ? (
            <p className="p-5">{t('state.noLibrary')}</p>
          ) : (
            <Gallery
              inspirations={rows}
              site={null}
              publicMode={{
                build: (cms, row) => {
                  const quickstart = row.template?.quickstarts[cms]
                  if (quickstart) finish({ cms, quickstart, design: row.id })
                }
              }}
              ranking={ranking}
              t={t}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function mountTemplatePicker(t: Translate): () => void {
  const host = document.createElement('div')
  host.dataset.tracyTemplatePickerHost = ''
  document.body.append(host)
  const root = createRoot(host)
  let active: Request | null = null
  const finish = (pick: TemplatePick | null) => {
    const pending = active
    active = null
    root.render(null)
    pending?.resolve(pick)
  }
  const open = (event: Event) => {
    if (event.defaultPrevented) return
    event.preventDefault()
    const request = (event as CustomEvent<Request>).detail
    if (active) {
      request.reject(new Error('TEMPLATE_PICKER_BUSY'))
      return
    }
    active = request
    root.render(<TemplatePicker t={t} finish={finish} ranking={request.ranking ?? null} />)
  }
  window.addEventListener(TEMPLATE_PICK_EVENT, open)
  return () => {
    window.removeEventListener(TEMPLATE_PICK_EVENT, open)
    active?.resolve(null)
    active = null
    root.unmount()
    host.remove()
  }
}
