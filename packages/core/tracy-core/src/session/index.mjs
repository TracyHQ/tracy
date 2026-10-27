/**
 * Which session is the one on screen — the MAIN view's session.
 *
 * Until dsh 0.1.6-alpha.1 the sessions service said so itself: `ctx.sessions.list.getSnapshot()
 * .current`, and `ctx.sessions.open(id)` switched it. dsh 0.1.6-alpha.2 (upstream `6830e1460d`,
 * "own Client Session generations") moved view selection OUT of the Session Controller — "view
 * selection remains outside the Controller" — into `ui-workspace`, which RETAINS the session it
 * shows under the source `mainView`. The list now carries, per session, the local retention
 * counts by source, and the main session is the one `mainView` holds. Switching is
 * `ctx.uiWorkspace.openSession(id)`; there is no `current` and no `open` on `sessions` any more,
 * and a caller still reading them gets `undefined` and a thrown `TypeError` respectively — the
 * first silently, which is why this lives in one place with a test rather than in four call sites.
 *
 * The idiom is dsh's own: `ui-workspace/src/client/tree.ts` (`mainSessionId`).
 */

/**
 * @typedef {{ readonly retainedBy?: Readonly<Partial<Record<string, number>>> } | undefined} SessionRow
 */

/**
 * The session the main view shows, or undefined when nothing is on screen (a fresh page before
 * restoration, or after the current session was archived).
 * @param {{ readonly byId: Readonly<Record<string, SessionRow>> }} list - a `ctx.sessions.list` snapshot.
 * @returns {string | undefined} its id.
 */
export function mainSessionOf(list) {
  for (const [id, row] of Object.entries(list.byId)) {
    if ((row?.retainedBy?.mainView ?? 0) > 0) return id
  }
  return undefined
}
