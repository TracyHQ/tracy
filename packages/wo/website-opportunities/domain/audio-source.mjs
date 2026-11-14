// Audio is a source address, never a picture, navigation target or generated customer fact.
/** @param {{ type?: string, role?: string } | null | undefined} slot */
export const isAudioSlot = (slot) => slot?.type === 'url' && slot?.role === 'business.audio'

/**
 * Syntax only: local file existence/type and remote playback still belong to the Claude Cowork plugin and the readback.
 * @param {unknown} value
 * @returns {string | null}
 */
export function audioSourceProblem(value) {
  if (typeof value !== 'string' || !value || /[\s\\<>"`{}|^#]/u.test(value)) return 'unsupported audio source'
  if (/%(?![0-9a-f]{2})/i.test(value)) return 'invalid audio source encoding'
  if (value.startsWith('//')) return 'unsafe audio source path'
  const remote = /^https:\/\//i.test(value)
  const rawPath = (remote ? value.replace(/^https:\/\/[^/?#]+/i, '') : value).split('?')[0]
  let path
  try {
    path = decodeURIComponent(rawPath)
  } catch {
    return 'invalid audio source encoding'
  }
  if (
    !/\.mp3$/i.test(rawPath) ||
    /%(?:2f|5c|25)/i.test(rawPath) ||
    /[\\?#]/.test(path) ||
    [...path].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) ||
    path
      .replace(/^\/+/, '')
      .split('/')
      .some((p) => !p || p === '.' || p === '..')
  )
    return 'unsafe audio source path'
  if (remote) {
    try {
      const u = new URL(value)
      return u.hostname && !u.username && !u.password ? null : 'expected an HTTPS MP3 source'
    } catch {
      return 'invalid HTTPS audio source'
    }
  }
  return /^(?:\/(?:[a-zA-Z0-9_-]+\/)*)?(?:images|media)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.mp3$/i.test(
    path
  )
    ? null
    : 'expected an existing MP3 in the site media library'
}

/**
 * Match the Claude Cowork plugin's installation-root resolution, then the browser's URL serialization; never rebase an absolute URL.
 * @param {unknown} value
 * @param {string | undefined} siteUrl
 * @returns {string | null}
 */
export function audioSourceIdentity(value, siteUrl) {
  if (typeof value !== 'string' || !value || value.startsWith('//')) return null
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).href
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || !siteUrl) return null
    const site = new URL(siteUrl)
    const root = site.pathname.replace(/\/+$/, '')
    const rooted = root && value.startsWith(`${root}/`) ? value : `${root}/${value.replace(/^\/+/, '')}`
    return new URL(rooted, site.origin).href
  } catch {
    return null
  }
}

/**
 * The plan explicitly assigns one supplied audio fact to this source slot; no automatic reuse by row or URL.
 * @param {any} link
 * @param {string} value
 * @param {Iterable<any>} facts
 * @returns {string | null}
 */
export function audioDecisionProblem(link, value, facts) {
  if (link?.action !== 'media-source' || link.mediaKind !== 'audio' || !link.sourceSlot)
    return 'the kit has no exact audio source binding'
  const problem = audioSourceProblem(value)
  if (problem) return problem
  const matches = [...facts].filter(
    (f) =>
      f?.field === 'audio' &&
      f.onSite !== false &&
      (f.source === 'stated' ||
        (Array.isArray(f.evidence) && f.evidence.some((/** @type {any} */ e) => e?.source === 'stated'))) &&
      (typeof f.value === 'string' ? f.value : f.value?.url) === value
  )
  return matches.length === 1 ? null : 'audio source needs one explicit customer audio fact and its evidence'
}
