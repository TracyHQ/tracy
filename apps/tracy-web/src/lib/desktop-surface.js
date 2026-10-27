/**
 * Whether a request comes from the Tracy Desktop app, read from the `TracyCowork/<version>` token
 * the app appends to its user agent (`markUserAgent` in packages/desktop/tracy-desktop/src/main.js).
 *
 * Spoofable product-flow hint for the template handoff between web and app. Never establishes
 * identity, admission, entitlement, or account privileges.
 *
 * Anyone can type the token into a browser, so it only decides the handoff and the nudge: whether
 * the template landing offers the app (web) or consumes the template waiting for it (app), and
 * whether the root follows that waiting template (app only). It never decides what a door serves —
 * the web and the app have the same features (11/10/2026) — and never opens a sign-in, a
 * seat, a profile or a model. This file is the only place that reads the token, so every caller
 * inherits that one rule.
 */

const TOKEN = /\bTracyCowork\/\d/

/**
 * @param {string | null | undefined} userAgent - the request's `User-Agent` header.
 * @returns {boolean}
 */
export function isDesktopApp(userAgent) {
  return TOKEN.test(String(userAgent ?? ''))
}
