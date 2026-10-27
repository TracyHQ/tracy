// J5 — a comment between two people, then sent to Tracy.
//
//   B (editor) pins a comment on the site's home page (the comments door, with an element pin as
//   the Browser tab's Edit mode builds it) → A opens the site: the Comments start card shows the
//   grey count and the red dot (A has not read it) → A replies → B opens the thread in the
//   Comments view: the view POSTs `/comments/:id/read` and B's read mark is set → B marks it unread
//   from the row menu: `/unread`, the mark is cleared and the row is unread again → A, with the
//   site open in Edit mode, sends the thread to Tracy from the row menu (one prompt) → Tracy's
//   write cites the comment and the thread is resolved by Tracy.
//
// A read mark is `seenN` (#877, `061-site-comment-read-seen-n.sql`): the largest number of the
// OTHER people's messages in the thread as the tab drew it. Opening the thread must send exactly
// that number, and `/reads` must give it back. Verdicts: the agent not doing the edit is
// BLOCKED(model); a send that never reaches the server, or an edit that lands without resolving,
// is FAIL.

import { test } from 'node:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, roleContext } from '../lib/browser.mjs'
import { activityV2, chatTimeLeftMs, openWorkspace, reservePrompt, settlePrompt } from '../lib/chat-turn.mjs'
import { triage } from '../lib/errors.mjs'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import { noteChild, readTagline, runAccount, seatMember, sharedSite } from '../lib/run-site.mjs'

const COMMENTS_CARD = '.tv-start-site button.tv-start-card:has(.tv-start-card-icon[data-tone="comments"])'
const EDIT_CARD = '.tv-start-site button.tv-start-card:has(.tv-start-card-icon[data-tone="edit"])'

/** A pin the way the Browser tab's Edit mode stores one (the fork reads it back only with a rect). */
function pinOn(url) {
  return {
    url,
    selector: 'body',
    label: 'Page',
    text: '',
    tag: 'body',
    rect: { x: 40, y: 40, width: 320, height: 80 }
  }
}

/** The comment's thread as the server lists it to `client`. */
async function threadOf(client, key, rootId) {
  const res = await client.get(`/api/sites/${key}/comments`)
  return (res.json?.comments ?? []).find((c) => c.id === rootId) ?? null
}

/** `client`'s read mark on one thread: `undefined` none, `null` marked unread, else its `seenN`. */
async function readMarkOf(client, key, rootId) {
  const res = await client.get(`/api/sites/${key}/comments/reads`)
  const row = (res.json?.reads ?? []).find((r) => r.id === rootId)
  return row === undefined ? undefined : (row.seenN ?? null)
}

/** The largest number among the thread's messages written by someone other than `email`. */
async function othersTopN(client, key, rootId, email) {
  const res = await client.get(`/api/sites/${key}/comments`)
  const all = res.json?.comments ?? []
  const inThread = new Set([rootId])
  // Replies may nest; walk until no new member is found.
  for (let grew = true; grew; ) {
    grew = false
    for (const c of all)
      if (c.replyTo && inThread.has(c.replyTo) && !inThread.has(c.id)) {
        inThread.add(c.id)
        grew = true
      }
  }
  const ns = all
    .filter((c) => inThread.has(c.id) && String(c.author?.email ?? '').toLowerCase() !== email.toLowerCase())
    .map((c) => c.n)
  return ns.length ? Math.max(...ns) : 0
}

test('J5 comments between two people, sent to Tracy', async (t) => {
  const run = runContext()
  const { runId, runDir, manifest } = run
  await journey(t, { id: 'J5' }, async ({ details }) => {
    const owner = await runAccount(run, 'owner')
    const editor = await runAccount(run, 'editor')
    const site = await sharedSite(run, owner, 'wordpress')
    const key = encodeURIComponent(site.siteKey)
    details.site = { siteKey: site.siteKey, created: site.created }
    details.seat = await seatMember(run, owner, editor, site.siteKey, 'editor')
    const home = `${site.origin}/`
    const wanted = `E2E ${runId} j5`

    // ── B pins a comment ──────────────────────────────────────────────────────────────────────
    const root = await editor.post(`/api/sites/${key}/comments`, {
      url: home,
      text: `Please change the site tagline to '${wanted}'.`,
      element: pinOn(home)
    })
    details.root = {
      status: root.status,
      id: root.json?.comment?.id ?? null,
      n: root.json?.comment?.n ?? null
    }
    check(
      root.status === 201 && root.json?.comment?.id,
      `B's comment answered ${root.status} ${root.json?.code ?? ''}`
    )
    const rootId = root.json.comment.id
    noteChild(manifest, site.siteKey, { comment: rootId, by: 'editor' })

    const browser = await launch()
    try {
      // ── A's start screen: grey count + red dot ──────────────────────────────────────────────
      const a = await roleContext(browser, { name: 'owner', token: owner.token })
      const aPage = await a.newPage()
      a.step('owner-start')
      details.ownerWorkspace = await openWorkspace(aPage, site.siteKey)
      const card = await aPage
        .waitForFunction(
          (sel) => {
            const b = document.querySelector(sel)
            const count = b?.querySelector('.tv-start-card-count')
            return count && count.hasAttribute('data-dot') ? { text: count.textContent, dot: true } : false
          },
          COMMENTS_CARD,
          { timeout: 45_000, polling: 1_000 }
        )
        .then((h) => h.jsonValue())
        .catch(() => null)
      details.ownerCard =
        card ??
        (await aPage
          .locator(`${COMMENTS_CARD} .tv-start-card-count`)
          .first()
          .textContent()
          .catch(() => null))
      check(
        card !== null && Number(card.text) >= 1,
        `A's Comments card shows ${JSON.stringify(details.ownerCard)}, not a count with the unread dot`
      )

      // ── A replies ───────────────────────────────────────────────────────────────────────────
      const reply = await owner.post(`/api/sites/${key}/comments`, {
        url: home,
        text: 'Seen — sending it to Tracy.',
        replyTo: rootId
      })
      details.reply = { status: reply.status, id: reply.json?.comment?.id ?? null }
      check(reply.status === 201, `A's reply answered ${reply.status} ${reply.json?.code ?? ''}`)

      // ── B opens the thread in the Comments view ─────────────────────────────────────────────
      const b = await roleContext(browser, { name: 'editor', token: editor.token })
      const bPage = await b.newPage()
      b.step('editor-comments')
      details.editorWorkspace = await openWorkspace(bPage, site.siteKey)
      await bPage.locator(COMMENTS_CARD).first().click({ timeout: 30_000 })
      const rowSel = `div.tv-ci[data-comment="${rootId}"]`
      await bPage.waitForSelector(rowSel, { timeout: 30_000 })
      // The reads load after the list; until then no row is unread.
      await bPage.waitForSelector(`${rowSel}[data-unread]`, { timeout: 20_000 }).catch(() => null)
      details.editorRowUnreadBefore = (await bPage.locator(`${rowSel}[data-unread]`).count()) > 0
      check(details.editorRowUnreadBefore, "B's row is not unread after A's reply")
      const readReq = bPage.waitForRequest(
        (r) => r.method() === 'POST' && r.url().includes(`/comments/${rootId}/read`),
        { timeout: 20_000 }
      )
      await bPage.locator(rowSel).click({ timeout: 10_000 })
      const sentRead = await readReq
        .then((r) => {
          try {
            return { seenN: JSON.parse(r.postData() ?? '{}').seenN ?? null }
          } catch {
            return { seenN: null }
          }
        })
        .catch(() => null)
      const expected = await othersTopN(editor, key, rootId, editor.email)
      details.readRequest = sentRead
      details.expectedSeenN = expected
      check(sentRead !== null, 'opening the thread sent no POST /read')
      check(
        sentRead.seenN === expected,
        `POST /read carried seenN ${sentRead.seenN}, expected ${expected} (A's reply)`
      )
      const mark = await readMarkOf(editor, key, rootId)
      details.readMark = mark ?? null
      check(
        mark === expected,
        `B's read mark after opening is ${JSON.stringify(mark)}, expected seenN ${expected}`
      )

      // ── B marks it unread ───────────────────────────────────────────────────────────────────
      const unreadReq = bPage.waitForRequest(
        (r) => r.method() === 'POST' && r.url().includes(`/comments/${rootId}/unread`),
        { timeout: 15_000 }
      )
      await bPage.locator(`[data-tracy-more="${rootId}"]`).click({ timeout: 10_000 })
      await bPage
        .locator(`[data-tracy-item-menu="${rootId}"] [data-tracy-menu="unread"]`)
        .click({ timeout: 10_000 })
      details.unreadRequest = await unreadReq.then(() => true).catch(() => false)
      check(details.unreadRequest, 'Mark unread sent no POST /unread')
      await bPage.waitForTimeout(3_000)
      const unreadMark = await readMarkOf(editor, key, rootId)
      details.unreadMark = unreadMark === undefined ? 'no mark' : unreadMark
      details.editorRowUnreadAfter = (await bPage.locator(`${rowSel}[data-unread]`).count()) > 0
      check(
        details.unreadMark === null,
        `B's read mark after Mark unread is ${JSON.stringify(details.unreadMark)}, not cleared`
      )
      check(details.editorRowUnreadAfter, "B's row has no unread dot after Mark unread")
      const bErrors = triage(b.events, { siteLabels: [site.label] })
      details.editorErrors = bErrors.fails
        .slice(0, 5)
        .map((e) => ({ owner: e.owner, message: e.message, url: e.url }))
      check(
        bErrors.fails.length === 0,
        `${bErrors.fails.length} Tracy browser error(s) on B's page: ${bErrors.fails
          .map((e) => e.message)
          .join(' | ')
          .slice(0, 300)}`
      )

      // ── A sends the thread to Tracy (one prompt) ────────────────────────────────────────────
      a.step('owner-send')
      await aPage.reload({ waitUntil: 'load', timeout: 120_000 })
      await openWorkspace(aPage, site.siteKey)
      await aPage.locator(EDIT_CARD).first().click({ timeout: 30_000 })
      // The Browser tab in Edit mode is what lists comments with a tab to act in.
      await aPage.waitForFunction(
        (label) => [...document.querySelectorAll('iframe')].some((f) => f.src.includes(label)),
        site.label,
        { timeout: 60_000 }
      )
      await aPage
        .locator(COMMENTS_CARD)
        .first()
        .click({ timeout: 10_000 })
        .catch(async () => {
          await aPage
            .locator('[data-conversation-tabs] [role="tab"][data-view="tracy-comments"]')
            .first()
            .click({ timeout: 10_000 })
        })
      await aPage.waitForSelector(rowSel, { timeout: 30_000 })
      const tagBefore = await readTagline(owner, site.siteKey)
      details.taglineBefore = tagBefore.value
      const requestsPost = aPage.waitForRequest(
        (r) => r.method() === 'POST' && /\/api\/sites\/[^/]+\/requests$/.test(r.url()),
        { timeout: 30_000 }
      )
      // The ⋯ button shows on a row the pointer rests on.
      try {
        await aPage.locator(rowSel).first().scrollIntoViewIfNeeded({ timeout: 10_000 })
        await aPage.locator(rowSel).first().hover({ timeout: 10_000 })
        await aPage.locator(`[data-tracy-more="${rootId}"]`).click({ timeout: 10_000 })
      } catch (error) {
        mkdirSync(join(runDir, 'evidence'), { recursive: true })
        await aPage.screenshot({ path: join(runDir, 'evidence', 'J5-owner-row.png') }).catch(() => null)
        throw new Error(
          `A's comment row has no reachable ⋯ menu with the site open in Edit mode: ${String(error).split('\n')[0]}`
        )
      }
      const ask = aPage.locator(`[data-tracy-item-menu="${rootId}"] [data-tracy-menu="ask"]`)
      if ((await ask.count()) === 0) {
        await aPage.screenshot({ path: join(runDir, 'evidence', 'J5-no-ask.png') }).catch(() => null)
        throw new Error('the row menu has no "Send to Tracy" with the Browser tab open in Edit mode')
      }
      const index = reservePrompt(runDir, 'J5', `send comment #${details.root.n} to Tracy`)
      const sentAt = Date.now()
      let resolved = null
      try {
        await ask.click({ timeout: 10_000 })
        const posted = await requestsPost.then(() => true).catch(() => false)
        details.requestsPosted = posted
        check(posted, 'Send to Tracy did not reach POST /api/sites/:key/requests')
        const limit = Math.min(6 * 60_000, chatTimeLeftMs(runDir) + 60_000)
        while (Date.now() - sentAt < limit) {
          await aPage.waitForTimeout(5_000)
          const th = await threadOf(owner, key, rootId)
          if (th?.status === 'resolved') {
            resolved = {
              ms: Date.now() - sentAt,
              resolvedByTracy: th.resolvedByTracy ?? null,
              resolvedBy: th.resolvedBy ?? null
            }
            break
          }
        }
      } finally {
        settlePrompt(runDir, index, Date.now() - sentAt)
      }
      const tagAfter = await readTagline(owner, site.siteKey)
      details.taglineAfter = tagAfter.value
      details.resolved = resolved
      const rows = await activityV2(owner, site.siteKey).catch(() => [])
      details.commentTurn = rows
        .filter((r) => r.origin?.source === 'comment')
        .slice(0, 2)
        .map((r) => ({ id: r.id, kind: r.kind, state: r.state }))
      if (resolved === null && tagAfter.value !== wanted)
        throw new Blocked(
          `Tracy neither edited nor resolved within the wait (tagline ${JSON.stringify(tagAfter.value)})`,
          'model'
        )
      check(
        resolved !== null,
        `the tagline changed to ${JSON.stringify(tagAfter.value)} but the thread was not resolved`
      )
      check(
        resolved.resolvedByTracy === true,
        `the thread was resolved by ${JSON.stringify(resolved.resolvedBy)}, not by Tracy`
      )
      const aErrors = triage(a.events, { siteLabels: [site.label] })
      details.ownerErrors = aErrors.fails
        .slice(0, 5)
        .map((e) => ({ owner: e.owner, message: e.message, url: e.url }))
      check(
        aErrors.fails.length === 0,
        `${aErrors.fails.length} Tracy browser error(s) on A's page: ${aErrors.fails
          .map((e) => e.message)
          .join(' | ')
          .slice(0, 300)}`
      )
    } finally {
      await browser.close()
    }
  })
})
