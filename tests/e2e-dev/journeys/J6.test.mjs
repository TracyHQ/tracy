// J6 — Team, two people: A (owner) invites B, B accepts, A's open start screen follows without a
// reload, A changes B's role, A removes B, and the session B has OPEN loses the site at once.
//
//   invite  → `POST /api/team/invite`; B's Inbox holds a `team.invited` row for the site. Reading
//             the letter's link needs a test mailbox, which there is none of (plan Q1) — that
//             part is BLOCKED(no-mailbox) and noted; B accepts through the My Sites door instead.
//   accept  → A gets `team.invite_accepted`; A's Inbox poll (30 s) sees the count rise, sends
//             `tracy:team-changed`, and the Team start card reads `/api/team` again: its
//             `data-team-count` moves with no reload, within 75 s.
//   role    → `PATCH …/seats/:id {role}`; the roster says so; B's Inbox has `team.role_changed`.
//   revoke  → `DELETE …/seats/:id {kind: 'revoke'}`; from B's page that is still open, a site door
//             answers 403 and the workspace address no longer opens the site (it sends B to the
//             site's join page).
//
// B here is the run's `member` account, not the `editor` J5/J7 seat: this journey ends by removing
// its B, and the others must not depend on the order journeys run in.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { openWorkspace } from '../lib/chat-turn.mjs'
import { triage } from '../lib/errors.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { noteChild, rosterRowOf, runAccount, sharedSite } from '../lib/run-site.mjs'

const TEAM_COUNT = '.tv-start-site .tv-start-card-faces[data-team-count]'

/** The Team card's number on a page, or null while it draws none. */
async function teamCount(page) {
  const el = page.locator(TEAM_COUNT).first()
  if ((await el.count()) === 0) return null
  return Number(await el.getAttribute('data-team-count'))
}

/**
 * Rows of one kind for one site in a person's Inbox, optionally only those about one actor (the
 * run's other journeys seat other people on the same site).
 */
async function inboxRows(client, kind, siteKey, actorEmail = null) {
  const res = await client.get('/api/notifications?filter=all')
  return (res.json?.notifications ?? []).filter(
    (n) => n.kind === kind && n.siteKey === siteKey && (actorEmail === null || n.actor?.email === actorEmail)
  )
}

test('J6 team: invite, accept, role, revoke', async (t) => {
  const run = runContext()
  const { manifest } = run
  await journey(t, { id: 'J6' }, async ({ details, notes }) => {
    const owner = await runAccount(run, 'owner')
    const member = await runAccount(run, 'member')
    const site = await sharedSite(run, owner, 'wordpress')
    const key = encodeURIComponent(site.siteKey)
    details.site = { siteKey: site.siteKey, created: site.created }

    const browser = await launch()
    try {
      // ── A's start screen, open before anything changes ──────────────────────────────────────
      const a = await roleContext(browser, { name: 'owner', token: owner.token })
      const aPage = await a.newPage()
      a.step('owner-start')
      details.ownerWorkspace = await openWorkspace(aPage, site.siteKey)
      // At the 300px default conversation width the count is laid out but hidden (display: none
      // until the column is dragged wider), so wait for it in the DOM, not for it to be visible.
      await aPage.waitForSelector(TEAM_COUNT, { state: 'attached', timeout: 30_000 }).catch(() => null)
      const n0 = await teamCount(aPage)
      details.teamCard = { before: n0 }
      check(n0 !== null, "the Team start card shows no number on the owner's start screen")

      // ── invite ──────────────────────────────────────────────────────────────────────────────
      noteChild(manifest, site.siteKey, { seat: member.email, role: 'editor', state: 'intended' })
      const invite = await owner.post('/api/team/invite', {
        emails: [member.email],
        role: 'editor',
        siteKeys: [site.siteKey]
      })
      const outcome = invite.json?.results?.[0]?.sites?.[0]?.outcome ?? null
      details.invite = {
        status: invite.status,
        outcome,
        notified: invite.json?.results?.[0]?.notified ?? null
      }
      check(
        invite.status === 200 && outcome === 'invited',
        `invite answered ${invite.status} ${invite.json?.code ?? ''} outcome ${outcome}`
      )
      const invited = await inboxRows(member, 'team.invited', site.siteKey)
      details.invitedRow = invited.length
      check(invited.length === 1, `B's Inbox holds ${invited.length} team.invited rows for the site`)
      notes.push(
        'BLOCKED(no-mailbox): the invitation letter and its link were not read; B accepted through POST /api/sites/:key/accept (plan Q1)'
      )
      details.blockedParts = ['mail-link: no-mailbox']
      // The invitation does not reach A's own Inbox, so the card has not been told yet.
      details.teamCard.afterInvite = await teamCount(aPage)

      // ── accept → A's card moves without a reload ────────────────────────────────────────────
      const accept = await member.post(`/api/sites/${key}/accept`, {})
      const acceptedAt = Date.now()
      details.accept = { status: accept.status, accepted: accept.json?.accepted ?? null }
      check(
        accept.status === 200 && accept.json?.accepted === true,
        `accept answered ${accept.status} ${accept.json?.code ?? ''}`
      )
      const urlBefore = aPage.url()
      const moved = await aPage
        .waitForFunction(
          ([sel, n]) => {
            const el = document.querySelector(sel)
            return el !== null && Number(el.getAttribute('data-team-count')) === n
          },
          [TEAM_COUNT, n0 + 1],
          { timeout: 75_000, polling: 1_000 }
        )
        .then(() => Date.now() - acceptedAt)
        .catch(() => null)
      details.teamCard.after = await teamCount(aPage)
      details.teamCard.movedMs = moved
      details.teamCard.reloaded = aPage.url() !== urlBefore
      const acceptedRows = await inboxRows(owner, 'team.invite_accepted', site.siteKey, member.email)
      details.ownerAcceptedRow = acceptedRows.length
      check(acceptedRows.length === 1, `A's Inbox holds ${acceptedRows.length} team.invite_accepted rows`)
      check(
        moved !== null,
        `the Team card still shows ${details.teamCard.after} 75 s after B accepted (expected ${n0 + 1}, no reload)`
      )
      const { fails } = triage(a.eventsOf('owner-start'), { siteLabels: [site.label] })
      details.ownerErrors = fails.slice(0, 5).map((e) => ({ owner: e.owner, message: e.message, url: e.url }))
      check(
        fails.length === 0,
        `${fails.length} Tracy browser error(s) on A's page: ${fails
          .map((e) => e.message)
          .join(' | ')
          .slice(0, 300)}`
      )

      // ── role change ─────────────────────────────────────────────────────────────────────────
      const row = await rosterRowOf(owner, site.siteKey, member.email)
      check(row?.status === 'active', `B's roster row is ${row?.status ?? 'missing'} after accepting`)
      const patch = await owner.request(`/api/sites/${key}/seats/${row.id}`, {
        method: 'PATCH',
        json: { role: 'developer' }
      })
      details.role = {
        status: patch.status,
        role: patch.json?.role ?? null,
        lanes: patch.json?.lanes ?? null
      }
      check(
        patch.status === 200 && patch.json?.role === 'developer',
        `role change answered ${patch.status} ${patch.json?.code ?? ''}`
      )
      const row2 = await rosterRowOf(owner, site.siteKey, member.email)
      check(row2?.role === 'developer', `the roster names B ${row2?.role} after the change`)
      const roleRows = await inboxRows(member, 'team.role_changed', site.siteKey)
      details.roleRow = roleRows.length
      check(roleRows.length === 1, `B's Inbox holds ${roleRows.length} team.role_changed rows`)

      // ── B opens the site; A removes B; B's open page loses it ───────────────────────────────
      const b = await roleContext(browser, { name: 'member', token: member.token })
      const bPage = await b.newPage()
      b.step('member-open')
      details.memberWorkspace = await openWorkspace(bPage, site.siteKey)
      const doorBefore = await bPage.evaluate(
        async (k) => (await fetch(`/api/sites/${k}/comments`)).status,
        key
      )
      details.memberDoorBefore = doorBefore
      check(doorBefore === 200, `B's site door answered ${doorBefore} before the removal`)

      const revoke = await owner.request(`/api/sites/${key}/seats/${row.id}`, {
        method: 'DELETE',
        json: { kind: 'revoke' }
      })
      const revokedAt = Date.now()
      details.revoke = {
        status: revoke.status,
        revoked: revoke.json?.revoked ?? null,
        kind: revoke.json?.kind ?? null,
        lanes: revoke.json?.lanes ?? null
      }
      check(
        revoke.status === 200 && revoke.json?.revoked === true,
        `revoke answered ${revoke.status} ${revoke.json?.code ?? ''}`
      )
      noteChild(manifest, site.siteKey, { seat: member.email, state: 'revoked' })
      const lanesDown = (revoke.json?.lanes ?? []).filter((l) => l.ok !== true)
      check(lanesDown.length === 0, `the revoke did not reach every dsh: ${JSON.stringify(lanesDown)}`)

      b.step('member-revoked')
      const door = await bPage.evaluate(async (k) => {
        const res = await fetch(`/api/sites/${k}/comments`)
        let code = null
        try {
          code = (await res.json()).code ?? null
        } catch {}
        return { status: res.status, code }
      }, key)
      const workspaceDoor = await bPage.evaluate(async (k) => {
        const res = await fetch(`/${k}/`, { redirect: 'manual' })
        return { type: res.type, status: res.status }
      }, decodeURIComponent(key))
      details.memberAfter = { door, doorMs: Date.now() - revokedAt, workspaceDoor }
      check(
        door.status === 403,
        `B's open page: a site door answered ${door.status} ${door.code ?? ''} after the removal`
      )
      check(
        workspaceDoor.type === 'opaqueredirect',
        `B's open page: the workspace address answered ${workspaceDoor.status} (${workspaceDoor.type}), not a redirect away`
      )
      // The page itself: reloading it no longer opens the site.
      await bPage.reload({ waitUntil: 'load', timeout: 60_000 }).catch(() => null)
      const landed = new URL(bPage.url())
      const chatBox = await bPage.locator('[contenteditable="true"]').count()
      details.memberAfter.reload = { path: landed.pathname, chatBox }
      check(
        !landed.pathname.startsWith(`/${site.siteKey}/`) && landed.pathname.endsWith('/join'),
        `B's reload landed on ${landed.pathname}, not the site's join page`
      )
      const mySites = await member.get('/api/sites')
      const still = (mySites.json?.sites ?? []).filter(
        (s) => s.siteKey === site.siteKey && s.status === 'accepted'
      )
      details.memberAfter.mySites = still.length
      check(still.length === 0, 'My Sites still lists the site for B after the removal')
    } finally {
      await browser.close()
    }
  })
})
