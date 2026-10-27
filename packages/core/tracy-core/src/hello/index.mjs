/**
 * A page telling its lane who is looking (`/api/tracy-site-tools/hello`, `/api/tracy-site-tabs/hello`),
 * and stopping once the site behind the page is gone.
 *
 * 🔒 A PAGE OUTLIVES ITS SITE. Delete a site and the tab that was open on it stays open; both hellos
 * run again every time that tab becomes visible. `tracy-web` answers a request for a site the viewer
 * holds no seat on with a 302 to `/<label>/join` (`apps/tracy-web/src/workspace/route.js`), and for a
 * site the book no longer holds that page answers 404 "Unknown site" (`seats/route.js`) — so every
 * time the tab came back, two hellos each ended there (issue #340, measured 24/09 on dev: a tab still
 * open on the deleted `qa-jo-0924.tracy.site` sent `POST …/api/tracy-site-tools/hello` and
 * `…/api/tracy-site-tabs/hello` → 302 → `GET /qa-jo-0924/join` 404).
 *
 * ⚠ ONLY THAT ANSWER STOPS THE PAGE, NOT ANY REDIRECT. The same door also redirects a live seat
 * holder: right after it mints a renewed seat token it sends the request back to its own address
 * (`if (minted) return c.redirect(url.pathname + url.search, 302)`), and a seat dsh no longer honours
 * is sent round again with the cookie cleared. Stopping on those would silence a page whose viewer
 * is still there. So the redirect is followed, and the page stops only when it ends at the join page
 * answering 404 — a site the book does not know. A join page answering 200 (the site exists, this
 * viewer's seat was revoked) does not stop it: a seat can be given back. Neither does a failed
 * request (the network, a lane restarting): the next hello tries again.
 *
 * A reload does not bring the hellos back: navigating to a deleted site's page takes the same way,
 * `/<label>/join` → 404, and no plugin runs on that page.
 */

/** `/<label>/join` — the page `workspace/route.js` sends a viewer with no live seat to. */
const JOIN_PAGE = /^\/[^/]+\/join\/?$/

/**
 * Whether a hello's answer says the site behind the page no longer exists.
 * @param {{ redirected?: boolean, url?: string, status?: number } | undefined} res
 * @returns {boolean}
 */
export function siteIsGone(res) {
  if (!res?.redirected || res.status !== 404 || typeof res.url !== 'string') return false
  try {
    return JOIN_PAGE.test(new URL(res.url).pathname)
  } catch {
    return false
  }
}

/**
 * @param {() => Promise<{ redirected?: boolean, url?: string, status?: number } | undefined>} send -
 *   one hello, with `fetch`'s default redirect handling (followed).
 * @returns {{ hello: () => Promise<void>, stopped: () => boolean }}
 */
export function helloUntilGone(send) {
  let gone = false
  return {
    hello: async () => {
      if (gone) return
      try {
        if (siteIsGone(await send())) gone = true
      } catch {
        // A hello is a courtesy; a failed one is tried again on the next occasion.
      }
    },
    stopped: () => gone
  }
}
