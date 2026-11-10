/**
 * The seller's own steps on one opportunity (#537), beside the Profile edit doors of `route.js`:
 *
 *   POST /api/website-opportunities/:id/profile/approve   the Profile approved (unlocks the Content brief)
 *   POST /api/website-opportunities/:id/sources           {url}: one more link of the business
 *   DELETE /api/website-opportunities/:id/sources         {url}: one of its links removed (one link stays at least)
 *   POST /api/website-opportunities/:id/media             multipart `file`: a photo or video the seller adds
 *
 * Each answers `{opportunity, approval}` (`approval.js approvalOf`). Sources are fixed once research starts: a source
 * is added or removed only while research has not started or after it failed (`sourcesLocked`), so a source change
 * never has research, a Profile or a brief to reset. A photo or video added is a Profile edit (the Profile needs review
 * again, research does not). Every door touches only the caller's own opportunity: another account's answers 404.
 * The brief's own approval door lives with the brief (`opportunities-build/route.js`).
 */
import { judgeLinks } from '../domain/link-kinds.mjs'
import { videoSize } from '../domain/video-size.mjs'
import { approvalOf, approveProfile, markProfileChanged, saveSourceChange } from './approval.js'
import { EXT, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './executor.js'
import { LISTING_PAGES_MAX, pruneListingSource, saveListingSource, unsupportedLinkOf } from './link-fields.js'
import { researchStateOf } from './research-state.js'
import {
  candidateHasLink,
  candidateWithNewRefs,
  candidateWithoutLink,
  insertMedia,
  linkKeyOf,
  researchLinkCountOf
} from './store.js'

/** `wo_media.source` of a photo or video the seller added themself. */
export const OWNER_MEDIA_SOURCE = 'owner'
const URL_MAX = 2000

/**
 * @param {import('hono').Hono} app
 * @param {object} ctx the open router's helpers and deps: `pool`, `objects`, `imageInfo`, `caller`, `refuse`,
 *   `notFound`, `json`, `body`, `domainOr`, `featureOn`, `featureOff`, `linkFields`, `opportunityShape`,
 *   `latestBriefAt`, `opportunityOf`, `UUID`, `BASE`.
 */
export function sellerReviewRoutes(app, ctx) {
  const { pool, caller, refuse, notFound, json, body, UUID, BASE, opportunityOf } = ctx

  /**
   * 409 `RESEARCH_STARTED` unless this opportunity's research has not started or failed (owner decision: sources are
   * fixed once research starts; a bad link often causes a failure, so a failed research reopens them). It also covers
   * an active research job: a queued, running or paused one reads `running` (`research-state.js`), and a brief or a
   * build needs finished research. `next` is the door's own sentence. Null when the sources may change.
   */
  async function sourcesLocked(c, opp, next) {
    const research = await researchStateOf(pool, opp.id)
    if (research.state === 'not_started' || research.state === 'failed') return null
    return refuse(c, 409, 'RESEARCH_STARTED', next)
  }

  /** The caller's own opportunity of the path, or a Response. */
  async function ownOpportunity(c) {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    return { who, opp }
  }

  /** `{opportunity, approval}` of a row, read with this card's research and latest brief. */
  async function answer(c, row, status = 200) {
    const research = await researchStateOf(pool, row.id)
    const approval = approvalOf({ opportunity: row, research, latestBriefAt: await ctx.latestBriefAt(row) })
    return json(c, { opportunity: ctx.opportunityShape(row), approval }, status)
  }

  app.post(`${BASE}/:id/profile/approve`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    const research = await researchStateOf(pool, own.opp.id)
    const approval = approvalOf({ opportunity: own.opp, research, latestBriefAt: null })
    if (approval.profile === 'none')
      return refuse(
        c,
        409,
        'RESEARCH_NOT_DONE',
        'Press Research first: the Profile is made from its results.'
      )
    const row = await approveProfile(pool, own.who.accountId, own.opp.id)
    if (!row) return notFound(c, 'opportunity')
    return answer(c, row)
  })

  // One more link of the business, of the kinds a create accepts (a website, a social page, a listing page), judged by
  // the same rules (`link-fields.js`). A Google link names the business itself, so it is not added here; a page of a
  // platform Tracy cannot read (`UNSUPPORTED_LINK_HOSTS`) is refused rather than saved as the website; at most
  // `LISTING_PAGES_MAX` listing pages. A refused duplicate says whether it is this exact link or another page of a
  // platform the business already has a page of (one website, one page per social network). Only before research
  // starts or after it failed (`sourcesLocked`): the link list is what research reads.
  app.post(`${BASE}/:id/sources`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    if (!(await ctx.featureOn())) return ctx.featureOff(c)
    const locked = await sourcesLocked(
      c,
      own.opp,
      'Research has already run. Sources are fixed once the research starts; they can be changed only before it, or after it failed.'
    )
    if (locked) return locked
    const b = await body(c)
    const raw = typeof b?.url === 'string' ? b.url.trim() : ''
    if (!raw || raw.length > URL_MAX)
      return refuse(
        c,
        400,
        'INVALID_URL',
        'Send "url" as the address of a website, social page or listing page.'
      )
    const unsupported = unsupportedLinkOf(raw)
    if (unsupported)
      return refuse(
        c,
        422,
        'UNSUPPORTED_LINK',
        `Tracy cannot read ${unsupported.platform} pages: add the business's website, a Facebook, Instagram, TikTok or YouTube page, or a listing page instead.`,
        { platform: unsupported.platform }
      )
    const [judged] = judgeLinks([raw])
    if (judged?.kind === 'google')
      return refuse(
        c,
        422,
        'GOOGLE_LINK_NOT_ADDED',
        'A Google link names the business itself: add its website, a social page or a listing page instead.'
      )
    const held = own.opp.candidate ?? {}
    const known = candidateHasLink(held, raw)
    const listingCount = Array.isArray(held.listings) ? held.listings.length : 0
    if (judged?.kind === 'listing' && !known && listingCount >= LISTING_PAGES_MAX)
      return refuse(
        c,
        409,
        'TOO_MANY_SOURCES',
        `This business already has ${LISTING_PAGES_MAX} listing pages: remove one before adding another.`,
        { max: LISTING_PAGES_MAX }
      )
    const domain = await ctx.domainOr(c)
    if (domain instanceof Response) return domain
    const made = await ctx.linkFields(domain, { raws: [raw], typedName: null, place: null, legacy: false })
    if (made.refusal) {
      const { status, code, next, extra } = made.refusal
      return refuse(c, status, code, next, extra)
    }
    const merged = candidateWithNewRefs(own.opp.candidate, made.fields.candidate)
    if (!merged)
      return known || judged?.kind === 'listing'
        ? refuse(c, 409, 'SOURCE_ALREADY_KNOWN', 'This business already has this link: nothing was added.', {
            links: made.links
          })
        : refuse(
            c,
            409,
            'PLATFORM_ALREADY_KNOWN',
            judged?.kind === 'website'
              ? 'This business already has a website: remove it before adding another.'
              : 'This business already has a page on this network: remove it before adding another.',
            { platform: judged?.kind ?? null, links: made.links }
          )
    const row = await saveSourceChange(pool, own.who.accountId, own.opp.id, merged)
    if (!row) return notFound(c, 'opportunity')
    await saveListingSource(pool, row.id, made.listings)
    return answer(c, row, 201)
  })

  // One of the business's links removed, matched as stored, as shown or as pasted (`store.js linkKeyOf`), and only
  // before research starts or after it failed (`sourcesLocked`): only this opportunity's link list (and its private
  // listing row) changes.
  app.delete(`${BASE}/:id/sources`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    if (!(await ctx.featureOn())) return ctx.featureOff(c)
    const b = await body(c)
    const raw = typeof b?.url === 'string' ? b.url.trim() : ''
    if (!raw || raw.length > URL_MAX || !linkKeyOf(raw))
      return refuse(c, 400, 'INVALID_URL', 'Send "url" as one of the links this business lists.')
    const removed = candidateWithoutLink(own.opp.candidate, raw)
    if (removed?.google)
      return refuse(
        c,
        422,
        'GOOGLE_LINK_NOT_REMOVED',
        'A Google link names the business itself: it stays while the opportunity exists.'
      )
    if (!removed) return notFound(c, 'link')
    if (researchLinkCountOf(own.opp.provider, removed.candidate) < 1)
      return refuse(c, 409, 'LAST_SOURCE', 'add')
    const locked = await sourcesLocked(
      c,
      own.opp,
      'Research is running or has finished. Sources can be removed only before the research, or after it failed.'
    )
    if (locked) return locked
    const row = await saveSourceChange(pool, own.who.accountId, own.opp.id, removed.candidate)
    if (!row) return notFound(c, 'opportunity')
    const key = linkKeyOf(raw)
    await pruneListingSource(pool, row.id, (url) => linkKeyOf(url) !== key)
    return answer(c, row)
  })

  // A photo or video the seller adds (multipart `file`), stored like a collected picture (`executor.js storedRecord`)
  // with source `owner`, so the brief and the demo build read it like the others.
  app.post(`${BASE}/:id/media`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    if (!(await ctx.featureOn())) return ctx.featureOff(c)
    const objects = ctx.objects
    if (!objects?.put)
      return refuse(
        c,
        503,
        'STORE_UNAVAILABLE',
        'Uploads are off on this server: no file store is configured.'
      )
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function')
      return refuse(
        c,
        400,
        'INVALID_FILE',
        'Send multipart/form-data with a photo or video in a field named `file`.'
      )
    if (file.size > VIDEO_MAX_BYTES)
      return refuse(
        c,
        413,
        'TOO_LARGE',
        `Send a smaller file: a video may be at most ${VIDEO_MAX_BYTES} bytes.`
      )
    const domain = await ctx.domainOr(c)
    if (domain instanceof Response) return domain
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = domain.sniffMime(bytes)
    const kind = mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : null
    if (!kind || !EXT[mime])
      return refuse(
        c,
        415,
        'NOT_MEDIA',
        'Send a JPEG, PNG, GIF, WebP or AVIF photo, or an MP4 or WebM video.'
      )
    if (kind === 'image' && bytes.length > IMAGE_MAX_BYTES)
      return refuse(
        c,
        413,
        'TOO_LARGE',
        `Send a smaller photo: a photo may be at most ${IMAGE_MAX_BYTES} bytes.`
      )
    let info = { width: null, height: null, palette: null, dhash: null, features: null }
    if (kind === 'image') {
      if (typeof ctx.imageInfo !== 'function')
        return refuse(c, 503, 'STORE_UNAVAILABLE', 'Photos cannot be read on this server.')
      try {
        info = await ctx.imageInfo(bytes)
      } catch {
        return refuse(c, 415, 'IMAGE_UNREADABLE', 'This photo cannot be read: save it again as JPEG or PNG.')
      }
    } else info = { ...info, ...videoSize(bytes) }
    const sha256 = domain.sha256Hex(bytes)
    const opp = own.opp
    const objectKey = `opportunities/${opp.account_id}/${opp.id}/${sha256}.${EXT[mime]}`
    if (!(await objects.put(objectKey, bytes, mime)))
      return refuse(c, 502, 'STORE_FAILED', 'The file store did not answer: try again in a moment.')
    const name = typeof file.name === 'string' ? file.name.slice(0, 200) : null
    const inserted = await insertMedia(pool, {
      accountId: opp.account_id,
      opportunityId: opp.id,
      sha256,
      objectKey,
      status: 'stored',
      mime,
      bytes: bytes.length,
      width: info.width,
      height: info.height,
      kind,
      category: 'other',
      palette: info.palette,
      source: OWNER_MEDIA_SOURCE,
      sourceUrl: `owner:${sha256}`,
      caption: null,
      alt: null,
      dhash: info.dhash ?? null,
      labels: { ...(info.features ? { features: info.features } : {}), ...(name ? { fileName: name } : {}) }
    })
    if (!inserted)
      return refuse(
        c,
        409,
        'MEDIA_ALREADY_ADDED',
        'This file is already in the Photos & video of this business.'
      )
    const row = (await markProfileChanged(pool, own.who.accountId, opp.id)) ?? opp
    const research = await researchStateOf(pool, row.id)
    return json(
      c,
      {
        opportunity: ctx.opportunityShape(row),
        approval: approvalOf({ opportunity: row, research, latestBriefAt: await ctx.latestBriefAt(row) }),
        media: { id: inserted.id, kind, source: OWNER_MEDIA_SOURCE, width: info.width, height: info.height }
      },
      201
    )
  })
}
