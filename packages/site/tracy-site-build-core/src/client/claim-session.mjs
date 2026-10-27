/**
 * The second half of a press, in the site it just claimed.
 *
 * A build starts with one question — the business name — and that name IS the site's address, so
 * the site is claimed (`POST /api/sites/claim`) and the customer is moved into ITS workspace before
 * anything is built (tasks/todo-claim-then-workspace.md, Lee 15/09). What has to happen on arrival
 * is what the old Joomla handoff did at the END of a build, and for the same reason:
 *
 *   1. the site's folder is REGISTERED as a dsh workspace. A session made with `cwd` alone lands in
 *      no workspace, and dsh lists sessions by workspace — the session is there while the page
 *      lives and gone from the picker the moment dsh restarts ("Choose workspace", measured 13/09);
 *   2. a session is started IN it, so every command the agent runs is inside this site's own
 *      container and inside the fence its seat draws (ADR 0014 §3);
 *   3. the CMS's persona is selected on that session, before a turn has run — dsh refuses the
 *      change afterwards;
 *   4. the Build tab opens there, carrying what the press already knows.
 *
 * Idempotent: a session already standing in the folder is opened rather than doubled, so a reload
 * of this page continues instead of making a second conversation.
 */

import { mainSessionOf } from '@tracy/core/session'
import { siteKeyHere } from '@tracy/core/site-key'

/**
 * Which site this page IS — the one rule in `@tracy/core/site-key`, which also says that the
 * creation workspace (`/new/`) is no site's page, whatever pointer cookie a previous page left.
 * @returns {string | null}
 */
function siteKeyOfPage() {
  return siteKeyHere()
}

/**
 * The claim this page is the site of, or null — a carry for another site belongs to another tab.
 * @param {import('./carry.mjs').Carry | null} carry
 * @param {string | null} [siteKey]
 * @returns {import('./carry.mjs').Carry | null}
 */
export function claimHere(carry, siteKey = siteKeyOfPage()) {
  if (!carry?.siteKey || !carry.label) return null
  return carry.siteKey === siteKey ? carry : null
}

/**
 * Open (or make) the session this claimed site's build belongs in.
 * @param {import('./carry.mjs').Carry} carry
 * @param {{ services: any, openBuild: (sessionId: string, carry: import('./carry.mjs').Carry) => void, wait?: () => Promise<void>, tries?: number }} deps
 * @returns {Promise<string | null>} the session id, or null when this composition cannot make one.
 */
export async function openClaimedSite(carry, deps) {
  const { services, openBuild } = deps
  const wait = deps.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 200)))
  const tries = deps.tries ?? 150
  const path = `/site/${carry.label}`

  // 🔒 NOT BEFORE dsh HAS LISTED ITS SESSIONS. The list is `pending` for the first moments of a
  // page, and asked then it answers "no session in this folder" for a folder that has one — every
  // reload made a new conversation (measured 15/09: three sessions, three reloads). The phase is
  // what tab-link waits on too, for the same reason.
  for (let i = 0; i < tries; i++) {
    if (services.sessions.list.getSnapshot().phase !== 'pending') break
    await wait()
  }
  // dsh 0.1.6-alpha.2: the main view is switched by `ui-workspace`, a SERVICE — `ctx.uiWorkspace`
  // as a property is undefined, so it is read through `get` (tab-link reads it the same way). A
  // shell without it cannot switch; the waits below then run out and the tab still opens.
  const workspace = typeof services.get === 'function' ? services.get('uiWorkspace') : undefined
  // Already standing in it: a reload, or a second Build tab. Never a second session.
  const standing = Object.entries(services.sessions.list.getSnapshot().byId).find(
    ([, row]) => /** @type {{cwd?: string} | undefined} */ (row)?.cwd === path
  )?.[0]
  if (standing !== undefined) {
    if (mainSessionOf(services.sessions.list.getSnapshot()) !== standing) workspace?.openSession(standing)
    await sidebarOn(services, standing, wait, tries)
    openBuild(standing, carry)
    return standing
  }

  if (typeof services.workspaces?.create !== 'function' || typeof services.sessions?.create !== 'function')
    return null
  // `create` is idempotent: a folder already registered answers the same workspace.
  const registered = await services.workspaces.create({ path })
  const workspaceId = registered?.workspaceId ?? registered?.workspace?.workspaceId
  // 🔒 ASK dsh FOR THE SESSION RATHER THAN MAKING ONE. `connectWorkspace` (dsh 0.1.6,
  // `ui-workspace/navigation.ts`) reuses a BLANK session whose cwd is this folder and creates one
  // only when there is none — and it matches on the workspace's own `sessionIds`, which is what
  // the scan above cannot do: the row dsh inserts first carries no `cwd` at all, so a session
  // standing in the folder is invisible here for a moment. Measured 19/09 by counting every
  // address change of one create: the handed-over site ended with TWO sessions, `…/s/<first>`
  // replaced and `…/s/<second>` pushed — a Back that leads to an abandoned conversation, and a
  // session nobody ever speaks in.
  const sessionId =
    typeof workspaceId === 'string' && typeof workspace?.connectWorkspace === 'function'
      ? await workspace.connectWorkspace(workspaceId)
      : await services.sessions.create(typeof workspaceId === 'string' ? { workspaceId } : { cwd: path })
  // dsh inserts an optimistic list row without a cwd; the real one arrives with the next baseline.
  if (services.sessions.list.getSnapshot().byId[sessionId]?.cwd === undefined)
    await services.sessions.refresh()
  for (let i = 0; i < tries; i++) {
    if (services.sessions.list.getSnapshot().byId[sessionId]?.cwd !== undefined) break
    await wait()
  }
  // The persona of the CMS being built, on a session that has not spoken yet. Best effort: a
  // refused preset is an agent with the wrong tools, not a form the customer cannot fill.
  try {
    await services.remote.agentPresets.select(sessionId, `designer-${carry.platform}`)
  } catch {
    // Left to the shell's default.
  }
  workspace?.openSession(sessionId)
  // 🔒 THE TAB OPENS ONCE THE SESSION IS THE ONE ON SCREEN. A tab opened for a session that is
  // not yet active is a targeted open, and the side card deliberately does not expand its panel
  // for one — the customer landed on an empty chat with the form hidden behind a collapsed side
  // card (measured 15/09). Waiting for the switch makes it a plain open, which reveals.
  for (let i = 0; i < tries; i++) {
    if (mainSessionOf(services.sessions.list.getSnapshot()) === sessionId) break
    await wait()
  }
  await sidebarOn(services, sessionId, wait, tries)
  openBuild(sessionId, carry)
  return sessionId
}

/**
 * Wait until the SIDE CARD is on this session too — not just dsh's session list.
 *
 * 🔒 TWO THINGS SWITCH SESSION, AND THEY DO NOT SWITCH TOGETHER. `sessions.open` flips dsh's list
 * first; the side card adopts the new session a beat later, and until it has, an open aimed at that
 * session is a TARGETED open — which deliberately does not expand the panel (`build-handoff.mjs`).
 * Measured 17/09 on the local stack, pressing Create with Joomla on JA Voyara: the tab WAS created
 * (`dsh-sidebar:v1:session-…` held `tracy:build:joomla::site-…` with `panelOpen: true`) and the
 * screen showed a chat with no side card at all. A reload then rendered the form — the state had
 * been right the whole time, and nothing on screen said the build was waiting for an answer.
 *
 * A composition without the service (tests, a shell with no side card) answers `undefined` and is
 * not waited for: this must never hold up a build.
 */
async function sidebarOn(services, sessionId, wait, tries) {
  for (let i = 0; i < tries; i++) {
    const on = services.betterSidebar?.getSnapshot?.()?.sessionId
    if (on === undefined || on === sessionId) return
    await wait()
  }
}
