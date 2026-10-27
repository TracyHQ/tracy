/**
 * Pictures for a Model Subscription request: dsh keeps an image as a REFERENCE to its attachment
 * store; tracy-web's wire reads inline bytes only. This module reads each referenced picture once,
 * keeps the request within one image budget, and returns a copy of the messages carrying base64.
 * The model is `llm-deepseek`'s `images.ts` (dsh), with base64 as the only representation.
 */
import {
  IMAGE_OFFLOAD_REQUIRED_CODE,
  LlmError,
  contentHasImage,
  offloadedImageText,
  projectOffloadedImages,
  readRequestImages,
  requestImageHandleText,
  requiredImageOffload
} from '@deepseek-ai/dsh-llm'

const MiB = 1024 * 1024

/** @typedef {import('@deepseek-ai/dsh-llm').ImageBlock['attachment']} ImageRef */
/** @typedef {NonNullable<ReturnType<import('@deepseek-ai/dsh-llm').RequestImages['versions']['get']>>} RequestImage */
/**
 * The part of dsh's attachment store (`@deepseek-ai/dsh-attachment` `AttachmentStore`) read here.
 * @typedef {{ readImageRequest(ref: ImageRef, target: { width: number, height: number, maxBytes: number }, signal?: AbortSignal): Promise<RequestImage> }} PictureStore
 */

/**
 * Long edges a picture is asked at, largest first. The store's `maxBytes` is a compression TARGET:
 * when no quality fits it returns its smallest output, so a picture still above
 * {@link IMAGE_MAX_BYTES} is asked again one step smaller. The last step is kept whatever its size;
 * the request budget below then decides.
 */
export const IMAGE_EDGES = Object.freeze([2048, 1536, 1024])

/** Encoded bytes of one picture, before base64. */
export const IMAGE_MAX_BYTES = MiB

/**
 * One request's pictures: `maxBytes` counts base64 as SENT (`requiredImageOffload` turns each
 * picture's bytes into `4 * ceil(bytes / 3)`), about 6 MiB of picture bytes; `maxImages` counts
 * every occurrence in the whole request, user and tool messages alike. tracy-web's own fence
 * (12 MiB of base64, 16 MiB of body) stays above it.
 * @type {Readonly<import('@deepseek-ai/dsh-llm').LlmImageRequestBudget>}
 */
export const REQUEST_IMAGE_BUDGET = Object.freeze({
  representation: 'base64',
  maxBytes: 8 * MiB,
  maxImages: 20
})

/**
 * The request version of one picture, stepped down until it fits {@link IMAGE_MAX_BYTES}.
 * @param {PictureStore} attachments
 * @param {ImageRef} ref
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<RequestImage>}
 */
async function readFitted(attachments, ref, signal) {
  /** @type {RequestImage | undefined} */
  let version
  for (const edge of IMAGE_EDGES) {
    version = await attachments.readImageRequest(
      ref,
      { width: edge, height: edge, maxBytes: IMAGE_MAX_BYTES },
      signal
    )
    if (version.bytes <= IMAGE_MAX_BYTES) break
  }
  return /** @type {RequestImage} */ (version)
}

/**
 * The messages to send, every retained picture inline. Offloaded pictures become dsh's placeholder
 * and are never read; a picture lost from earlier history becomes dsh's note (`readRequestImages`).
 * The input is never mutated: the caller keeps the reference form for a fallback.
 * @param {readonly any[]} messages - the request history dsh assembled.
 * @param {PictureStore | undefined} attachments
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<readonly any[]>}
 * @throws {LlmError} `IMAGE_OFFLOAD_REQUIRED` with `offloadImages` when the pictures exceed
 *   {@link REQUEST_IMAGE_BUDGET}, so dsh's `compaction-image-offload` offloads the oldest and retries;
 *   `ATTACHMENT_MISSING` for a lost picture of the current turn; `UNSUPPORTED_CONTENT` when no store
 *   is mounted or a picture sits outside a user or tool message.
 */
export async function inlineRequestImages(messages, attachments, signal) {
  if (!messages.some((m) => Array.isArray(m?.content) && contentHasImage(m.content))) return messages
  const projected = projectOffloadedImages(messages, (ref) => offloadedImageText(ref))
  if (!projected.some((m) => contentHasImage(m.content))) return projected
  if (projected.some((m) => m.role !== 'user' && m.role !== 'tool' && contentHasImage(m.content))) {
    throw new LlmError(
      'Model Subscription routes take pictures only in user messages and tool results.',
      'UNSUPPORTED_CONTENT'
    )
  }
  if (!attachments) {
    throw new LlmError(
      'No attachment service is mounted to read the pictures of this request.',
      'UNSUPPORTED_CONTENT'
    )
  }
  const read = await readRequestImages(projected, (ref) => readFitted(attachments, ref, signal))
  const versionOf = (/** @type {import('@deepseek-ai/dsh-llm').ImageBlock} */ block) =>
    /** @type {RequestImage} */ (read.versions.get(block.attachment.attachmentId))
  const offloadImages = requiredImageOffload(
    read.messages,
    REQUEST_IMAGE_BUDGET,
    (block) => versionOf(block).bytes
  )
  if (offloadImages > 0) {
    throw new LlmError(
      `Model Subscription request pictures exceed the route budget; ${offloadImages} more oldest occurrence(s) must be offloaded.`,
      IMAGE_OFFLOAD_REQUIRED_CODE,
      { offloadImages }
    )
  }
  /** @type {Map<string, string>} one encoding per picture, however often it occurs */
  const encoded = new Map()
  return read.messages.map((message) => {
    if (!contentHasImage(message.content)) return message
    return {
      ...message,
      content: message.content.flatMap((/** @type {any} */ block) => {
        if (block.type !== 'image') return [block]
        const version = versionOf(block)
        const id = block.attachment.attachmentId
        if (!encoded.has(id)) encoded.set(id, Buffer.from(version.data).toString('base64'))
        return [
          { type: 'text', text: requestImageHandleText(block.attachment, version) },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: version.mediaType,
              data: /** @type {string} */ (encoded.get(id))
            }
          }
        ]
      })
    }
  })
}
