/**
 * The owner's choices for the site itself on the Profile card (#537), beside the Profile edit doors of `route.js`:
 *
 *   PUT /api/website-opportunities/:id/team                       {action, id?, label?, role?, photoMediaId?}
 *   PUT /api/website-opportunities/:id/socials                    {network, action, url? | handle? | number?, label?}
 *   PUT /api/website-opportunities/:id/media/:mediaId/visibility  {hidden}
 *   PUT /api/website-opportunities/:id/reviews/visibility         {key, hidden}
 *
 * Each is a Profile edit (`approval.js markProfileChanged`: the Profile needs review again, a brief made before reads
 * stale) and answers `{opportunity}` plus what it changed. Kept on the candidate (`owner-site-edits.js`), where Research
 * again never reaches; read by the Details answer and every later brief. A band of the Profile switched off goes through
 * the facts door (`PUT /:id/facts` with `factId: band_<band>`, `domain/owner-site-picks.mjs BANDS`). Every door touches
 * only the caller's own opportunity: another account's answers 404.
 */
import {
  SOCIAL_LABEL_MAX,
  SOCIAL_NETWORKS,
  TEAM_ADDED_MAX,
  TEAM_LABEL_MAX,
  TEAM_ROLE_MAX,
  isReviewKey,
  readSocialLink,
  readTeamEdit
} from '../domain/owner-site-picks.mjs'
import { markProfileChanged } from './approval.js'
import {
  HIDDEN_MAX,
  opportunityMediaExists,
  ownPhotoExists,
  researchTeamIdsOf,
  saveHidden,
  saveSiteSocial,
  saveTeamEdit
} from './owner-site-edits.js'

const NETWORK_IDS = SOCIAL_NETWORKS.map((n) => n.id).join(', ')
const TEAM_NEXT = {
  INVALID_ACTION:
    'Send "action" as "add", "update" or "remove"; an update changes at least one of label, role or photoMediaId.',
  INVALID_MEMBER: 'Send "id" as the id of a person of the team.',
  INVALID_LABEL: `Send "label" as the person's name, 1 to ${TEAM_LABEL_MAX} characters.`,
  INVALID_ROLE: `Send "role" as the person's role, at most ${TEAM_ROLE_MAX} characters, or null to clear it.`,
  INVALID_PHOTO: 'Send "photoMediaId" as the id of a photo added to this business, or null to clear it.'
}
const SOCIAL_NEXT = {
  INVALID_NETWORK: `Send "network" as one of ${NETWORK_IDS}.`,
  INVALID_ACTION: 'Send "action" as "set" or "remove".',
  INVALID_LABEL: `Send "label" as the link's name, 1 to ${SOCIAL_LABEL_MAX} characters.`
}

/**
 * @param {import('hono').Hono} app
 * @param {object} ctx the open router's helpers: `pool`, `caller`, `refuse`, `notFound`, `json`, `body`,
 *   `opportunityShape`, `opportunityOf`, `UUID`, `BASE`.
 */
export function ownerEditRoutes(app, ctx) {
  const { pool, caller, refuse, notFound, json, body, UUID, BASE, opportunityOf } = ctx

  /** The caller's own opportunity of the path, or a Response. */
  async function ownOpportunity(c) {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    return { who, opp }
  }

  /** A saved edit's answer: the Profile needs review again; `extra` is what the door changed. */
  async function edited(c, who, row, extra = {}, status = 200) {
    const marked = (await markProfileChanged(pool, who.accountId, row.id)) ?? row
    return json(c, { opportunity: ctx.opportunityShape(marked), ...extra }, status)
  }

  // The team as the owner keeps it: add a person, change a person's name, role or photo (one research read too), or
  // remove one. Removing a person research read takes them off as the reading's Remove does (`readingPicks.removed`,
  // restored with `PUT /:id/reading` `restore`); removing one the owner added deletes them. A photo is a photo added
  // to this business first (`POST /:id/media`, best with `purpose: team`).
  app.put(`${BASE}/:id/team`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    const edit = readTeamEdit(await body(c))
    if (edit.error) return refuse(c, 400, edit.error, TEAM_NEXT[edit.error])
    if (typeof edit.photoMediaId === 'string' && !(await ownPhotoExists(pool, own.opp.id, edit.photoMediaId)))
      return refuse(
        c,
        422,
        'MEDIA_NOT_FOUND',
        'Add the photo to this business first (Photos & video), then give its id: only a photo of this business can be a team photo.'
      )
    const researchIds = edit.action === 'add' ? [] : await researchTeamIdsOf(pool, own.opp)
    const saved = await saveTeamEdit(pool, own.who.accountId, own.opp.id, edit, researchIds)
    if (!saved) return notFound(c, 'opportunity')
    if (saved.error === 'MEMBER_NOT_FOUND') return notFound(c, 'team member')
    if (saved.error === 'TOO_MANY_MEMBERS')
      return refuse(
        c,
        409,
        'TOO_MANY_MEMBERS',
        `At most ${TEAM_ADDED_MAX} people can be added: remove one first.`,
        {
          max: TEAM_ADDED_MAX
        }
      )
    return edited(c, own.who, saved.row, { member: saved.result.member }, edit.action === 'add' ? 201 : 200)
  })

  // A social link the site shows, typed by the owner: never a research source (research reads `candidate.socials`), so
  // the research link rules (`UNSUPPORTED_LINK`) do not apply. A handle makes the network's own link, a WhatsApp number
  // its `wa.me` link.
  app.put(`${BASE}/:id/socials`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    const link = readSocialLink(await body(c))
    if (link.error === 'INVALID_URL')
      return refuse(
        c,
        422,
        'INVALID_URL',
        'Send "url" as an http or https link of a page on this network, or "handle" as its handle.'
      )
    if (link.error === 'INVALID_PHONE')
      return refuse(
        c,
        422,
        'INVALID_PHONE',
        'Send "number" as the WhatsApp number with its country code, such as +971501234567.'
      )
    if (link.error) return refuse(c, 400, link.error, SOCIAL_NEXT[link.error])
    const saved = await saveSiteSocial(pool, own.who.accountId, own.opp.id, link)
    if (!saved) return notFound(c, 'opportunity')
    return edited(c, own.who, saved.row, { siteSocials: saved.row.candidate?.siteSocials ?? {} })
  })

  // One photo or video kept off the site (or put back): it stays in Photos & video, and fills no slot of a later brief.
  app.put(`${BASE}/:id/media/:mediaId/visibility`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    const mediaId = c.req.param('mediaId')
    if (!UUID.test(mediaId) || !(await opportunityMediaExists(pool, own.opp, mediaId)))
      return notFound(c, 'media')
    const b = await body(c)
    if (typeof b?.hidden !== 'boolean')
      return refuse(c, 400, 'INVALID_HIDDEN', 'Send "hidden" as true or false.')
    const saved = await saveHidden(pool, own.who.accountId, own.opp.id, 'mediaPicks', mediaId, b.hidden)
    if (!saved) return notFound(c, 'opportunity')
    if (saved.error)
      return refuse(c, 409, 'TOO_MANY_HIDDEN', `At most ${HIDDEN_MAX} photos and videos can be kept off.`, {
        max: HIDDEN_MAX
      })
    return edited(c, own.who, saved.row, { media: { id: mediaId, ownerHidden: b.hidden } })
  })

  // One review kept off the site (or put back), by its `key` as the Details answer gives it: no testimonial quotes it.
  // A key no review has is kept and changes nothing.
  app.put(`${BASE}/:id/reviews/visibility`, async (c) => {
    const own = await ownOpportunity(c)
    if (own instanceof Response) return own
    const b = await body(c)
    if (!isReviewKey(b?.key))
      return refuse(
        c,
        400,
        'INVALID_REVIEW',
        'Send "key" as the key of a review, as the Details answer gives it.'
      )
    if (typeof b?.hidden !== 'boolean')
      return refuse(c, 400, 'INVALID_HIDDEN', 'Send "hidden" as true or false.')
    const saved = await saveHidden(pool, own.who.accountId, own.opp.id, 'reviewPicks', b.key, b.hidden)
    if (!saved) return notFound(c, 'opportunity')
    if (saved.error)
      return refuse(c, 409, 'TOO_MANY_HIDDEN', `At most ${HIDDEN_MAX} reviews can be kept off.`, {
        max: HIDDEN_MAX
      })
    return edited(c, own.who, saved.row, { review: { key: b.key, ownerHidden: b.hidden } })
  })
}
