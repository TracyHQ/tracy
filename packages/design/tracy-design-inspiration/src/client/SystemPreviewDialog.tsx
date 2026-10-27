/**
 * The preview popup a card of the running site's Design system tab opens (12/10/2026), drawn like the Design templates
 * gallery's popup (`PreviewDialog.tsx` with `TemplateBody.tsx`, Akemi 12/10/2026): the shared `@tracy/ui` Dialog at
 * 98vw × 96vh with its backdrop, X and Escape; ONE header row, the shared `PreviewHeader` of `@tracy/ui` (the Add site
 * form's Design system popup draws the same one): the pager over the tab's filtered cards, the system's name (its description in the name's tooltip, as the
 * gallery keeps the category there), the palette and "On your site" on the left; the font line and the primary Try on
 * your site where the gallery puts Create with; the dialog's own X closes. Then a second row with the Desktop | Mobile
 * switch and the frame on the muted ground. No footer: everything it held moved into the header. Why Try on is off (a
 * viewer, a template that cannot wear a system) is a centred notice over the stage (Akemi, 13/10/2026, D3), not text
 * beside the button; the button stays off in the quiet variant. A preview the door cannot make (409, a template
 * without a slot) is said through the SAME notice, with the door's reason (`previewUnavailableKeyOf`), over an
 * empty stage: measured 13/10/2026 on tracy.ai, the frame held one bare line and no reason.
 *
 * LIVE (Akemi, 17/10/2026: the popup did not look like the page after Try on): the door now answers the site itself at
 * its own address with a signed ticket (`readSitePreview` `src`), and the frame loads it with the page's scripts running,
 * the same bytes laid in by the site proxy, so carousels, sticky headers and lazy pictures come out as Try on shows them.
 * The static page below is what a door from before that still answers.
 *
 * Body: THE CUSTOMER'S OWN SITE wearing the system (Akemi, 12/10/2026): the home page the site serves now, with the bytes
 * an apply would write laid in by tracy-web (`GET /api/sites/:key/design-system/preview`, `readSitePreview`), framed the
 * way the gallery frames a live demo (`preview-stage.tsx`), in `<iframe sandbox="" srcDoc>`: nothing in it can script
 * or reach the host. Asked only when the popup opens; NOTHING IS WRITTEN to the site. Loading (the gallery's boot
 * cover), failed (Try again) and not available (WordPress, a template that cannot wear one) are said inside the frame.
 *
 * Light | Dark (14/10/2026): a template with two modes (`modes`, its contract wears both sides of its switch) gets the
 * gallery's Light | Dark switch beside Desktop | Mobile, because the framed page runs no script and its own toggle
 * cannot be pressed. It opens on the system's own side (`previewModeOf`: the sheet's mode line) and only repaints the
 * frame (`PreviewStage` `theme`); nothing is written.
 *
 * Try on your site runs the existing apply flow with Keep / Undo, handed back to the tab; what a design system changes is
 * that button's tooltip. Focus returns to the card that opened the popup.
 */
import { Button, Dialog, DialogContent, PreviewHeader, PreviewHeaderAction } from '@tracy/ui'
import { type JSX, type RefObject, useEffect, useState } from 'react'

import { previewModeOf, previewUnavailableKeyOf, readSitePreview } from './design-system-door.mjs'
import type { LibrarySystem } from './design-system-library.mjs'
import { FontLine } from './DesignSystemParts'
import { DeviceRow, PreviewStage, type StageDevice, type StageTheme } from './preview-stage'
import { swatchesOf } from './design-system-card-parts.mjs'
import type { Key, Translate } from './strings'

type Preview =
  | { at: 'loading' }
  | { at: 'ready'; html: string }
  | { at: 'ready'; src: string; mode: StageTheme | null }
  | { at: 'unavailable'; reason: string | null }
  | { at: 'failed' }

export interface SystemPreviewDialogProps {
  s: LibrarySystem
  t: Translate
  /** The site whose home page the preview shows. */
  siteKey: string | null
  /** The template the tab's read answered: the door judges the contract from it without reading the site again. */
  template: string | null
  /** The template has a light/dark switch its contract wears both sides of: the popup offers Light | Dark. */
  modes?: boolean
  /** Where focus goes when the popup closes: the card that opened it. */
  returnTo: RefObject<HTMLElement | null>
  /**
   * What the primary button does: `try` (Try on your site) on a system's popup; `undo` on the Template default card's
   * (the way back to the template's own look, `template-default-action.mjs`), marked `data-undo-worn` instead of
   * `data-try-on`.
   */
  action?: 'try' | 'undo'
  /** The primary button's word: "Try on your site", or "Putting it on…" while a door is pressed. */
  tryLabel: string
  canTry: boolean
  /** Why Try on is off (viewer, unsupported template, already worn), said over the stage; null when it is on. */
  reason: string | null
  onTry: () => void
  onClose: () => void
  /** Where this system sits in the tab's filtered cards; with `onStep`, the header shows the pager. */
  position?: { index: number; total: number } | null
  onStep?: ((dir: -1 | 1) => void) | null
}

export function SystemPreviewDialog(p: SystemPreviewDialogProps): JSX.Element {
  const { s, t, siteKey, template } = p
  const [preview, setPreview] = useState<Preview>({ at: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [device, setDevice] = useState<StageDevice>('desktop')
  /** The side pressed in Light | Dark; null: the side the page opens on (`previewModeOf`). A new system starts over. */
  const [picked, setPicked] = useState<StageTheme | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new system opens on its own side again.
  useEffect(() => setPicked(null), [s.id])
  useEffect(() => {
    let live = true
    setPreview({ at: 'loading' })
    void readSitePreview({ siteKey, id: s.id, template }).then((r) => {
      if (live) setPreview(r as Preview)
    })
    return () => {
      live = false
    }
  }, [siteKey, s.id, template, attempt])

  const ready = preview.at === 'ready' ? preview : null
  const liveSrc = ready && 'src' in ready ? ready.src : null
  /**
   * The side the live page really shows, as its script reports it (18/10/2026: JA Vega under Moxie lit "Dark" while
   * the page opened on its template's light default); null until it says, or for a page that cannot.
   */
  const [shown, setShown] = useState<{ src: string; side: StageTheme } | null>(null)
  /** The side asked of the page: the one pressed, else the system's own (the door's mode line). */
  const theme: StageTheme | null = p.modes
    ? (picked ??
      (ready && 'src' in ready ? ready.mode : null) ??
      previewModeOf(ready && 'html' in ready ? ready.html : null, s.theme))
    : null
  /** The side the switch lights: what the live frame shows once it said so, else the side asked. */
  const lit: StageTheme | null = theme && liveSrc && shown?.src === liveSrc ? shown.side : theme

  // Not available: the stage stays empty (the loader down) and the notice over it says why.
  const message =
    preview.at === 'unavailable' ? (
      <span aria-hidden="true" data-preview-empty="" />
    ) : preview.at === 'failed' ? (
      <span className="flex flex-col items-center gap-2" role="alert">
        <p className="m-0">{t('ds.preview.failed')}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t('ds.retry')}
        </Button>
      </span>
    ) : null

  return (
    <Dialog open onOpenChange={(open) => !open && p.onClose()}>
      <DialogContent
        closeLabel={t('action.close')}
        finalFocus={p.returnTo}
        className="tracy-design-inspiration flex h-[96vh] max-w-[98vw] flex-col gap-0 p-0 sm:max-w-[98vw]"
        data-system-preview={s.id}
        data-preview-state={preview.at}
      >
        <PreviewHeader
          pager={
            p.position && p.onStep && p.position.total > 1
              ? {
                  position: t('dialog.position', { index: p.position.index + 1, total: p.position.total }),
                  prevLabel: t('ds.preview.prev'),
                  nextLabel: t('ds.preview.next'),
                  onStep: p.onStep
                }
              : null
          }
          name={s.name}
          description={s.description}
          swatches={swatchesOf(s)}
          lead={
            <span className="shrink-0 truncate text-muted-foreground text-xs" data-system-preview-site="">
              {t('ds.preview.on')}
            </span>
          }
        >
          <div className="min-w-0 truncate">
            <FontLine fonts={s.fonts} t={t} />
          </div>
          {/* Off (a viewer, an unsupported template, the system already worn): a quiet button, not the primary
              one dimmed (Akemi, 13/10/2026); the reason is the notice over the stage, and the button's tooltip. */}
          <PreviewHeaderAction
            variant={p.canTry ? 'default' : 'secondary'}
            disabled={!p.canTry}
            title={p.reason ?? t('ds.note')}
            onClick={p.onTry}
            {...(p.action === 'undo' ? { 'data-undo-worn': '' } : { 'data-try-on': s.id })}
          >
            {p.tryLabel}
          </PreviewHeaderAction>
        </PreviewHeader>

        <DeviceRow
          device={device}
          onDevice={setDevice}
          labels={{ group: t('dialog.device'), desktop: t('dialog.desktop'), mobile: t('dialog.mobile') }}
          theme={
            lit
              ? {
                  value: lit,
                  onTheme: setPicked,
                  labels: { group: t('dialog.theme'), light: t('dialog.light'), dark: t('dialog.dark') }
                }
              : null
          }
        />
        <PreviewStage
          device={device}
          doc={ready && 'html' in ready ? ready.html : null}
          src={liveSrc}
          pushTheme={picked !== null}
          title={t('ds.preview.frame', { name: s.name })}
          loadingLabel={t('ds.preview.loading')}
          message={message}
          notice={
            // The way back's refusal is said even while its button is on again (a press may be retried).
            p.reason && (!p.canTry || p.action === 'undo')
              ? p.reason
              : preview.at === 'unavailable'
                ? t(previewUnavailableKeyOf(preview.reason) as Key)
                : null
          }
          frameAttrs={{ 'data-system-preview-frame': '' }}
          theme={theme}
          onShown={(side) => liveSrc && setShown({ src: liveSrc, side })}
        />
        {/* A static page runs without its scripts (sandbox), so say once that some effects may be missing; the live
            frame runs them. */}
        {ready && 'html' in ready ? (
          <p className="m-0 px-5 py-2 text-center text-muted-foreground text-xs" data-system-preview-note="">
            {t('ds.preview.staticNote')}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
