/** Safe projection of the site's live CMS configuration. Never return a config dump. */
import { json, normalizeSiteKey } from '../lib/http.js'

const fields = {
  wordpress: ['version', 'title', 'language', 'theme', 'homepage', 'permalinks', 'timezone'],
  joomla: ['version', 'title', 'language', 'languages', 'template', 'sef', 'timezone'],
  emdash: ['version', 'title', 'tagline', 'template', 'postsPerPage', 'timezone', 'titleSeparator']
}
const adminPaths = { wordpress: 'wp-admin/', joomla: 'administrator/', emdash: '_emdash/admin/' }

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {Function} deps.requireGrant
 * @param {(key: string) => Promise<any>} deps.siteByKey
 * @param {(site: any) => string | null} deps.address
 * @param {(site: any) => Promise<any>} deps.read - the CMS's own settings, read from the running site
 * @param {(site: any, role: string) => Promise<object>} [deps.extra]
 * @param {(site: any, grant: any) => Promise<{ site: any, extra: object } | null>} [deps.current] -
 *   the site's row and everything read beside it, as ONE snapshot taken after the CMS answered;
 *   null when the site is gone by then. Defaults to the row read at the door plus `extra`.
 */
export function mountSiteSettings(
  app,
  {
    requireGrant,
    siteByKey,
    address,
    read,
    extra = async () => ({}),
    current = async (site, grant) => ({ site, extra: await extra(site, grant.role) })
  }
) {
  app.get('/api/sites/:key/settings', async (c) => {
    c.header('cache-control', 'private, no-store')
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    let snapshot
    try {
      snapshot = await read(site)
    } catch {
      snapshot = null
    }
    const available = snapshot?.platform === site.platform && fields[site.platform] !== undefined
    const values = {}
    if (available)
      for (const key of fields[site.platform]) {
        const value = snapshot[key]
        if (typeof value === 'string') values[key] = value.slice(0, 2000)
        else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean')
          values[key] = value
      }
    // 🔒 THE ADDRESS, THE ADMIN LINK AND EVERYTHING BESIDE THEM COME FROM ONE SNAPSHOT, TAKEN LAST.
    // Reading the CMS takes seconds. The address used to be worked out from the row read before
    // that, and the rest read after it: a rename or a publish that landed in between gave one
    // answer with the old address and admin link beside the new state.
    const now = await current(site, auth.grant)
    if (!now) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const siteUrl = address(now.site)
    const adminUrl =
      siteUrl && adminPaths[site.platform]
        ? new URL(adminPaths[site.platform], siteUrl.replace(/\/?$/, '/')).href
        : null
    return json(c, {
      siteKey,
      siteUrl,
      adminUrl,
      platform: site.platform,
      role: auth.grant.role,
      state: available ? 'ready' : 'unavailable',
      values,
      ...now.extra
    })
  })
}
