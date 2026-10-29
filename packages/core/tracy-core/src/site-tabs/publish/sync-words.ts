/**
 * The words of Sync from live that are worked out from the server's answer: how long ago, why a
 * sync stopped, and what each side of a kept place holds. Moved with the panel from
 * `@tracy/dsh-my-sites` (`live-sync-panel.tsx`) when Sync became a step of the Publish tab.
 */
import { interfaceLocale } from '../../interface-languages/index.mjs'
import type { Translate } from '../../team/translate'
import { fieldText, whatText } from './record-words'
import type { SyncConflict, SyncView } from './use-live-sync'

/** The three steps the host reports, in order (`apps/tracy-host/src/webroot.js` `onLine`). */
export const STAGES = ['reading', 'merging', 'applying'] as const

/**
 * How long each stage took, in seconds, from the steps the host printed (`view().timing`): an ended
 * stage up to the start of the next one, the stage under way up to `now`. A stage with no step yet
 * has none — nothing is made up for an older host that keeps no progress.
 */
export function stageSeconds(
  timing: SyncView['timing'],
  startedAt: string | undefined,
  now = Date.now()
): Partial<Record<(typeof STAGES)[number], number>> {
  const steps = timing?.steps ?? []
  const begun = STAGES.map((stage) => steps.find((s) => s.stage === stage)?.at)
  const sinceStart = startedAt ? (now - Date.parse(startedAt)) / 1000 : Number.NaN
  const out: Partial<Record<(typeof STAGES)[number], number>> = {}
  STAGES.forEach((stage, i) => {
    const from = begun[i]
    if (from === undefined) return
    const next = begun.slice(i + 1).find((at) => at !== undefined)
    const until = next ?? sinceStart
    if (Number.isFinite(until) && until >= from) out[stage] = Math.round(until - from)
  })
  return out
}

/** "8 min", "40 sec": a duration in the interface language, no words of the plugin's own. */
export function durationText(seconds: number): string {
  const [value, unit] = seconds < 60 ? [seconds, 'second'] : [Math.round(seconds / 60), 'minute']
  const options = { style: 'unit', unit, unitDisplay: 'short' } as const
  try {
    return new Intl.NumberFormat(interfaceLocale(), options).format(value)
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value)
  }
}

/** "5 minutes ago", in the interface language (Settings › Language), or '' for no stamp. */
export function agoText(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN
  if (Number.isNaN(at)) return ''
  const seconds = Math.round((at - now) / 1000)
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(seconds) < 60
      ? [seconds, 'second']
      : Math.abs(seconds) < 3600
        ? [Math.round(seconds / 60), 'minute']
        : Math.abs(seconds) < 86_400
          ? [Math.round(seconds / 3600), 'hour']
          : [Math.round(seconds / 86_400), 'day']
  try {
    return new Intl.RelativeTimeFormat(interfaceLocale(), { numeric: 'auto' }).format(value, unit)
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit)
  }
}

/** LIVE_PHP_TOO_OLD's versions: the PHP the live site runs and the one Claude Cowork needs. */
export type PhpTooOld = { php: string | null; min: string | null }

/**
 * "Your live site runs PHP 7.3.33. Claude Cowork needs PHP 7.4.0 or newer…" — both versions when the
 * answer named them, else the sentence without them (never a version made up).
 */
export function phpTooOldText(php: PhpTooOld | null | undefined, t: Translate): string {
  return php?.php && php.min
    ? t('sync.error.livePhpTooOld', { php: php.php, min: php.min })
    : t('sync.error.livePhpTooOldPlain')
}

/** Why a sync did not finish, in a sentence a customer can act on; the code stays for support. */
export function failureText(code: string, t: Translate, php?: PhpTooOld | null): string {
  if (code === 'LIVE_PHP_TOO_OLD') return phpTooOldText(php, t)
  const liveErrors: Record<string, string> = {
    LIVE_BLOCKED: 'sync.error.liveBlocked',
    LIVE_PASSWORD_PROTECTED: 'sync.error.livePassword',
    LIVE_RATE_LIMITED: 'sync.error.liveRateLimited',
    TOKEN_REFUSED: 'sync.error.liveToken'
  }
  if (liveErrors[code]) return t(liveErrors[code])
  if (code === 'SYNC_SITE_BUSY') return t('sync.busy')
  if (code === 'SYNC_AFTER_FAILED') return t('sync.afterFailed')
  if (code === 'LIVE_BUSY') return t('sync.error.liveBusy')
  if (code === 'SYNC_INTERRUPTED') return t('sync.error.interrupted')
  if (code === 'APPLY_INTERRUPTED_KEPT') return t('sync.error.interruptedKept')
  if (code === 'COPY_CHANGED' || code === 'COPY_BUSY') return t('sync.error.copyChanged')
  if (code === 'NO_DISK_SPACE') return t('sync.error.noSpace')
  if (
    [
      'LIVE_READ_FAILED',
      'SYNC_NO_LIVE_DOOR',
      'TOKEN_REFUSED',
      'SITE_RESOURCE_LIMIT',
      'NOT_THE_ENGINE'
    ].includes(code)
  )
    return t('sync.error.liveUnreachable')
  return t('sync.failed', { error: code })
}

/** The parts of a live site the sync view can name as still changing (tracy-web `partOfTable`). */
const BUSY_PARTS = ['content', 'settings', 'users', 'comments', 'files', 'other'] as const

/**
 * "What kept changing: site settings and files." — the parts of the live site a busy read named, in
 * the interface language; '' when it named none (a host before #1664).
 */
export function busyPartsText(parts: string[] | null | undefined, t: Translate): string {
  const words = BUSY_PARTS.filter((p) => parts?.includes(p)).map((p) => t(`sync.part.${p}`))
  if (!words.length) return ''
  let list = words.join(', ')
  try {
    list = new Intl.ListFormat(interfaceLocale(), { type: 'conjunction' }).format(words)
  } catch {
    // An interface language the runtime cannot list in: commas.
  }
  return t('sync.error.liveBusyParts', { parts: list })
}

/** The columns that name a record to a person, in the order they are tried. */
const NAMING = ['title', 'name', 'alias', 'subject', 'label', 'option_name', 'path']

/** A PHP literal of configuration.php as a person reads it: a quoted string without its quotes. */
export function phpValue(literal: string): string {
  const quoted = /^'((?:[^'\\]|\\.)*)'$/s.exec(literal)
  return quoted ? quoted[1].replace(/\\(['\\])/g, '$1') : literal
}

/** One side of a conflict as a person reads it: the setting's value, the column's, or the row. */
export function sideText(c: SyncConflict, side: 'ours' | 'theirs', deleted: string): string {
  const value = c[side]
  if (c.kind === 'order') return Array.isArray(value) && value.length > 0 ? value.join(', ') : deleted
  if (c.kind === 'setting') return value === null || value === undefined ? deleted : phpValue(String(value))
  const values = c.values?.[side]
  if (values === null || values === undefined) return deleted
  const keys = new Set(Object.keys(c.key ?? {}))
  const column =
    c.column ??
    NAMING.find((n) => values[n]?.text) ??
    Object.keys(values).find((n) => !keys.has(n) && values[n]?.text)
  const shown = column ? values[column] : undefined
  return shown?.null || shown?.text === undefined ? '—' : shown.text.slice(0, 140)
}

/** Why the copy did not take a live record (`dropped`), in a sentence. */
export function droppedReason(d: SyncConflict, t: Translate): string {
  if (d.reason === 'unhandled-reference') return t('sync.dropReason.reference')
  return t('sync.dropReason.addedBoth')
}

/** Which live record a held or dropped entry is. */
export function heldText(h: SyncConflict & { live?: number | null }, t: Translate): string {
  return h.reason === 'unhandled-reference'
    ? t('sync.heldReference', {
        table: String(h.table ?? ''),
        column: String(h.column ?? ''),
        id: String(h.live ?? '')
      })
    : t('sync.heldRow', {
        table: String(h.table ?? ''),
        id: Object.values(h.key ?? {}).join('/')
      })
}

/** Where the conflict is, in words: a file, a setting, a field of a record ("Article #12 · Title"). */
export function whereText(c: SyncConflict, t: Translate): string {
  if (c.kind === 'file') return c.path ?? c.id
  if (c.kind === 'setting') return `${c.path} · ${c.setting}`
  const key = c.key ? Object.values(c.key).join('/') : ''
  const table = c.table?.replace(/^[a-z0-9]+_/, '')
  const what = table ? whatText(null, table, t) : ''
  const where = [what && key ? `${what} #${key}` : what, c.column && fieldText(c.column, t)]
    .filter(Boolean)
    .join(' · ')
  // Inside a JSON column: the deepest name of the first key both changed, and how many more.
  const field = c.fields?.[0]?.split(' › ').at(-1)
  if (!field) return where
  const more = (c.fields?.length ?? 1) - 1
  return `${where} › ${field}${more > 0 ? ` +${more}` : ''}`
}
