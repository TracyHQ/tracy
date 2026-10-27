/**
 * THE address a site answers at, derived once for THREE callers that must never disagree.
 *
 * `http://<label>.<siteDomain>:<this process's own port>/` — the only address a LOCAL site can
 * answer at until Plan 3's DNS/ingress machinery exists. It reuses `config.origin`'s own port
 * (`TRACY_ORIGIN`) because this process's own listener is the only door a browser can currently
 * reach a site's workspace through.
 *
 * 🔒 THE SCHEME COMES FROM `config.origin`, NOT FROM A LITERAL. It was `http://` until 11/09, and
 * on a laptop that is right — `<label>.localhost:8080` is plain http and always will be. On the
 * dev machine the same line wrote `http://devsmoke1.tracy.site/` into `site.address`, which is
 * what `/api/sites` hands back as `copyUrl` and the job poll returns as `liveUrl`: the one string
 * a person copies to give their site to somebody else. The site answers https; the URL we handed
 * out did not say so.
 *
 * 🔒 IT LIVES HERE BECAUSE THREE DOORS NEED IT, AND A COPY IS HOW THEY DRIFT APART. It was written
 * twice — `sites/route.js` wrote the value, `seats/route.js` read it back for a row that had none —
 * and each copy carried a comment saying it had to stay equal to the other, which is a rule with
 * nobody to enforce it. The third caller (`cron.js`'s provision sweep, 21/09) is what made the copy
 * a real cost rather than a tidiness argument: a disagreement between them shows up as a site whose
 * address changes depending on which door you asked, and no gate reads prose.
 *
 * Production's `origin` is `https://…` with no port, so this produces the string the Worker
 * produced. Same rule as `public/config-door.js`'s `sitePort`, for the same reason: a literal is
 * right on exactly one deployment.
 *
 * @param {string} label - the site's label, the first segment of its address.
 * @param {{origin: string, siteDomain: string}} config
 * @returns {string} the address, with its trailing slash.
 */
export function bornSiteAddress(label, config) {
  const { protocol, port } = new URL(config.origin)
  return `${protocol}//${label}.${config.siteDomain}${port ? `:${port}` : ''}/`
}
