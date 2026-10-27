// J3 — the site's start screen (`/<siteKey>/` before the first message), drawn by
// `@tracy/dsh-chat-input` (`packages/ui/tracy-chat-input/src/client/index.tsx`, `StartCard`).
//
// WordPress, in full, on the run's shared site:
//   - four cards, told apart by their icon tone: edit, comments, changes, team;
//   - Comments: a teammate's open comment the owner has not read gives a grey count of 1 with the
//     unread dot (`.tv-start-card-count[data-dot]`), matching `GET /api/sites/:key/comments`;
//   - Site changes: the count shown is the one `GET /api/sites/:key/activity/unseen` answers (none
//     drawn at 0 — a first look writes the watermark at now and answers 0, by design);
//   - Team: `data-team-count` is the member count of `GET /api/team` (accepted + invited seats), and
//     the teammate's face is drawn (`[data-tracy-face]`, others only);
//   - the role chip (`button.tv-role-chip`, `@tracy/dsh-mode-picker`) is there.
// Joomla and EmDash, smoke: the four cards are drawn.
//
// What the journey adds to the shared site (a teammate's seat, one comment) is taken off again at
// the end, so the journeys after it start from the site as it was.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { openWorkspace } from '../lib/chat-turn.mjs'
import { triage } from '../lib/errors.mjs'
import { withoutKnown } from '../lib/known-errors.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { noteChild, runAccount, sharedSite } from '../lib/run-site.mjs'

const TONES = ['edit', 'comments', 'changes', 'team']

/** What the start screen draws, read in the page. */
async function readStart(page) {
  return page.evaluate((tones) => {
    const root = document.querySelector('[data-tracy-start="site"]')
    const card = (tone) =>
      [...(root?.querySelectorAll('.tv-start-card') ?? [])].find((c) =>
        c.querySelector(`.tv-start-card-icon[data-tone="${tone}"]`)
      )
    const out = {
      root: Boolean(root),
      cards: root?.querySelectorAll('.tv-start-card').length ?? 0,
      byTone: {}
    }
    for (const tone of tones) {
      const c = card(tone)
      const count = c?.querySelector('.tv-start-card-count')
      const faces = c?.querySelector('.tv-start-card-faces')
      out.byTone[tone] = c
        ? {
            disabled: /** @type {HTMLButtonElement} */ (c).disabled,
            count: count ? count.textContent : null,
            dot: count ? count.hasAttribute('data-dot') : false,
            teamCount: faces?.getAttribute('data-team-count') ?? null,
            faces: faces ? faces.querySelectorAll('[data-tracy-face]').length : null,
            people: faces?.querySelector('.tv-start-card-people')?.textContent ?? null
          }
        : null
    }
    out.roleChip = Boolean(document.querySelector('button.tv-role-chip'))
    return out
  }, TONES)
}

test('J3 site start screen', async (t) => {
  const run = runContext()
  const { cms, manifest } = run
  const owner = await runAccount(run, 'owner')
  const browser = await launch()
  try {
    for (const platform of cms) {
      await t.test(`J3 ${platform}`, async (st) => {
        await journey(st, { id: 'J3', cms: platform }, async ({ details, notes }) => {
          const full = platform === 'wordpress'
          const site = await sharedSite(run, owner, platform)
          const keyPath = `/api/sites/${encodeURIComponent(site.siteKey)}`
          details.site = { siteKey: site.siteKey, reused: !site.created, full }

          let mate = null
          let mateId = null
          let commentId = null
          try {
            // ── a teammate with one open comment (WordPress only) ───────────────────────────
            if (full) {
              mate = await runAccount(run, 'starteditor')
              const invite = await owner.post('/api/team/invite', {
                emails: [mate.email],
                role: 'editor',
                siteKeys: [site.siteKey]
              })
              noteChild(manifest, site.siteKey, { seat: mate.email, role: 'editor', by: 'J3' })
              const accept = await mate.post(`${keyPath}/accept`)
              check(
                invite.status === 200 && accept.status === 200,
                `teammate seat: invite ${invite.status}, accept ${accept.status}`
              )
              const posted = await mate.post(`${keyPath}/comments`, {
                url: `${site.origin}/`,
                text: `J3 start-screen probe ${run.runId}`
              })
              commentId = posted.json?.comment?.id ?? null
              details.comment = { status: posted.status }
              check(
                posted.status === 201 && commentId,
                `teammate's comment answered ${posted.status} ${posted.json?.code ?? ''}`
              )
            }

            // ── the owner opens the site ──────────────────────────────────────────────────────
            const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
            try {
              const page = await ctx.newPage()
              ctx.step('start')
              const opened = await openWorkspace(page, site.siteKey)
              details.open = opened
              await page.waitForSelector('[data-tracy-start="site"] .tv-start-card', { timeout: 60_000 })
              // Counts arrive from their doors after the first paint; give each one its own wait.
              if (full) {
                await page
                  .waitForFunction(
                    () =>
                      document
                        .querySelector('[data-tracy-start="site"] .tv-start-card-icon[data-tone="comments"]')
                        ?.parentElement?.querySelector('.tv-start-card-count[data-dot]') &&
                      document.querySelector(
                        '[data-tracy-start="site"] .tv-start-card-faces[data-team-count]'
                      ),
                    null,
                    { timeout: 30_000 }
                  )
                  .catch(() => {})
              }
              const drawn = await readStart(page)
              details.drawn = drawn
              const { fails, known } = withoutKnown(
                triage(ctx.eventsOf('start'), { siteStep: false, siteLabels: [site.label] }).fails
              )
              for (const k of known) notes.push(`known ${k.known}: ${k.message ?? ''} ${k.url ?? ''}`.trim())
              details.errors = fails
                .slice(0, 10)
                .map((e) => ({ type: e.type, message: e.message, url: e.url }))

              check(drawn.root, 'no site start screen ([data-tracy-start="site"])')
              const missing = TONES.filter((tone) => !drawn.byTone[tone])
              check(missing.length === 0, `start cards missing: ${missing.join(', ')} (${drawn.cards} drawn)`)
              const disabled = TONES.filter((tone) => drawn.byTone[tone]?.disabled)
              check(disabled.length === 0, `start cards disabled: ${disabled.join(', ')}`)
              check(
                fails.length === 0,
                `${fails.length} Tracy error(s) on the start screen: ${fails
                  .slice(0, 3)
                  .map((e) => `${e.message} ${e.url ?? ''}`)
                  .join(' | ')}`
              )
              if (!full) return

              // ── what each count must be, from the doors ───────────────────────────────────
              const comments = await owner.get(`${keyPath}/comments`)
              const open = (comments.json?.comments ?? []).filter(
                (c) => !c.deletedAt && c.status !== 'resolved' && !c.replyTo
              )
              const unseen = await owner.get(`${keyPath}/activity/unseen`)
              const team = await owner.get('/api/team')
              const seats = (team.json?.sites ?? []).find((s) => s.siteKey === site.siteKey)?.seats ?? []
              const members = seats.filter((s) => s.status === 'active' || s.status === 'invited').length
              details.doors = {
                openComments: open.length,
                unseenChanges: unseen.json?.count ?? `http-${unseen.status}`,
                members,
                seatStatuses: seats.map((s) => s.status)
              }

              const c = drawn.byTone.comments
              check(
                c.count === String(open.length),
                `Comments card shows ${c.count ?? 'no count'}, the door has ${open.length} open`
              )
              check(c.dot, 'Comments card has no unread dot for a teammate comment the owner never opened')
              const ch = drawn.byTone.changes
              const n = Number(unseen.json?.count ?? Number.NaN)
              check(
                n === 0 ? ch.count === null : ch.count === (n > 9 ? '9+' : String(n)),
                `Site changes card shows ${ch.count ?? 'no count'}, the door counts ${unseen.json?.count}`
              )
              const tm = drawn.byTone.team
              check(
                tm.teamCount === String(members),
                `Team card data-team-count=${tm.teamCount}, the book has ${members}`
              )
              check(tm.faces === 1, `Team card draws ${tm.faces} face(s), expected the one teammate`)
              check(drawn.roleChip, 'no role chip (button.tv-role-chip) on the start screen')
            } finally {
              await ctx.close()
            }
          } finally {
            // ── leave the shared site as it was ───────────────────────────────────────────────
            if (commentId) {
              const del = await mate.delete(`${keyPath}/comments/${encodeURIComponent(commentId)}`)
              details.commentRemoved = del.status
            }
            if (mate) {
              const team = await owner.get('/api/team')
              mateId =
                (team.json?.sites ?? [])
                  .find((s) => s.siteKey === site.siteKey)
                  ?.seats?.find((s) => s.email === mate.email)?.id ?? null
              if (mateId) {
                const off = await owner.request(`${keyPath}/seats/${mateId}`, {
                  method: 'DELETE',
                  json: { kind: 'revoke' }
                })
                details.seatRemoved = off.status
              }
            }
          }
        })
      })
    }
  } finally {
    await browser.close()
  }
})
