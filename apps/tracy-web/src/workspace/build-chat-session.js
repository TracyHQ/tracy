/**
 * The creation workspace's build chat (TracyHQ/tracy#602): a dsh session in the viewer's own
 * creation workspace (`/new/`) that runs the build agent, so a person can build a site in the chat
 * before any site exists. One per account for now.
 *
 * 🔒 THE SESSION IS MINTED BY THE SIGNED SEAT DOOR, NEVER BY THE BROWSER. The door
 * (`vendor/tracy/dsh-passwords/src/tracy/native-session.ts`) admits a `session-build-<UUID>` ID
 * only with the build agent preset and the creation seat (`onboardingGrant`: content only, no
 * folder, no site), and the seat tool guard refuses every tool such a session calls outside the
 * build tools (`build-agent.ts` there). The browser cannot choose a session ID, so the prefix is
 * the grant.
 *
 * WHY THE ID IS DERIVED, NOT STORED. The door adopts an existing session when it is asked again
 * with the same ID, cwd and preset, so an ID derived from the account (keyed with this deployment's
 * session secret, so it cannot be guessed from an address) makes every open land in the same
 * conversation with no table to keep. The account draft of TracyHQ/tracy#603 is where a second
 * build of the same account will take a new ID.
 */
import { hmacHex } from '../lib/hmac.js'

/** The preset the door pairs with a build session (`buildAgent` in `config/mode-matrix.json`). */
export const BUILD_AGENT_PRESET = 'site-builder'
/** The operator's switch for the build chat (`@tracy/core` `ui-switches/catalogue.json`). */
export const BUILD_CHAT_SWITCH = 'chat-build'
/** The navigation that opens the viewer's build chat (`build-chat-route.js`). */
export const BUILD_CHAT_PATH = '/new/build'

/**
 * The build session ID of one account: `session-build-` and a UUID shape made from an HMAC of the
 * address, the exact form the seat door accepts.
 * @param {string} email - the signed-in address
 * @param {string} secret - this deployment's session secret
 * @returns {Promise<string>}
 */
export async function buildSessionIdFor(email, secret) {
  const h = await hmacHex(secret, `tracy-build-chat:${email.trim().toLowerCase()}`)
  // Version and variant nibbles set like a v4 UUID, so the ID reads as one wherever it is shown.
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `session-build-${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}
