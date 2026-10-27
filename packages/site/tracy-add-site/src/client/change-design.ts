/**
 * "Change design" on the Add site wizard's template card (Akemi, 30/09, option C of the card bench):
 * a click on the card opens the Design inspiration tab, where the customer picks another look.
 *
 * The way back is not here: choosing a design in the gallery reopens `tracy:add-site` with `design`
 * and `platform` in its meta (`tracy-design-inspiration`), which the wizard reads as a press
 * (`platformPressOf` → `press-state.mjs`).
 *
 * The CMS the wizard is on travels along (Akemi, 30/09): the gallery ticks that CMS's chip
 * (`tracy-design-inspiration` `platform-press.mjs`). `pressedAt` makes each press its own, so a
 * second press ticks the chip again after the customer unticked it.
 */
import { openTabWithMeta, type SidebarRight, type TabOpener } from '@tracy/core/tab-link'

/** The gallery's tab type, as `tracy-design-inspiration` registers it. */
export const DESIGN_TAB = 'tracy:design-inspiration'

/**
 * Open (or focus) the Design inspiration tab in dsh's right column, filtered to the wizard's CMS.
 * @param sidebar - `ctx.betterSidebar`.
 * @param right - `sidebarRightOf(ctx)`, read at click time: the column mounts after the plugin.
 * @param platform - the CMS picked in the wizard; none opens the gallery unfiltered.
 * @param now - the press time (injectable for tests).
 */
export function openDesignGallery(
  sidebar: TabOpener,
  right: SidebarRight | undefined,
  platform?: string,
  now: () => number = Date.now,
  previewDesign?: string
): void {
  openTabWithMeta(
    sidebar,
    right,
    platform === undefined
      ? { type: DESIGN_TAB }
      : {
          type: DESIGN_TAB,
          meta: { platform, pressedAt: now(), ...(previewDesign ? { previewDesign } : {}) }
        }
  )
}
