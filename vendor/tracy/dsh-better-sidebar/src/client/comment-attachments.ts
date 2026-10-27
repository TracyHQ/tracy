/**
 * Files on a comment box — the pure half (Tracy, 29/09/2026; TCH stage 6 contract
 * `tasks/evidence/comment-people/attachments-contract.md` §A–§D).
 *
 * A box (the new-place popover, the edit popover, a thread card's reply box) holds a DRAFT: files the
 * person picked, dropped or pasted, and — in the edit popover — the files the comment already has.
 * "Add comment" / "Reply" / "Save" upload each new file (`POST …/comments/attachments`) and name the
 * ids on the comment; "Send to Tracy" hands the `File`s to the chat (`tracy:comment-send` v4).
 * The limits are checked HERE, before anything is uploaded or sent, so the box can say why in plain words.
 */
import { t, type CopyKey } from './locales.ts'

/** One file kept with a comment, as the doors return it (§D). `url` is same-origin, no public link. */
export interface CommentAttachment {
  id: string
  name: string
  /** Bytes. */
  size: number
  type: string
  url: string
}

/** What the comment list says about storing files (§C `attachments` at the list's root). */
export interface AttachmentLimits {
  /** The server has a store: Add comment / Reply may carry files. */
  enabled: boolean
  maxBytes: number
  maxFiles: number
}

/** 20 MiB a file (= dsh's image cap, §A) and 20 files (= dsh's images per message). */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
export const ATTACHMENT_MAX_FILES = 20

/** No list answered yet, or a server without the field: no store, the attach button is hidden. */
export const NO_ATTACHMENTS: AttachmentLimits = { enabled: false, maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: ATTACHMENT_MAX_FILES }

/** The list's `attachments` field, trusting nothing; absent or malformed = no store. */
export function readAttachmentLimits(raw: unknown): AttachmentLimits {
  if (raw === null || typeof raw !== 'object') return NO_ATTACHMENTS
  const r = raw as { enabled?: unknown; maxBytes?: unknown; maxFiles?: unknown }
  const positive = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback)
  return { enabled: r.enabled === true, maxBytes: positive(r.maxBytes, ATTACHMENT_MAX_BYTES), maxFiles: positive(r.maxFiles, ATTACHMENT_MAX_FILES) }
}

/** One stored file of a row, or null when it is not one. */
export function readAttachment(raw: unknown): CommentAttachment | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '' || typeof r.name !== 'string' || typeof r.url !== 'string' || r.url === '') return null
  if (typeof r.size !== 'number' || !Number.isFinite(r.size) || r.size < 0) return null
  return { id: r.id, name: r.name, size: r.size, type: typeof r.type === 'string' && r.type !== '' ? r.type : 'application/octet-stream', url: r.url }
}

/** A row's `attachments` (always an array on the doors; anything else reads as none). */
export function readAttachments(raw: unknown): CommentAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((a) => {
    const one = readAttachment(a)
    return one === null ? [] : [one]
  })
}

/** The four image types dsh sends inline and the doors serve inline (§A, §D). */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function isImageType(type: string): boolean {
  return IMAGE_TYPES.includes(type.toLowerCase())
}

/**
 * A size people read: "820 B", "14 KB", "1.2 MB" — 1000-based, one decimal under 10, the way
 * tracy-chat-input's `formatSize` writes it, so one file reads the same in both places.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${String(Math.max(0, Math.round(bytes)))} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  const shown = value < 10 ? (Math.round(value * 10) / 10).toString() : String(Math.round(value))
  return `${shown} ${units[unit]!}`
}

/**
 * A size LIMIT people read (Akemi 01/10/2026: the drop zone said "up to 21 MB" for the 20 MiB cap).
 * A limit set as a whole number of KiB, MiB or GiB reads as that round number ("20 MB" for 20 MiB),
 * the way tracy-chat-input names the same cap (`Math.round(limit / MiB)` MB); any other limit reads as
 * {@link formatBytes}. Only what is SHOWN changes: the check still compares the exact bytes, and a
 * file's own size stays 1000-based ({@link formatBytes}), as the chat composer writes it.
 */
export function formatLimit(bytes: number): string {
  const units = ['GB', 'MB', 'KB'] as const
  for (const [i, unit] of units.entries()) {
    const step = 1024 ** (units.length - i)
    if (bytes >= step && bytes % step === 0) return `${String(bytes / step)} ${unit}`
  }
  return formatBytes(bytes)
}

/** One entry of a box's draft: a file already kept with the comment, or a new one picked here. */
export type DraftAttachment =
  | { kind: 'stored'; key: string; attachment: CommentAttachment }
  | { kind: 'file'; key: string; file: File }

/** Why files were not added to a box. */
export type DraftRefusal =
  | { code: 'too-large'; name: string; limit: number }
  | { code: 'too-many'; limit: number }

let draftSeq = 0

/** A draft holding a comment's stored files (the edit popover). */
export function draftOfStored(list: readonly CommentAttachment[]): DraftAttachment[] {
  return list.map(attachment => ({ kind: 'stored', key: `s:${attachment.id}`, attachment }))
}

/**
 * A file a box did not take, shown as a red chip with a short reason until its ✕ (Akemi 01/10, edit-mode
 * review "attachments"): over the size cap (`too-large`), or past the file cap (`too-many`).
 */
export interface RefusedFile {
  key: string
  name: string
  /** Bytes. */
  size: number
  type: string
  code: DraftRefusal['code']
  /** The cap it went over: bytes for `too-large`, files for `too-many`. */
  limit: number
}

/**
 * Add picked files to a draft, within the limits. A file over `maxBytes` is refused by name and the
 * others still go in; files past `maxFiles` are refused together. `refused` is the sentence's case (the
 * first file over the size cap, or the file cap when it was hit); `refusedFiles` names every file left out.
 */
export function addToDraft(draft: readonly DraftAttachment[], files: readonly File[], limits: Pick<AttachmentLimits, 'maxBytes' | 'maxFiles'>): { draft: DraftAttachment[]; refused: DraftRefusal | null; refusedFiles: RefusedFile[] } {
  const next = draft.slice()
  let refused: DraftRefusal | null = null
  const refusedFiles: RefusedFile[] = []
  const leftOut = (file: File, code: DraftRefusal['code'], limit: number): void => {
    draftSeq += 1
    refusedFiles.push({ key: `r:${String(draftSeq)}`, name: file.name, size: file.size, type: file.type, code, limit })
  }
  let full = false
  for (const file of files) {
    if (full) {
      leftOut(file, 'too-many', limits.maxFiles)
      continue
    }
    if (file.size > limits.maxBytes) {
      refused ??= { code: 'too-large', name: file.name, limit: limits.maxBytes }
      leftOut(file, 'too-large', limits.maxBytes)
      continue
    }
    if (next.length >= limits.maxFiles) {
      refused = { code: 'too-many', limit: limits.maxFiles }
      full = true
      leftOut(file, 'too-many', limits.maxFiles)
      continue
    }
    draftSeq += 1
    next.push({ kind: 'file', key: `f:${String(draftSeq)}`, file })
  }
  return { draft: next, refused, refusedFiles }
}

/**
 * The caps a box applies: what the server keeps (§C) and what the chat takes (§A), the smaller of the
 * two. One function for the check and for the words the drop zone says, so they never disagree.
 */
export function boxLimits(room: Pick<AttachmentLimits, 'maxBytes' | 'maxFiles'>): { maxBytes: number; maxFiles: number } {
  return { maxBytes: Math.min(room.maxBytes, ATTACHMENT_MAX_BYTES), maxFiles: Math.min(room.maxFiles, ATTACHMENT_MAX_FILES) }
}

/**
 * The short type badge a file chip draws in its 22 px square: the extension, at most four letters
 * (tracy-chat-input's `fileBadge`, copied: a Tracy plugin never imports another's client).
 * @returns e.g. `PDF`, `ZIP`; `FILE` when the name carries no extension.
 */
export function fileBadge(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'FILE'
  const ext = name.slice(dot + 1).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()
  return ext === '' ? 'FILE' : ext
}

export const draftFiles = (draft: readonly DraftAttachment[]): File[] => draft.flatMap(d => (d.kind === 'file' ? [d.file] : []))
export const draftStored = (draft: readonly DraftAttachment[]): CommentAttachment[] => draft.flatMap(d => (d.kind === 'stored' ? [d.attachment] : []))

/** Whether the draft keeps exactly the stored files `list` (in order) and adds none. */
export function draftKeeps(draft: readonly DraftAttachment[], list: readonly CommentAttachment[]): boolean {
  const stored = draftStored(draft)
  return draftFiles(draft).length === 0 && stored.length === list.length && stored.every((a, i) => a.id === list[i]!.id)
}

/** Why a file of a send could not go along, and the copy key that says so. */
const NOT_SENT: Record<'too-large' | 'too-many' | 'unreadable', CopyKey> = {
  'too-large': 'commentNotSentTooLarge',
  'too-many': 'commentNotSentTooMany',
  unreadable: 'commentNotSentUnreadable',
}

/**
 * The line a send adds to its words for a file that could not go along (§B), in the interface
 * language (TCH #765: it was English in every language), e.g. `(plan.pdf not sent: too large)`.
 */
export function notSentLine(name: string, why: 'too-large' | 'too-many' | 'unreadable'): string {
  return t(NOT_SENT[why], { name })
}
