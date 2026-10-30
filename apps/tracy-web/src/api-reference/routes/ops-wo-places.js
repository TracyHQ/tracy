/** Route docs — see ./index.js for the entry shape. Filled from `src/ops/wo-places.js`. */
import { AGAIN_PARTS_DOC, MENU_ANSWER, MENU_PARTS_PROSE } from './website-opportunities.js'

const READ_RULE = 'Staff seat required.'
const ACT_RULE =
  "Owner or admin role only, and the request `Origin` must be this deployment's public origin (403 otherwise). Recorded in the place's history with the operator's email."
const PLACE = { id: 'Place id (uuid); an unknown id answers 404' }

/** @type {import('./index.js').RouteDoc[]} */
export const OPS_WO_PLACES_ROUTES = [
  {
    method: 'GET',
    path: '/api/ops/wo/places',
    summary: 'List the shared Website Opportunities places',
    description: `Places researched once for every account, newest first, with the current snapshot, each source's last successful collection (\`stale\` after 30 days), how many accounts and opportunities use the place, what its research cost Tracy today and in the last 30 days (spent, held, unreconciled), the last run and its error, and revoked pictures. Merged places are left out. \`counts\` covers the search across every filter; \`caps\` are the research caps of the settings. ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      query: {
        q: 'Search in the name, identities and links',
        state: '`all` (default), `stale`, `failing`, `revoked` or `merge` (a merge candidate is pending)',
        cursor: 'The `nextCursor` of the previous page',
        limit: '1–200, default 50'
      }
    },
    answers: '`{places, nextCursor, counts, today, caps, writable}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/places/merge-queue',
    summary: 'List URL ↔ Google place merge candidates',
    description: `Pairs of a pasted-URL place and a Google place that may be the same restaurant, with the evidence and score, best first. ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      query: {
        state:
          '`pending` (default), `waiting` (approved, not merged yet; `applyError` when the merge failed), `approved` or `rejected`'
      }
    },
    answers: '`{candidates}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/merge-queue/:id/approve',
    summary: 'Approve a merge candidate',
    description: `Merges the URL place into the Google place (as \`/merge\` does) and marks the candidate approved. A decided candidate answers 409. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Merge candidate id' } },
    answers: '`{ok, candidate}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/merge-queue/:id/reject',
    summary: 'Reject a merge candidate',
    description: `Marks the candidate rejected; both places stay as they are. A decided candidate answers 409. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { id: 'Merge candidate id' } },
    answers: '`{ok, candidate}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/places/:id',
    summary: 'Read one shared place',
    description: `The place's facts, links, every picture and video with its provenance and revoke state, snapshot history, recent runs, the accounts that use it (with their email), places merged into it, its operator history, pending merge candidates and its 30-day cost by provider operation. \`menu\` is the place's Menu, each photo also with its \`costCents\` and \`model\`: ${MENU_PARTS_PROSE} ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    answers: `\`{place, menu, links, media, snapshots, jobs, accounts, mergedPlaces, history, mergeCandidates, costByOperation}\`; ${MENU_ANSWER}, each photo also \`costCents, model\``
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/refresh',
    summary: 'Force a new research run of a place',
    description: `Queues a run that collects every source again. A queued run is reused and a running one is followed by at most one next run. Refused with 409 \`DAILY_CAP_REACHED\` once today's spent, held and unreconciled research cost reaches the daily cap, and \`PLACE_MERGED\` for a merged place. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    answers: '`{ok, job, outcome}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/places/:id/research-again',
    summary: 'Preview what Research again would look at for a place',
    description:
      'The parts a Research again run would look at now (failed on our side, more than 30 days old, never tried, or whose rule changed), each with its reason and reserved ceiling in cents, and the parts it keeps. A `menu-photos` part to run carries `photos`, how many photos it would read. 400 `INVALID_PARTS`.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE, query: { parts: AGAIN_PARTS_DOC } },
    answers:
      '`{plan: {run: [{part, reason: "never" | "failed" | "outdated" | "rule-changed", ceilingCents, photos?}], kept: [{part, reason: "up-to-date" | "none" | "unavailable" | "over-cap", detail?}], ceilingCents}, payer: "operator"}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/research-again',
    summary: 'Research a place again, only what is due',
    description: `Queues a run holding the parts the preview names now (the plan is worked out again under the place's lock); a run already queued or running is joined as it is. 409 \`NOTHING_DUE\` with the \`plan\` when nothing is due, \`DAILY_CAP_REACHED\` and \`PLACE_MERGED\` as for a refresh; 400 \`INVALID_PARTS\`. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    body: {
      type: 'object',
      properties: {
        parts: {
          oneOf: [{ type: 'array', items: { type: 'string' }, minItems: 1 }, { type: 'string' }],
          description: AGAIN_PARTS_DOC
        }
      }
    },
    answers: '`{ok, job, joined, plan}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/social-pages',
    summary: 'Confirm or reject a social page a web search left for a person to check',
    description: `Body \`{url, verdict: "confirm" | "reject"}\`: \`url\` is a Facebook or Instagram page the place's search found. Confirm links it to the place (verified by the operator) for every account; reject marks it so it is not asked again. 400 \`INVALID_VERDICT\`, \`INVALID_URL\`; 404 \`PAGE_NOT_FOUND\`. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    body: {
      type: 'object',
      required: ['url', 'verdict'],
      properties: { url: { type: 'string' }, verdict: { type: 'string', enum: ['confirm', 'reject'] } }
    },
    answers: '`{ok, page}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/social-pages/add',
    summary: 'Add a social page the search did not find',
    description: `Body \`{url}\`: a Facebook, Instagram, TikTok or YouTube page an operator knows is this place's. It is linked to the place (added by the operator) for every account, and the next Research again collects it. Adding the same page again changes nothing. 400 \`INVALID_URL\` (not one of those networks); 422 \`URL_BLOCKED\` (credentials, a port, or an address that resolves to a private network). ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    body: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
    answers: '`{ok, link, added}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/media/:mediaId/revoke',
    summary: 'Revoke one picture or video of a place',
    description: `Body \`{reason}\` (1–500 characters). The row and its provenance are kept; a revoked picture is no longer built or handed off. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { ...PLACE, mediaId: 'Place media id' } },
    body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } },
    answers: '`{ok, media}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/media/:mediaId/unrevoke',
    summary: 'Restore a revoked picture or video',
    description: `Clears the revoke; the previous reason stays in the history. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { ...PLACE, mediaId: 'Place media id' } },
    answers: '`{ok, media}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/merge',
    summary: 'Merge a place into another',
    description: `Body \`{into}\`. The place points to \`into\` from now on, and its opportunities move there. Refused with 409 while either place is being researched or already merged. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    body: { type: 'object', required: ['into'], properties: { into: { type: 'string' } } },
    answers: '`{ok, from, into, opportunities}`'
  },
  {
    method: 'POST',
    path: '/api/ops/wo/places/:id/split',
    summary: 'Split an identity off a place',
    description: `Body \`{identity: {namespace, externalId}}\`. An identity of a place merged into this one undoes that merge and moves its opportunities back; an identity of this place becomes a new place with the opportunities that name it. A place keeps at least one identity. ${ACT_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    body: {
      type: 'object',
      required: ['identity'],
      properties: {
        identity: {
          type: 'object',
          required: ['namespace', 'externalId'],
          properties: { namespace: { type: 'string' }, externalId: { type: 'string' } }
        }
      }
    },
    answers: '`{ok, place, from, restored, opportunities}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/revisions/:revId/labels',
    summary: 'Read the photo labels and readiness of a brief revision',
    description: `What one brief revision holds about its photos: each photo with its source, credit, uploader, role, boxes and the offering or person it is linked to (with how the link was decided: the owner's alt text, a post, a vision model, or none), the offerings and named people with their photos, and the readiness verdict a build acts on (\`null\` for a revision made before readiness was measured). The same view the page \`/ops/wo/revisions/<id>/labels\` renders. ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { revId: 'Brief revision id (uuid), of any account; an unknown id answers 404' } },
    answers: '`{revision, readiness, counts, offerings, people, photos}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/places/:id/briefs',
    summary: "Read the label views of a place's briefs",
    description: `One label view (see \`/api/ops/wo/revisions/:revId/labels\`) for the latest brief revision of each opportunity that resolved to the place, newest first, at most 20. The page \`/ops/wo/places/<id>/briefs\` renders them. ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    answers: '`{revisions: [label view]}`'
  },
  {
    method: 'GET',
    path: '/api/ops/wo/revisions/:revId/assets/:assetId/image',
    summary: 'Read the stored bytes of a photo a brief revision pinned',
    description: `The bytes of one photo of the revision's asset manifest, served only when the stored row still has the sha256 the manifest pinned (404 \`MEDIA_NOT_STORED\` otherwise, 503 without a file store). ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      path: { revId: 'Brief revision id (uuid)', assetId: 'The asset id of the revision manifest' }
    },
    answers: 'The image, or a redirect to a short-lived address of it'
  },
  {
    method: 'GET',
    path: '/ops/wo/revisions/:revId/labels',
    summary: 'Review page of a brief revision',
    description: `An HTML page for staff: each photo of the brief revision with its source, credit, role and boxes, the offering or person it is linked to and how, the named people with their portraits, and the readiness verdict with its checks. It renders the data of \`/api/ops/wo/revisions/:revId/labels\`. Works for any revision id. ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: { revId: 'Brief revision id (uuid); an unknown id answers 404' } },
    answers: 'An HTML document'
  },
  {
    method: 'GET',
    path: '/ops/wo/places/:id/briefs',
    summary: "Review page of a place's briefs",
    description: `The same review page for the latest brief revision of each opportunity that resolved to the place. ${READ_RULE}`,
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: PLACE },
    answers: 'An HTML document'
  }
]
