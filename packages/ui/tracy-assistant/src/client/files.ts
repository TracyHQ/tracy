/**
 * Files a person attaches in the creation workspace's chat box (David, 26/10/2026). Each one is
 * uploaded the moment it is picked, dropped or pasted, to tracy-web's `POST /api/assistant/attachments`,
 * which keeps it in the artifact store with the account (`apps/tracy-web/src/assistant/files.js`); the
 * question then names the stored ids. The same rules run here first, so a refusal is said at once with
 * the file's own name, and the server stays the judge.
 *
 * Pictures the person sent are also published on the page (`publishChatFiles`) for Add site, which
 * offers one as the site's logo (`tracy-add-site`, `chat-logo.mjs`).
 */
import type { AssistantKey } from './strings'

/** Mirrors `MAX_FILE_BYTES` in `apps/tracy-web/src/assistant/files.js`. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
/** Mirrors `MAX_FILES_PER_QUESTION` there. */
export const MAX_FILES = 10
/** Mirrors the extensions of `KINDS` there. */
export const ACCEPTED = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'docx', 'xlsx', 'txt', 'csv'] as const
/** The file picker's `accept`: the same list, as extensions. */
export const ACCEPT_ATTR = ACCEPTED.map((ext) => `.${ext}`).join(',')

/** A stored file as the server describes it. */
export interface HelpFile {
  id: string
  name: string
  type: string
  bytes: number
  /** The owner-only door that serves it. */
  url: string
}

/** A file in the chat box: on its way, stored, or refused. */
export interface DraftFile {
  /** Local id of the chip, before the server gives one. */
  key: string
  name: string
  bytes: number
  status: 'uploading' | 'done' | 'failed'
  file?: HelpFile
  /** Why it was refused, as a string key with the file's name as `{name}`. */
  problem?: AssistantKey
}

/** The extension of a name, lower case, or ''. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Why the chat box refuses this file before sending it, or null when it may go. */
export function problemOf(file: { name: string; size: number }): AssistantKey | null {
  if (!(ACCEPTED as readonly string[]).includes(extensionOf(file.name))) return 'file.type'
  if (file.size > MAX_FILE_BYTES) return 'file.tooLarge'
  if (file.size === 0) return 'file.failed'
  return null
}

/** What the person reads for a refusal the door answered, by its status and code. */
export function problemOfAnswer(status: number, code: unknown): AssistantKey {
  if (status === 413 || code === 'FILE_TOO_LARGE') return 'file.tooLarge'
  if (status === 415 || code === 'FILE_TYPE') return 'file.type'
  if (status === 429) return 'file.limit'
  if (status === 401) return 'error.signin'
  if (code === 'FILE_STORE_UNAVAILABLE') return 'file.storeOff'
  return 'file.failed'
}

/**
 * Send one file to the door, in the conversation of `sessionId`.
 * @returns the stored file, or the key of what went wrong
 */
export async function uploadFile(
  file: Blob & { name: string },
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; file: HelpFile } | { ok: false; problem: AssistantKey }> {
  const body = new FormData()
  body.append('file', file, file.name)
  body.append('session', sessionId)
  let res: Response
  try {
    res = await fetchImpl('/api/assistant/attachments', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      body
    })
  } catch {
    return { ok: false, problem: 'file.failed' }
  }
  const answer = (await res.json().catch(() => null)) as { code?: unknown; file?: HelpFile } | null
  if (res.status === 201 && answer?.file && typeof answer.file.id === 'string')
    return { ok: true, file: answer.file }
  return { ok: false, problem: problemOfAnswer(res.status, answer?.code) }
}

/** The page global and event Add site reads (`tracy-add-site`'s `chat-logo.mjs`): version 1. */
export const CHAT_FILES_KEY = '__TRACY_HELP_FILES__'
export const CHAT_FILES_EVENT = 'tracy:help-files-changed'

/**
 * Publish the files the person sent in this page's chat, newest last, so a step opened from the page
 * (Add site's logo question) can offer one. Only the files of questions that were sent are listed.
 */
export function publishChatFiles(files: readonly HelpFile[]): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  const before = (w[CHAT_FILES_KEY] as { files?: readonly HelpFile[] } | undefined)?.files ?? []
  if (before.length === files.length && before.every((f, i) => f.id === files[i]?.id)) return
  w[CHAT_FILES_KEY] = { version: 1, files: [...files] }
  // The page's own event class: a test page (linkedom) refuses an event made by another realm.
  const Event_ = (w.CustomEvent as typeof CustomEvent | undefined) ?? CustomEvent
  window.dispatchEvent(new Event_(CHAT_FILES_EVENT))
}

/** "184 KB", "9.4 MB": a size as a chip shows it. */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Whether a stored file is a picture the browser shows. */
export const isPicture = (type: string): boolean => /^image\/(png|jpeg|gif|webp)$/.test(type)
