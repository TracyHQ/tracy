/**
 * The Team start card follows the Inbox: when the Inbox sees a `team.*` row it has not seen before
 * in this page (someone accepted an invitation, left, was removed…), it tells the page that site's
 * book changed, the same `tracy:team-changed {siteKey}` the Team tab sends after its own writes. The
 * card (`@tracy/dsh-chat-input` `SiteStart`) already listens and reads `/api/team` again.
 *
 * "Sees" means two moments only: the Inbox tab reads its first page (it opened, the filter changed,
 * or the count it shows moved), and the unread poll finds the count ROSE — then, and only then, the
 * first unread page is read to find out what arrived. A poll that finds the same count, or a lower
 * one, reads nothing more: the 30-second rhythm stays one small request.
 *
 * One reader per rise, never two: while the Inbox tab is open it re-reads its own first page when
 * the count moves and hands those rows here, so the poll does not read the same page a second time.
 * With the tab closed, the poll is the only reader.
 *
 * Pure and import-free (the event is dispatched by the caller's `emit`), so `test/poller.test.mjs`
 * drives it in Node.
 */

/** The fields of a notification this needs. */
export interface TeamNewsRow {
  id: string
  kind: string
  siteKey: string | null
}

export interface TeamNews {
  /** Rows just read: each `team.*` row with a site, not seen before in this page, is news once. */
  see: (rows: readonly TeamNewsRow[]) => void
  /**
   * The Inbox tab mounted: from now on it reads the first page itself whenever the count moves and
   * passes the rows to {@link TeamNews.see}. Returns the call for when it unmounts. Counted, so a
   * second mount (React's strict mode, a reopened tab) does not end the first one's claim early.
   */
  openTab: () => () => void
  /** Whether an Inbox tab is mounted and reading its own first page. */
  tabOpen: () => boolean
}

/**
 * @param emit - called once per site with news in one batch (two new rows of one site are one
 *   re-read of its book, not two).
 */
export function createTeamNews(emit: (siteKey: string) => void): TeamNews {
  /** Ids already told, for the life of the page. */
  const seen = new Set<string>()
  /** Inbox tabs mounted right now. */
  let tabs = 0
  return {
    openTab() {
      tabs += 1
      let closed = false
      return () => {
        if (closed) return
        closed = true
        tabs -= 1
      }
    },
    tabOpen: () => tabs > 0,
    see(rows) {
      const sites = new Set<string>()
      for (const row of rows) {
        if (row === null || typeof row !== 'object' || typeof row.id !== 'string') continue
        if (typeof row.kind !== 'string' || !row.kind.startsWith('team.')) continue
        if (typeof row.siteKey !== 'string' || row.siteKey === '') continue
        if (seen.has(row.id)) continue
        seen.add(row.id)
        sites.add(row.siteKey)
      }
      for (const siteKey of sites) emit(siteKey)
    }
  }
}

/**
 * The poll's half: a count handler that reads the first unread page only when the count rose above
 * the last one the poll read. The first count is the baseline: nothing arrived yet that the page has
 * not drawn from `/api/team` itself.
 * @param readRows - one read of `GET /api/notifications?filter=unread`; null when it failed.
 * @param see - where the rows go ({@link TeamNews.see}).
 * @param tabOpen - true while the Inbox tab reads the page itself ({@link TeamNews.tabOpen}): the
 *   rise is then left to the tab, whose re-read already reaches `see`.
 */
export function onUnreadRise({
  readRows,
  see,
  tabOpen = () => false
}: {
  readRows: () => Promise<readonly TeamNewsRow[] | null>
  see: (rows: readonly TeamNewsRow[]) => void
  tabOpen?: () => boolean
}): (count: number) => void {
  let last: number | null = null
  return (count) => {
    const rose = last !== null && count > last
    last = count
    if (!rose || tabOpen()) return
    void readRows().then(
      (rows) => {
        if (rows !== null) see(rows)
      },
      () => undefined
    )
  }
}
