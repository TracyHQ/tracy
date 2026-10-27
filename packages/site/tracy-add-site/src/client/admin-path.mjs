/**
 * A site's admin door — the second half of the handover screen (ADR 0088 §5.1).
 *
 * ⚠ THIS WAS ONCE DOWNGRADED TO "SHOW NO BUTTON". The first version read `adminUrl` from the job row, saw the fleet
 * did not return it, and concluded the data was missing. Wrong: the admin path is NOT a fact of a
 * build — it is **a property of the platform**, and `tracy-desk` keeps exactly that table in
 * `src/shared/types/platformAdmin.ts`.
 *
 * 🔒 WHAT ADR §7.4 BANS IS A SHARED PATH, NOT A TABLE. `/administrator/` hard-coded for
 * every platform is Joomla's path handed to a WordPress site. A platform → path table is
 * the opposite: it states that the answer differs by platform, and `null` is an answer.
 *
 * ## And signing in automatically?
 *
 * This door carries NO session, and it does not need one. The cloned site signs the viewer in by the
 * `x-tracy-email` header the `fleet-bar` Worker sets after recognising them from its own session —
 * `plg_system_tracyaccess` (Joomla) and `tracy-access.php` (WordPress) read that header and call
 * the platform's real sign-in machinery directly.
 *
 * `tracy-desk` had to do an extra step (`setCloneSession`) only because Electron's webview carries no
 * browser session; a real tab has one already. That is why the Admin button opens a **browser tab**, not
 * a frame in the sidebar: in a frame, third-party cookies are blocked and the Worker does not know who is
 * viewing — the door still opens, but onto the sign-in screen.
 *
 * And if the viewer has no session at all, they see the site's own sign-in screen. The same behaviour
 * `siteDoors.ts` accepts when minting fails: *"the door still opens; it just opens at the sign-in screen"*.
 */

/**
 * The path to each platform's admin page.
 *
 * Copied from `tracy-desk` `src/shared/types/platformAdmin.ts`. The first three values are a contract with the REAL
 * admin UI, not Tracy's choice — `/admin` on EmDash is a 404, the panel lives
 * at `/_emdash/admin`.
 *
 * `null` means **there is no door here to open**, and it must hold: Shopify is administered at
 * `admin.shopify.com`, a host this pane never shows. A guessed path is a 404 that wastes
 * someone's press.
 */
/** @type {Readonly<Record<string, string | null>>} */
export const PLATFORM_ADMIN_PATHS = Object.freeze({
  joomla: '/administrator',
  wordpress: '/wp-admin',
  emdash: '/_emdash/admin',
  shopify: null,
  unknown: null
})

/**
 * A site's admin page address, or `null` when that platform has no door here.
 *
 * Computed from the site's **root**, not appended to the end of `liveUrl`: the fleet returns the root today, but string
 * concatenation would give `/posts/x/administrator` on the day it returns a deeper path.
 * @param {string|null|undefined} liveUrl The site address, as the server reported it.
 * @param {string} platform The chosen platform.
 * @returns {string|null} The admin page address, or null.
 */
export function adminUrlFor(liveUrl, platform) {
  // An unknown platform looks up `undefined`, and `!path` below catches it — the same answer as
  // `shopify`/`unknown`: no door here to open.
  const path = PLATFORM_ADMIN_PATHS[platform]
  if (!path || !liveUrl) return null
  try {
    return new URL(path, liveUrl).toString()
  } catch {
    // A `liveUrl` that does not parse is bad data, not a reason to throw in the middle of the handover
    // screen — people just built a site and the screen must be able to say something.
    return null
  }
}
