/**
 * Leaving a site: ONE flow behind both doors that offer it — My Sites' `…` → Leave site, and the dsh
 * sidebar's site row on a site page (`site-row-menu.tsx`). Both open the same `LeaveDialog` and run
 * this.
 *
 * Leaving the site the page stands in takes away the seat this page runs on, so the page moves to
 * `/`, where tracy-web picks the viewer's next site, their invitations, or the creation workspace —
 * the same landing a delete of the current site takes (`after-delete.ts`). Any other site: the
 * dialog closes and the readers re-read.
 *
 * The last Owner cannot leave (ADR 0036); the menus grey the row, and the seat book refuses the
 * leave anyway — that refusal is written here in the reader's words (`row-errors.ts`).
 */
import { landingAfterDelete } from './after-delete.ts'
import { rowErrorKey } from './row-errors.ts'
import type { Translate } from './strings.ts'

export interface SiteLeaveInput {
  siteKey: string
  /** The site this page stands in (`siteKeyHere`, resolved to a key), or null. */
  current: string | null
  t: Translate
  /** The dialog's busy state. */
  setBusy: (busy: boolean) => void
  /** Write a failure sentence where the person will read it (the dialog it was pressed in). */
  tellFailure: (sentence: string) => void
  /** Close the leave dialog. */
  closeDialog: () => void
  /** The site book changed: every reader on the page re-reads. */
  changed: () => void
  fetch?: typeof fetch
  /** Leave the page (`location.replace`, so Back does not return to a page with no seat behind it). */
  navigate?: (to: string) => void
}

/**
 * Leave a site, from the press to wherever the page ends up.
 * @param input - the site, the caller's dialog hooks, and the page's seams.
 */
export async function runSiteLeave(input: SiteLeaveInput): Promise<void> {
  const { siteKey, t } = input
  const send = input.fetch ?? globalThis.fetch
  const navigate = input.navigate ?? ((to: string) => window.location.replace(to))
  input.setBusy(true)
  let ok = false
  try {
    const res = await send(`/api/sites/${encodeURIComponent(siteKey)}/leave`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    })
    if (res.ok) {
      ok = true
    } else {
      let code: string | undefined
      try {
        code = ((await res.json()) as { code?: string }).code
      } catch {
        code = undefined
      }
      input.tellFailure(t(rowErrorKey(res.status, code)))
    }
  } catch {
    input.tellFailure(t('error.failed'))
  } finally {
    input.setBusy(false)
  }
  if (!ok) return
  input.closeDialog()
  const landing = landingAfterDelete(siteKey, input.current)
  if (landing !== null) {
    navigate(landing)
    return
  }
  input.changed()
}
