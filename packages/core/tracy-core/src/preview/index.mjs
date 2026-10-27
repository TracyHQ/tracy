/**
 * Which platforms' public copy can be shown inside Tracy's Browser tab (an iframe on the web
 * surface), and which must open in a real browser tab. A platform fact, like `admin-path.mjs`.
 *
 * An EmDash customer copy cannot be framed: it serves `X-Frame-Options: SAMEORIGIN` and no
 * `frame-ancestors`, so an iframe of it renders a Chromium error, not the site. WordPress and
 * Joomla set a `frame-ancestors` that lets Tracy frame them, so their preview is unchanged; only a
 * public demo is granted framing (`apps/tracy-web/src/lib/demo-sites.js`). An unnamed platform is
 * treated as frameable — the old optimistic default.
 *
 * Measured 19/09/2026 on the local stand, both sites live at the same moment:
 *
 *     demoemdasbh.tracy.test  →  x-frame-options: SAMEORIGIN            (no frame-ancestors)
 *     demowwwww.tracy.test    →  csp: frame-ancestors 'self' … tracy.test:51710
 *
 * 🔒 ONE COPY, BECAUSE THREE SURFACES ASK THE SAME QUESTION AND ONE OF THEM GOT IT WRONG. This
 * rule lived in `@tracy/dsh-add-site` and was hand-copied into `@tracy/dsh-my-sites`; the third
 * caller — the Live site tab in `@tracy/dsh-site-build-core` — never asked at all and framed
 * every platform. An EmDash customer opening Live site got an empty panel with no line of text
 * saying why, while the site itself answered 200 the whole time. A fact copied twice is a fact the
 * third reader does not know exists.
 */

/**
 * Platforms whose public copy refuses framing and must open in a real browser tab.
 *
 * 🔒 EMPTY SINCE 19/09/2026, AND THE REASON IS THAT THE REFUSAL MOVED RATHER THAN VANISHED. EmDash
 * still sends `X-Frame-Options: SAMEORIGIN` from its own middleware — but every site Tracy shows is
 * reached through `apps/tracy-web/src/bar/site-proxy.js`, and that proxy now drops the XFO and
 * names Tracy's origin in a scoped `frame-ancestors` when the site declared none. So by the time a
 * response reaches a Tracy surface, all three platforms answer the same way.
 *
 * ⚠ Fixing it at provision was tried first and does not hold for every template: `TRACY_FRAME_ANCESTORS`
 * is read by Tracy's own EmDash themes, while a released template like `tracy-saas/emdash-0.x`
 * hardcodes `frame-ancestors 'none'` and ignores it — measured the same day, setting the variable
 * changed no header. The proxy is the one party every site's response passes through.
 *
 * The list stays rather than the callers losing their question: a platform that cannot be framed is
 * a thing that can be true again, and `canFrameCopy` is where that would be said.
 */
// The annotation is load-bearing, not decoration. `Object.freeze([])` infers `readonly never[]`,
// and a consumer that checks JS then reads this as an untyped mutable array: `tsc -p
// packages/site/tracy-add-site` and `-p packages/site/tracy-my-sites` both failed with TS4104 +
// TS7005 while `tsc -p packages/core/tracy-core` passed, because the error lands on the READER,
// not on this file. Naming the element type is what makes an empty list mean "no platform yet"
// instead of "no platform ever".
/** @type {readonly string[]} */
export const EXTERNAL_ONLY_PLATFORMS = Object.freeze([])

/**
 * Can this platform's copy be framed in the Browser tab? `true` for every platform while
 * {@link EXTERNAL_ONLY_PLATFORMS} is empty (EmDash included, since 19/09/2026).
 * @param {string|null|undefined} platform The site's platform.
 * @returns {boolean}
 */
export function canFrameCopy(platform) {
  return !(platform != null && EXTERNAL_ONLY_PLATFORMS.includes(platform))
}
