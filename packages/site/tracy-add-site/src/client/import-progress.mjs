/**
 * What the "Packing up your files" row says while the webroot travels (#1567), with no React and no
 * real clock so `node --test` can drive it.
 *
 * Counting files alone made a slow but healthy read look stuck: on QA's 21/10/2026 import the count
 * sat between 900 and 1,300 for half an hour while large files went out part by part. So the row
 * says the megabytes sent, of the site's total when its engine could tell it (`site.fingerprint`,
 * an estimate: "about"), a rough time left from the run's own rate, and how long the part on its
 * way has been going — a figure that moves on every poll even while one part takes minutes.
 */

const MB = 1024 * 1024

/**
 * @typedef {{ key: string, params: Record<string, number | string> }} Line
 * @typedef {{ sent?: Line, left?: Line, part?: Line }} FilesProgressText
 */

/** Whole megabytes, at least one once anything was sent. */
const megabytes = (/** @type {number} */ bytes) => (bytes > 0 ? Math.max(1, Math.round(bytes / MB)) : 0)

/** `m:ss`, the same in every language. */
const clock = (/** @type {number} */ ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * @param {{ bytes?: number, parts?: number, totalBytes?: number, rate?: number, partStartedAt?: number } | undefined} detail
 * @param {number | undefined} now The host's clock when it answered (`status`'s `now`).
 * @returns {FilesProgressText} The keys of `strings.ts` to show, with their values; a part left out
 *   has nothing to say.
 */
export function filesProgress(detail, now) {
  if (!detail) return {}
  const bytes = typeof detail.bytes === 'number' && detail.bytes > 0 ? detail.bytes : 0
  const total = typeof detail.totalBytes === 'number' && detail.totalBytes > 0 ? detail.totalBytes : 0
  /** @type {FilesProgressText} */
  const out = {}
  // A total under what was already sent is the engine counting differently: not shown as "of".
  if (bytes > 0)
    out.sent =
      total >= bytes
        ? { key: 'import_detail_sent_of', params: { sent: megabytes(bytes), total: megabytes(total) } }
        : { key: 'import_detail_sent', params: { sent: megabytes(bytes) } }
  if (total > bytes && typeof detail.rate === 'number' && detail.rate > 0)
    out.left = {
      key: 'import_detail_left',
      params: { minutes: Math.max(1, Math.ceil((total - bytes) / detail.rate / 60)) }
    }
  if (typeof detail.partStartedAt === 'number' && typeof now === 'number')
    out.part = {
      key: 'import_detail_part',
      params: { part: (detail.parts ?? 0) + 1, elapsed: clock(now - detail.partStartedAt) }
    }
  return out
}
