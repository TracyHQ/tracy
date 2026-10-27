/**
 * The try-on popup of the Design system tab (Akemi, 12/10/2026: "while trying on, open a popup, like
 * pressing Open preview"). Same shell as the Design inspiration preview (`PreviewDialog.tsx`): the
 * tracy-ui Dialog at 98vw × 96vh (the size of the tab's own preview popup, `SystemPreviewDialog.tsx`), a header row, a body that fills, a footer row.
 *
 * Header: the system's name, "Trying on your site", and the font line when fonts stand in for others.
 * Body: the customer's own site, live, laid out at desktop width and fitted to the dialog, loaded afresh
 * after each apply; a loading veil while the system is being put on or the page is loading.
 * Footer: "<Name> is on your site now", the way back, Undo (the undo door for this try) and Keep.
 *
 * Closing with X, Escape or the backdrop is Keep: the system stays, nothing is undone. While a door is
 * being pressed the dialog stays open, so a close never races a write.
 */
import { Button, cn, Dialog, DialogContent, DialogTitle, TracyMark } from '@tracy/ui'
import { Check, Undo2 } from 'lucide-react'
import { type JSX, type ReactNode, type RefObject, useRef, useState } from 'react'

import type { LibrarySystem } from './design-system-library.mjs'
import { FontLine } from './DesignSystemParts'
import type { Translate } from './strings'
import { useFitScale } from './useFitScale'

/** The width the live site is laid out at before it is fitted to the dialog: its desktop layout. */
const LIVE_WIDTH = 1280

export interface TryOnDialogProps {
  /** The system being tried on (the popup is open while this is set). */
  system: { id: string; name: string; fonts: LibrarySystem['fonts'] }
  /** The site's served address with a fresh-load counter, or null when it has none yet. */
  url: string | null
  /** Shown instead of the live site when it has no address: the system's own picture. */
  fallback: ReactNode
  busy: 'apply' | 'undo' | null
  /** True once the system is on the site (the apply door said yes). */
  on: boolean
  /** "Keep it, or undo to go back to …", once the system is on. */
  backLine: string | null
  /** The door's refusal, said in the footer. */
  error: string | null
  canUndo: boolean
  onUndo: () => void
  /** Keep: closes the popup, the system stays. Also what X, Escape and the backdrop do. */
  onKeep: () => void
  /** Where focus goes when the popup closes: the card that opened the preview. */
  returnTo?: RefObject<HTMLElement | null>
  t: Translate
}

export function TryOnDialog(p: TryOnDialogProps): JSX.Element {
  const { system, busy, on, t } = p
  return (
    <Dialog open onOpenChange={(v) => !v && busy === null && p.onKeep()}>
      <DialogContent
        closeLabel={t('action.close')}
        finalFocus={p.returnTo}
        className="tracy-design-inspiration flex h-[96vh] max-w-[98vw] flex-col gap-0 p-0 sm:max-w-[98vw]"
        data-try-on-dialog={system.id}
        data-state-try={busy === 'apply' ? 'applying' : busy === 'undo' ? 'undoing' : on ? 'on' : 'failed'}
      >
        <div className="relative flex items-center gap-3 border-border border-b px-5 py-3">
          <DialogTitle className="min-w-0 truncate font-semibold text-base">{system.name}</DialogTitle>
          <span className="shrink-0 text-muted-foreground text-xs" data-try-on-site="">
            {t('ds.try.trying')}
          </span>
          <div className="mr-8 ml-auto min-w-0 truncate">
            <FontLine fonts={system.fonts} t={t} />
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/40">
          {p.url ? (
            <LiveFrame
              url={p.url}
              title={t('ds.live.title', { name: system.name })}
              hold={busy === 'apply'}
              holdText={t('ds.try.loading', { name: system.name })}
            />
          ) : (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">{p.fallback}</div>
              <p className="m-0 border-border border-t px-5 py-2 text-muted-foreground text-xs">
                {t('ds.try.noAddress')}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-border border-t px-5 py-3" role="status">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
            {p.error ? (
              <span className="text-destructive text-sm" data-try-on-error="">
                {p.error}
              </span>
            ) : on ? (
              <>
                <span className="font-semibold text-sm">{t('ds.try.title', { name: system.name })}</span>
                {p.backLine ? <span className="text-muted-foreground text-xs">{p.backLine}</span> : null}
              </>
            ) : (
              <span className="text-muted-foreground text-sm">
                {t('ds.try.loading', { name: system.name })}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {on ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || !p.canUndo}
                onClick={p.onUndo}
                data-try-on-undo=""
              >
                <Undo2 size={14} aria-hidden="true" />
                {busy === 'undo' ? t('ds.undoing') : t('ds.undo')}
              </Button>
            ) : null}
            <Button size="sm" disabled={busy !== null} onClick={p.onKeep} data-try-on-keep="">
              {on ? <Check size={14} aria-hidden="true" /> : null}
              {on ? t('ds.keep') : t('action.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The live site at desktop width, fitted to the body and scrollable inside. A veil with the Tracy mark
 * covers it while the system is being put on (`hold`) and until the fresh page has loaded.
 */
function LiveFrame({
  url,
  title,
  hold,
  holdText
}: {
  url: string
  title: string
  hold: boolean
  holdText: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const scale = useFitScale(ref, LIVE_WIDTH)
  const [loaded, setLoaded] = useState<string | null>(null)
  const loading = hold || loaded !== url
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" data-live-site="">
      {hold ? null : (
        <iframe
          key={url}
          src={url}
          title={title}
          onLoad={() => setLoaded(url)}
          className="absolute top-0 left-0 origin-top-left border-0 bg-background"
          style={{ width: LIVE_WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}
        />
      )}
      <div
        className={cn(
          'absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm transition-opacity',
          loading ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        data-live-loading={loading ? 'true' : 'false'}
        aria-hidden={!loading}
      >
        <span className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
          <TracyMark size={28} className="animate-[spin_3s_linear_infinite]" />
          {holdText}
        </span>
      </div>
    </div>
  )
}
