/**
 * When a site's start screen gives way (David, 08/10/2026): as soon as anything was sent from the chat
 * box — a message, `/help …`, a bare `/help`, or any other `/` command.
 *
 * A message makes the session non-blank, which already took the block away. A `/` command never starts
 * a turn, so `session.blank` stays true after it; dsh's `InputState.sent` (fork tracy.25) is the one
 * thing that says it happened. That count lives in the page and is 0 again after a reload, so a Help
 * question asked earlier stands for it through its client-local rows, which `@tracy/dsh-assistant`
 * brings back when the session opens.
 */

/**
 * `@tracy/dsh-assistant`'s transcript row kind (`HELP_KIND` in its `help.ts`). Spelled here too, as every
 * cross-plugin name is: the two bundles share no module instance.
 */
export const HELP_ROW_KIND = 'tracy-help'

/**
 * @param {{ sent?: number } | undefined} input the dock's `input` owner value
 * @param {readonly { kind: string, data?: unknown }[]} rows the session's client-local transcript rows
 * @returns {boolean} whether the chat box has sent something in this session
 */
export function sentFromChatBox(input, rows) {
  if ((input?.sent ?? 0) > 0) return true
  // The tip ("type /help to ask…") is shown to the person once per account; they did not send it.
  return rows.some(
    (row) =>
      row.kind === HELP_ROW_KIND &&
      /** @type {{ variant?: string } | undefined} */ (row.data)?.variant !== 'tip'
  )
}
