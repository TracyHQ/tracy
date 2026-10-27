/**
 * Where "Open workspace" takes a person once their new or imported site is ready.
 *
 * 🔒 ALWAYS THE SAME TAB (15/09/2026). A workspace is a site: its sessions live in that site's own
 * workspace, not in the conversation (or the `/new/` creation workspace) that pressed Create. Measured
 * 14/09 from `/new/`: a new tab left the person typing where no site is mounted, and the agent spent 19
 * minutes guessing a site key and refusing itself.
 */

/** The mount tracy-web serves the creation workspace under (`apps/tracy-web/src/workspace/scope.js`). */
export const ONBOARDING_MOUNT = '/new'

/**
 * @param {{siteKey: string, forkUrl?: string}} input
 * @returns {string} the workspace address, root-absolute — tracy-web's own door, not a dsh path.
 */
export function workspacePath({ siteKey, forkUrl }) {
  const base = `/${siteKey}/`
  if (!forkUrl) return base
  const query = new URLSearchParams({ fork: forkUrl, tab: 'tracy:brand-builder', site: siteKey })
  return `${base}?${query.toString()}`
}

/**
 * Where a page goes the moment the site it just made is ready, or null to stay put.
 *
 * INTO THE SITE'S WORKSPACE (Vincent, 22/09/2026), reversing "no page load" (15/09, `10cfe2c61`):
 * staying on `/new/` with the site framed in the side card read as "it only opened a browser, nothing
 * was made" — the main pane still said "Let's build your first site", and the one place to prompt
 * the new site's agent was a page load away. A page already on that workspace stays put.
 * @param {{siteKey: string, pageSite: string | null, forkUrl?: string}} input
 * @returns {string | null}
 */
export function readyLanding({ siteKey, pageSite, forkUrl }) {
  if (pageSite === siteKey) return null
  return workspacePath({ siteKey, forkUrl })
}
