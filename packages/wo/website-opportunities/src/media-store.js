/**
 * The media row of a collected picture or video, downloaded, sniffed, measured and stored by sha256 (moved unchanged
 * out of the research executor's `createExecutor`, `executor.js`, so the build chat's research before a site exists
 * stores its pictures by the same rules). A download that fails, a type that is not media, a picture that cannot be
 * read or a store that refuses becomes a `reference` record with its reason, never a stored one.
 *
 * Admission (`media-admission.js`): five image slots, a video takes them all, held until the object is stored.
 * Limits: 25 MiB a picture, 200 MiB a video, 60 s a download, captions and alt text cut at 2000 characters.
 */
import { videoSize } from '../domain/video-size.mjs'
import { withMediaAdmission } from './media-admission.js'

export const IMAGE_MAX_BYTES = 25 * 1024 * 1024
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024
/** The most of a caption or alt text kept with a picture: the picture planner reads its opening. */
const TEXT_MAX = 2000
export const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}

/**
 * @param {{objects: {put: Function, sharedKey?: Function} | null, imageInfo: (bytes: Uint8Array) => Promise<any>,
 *   domainDeps: object}} deps `domainDeps`: the `{fetch, resolve, now}` downloads use (the crawl's guarded fetch)
 * @returns {{mediaRecord: (domain: any, owner: {fields: object, keyPrefix: string, shared?: boolean}, m: any) =>
 *   Promise<any>, storedRecord: (domain: any, owner: object, base: object, bytes: Uint8Array, reference: Function) =>
 *   Promise<any>}}
 */
export function createMediaStore({ objects, imageInfo, domainDeps }) {
  /** The media row of one collected item (`owner`: `opportunityOwner`, or a place's in `place-executor.js`). */
  function mediaRecord(domain, owner, m) {
    return withMediaAdmission(m.kind === 'video' ? 'video' : 'image', () =>
      admittedMediaRecord(domain, owner, m)
    )
  }

  async function admittedMediaRecord(domain, owner, m) {
    const declared = m.kind === 'video' ? 'video' : 'image'
    const base = {
      ...owner.fields,
      kind: declared,
      category: domain.classifyMedia({ caption: m.caption, alt: m.alt, url: m.url }),
      caption: typeof m.caption === 'string' ? m.caption.slice(0, TEXT_MAX) : null,
      alt: typeof m.alt === 'string' ? m.alt.slice(0, TEXT_MAX) : null,
      source: m.source,
      sourceUrl: m.url,
      postId: typeof m.postId === 'string' ? m.postId : null,
      postedAt:
        m.postedAt && !Number.isNaN(Date.parse(m.postedAt)) ? new Date(m.postedAt).toISOString() : null
    }
    const reference = (reason) => ({
      ...base,
      status: 'reference',
      reason,
      sha256: domain.sha256Hex(new TextEncoder().encode(`ref:${m.url}`))
    })
    if (!objects) return reference('store_unavailable')
    // A connector may name a larger copy first (Facebook's photo page, an image host's original) and keep
    // the copy as seen in `fallbackUrl`: when the large one does not answer, is too large or is not a
    // readable picture, the small one is still the restaurant's photo. `sourceUrl` stays the item's
    // address (what `knownMediaUrls` and a supersede match); `labels.fetchedFrom` names the copy stored.
    const candidates = [
      m.url,
      ...(typeof m.fallbackUrl === 'string' && m.fallbackUrl !== m.url ? [m.fallbackUrl] : [])
    ]
    let failure = 'download_failed'
    for (const url of candidates) {
      let got
      try {
        got = await domain.fetchLimited(url, {
          ...domainDeps,
          maxBytes: declared === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
          timeoutMs: 60_000
        })
      } catch (error) {
        if (error?.code === 'URL_BLOCKED') return reference('url_blocked')
        continue
      }
      if (!got || got.status >= 400 || got.truncated) {
        failure = got?.truncated ? 'too_large' : 'download_failed'
        continue
      }
      const record = await storedRecord(domain, owner, base, got.bytes, reference)
      if (record.status === 'stored') {
        if (url !== m.url) record.labels = { ...record.labels, fetchedFrom: url }
        return record
      }
      if (!['not_media', 'image_unreadable'].includes(record.reason)) return record
      failure = record.reason
    }
    return reference(failure)
  }

  /** The `wo_media` row of downloaded bytes: sniffed, measured, stored by sha256; `reference(reason)` otherwise. */
  async function storedRecord(domain, owner, base, bytes, reference) {
    const mime = domain.sniffMime(bytes)
    const kind = mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : null
    if (!kind || !EXT[mime]) return reference('not_media')
    let info = { width: null, height: null, palette: null, dhash: null, features: null }
    if (kind === 'image') {
      try {
        info = await imageInfo(bytes)
      } catch {
        return reference('image_unreadable')
      }
    } else {
      // A video's size from its own header, so its brief asset has an orientation and a grade (null when unreadable).
      info = { ...info, ...videoSize(bytes) }
    }
    const sha256 = domain.sha256Hex(bytes)
    // A place's picture goes to the shared bucket when this deployment has one (`opportunities/place-media-store.js`).
    const objectKey =
      (owner.shared && objects?.sharedKey?.({ ...base, sha256 }, EXT[mime])) ||
      `${owner.keyPrefix}/${sha256}.${EXT[mime]}`
    if (!objects || !(await objects.put(objectKey, bytes, mime))) return reference('store_failed')
    return {
      ...base,
      kind,
      status: 'stored',
      sha256,
      objectKey,
      mime,
      bytes: bytes.length,
      width: info.width,
      height: info.height,
      palette: info.palette,
      dhash: info.dhash ?? null,
      labels: info.features ? { features: info.features } : null
    }
  }

  return { mediaRecord, storedRecord }
}
