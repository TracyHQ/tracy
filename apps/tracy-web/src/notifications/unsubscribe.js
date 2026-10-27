/**
 * One-click unsubscribe for notification mail (spam hints C1-B, 05/10/2026; RFC 8058).
 *
 * Every notification letter whose group can be switched off carries
 *   List-Unsubscribe: <{origin}/api/notifications/unsubscribe?t={token}>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 * so Gmail and Yahoo show "Unsubscribe" beside the sender and POST to that URL when it is pressed.
 * The door (`route.js`) then turns off the EMAIL switch of that letter's group only; the Inbox
 * stays on, as do the other groups.
 *
 * 🔒 THE LOCKED JOIN-REQUEST GROUP GETS NO HEADER. An Owner or Admin must not miss a person waiting
 * at the door (03/10/2026), and a header whose press does nothing would be a lie, so those
 * letters carry none, and the door refuses a token naming a locked group even if one were minted.
 * Mail that is not a notification (sign-in code, whitelist, beta, the invitation itself) never goes
 * through the notifier, so it never carries the header.
 */
import { mintUnsubscribeToken } from '../lib/unsubscribe-token.js'
import { groupOfKind } from './preferences.js'

/** The path of the unsubscribe door, under the deployment's origin. */
export const UNSUBSCRIBE_PATH = '/api/notifications/unsubscribe'

/**
 * The notifier's `unsubscribeHeaders`, bound to one deployment.
 * @param {{origin?: string, sessionSecret: string}} config
 * @param {() => number} [now]
 * @returns {(accountId: string, kind: string) => Promise<Record<string, string> | null>}
 */
export function unsubscribeHeadersFor(config, now = Date.now) {
  // The deployment's own origin, never a hard-coded production one: a letter sent from dev or
  // staging must unsubscribe on dev or staging. No origin configured = no header (nothing to link).
  const origin = typeof config?.origin === 'string' ? config.origin.replace(/\/+$/, '') : ''
  return async (accountId, kind) => {
    const group = groupOfKind(kind)
    if (!origin || !group || group.locked || !accountId) return null
    const token = await mintUnsubscribeToken({
      accountId,
      groupId: group.id,
      secret: config.sessionSecret,
      now: now()
    })
    return {
      'List-Unsubscribe': `<${origin}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  }
}
