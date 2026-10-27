/**
 * A Comments row pressed while no Browser tab holds its comment (Brian 03/10/2026).
 *
 * A row's press asks the Browser tab that listed it to `reveal` the comment (`tracy:comment-act`):
 * scroll to it and open its thread card. While no Browser tab of the conversation on screen lists, the
 * rows come from the server's read (`comment-view.mjs` `serve`) and name no tab (`tabId: ''`), so that
 * act reached nobody and the press did nothing — the right column showed "Click + to start".
 *
 * Such a row now sends `tracy:comment-open` `{id, url}` instead. `tracy-site-tabs` owns opening the
 * Browser tab on a comment's page and landing on its thread (`openComment`, the road Site changes'
 * "Open comment" takes), so it listens for this and does the rest; this side only says which comment.
 *
 * Pure, so `test/comment-open.test.mjs` holds the rule.
 */

/** The window event `tracy-site-tabs` opens a comment on (re-declared there: plugins share no imports). */
export const COMMENT_OPEN_EVENT = 'tracy:comment-open'

/**
 * What pressing a row sends, or null for a row with nothing to open.
 * @param {{ id: string, tabId: string, sessionId: string, url?: string, deleted?: boolean }} row
 * @returns {{ type: 'act', detail: { tabId: string, sessionId: string, kind: 'reveal', ids: string[] } }
 *   | { type: 'open', detail: { id: string, url: string } } | null}
 */
export function revealOf(row) {
  if (row.tabId !== '')
    return {
      type: 'act',
      detail: { tabId: row.tabId, sessionId: row.sessionId, kind: 'reveal', ids: [row.id] }
    }
  // A deleted root kept for its replies has no thread to land on once its own words are gone.
  if (row.deleted === true || typeof row.url !== 'string' || row.url === '') return null
  return { type: 'open', detail: { id: row.id, url: row.url } }
}
