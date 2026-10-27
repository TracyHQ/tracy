/**
 * The grant a SITE seat is minted with at a host's dsh — one shape, built here, so the mint on
 * first visit (`workspace/route.js`), the re-mint that follows a role change (`seats/route.js`)
 * and the outbox that retries it (`cron.js`) all write the same permission row. Two builders
 * would be two rows for one seat, and the one a live session runs on would be whichever wrote
 * last.
 *
 * `folders` is the SITE fence (ADR 0014 §3's `FS_TOOL_ARGS`: what confines an agent command to
 * this site's own web container), not a ROLE fence — every role that reaches a site works inside
 * the same site folder. What a role may DO inside it is `toolsets`: the role's fixed set
 * (`seats/roles.js` `toolsetsFor`, ADR 0028; empty for a viewer), sent as a result rather than
 * left to the lane's own role default (ADR 0001 §3).
 *
 * @param {{email: string, role: string, label: string, siteKey: string, toolsets?: string[]}} input
 * @returns {{role: string, email: string, folders: string[], site: string, toolsets?: string[]}}
 */
export function siteSeatGrant({ email, role, label, siteKey, toolsets }) {
  return {
    role,
    email,
    folders: [`/site/${label}`],
    site: siteKey,
    ...(toolsets ? { toolsets } : {})
  }
}
