/**
 * The Quickstarts screen's doors: the releases as this server last read them, one release in detail,
 * and the questions a customer of one release is asked (ADR 0017).
 *
 * WHY THE LIST IS NOT A PROXY TO GITHUB. Every door here reads the `quickstart_releases` table and
 * says when it was filled. A screen that called GitHub per request would show an empty shelf on a
 * bad minute — and an empty shelf is indistinguishable from "there are no quickstarts", which is
 * the one thing this screen must never say by accident. Refreshing is a press with a result.
 */
import { Hono } from 'hono'
import { bornSiteAddress } from '../lib/site-address.js'

import { contractStatus, contractWarnings } from '../lib/brief-support.js'
import { defaultContracts } from '../lib/contracts.js'
import { fitOfRelease } from '../lib/content-coverage/fit.js'
import { rolesOfRelease } from '../lib/content-coverage/roles.js'
import { checkAgain, kickReadiness, readinessForRoad, readinessRows } from '../lib/customize-readiness.js'
import {
  dsCheckAgain,
  dsReadinessOf,
  dsReadinessRows,
  kickDsReadiness
} from '../lib/design-system-readiness.js'
import { makeDemoFrameProbe } from '../lib/demo-frame.js'

import { brandUploadsAvailable } from '../lib/brand-uploads.js'
import { LOGO_LAYOUTS } from '../lib/questions-schema.mjs'
import { pagesOf } from '../lib/site-pages-schema.mjs'
import { templateProfileOf } from '../lib/template-profiles.js'
import { readUiHidden } from '../lib/ui-setting.js'
import { loadStandardQuestions, resolveQuestions } from '../lib/build-questions.js'
import { judgeCard } from '../lib/card-draft.js'
import { draftListingLayouts } from '../lib/listing-pages.js'
import { modelForDoor } from '../lib/llm-door.js'
import { failedDemosByTag, liveDemoOf, liveDemosByTag } from '../lib/demo-sites.js'
import {
  cardRefusal,
  composeCard,
  DESIGN_CATEGORIES,
  inspirationState,
  notShownWhy
} from '../lib/design-inspiration.js'
import { readDesignSystemsShown, saveDesignSystemsShown } from '../lib/design-systems-setting.js'
import { publishRefusalOf, roadOf } from '../lib/road-to-live.js'
import { designSystemIssues } from '../lib/template-design-system-readiness/readers/measurement.js'
import { referoNames, withSystemNames } from '../lib/ds-system-names.js'
import { shotThumb, thumbWidth } from '../lib/shot-thumb.js'
import {
  cardIdOf,
  cardOf,
  cardSources,
  DESIGN_INSPIRATION_FILE,
  DESIGN_INSPIRATION_HIDDEN_FILE,
  joomlaAddresses,
  platformOfTag,
  readReleases,
  refreshReleases,
  releasesToken,
  shownOnInspiration,
  templateCards
} from '../lib/quickstart-releases.js'
import { deleteReleaseAsset, uploadReleaseAsset } from '../lib/release-assets.js'
import {
  deleteShot,
  getShot,
  listShots,
  MAX_PICTURE_BYTES,
  putShot,
  releaseShotPart,
  shotFilesFor,
  shotName,
  ShotRejected,
  shotProblem,
  withPictureUrls,
  templateIdOf
} from '../lib/template-shots.js'
import { cardDemosOf, customerTemplateCards, publishedTemplates } from '../lib/customer-template-cards.js'
import { admit, denied } from './admit.js'

/** How a CMS is named in a sentence a person reads. */
const CMS_NAME = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/** The CMS a release belongs to for the purposes of THIS screen: the file, else the tag as a hint. */
const cmsOf = (row) => row.platform ?? platformOfTag(row.tag)

/**
 * Every release of one template, as the platforms its card folds together — by the card id
 * (`cardIdOf`), the one customers see, not each install file's own `template`.
 */
const sameTemplate = (releases, templateId) =>
  releases
    .filter((r) => r.choosable && cardIdOf(r) === templateId)
    .map((r) => ({ platform: r.platform, tag: r.tag, version: r.setting.version }))

/**
 * The demo's public hostname to photograph it by — or null, meaning "use the fallbacks".
 *
 * 🔒 A HOSTNAME IS ONLY AN ADDRESS WHEN THE SCHEME AND PORT COME WITH IT. `captureTarget` on the
 * far side turns whatever it is handed into `https://<host>/`, so sending a bare hostname asserts
 * that a browser reaches this demo on plain https at 443. On a server that is true. On a
 * developer's machine the public surface is `http://…:51710`, and the assertion produces a URL that
 * answers nothing at all: measured 17/09 on a local stand, `Generate card` hung until tracy-web's
 * own body timeout and the sheet said `the door answered 502`, while the demo was serving 200 the
 * whole time. Exactly the trap `readDemoTargets` in `config.js` already carries a comment about —
 * "A DEMO'S ADDRESS IS NOT ALWAYS `https://…/`" — which is why the shape is read from the target
 * this deployment states for itself rather than assumed here.
 *
 * Both callers' own comments say the public hostname exists to beat a Tracy-built Joomla demo's
 * `force_ssl = 2`, which 301s a loopback request to https on a port that speaks none. That reason
 * holds only where https IS the public shape; where it is not, the loopback port and the container
 * name are the addresses that work, and they are what the far side falls back to.
 *
 * @param {{demoTargets?: {kind: string, scheme?: string, port?: string}[], siteDomain: string}} config
 * @param {{label: string, publish?: string}} demo
 * @returns {string | null}
 */
export function demoPublicHost(config, demo) {
  if (demo.publish !== 'published') return null
  const target = (config.demoTargets ?? []).find((t) => t.kind === 'host')
  const scheme = target?.scheme ?? 'https'
  const port = target?.port ?? ''
  if (scheme !== 'https' || port !== '') return null
  return `${demo.label}.${config.siteDomain}`
}

/**
 * The names a built site answers to, for a host call that opens it in a browser (`/demo-qa`, the vision look's
 * `/capture`): its public hostname when published over https, else its label on this deployment's site domain, and
 * the origin it gives itself (WordPress writes every link and redirect with it). One shape, so the two never differ.
 * @param {{origin: string, siteDomain: string, demoTargets?: object[]}} config
 * @param {{label: string, publish?: string, address?: string | null}} site
 * @returns {{host: string, publicOrigin: string}}
 */
export function demoSelfNames(config, site) {
  return {
    host: demoPublicHost(config, site) ?? `${site.label}.${config.siteDomain}`,
    publicOrigin: new URL(site.address || bornSiteAddress(site.label, config)).origin
  }
}

/**
 * How long Generate card waits for the host to read the demo. tracy-host gives each page load 25 s
 * plus an 8 s idle grace, then loads the page twice more side by side for the dark test, so its own
 * worst case is about 67 s; this stays above it and, with the model's 15 s (`JUDGE_TIMEOUT_MS`),
 * under the proxy's 100 s, so the door always answers in words before the proxy gives up.
 */
const OUTLINE_TIMEOUT_MS = 75000

export function quickstartRoutes({
  pool,
  config,
  host = null,
  // The CMS standard files the customer door serves (`sites/route.js` loads the same ones).
  standard = loadStandardQuestions(),
  fetchImpl = fetch,
  demoFrame = makeDemoFrameProbe({ fetchImpl }),
  // The customer's preview asked of this server's own doors (`lib/preview-door-health.js`); null: not asked.
  doorHealth = null,
  // The slot roles group of Content coverage (ADR 0038). A test hands in its own answer: the released
  // contracts its fixtures borrow are never edited (ADR 0038 decision 6), so they cannot gain roles.
  rolesOf = rolesOfRelease,
  // The Slot fit group of Content coverage (ADR 0039), the same way: released contracts never gain Slot fit.
  fitOf = fitOfRelease
}) {
  const app = new Hono()

  /** Everyone who may see /ops may read; only owner/admin may change anything. */
  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /** One row as the list draws it — the three axes, and what this server does with it. */
  const rowOf = (r, inspiration, contracts, sourceTags = new Set(), road = null) => ({
    tag: r.tag,
    name: r.name,
    label: r.setting?.label ?? null,
    kind: r.kind,
    github: r.github,
    tracy: r.tracy,
    reason: r.reason,
    choosable: r.choosable,
    platform: cmsOf(r),
    platformFromTag: r.platformFromTag,
    version: r.setting?.version ?? null,
    cms: r.setting?.cms ?? null,
    template: templateIdOf(r.setting?.template),
    // The id this release's card and pictures live under (`cardIdOf`): the customer card's, which
    // may differ from the install file's `template` above (`tracy-base/wp7` says "tracy-base" and
    // is on the `tracy` card). Every picture address the screen builds uses this one.
    cardTemplate: cardIdOf(r),
    publishedAt: r.publishedAt,
    // Where this release stands on Design inspiration, decided HERE rather than in the browser: the
    // answer needs this server's live demos and its picture store, and a screen that asked per row
    // would make two queries per row of a list that is eighty-five rows long.
    inspiration,
    // 🔒 WHAT THE PUBLISH DOOR WOULD STILL REFUSE, so the Templates screen lists every refusal as an
    // issue instead of finding it out on the press. `contract` is the same `contractStatus` the door's
    // NO_CONTRACT reads (the door asks it of every choosable release of the template);
    // `notShowable` is the door's NOT_SHOWABLE sentence — why a saved card would stay off Design
    // inspiration even with its hidden mark removed — and null when it would show or has no card.
    contract: contractStatus({ platform: r.platform, tag: r.tag, version: r.setting?.version }, contracts),
    notShowable: cardOf(r) ? notShownWhy({ ...r, inspirationHidden: false }) : null,
    // 🔒 Whether THIS release's card is the one customers see for its template: one template is
    // one card, its content read off one release (`cardSources`, the rule `templateCards` itself
    // follows for `GET /api/templates`). False for every release of a template nobody is shown.
    cardSource: sourceTags.has(r.tag),
    // 🔒 THE ROAD TO LIVE (`lib/road-to-live.js`): the seven steps this release walks before
    // customers can pick it, built from the same functions as `inspiration`, `contract` and
    // `notShowable` above and read by the publish door for its refusal. Null for a design pack.
    road
  })

  app.get('/api/ops/quickstarts', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const releases = await readReleases(pool)

    const counts = { all: releases.length, joomla: 0, wordpress: 0, emdash: 0 }
    for (const r of releases) if (counts[cmsOf(r)] !== undefined) counts[cmsOf(r)] += 1

    // Two queries for the whole page, not two per row: the live demos this server has, and which
    // of every card's pictures it holds.
    const live = await liveDemosByTag(pool)
    const failed = await failedDemosByTag(pool)
    const held = await shotFilesFor(
      pool,
      releases.map((r) => cardIdOf(r)).filter((id) => id !== null)
    )
    const worldOf = (r) => ({
      demo: live.get(r.tag) ?? null,
      failed: failed.get(r.tag) ?? null,
      has: (file) => held.get(cardIdOf(r) ?? '')?.has(file) === true
    })
    const stateOf = (r) => inspirationState(r, worldOf(r))

    const contracts = defaultContracts()
    const sourceTags = new Set(cardSources(releases).values())
    // One query for every stored Customize your site check (`lib/customize-readiness.js`), one for
    // every stored Design system check (`lib/design-system-readiness.js`).
    const checks = await readinessRows(pool)
    const dsChecks = await dsReadinessRows(pool)
    // the preview doors asked again in the background for every line with a live demo; this read shows
    // the answers kept from the last run (at most ten minutes old once it has run)
    if (doorHealth) void doorHealth.refresh(releases.filter((r) => live.has(r.tag)).map((r) => r.tag))
    // a Refero system reads by its name, not its id, in the rules and in the prompt (15/10/2026)
    const systemNames = await referoNames()
    const roadOfRow = (r) => {
      const id = cardIdOf(r)
      const road = roadOf(r, {
        ...worldOf(r),
        doorHealth: doorHealth?.of(r.tag) ?? null,
        contracts,
        roles: rolesOf(r, contracts),
        fit: fitOf(r, contracts),
        siblings: id ? sameTemplate(releases, id) : [],
        readiness: readinessForRoad(checks, r),
        dsReadiness: dsReadinessOf(dsChecks, r)
      })
      return withSystemNames(road, systemNames)
    }

    const { reason } = await releasesToken(config, fetchImpl)
    return c.json({
      readAt: releases[0]?.fetchedAt ?? null,
      // Whether this deployment can read GitHub at all. The screen offers Refresh only when it can,
      // and says why when it cannot — rather than a button that answers 503.
      canRefresh: reason === null,
      cannotRefreshReason: reason,
      writable: ['owner', 'admin'].includes(g.who.role),
      counts,
      // the design system issues of the preview, each once: a kind a system causes on most templates
      designSystemIssues: withSystemNames(await designSystemIssues(), systemNames),
      releases: releases.map((r) => rowOf(r, stateOf(r), contracts, sourceTags, roadOfRow(r)))
    })
  })

  /**
   * ── GET /api/templates — the finished sites, for Design inspiration ─────────────────────────
   *
   * 🔒 NOT UNDER `/api/ops`, AND NOT ADMITTED. The reader is the design-inspiration plugin drawing
   * cards on a lane, not a person on the operations page: gating it on a Tracy seat would empty
   * Design inspiration for every customer. It answers only what is already public on a card — the
   * picture, the blurb, the demo address — and nothing about install files or checksums.
   *
   * 🔒 A PICTURE THIS SERVER HOLDS IS NAMED BY ADDRESS; one it does not hold is null, never a bare
   * name (#523: no lane can serve a bare name, so it drew a broken image). The address is built
   * from `config.origin`, so a card read off dev points at dev and a card read off production
   * points at production. One query says which is which for the whole page — a query per card
   * would run on a door every lane calls when its tab opens.
   * The card itself is `tracy_design_inspiration.json` on the release since 16/09; `templateCards`
   * still reads the `card` block of a release cut before that, so the shape answered here did not
   * change and nothing on a lane has to be rebuilt.   */
  app.get('/api/templates', async (c) => {
    c.header('cache-control', 'no-store')
    return c.json(await publishedTemplates(pool, config))
  })

  /** The cards a customer on this server is offered, exactly as `GET /api/templates` answers them (`lib/customer-template-cards.js`). */
  const customerCards = (releases) => customerTemplateCards(pool, config, releases)

  /**
   * ── GET /api/ops/inspiration — what Design inspiration offers on THIS server, and what it holds back
   *
   * The `/ops/cms/inspiration` screen. Three lists, in the order a person asks them: the cards
   * customers see (`shown`, one per TEMPLATE, built by `customerCards` like the public door), the
   * releases that carry a card customers do not get (`notShown`, each with `why`), and the
   * releases a site can be started from that carry no card (`noCard`). A design pack or a draft with
   * no card is in none of them: it was never a candidate.
   *
   * Live state of this server's database, not a git ref — the screen carries no environment picker.
   */
  app.get('/api/ops/inspiration', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const releases = await readReleases(pool)
    const shownCards = await customerCards(releases)

    // The same verdict, with the same world, the Quickstarts column draws.
    const live = await liveDemosByTag(pool)
    const failed = await failedDemosByTag(pool)
    const held = await shotFilesFor(
      pool,
      releases.map((r) => cardIdOf(r)).filter((id) => id !== null)
    )
    const stateOf = (r) =>
      inspirationState(r, {
        demo: live.get(r.tag) ?? null,
        failed: failed.get(r.tag) ?? null,
        has: (file) => held.get(cardIdOf(r) ?? '')?.has(file) === true
      })
    const byTag = new Map(releases.map((r) => [r.tag, r]))
    const label = (r) => r.setting?.label ?? r.name ?? r.tag
    const templateOf = (r) => cardIdOf(r)
    const cardImageOf = (r) => {
      const id = cardIdOf(r)
      const image = cardOf(r)?.image
      if (!id || typeof image !== 'string') return null
      return withPictureUrls(
        { id, card: { image } },
        {
          origin: config.origin,
          has: (tid, file) => held.get(tid)?.has(file) === true,
          version: (tid, file) => held.get(tid)?.get(file)
        }
      ).card.image
    }

    const shown = shownCards.map((t) => {
      const many = t.platforms.length > 1
      const warnings = t.platforms.flatMap((p) => {
        const release = byTag.get(p.tag)
        const own = release ? stateOf(release).warnings : []
        const cms = CMS_NAME[p.platform] ?? p.platform
        return many ? own.map((w) => `${cms}: ${w}`) : own
      })
      return {
        id: t.id,
        label: t.label,
        card: {
          provider: t.card?.provider ?? null,
          category: t.card?.category ?? null,
          blurb: t.card?.blurb ?? null,
          image: typeof t.card?.image === 'string' ? t.card.image : null,
          layouts: Array.isArray(t.card?.layouts) ? t.card.layouts.length : 0
        },
        design: t.design,
        platforms: t.platforms.map((p) => ({
          platform: p.platform,
          tag: p.tag,
          version: p.version,
          demo: p.demo ? { url: p.demo.url, version: p.demo.version ?? null } : null
        })),
        warnings,
        ...(t.local ? { local: true } : {})
      }
    })
    const onShelf = new Set(shown.flatMap((t) => t.platforms.map((p) => p.tag)))
    const notShown = releases
      .filter((r) => cardOf(r) !== null && !onShelf.has(r.tag))
      .map((r) => ({
        tag: r.tag,
        platform: cmsOf(r),
        version: r.setting?.version ?? null,
        label: label(r),
        template: templateOf(r),
        // The card's own thumbnail and category, so the Templates list can draw a held-back card the
        // way it draws a shown one. The address rule is the public door's (`withPictureUrls`): a
        // picture this server does not hold is null, never a bare name.
        image: cardImageOf(r),
        category: typeof cardOf(r)?.category === 'string' ? cardOf(r).category : null,
        // `notShownWhy` is null only for a release the predicate admits; such a release missing from
        // `shown` would be the two doors disagreeing, and it says so rather than going quiet.
        why: notShownWhy(r) ?? 'Customers are not offered this card, and Tracy cannot say why.'
      }))
    const noCard = releases
      .filter((r) => stateOf(r).state === 'none')
      .map((r) => ({
        tag: r.tag,
        platform: cmsOf(r),
        version: r.setting?.version ?? null,
        label: label(r),
        template: templateOf(r)
      }))
    const withCms = (cms) => shown.filter((t) => t.platforms.some((p) => p.platform === cms)).length

    const { reason } = await releasesToken(config, fetchImpl)
    return c.json({
      readAt: releases[0]?.fetchedAt ?? null,
      origin: config.origin,
      writable: ['owner', 'admin'].includes(g.who.role),
      canRefresh: reason === null,
      cannotRefreshReason: reason,
      designSystemsShown: await readDesignSystemsShown(pool),
      shown,
      notShown,
      noCard,
      counts: {
        shown: shown.length,
        joomla: withCms('joomla'),
        wordpress: withCms('wordpress'),
        emdash: withCms('emdash'),
        notShown: notShown.length,
        noCard: noCard.length
      }
    })
  })

  /**
   * ── GET /api/design-systems — does Design inspiration offer the design-system library? ───────
   *
   * Public and not admitted, for the same reason as `/api/templates`: the readers are the public
   * page and a lane's design-inspiration plugin, neither holding a seat. Read per request with
   * `no-store`, so an operator's press reaches them with no release and no rebuild.
   */
  app.get('/api/design-systems', async (c) => {
    c.header('cache-control', 'no-store')
    return c.json({ shown: await readDesignSystemsShown(pool) })
  })

  app.put('/api/ops/design-systems', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    if (typeof body?.shown !== 'boolean') return c.json({ error: 'SHOWN_NOT_BOOLEAN' }, 400)
    await saveDesignSystemsShown(pool, body.shown, g.who.email)
    return c.json({ shown: body.shown })
  })

  /**
   * ── GET /api/templates/:templateId/demo-frame?origin= — may that page frame this demo? ───────
   *
   * A template card shows its demo LIVE in a scaled iframe, and a cross-origin frame the demo
   * refuses looks, from the page, exactly like one it accepted (`lib/frame-allowed.js`). So the
   * card asks here first, naming its own origin — the dsh page at `cowork.…`, the public page, a
   * `localhost` dev — and mounts the frame only on `framable: true`. Public and cross-origin for the
   * same reason the list is: the asker holds no seat. `no-store`: the probe caches on its own terms.
   */
  app.get('/api/templates/:templateId/demo-frame', async (c) => {
    const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
    const origin = c.req.query('origin') ?? ''
    let asker
    try {
      asker = new URL(origin).origin
    } catch {
      asker = null
    }
    if (asker === null || asker !== origin) return c.json({ error: 'INVALID_ORIGIN' }, 400, headers)
    const id = c.req.param('templateId')
    const card = templateCards(await readReleases(pool), cardDemosOf(await liveDemosByTag(pool))).find(
      (t) => t.id === id
    )
    if (!card) return c.json({ error: 'UNKNOWN_TEMPLATE' }, 404, headers)
    const url = card.card?.demo?.url
    if (typeof url !== 'string' || url === '')
      return c.json({ framable: false, reason: 'no-demo' }, 200, headers)
    return c.json(await demoFrame(url, asker), 200, headers)
  })

  /**
   * ── GET /api/templates/:templateId/shots/:file — one picture off a card ─────────────────────
   *
   * Public, for the same reason the list above is: it is drawn beside the card, by a browser with
   * no Tracy seat. An hour of cache plus the stored sha256 as the ETag is what keeps a lane from
   * fetching the same screenshot on every open of the tab.
   *
   * A name outside the shape and a name with no row answer the SAME `NO_PICTURE`: which names are
   * impossible is not a question this door owes a stranger an answer to.
   */
  app.get('/api/templates/:templateId/shots/:file', async (c) => {
    const shot = await getShot(pool, c.req.param('templateId'), c.req.param('file'))
    // 🔒 A MISS SAYS `no-store`, and it has to say it out loud: with no cache-control at all the
    // edge falls back to the zone default — four hours on `tracy.site` — so a picture uploaded one
    // minute after somebody opened the card keeps answering 404 for the rest of the afternoon, and
    // the thumbnail stays an empty rectangle with nothing anywhere saying why (measured on dev,
    // 16/09). Publishing a card and uploading its pictures are two presses; the second must not be
    // undone by the first.
    if (!shot) return c.json({ code: 'NO_PICTURE' }, 404, { 'cache-control': 'no-store' })
    // `?w=` is the grid card asking for its first screen, small (`lib/shot-thumb.js` says why). A
    // width this door does not serve, or a picture it cannot read, falls through to the original.
    const width = thumbWidth(c.req.query('w'))
    const thumb = width === null ? null : await shotThumb(shot, width)
    if (thumb) {
      return c.body(thumb, 200, {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=3600',
        etag: `"${shot.sha256}-w${width}"`
      })
    }
    return c.body(shot.bytes, 200, {
      'content-type': shot.contentType,
      'cache-control': 'public, max-age=3600',
      etag: `"${shot.sha256}"`
    })
  })

  app.post('/api/ops/quickstarts/refresh', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const result = await refreshReleases(pool, config, { fetchImpl })
    // Every version not checked yet for Customize your site and Design system is checked in the background.
    if (result.ok) {
      kickReadiness(pool, config, { fetchImpl })
      kickDsReadiness(pool, config, { fetchImpl })
    }
    return c.json(result, result.ok ? 200 : 503)
  })

  /**
   * Check again: run the Customize your site check of one release now (`lib/customize-readiness.js`),
   * for the version Claude Code just released. Owners and admins only. Answers 202 at once with the
   * step's new state; the check runs in the background and the page reads the result off the road.
   */
  app.post('/api/ops/quickstart/customize/check', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const tag = c.req.query('tag') ?? ''
    const [release] = (await readReleases(pool)).filter((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const started = await checkAgain(pool, config, release, { fetchImpl })
    if (!started.ok) return c.json({ error: started.error, reason: started.reason }, 400)
    return c.json({ ok: true, state: 'checking' }, 202)
  })

  /**
   * Check again: run the Design system check of one release now (`lib/design-system-readiness.js`,
   * ADR 0031), for the version Claude Code just released or the contract a deploy just changed.
   * Owners and admins only; 202 at once, the result read off the road.
   */
  app.post('/api/ops/quickstart/design-system/check', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const tag = c.req.query('tag') ?? ''
    const [release] = (await readReleases(pool)).filter((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const started = await dsCheckAgain(pool, config, release, { fetchImpl })
    if (!started.ok) return c.json({ error: started.error, reason: started.reason }, 400)
    return c.json({ ok: true, state: 'checking' }, 202)
  })

  /**
   * One release: what it declares, how Design inspiration holds it, and the sites built from it.
   *
   * The tag carries a slash, so it rides on the query rather than the path.
   */
  app.get('/api/ops/quickstart', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const tag = c.req.query('tag') ?? ''
    const [release] = (await readReleases(pool)).filter((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)

    const platform = cmsOf(release)
    // The Design inspiration tab draws the same badge the list column does, so the same verdict is
    // composed here rather than guessed from the card by a second rule in the browser.
    const templateId = cardIdOf(release)
    const held = templateId ? await shotFilesFor(pool, [templateId]) : new Map()
    const inspirationCell = inspirationState(release, {
      demo: (await liveDemosByTag(pool)).get(tag) ?? null,
      failed: (await failedDemosByTag(pool)).get(tag) ?? null,
      has: (file) => held.get(templateId)?.has(file) === true
    })
    const sites = (
      await pool.query(
        `select label, host, quickstart_version, created_at, demo, publish from site
           where quickstart_tag = $1 order by created_at desc limit 20`,
        [tag]
      )
    ).rows

    return c.json({
      ...release,
      platform,
      inspirationState: inspirationCell,
      writable: ['owner', 'admin'].includes(g.who.role),
      sites: sites.map((s) => ({
        label: s.label,
        host: s.host,
        version: s.quickstart_version,
        createdAt: s.created_at,
        // The release's own demo is a site row too: the sheet marks it, and says when it is not
        // live (a failed install), so it never reads as a site that was built.
        demo: s.demo === true,
        live: s.publish === 'published'
      }))
    })
  })

  /**
   * ── GET /api/ops/quickstart/customer-questions?tag= — what a customer of this release is asked ──
   *
   * 🔒 THE CUSTOMER DOOR'S OWN ANSWER, NOT A COPY. `GET /api/sites/questions` serves
   * `resolveQuestions` over the CMS standard file, fitted to the release a site starts from
   * (`lib/fit-questions.js`); this door calls the same function with the same standard files and
   * the same brand-uploads test, for the release named, so the /ops preview cannot drift from the
   * Customize your site sheet. Read-only: unlike the customer door it keeps no `question_snapshot`.
   *
   * `fitted` says which parts the release decided, from the same inputs `fitQuestions` reads: the
   * logo tiles of the template profile (`template-profiles.json`, null when the release has no row
   * and one logo is asked) and the release's own page list (`tracy_site_pages.json`, null when it
   * ships none and the build keeps every page). With brand uploads off the logo and favicon
   * questions are not served; `brandQuestions` holds them as they would be asked (each with `after`,
   * the id of the question it follows), so the preview can still show the template's logo layout,
   * marked as not asked on this server.
   */
  app.get('/api/ops/quickstart/customer-questions', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const tag = c.req.query('tag') ?? ''
    const [release] = (await readReleases(pool)).filter((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const platform = cmsOf(release)
    if (!platform || !standard[platform]) return c.json({ error: 'UNSUPPORTED_PLATFORM' }, 400)
    const lang = (c.req.query('lang') ?? 'en').slice(0, 10)
    const brandUploads = brandUploadsAvailable(config, await readUiHidden(pool))
    const ask = (withBrand) =>
      resolveQuestions({
        platform,
        quickstart: tag,
        lang,
        pool,
        standard,
        release,
        brandUploads: withBrand,
        warn: () => {}
      })
    const served = await ask(brandUploads)
    // Each left-out brand question names the question it follows, so the preview keeps the order.
    const full = brandUploads ? null : (await ask(true)).questions
    const brandQuestions = full
      ? full
          .map((q, i) => ({ ...q, after: i > 0 ? full[i - 1].id : null }))
          .filter((q) => q.kind === 'logo' || q.kind === 'favicon')
      : null
    const profile = templateProfileOf(release.tag, release.setting?.version)
    const pages = pagesOf(release)
    return c.json({
      tag,
      platform,
      languages: served.languages,
      set: served.set,
      questions: served.questions,
      brandUploads,
      brandQuestions,
      fitted: {
        logo: {
          layout: profile?.logos ?? null,
          variants: [...(LOGO_LAYOUTS[profile?.logos] ?? LOGO_LAYOUTS.single)],
          profile: profile
            ? {
                release: profile.release,
                version: profile.version,
                fallbackFrom: profile.fallbackFrom ?? null
              }
            : null
        },
        pages: pages ? pages.map((p) => ({ id: p.id, label: p.label, home: p.home === true })) : null
      }
    })
  })

  /**
   * ── The Design inspiration card of one release ─────────────────────────────────────────────
   *
   * WHY THE TAG RIDES ON THE QUERY AND THE TEMPLATE ID ON THE PATH. A release tag carries a slash
   * (`tracy-business/emdash-0.x`), so it cannot be a path segment — the same reason
   * `/api/ops/quickstart` takes `?tag=`. A template id is one lower-case segment by rule
   * (`template-shots.js`), so the picture doors below name BOTH halves in the path, exactly as the
   * public door that serves them does. The pictures are keyed by TEMPLATE, not by release: two
   * releases of one template (Joomla and EmDash) draw one card, so they share one set of pictures.
   */

  /** One release, for the Design inspiration sheet: what is read, what is stored, what is held. */
  app.get('/api/ops/quickstart/inspiration', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const tag = c.req.query('tag') ?? ''
    const releases = await readReleases(pool)
    const release = releases.find((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)

    const templateId = cardIdOf(release)
    const contracts = defaultContracts()
    const demo = (await liveDemosByTag(pool)).get(tag) ?? null
    const shots = templateId ? await listShots(pool, templateId) : []
    const card = release.inspiration ?? release.setting?.card ?? null
    return c.json({
      tag,
      writable: ['owner', 'admin'].includes(g.who.role),
      refusal: cardRefusal(release),
      // Read, never typed: the release says these, and the sheet shows them so an administrator
      // can see what the card will carry without being able to disagree with the release.
      label: release.setting?.label ?? release.name,
      version: release.setting?.version ?? null,
      languages: release.setting?.languages ?? [],
      platform: release.platform,
      template: templateId,
      demo,
      // Every release of the SAME template — the card Design inspiration draws is one per template,
      // however many CMSes build it, and the sheet says which ones are folded into this one.
      platforms: sameTemplate(releases, templateId).map((b) => ({
        ...b,
        // Whether a site built from this release is bound to a content contract (`lib/brief-support.js`).
        contract: contractStatus(b, contracts)
      })),
      card,
      // A `card` block inside `tracy_setting.json` is on Design inspiration too, until Unpublish
      // leaves the hidden mark — so the sheet offers Unpublish for it like for the file.
      published: card !== null && !release.inspirationHidden,
      shots,
      categories: DESIGN_CATEGORIES,
      reason: release.reason
    })
  })

  /**
   * ── Save, Publish, Unpublish: making a card and putting it on the shelf are two presses ──────
   *
   * 🔒 A SAVED CARD IS HIDDEN UNTIL PUBLISH SHOWS IT (10/10/2026). Before, the press that
   * wrote a card was also the press that put it in front of customers, so a card could only be
   * stored by publishing it, and "No card" could only be cleared by the press that issue blocks.
   * The two states use the stores that already existed — no new column, no new file:
   *   - the card is `tracy_design_inspiration.json` on the release (and the `inspiration` column);
   *   - "hidden" is `tracy_design_inspiration_hidden.json` on the release (and `inspiration_hidden`),
   *     which `shownCardOf` already reads for a card of either shape.
   * Saved but never published = the card file AND the hidden mark. Published = the card, no mark.
   * Unpublished = the mark is back, the card is kept.
   *
   * 🔒 THE RELEASE FIRST, THE COLUMN SECOND, AND THE COLUMN ONLY IF THE RELEASE TOOK IT. The files
   * on GitHub are what every OTHER deployment reads at its next refresh; the columns are this one's
   * shortcut so the screen is right before that refresh rather than after it.
   */

  /** The release a card door names, read fresh: another server may have changed it since. */
  const releaseOf = async (c) => {
    const tag = c.req.query('tag') ?? ''
    const releases = await readReleases(pool)
    return { tag, releases, release: releases.find((r) => r.tag === tag) ?? null }
  }

  /** Leave the hidden mark on the release, then on this server's row. Null when it landed. */
  const markHidden = async (c, tag) => {
    const marked = await uploadReleaseAsset(
      config,
      { tag, name: DESIGN_INSPIRATION_HIDDEN_FILE, body: `${JSON.stringify({ hidden: true })}\n` },
      { fetchImpl }
    )
    if (!marked.ok) return c.json({ error: 'GITHUB_REFUSED', reason: marked.reason }, 502)
    await pool.query('update quickstart_releases set inspiration_hidden = true where tag = $1', [tag])
    return null
  }

  /**
   * Save card: write the card onto the release and keep it off Design inspiration.
   *
   * A card customers already see stays shown — its edits are live at once, the way "Publish
   * changes" was before; there is no reason to take a live card off the shelf to fix a typo. A
   * card that is NOT shown (none yet, unpublished, or held back) is hidden by the mark, and the
   * mark is written BEFORE the card: a mark on a release with no card hides nothing, but a card
   * written while the mark failed would reach every other server's customers at their next read.
   *
   * No content-contract check here: that rule is about what Tracy offers customers (ADR 0022,
   * addendum 04/10/2026), and a saved card is not offered. Publish asks it.
   */
  app.put('/api/ops/quickstart/inspiration', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const { tag, release } = await releaseOf(c)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const refusal = cardRefusal(release)
    if (refusal) return c.json({ error: 'NOT_A_CARD', reason: refusal }, 400)

    const { card, problems } = composeCard(release, await c.req.json().catch(() => null))
    if (problems.length > 0) return c.json({ error: 'INVALID_CARD', problems }, 400)

    const shown = shownOnInspiration(release)
    if (!shown) {
      const failed = await markHidden(c, tag)
      if (failed) return failed
    }
    const written = await uploadReleaseAsset(
      config,
      { tag, name: DESIGN_INSPIRATION_FILE, body: `${JSON.stringify(card, null, 2)}\n` },
      { fetchImpl }
    )
    if (!written.ok) return c.json({ error: 'GITHUB_REFUSED', reason: written.reason }, 502)

    // `reason` on a Ready release carries the CARD's refusal and nothing else (`readingOf`), so a
    // card that now validates clears it — otherwise the screen keeps showing last week's complaint.
    await pool.query('update quickstart_releases set inspiration = $2::jsonb, reason = null where tag = $1', [
      tag,
      JSON.stringify(card)
    ])
    return c.json({ ok: true, replaced: written.replaced, inspiration: card, hidden: !shown })
  })

  /**
   * Publish: show the card already saved on the release. It writes no card.
   *
   * Refused, before anything is written, when there is no saved card (`NO_CARD`), when a Joomla or
   * WordPress release of the template has no content contract (`NO_CONTRACT`), and when the card
   * still would not reach customers once the mark is gone (`NOT_SHOWABLE`, with the same sentence
   * the Not shown list prints).
   */
  app.post('/api/ops/quickstart/inspiration/publish', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const { tag, releases, release } = await releaseOf(c)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    // 🔒 THE REFUSAL IS THE ROAD'S (`lib/road-to-live.js`): the first step Publish needs that is not
    // done, so the Templates page and this door cannot disagree. In the door's error codes:
    // NOT_A_CARD (the release or its install file), NO_CARD (no listing saved), LISTING_INCOMPLETE
    // (the listing misses pages of the release, shows a system page, or lacks a desktop picture;
    // never for a listing already published), NO_CONTRACT (a Joomla
    // or WordPress release of the template has no content contract, ADR 0022 addendum 04/10/2026),
    // CONTENT_COVERAGE_NOT_READY (the contract leaves demo content a visitor sees undeclared, or its
    // content-coverage.json is missing or stale, `lib/content-coverage/`), CUSTOMIZE_NOT_READY (must-fix rules of the Customize your site check remain, or this version is
    // not checked yet, ADR 0029 §4), DESIGN_SYSTEM_NOT_READY (the same for the Design system check,
    // ADR 0031) and NOT_SHOWABLE (the card would stay off once the mark is gone).
    const templateId = cardIdOf(release)
    const builds = templateId
      ? sameTemplate(releases, templateId)
      : [{ platform: release.platform, tag, version: release.setting?.version }]
    const contracts = defaultContracts()
    const road = roadOf(release, {
      demo: (await liveDemosByTag(pool)).get(tag) ?? null,
      failed: (await failedDemosByTag(pool)).get(tag) ?? null,
      contracts,
      roles: rolesOf(release, contracts),
      fit: fitOf(release, contracts),
      siblings: builds,
      readiness: readinessForRoad(await readinessRows(pool), release),
      dsReadiness: dsReadinessOf(await dsReadinessRows(pool), release),
      doorHealth: doorHealth?.of(tag) ?? null
    })
    const refused = publishRefusalOf(road, release)
    if (refused) return c.json(refused, 400)

    // Asked of GitHub every time rather than of the column: another server may have left the mark
    // since our last read.
    const unmarked = await deleteReleaseAsset(
      config,
      { tag, name: DESIGN_INSPIRATION_HIDDEN_FILE },
      { fetchImpl }
    )
    if (!unmarked.ok) return c.json({ error: 'GITHUB_REFUSED', reason: unmarked.reason }, 502)
    await pool.query('update quickstart_releases set inspiration_hidden = false where tag = $1', [tag])
    // A lower profile does not refuse: the card is published and the sheet says what is not proven.
    return c.json({ ok: true, warnings: contractWarnings(builds, contracts) })
  })

  /**
   * Unpublish: take the card off Design inspiration and keep it.
   *
   * Since Save card (10/10/2026) this leaves the hidden mark for a card of either shape and deletes
   * nothing: before, it deleted the card file, which would put "No card" back on a template whose
   * card somebody had only meant to take off the shelf for a while.
   */
  app.delete('/api/ops/quickstart/inspiration', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const { tag, release } = await releaseOf(c)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const failed = await markHidden(c, tag)
    if (failed) return failed
    // The pictures stay. An Unpublish is a card coming off the shelf, not a decision to throw away
    // the screenshots somebody took — and a re-publish an hour later would otherwise re-shoot them.
    return c.json({ ok: true, hidden: true })
  })

  /**
   * ── The pictures of one template ───────────────────────────────────────────────────────────
   *
   * Raw bytes, not multipart: the browser sends the `File` from a file input as the body, and both
   * halves of the name are already in the path. A multipart envelope would add a parser, a second
   * place a file name comes from, and a way for the two to disagree.
   */
  app.get('/api/ops/templates/:templateId/shots', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    return c.json({ shots: await listShots(pool, c.req.param('templateId')) })
  })

  app.put('/api/ops/templates/:templateId/shots/:file', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const templateId = c.req.param('templateId')
    const file = c.req.param('file')
    const named = shotProblem({ templateId, file })
    if (named) return c.json({ error: 'PICTURE_REFUSED', reason: named }, 400)
    // The length header is refused BEFORE the body is read: a caller announcing 40 MB should not
    // get to move 40 MB through this process first and be told no afterwards.
    const announced = Number(c.req.header('content-length') ?? '0')
    if (announced > MAX_PICTURE_BYTES)
      return c.json(
        {
          error: 'PICTURE_REFUSED',
          reason: `A picture may be at most ${MAX_PICTURE_BYTES} bytes; this one is ${announced}.`
        },
        413
      )
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    try {
      const stored = await putShot(pool, { templateId, file, bytes })
      return c.json({ ok: true, file, ...stored })
    } catch (e) {
      if (e instanceof ShotRejected)
        return c.json(
          { error: 'PICTURE_REFUSED', reason: e.reason },
          bytes.length > MAX_PICTURE_BYTES ? 413 : 400
        )
      throw e
    }
  })

  app.delete('/api/ops/templates/:templateId/shots/:file', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const deleted = await deleteShot(pool, c.req.param('templateId'), c.req.param('file'))
    return c.json({ ok: true, deleted })
  })

  /**
   * ── POST /api/ops/templates/:templateId/capture?tag= — take the card's pictures off the demo ──
   *
   * The button the sheet used to disable. Only tracy-host has a browser and only it can reach the
   * demo over the host's own docker network, so this door does none of the shooting: it finds the
   * live demo of the tag on THIS server, asks that host's tracy-host for every layout at both
   * viewports, and stores what comes back through the same `putShot` the file input uses. The
   * pictures are keyed by TEMPLATE (the path), the demo by TAG (the query) — a template's two
   * releases (Joomla and EmDash) share one card, and the tag says which demo frames it.
   *
   * 🔒 tracy-host NAMES NOTHING. It returns each shot keyed by the layout key and the width; the
   * name is composed HERE with the shared `shotName`, so a picture reaches the store under the
   * exact name the card and every other door already expect. Refusals are in words, not just a
   * code: there is nothing to shoot without a demo, and no way to shoot from a host this server
   * cannot sign for.
   */
  /**
   * ── POST /api/ops/templates/:templateId/generate?tag= — draft the card off the demo ──────────
   *
   * Reads the demo and fills what can be read: the layouts from its own top-level menu, whether it
   * has a dark mode, the provider. Then, only if this deployment has a model, the two fields
   * nothing can measure — which category it belongs in, and one sentence about it.
   *
   * 🔒 IT ANSWERS A DRAFT; IT WRITES NOTHING. The sheet fills its form with this and a person
   * presses Publish. A generated field that went straight onto a release would be Tracy asserting
   * something nobody read — `CLAUDE.md` §0 rule 3 in the one place it matters most, since the card
   * is what a customer chooses a site from.
   *
   * A deployment with no model still gets layouts, dark and provider, and says why the other two
   * are blank rather than leaving a reader to guess.
   */
  app.post('/api/ops/templates/:templateId/generate', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const templateId = c.req.param('templateId')
    const tag = c.req.query('tag') ?? ''
    const release = (await readReleases(pool)).find((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    if (cardIdOf(release) !== templateIdOf(templateId))
      return c.json({ error: 'TEMPLATE_MISMATCH', reason: 'That template is not this release’s.' }, 400)

    const demo = await liveDemoOf(pool, tag)
    if (!demo)
      return c.json(
        {
          error: 'NO_DEMO',
          reason:
            'No live demo of this release on this server. Install it under Design Templates, Demo Site, first.'
        },
        409
      )
    if (!host || !config.hosts.has(demo.host))
      return c.json(
        { error: 'NO_DEMO_HOST', reason: 'The demo’s host is not one this server can reach.' },
        503
      )

    const answer = await host.hostCall(
      config,
      demo.host,
      '/outline',
      {
        label: demo.label,
        platform: release.platform,
        port: demo.port ?? null,
        host: demoPublicHost(config, demo)
      },
      { fetchImpl, timeoutMs: OUTLINE_TIMEOUT_MS }
    )
    // 🔒 NEVER THE HOST'S STATUS AS OUR OWN (11/10/2026). tracy-host answers `502 OUTLINE_FAILED`
    // with `{code, why}` when the demo page does not load inside its 25 s; this door passed that
    // 502 and body straight on, so the screen read neither `reason` nor `error` and printed "the
    // door answered 502", and a 502 from this origin reads to the proxy and to a person as the
    // proxy failing. It answers 424 (the demo it depends on could not be read) with words.
    if (!answer.ok) {
      const why = answer.body?.why ?? answer.body?.reason ?? answer.body?.code ?? answer.body?.error
      return c.json(
        {
          error: 'OUTLINE_FAILED',
          reason:
            answer.status === 0
              ? `Couldn’t read the demo: its server did not answer${answer.timedOut ? ' in time' : ''}.`
              : `Couldn’t read the demo (its server answered ${String(answer.status)}${typeof why === 'string' && why ? `: ${why.slice(0, 300)}` : ''}).`,
          hostStatus: answer.status
        },
        424
      )
    }

    const outline = answer.body && typeof answer.body === 'object' ? answer.body : {}
    const links = Array.isArray(outline.links) ? outline.links : []
    const judged = await judgeCard({
      outline: { ...outline, links },
      label: release.setting?.label ?? release.name,
      platform: release.platform,
      model: await modelForDoor(pool, 'web', config),
      fetchImpl
    }).catch((error) => ({ category: null, blurb: null, why: String(error?.message ?? error) }))

    // The release's own pages first (its tracy_site_pages.json, top-level, at most six), then what
    // the demo's menu adds: the menu alone read Home only on Tracy Base EmDash, whose header items
    // open mega panels instead of linking (12/10/2026).
    const layouts = draftListingLayouts(release, links)
    return c.json({
      draft: {
        // Two values today, and which one is not a guess: JoomlArt publishes the `quickstart/ja-*`
        // releases, Tracy publishes its own.
        provider: /^(local\/)?quickstart\//.test(tag) ? 'JoomlArt' : 'Tracy',
        category: judged.category,
        blurb: judged.blurb,
        dark: outline.dark === true,
        defaultTheme: outline.dark === true && outline.defaultTheme === 'dark' ? 'dark' : 'light',
        layouts
      },
      read: {
        title: typeof outline.title === 'string' ? outline.title : '',
        menu: links.length,
        proposed: layouts.length
      },
      why: judged.why
    })
  })

  app.post('/api/ops/templates/:templateId/capture', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const templateId = c.req.param('templateId')
    const tag = c.req.query('tag') ?? ''
    const release = (await readReleases(pool)).find((r) => r.tag === tag)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    // The pictures are filed under the release's OWN card (`cardIdOf`), never a caller's path
    // segment: a mismatch would shoot one card's demo into another card's store.
    //
    // ⚠ COMPARED AFTER NORMALISING, BOTH SIDES. The release says `ja_voyara` (Joomla's directory
    // convention) and every id this screen carries is the slug — comparing the raw field against
    // the slug refused every Joomla capture with "that template is not this release's", which is
    // true of the strings and false of the templates. Half a normalisation is its own bug.
    if (cardIdOf(release) !== templateIdOf(templateId))
      return c.json({ error: 'TEMPLATE_MISMATCH', reason: 'That template is not this release’s.' }, 400)

    // The layouts to shoot come from the sheet — the card being EDITED, which is not on any
    // release yet (you cannot publish a card until its shots exist). Fall back to the card already
    // on the release for a plain "re-shoot what is published".
    const card = release.inspiration ?? release.setting?.card ?? null
    const body = await c.req.json().catch(() => null)
    const rawLayouts = Array.isArray(body?.layouts)
      ? body.layouts
      : Array.isArray(card?.layouts)
        ? card.layouts
        : []
    const layouts = []
    for (const l of rawLayouts) {
      if (l && typeof l.key === 'string' && typeof l.path === 'string' && l.path.startsWith('/'))
        // `address` travels with the layout: it is the only thing that knows where a page answers
        // when that is not its path, and the far side photographs whatever address it is handed.
        layouts.push({
          key: l.key,
          path: l.path,
          ...(typeof l.address === 'string' && l.address.startsWith('/') ? { address: l.address } : {})
        })
    }
    if (layouts.length === 0)
      return c.json({ error: 'NO_LAYOUTS', reason: 'Name at least one layout with a path to shoot.' }, 400)

    const demo = await liveDemoOf(pool, tag)
    if (!demo)
      return c.json(
        {
          error: 'NO_DEMO',
          reason:
            'No live demo of this release on this server. Install it under Design Templates, Demo Site, first.'
        },
        409
      )
    if (!host || !config.hosts.has(demo.host))
      return c.json(
        { error: 'NO_DEMO_HOST', reason: 'The demo’s host is not one this server can reach.' },
        503
      )

    const answer = await host.hostCall(
      config,
      demo.host,
      '/capture',
      // ⚠ THE PORT IS SENT, and without it the capture reaches nothing on a host-networked
      // tracy-host: `<label>-web-1` is a Docker-network alias, and that process resolves through
      // the machine's DNS. Measured 17/09 on dev — every shot failed `ERR_NAME_NOT_RESOLVED` while
      // the demo answered 200. `site.port` is what `render-compose.sh` published on loopback, so
      // it is the address that works either way; the far side falls back to the name without it.
      // The demo's own public hostname first — the address it is CONFIGURED for. A Tracy-built
      // Joomla demo carries `force_ssl = 2` and a `live_site`, so it 301s a loopback request to
      // https on a port that speaks none (measured 17/09 on apple-joomla). The port stays as the
      // fallback for a demo with no public address, which is every demo on a developer's machine.
      {
        label: demo.label,
        platform: release.platform,
        // The same front-controller rule the preview frames by: a Joomla layout with no address
        // is shot at `/index.php<path>`, never at the bare path Apache answers 404 for.
        layouts: joomlaAddresses(layouts, release.platform),
        port: demo.port ?? null,
        host: demoPublicHost(config, demo),
        // ⚠ THE STORE'S CEILING GOES WITH THE ASK, because the two limits are about different
        // things: tracy-host bounds a shot by HEIGHT, this store bounds it by BYTES, and a page
        // can obey one while breaking the other. Measured 25/09 on `quickstart/ja-resort/j6`:
        // `/about-us` and `/pages` came back 9.4 MB and 12.1 MB inside the 3600-px clip, were
        // refused here, and left the card unpublishable at "2 of 6 layouts name no desktop
        // picture yet" (#344). Told the ceiling, the host gives ground — density first, then page
        // length — and sends a picture that fits instead of one that is thrown away.
        maxBytes: MAX_PICTURE_BYTES
      },
      { fetchImpl }
    )
    if (!answer.ok || !Array.isArray(answer.body?.shots))
      return c.json(answer.body ?? { error: 'HOST_REFUSED' }, answer.status || 502)

    const base = `${config.origin.replace(/\/+$/, '')}/api/templates/${templateId}/shots`
    const stored = []
    const failed = []
    for (const shot of answer.body.shots) {
      // How long the host spent, phase by phase (`runCapture`): what tells a slow host from a
      // slow page when a shot fails, and what a person compares between two presses.
      const took = {
        ...(Number.isFinite(shot?.ms) ? { ms: shot.ms } : {}),
        ...(shot?.timings && typeof shot.timings === 'object' ? { timings: shot.timings } : {})
      }
      if (!shot?.ok || typeof shot.png !== 'string') {
        failed.push({
          key: shot?.key,
          width: shot?.width,
          error: shot?.error ?? 'the host took no picture',
          ...took
        })
        continue
      }
      const file = shotName(templateId, shot.key, shot.width, releaseShotPart(release.tag))
      try {
        await putShot(pool, { templateId, file, bytes: new Uint8Array(Buffer.from(shot.png, 'base64')) })
        stored.push({ key: shot.key, width: shot.width, file, url: `${base}/${file}`, ...took })
      } catch (e) {
        failed.push({
          key: shot.key,
          width: shot.width,
          error: e instanceof ShotRejected ? e.reason : String(e)
        })
      }
    }
    return c.json({ ok: true, stored, failed })
  })

  return app
}
