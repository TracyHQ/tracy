/**
 * The words of Sync to live that are worked out from the server's answer: which phase a push is in,
 * why one stopped, what a change is called and why one cannot be sent. Moved with the dialog from
 * `@tracy/dsh-my-sites` (`live-push-panel.tsx`) when Sync to live became a flow of the Publish tab
 * (25/10/2026), as `sync-words.ts` did for Sync from live.
 */
import { interfaceLocale } from '../../interface-languages/index.mjs'
import type { Translate } from '../../team/translate'
import { fieldsText, labelText, whatText } from './record-words'
import { type PhpTooOld, phpTooOldText } from './sync-words'

/** One change as `view()` names it: titles and field names, never values. */
export type PushItem = {
  id: string
  kind: string
  title: string | null
  liveId?: string
  fields?: string[]
  reason?: string | null
  code?: string | null
  /** A file's size in bytes: a file is shown by its name and size, never its contents. */
  size?: number
  /** Why it is not sent, in the customer's words (an unsupported change). */
  note?: string | null
  /** Sent, with something the Owner should know (`parent-theme`: an update of that theme replaces it). */
  warning?: string | null
  /** Not sent because it is open in the live site's editor (`open-in-editor`): whose editor, by name. */
  lockedBy?: string | null
  /** What it is (`push.what.*`) and the fixed words of its title by name (`push.label.*`), with the rest. */
  what?: string | null
  label?: string | null
  subject?: string | null
}

/** A file's size, "12 kB", in the interface language (no words of the plugin's own). */
export function sizeText(bytes: number): string {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / (1024 * 1024), 'megabyte']
      : bytes >= 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes, 'byte']
  // Bytes spelled out ("812 bytes"): the short form has no plural in English ("812 byte").
  const options = {
    style: 'unit',
    unit,
    unitDisplay: unit === 'byte' ? 'long' : 'short',
    maximumFractionDigits: 1
  } as const
  try {
    return new Intl.NumberFormat(interfaceLocale(), options).format(value)
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value)
  }
}

/** 8 MiB: what `media.upload` takes for one file, the limit `push.reason.tooLarge` names. */
const MEDIA_LIMIT = 8 * 1024 * 1024

/**
 * Why a change cannot be sent, in words a customer reads (the host's `reason`), or null when none
 * applies. `platform` names the switch on the live site the way its CMS calls it; `limit` is the most
 * the live site's door takes for one file (a `too-large` change).
 */
export function unsupportedReasonText(
  reason: string | null | undefined,
  t: Translate,
  { platform, limit }: { platform?: string | null; limit?: number | null } = {}
): string | null {
  const wordpress = platform === 'wordpress'
  switch (reason) {
    case 'php-disabled':
    case 'php_disabled':
      return t(wordpress ? 'push.reason.phpDisabledWordpress' : 'push.reason.phpDisabled')
    case 'template-files-off':
    case 'disabled':
      return t(wordpress ? 'push.reason.templateFilesOffWordpress' : 'push.reason.templateFilesOff')
    case 'not-a-template-file':
      return t('push.reason.notTemplateFile')
    case 'not-a-live-template':
      return t('push.reason.notLiveTemplate')
    case 'engine-has-no-file-write':
    case 'engine-cannot-delete-file':
    case 'not-a-media-item':
      return t('push.reason.noFileDoor')
    case 'excluded':
    case 'server-config':
      return t('push.reason.excluded')
    case 'symlink':
      return t('push.reason.symlink')
    case 'extension-file':
      return t('push.reason.extensionFile')
    case 'too-large':
      return limit && limit !== MEDIA_LIMIT
        ? t('push.reason.tooLargeLimit', { limit: sizeText(limit) })
        : t('push.reason.tooLarge')
    case 'permalink':
      return t('push.reason.permalink')
    case 'php-lint-failed':
      return t('push.reason.phpLint')
    case 'php-lint-unavailable':
      return t('push.reason.phpUnchecked')
    case 'no-safe-action':
    case 'unreadable':
    case 'base-unknown':
    case 'theme-switched':
      return t('push.reason.noDoor')
    default:
      return null
  }
}

export type PushView = {
  id: string
  state: 'running' | 'previewed' | 'expired' | 'held' | 'pushed' | 'undone' | 'failed'
  phase: 'preview' | 'apply' | 'undo'
  step: string | null
  error: string | null
  /** Why it stopped, one line from the host with no value of the site (its answer's `detail`). */
  errorDetail?: string | null
  undoError: string | null
  undoErrorDetail?: string | null
  /** LIVE_PHP_TOO_OLD (`error` / `undoError`): the live site's PHP and the one Claude Cowork needs. */
  php?: PhpTooOld | null
  undoPhp?: PhpTooOld | null
  startedAt: string
  pushedAt: string | null
  undoneAt: string | null
  expiresAt: string | null
  preview: {
    add: PushItem[]
    change: PushItem[]
    remove: PushItem[]
    files?: PushItem[]
    settings?: PushItem[]
    php?: PushItem[]
    unsupported: Array<{ kind: string; name: string; reason?: string | null; size?: number; limit?: number }>
    platform?: 'joomla' | 'wordpress'
    liveChanged: PushItem[]
    held: number
    limit: number
    itemsTotal: number
    unsupportedTotal: number
  } | null
  deletes: boolean
  result: { pushed: PushItem[]; conflicts: PushItem[]; failed: PushItem[]; skipped: PushItem[] } | null
  undo: { restored: PushItem[]; conflicts: PushItem[]; failed: PushItem[] } | null
  undoable: boolean
  maxItems: number
}

export type PushAnswer = {
  available: boolean
  why?: string
  push: PushView | null
  lastPush: PushView | null
}

/** What the flow shows: one phase for each thing a person can be looking at. */
export type PushPhase =
  | 'loading'
  | 'unreadable'
  | 'unavailable'
  | 'ready'
  | 'previewing'
  | 'held'
  | 'review'
  | 'nothing'
  | 'expired'
  | 'confirm'
  | 'pushing'
  | 'pushed'
  | 'undoing'
  | 'undone'
  | 'failed'

/** The stages of each running phase, in order (`live-push-contract.js` PHASE_STAGES). */
export const PUSH_STAGES = {
  preview: ['syncing', 'comparing'],
  apply: ['writing', 'settling'],
  undo: ['undoing', 'settling']
} as const

/** The phase a door answer puts the flow in; `confirming`: the Owner pressed Continue on a preview. */
export function pushPhaseOf(
  answer: PushAnswer | null,
  { unreadable, confirming }: { unreadable: boolean; confirming: boolean }
): PushPhase {
  if (unreadable) return 'unreadable'
  if (answer === null) return 'loading'
  if (!answer.available) return 'unavailable'
  const p = answer.push
  if (!p) return 'ready'
  if (p.state === 'running')
    return p.phase === 'preview' ? 'previewing' : p.phase === 'apply' ? 'pushing' : 'undoing'
  if (p.state === 'held') return 'held'
  if (p.state === 'expired') return 'expired'
  if (p.state === 'previewed') {
    const v = p.preview
    const total =
      (v?.add.length ?? 0) +
      (v?.change.length ?? 0) +
      (v?.remove.length ?? 0) +
      (v?.files?.length ?? 0) +
      (v?.settings?.length ?? 0) +
      (v?.php?.length ?? 0)
    if (!v || total === 0) return 'nothing'
    return confirming ? 'confirm' : 'review'
  }
  if (p.state === 'pushed') return 'pushed'
  if (p.state === 'undone') return 'undone'
  // A push that stopped after some writes reached the live site reads as its result, with Undo.
  if (p.phase !== 'preview' && (p.result?.pushed.length ?? 0) > 0) return 'pushed'
  return 'failed'
}

/** Why a phase did not finish, in a sentence a customer can act on; the code stays for support. */
export function pushFailureText(code: string, t: Translate, max = 200, php?: PhpTooOld | null): string {
  if (code === 'LIVE_PHP_TOO_OLD') return phpTooOldText(php, t)
  const liveErrors: Record<string, string> = {
    LIVE_BLOCKED: 'sync.error.liveBlocked',
    LIVE_PASSWORD_PROTECTED: 'sync.error.livePassword',
    LIVE_RATE_LIMITED: 'sync.error.liveRateLimited',
    TOKEN_REFUSED: 'sync.error.liveToken'
  }
  if (liveErrors[code]) return t(liveErrors[code])
  if (code === 'PUSH_SITE_BUSY' || code === 'SYNC_SITE_BUSY') return t('push.error.busy')
  if (code === 'PUSH_SYNC_RUNNING') return t('push.error.syncRunning')
  if (code === 'PREVIEW_EXPIRED') return t('push.status.expiredBody')
  if (code === 'PREVIEW_SUPERSEDED') return t('push.error.superseded')
  if (code === 'PUSH_TOO_MANY') return t('push.overLimit', { max })
  if (code === 'COPY_CHANGED' || code === 'COPY_BUSY' || code === 'PREVIEW_STALE')
    return t('push.error.copyChanged')
  if (code === 'SYNC_FAILED' || code === 'NO_BASE') return t('push.error.syncFailed')
  if (code === 'NOT_PUSHED') return t('push.error.notPushed')
  if (code === 'PUSH_INTERRUPTED') return t('push.error.interrupted')
  if (
    [
      'LIVE_READ_FAILED',
      'LIVE_WRITE_FAILED',
      'LIVE_BUSY',
      'LIVE_UNREACHABLE',
      'NO_LIVE_DOOR',
      'PUSH_NO_LIVE_DOOR',
      'TOKEN_REFUSED',
      'SITE_RESOURCE_LIMIT',
      'NOT_THE_ENGINE'
    ].includes(code)
  )
    return t('push.error.liveUnreachable')
  return t('push.failed', { error: code })
}

/** A change's name: its title, or its kind and live number when it has none. */
export function itemName(item: PushItem, t: Translate): string {
  const named = labelText(item.label, item.subject, item.title, t)
  if (named) return named
  const what = whatText(item.what, item.kind, t)
  return item.liveId ? `${what} #${item.liveId}` : what
}

/** What an item is and the fields it changed, in words: "Page · Title, Content"; a file by its size. */
export function itemLine(item: PushItem, t: Translate, withFields: boolean): string {
  if (item.size !== undefined) return sizeText(item.size)
  const what = whatText(item.what, item.kind, t)
  return withFields && item.fields?.length ? `${what} · ${fieldsText(item.fields, t)}` : what
}

/** The refusals of a live site whose words name a switch there (its PHP or template file switch off). */
const SWITCHED_OFF = ['php_disabled', 'disabled', 'php-disabled', 'template-files-off']

/**
 * Items with what the Owner should read beside each: a parent theme's warning, or why the live site
 * refused one (its PHP or template file switch off) and where to switch it on.
 */
export function withNotes(items: PushItem[], t: Translate, platform?: string | null): PushItem[] {
  return items.map((item) => {
    if (item.note) return item
    if (item.warning === 'parent-theme') return { ...item, note: t('push.warning.parentTheme') }
    const off = [item.code, item.reason].find((r) => SWITCHED_OFF.includes(r ?? ''))
    const why = off ? unsupportedReasonText(off, t, { platform }) : null
    return why ? { ...item, note: why } : item
  })
}

/**
 * The step of the Sync to live flow a phase is drawn on: Review (preview and what it found) or Send
 * (Confirm, the push under way, its result and its undo). A push that failed after its preview is
 * the Send step's; one that failed preparing its preview is the Review step's.
 */
export function pushStepOf(phase: PushPhase, push: PushView | null): 'push' | 'send' {
  if (
    phase === 'confirm' ||
    phase === 'pushing' ||
    phase === 'pushed' ||
    phase === 'undoing' ||
    phase === 'undone'
  )
    return 'send'
  if (phase === 'failed' && push !== null && push.phase !== 'preview') return 'send'
  return 'push'
}

/**
 * The changes an apply left as the live site has them, in two groups the Owner acts on differently:
 * `open` — open in an editor on the live site (`open-in-editor`), sent once it is saved or closed
 * there, each with whose editor; `changed` — changed (or deleted) on the live site after Tracy read it.
 */
export function conflictGroups(items: PushItem[], t: Translate): { open: PushItem[]; changed: PushItem[] } {
  const open: PushItem[] = []
  const changed: PushItem[] = []
  for (const item of items) {
    if (item.reason === 'open-in-editor')
      open.push(item.lockedBy ? { ...item, note: t('push.result.openBy', { name: item.lockedBy }) } : item)
    else if (item.reason === 'gone-on-live') changed.push({ ...item, note: t('push.result.goneOnLive') })
    else changed.push(item)
  }
  return { open, changed }
}
