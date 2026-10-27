/**
 * The logo the customer already sent in the creation workspace's chat (David, 26/10/2026). `@tracy/dsh-assistant`
 * publishes the files of the page's Help questions on `window.__TRACY_HELP_FILES__` (version 1) and says so with the
 * `tracy:help-files-changed` event (`packages/ui/tracy-assistant/src/client/files.ts`). The logo question reads them:
 *
 * - only PNG pictures can be a logo (the brand door's rule, `brand-picture.mjs`);
 * - each PNG is offered under the tiles for the customer to choose explicitly.
 *
 * Either way the file goes through the tile's own upload (`useBrandUpload`), so every size rule, refusal and blend
 * warning is the same as for a file picked from the computer.
 *
 * Plain JavaScript so `node --test` runs it without a build step (same as `brand-picture.mjs`).
 */

/** The page global and event (`files.ts` of `@tracy/dsh-assistant`). */
export const CHAT_FILES_KEY = '__TRACY_HELP_FILES__'
export const CHAT_FILES_EVENT = 'tracy:help-files-changed'

/**
 * @typedef {{ id: string, name: string, type: string, bytes: number, url: string }} ChatFile
 */

/**
 * The files the page's chat published, or none.
 * @param {Record<string, unknown> | undefined} [scope] - the window (a test passes its own)
 * @returns {ChatFile[]}
 */
export function readChatFiles(
  scope = typeof window === 'undefined'
    ? undefined
    : /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window))
) {
  const entry = /** @type {{ version?: unknown, files?: unknown } | undefined} */ (scope?.[CHAT_FILES_KEY])
  if (!entry || entry.version !== 1 || !Array.isArray(entry.files)) return []
  return entry.files.filter(
    (f) =>
      f &&
      typeof f.id === 'string' &&
      typeof f.name === 'string' &&
      typeof f.type === 'string' &&
      typeof f.url === 'string' &&
      f.url.startsWith('/api/assistant/attachments/')
  )
}

/** Pictures the chat sent that are not PNG: said once, since they cannot be a logo. */
export const otherPictures = (/** @type {ChatFile[]} */ files) =>
  files.filter((f) => /^image\/(jpeg|gif|webp)$/.test(f.type))

/** The PNG pictures: the ones that can be a logo, newest last. */
export const logoCandidates = (/** @type {ChatFile[]} */ files) => files.filter((f) => f.type === 'image/png')

/**
 * The bytes of a chat file as a `File` the tile's upload takes, or null when the door did not give them.
 * @param {ChatFile} file
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchChatFile(file, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(file.url, { credentials: 'same-origin' })
    if (!res.ok) return null
    const blob = await res.blob()
    return new File([blob], file.name, { type: file.type })
  } catch {
    return null
  }
}
