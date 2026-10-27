/**
 * The Tracy badge — one floating pill stamped onto a customer's working copy, in place of the
 * old iframe shell (ADR 0086 §5). Ported from `badgeTagFor`/`escapeAttr` in
 * `workers/fleet-bar/src/index.js:243-277`, with the proposal wardrobe dropped: proposals are
 * not carried into this migration (the plan's own instruction) — no `data-proposals-href`, and
 * `hasProposals` is not a parameter here.
 *
 * 🔒 `data-team-href` IS CROSS-ORIGIN AGAIN, AND ON PURPOSE (ADR 0018). It used to be
 * `/__tracy/team` on the site's own hostname — a door the bar served itself. The bar stopped
 * serving doors that need a session, so the link goes back to where the roster actually lives:
 * `${origin}/<label>/team` on Tracy's own hostname (`seats/route.js`), which asks for a sign-in
 * when it needs one. Pointing it at a path on the customer's hostname now would point at a 404.
 */

/** Attribute values ride inside double quotes; a stray quote must not break out of them. */
function escapeAttr(value) {
  return String(value).replace(/[&"<>]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * Which badge a site gets. A public DEMO of a quickstart is an offer, not a site anyone holds: it
 * ADVERTISES (16/09/2026 asked for a `create` pill; 5b425c27d replaced it the same day with
 * Tracy's mark and "Customize with Tracy"). Every other row keeps the rule the Worker had — live is
 * `managed`, anything else is a `draft`.
 *
 * ⚠ `create` WAS REMOVED 20/09/2026, and removing it was cleanup rather than a product call: this
 * function had already stopped returning it, so `createHrefFor`, `demoCreateHref` and the `create`
 * branch of `badgeTagFor` were code no input could reach, with a test still guarding the door.
 * @param {{demo?: boolean, publish?: string, badge?: boolean}} site
 * @returns {'none'|'advert'|'managed'|'draft'}
 */
export function badgeVariantFor(site) {
  // A person may install a demo with no badge at all (16/09) — `site.badge === false` is the
  // press that said so, and it means the page is proxied exactly as the copy sent it.
  if (site?.demo && site?.badge === false) return 'none'
  // A public DEMO advertises: Tracy's mark and "Customize with Tracy", opening the demo's own
  // template on the Design inspiration page (`lib/tracy-badge.js`).
  if (site?.demo) return 'advert'
  return site?.publish === 'published' ? 'managed' : 'draft'
}

/**
 * The badge script tag itself. The caller states the variant and the copy's doors as data
 * attributes; the badge script (one file, `config.badgeUrl`) renders and never guesses.
 *
 * @param {object} input
 * @param {'draft'|'managed'|'copy'} [input.variant] - unrecognized values fall to 'copy', the same
 *   failure mode `badgeTagFor` in the Worker picks (an extra pill, never a wrong claim).
 * @param {string} input.hostname - the site's own hostname, for `data-site`.
 * @param {string|null} [input.email] - the viewer's email, only when they hold a seat here.
 * @param {string} input.origin - `config.origin`, the Tracy hostname the team link lives on.
 * @param {string} input.label - the site's label, the `/:label/team` route's own parameter.
 * @param {string} input.badgeUrl - `config.badgeUrl` (Task 11's one company fact for this).
 * @returns {string} the `<script>` tag to insert before `</body>`.
 */
export function badgeTagFor({ variant = 'copy', hostname, email = null, origin, label, badgeUrl }) {
  const known = variant === 'draft' || variant === 'managed' ? variant : 'copy'
  const attrs = [
    `data-variant="${known}"`,
    `data-site="${escapeAttr(hostname)}"`,
    email ? `data-viewer="${escapeAttr(email)}"` : '',
    `data-team-href="${escapeAttr(new URL(`/${label}/team`, origin).href)}"`
  ]
    .filter(Boolean)
    .join(' ')
  return `<script async src="${escapeAttr(badgeUrl)}" ${attrs}></script>`
}
