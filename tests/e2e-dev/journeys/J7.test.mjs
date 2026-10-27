// J7 — the Inbox of two people.
//
//   B (editor) comments, A replies → B's Inbox holds a `comment.reply` row whose actor is A, with
//   the same face (`initial`, `color`, `avatarUrl`) `/api/team` gives A → B opens the Inbox tab:
//   the row is drawn, unread (with its category tile: rows draw no face since 04/10) → with the tab open and nothing new, the 30-second poll asks
//   only for the count (`/api/notifications/unread`), never the page; when the count RISES (A
//   replies again) the page is read once, not twice → B presses the newest row: `POST
//   /api/notifications/:id/read`, and the site opens on that thread (`?…comment=<id>`) → opening
//   the thread files `/comments/:id/read {seenN}`, which reads every Inbox row about the thread's
//   replies up to that number (#877) — none of them is left unread.
//
// The journey sets up its own thread, so it does not depend on J5 having run before it.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { openWorkspace } from '../lib/chat-turn.mjs'
import { triage } from '../lib/errors.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { noteChild, rosterRowOf, runAccount, seatMember, sharedSite } from '../lib/run-site.mjs'

const POLL_MS = 30_000

test('J7 inbox of two people', async (t) => {
  const run = runContext()
  const { manifest, runDir } = run
  await journey(t, { id: 'J7' }, async ({ details }) => {
    const owner = await runAccount(run, 'owner')
    const editor = await runAccount(run, 'editor')
    const site = await sharedSite(run, owner, 'wordpress')
    const key = encodeURIComponent(site.siteKey)
    details.site = { siteKey: site.siteKey, created: site.created }
    details.seat = await seatMember(run, owner, editor, site.siteKey, 'editor')
    const home = `${site.origin}/`

    // ── B comments, A replies → B's comment.reply row ─────────────────────────────────────────
    const root = await editor.post(`/api/sites/${key}/comments`, {
      url: home,
      text: 'Is the footer address current?',
      // Pinned like J5's, so the thread has a place on the page to open at.
      element: {
        url: home,
        selector: 'body',
        label: 'Page',
        text: '',
        tag: 'body',
        rect: { x: 40, y: 140, width: 320, height: 80 }
      }
    })
    check(root.status === 201, `B's comment answered ${root.status} ${root.json?.code ?? ''}`)
    const rootId = root.json.comment.id
    noteChild(manifest, site.siteKey, { comment: rootId, by: 'editor' })
    const reply = await owner.post(`/api/sites/${key}/comments`, {
      url: home,
      text: 'Yes, checked today.',
      replyTo: rootId
    })
    check(reply.status === 201, `A's reply answered ${reply.status} ${reply.json?.code ?? ''}`)

    const list = await editor.get('/api/notifications?filter=all')
    // A `comment.reply` row names the reply (`data.commentId`), not the thread's root.
    const row = (list.json?.notifications ?? []).find(
      (n) =>
        n.kind === 'comment.reply' &&
        n.siteKey === site.siteKey &&
        n.data?.commentId === reply.json?.comment?.id
    )
    details.row = row
      ? {
          id: row.id,
          kind: row.kind,
          readAt: row.readAt,
          actorEmail: row.actor?.email ?? null,
          face: row.actor?.face ?? null,
          data: row.data
        }
      : null
    check(row, "B's Inbox holds no comment.reply row for A's reply")
    check(row.actor?.email === owner.email, `the row's actor is ${row.actor?.email}, not A`)
    check(row.readAt === null, 'the row is already read')
    const a = await rosterRowOf(editor, site.siteKey, owner.email)
    details.teamFace = a ? { initial: a.initial, color: a.color, avatarUrl: a.avatarUrl ?? null } : null
    check(a, 'A is not on the roster B reads from /api/team')
    const face = row.actor?.face ?? {}
    check(
      face.initial === a.initial &&
        face.color === a.color &&
        (face.avatarUrl ?? null) === (a.avatarUrl ?? null),
      `the row's face ${JSON.stringify(face)} is not A's face on /api/team ${JSON.stringify(details.teamFace)}`
    )

    const browser = await launch()
    try {
      const b = await roleContext(browser, { name: 'editor', token: editor.token })
      const page = await b.newPage()
      /** @type {{ at: number, kind: 'count' | 'page', url: string }[]} */
      const reads = []
      /** What each count poll answered, in order: a page read is only due when this moves. */
      /** @type {{ at: number, unread: number }[]} */
      const counts = []
      page.on('response', async (res) => {
        if (res.request().method() !== 'GET') return
        if (new URL(res.url()).pathname !== '/api/notifications/unread') return
        const body = await res.json().catch(() => null)
        if (body && typeof body.unread === 'number') counts.push({ at: Date.now(), unread: body.unread })
      })
      page.on('request', (r) => {
        if (r.method() !== 'GET') return
        const u = new URL(r.url())
        if (u.pathname === '/api/notifications/unread')
          reads.push({ at: Date.now(), kind: 'count', url: u.search })
        else if (u.pathname === '/api/notifications')
          reads.push({ at: Date.now(), kind: 'page', url: u.search })
      })
      b.step('inbox')
      details.workspace = await openWorkspace(page, site.siteKey)
      await page.locator('button.tracy-inbox-nav-button').first().click({ timeout: 30_000 })
      const rowSel = `.tracy-inbox-row[data-notification="${row.id}"]`
      // The row draws its category tile, not the actor's face (04/10/2026, #809 `72188808a`):
      // the face is checked on the row's data above, and here only that the row is drawn, unread.
      const drawn = await page
        .waitForSelector(rowSel, { timeout: 30_000 })
        .then((el) => el.getAttribute('class'))
        .catch(() => null)
      details.drawnRow = drawn
      if (drawn === null) {
        details.drawnRows = await page
          .locator('[data-notification]')
          .evaluateAll((els) => els.map((el) => `${el.getAttribute('data-notification')} ${el.className}`))
          .catch(() => [])
        mkdirSync(join(runDir, 'evidence'), { recursive: true })
        await page.screenshot({ path: join(runDir, 'evidence', 'J7-inbox.png') }).catch(() => null)
      }
      check(drawn !== null, "the Inbox tab does not draw the reply's row")
      check(drawn.includes('is-unread'), `the reply's row is drawn ${drawn}, not unread`)

      // ── steady: the poll asks for the count only ────────────────────────────────────────────
      await page.waitForTimeout(3_000)
      const quietFrom = Date.now()
      await page.waitForTimeout(POLL_MS * 2 + 5_000)
      const quiet = reads.filter((r) => r.at >= quietFrom)
      // Notifications of the earlier journeys (J5, J6) can still land here and move the count; the
      // tab then reads the page once — that is right. Wrong is a page read with the count unmoved,
      // or more than one read for one move (the tab and the poll both reading, fixed in #877).
      const answered = counts.filter((c) => c.at >= quietFrom - POLL_MS - 5_000)
      let moves = 0
      for (let i = 1; i < answered.length; i++) if (answered[i].unread !== answered[i - 1].unread) moves++
      details.quiet = {
        counts: quiet.filter((r) => r.kind === 'count').length,
        pages: quiet.filter((r) => r.kind === 'page').length,
        values: answered.map((c) => c.unread),
        moves
      }
      check(
        details.quiet.counts >= 2,
        `the Inbox polled the count ${details.quiet.counts} times in ${POLL_MS * 2 + 5_000} ms`
      )
      check(
        details.quiet.pages <= moves,
        `the Inbox read the page ${details.quiet.pages} times while the count moved ${moves} times (${details.quiet.values.join(' → ')})`
      )

      // ── a rise: the page is read once ───────────────────────────────────────────────────────
      const again = await owner.post(`/api/sites/${key}/comments`, {
        url: home,
        text: 'One more detail.',
        replyTo: rootId
      })
      check(again.status === 201, `A's second reply answered ${again.status}`)
      const riseFrom = Date.now()
      let sawRise = false
      const deadline = Date.now() + POLL_MS + 15_000
      while (!sawRise && Date.now() < deadline) {
        await page.waitForTimeout(1_000)
        sawRise = reads.some((r) => r.at >= riseFrom && r.kind === 'page')
      }
      await page.waitForTimeout(5_000)
      const rise = reads.filter((r) => r.at >= riseFrom)
      details.rise = {
        // When each read went out, from the comment that made the count rise.
        reads: rise.map((r) => `${r.kind}${r.url} +${r.at - riseFrom}ms`),
        pages: rise.filter((r) => r.kind === 'page').map((r) => r.url),
        counts: rise.filter((r) => r.kind === 'count').length
      }
      check(sawRise, 'the count rose but the open Inbox never read the page')
      // Kept going on a double read: the press and the thread below are separate mechanisms, and
      // the verdict names every failure at the end.
      const later = []
      if (details.rise.pages.length !== 1)
        later.push(
          `one rise read the page ${details.rise.pages.length} times: ${details.rise.reads.join(' , ')}`
        )

      // ── B presses the newest row: it is read, and the site opens on the thread ──────────────
      const threadIds = new Set([rootId, reply.json?.comment?.id, again.json?.comment?.id].filter(Boolean))
      const threadRows = async () => {
        const res = await editor.get('/api/notifications?filter=all')
        details.inboxReads = [
          ...(details.inboxReads ?? []),
          { status: res.status, rows: res.json?.notifications?.length ?? null, code: res.json?.code ?? null }
        ]
        check(res.status === 200, `B's Inbox answered ${res.status} ${res.json?.code ?? ''}`)
        return (res.json?.notifications ?? []).filter(
          (n) => n.kind === 'comment.reply' && n.siteKey === site.siteKey && threadIds.has(n.data?.commentId)
        )
      }
      const before = await threadRows()
      details.threadRowsBefore = before.map((n) => ({
        id: n.id,
        readAt: n.readAt,
        settledAt: n.settledAt,
        commentId: n.data?.commentId
      }))
      const target = before.find((n) => n.readAt === null)
      check(
        target,
        `no unread comment.reply row of the thread is left to press: ${JSON.stringify(details.threadRowsBefore)}`
      )
      const targetSel = `.tracy-inbox-row[data-notification="${target.id}"]`
      await page.waitForSelector(targetSel, { timeout: 15_000 })
      details.targetClass = await page.locator(targetSel).first().getAttribute('class')
      const deepLinkSeen = page
        .waitForRequest(
          (r) =>
            r.isNavigationRequest() &&
            r.frame() === page.mainFrame() &&
            new URL(r.url()).searchParams.has('comment'),
          { timeout: 45_000 }
        )
        .then((r) => new URL(r.url()))
        .catch(() => null)
      const readPost = page.waitForRequest(
        (r) => r.method() === 'POST' && r.url().includes(`/api/notifications/${target.id}/read`),
        { timeout: 15_000 }
      )
      // Pressed on its tile corner: the middle of a card holds the site's own link, which opens the
      // site rather than the row.
      await page
        .locator(targetSel)
        .first()
        .click({ position: { x: 14, y: 14 }, timeout: 10_000 })
      details.readPosted = await readPost.then(() => true).catch(() => false)
      details.urlAfterPress = page.url().replace(/[?#].*/, '')
      if (!details.readPosted) {
        mkdirSync(join(runDir, 'evidence'), { recursive: true })
        await page.screenshot({ path: join(runDir, 'evidence', 'J7-press.png') }).catch(() => null)
      }
      check(
        details.readPosted,
        `pressing the row (${details.targetClass}) sent no POST /api/notifications/:id/read`
      )
      // The press opens the site on the thread (a full navigation), which reads the thread
      // (`/comments/:id/read {seenN}`), which in turn reads every Inbox row about its replies.
      const threadRead = page
        .waitForRequest(
          (r) => r.method() === 'POST' && /\/comments\/[^/]+\/read$/.test(new URL(r.url()).pathname),
          {
            timeout: 60_000
          }
        )
        .then((r) => r.postData())
        .catch(() => null)
      // The deep link (`/<site>/?open=browser&…&comment=<id>`) is a document request; the workspace
      // then moves to its session address, so the link is read off the request, not the final URL.
      const deepLink = await deepLinkSeen
      details.openedAt = deepLink
        ? {
            path: deepLink.pathname,
            comment: deepLink.searchParams.get('comment'),
            open: deepLink.searchParams.get('open'),
            mode: deepLink.searchParams.get('mode')
          }
        : { path: new URL(page.url()).pathname, comment: null }
      check(
        threadIds.has(details.openedAt.comment ?? ''),
        `pressing the row opened ${details.openedAt.path} without the thread (comment=${details.openedAt.comment})`
      )
      details.threadReadBody = await threadRead
      const after = await threadRows()
      details.threadRowsAfter = after.map((n) => ({ id: n.id, readAt: n.readAt }))
      check(after.find((n) => n.id === target.id)?.readAt, 'the pressed row is not read afterwards')
      check(details.threadReadBody !== null, 'opening the thread sent no POST /comments/:id/read')
      check(
        after.every((n) => typeof n.readAt === 'string'),
        `opening the thread left Inbox rows of it unread: ${JSON.stringify(details.threadRowsAfter)}`
      )
      const { fails } = triage(b.events, { siteLabels: [site.label] })
      details.errors = fails.slice(0, 5).map((e) => ({ owner: e.owner, message: e.message, url: e.url }))
      check(
        fails.length === 0,
        `${fails.length} Tracy browser error(s) on B's page: ${fails
          .map((e) => e.message)
          .join(' | ')
          .slice(0, 300)}`
      )
      check(later.length === 0, later.join(' · '))
    } finally {
      await browser.close()
    }
  })
})
