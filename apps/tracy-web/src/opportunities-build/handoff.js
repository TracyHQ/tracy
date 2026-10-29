import { visionLabelOf } from './demo-photo-labels.js'
import { handoffEngine } from './engine-report.js'
import { isAgentDemo, checkedResearch, agentDemoPrompt, researchHash } from './agent-demo.js'
import { renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import { briefWithResearch } from './revision-research.js'
/**
 * Handing a provisioned demo site to its agent (plan §5 step 8): the opportunity's own pictures go
 * into the site through the REAL Apply door (`media.upload`, as the person who pressed, with their
 * cookie), then the domain renders the one prompt the site's agent builds from.
 *
 * 🔒 ONE UPLOAD AT A TIME, AND RESUMABLE. A site takes one write at a time (`sites/brief-engines/
 * pictures.js`: a second concurrent `media.upload` answers `writer_busy`), so pictures go in a row,
 * and `wo_build.handoff.placed` is saved after each one: a press after a crash or a timeout skips
 * what is already on the site. `apply_id` is derived from the picture's sha256, so the site sees a
 * repeated upload as the same write.
 *
 * Videos are not pushed as base64 through the Apply door: they stay links to their source, which the
 * prompt names. On EmDash the door hands the upload to the site's host (`sites/emdash-media.js`) and answers the
 * library item's url, which `placed` keeps.
 *
 * 🔒 THE SITE'S OWN BUILD PLACES THE PHOTOGRAPHS FIRST (`sites/brief-engines/real-pictures.js`, plan §7 C4). A hand-off
 * waits until the site's brief has finished (`site_brief` out of its open states), not only its host job: the brief's
 * write would otherwise race the agent. Then only the pictures the build did not place are uploaded, and the prompt names
 * what was placed (leave it), what holds a placeholder and what is still demo.
 */
import { createHash } from 'node:crypto'
import { acceptedDishPhotos } from 'website-opportunities/domain/dish-photos.mjs'
import { FILL_REASONS } from 'website-opportunities/domain/fill-plan.mjs'
import { DRAW_REASONS } from 'website-opportunities/domain/fill-draw.mjs'
import { DECOR_REASONS } from 'website-opportunities/domain/decor-plan.mjs'
import { socialFiguresOfRevision } from './place-profile-of-revision.js'
import { buildPlaced, saveHandoff } from './build-store.js'
import { picturePolicy } from '../lib/wo-picture-policy.js'
import { sidecarForTemplate } from '../lib/slot-roles-for.js'
import { isBriefBuild } from './brief-build-path.js'

/** The states of a site's brief in which its words and pictures are still being written (`sites/brief-store.js`). */
const BRIEF_OPEN = ['queued', 'preparing', 'ready', 'applying']

/** The hand-off states the QA gate writes as its verdict (`demo-qa.js`): no later press rewrites them. */
export const HANDOFF_JUDGED = ['completed', 'needs-review']

const PICTURE_MAX_BYTES = 8 * 1024 * 1024
const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
}

/**
 * @param {{
 *   pool: import('pg').Pool, request: (path: string, init: RequestInit) => Promise<Response>,
 *   objects: {get: (key: string) => Promise<Response | null>} | null, domain: any,
 *   origin: string, cookie: string, build: any, revision: any,
 *   prepareContact?: null | (() => Promise<{ok: boolean, reason?: string}>)
 * }} args
 * @returns {Promise<{status: number, body: object}>}
 */
export async function handOff({
  pool,
  request,
  objects,
  domain,
  origin,
  cookie,
  build,
  revision,
  prepareContact = null,
  readNativeInventory = null,
  email = null
}) {
  // The QA gate already judged this demo: a press opens its chat again and changes nothing (the verdict stays).
  if (HANDOFF_JUDGED.includes(build.handoff?.state))
    return { status: 200, body: { handoff: build.handoff, site: { key: build.site_key } } }
  const folder = domain.HANDOFF_FOLDER?.[revision.cms]
  if (!folder)
    return refusal(
      409,
      'HANDOFF_UNSUPPORTED',
      'This CMS takes no pictures through the Apply door yet; build on Joomla or WordPress.'
    )
  if (!build.site_key || !build.site_job_id)
    return refusal(409, 'SITE_NOT_READY', 'Wait until the demo site is created, then press again.')
  const job = await readJson(
    request,
    `/api/sites/${encodeURIComponent(build.site_key)}/jobs/${encodeURIComponent(build.site_job_id)}`,
    {
      headers: { cookie, origin }
    }
  )
  if (!job.ok)
    return refusal(502, 'SITE_JOB_UNREADABLE', 'Try again: the site’s build job could not be read.')
  if (job.body?.state !== 'done')
    return refusal(409, 'SITE_NOT_READY', 'Wait until the demo site is created, then press again.', {
      siteJob: job.body?.state ?? null
    })
  const brief = await pool.query('select state from site_brief where site_key = $1', [build.site_key])
  if (isAgentDemo(revision)) {
    if (brief.rows[0])
      return refusal(409, 'AGENT_DEMO_OTHER_WRITER', 'Another fill writer is registered on this site.')
    const bundle = checkedResearch(revision)
    // 🔒 AN EMDASH SITE HAS NO COMPONENT TO PAIR (`pair-component.js` pairs Joomla and WordPress; EmDash answers
    // `skipped`): its content door is `tracy_emdash` in its own container. Requiring `registered` held every EmDash
    // build at "connection not ready" for ever (pilot 24/10/2026, 52 waits in one turn).
    const connected =
      job.body?.custody === 'registered' || (revision.cms === 'emdash' && job.body?.custody === 'skipped')
    if (!connected || job.body?.laneError || job.body?.designSystem?.state === 'failed')
      return refusal(
        409,
        'AGENT_DEMO_CONNECTION_NOT_READY',
        'Wait until the site connection and design system are ready.'
      )
    if (!build.content?.agentDemo?.structure) {
      const describe = await readJson(request, `/api/sites/${encodeURIComponent(build.site_key)}/apply`, {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'content.read', params: { describe: true } })
      })
      if (!describe.ok || describe.body?.ok === false || describe.body?.code)
        return refusal(
          409,
          'AGENT_DEMO_STRUCTURE_UNAVAILABLE',
          'The live content structure could not be read.'
        )
      let contract = null
      if (revision.cms !== 'emdash') {
        const inspected = await readJson(request, `/api/sites/${encodeURIComponent(build.site_key)}/apply`, {
          method: 'POST',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'content.contract', params: { operation: 'inspect' } })
        })
        contract =
          inspected.ok && !inspected.body?.code
            ? inspected.body
            : { unresolved: true, reason: inspected.body?.code ?? 'contract-unavailable' }
      }
      const structure = { describe: describe.body, contract, cms: revision.cms }
      if (!readNativeInventory || !email)
        return refusal(
          503,
          'AGENT_DEMO_INVENTORY_UNAVAILABLE',
          'The full native content inventory is not connected.'
        )
      try {
        const site = (await pool.query('select * from site where site_key=$1', [build.site_key])).rows[0]
        structure.inventory = await readNativeInventory({ site, email, structure })
        if (!structure.inventory?.complete)
          return refusal(
            409,
            'AGENT_DEMO_INVENTORY_INCOMPLETE',
            'The native publication and relation inventory is incomplete.',
            { coverage: structure.inventory?.coverage ?? [] }
          )
      } catch (error) {
        return refusal(
          409,
          error.code ?? 'AGENT_DEMO_INVENTORY_UNAVAILABLE',
          'The full native content inventory could not be read.',
          { detail: error.detail ?? null }
        )
      }
      await pool.query(
        `update wo_build set content=jsonb_set(coalesce(content,'{}'::jsonb),'{agentDemo}', $2::jsonb)
        where id=$1 and content#>'{agentDemo,structure}' is null`,
        [
          build.id,
          JSON.stringify({ ...build.content?.agentDemo, structure, structureHash: researchHash(structure) })
        ]
      )
    }
    const handoff = {
      state: 'ready',
      workflow: 'agent-demo/1',
      researchHash: bundle.hash,
      prompt: agentDemoPrompt(revision),
      placed: {},
      at: new Date().toISOString(),
      ...build.handoff
    }
    await saveHandoff(pool, build.id, handoff)
    return { status: 200, body: { handoff, site: { key: build.site_key } } }
  }
  if (brief.rows[0] && BRIEF_OPEN.includes(brief.rows[0].state))
    return refusal(
      409,
      'SITE_NOT_READY',
      'Wait until the site’s text and pictures are written, then press again.',
      {
        brief: brief.rows[0].state
      }
    )
  if (brief.rows[0] && brief.rows[0].state !== 'applied')
    return refusal(
      409,
      'SITE_FILL_FAILED',
      'Resume the site’s text and pictures before handing it to the agent.',
      {
        brief: brief.rows[0].state
      }
    )
  // Prepare the native form before saving a ready hand-off or uploading anything for the agent.
  if (prepareContact) {
    const contact = await prepareContact()
    if (!contact.ok)
      return refusal(
        503,
        'CONTACT_PREVIEW_FAILED',
        'The demo contact form could not be prepared. Try the hand-off again.',
        { reason: contact.reason }
      )
  }
  if (!objects) return refusal(503, 'STORE_UNAVAILABLE', 'The file store is not configured here.')

  const placed = { ...build.handoff?.placed }
  const skipped = []
  const media = await buildPlaced(pool, build.account_id, revision)
  const plan = picturesOfBuild(build.pictures)
  const onSite = new Set(plan?.placed.map((p) => p.mediaId) ?? [])
  const policy = picturePolicy(revision.brief?.picturePolicy)
  // The restaurant's logo goes up first and always: the leftover filter below keeps logos out of the photographs.
  const logoIds = logoIdsOf(revision.brief?.brand)
  const logos = logoIds.map((id) => media.find((m) => m.id === id)).filter((m) => m && !onSite.has(m.id))
  const pictures = [
    ...logos,
    ...leftoverPictures(
      media,
      onSite,
      new Set(acceptedDishPhotos(revision.brief, visionOfPictures(media)).keys())
    )
      .filter((m) => !logoIds.includes(m.id))
      .slice(0, policy.handoffMaxPictures)
  ]
  const videos = media
    .filter((m) => m.kind === 'video')
    .map((m) => ({ id: m.id, source: m.source, sourceUrl: m.source_url }))
  for (const m of pictures) {
    if (placed[m.id]) continue
    const ext = EXT[m.mime]
    if (!ext || !m.object_key) {
      skipped.push({ id: m.id, reason: 'not a stored picture the site accepts' })
      continue
    }
    if ((m.bytes ?? 0) > PICTURE_MAX_BYTES) {
      skipped.push({ id: m.id, reason: 'larger than 8 MB' })
      continue
    }
    const res = await objects.get(m.object_key)
    if (!res?.ok) {
      skipped.push({ id: m.id, reason: 'the file store did not answer' })
      continue
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    // The door names a picture by the sha256 of the bytes it receives, so hash what is sent.
    const sha = createHash('sha256').update(bytes).digest('hex')
    const path = `${folder}/${sha}.${ext}`
    const answer = await readJson(request, `/api/sites/${encodeURIComponent(build.site_key)}/apply`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'media.upload',
        params: { apply_id: `wo-media-${sha.slice(0, 24)}`, path, content_b64: bytes.toString('base64') }
      })
    })
    if (!answer.ok || answer.body?.ok === false) {
      skipped.push({ id: m.id, reason: `the site refused it (${answer.body?.code ?? answer.status})` })
      continue
    }
    // EmDash keeps the picture in its media library: the door answers the item's url, which is what the agent writes.
    placed[m.id] = revision.cms === 'emdash' && typeof answer.body?.url === 'string' ? answer.body.url : path
    await saveHandoff(pool, build.id, { state: 'uploading', placed, at: new Date().toISOString() })
  }
  // Every picture refused: the agent would build a demo without the restaurant's own photos.
  if (pictures.length > 0 && Object.keys(placed).length === 0 && onSite.size === 0) {
    await saveHandoff(pool, build.id, { state: 'failed', placed, skipped, at: new Date().toISOString() })
    return refusal(502, 'HANDOFF_UPLOAD_FAILED', 'No picture reached the site; press again in a minute.', {
      skipped
    })
  }
  const described = Object.fromEntries(
    media.filter((m) => placed[m.id] && pictureDescription(m)).map((m) => [m.id, pictureDescription(m)])
  )
  const credits = Object.fromEntries(
    media.filter((m) => pictureCredit(m)).map((m) => [m.id, pictureCredit(m)])
  )
  // 🔒 A BRIEF BUILD SENDS NO BUILD HAND-OFF PROMPT (#191, #197): the engine wrote the site from the site plan, and the
  // only agent turn it gets is the bounded cleanup turn over the check's findings (`demo-leftover-cleanup.js`). Its
  // hand-off is the report alone (pictures, findings), with no prompt for any chat to send.
  const prompt = isBriefBuild(revision)
    ? null
    : domain.renderAgentPrompt({
        // Render from JSON so old revisions also hand collected reviews to the agent.
        revision: {
          ...revision,
          briefMarkdown:
            revision.brief?.schemaVersion && domain.renderBriefMarkdown
              ? renderBriefWithReviews(domain, briefWithResearch(revision))
              : revision.brief_md
        },
        placed,
        described,
        videos,
        skipped,
        pictures: plan,
        credits,
        // The follower and like counts collected for the place's own social profiles: shown as they are (`socialFiguresOf`).
        socialFigures: socialFiguresOfRevision(domain, revision),
        pagePlan: build.receipt?.pagePlan ?? null,
        // What the demo-leftover check still finds on the served pages (#191): the agent cleans these places only.
        leftovers: build.receipt?.leftovers ?? null,
        // What the site's build already wrote from the restaurant's posts (`sites/brief-engines/wo-content.js`): left as it is.
        written: build.content?.writes ?? {},
        // The sections the site's build left on each page (`wp-wo-fill.js`), with what the template's map asks of each: the
        // agent edits inside them and never takes one off. None recorded (an older build, another CMS): the prompt is as before.
        sections: build.receipt?.sections
          ? {
              pages: build.receipt.sections,
              actions:
                // Through the shared reader: a template whose contract has content-map roles has no hand-written map left.
                sidecarForTemplate({ cms: revision.cms, ...revision.template }).handMap?.sections ?? {}
            }
          : null
      })
  const handoff = {
    state: 'ready',
    placed,
    skipped,
    videos,
    ...(plan ? { placedByBuild: plan.placed.length } : {}),
    // The hand-off report lists the check's findings by kind, page and place (#191).
    ...(build.receipt?.leftovers ? { leftovers: handoffLeftovers(build.receipt.leftovers) } : {}),
    // What the site build said and what the site refused, with its reasons (`engine-report.js`).
    ...(build.receipt?.engine ? { engine: handoffEngine(build.receipt.engine) } : {}),
    // The cleanup turn's account: findings before, after, and what the turn changed (#197).
    ...(build.receipt?.leftoverCleanup
      ? { leftoverCleanup: handoffCleanup(build.receipt.leftoverCleanup) }
      : {}),
    ...(prompt ? { prompt } : {}),
    // The chat the prompt already went into (`route.js`): a later press does not send it twice.
    ...(build.handoff?.promptSent ? { promptSent: build.handoff.promptSent } : {}),
    ...(build.handoff?.sessionId ? { sessionId: build.handoff.sessionId } : {}),
    at: new Date().toISOString()
  }
  await saveHandoff(pool, build.id, handoff)
  return { status: 200, body: { handoff, site: { key: build.site_key } } }
}

// What a restaurant page wants to show, best first. A people/event photo is atmosphere at most; "other" (a wall, a pole)
// only when nothing else is left. The 24 handed over on the stand were picked by size alone, so a beach team-building shot
// and a peeling wall went up while 270 better ones stayed behind (18/10/2026).
const SUBJECT_WORTH = { food: 5, drink: 5, interior: 4, exterior: 4, people: 2, event: 1, other: 0 }
const QUALITY_WORTH = { good: 2, dark: -2, cluttered: -2, blurry: -3 }

// A post page that is a video: a TikTok, an Instagram reel, a Facebook or YouTube video, a YouTube thumbnail.
const VIDEO_PAGE =
  /tiktok\.com\/@[^/]+\/video\/|instagram\.com\/reels?\/|facebook\.com\/(?:[^/]+\/videos\/|watch|reel\/)|youtube\.com\/(?:watch|shorts\/)|youtu\.be\/|ytimg\.com\//i
const VIDEO_FRAME_WORTH = -3

/**
 * 🔒 A VIDEO'S FRAME IS NOT A PHOTOGRAPH (product owner, round 10, 24/10/2026). The social collectors keep a video post's
 * cover as an image row beside the video's own row, both with the post's `sourceUrl` (`domain/social-profile.mjs`,
 * `domain/apify.mjs`); a TikTok cover has no video row but its post page is a video. Such a frame is a still pulled
 * out of motion — soft, mid-gesture, often a face — so it ranks below every real photograph, never out.
 * @param {any[]} media - research media rows (`sourceUrl`, or a stored row's `source_url`)
 * @returns {Set<string>} the ids of the images that are video frames
 */
export function videoFrameIds(media) {
  const page = (m) => m?.sourceUrl ?? m?.source_url ?? null
  const videoPosts = new Set(media.filter((m) => m?.kind === 'video' && page(m)).map(page))
  return new Set(
    media
      .filter(
        (m) =>
          m?.kind === 'image' &&
          (videoPosts.has(page(m)) ||
            VIDEO_PAGE.test(String(page(m) ?? '')) ||
            VIDEO_PAGE.test(String(m.url ?? '')))
      )
      .map((m) => m.id)
  )
}

/**
 * How much the agent would want this photograph on the site, from its vision label; unlabelled sits in the middle.
 * `videoFrame` (`videoFrameIds`) takes it down whatever the label says.
 */
export function pictureWorth(m) {
  const seen = visionLabelOf(m)
  const frame = m.videoFrame === true ? VIDEO_FRAME_WORTH : 0
  if (!seen) return 3 + frame
  return (
    (SUBJECT_WORTH[seen.subject] ?? 1) +
    (QUALITY_WORTH[seen.quality] ?? 0) +
    (seen.heroWorthy ? 1 : 0) +
    frame
  )
}

/**
 * A frame is a poor picture when it is a still from a video, blurry or mainly people.
 * @param {any} m
 */
export function poorPicture(m) {
  const seen = visionLabelOf(m)
  return m.videoFrame === true || seen?.quality === 'blurry' || seen?.subject === 'people'
}

/** At most this many other logo candidates go up beside the chosen one, for the agent to use if the first does not fit. */
const LOGO_ALTERNATES = 2

/**
 * The media ids of the logo to hand over: the chosen one first, then the other candidates a vision model also called a logo.
 * @param {any} brand - the brief's `brand`
 * @returns {string[]}
 */
export function logoIdsOf(brand) {
  const chosen = typeof brand?.logo === 'string' ? brand.logo : null
  const alternates = (brand?.logoResearch?.candidates ?? [])
    .filter((c) => c?.mediaId && c.mediaId !== chosen && c.reading?.isLogo === true)
    .map((c) => c.mediaId)
    .slice(0, LOGO_ALTERNATES)
  return [...(chosen ? [chosen] : []), ...alternates]
}

/** The visible credit a picture's licence requires (`wo_media.labels.credit`, a Google listing photo); null for none. */
export function pictureCredit(m) {
  const credit = m.labels?.credit
  if (!credit?.provider) return null
  const names = (credit.authors ?? []).map((a) => a?.displayName).filter((n) => typeof n === 'string' && n)
  return names.length ? `Photo: ${names.join(', ')} / ${credit.provider}` : `Photo: ${credit.provider}`
}

/** The label the prompt prints beside an uploaded picture, so the agent places it by what it shows, not by its name. */
export function pictureDescription(m) {
  const seen = visionLabelOf(m)
  if (!seen) return null
  return {
    subject: seen.subject ?? null,
    oneLine: seen.oneLine ?? null,
    heroWorthy: seen.heroWorthy === true
  }
}

/** The build's pictures as `acceptedDishPhotos` reads them: a candidate vision labelled since the brief counts. */
const visionOfPictures = (media) =>
  media.map((m) => ({ id: m.id, postId: m.post_id ?? null, vision: visionLabelOf(m) ?? null }))

/**
 * The pictures handed to the agent beside what the build placed: photographs only — never a picture a vision label calls a
 * poster, a menu board or a logo, or one with words on it — the most useful first (`pictureWorth`), then the largest.
 * One no model looked at is kept.
 * @param {any[]} media
 * @param {Set<string>} onSite
 * @param {Set<string>} [first] - accepted dish photos: handed over ahead of the rest, so the picture cap never drops one
 */
export function leftoverPictures(media, onSite, first = new Set()) {
  const frames = videoFrameIds(media)
  return media
    .filter((m) => m.kind === 'image' && !onSite.has(m.id))
    .map((m) => (frames.has(m.id) ? { ...m, videoFrame: true } : m))
    .filter((m) => {
      const seen = visionLabelOf(m)
      return (
        !seen || (!['poster', 'menu-board', 'logo'].includes(seen.subject) && seen.textPresence !== 'present')
      )
    })
    .sort(
      (a, b) =>
        Number(first.has(b.id)) - Number(first.has(a.id)) ||
        pictureWorth(b) - pictureWorth(a) ||
        (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) ||
        String(a.id).localeCompare(String(b.id))
    )
}

/**
 * What the site's build did with the photographs, as the prompt names it; null when it placed none (a build made before
 * pictures were planned, or a site the plan never reached).
 * @param {any} held - `wo_build.pictures`
 */
export function picturesOfBuild(held) {
  if (!held?.plan) return null
  const receipts = held.receipts ?? {}
  const report = held.report ?? {}
  const placed = (held.plan.placements ?? [])
    .filter((p) => ['uploaded', 'applied', 'verified'].includes(receipts[p.groupId]?.state))
    .map((p) => ({
      file: p.groupId,
      mediaId: p.mediaId,
      path: receipts[p.groupId].path,
      origin: p.origin ?? 'real',
      ...(p.dish ? { dish: p.dish } : {})
    }))
  // A place the build drew a picture for (plan §8) is placed, said with its origin; the others hold a placeholder.
  for (const [file, r] of Object.entries(receipts))
    if (['drawn', 'cut-out'].includes(r?.kind) && ['uploaded', 'applied', 'verified'].includes(r.state))
      placed.push({
        file,
        mediaId: (r.referenceIds ?? []).join('+'),
        path: r.path,
        origin: r.origin,
        // The owner is told which pictures to replace with a real photo (#194); the site itself carries no label.
        note: 'Drawn by AI, replace with a real photo.'
      })
  const placeholders = (held.plan.unfilled ?? [])
    .filter((u) => receipts[u.groupId]?.kind !== 'drawn')
    .map((u) => ({ file: u.groupId, routes: u.routes ?? [], reason: u.reason }))
  const seen = new Set()
  const demoLeft = (report.demoLeft ?? []).filter((d) => !seen.has(d.file) && seen.add(d.file))
  // A fill plan's build (`fill-plan.mjs`) says what it decided for every picture slot, each with its reason code.
  const decisions = (held.plan.decisions ?? []).map((d) => ({
    ...d,
    why: FILL_REASONS[d.reason] ?? DRAW_REASONS[d.reason] ?? DECOR_REASONS[d.reason] ?? d.reason
  }))
  return {
    placed,
    placeholders,
    demoLeft,
    demoOutside: report.demoOutside ?? [],
    kept: report.never ?? [],
    ...(decisions.length ? { decisions } : {})
  }
}

/**
 * Run `fn` holding the build's hand-off lock, on its own connection (advisory locks are session-scoped):
 * one hand-off at a time per build, across replicas — the door's press (uploads, a chat, the baseline, the
 * prompt) and the QA sweep's baseline read. A second press while one runs gets `{locked: false}` at once
 * instead of making a second chat and sending the prompt twice. A process that dies releases the lock.
 * @template T @param {import('pg').Pool} pool @param {string} buildId @param {() => Promise<T>} fn
 * @returns {Promise<{locked: false} | {locked: true, value: T}>}
 */
export async function withHandoffLock(pool, buildId, fn) {
  const client = await pool.connect()
  let locked = false
  try {
    const { rows } = await client.query(
      `select pg_try_advisory_lock(hashtext('wo-handoff'), hashtext($1)) as got`,
      [buildId]
    )
    locked = rows[0]?.got === true
    if (!locked) return { locked: false }
    return { locked: true, value: await fn() }
  } finally {
    if (locked)
      await client
        .query(`select pg_advisory_unlock(hashtext('wo-handoff'), hashtext($1))`, [buildId])
        .catch(() => {})
    client.release()
  }
}

/**
 * Queue the hand-off prompt into the build's chat, and record it (`handoff.promptSent`, merged into the
 * hand-off, never a rewrite of it) so no later press sends it again. The QA gate judges only turns on the
 * build's own prompts: the request id is named in `qa.expectedRequestIds` before the chat can answer it, and
 * the first-turn watchdog (`qa.promptedAt`, `lastPrompt`, `wakes`) is armed only once the chat accepted it.
 * Every query goes through `pool`, so a fenced pool (`demo-runner.js`) stops a stale worker before the send.
 * @param {{pool: import('pg').Pool, prompt: Function, site: any, email: string, buildId: string,
 *   sessionId: string, text: string, now?: () => number}} input
 * @returns {Promise<{at: string, sessionId: string, requestId: string} | null>} what was recorded; null when
 *   the chat refused it
 */
export async function promptHandoff({ pool, prompt, site, email, buildId, sessionId, text, now = Date.now }) {
  const active = (
    await pool.query(
      `select b.handoff,b.content,a.status,exists(select 1 from site_turn t where t.site_key=b.site_key
      and t.session_id=$2 and t.opened_at>=a.accepted_at and t.state in ('closed','stale')
      and t.end_reason in ('aborted','blocked','error','interrupted','max-tokens')
      and b.qa->'expectedRequestIds' ? t.rpc_id) as stopped from wo_build b left join lateral
    (select status,accepted_at from wo_demo_action where account_id=b.account_id and revision_id=b.revision_id
      and build_request_id=b.request_id and session_id=$2 order by accepted_at desc,id desc limit 1) a on true
    where b.id=$1`,
      [buildId, sessionId]
    )
  ).rows[0]
  if (active?.content?.agentDemo?.clientChat?.chatMode === 'client-send/1') return null
  if (active?.handoff?.workflow === 'agent-demo/1' && (active.status !== 'queued' || active.stopped))
    return null
  const requestId = `wo-handoff:${buildId}:${sessionId}`
  await pool.query(
    `update wo_build set qa = qa || jsonb_build_object('expectedRequestIds', $2::jsonb)
      where id = $1 and qa->>'state' = 'pending'`,
    [buildId, JSON.stringify([requestId])]
  )
  const accepted = prompt ? await prompt(site, email, sessionId, requestId, text).catch(() => false) : false
  if (accepted !== true) return null
  const promptSent = { at: new Date(now()).toISOString(), sessionId, requestId }
  await pool.query(
    `update wo_build set handoff = handoff || jsonb_build_object('promptSent', $2::jsonb), updated_at = now()
      where id = $1 and handoff is not null`,
    [buildId, JSON.stringify(promptSent)]
  )
  await pool.query(
    `update wo_build set qa = qa || jsonb_build_object('promptedAt', $2::text, 'lastPrompt', $3::text, 'wakes', 0)
      where id = $1 and qa->>'state' = 'pending'`,
    [buildId, promptSent.at, text]
  )
  return promptSent
}

function refusal(status, code, next, extra = {}) {
  return { status, body: { code, next, ...extra } }
}

async function readJson(request, path, init) {
  try {
    const res = await request(path, init)
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { ok: res.ok, status: res.status, body }
  } catch {
    return { ok: false, status: 503, body: null }
  }
}

/** The demo-leftover check as the hand-off report keeps it: whether it passed, counts by kind, and the findings. */
export function handoffLeftovers(leftovers) {
  return {
    version: leftovers.version,
    pass: leftovers.pass === true,
    counts: leftovers.counts ?? {},
    findings: Array.isArray(leftovers.findings) ? leftovers.findings : [],
    unread: Array.isArray(leftovers.unread) ? leftovers.unread : [],
    at: leftovers.at ?? null
  }
}

/** The cleanup turn as the hand-off report keeps it: leftovers before, leftovers after, what the turn changed, how it ended. */
export function handoffCleanup(cleanup) {
  const list = (v) => (Array.isArray(v) ? v : [])
  return {
    version: cleanup.version,
    turn: cleanup.turn ?? null,
    before: { total: cleanup.before?.total ?? 0, counts: cleanup.before?.counts ?? {} },
    after: { total: cleanup.after?.total ?? cleanup.before?.total ?? 0, counts: cleanup.after?.counts ?? {} },
    fixed: list(cleanup.fixed),
    introduced: list(cleanup.introduced),
    left: list(cleanup.after?.findings),
    pagesLost: list(cleanup.pagesLost)
  }
}
