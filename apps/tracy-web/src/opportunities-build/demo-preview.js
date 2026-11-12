/**
 * A FINISHED DEMO, KEPT AS THE OWNER SAW IT (#537, option A of the Your site row on Details).
 *
 * When a demo build's action completes, two things are kept with the build row:
 * - `built`: when it ended, how many minutes it took and what it cost (`builtFacts`). A step chain build reads its own
 *   measurement (`site_brief.timings.chain`: totalMinutes, totalUsd); any other build counts its minutes from the
 *   press and has no cost figure (null, never a made up one).
 * - a small picture of the demo's home page (`wo_build_preview`): the host's own screenshotter (`POST /_host/capture`,
 *   the browser lives in tracy-host, not in this container) shoots the home page at 1440 by 900; the first screen is
 *   cut out of the full page shot and scaled to a 640 by 400 WebP under 80 KB.
 * - the demo's own mobile PageSpeed (`built.pagespeed`, `demo-pagespeed.js`), measured while the picture is shot.
 *
 * 🔒 NEVER FAILS A BUILD. All are written after the action has completed and outside its lease: a capture that times
 * out, a host without a browser or an image that cannot be read is logged and leaves the build without a picture,
 * which the client draws as the site's name on its brand colour; a PageSpeed run that cannot score the demo keeps why.
 */
import sharp from 'sharp'
import { saveDemoPageSpeed } from './demo-pagespeed.js'

/** The picture's size: twice the 160 by 100 box of the card, for sharp edges on a 2x screen. */
export const PREVIEW_WIDTH = 640
export const PREVIEW_HEIGHT = 400
export const PREVIEW_MAX_BYTES = 80 * 1024
const QUALITIES = [72, 60, 48, 36]
/** The capture's desktop width (`CAPTURE_VIEWPORTS` of tracy-host): the shot taken at it is the one kept. */
const DESKTOP_WIDTH = 1440

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * What a finished build took, from its step chain measurement when it ran one, else from the press to now. Pure.
 * @param {{ chain?: any, acceptedAt?: Date | string | null, at: number }} input
 * @returns {{ at: string, minutes: number | null, usd: number | null }}
 */
export function builtFacts({ chain = null, acceptedAt = null, at }) {
  const chainMinutes = finite(chain?.totalMinutes)
  const stepsUsd = Array.isArray(chain?.steps)
    ? chain.steps.reduce((sum, s) => sum + (finite(s?.usd) ?? 0), 0)
    : null
  const usd = chain ? (finite(chain.totalUsd) ?? stepsUsd) : null
  const pressed = acceptedAt ? new Date(acceptedAt).getTime() : Number.NaN
  const minutes =
    chainMinutes ?? (Number.isFinite(pressed) ? Math.max(0, Math.round((at - pressed) / 60_000)) : null)
  return {
    at: new Date(at).toISOString(),
    minutes: minutes === null ? null : Math.round(minutes * 10) / 10,
    usd: usd === null ? null : Math.round(usd * 100) / 100
  }
}

/**
 * The first screen of a full page shot, scaled to the card's picture: WebP, 640 by 400, the quality lowered until it
 * fits `PREVIEW_MAX_BYTES`.
 * @param {Buffer | Uint8Array} png a shot at the desktop width, any height
 * @returns {Promise<{ bytes: Buffer, contentType: string, width: number, height: number }>}
 */
export async function previewPicture(png) {
  const source = sharp(Buffer.from(png))
  const { width = 0, height = 0 } = await source.metadata()
  if (width <= 0 || height <= 0) throw Object.assign(new Error('Empty shot'), { code: 'PREVIEW_EMPTY' })
  // The first screen at the card's 16 by 10 shape; a shot shorter than that is padded by the resize's cover.
  const top = Math.min(height, Math.round((width * PREVIEW_HEIGHT) / PREVIEW_WIDTH))
  let bytes = Buffer.alloc(0)
  for (const quality of QUALITIES) {
    bytes = await sharp(Buffer.from(png))
      .extract({ left: 0, top: 0, width, height: top })
      .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: 'cover', position: 'top' })
      .webp({ quality })
      .toBuffer()
    if (bytes.length <= PREVIEW_MAX_BYTES) break
  }
  if (bytes.length > PREVIEW_MAX_BYTES)
    throw Object.assign(new Error('Preview too large'), { code: 'PREVIEW_TOO_LARGE' })
  return { bytes, contentType: 'image/webp', width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }
}

/** Keep what a finished build took on its row. */
export async function saveBuiltFacts(pool, buildId, facts) {
  await pool.query('update wo_build set built = $2::jsonb where id = $1', [buildId, JSON.stringify(facts)])
}

/** Keep (or replace) a build's picture. */
export async function saveBuildPreview(pool, buildId, picture, capturedAt) {
  await pool.query(
    `insert into wo_build_preview (build_id, content_type, bytes, width, height, captured_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (build_id) do update set content_type = excluded.content_type, bytes = excluded.bytes,
       width = excluded.width, height = excluded.height, captured_at = excluded.captured_at`,
    [buildId, picture.contentType, picture.bytes, picture.width, picture.height, capturedAt]
  )
}

/**
 * The picture of an opportunity's latest build (the build the Details `demo` describes), or null.
 * @returns {Promise<{ bytes: Buffer, contentType: string, capturedAt: Date } | null>}
 */
export async function latestPreviewOf(pool, accountId, opportunityId) {
  const { rows } = await pool.query(
    `select p.bytes, p.content_type, p.captured_at
       from wo_build_preview p
      where p.build_id = (select b.id from wo_build b join wo_revision r on r.id = b.revision_id
                           join wo_opportunity o on o.id = r.opportunity_id
                          where r.opportunity_id = $2 and o.account_id = $1
                          order by b.created_at desc, b.id desc limit 1)`,
    [accountId, opportunityId]
  )
  const row = rows[0]
  return row ? { bytes: row.bytes, contentType: row.content_type, capturedAt: row.captured_at } : null
}

/**
 * The hook the demo runner calls once a build's action completed (`demo-runner.js`). `capture(site)` asks the site's
 * host for its home page (`app.js`); null leaves the build without a picture. `pageSpeed(site)` measures the demo's
 * address (`demo-pagespeed.js` `createDemoPageSpeed`); null measures nothing. The two run side by side. Never throws.
 * @param {{ pool: any, capture?: ((site: any) => Promise<{ ok: boolean, body?: any }>) | null,
 *   pageSpeed?: ((site: any) => Promise<object>) | null, log?: any }} deps
 */
export function createDemoBuilt({ pool, capture = null, pageSpeed = null, log = console }) {
  const keepPreview = async (build, site, at) => {
    try {
      const answer = await capture(site)
      const shots = Array.isArray(answer?.body?.shots) ? answer.body.shots : []
      const shot = shots.find((s) => s?.ok && s.width === DESKTOP_WIDTH && typeof s.png === 'string')
      if (!answer?.ok || !shot) {
        const why =
          answer?.body?.code ?? shots.find((s) => s?.error)?.error ?? `status ${answer?.status ?? '?'}`
        log.warn?.(`[wo-demo] no preview of ${build.site_key}: ${String(why).slice(0, 200)}`)
        return
      }
      const picture = await previewPicture(Buffer.from(shot.png, 'base64'))
      await saveBuildPreview(pool, build.id, picture, new Date(at))
    } catch (error) {
      log.warn?.(
        `[wo-demo] no preview of ${build.site_key}: ${error?.code ?? error?.message ?? 'error'}`.slice(0, 300)
      )
    }
  }
  const keepPageSpeed = async (build, site) => {
    try {
      const measured = await pageSpeed(site)
      if (measured && typeof measured === 'object') await saveDemoPageSpeed(pool, build.id, measured)
      if (measured?.reason)
        log.info?.(`[wo-demo] no PageSpeed score for ${build.site_key ?? build.id}: ${measured.reason}`)
    } catch (error) {
      log.warn?.(
        `[wo-demo] PageSpeed not kept for ${build.id}: ${error?.code ?? error?.message ?? 'error'}`.slice(0, 300)
      )
    }
  }
  return async function demoBuilt({ build, chain = null, acceptedAt = null, at }) {
    try {
      await saveBuiltFacts(pool, build.id, builtFacts({ chain, acceptedAt, at }))
    } catch (error) {
      log.warn?.(
        `[wo-demo] build facts not kept for ${build.id}: ${error?.code ?? error?.message ?? 'error'}`
      )
    }
    if (!capture && !pageSpeed) return
    let site = null
    try {
      if (build.site_key)
        site = (await pool.query('select * from site where site_key = $1', [build.site_key])).rows[0] ?? null
    } catch (error) {
      log.warn?.(`[wo-demo] site of ${build.site_key} unreadable: ${error?.code ?? error?.message ?? 'error'}`)
      return
    }
    // A completed build without a site has no address: PageSpeed keeps `no_address` rather than nothing.
    await Promise.all([
      capture && site ? keepPreview(build, site, at) : null,
      pageSpeed ? keepPageSpeed(build, site) : null
    ])
  }
}
