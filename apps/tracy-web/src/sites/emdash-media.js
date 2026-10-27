/**
 * `media.upload` on an EmDash site, for the Apply door (`route.js` `applyDoorOnce`): EmDash has no Tracy
 * component, so the picture goes to the site's host (`POST /_host/emdash-media`), which runs the site's
 * own `media_upload` MCP tool inside its container with the token only that container reads
 * (`apps/tracy-host/src/emdash-media.js`). tracy-web keeps its read-only `content:read` PAT and nothing
 * more (ADR 0020). The door's seat check, toolset gate, lease and `site_write` row are the same as for a
 * Joomla or WordPress upload; this module only turns the call into the host's and its answer back.
 */
import path from 'node:path'

const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
/** The file name the library keeps: the last segment of `path`, as the component would name the file. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(png|jpe?g|webp)$/i
/** Refusals that wrote nothing: a clean no. Anything else may have landed, so it stays `unknown`. */
const CLEAN = new Set(['BAD_PICTURE', 'TOO_LARGE', 'NOT_EMDASH', 'NO_TOKEN', 'TOOL_FAILED'])

/**
 * The params the door hands on, or why not: `{apply_id, path, content_b64}` as on every CMS.
 * @param {Record<string, unknown>} params
 */
export function emdashMediaRequest(params) {
  const filename = typeof params.path === 'string' ? path.posix.basename(params.path) : ''
  if (typeof params.apply_id !== 'string' || params.apply_id.trim() === '') return { error: 'apply_id' }
  if (!FILE_NAME.test(filename) || params.path.includes('..'))
    return { error: 'path: a .png, .jpg or .webp file name' }
  if (typeof params.content_b64 !== 'string' || params.content_b64 === '') return { error: 'content_b64' }
  const ext = /** @type {string} */ (filename.split('.').pop()).toLowerCase()
  return {
    filename,
    contentType: CONTENT_TYPES[ext],
    base64: params.content_b64,
    ...(typeof params.alt === 'string' && params.alt.trim() ? { alt: params.alt.trim() } : {})
  }
}

/**
 * One upload through the host.
 * @param {{ host: { hostCall: Function }, config: any, fetchImpl: typeof fetch, site: { label: string, host: string },
 *   request: Record<string, unknown> }} input
 * @returns {Promise<{ outcome: 'ok' | 'refused' | 'unknown', status: number, body: Record<string, unknown> }>}
 */
export async function emdashMediaUpload({ host, config, fetchImpl, site, request }) {
  const answer = await host.hostCall(
    config,
    site.host,
    '/emdash-media',
    { label: site.label, ...request },
    {
      fetchImpl,
      timeoutMs: 130_000
    }
  )
  const body = answer?.body ?? null
  if (answer?.ok && body?.ok === true && typeof body.id === 'string') {
    const url = typeof body.url === 'string' ? body.url : null
    // `path` is what an agent writes into an entry's picture field, as on Joomla and WordPress.
    return {
      outcome: 'ok',
      status: 200,
      body: { ok: true, id: body.id, url, path: url, deduplicated: body.deduplicated === true }
    }
  }
  if (body && CLEAN.has(body.code))
    return {
      outcome: 'refused',
      status: 200,
      body: {
        ok: false,
        error: body.code,
        message: typeof body.detail === 'string' ? body.detail : body.code
      }
    }
  return {
    outcome: 'unknown',
    status: 502,
    body: {
      code: 'EMDASH_MEDIA_UNREACHABLE',
      ...(body?.code ? { hostCode: body.code } : {}),
      status: answer?.status ?? 0
    }
  }
}
