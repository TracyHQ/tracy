/**
 * The rules behind the composer's attachment chips (`ComposerChips.tsx`): what a chip says, and
 * whether the chips share the input line or take their own row above it. Pure functions, so the
 * layout decision is tested without a browser.
 *
 * 🔒 ONE ROW WHEN THERE IS ROOM (Akemi, 01/10/2026): `[+] [chip][chip]… [draft……] [send]` only when
 * the plus, every chip on one line, a draft of at least `DRAFT_MIN_WIDTH` and the send button fit
 * the card, AND the draft is one line. Otherwise the chips wrap in their own row on top and the
 * input line stays `[+] [draft] [send]` below.
 *
 * 🔒 THE DECISION NEVER READS THE MODE IT PRODUCES. Every input below is measured the same way in
 * both modes (the chips' own widths, the draft's text width at one line), so a draft that wraps
 * only because the chips made it narrow cannot flip the card back and forth on every frame.
 */

/** The draft's floor on the shared line, in px. The card's CSS reads the same number. */
export const DRAFT_MIN_WIDTH = 160

/** Inline: chips share the input line. Stacked: chips in their own row above it. */
export const CHIPS_INLINE = 'inline'
export const CHIPS_STACKED = 'stacked'

/**
 * Whether the chips may share the input line.
 * @param {{
 *   lineWidth: number,
 *   plusWidth: number,
 *   chipsWidth: number,
 *   sendWidth: number,
 *   gap: number,
 *   draftTextWidth: number,
 *   draftHasBreak: boolean,
 *   draftMin?: number
 * }} m - `lineWidth` is the card's content box; `chipsWidth` the chips laid end to end with their
 *   own gaps; `draftTextWidth` the draft's text at one line, padding included; `draftHasBreak` a
 *   hard line break in the draft.
 * @returns {'inline' | 'stacked'}
 */
export function chipsLayout(m) {
  const draftMin = m.draftMin ?? DRAFT_MIN_WIDTH
  // Three gaps on the shared line: plus | chips | draft | send.
  const draftRoom = m.lineWidth - m.plusWidth - m.chipsWidth - m.sendWidth - 3 * m.gap
  if (draftRoom < draftMin) return CHIPS_STACKED
  if (m.draftHasBreak || m.draftTextWidth > draftRoom) return CHIPS_STACKED
  return CHIPS_INLINE
}

/**
 * The short type badge a file chip draws in its 22px square: the extension, at most four letters.
 * @param {string} name - the file name.
 * @returns {string} e.g. `PDF`, `TXT`; `FILE` when the name carries no extension.
 */
export function fileBadge(name) {
  const dot = typeof name === 'string' ? name.lastIndexOf('.') : -1
  if (dot <= 0 || dot === name.length - 1) return 'FILE'
  return (
    name
      .slice(dot + 1)
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 4)
      .toUpperCase() || 'FILE'
  )
}

/**
 * What a file chip shows of its upload.
 * @param {{ status?: string, loaded?: number, total?: number } | undefined} upload - dsh's upload
 *   entry for the draft (`conversation.fileUploads`); absent while it has not started.
 * @returns {{ state: 'uploading' | 'ready' | 'error', progress: number | null }}
 */
export function uploadState(upload) {
  if (upload === undefined || upload.status === 'uploading' || upload.status === undefined) {
    const total = Number(upload?.total)
    const loaded = Number(upload?.loaded)
    const progress =
      Number.isFinite(total) && total > 0 && Number.isFinite(loaded)
        ? Math.min(1, Math.max(0, loaded / total))
        : null
    return { state: 'uploading', progress }
  }
  return { state: upload.status === 'ready' ? 'ready' : 'error', progress: null }
}

/** The draft shares the line with the controls; or it takes its own row above them. */
export const DRAFT_LINE = 'line'
export const DRAFT_OWN_ROW = 'own-row'

/**
 * Whether the draft keeps its place between the controls (`[+] [role] [draft] [send]`) or takes a
 * full-width row above them. A narrow column (a phone, or a 360px chat column beside the site) left
 * the draft so little room that a sentence wrapped every two or three words (J7.8, 04/10/2026).
 * Reads only the controls and the card, never the mode it produces, so it cannot oscillate.
 * @param {{ lineWidth: number, toolsWidth: number, sendWidth: number, gap: number, draftMin?: number }} m
 *   - `lineWidth` is the card's content box; `toolsWidth` the left controls (+ and the role chip).
 * @returns {'line' | 'own-row'}
 */
export function draftLayout(m) {
  const draftMin = m.draftMin ?? DRAFT_MIN_WIDTH
  const room = m.lineWidth - m.toolsWidth - m.sendWidth - 2 * m.gap
  return room < draftMin ? DRAFT_OWN_ROW : DRAFT_LINE
}
