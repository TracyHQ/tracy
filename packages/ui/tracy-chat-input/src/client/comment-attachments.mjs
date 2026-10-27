/**
 * Files that go with a comment (stage 6 of "Comment → edit", contract
 * `tasks/evidence/comment-people/attachments-contract.md`). Two roads, by the button pressed:
 *
 *   - Send to Tracy: the files ride WITH the chat message, through dsh's own attachment path (§A) —
 *     `conversation.createDrafts(sessionId, files)` → every non-image draft `ready` in
 *     `conversation.fileUploads` → `sendSession(session, text, draftIds, mode)`. Never a hand-built
 *     `content`: dsh encodes images and cites upload receipts itself.
 *   - Add comment: the files are KEPT with the comment on tracy-web (§C); the Browser tab (the fork)
 *     uploads them, since it owns comment creation. This module only checks them first.
 *
 * `createDrafts` does not check dsh's composer limits, so {@link checkForChat} does, before it is
 * called: 20 MiB per image and 20 images per message (`attachment-local/src/index.ts`), plus the
 * 200 MiB of images per message the same table sets; any other file 20 MiB (one ceiling, easy to say).
 */

export const MiB = 1024 * 1024
/** dsh composer: bytes per image. */
export const IMAGE_MAX_BYTES = 20 * MiB
/** dsh composer: images per message. */
export const MAX_IMAGES = 20
/** dsh composer: bytes of images per message. */
export const IMAGES_MAX_TOTAL = 200 * MiB
/** Any other file (contract §B: one ceiling with images). */
export const FILE_MAX_BYTES = 20 * MiB

/** The MIME types dsh sends inline as images (`ui-conversation` `isImageMediaType`). */
export const isImageType = (/** @type {string} */ type) =>
  type === 'image/png' || type === 'image/jpeg' || type === 'image/webp' || type === 'image/gif'

/** @param {unknown} value @returns {value is File} a browser `File` (or a `Blob` with a name). */
export const isFile = (value) =>
  typeof Blob !== 'undefined' &&
  value instanceof Blob &&
  typeof (/** @type {{ name?: unknown }} */ (value).name) === 'string'

/**
 * Whether files fit one chat message.
 * @param {readonly File[]} files
 * @returns {boolean}
 */
export function checkForChat(files) {
  let images = 0
  let imageBytes = 0
  for (const file of files) {
    if (isImageType(file.type)) {
      images += 1
      imageBytes += file.size
      if (file.size > IMAGE_MAX_BYTES) return false
    } else if (file.size > FILE_MAX_BYTES) return false
  }
  return images <= MAX_IMAGES && imageBytes <= IMAGES_MAX_TOTAL
}

/** The failure of a draft upload (→ `attachment-failed`). */
export class AttachmentFailed extends Error {}

/**
 * @typedef {{ id: string, kind: string }} Draft
 * @typedef {{ status: string }} Upload
 * @typedef {{ getSnapshot(): Record<string, Upload>, subscribe(fn: () => void): () => void }} Uploads
 * @typedef {{ createDrafts(sessionId: string, files: readonly File[]): readonly Draft[],
 *   fileUploads: Uploads, releaseDraftAttachments?(drafts: readonly Draft[]): void }} DraftService
 */

/**
 * dsh drafts for `files`, once every non-image one finished uploading. Resolves with the drafts in
 * order; rejects with {@link AttachmentFailed} — after releasing every draft it made — when one upload
 * fails or its entry disappears.
 * @param {DraftService} conversation
 * @param {string} sessionId
 * @param {readonly File[]} files
 * @returns {Promise<readonly Draft[]>}
 */
export function draftsReady(conversation, sessionId, files) {
  const drafts = conversation.createDrafts(sessionId, files)
  const uploading = drafts.filter((d) => d.kind !== 'image').map((d) => d.id)
  const release = () => {
    try {
      conversation.releaseDraftAttachments?.(drafts)
    } catch {
      // Nothing more to give back.
    }
  }
  return new Promise((resolve, reject) => {
    /** @type {(() => void) | null} */
    let stop = null
    let done = false
    const check = () => {
      if (done) return
      const uploads = conversation.fileUploads.getSnapshot()
      const states = uploading.map((id) => uploads[id]?.status)
      if (states.some((s) => s === 'error' || s === undefined)) {
        done = true
        stop?.()
        release()
        reject(new AttachmentFailed('upload failed'))
      } else if (states.every((s) => s === 'ready')) {
        done = true
        stop?.()
        resolve(drafts)
      }
    }
    stop = conversation.fileUploads.subscribe(check)
    check()
    if (done) stop()
  })
}

/**
 * A readable size: `940 B`, `12 KB`, `1.2 MB` (1000-based, the way file browsers show it).
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1000) return `${Math.max(0, Math.round(bytes || 0))} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`
  const mb = bytes / 1_000_000
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * The list's `attachments` block (the GET door's `{enabled, maxBytes, maxFiles}`, forwarded by the
 * Browser tab), checked. A list without one says nothing about a store, so files stay off.
 * @param {unknown} value
 * @returns {{ enabled: boolean, maxBytes: number, maxFiles: number }}
 */
export function readAttachmentsConfig(value) {
  const v = value !== null && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {}
  return {
    enabled: v.enabled === true,
    maxBytes: typeof v.maxBytes === 'number' && v.maxBytes > 0 ? v.maxBytes : FILE_MAX_BYTES,
    maxFiles:
      typeof v.maxFiles === 'number' && Number.isSafeInteger(v.maxFiles) && v.maxFiles > 0
        ? v.maxFiles
        : MAX_IMAGES
  }
}
