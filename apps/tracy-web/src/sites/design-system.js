/**
 * The Design system doors — the site browser's "Design system" button, applied for real (plan
 * `tasks/ke-hoach-nut-design-system.md`). Mounted with its dependencies handed in, like `design.js`
 * and `settings.js`, so the rules below are tested without a database or a host.
 *
 * - GET  /api/sites/:key/design-system        any live grant: what the site wears now (read in its own
 *        container), whether its template can wear a system (and why not), whether this seat may
 *        apply, the last apply that can still be undone, and the library ids the quality gate refuses.
 * - POST /api/sites/:key/design-system {id, template?}   a seat holding `theme.style`'s toolset
 *        (`code`: owner, editor — never a viewer): put OpenDesign system `id` on the running site, no
 *        model turn, no rebuild. `id: "template-default"` takes the worn system off instead (back to the
 *        template's own look, allowed on a locked template too), kept as an apply that undo reverses. The bytes are the slot emitters' (`lib/ds-slot.js`); the host writes
 *        them in the site's own container and keeps what was there before (`site-ds-slot`).
 *        `template`: the `template` the GET answered — the door makes the bytes for it without
 *        reading the site first, and the host writes them only if the site still runs it.
 * - POST /api/sites/:key/design-system/undo {applyId}   same seats: the newest apply not yet undone
 *        goes back to exactly what the site held before it — the previous system, or none — only while
 *        the site still holds what that apply wrote (`DS_CHANGED_SINCE` otherwise, nothing written).
 *        The Design system panel, the site browser's Undo and the apply's Site changes row all press
 *        this one door.
 * An IMPORTED site (`origin = 'migrated'`) may not pick, preview or apply a system, staff included
 * (`lib/design-system-imported-site.js`): the GET says `reason: SITE_IMPORTED`, a new look is 403 `DS_IMPORTED_SITE`.
 *
 * The other doors live beside it, each mounted from here with the same front and helpers:
 * - `design-system-site-reads.js`: GET `…/design-system/words` and `…/design-system/preview` (read, never write).
 * - `design-system-library-doors.js`: GET `/api/design-system/library`, its screenshots, and `/support`.
 * - `design-system-write.js`: the one write an apply is (press, chat route, new site's build), the undo, the lease.
 * - `design-system-fit.js`: what a site runs and whether its template can wear a slot.
 * - `design-system-ids.js`: how library, slot and apply ids are spelled.
 * - `design-system-rows.js`: the Site changes rows those writes leave, and the `site_design_system` store.
 *
 * `mountDesignSystem` also hands back `applyAs` and `checkSystem`: the system picked in the Add site form travels with
 * `POST /api/sites {designSystem}` (judged by `checkSystem`) and is put on at the end of the site's build by the very
 * write the press makes (`applyAs`, `design-system-at-create.js`), as the person who created the site.
 *
 * Both writes answer with `read`: the GET's own answer as the site stands after the write, read in the
 * same run as the write — so the panel needs no second read (a WordPress read is a PHP boot).
 */
import { DS_TEMPLATE_LOCKED, LOCKED_REASON } from '../lib/design-system-customer-lock.js'
import { IMPORTED_REASON, isImportedSite } from '../lib/design-system-imported-site.js'
import { designSystemFit } from './design-system-fit.js'
import { APPLY_ID, lastOf, TEMPLATE_DEFAULT_ID, wornOf } from './design-system-ids.js'
import { mountDesignSystemLibrary } from './design-system-library-doors.js'
import { mountDesignSystemReads } from './design-system-site-reads.js'
import { mountSiteDesignSystemPreviewAssets } from './design-system-site-preview-assets.js'
import { answer, designSystemWrites } from './design-system-write.js'

/**
 * What the agent is told when the operator has closed the chat route (`chat-design-system`): the same
 * words the lane's own refusals carry (`tracy-site-tools`, `tracy-design-inspiration`).
 */
export const CHAT_ROUTE_OFF_MESSAGE =
  'Applying a design system through the chat is turned off. Change nothing; tell the customer in one ' +
  "plain sentence, in their language, to use the Design system row on the site's start screen."

/**
 * Whether a call to the Design system doors is the chat's (the agent's `tracy_design_system` through
 * the lane): it comes as the person who typed (an `actor` grant) or carries the conversation's
 * `x-tracy-session`. The panel's press sends neither. Recorded on every write as `target.channel`
 * (`'chat'` / `'button'`), which is what Site changes reads its Source from (`activity-source.js`
 * `classifyWrites`): a press is `design-system`, the chat route's apply stays `chat`.
 * @param {{ req: { header: (name: string) => string | undefined } }} c
 * @param {{ kind?: string }} auth
 */
export function isChatCall(c, auth) {
  return auth.kind === 'actor' || Boolean(c.req.header('x-tracy-session'))
}

/**
 * @param {import('hono').Hono} app
 * @param {{
 *   requireGrant: (c: any, siteKey: string) => Promise<any>,
 *   normalize?: (key: string) => string,
 *   siteByKey: (key: string) => Promise<any>,
 *   toolsetRefusal: (auth: any, siteKey: string) => Promise<{ toolset: string, role: string } | null>,
 *   runJob: (site: any, input: Record<string, unknown>, ms: number) => Promise<{ ok: boolean, output?: string, reason?: string }>,
 *   lease: { take: (q: any) => Promise<{ ok: boolean, fresh?: boolean, holder?: any }>, release: (q: any) => Promise<void> },
 *   record: (row: any) => Promise<unknown>,
 *   store: {
 *     insert: (row: any) => Promise<void>,
 *     latest: (siteKey: string) => Promise<any | null>,
 *     markUndone: (siteKey: string, undoId: string, by: string) => Promise<void>
 *   },
 *   ds: {
 *     library?: () => Promise<{ id: string, name: string, ok: boolean }[]>,
 *     refero: () => Promise<{ id: string, uuid: string, name: string, ok: boolean }[]>,
 *     referoScreenshot?: (uuid: string) => Promise<string | null> | string | null,
 *     supportForNewSite?: (q: { platform: string, tag: string, version: string | null }) => any,
 *     quickstartContractOf?: (q: { platform: string, tag: string, version: string | null }) => any,
 *     quickstartTemplateOf?: (q: { platform: string, tag: string | null }) => string | null,
 *     templateKeyOf: (s: any) => string | null,
 *     contractFor: (key: string | null) => { contract: string } | { reason: string },
 *     rawTemplatesOf: (key: string | null) => string[],
 *     versionKeyOf: (s: any) => { key: string | null, version: string | null },
 *     minVersionOf: (key: string | null) => Record<string, string | null> | null,
 *     maxVersionOf?: (key: string | null) => Record<string, string | null> | null,
 *     emitFor: (q: any) => Promise<any>,
 *     fontFaces?: (href: string | null) => Promise<any[]>,
 *     modesOf?: (contract: string) => boolean
 *   },
 *   templateImage?: (site: any) => Promise<string | null>,
 *   seen?: (site: any, slotId: string) => Promise<boolean | null>,
 *   home?: (site: any) => Promise<string | null>,
 *   now?: () => number,
 *   seenWaitMs?: number,
 *   chatRoute?: () => Promise<boolean>,
 *   signedIn?: (c: any) => Promise<{ error?: Response, email?: string }>,
 *   releaseVersion?: (tag: string) => Promise<string | null>,
 *   preview?: { innerOf: (site: any) => URL, publicOf: (site: any) => string | null, fetchImpl: typeof fetch,
 *     waitMs?: number, origin?: string | null, secret?: string },
 *   previewRate?: (email: string) => Promise<{ over: boolean, retryAfterS: number }>,
 *   customerLock?: { blocked: (email: string | null | undefined, templateKey: string | null | undefined) => Promise<boolean> }
 * }} deps - `customerLock`: the templates customers may not put a NEW design system on
 *   (`lib/design-system-customer-lock.js`; staff pass); none: no template is locked (tests of the other rules). - `previewRate`: the per-account cap on the preview door (`previewRateLimiter`), the SAME
 *   instance the Add site preview door gets, so the two spend one budget; none: this mount's own
 *   in-memory count. - `preview`: where the preview door reads the site's home page (`innerOf`: its web
 *   container, `siteTarget`) and the address its links are made to point at (`publicOf`: the address
 *   the site is served at, `copyUrl`'s). None: the preview door answers `DS_PREVIEW_FAILED`.
 *   `ds.refero`: the library the doors offer (Refero). `ds.library`: OpenDesign, read only to
 *   name a system a site already wears (never offered). `signedIn`: any signed-in seat (the library and
 *   support doors), else the refusal; none: every such ask is 401 `NOT_SIGNED_IN` (fails closed).
 *   `releaseVersion`: the newest release of a quickstart tag (`quickstart_releases`), or null. - `home`: the HTML of the home page the site serves now, or null when it could not be
 *   read (none: the words door answers `{present: false}`). - `chatRoute`: whether the operator's switch `chat-design-system` is on (`uiSwitchOn`);
 *   it THROWS when the switch cannot be read. None: the chat route is off. `seenWaitMs`: tests only
 *   ({@link SEEN_WAIT_MS}). - `templateImage`: the thumbnail of the template the site was built from, the one /ops
 *   Templates Management draws (`lib/template-thumbnail.js`), or null; none, or one that throws: null. -
 *   `ds.modesOf`: whether a slot contract wears both sides of the template's light/dark switch (`lib/ds-slot.js`);
 *   none: false.
 */
export function mountDesignSystem(app, deps) {
  const {
    requireGrant,
    normalize = (k) => k,
    siteByKey,
    toolsetRefusal,
    runJob,
    lease,
    record,
    store,
    ds,
    home,
    now = Date.now,
    chatRoute = async () => false,
    // Fail closed: a caller that forgets the check gets every library and support ask refused,
    // never a door open to anyone (readiness review, 12/10/2026).
    signedIn = async (c) => ({ error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }),
    releaseVersion = async () => null,
    templateImage = async () => null
  } = deps
  /** The Template default card's picture: a read that fails says nothing rather than failing the door. */
  const templateImageOf = async (site) => {
    try {
      const url = await templateImage(site)
      return typeof url === 'string' && url !== '' ? url : null
    } catch {
      return null
    }
  }
  /**
   * Whether `email` may not put a new design system on `templateKey` (the customer lock, 15/10/2026). A site
   * that already wears one keeps it: only the doors that show or write a new look ask this.
   */
  const lockedFor = async (email, templateKey) =>
    deps.customerLock ? await deps.customerLock.blocked(email, templateKey) : false
  /** The systems the doors offer: Refero's (12/10/2026). Apply takes nothing else. */
  const offered = async () => await ds.refero()
  /**
   * Library id → name for every system a site may wear: the offered ones, plus the OpenDesign library
   * (no longer offered), so a site that still wears an OpenDesign system shows its name.
   */
  const namesOf = async () =>
    new Map([...(ds.library ? await ds.library() : []), ...(await offered())].map((s) => [s.id, s.name]))
  const json = (c, body, status = 200) => {
    c.header('Cache-Control', 'private, no-store')
    return c.json(body, status)
  }
  const PLATFORMS = new Set(['emdash', 'wordpress', 'joomla'])
  const fit = designSystemFit({ ds, runJob })
  const { versionPart, survey } = fit

  /**
   * The GET's answer: the library's refusals, this seat's right, and the site as a run in its
   * container last said it (`slot`, the template key and its fit).
   */
  async function viewOf({ site, siteKey, auth, lib, slot, templateKey, fit: judged }) {
    // A template the customer lock closes reads as not ready; what the site wears is still named.
    const locked = 'contract' in judged && (await lockedFor(auth?.email, templateKey))
    const fit = locked ? { reason: LOCKED_REASON } : judged
    const refusal = await toolsetRefusal(auth, siteKey)
    const names = await namesOf()
    return {
      platform: site.platform ?? null,
      // the site's public address: the panel's cards frame its home page wearing each system
      // (`?tracy_ds_preview=<id>`, answered by the site proxy — `bar/ds-preview.js`)
      address: typeof site.address === 'string' && site.address !== '' ? site.address : null,
      canApply: refusal === null,
      ...(refusal ? { cannotApply: { code: 'TOOLSET_NOT_GRANTED', ...refusal } } : {}),
      refused: lib.filter((s) => !s.ok).map((s) => s.id),
      worn: wornOf(slot ?? null, names),
      template: templateKey,
      // The Template default card's picture (`templateImage`), and whether the preview offers Light | Dark: the
      // contract wears both sides of the template's switch (`modes: true`).
      templateImage: await templateImageOf(site),
      modes: 'contract' in fit && ds.modesOf ? ds.modesOf(fit.contract) === true : false,
      supported: 'contract' in fit,
      ...('reason' in fit ? { reason: fit.reason } : {}),
      ...(locked ? { locked: true } : {}),
      ...versionPart(fit),
      last: lastOf(await store.latest(siteKey))
    }
  }

  /** The common front of every door: the site, the grant, and a platform with a slot. */
  async function front(c) {
    const siteKey = normalize(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    const site = await siteByKey(siteKey)
    if (!site) return { error: json(c, { code: 'SITE_UNKNOWN' }, 404) }
    return { siteKey, auth, site }
  }

  app.get('/api/sites/:key/design-system', async (c) => {
    const f = await front(c)
    if (f.error) return f.error
    const { siteKey, auth, site } = f
    const lib = await offered()
    // An imported site wears no new system (`lib/design-system-imported-site.js`): said without reading its container.
    if (isImportedSite(site)) {
      const refusal = await toolsetRefusal(auth, siteKey)
      return json(c, {
        platform: site.platform ?? null,
        canApply: refusal === null,
        ...(refusal ? { cannotApply: { code: 'TOOLSET_NOT_GRANTED', ...refusal } } : {}),
        refused: lib.filter((s) => !s.ok).map((s) => s.id),
        worn: null,
        template: null,
        templateImage: null,
        modes: false,
        supported: false,
        reason: IMPORTED_REASON,
        imported: true,
        locked: true,
        last: lastOf(await store.latest(siteKey))
      })
    }
    if (!PLATFORMS.has(String(site.platform))) {
      const refusal = await toolsetRefusal(auth, siteKey)
      return json(c, {
        platform: site.platform ?? null,
        canApply: refusal === null,
        ...(refusal ? { cannotApply: { code: 'TOOLSET_NOT_GRANTED', ...refusal } } : {}),
        refused: lib.filter((s) => !s.ok).map((s) => s.id),
        worn: null,
        template: null,
        templateImage: await templateImageOf(site),
        modes: false,
        supported: false,
        reason: 'PLATFORM_HAS_NO_SLOT',
        last: null
      })
    }
    const s = await survey(site)
    if (s.failed) return json(c, { code: 'DS_READ_FAILED', reason: s.failed }, 502)
    return json(
      c,
      await viewOf({ site, siteKey, auth, lib, slot: s.read.slot, templateKey: s.templateKey, fit: s.fit })
    )
  })

  mountDesignSystemLibrary(app, {
    ds,
    offered,
    signedIn,
    releaseVersion,
    json,
    platforms: PLATFORMS,
    lockedFor
  })
  const { forgetPreviews } = mountDesignSystemReads(app, {
    front,
    json,
    ds,
    store,
    offered,
    fit,
    platforms: PLATFORMS,
    home,
    now,
    preview: deps.preview,
    previewRate: deps.previewRate,
    lockedFor
  })
  if (deps.preview) mountSiteDesignSystemPreviewAssets(app, { front, json, preview: deps.preview, now })
  const { guarded, entryOf, applySystem, clearSystem, undoLatest } = designSystemWrites({
    ds,
    lease,
    record,
    store,
    fit,
    offered,
    namesOf,
    viewOf,
    forgetPreviews,
    platforms: PLATFORMS,
    seen: deps.seen,
    seenWaitMs: deps.seenWaitMs,
    glyphReader: deps.glyphReader,
    glyphsWaitMs: deps.glyphsWaitMs,
    lockedFor
  })

  /**
   * The chat route to a design system, closed by the operator (`chat-design-system`, off by default
   * since 11/10/2026): an apply the agent asks for is refused by name, with the sentence the
   * agent says instead; the Design system button's own press is never governed by it.
   *
   * WHICH CALL IS THE CHAT'S. The agent reaches this door through the lane (`tracy-site-tools`'
   * `tracy_design_system`), as the person who typed (an `actor` grant) or, on a lane with no gate in
   * front, with the viewer's cookie — and then always with the conversation's `x-tracy-session`. The
   * panel's press sends neither. A switch that cannot be read closes the route (503), like
   * `site-connect-domain`: an unread database must not open what the operator closed.
   * @returns {Promise<Response | null>} the refusal, or null when the call may go on
   */
  async function chatRouteClosed(c, auth) {
    if (!isChatCall(c, auth)) return null
    let on
    try {
      on = await chatRoute()
    } catch {
      return json(c, { code: 'UI_SETTING_UNREADABLE' }, 503)
    }
    if (on) return null
    return json(
      c,
      {
        code: 'CHAT_DESIGN_SYSTEM_OFF',
        message: CHAT_ROUTE_OFF_MESSAGE
      },
      403
    )
  }

  /** A door's write, as a seat: its toolset first, then the guard, then the answer sent. */
  async function writing(c, f, work) {
    const refusal = await toolsetRefusal(f.auth, f.siteKey)
    if (refusal) return json(c, { code: 'TOOLSET_NOT_GRANTED', ...refusal }, 403)
    const out = await guarded({ siteKey: f.siteKey, site: f.site, actor: f.auth.email }, work)
    return json(c, out.body, out.status)
  }

  app.post('/api/sites/:key/design-system', async (c) => {
    const f = await front(c)
    if (f.error) return f.error
    const closed = await chatRouteClosed(c, f.auth)
    if (closed) return closed
    const body = await c.req.json().catch(() => null)
    const hint = typeof body?.template === 'string' && body.template.length <= 200 ? body.template : null
    const channel = isChatCall(c, f.auth) ? 'chat' : 'button'
    // The Template default card: the worn system taken off, back to the template's own look (an apply of its own).
    if (body?.id === TEMPLATE_DEFAULT_ID)
      return writing(c, f, () =>
        clearSystem({ site: f.site, siteKey: f.siteKey, actor: f.auth.email, channel, auth: f.auth })
      )
    const named = await entryOf(body?.id)
    if (!named.ok) return json(c, { code: named.code }, 400)
    return writing(c, f, () =>
      applySystem({
        site: f.site,
        siteKey: f.siteKey,
        actor: f.auth.email,
        id: named.id,
        entry: named.entry,
        hint,
        channel,
        auth: f.auth
      })
    )
  })

  app.post('/api/sites/:key/design-system/undo', async (c) => {
    const f = await front(c)
    if (f.error) return f.error
    const body = await c.req.json().catch(() => null)
    const applyId = typeof body?.applyId === 'string' ? body.applyId : ''
    if (!APPLY_ID.test(applyId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const channel = isChatCall(c, f.auth) ? 'chat' : 'button'
    return writing(c, f, () =>
      undoLatest({ site: f.site, siteKey: f.siteKey, auth: f.auth, applyId, channel })
    )
  })

  return {
    /**
     * Put system `id` on site `siteKey` as `email`, the way the panel's press does, with no request: the end of a new
     * site's build (`design-system-at-create.js`), for the person who created it. The same write as the door (bytes,
     * rows, lease, undo); no toolset is asked, because the creator owns the site. Answers the door's shape.
     * @param {string} siteKey
     * @param {{ email: string, id: string, at?: string }} ask
     * @returns {Promise<{ status: number, body: any }>}
     */
    async applyAs(siteKey, { email, id, at = 'create' }) {
      const named = await entryOf(id)
      if (!named.ok) return answer({ code: named.code }, 400)
      const site = await siteByKey(siteKey)
      if (!site) return answer({ code: 'SITE_UNKNOWN' }, 404)
      return guarded({ siteKey, site, actor: email }, () =>
        applySystem({
          site,
          siteKey,
          actor: email,
          id: named.id,
          entry: named.entry,
          hint: null,
          channel: 'button',
          at
        })
      )
    },

    /**
     * Whether a create request may carry system `raw`: `{ ok, id, name }` for an offered system, else `DS_UNKNOWN`
     * (an OpenDesign, unknown, refused or malformed id: none of them is offered, so none may travel).
     * @param {unknown} raw
     */
    async checkSystem(raw) {
      const named = await entryOf(raw)
      return named.ok ? { ok: true, id: named.id, name: named.entry.name } : { ok: false, code: 'DS_UNKNOWN' }
    },

    /**
     * Whether a create request of `email` may carry a design system for a site built from quickstart `tag` on
     * `platform`: null when it may, else the refusal code (`DS_TEMPLATE_LOCKED`, the customer lock; a quickstart no
     * contract names is locked too). A request with no quickstart is left to the build's own apply, which judges the
     * template the site turns out to run.
     * @param {{ email: string, platform: string, tag: string | null }} q
     * @returns {Promise<string | null>}
     */
    async lockedAtCreate({ email, platform, tag }) {
      if (!deps.customerLock || !tag) return null
      const templateKey = ds.quickstartTemplateOf ? ds.quickstartTemplateOf({ platform, tag }) : null
      return (await lockedFor(email, templateKey)) ? DS_TEMPLATE_LOCKED : null
    }
  }
}
