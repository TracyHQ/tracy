/**
 * The Design system tab — what the site browser's Design system button opens (plan
 * `tasks/ke-hoach-nut-design-system.md`). No head (Akemi, 12/10/2026): the tab opens on the gallery's toolbar
 * (search, Categories, the count line; `DesignSystemFilter.tsx`), under only the lines that must be said
 * (unsupported, viewer, notice), then the library as a
 * grid of cards drawn like the Design templates gallery's (`DesignSystemGrid.tsx`). What the site wears is said
 * by the grid itself (Akemi, 13/10/2026, D2; `design-system-pinned.mjs`): the worn system's card is pinned first
 * with a "Wearing now" badge, and the synthetic "Template default" card sits right after it. When nothing is worn,
 * the Template default card is first and badged "Wearing now". There is no "Wearing now" row above the cards.
 * A card opens its preview popup (`SystemPreviewDialog.tsx`) whose primary button is **Try on <site>**. The
 * Template default card opens the same popup on the site wearing no system (14/10/2026), and its primary button is
 * the way back instead: "Back to template default", tried on like any card (15/10/2026: the apply door with
 * `template-default` takes the worn system off, and the try's bar offers Undo back to it), or a quiet "Your site
 * uses this look" when nothing is worn (`template-default-action.mjs`).
 *
 * TRY ON, THEN KEEP OR UNDO (Akemi, 12/10/2026, U3 A; landing 13/10/2026, option A). Try on applies for
 * real at once (the apply door); both popups close and the host brings the site's Browser panel in sight
 * (`onApplied`); a thin bar on the page (`TryBar.tsx`, in the plugin's own root, `try-bar-host.tsx`, over
 * the try the plugin module holds, `try-store.mjs`) says "<Name> is on your site now" with Undo (the undo
 * door) and Keep, right where the customer landed. The bar is not this tab's: the Browser tab takes this
 * tab's pane and unmounts it (13/10/2026). The tab does not repeat the sentence.
 * A new try while one is up undoes the first, so Undo still goes back to the look from before the first
 * try (`switchStepsOf`). The try-on popup (`TryOnDialog.tsx`) only stays up for a door's refusal.
 *
 * THE LIBRARY (U4 A, U5 A). Rows come from `GET /api/design-system/library` (`fetchLibrary`): Refero's
 * systems alone (Akemi, 12/10/2026: Refero only, every system that passes the gate, ~1,000), each with
 * its screenshot, real name and one-line description. OpenDesign is no longer offered; a site that
 * still wears one is still undone from the site browser's Undo or Site changes. A door that does not answer is said, with
 * Try again — no other list stands in for it. The cards are revealed in pages of thirty as the list
 * scrolls (`useReveal`, the gallery's own way), and their pictures load lazily.
 *
 * The try's state and presses are `useTryOn.ts`; the library, the site's address and the reveal are
 * `useDesignSystemSources.ts`; this file holds the site's read and lays the tab out.
 *
 * Nothing here is invented: a template that cannot wear a system, a Viewer seat, a refusal from the
 * door — each is said, with its reason, and the Apply button stays off.
 */
import { Button } from '@tracy/ui'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DesignSystemFilter } from './DesignSystemFilter'
import { SystemLibraryList, TEMPLATE_DEFAULT_ID } from './DesignSystemGrid'
import { SystemPicture } from './DesignSystemParts'
import {
  applyStateOf,
  closesLibrary,
  isVersionReason,
  readDesignSystem,
  unsupportedKeyOf
} from './design-system-door.mjs'
import { filterSystems, isFiltered, NO_FILTER, type SystemFilter } from './design-system-filter.mjs'
import { type LibrarySystem, libraryRowsOf, liveSiteUrlOf, undoTargetOf } from './design-system-library.mjs'
import { pinnedGridOf } from './design-system-pinned.mjs'
import { SystemPreviewDialog } from './SystemPreviewDialog'
import { templateDefaultActionOf } from './template-default-action.mjs'
import type { Key, Translate } from './strings'
import { TryOnDialog } from './TryOnDialog'
import { useReveal, useSiteRow, useSystemLibrary } from './useDesignSystemSources'
import { useTryOn } from './useTryOn'

interface Worn {
  id: string | null
  slotId: string
  name: string
}
interface Read {
  platform: string | null
  canApply: boolean
  refused: string[]
  worn: Worn | null
  template: string | null
  /** The thumbnail of the template the site was built from (the Template default card's picture), or null. */
  templateImage?: string | null
  /** Whether the template's contract wears both sides of its light/dark switch: the preview offers Light | Dark. */
  modes?: boolean
  supported: boolean
  reason?: string
  /** An imported site: no system can be previewed or applied, the tab shows one line (`closesLibrary`). */
  imported?: boolean
  /**
   * For a version reason: the release the site runs and the one the template needs, or the last one
   * confirmed to wear a system (`upTo`) when the site runs a newer one.
   */
  version?: { need: string | null; have: string | null; upTo?: string | null }
  last: {
    applyId: string
    id: string
    name: string | null
    previous: { id: string; name: string | null } | null
    undone: boolean
  } | null
}

export function DesignSystemTab({
  siteKey,
  t,
  onChanged,
  onApplied
}: {
  siteKey: string | null
  t: Translate
  /** Called after the site's look changed (apply or undo): the Browser tab reloads its page. */
  onChanged?: () => void
  /** Called once a try is on the site: the host brings the site's Browser panel in sight. */
  onApplied?: () => void
}): JSX.Element {
  const [read, setRead] = useState<Read | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  /** The toolbar's search, ticked categories and themes (`DesignSystemFilter.tsx`). */
  const [filter, setFilter] = useState<SystemFilter>(NO_FILTER)
  const [picked, setPicked] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  /** The card whose preview popup is open, and the card itself (focus goes back there when a popup closes). */
  const [previewing, setPreviewing] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  /** A key computed from a door's answer (`messageKeyOf`, `unsupportedKeyOf`): always one of `ds.*`. */
  const say = (key: string, params?: Record<string, string | number>): string => t(key as Key, params)

  const reload = useCallback(async () => {
    if (!siteKey) return
    const r = await readDesignSystem(siteKey)
    if (r.ok) {
      setRead(r.body as Read)
      setReadError(null)
    } else setReadError(r.code)
  }, [siteKey])

  /**
   * After a press: the door's answer carries the read as the site stands after the write (`read`),
   * taken in the write's own run — the panel shows it without asking the site again. A refusal, or an
   * older server, reads again.
   */
  const settle = async (r: { ok: boolean; body?: { read?: unknown } }): Promise<void> => {
    if (r.ok && r.body?.read && typeof r.body.read === 'object') {
      setRead(r.body.read as Read)
      setReadError(null)
    } else await reload()
  }

  const tryOn = useTryOn({ siteKey, read, t, say, reload, settle, onChanged, onApplied })
  const { busy, notice, trial, trying, reset: resetTry } = tryOn

  useEffect(() => {
    setRead(null)
    setReadError(null)
    resetTry()
    void reload()
  }, [reload, attempt, resetTry])

  const library = useSystemLibrary()
  const systems = library.systems
  const siteRow = useSiteRow(siteKey)

  /** Every system the tab offers (the count line's total), then what the toolbar lets through. */
  const offered = useMemo<LibrarySystem[] | null>(() => {
    if (!read || !systems) return null
    return libraryRowsOf(systems, read.refused, '')
  }, [systems, read])
  const rows = useMemo<LibrarySystem[] | null>(
    () => (offered ? filterSystems(offered, filter) : null),
    [offered, filter]
  )
  const chosen = useMemo<LibrarySystem | null>(() => {
    if (!picked) return null
    return systems?.find((x) => x.id === picked) ?? null
  }, [systems, picked])
  /** The worn card first, then the Template default card, unless the toolbar narrows (`design-system-pinned.mjs`). */
  const grid = useMemo(
    () => pinnedGridOf({ rows, worn: read?.worn ?? null, filtered: isFiltered(filter) }),
    [rows, read?.worn, filter]
  )
  /** The cards a preview's pager walks: the grid's order, minus a synthetic card (nothing to preview). */
  const walk = useMemo(() => grid.rows?.filter((r) => !r.synthetic) ?? null, [grid])
  // A new search or tick starts the grid again at its first thirty.
  const reveal = useReveal(grid.rows?.length ?? 0, filter)
  const apply = applyStateOf({ read, picked, busy: busy !== null })
  const liveUrl = liveSiteUrlOf(siteRow?.copyUrl, tryOn.round)

  /** A press on a card (or Enter / Space): its preview popup. Trying it on is the popup's primary button. */
  const open = (id: string, card: HTMLElement): void => {
    opener.current = card
    setPicked(id)
    setPreviewing(id)
  }

  if (!siteKey) return <div className="p-4 text-muted-foreground text-sm">{t('ds.noSite')}</div>
  if (readError)
    return (
      <div className="flex flex-col items-start gap-3 p-4 text-sm" role="alert">
        <p>{t('ds.error.read')}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t('ds.retry')}
        </Button>
      </div>
    )
  if (!read) return <div className="p-4 text-muted-foreground text-sm">{t('ds.loading')}</div>
  // An imported site can wear no system (Akemi, 15/10/2026): its one line instead of the library.
  if (closesLibrary(read))
    return (
      <div className="p-4 text-muted-foreground text-sm" data-unsupported={read.reason ?? ''}>
        {say(unsupportedKeyOf(read.reason))}
      </div>
    )

  const back = trial ? undoTargetOf(trial) : null
  // The Template default card's popup: the site wearing no system, a card of its own words (nothing invented: no
  // palette, no fonts), never one of the pager's cards.
  const onDefault = previewing === TEMPLATE_DEFAULT_ID
  const preview: LibrarySystem | null = onDefault
    ? {
        id: TEMPLATE_DEFAULT_ID,
        kind: 'refero',
        name: t('ds.default.title'),
        description: t('ds.default.line'),
        group: '',
        theme: null,
        image: read.templateImage ?? null,
        fonts: [],
        colors: [],
        ok: true
      }
    : previewing
      ? (systems?.find((x) => x.id === previewing) ?? null)
      : null
  // Where the open popup sits in the cards shown: -1 when the filter no longer shows it (no pager then).
  const previewIndex = preview && walk ? walk.findIndex((r) => r.id === preview.id) : -1
  // The Template default popup's action: "Back to template default", pressed like Try on (`template-default-action.mjs`).
  const wayBack = templateDefaultActionOf({ read, trial })
  // The popups say "your site", never its name (Akemi, 12/10/2026).
  const tryLabel = busy === 'apply' ? t('ds.tryingOn') : t('ds.tryOn')
  return (
    <div className="tracy-design-inspiration flex h-full min-h-0 flex-col" data-design-system-tab="">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* A template release outside its contract's window says nothing here (Akemi, 12/10/2026): the cards stay and
            Try on stays off; an admin updates the contract in /ops. */}
        {!read.supported && !isVersionReason(read.reason) ? (
          <p className="m-0 text-muted-foreground text-sm" data-unsupported={read.reason ?? ''}>
            {say(unsupportedKeyOf(read.reason))}
          </p>
        ) : null}
        {read.supported && !read.canApply ? (
          <p className="m-0 text-muted-foreground text-sm">{t('ds.viewer')}</p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className={
              notice.tone === 'error'
                ? 'm-0 text-destructive text-sm'
                : 'm-0 flex flex-wrap items-center gap-2 text-sm'
            }
            data-notice={notice.tone}
          >
            {notice.text}
          </p>
        ) : null}
        {/* The toolbar stays put while the cards scroll under it, as the gallery's does (`Gallery.tsx`). The band
            paints the pane's own ground (--tsb-surface, the column colour tracy-sidebar sets), so cards pass under it. */}
        {offered ? (
          <div
            className="sticky -top-3 z-10 -mx-3 flex flex-col gap-3 bg-[var(--tsb-surface,var(--background))] p-3 first:-mt-3"
            data-library-count={offered.length}
          >
            <DesignSystemFilter
              rows={offered}
              value={filter}
              onChange={setFilter}
              shown={rows?.length ?? 0}
              t={t}
            />
          </div>
        ) : null}
        <SystemLibraryList
          grid={grid}
          error={library.error}
          onRetry={library.retry}
          reveal={reveal}
          worn={read.worn}
          template={read.template}
          templateImage={read.templateImage ?? null}
          t={t}
          onOpen={open}
        />
      </div>

      {preview && !trying ? (
        <SystemPreviewDialog
          s={preview}
          t={t}
          siteKey={siteKey}
          template={read.supported ? (read.template ?? null) : null}
          modes={read.modes === true}
          returnTo={opener}
          action={onDefault ? 'undo' : 'try'}
          tryLabel={onDefault ? say(wayBack.label.key, wayBack.label.params) : tryLabel}
          canTry={onDefault ? wayBack.enabled : apply.enabled}
          reason={
            onDefault
              ? wayBack.reason
                ? say(wayBack.reason.key)
                : null
              : apply.reasonKey && apply.reasonKey !== 'ds.pick'
                ? say(apply.reasonKey)
                : null
          }
          position={previewIndex >= 0 && walk ? { index: previewIndex, total: walk.length } : null}
          onStep={
            previewIndex >= 0 && walk
              ? (dir) => {
                  // Walk the cards as shown and wrap at both ends, as the gallery's pager does.
                  const next = walk[(previewIndex + dir + walk.length) % walk.length]
                  if (!next) return
                  setPicked(next.id)
                  setPreviewing(next.id)
                }
              : null
          }
          onClose={() => setPreviewing(null)}
          onTry={() => {
            // The way back is a try like any other: the template's own look goes on, the bar offers Undo to the system.
            setPreviewing(null)
            void tryOn.tryOn(preview.id, preview.name, preview.fonts)
          }}
        />
      ) : null}

      {trying ? (
        <TryOnDialog
          system={trying}
          url={liveUrl}
          fallback={
            chosen && chosen.id === trying.id ? <SystemPicture image={chosen.image} height="h-full" /> : null
          }
          busy={busy}
          on={trial !== null && trial.current.id === trying.id}
          backLine={back ? say(back.key, back.params) : null}
          error={tryOn.tryError}
          canUndo={trial?.applyId != null && read.canApply}
          onUndo={() => void tryOn.undoTrial()}
          onKeep={tryOn.keep}
          returnTo={opener}
          t={t}
        />
      ) : null}
    </div>
  )
}
