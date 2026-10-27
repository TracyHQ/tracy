/**
 * What the guide door tells the site agent about THIS site, worked out from the very snapshot the
 * Publish and Settings tabs draw from (`settingsSnapshot` in `sites/route.js`): the domain card and
 * the publish state. Pure: it takes the snapshot, so a test can hand it every state the card can be
 * in and compare line by line with what the card says.
 *
 * 🔒 NO SECOND READER. The agent is told what the screen shows, because the screen's own data is the
 * input. A fact only the agent knew (a DNS lookup of its own) would be one more thing that can
 * disagree with the card the customer is looking at. The one place it differs is `recheck`, which
 * runs the same act as the "Check again" button first (`verifyOwnDomain`), then reads the snapshot.
 *
 * 🔒 THE ROLE IS KEPT, NOT RE-DECIDED. `addressChangeState` already withheld the TXT value from every
 * role but Owner (`forRole`); this file only passes through what is there and never adds it back.
 */

/** A DNS check, in the words the Domains card uses. */
function checkLine(check) {
  const what =
    check.record === 'ownership'
      ? 'TXT (proves the domain is yours)'
      : check.record === 'routing'
        ? 'CNAME (points the domain at the site)'
        : 'certificate validation record'
  const at = `${check.type} at ${check.name}`
  const want = check.expected ? `, value ${check.expected}` : ''
  let found
  switch (check.status) {
    case 'ok':
      found = 'found, with the right value'
      break
    case 'wrong':
      found = `found with a DIFFERENT value: ${(check.observed ?? []).join(', ') || 'unreadable'}`
      break
    case 'missing':
      found = 'not found'
      break
    case 'unknown':
      found = `could not be read just now (${check.error ?? 'no answer'}), so nothing is confirmed`
      break
    default:
      found = check.record === 'validation' ? 'read when the certificate is issued' : 'not checked yet'
  }
  const when = check.checkedAt ? ` (checked ${check.checkedAt})` : ''
  return `${what} — ${at}${want}: ${found}${when}`
}

/** @param {any} domain - one entry of `addressChange.pending` / `.connected` */
function domainLines(domain) {
  const lines = []
  const state = domain.state === 'connected' ? 'CONNECTED' : 'NOT CONNECTED YET'
  lines.push(`${domain.name}: ${state}`)
  if (domain.problem) {
    lines.push(`  refused: ${domain.problem}${domain.suggestion ? `; use ${domain.suggestion} instead` : ''}`)
  }
  if (domain.holdUntil)
    lines.push(
      `  the name is held for this site until ${domain.holdUntil}; if the TXT record is not found by then it is released`
    )
  for (const check of domain.checks ?? []) lines.push(`  ${checkLine(check)}`)
  const r = domain.readiness
  if (r)
    lines.push(
      `  ready: ownership ${r.ownership ? 'yes' : 'no'}, routing ${r.routing ? 'yes' : 'no'}, HTTPS ${r.tls ? 'yes' : 'no'}`
    )
  if (domain.hostname && domain.hostname.ready === false)
    lines.push(
      `  HTTPS certificate not ready yet${domain.hostname.reason ? ` (${domain.hostname.reason})` : ''}`
    )
  return lines
}

/**
 * The domain part of the answer.
 * @param {any} snapshot - `{ site, extra }` from `settingsSnapshot`
 * @param {string} role
 * @param {{ connectOn: boolean, canConnect: boolean }} offer - the operator's switch and whether this
 *   server can connect domains at all
 */
export function domainState(snapshot, role, offer) {
  const change = snapshot?.extra?.addressChange
  const pending = change?.pending ? [change.pending] : []
  const connected = change?.connected ?? []
  const lines = []
  if (!offer.connectOn)
    lines.push(
      'Connecting a domain is turned off for this workspace by its operator. A domain the site already has keeps working.'
    )
  else if (!offer.canConnect)
    lines.push('Connecting a domain is not available on this server yet. Ask the administrator.')
  if (role !== 'owner')
    lines.push('Only a site Owner can connect, check or remove a domain. This person is not an Owner.')
  for (const d of [...connected, ...pending]) lines.push(...domainLines(d))
  if (pending.length === 0 && connected.length === 0 && offer.connectOn && offer.canConnect)
    lines.push('No own domain is connected or being connected. The site answers at its Tracy address only.')
  for (const lapsed of change?.lapsed ?? [])
    lines.push(
      `${lapsed.name ?? lapsed}: reservation LAPSED (TXT record not found within 72 hours); reserve it again to get a new record`
    )
  const published = snapshot?.extra?.publishing?.publish
  if (published === 'draft' && offer.connectOn)
    lines.push(
      'The site is a DRAFT: a domain can only be connected to a live site, so it must be published first.'
    )
  return { lines, connected: connected.length > 0, pending: pending.length > 0 }
}

/** The publish part of the answer. */
export function publishState(snapshot) {
  const p = snapshot?.extra?.publishing
  if (!p) return []
  const lines = [
    `Publish state: ${p.publish === 'published' ? 'LIVE' : 'DRAFT'}${p.liveSince ? ` since ${p.liveSince}` : ''}.`
  ]
  if (p.operation)
    lines.push(
      p.operation.state === 'running'
        ? `A ${p.operation.op} operation is running now; nothing else can be started until it ends.`
        : `The last ${p.operation.op} operation FAILED (${p.operation.code}); pressing the button again retries it.`
    )
  if (p.mayPublish === false) lines.push('This person cannot publish (only an Owner or an Editor can).')
  return lines
}

/** Which article ids have live state, so the door asks the snapshot only when it is worth it. */
export const STATEFUL = Object.freeze(new Set(['own-domain', 'publish']))
