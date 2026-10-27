/**
 * `GET /api/sites/:key/guide` — what the site agent reads when a customer asks it how to use Tracy
 * itself (`tracy_guide` in `@tracy/dsh-site-tools`). `_conversation` in the path means the site of
 * the asking conversation, as every door the host calls (`conversationSite`).
 *
 * Query: `q` (the customer's question, any language Tracy's keywords cover) or `topic` (an article id
 * from an earlier answer), and `recheck=1` (only with the domain article, only for an Owner).
 *
 * Answers `{ articles: [{ id, title, body, screen, roleNote, state }], topics }`. An empty
 * `articles` with the `topics` list means "the guide has nothing on that" — the agent then says it
 * does not know and points to Discord, it does not invent.
 *
 * 🔒 WHAT IT IS TOLD IS WHAT THE SCREEN SHOWS. The live state comes from the snapshot the Publish
 * tab reads (`settingsSnapshot`), so the agent and the card cannot disagree; `recheck` runs the same
 * act as "Check again" (`verifyOwnDomain`) under the same Owner/switch fences, and then reads the
 * snapshot — it never looks up DNS by a road of its own.
 *
 * 🔒 IT GRANTS NOTHING. Read-only for every seat; `recheck` only writes the lookup the button writes,
 * and only for an Owner. An article about a switch the operator turned off is not offered.
 */
import { json } from '../lib/http.js'
import { readUiHidden, uiSwitchOn } from '../lib/ui-setting.js'
import { available, roleNote, screenLink, search, topics } from '../lib/guide.js'
import { domainState, publishState, STATEFUL } from './guide-state.js'

const CONNECT_DOMAIN_SWITCH = 'site-connect-domain'
/** Articles in one answer: enough to cover a mixed question, few enough to keep the tool result short. */
const MAX_ARTICLES = 3

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {(c: any) => Promise<{ siteKey: string, error?: Response }>} deps.conversationSite
 * @param {(c: any, siteKey: string, allowActor?: boolean) => Promise<any>} deps.requireGrant
 * @param {(key: string) => Promise<any>} deps.siteByKey
 * @param {(site: any, grant: any) => Promise<{ site: any, extra: any } | null>} deps.snapshot -
 *   `settingsSnapshot`, the read the Publish tab draws from
 * @param {{ verifyOwnDomain: Function, canConnect: () => boolean }} deps.ownDomains
 * @param {string} deps.origin - Tracy's public origin: a link in the agent's chat must be an absolute
 *   https address, because the chat draws nothing else as a link (dsh markdown `sanitizeUrl`)
 */
export function mountSiteGuide(
  app,
  { pool, conversationSite, requireGrant, siteByKey, snapshot, ownDomains, origin }
) {
  app.get('/api/sites/:key/guide', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const site = await siteByKey(held.siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)

    const role = auth.grant?.role ?? null
    let hidden = []
    try {
      hidden = await readUiHidden(pool)
    } catch {
      // A switch that cannot be read offers every article: the screen's own doors still refuse.
    }
    const offered = available(hidden, site.platform)

    const url = new URL(c.req.url)
    const topic = (url.searchParams.get('topic') ?? '').slice(0, 80)
    const question = (url.searchParams.get('q') ?? '').slice(0, 400)
    const found = topic ? offered.filter((a) => a.id === topic) : search(question, offered, MAX_ARTICLES)
    if (found.length === 0) return json(c, { articles: [], topics: topics(offered) })

    const wantsState = found.some((a) => STATEFUL.has(a.id))
    const connectOn = await switchOn(CONNECT_DOMAIN_SWITCH)
    let recheck = null
    if (wantsState && url.searchParams.get('recheck') === '1') recheck = await runRecheck()
    const snap = wantsState ? await snapshot(site, auth.grant).catch(() => null) : null

    const place = { workspaceUrl: workspaceUrlOf(site, origin), name: site.primary_name || site.site_key }
    const out = found.map((article) => {
      const state = stateFor(article.id, snap, role, connectOn)
      return {
        id: article.id,
        title: article.title,
        body: article.body,
        screen: screenLink(article, place),
        ...(roleNote(article, role) ? { roleNote: roleNote(article, role) } : {}),
        ...(state ? { state } : {}),
        ...(article.id === 'own-domain' && recheck ? { recheck } : {})
      }
    })
    return json(c, { articles: out, topics: topics(offered), role })

    /** "Check again" for the site's pending domain — the Owner's button, run on the Owner's behalf. */
    async function runRecheck() {
      if (role !== 'owner') return { done: false, reason: 'NOT_SITE_OWNER' }
      if (!connectOn) return { done: false, reason: 'OWN_DOMAIN_DISABLED' }
      if (!ownDomains.canConnect()) return { done: false, reason: 'OWN_DOMAIN_UNAVAILABLE' }
      const now = await snapshot(site, auth.grant).catch(() => null)
      const pending = now?.extra?.addressChange?.pending
      if (!pending) return { done: false, reason: 'NO_PENDING_DOMAIN' }
      const result = await ownDomains.verifyOwnDomain(site, pending.name)
      return {
        done: result.status === 202,
        status: result.status,
        ...(result.body?.code ? { reason: result.body.code } : {})
      }
    }

    function stateFor(id, snap, role, connectOn) {
      if (!snap) return null
      if (id === 'own-domain') {
        const d = domainState(snap, role, { connectOn, canConnect: ownDomains.canConnect() })
        return d.lines.length > 0 ? d.lines : null
      }
      if (id === 'publish') {
        const lines = publishState(snap)
        return lines.length > 0 ? lines : null
      }
      return null
    }
  })

  async function switchOn(id) {
    try {
      return await uiSwitchOn(pool, id)
    } catch {
      return true
    }
  }
}

/** The site's workspace address, the one every `?tab=` link is built on. */
function workspaceUrlOf(site, origin) {
  return `${origin.replace(/\/+$/, '')}/${encodeURIComponent(site.primary_name || site.site_key)}/`
}
