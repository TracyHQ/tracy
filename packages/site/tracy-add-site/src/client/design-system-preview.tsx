/**
 * The preview popup a system card of the Design system sheet opens (Akemi, 12/10/2026): the template picked in this
 * form, wearing that system, before the site exists. Asked only when the popup opens (`readPreview`, the tracy-web door
 * `GET /api/design-system/preview`): the grid never renders a template.
 *
 * Drawn like the Design system tab's popup (`tracy-design-inspiration` `SystemPreviewDialog.tsx`, Akemi 12/10/2026):
 * the shared `@tracy/ui` Dialog at 98vw × 96vh with its backdrop, X and Escape; ONE header row, the shared
 * `PreviewHeader` of `@tracy/ui` so both popups read the same: the pager over the sheet's filtered cards, the system's
 * name (its description in the tooltip), its palette and which demo it is shown on; on the right the primary
 * Use <name> (picks the system: the popup and the sheet close and the card says "<name> selected"), then the dialog's
 * own X, which closes the popup and leaves the sheet. A second row holds the Desktop | Mobile switch; then the frame on
 * the muted ground (`design-system-stage.tsx`, a port of the gallery's, not an import: a plugin never imports another
 * plugin's internals). A template with two modes (the door's `modes`, 14/10/2026) also gets Light | Dark in that row,
 * opening on the system's own side (`previewModeOf`), as the Design system tab's popup does. No footer. LIVE (18/10/2026):
 * the door answers the demo itself at its own address with a signed ticket (`readPreview` `live`), framed with the
 * page's scripts running on its own origin, so it shows what Try on shows; a door from before that answers the static
 * page, which sits in `<iframe sandbox="" srcDoc>` as before: nothing in it can script or reach the host. A platform the door cannot preview yet, or a template with no live demo, says so in the frame, and Use <name>
 * still works.
 */
import { Button } from '@tracy/ui'
import { type JSX, type RefObject, useEffect, useState } from 'react'

import type { LibraryRow } from './design-system-pick.mjs'
import { previewModeOf, readPreview, swatchesOf } from './design-system-pick.mjs'
import { PreviewStage, type StageDevice, type StageTheme } from './design-system-stage'
import { PreviewDialog } from './preview-dialog'
import type { Translate } from './strings'

type Preview =
  | { at: 'loading' }
  | { at: 'ready'; html: string; modes?: true }
  | { at: 'ready'; src: string; mode: StageTheme | null; modes?: true }
  | { at: 'unavailable' }
  | { at: 'failed' }

export interface DesignSystemPreviewProps {
  t: Translate
  row: LibraryRow
  template: string
  /** The platform as the form names it ("Joomla"), for the not-available line. */
  platformLabel: string
  quickstart: string | undefined
  platform: string | undefined
  /** Where focus goes when the popup closes: the card that opened it. */
  returnTo: RefObject<HTMLElement | null>
  onUse: () => void
  onBack: () => void
  /** Where this system sits in the sheet's filtered cards; with `onStep`, the header shows the pager. */
  position?: { index: number; total: number } | null
  onStep?: ((dir: -1 | 1) => void) | null
}

export function DesignSystemPreview({
  t,
  row,
  template,
  platformLabel,
  quickstart,
  platform,
  returnTo,
  onUse,
  onBack,
  position,
  onStep
}: DesignSystemPreviewProps): JSX.Element {
  const [preview, setPreview] = useState<Preview>({ at: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [device, setDevice] = useState<StageDevice>('desktop')
  /** The side pressed in Light | Dark; null: the side the page opens on (`previewModeOf`). A new system starts over. */
  const [picked, setPicked] = useState<StageTheme | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new system opens on its own side again.
  useEffect(() => setPicked(null), [row.id])
  useEffect(() => {
    let live = true
    setPreview({ at: 'loading' })
    void readPreview({ quickstart, platform, id: row.id, live: true }).then((p) => {
      if (live) setPreview(p as Preview)
    })
    return () => {
      live = false
    }
  }, [quickstart, platform, row.id, attempt])

  const ready = preview.at === 'ready' ? preview : null
  const liveSrc = ready && 'src' in ready ? ready.src : null
  /**
   * The side the live page really shows, as its script reports it (18/10/2026: JA Vega under Moxie lit "Dark" while
   * the page opened on its template's light default); null until it says, or for a page that cannot.
   */
  const [shown, setShown] = useState<{ src: string; side: StageTheme } | null>(null)
  /** The side asked of the page: the one pressed, else the system's own (the door's mode line). */
  const theme: StageTheme | null = ready?.modes
    ? (picked ??
      ('src' in ready ? ready.mode : null) ??
      previewModeOf('html' in ready ? ready.html : null, row.theme))
    : null
  /** The side the switch lights: what the live frame shows once it said so, else the side asked. */
  const lit: StageTheme | null = theme && liveSrc && shown?.src === liveSrc ? shown.side : theme

  const message =
    preview.at === 'unavailable' ? (
      <p className="m-0 max-w-md" data-preview-unavailable="1">
        {t('ds_preview_unavailable', { template, platform: platformLabel })}
      </p>
    ) : preview.at === 'failed' ? (
      <span className="flex flex-col items-center gap-2" role="alert">
        <p className="m-0">{t('ds_preview_failed')}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t('ds_retry')}
        </Button>
      </span>
    ) : null

  return (
    <PreviewDialog
      t={t}
      name={row.name}
      description={row.description}
      swatches={swatchesOf(row)}
      returnTo={returnTo}
      onUse={onUse}
      onBack={onBack}
      position={position}
      onStep={onStep}
      pagerLabels={{ previous: t('ds_preview_prev'), next: t('ds_preview_next') }}
      actionAttributes={{ 'data-design-system-use': '1' }}
      attributes={{ 'data-design-system-preview': row.id, 'data-preview-state': preview.at }}
      lead={
        preview.at === 'ready' || preview.at === 'loading' ? (
          <span className="shrink-0 truncate text-muted-foreground text-xs">
            {t('ds_preview_on', { template })}
          </span>
        ) : null
      }
      device={device}
      onDevice={setDevice}
      theme={lit ? { value: lit, onTheme: setPicked } : null}
    >
      <PreviewStage
        device={device}
        doc={ready && 'html' in ready ? ready.html : null}
        src={liveSrc}
        pushTheme={picked !== null}
        title={t('ds_preview_frame', { name: row.name, template })}
        loadingLabel={t('ds_preview_loading')}
        message={message}
        frameAttrs={{ 'data-design-system-preview-frame': '1' }}
        theme={theme}
        onShown={(side) => liveSrc && setShown({ src: liveSrc, side })}
      />
      {/* A static page runs without its scripts (sandbox), so say once that some effects may be missing; the live
            frame runs them. */}
      {ready && 'html' in ready ? (
        <p
          className="m-0 px-5 py-2 text-center text-muted-foreground text-xs"
          data-design-system-preview-note="1"
        >
          {t('ds_preview_static_note')}
        </p>
      ) : null}
    </PreviewDialog>
  )
}
