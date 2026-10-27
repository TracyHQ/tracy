/**
 * Deleting a site: ONE flow behind both doors that offer it — My Sites' `…` → Delete site…, and the
 * dsh sidebar's site row on a site page (`site-row-menu.tsx`). Both open the same `DeleteDialog`
 * and run this; a second copy would drift on exactly the parts that took the longest to get right
 * (the double press, the cover, #801's notice).
 *
 * What the caller keeps: the dialog (its busy state, where a failure is written, when it closes),
 * and what "the site book changed" means on its surface. What lives here: the order of everything
 * else, decided once.
 */
import { landingAfterDelete } from './after-delete.ts'
import { type CoverDocument, mountDeletingCover } from './deleting-cover.ts'
import { type DeleteAnswer, type DeleteOutcome, readDeleteAnswer } from './delete-response.ts'
import { rowErrorKey } from './row-errors.ts'
import type { Translate } from './strings.ts'

/**
 * The sites a DELETE is in flight for. Module state on purpose: two presses in one tick both run
 * before the dialog's button is redrawn disabled, the tab that sent the request can be unmounted
 * and mounted again while it runs (`deleting-cover.ts`), and the two doors share it. A delete is
 * never sent twice.
 */
const removing = new Set<string>()

/** The answer that is not a confirmed complete delete: what the notice tells (`delete-result.tsx`). */
type NoticeOutcome = Exclude<DeleteOutcome, { kind: 'complete' }>

export interface SiteDeleteInput {
  siteKey: string
  /** The name the site is shown by, read before the request (once the row is gone it is unknown). */
  siteName: string
  /** The site this page stands in (`siteKeyHere`, resolved to a key), or null. */
  current: string | null
  t: Translate
  /** The dialog's busy state: the teardown is slow and the button spins rather than closing. */
  setBusy: (busy: boolean) => void
  /** Write a failure sentence where the person will read it (the dialog it was pressed in). */
  tellFailure: (sentence: string) => void
  /** Close the delete dialog. */
  closeDialog: () => void
  /** The site book changed: every reader on the page re-reads. */
  changed: () => void
  /** The notice for an answer that is not a complete delete; resolves once acknowledged (`showDeleteResult`). */
  showResult: (
    doc: Document,
    notice: { siteKey: string; siteName: string; outcome: NoticeOutcome; cover: boolean; t: Translate }
  ) => Promise<void>
  document?: Document
  fetch?: typeof fetch
  /** Leave the page (`location.replace`, so Back does not return to a dead address). */
  navigate?: (to: string) => void
  mountCover?: (doc: CoverDocument, content: Parameters<typeof mountDeletingCover>[1]) => () => void
  /** The cover's mark (outline and colour), from `@tracy/ui/brand`. */
  mark?: { path: string; color: string }
}

/**
 * Delete a site, from the press to wherever the page ends up.
 * @param input - the site, the caller's dialog hooks, and the page's seams.
 */
export async function runSiteDelete(input: SiteDeleteInput): Promise<void> {
  const { siteKey, siteName, current, t } = input
  if (removing.has(siteKey)) return
  removing.add(siteKey)
  const doc = input.document ?? globalThis.document
  const send = input.fetch ?? globalThis.fetch
  const navigate = input.navigate ?? ((to: string) => window.location.replace(to))
  const cover = input.mountCover ?? mountDeletingCover
  // The site this page stands in is going: the root picks the next site, or the creation
  // workspace (`landingAfterDelete`). Decided BEFORE the request, because the cover must be up
  // before the delete makes the dsh forget this page's workspace (`deleting-cover.ts`).
  const landing = landingAfterDelete(siteKey, current)
  const lowerCover =
    landing === null
      ? () => {}
      : cover(doc as unknown as CoverDocument, {
          title: t('delete.coverTitle', { site: siteName }),
          detail: t('delete.coverDetail'),
          mark: input.mark ?? { path: '', color: 'currentColor' }
        })
  // A teardown talks to the fleet, GitHub and Cloudflare in one call; it is slow, and the
  // dialog stays put with its button spinning rather than closing on a promise nobody watched.
  input.setBusy(true)
  let answer: DeleteAnswer
  try {
    answer = await readDeleteAnswer(
      await send(`/api/sites/${encodeURIComponent(siteKey)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
    )
  } catch {
    // No answer at all. The request may have reached the door before the connection went, so
    // this is not "nothing was changed".
    answer = { kind: 'unknown' }
  } finally {
    input.setBusy(false)
    removing.delete(siteKey)
  }
  if (answer.kind === 'refused') {
    // The refusal is written into the dialog; the person has to be able to read it.
    input.tellFailure(t(rowErrorKey(answer.status, answer.code)))
    lowerCover()
    return
  }
  if (answer.kind === 'pending') {
    // The host has not said the site is off it yet: the site is still in the list, and the row
    // says "Deleting…" until it goes. Nothing to acknowledge, and nowhere to move on to.
    input.tellFailure(t('delete.pending'))
    lowerCover()
    input.changed()
    return
  }
  // 🔒 A 200 IS NOT "DELETED" (#801). The row is off the book, but the host stack, the repository,
  // the sessions or the seats may not have gone with it, and an answer nobody could read says
  // nothing either way. That is told in a notice of its own (`delete-result.tsx`), which does not
  // depend on the dialog's surface still being mounted, and the page moves on only once it is
  // acknowledged.
  const acknowledged =
    answer.kind === 'complete'
      ? null
      : input.showResult(doc, { siteKey, siteName, outcome: answer, cover: landing !== null, t })
  if (acknowledged !== null) {
    // The notice has taken over: the delete dialog must not stay open inviting another press, and
    // "taking you to your next site" is not true while the notice waits.
    input.closeDialog()
    lowerCover()
  }
  if (landing !== null) {
    await acknowledged
    // The cover stays up until the page goes.
    navigate(landing)
    return
  }
  if (acknowledged === null) input.closeDialog()
  input.changed()
}
