/**
 * The pure half of Settings › Help & about: which tracy.ai address a link opens in which interface
 * language, what an app from before the update bridge announces, how release notes become lines,
 * when the nav dot shows. No React, no window: test/help-about.test.mjs covers it.
 */

export const DEFAULT_TRACY_SITE = 'https://tracy.ai'
export const DEFAULT_DOCS_SITE = 'https://docs.tracy.ai'

/**
 * Proper names, the same in every language — not strings to translate: the product, the name of the
 * dev channel as the app itself is named ("Tracy Cowork Dev"), and the community's platform.
 */
export const PRODUCT_NAME = 'Tracy Cowork'
export const DEV_CHANNEL_NAME = 'Dev'
export const COMMUNITY_PLATFORM = 'Discord'
export const DISCORD_URL = 'https://discord.gg/BM9TMRcEBb'

/** Languages tracy.ai has its own pages for (`/de/…`); the others read the root pages. */
const SITE_LANGUAGES: ReadonlySet<string> = new Set(['de', 'es', 'fr', 'it', 'nl'])

/**
 * A tracy.ai page in the interface language when the site has that language, the root page otherwise.
 * @param path - the page path, starting and ending with `/` (`/help/faq/`, `/`).
 * @param locale - the interface language tag (`de`, `zh-CN`), or undefined.
 */
export function tracyUrl(path: string, locale: string | undefined): string {
  const language = (locale ?? '').toLowerCase().split('-')[0]
  return SITE_LANGUAGES.has(language)
    ? `${DEFAULT_TRACY_SITE}/${language}${path}`
    : `${DEFAULT_TRACY_SITE}${path}`
}

/** An address as a person reads it: no scheme, no closing slash. */
export function shownAddress(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** One link row: the string key of its name, where it goes, how its address line reads. */
export interface HelpLink {
  readonly id: 'help' | 'faq' | 'pricing' | 'website' | 'community'
  readonly url: string
  /** The line under the name: the address, or the string key of a sentence (Community). */
  readonly sub: { readonly address: string } | { readonly key: string }
}

/** The five rows of the lower box, in order. */
export function helpLinks(locale: string | undefined): HelpLink[] {
  const page = (id: HelpLink['id'], path: string): HelpLink => {
    const url = tracyUrl(path, locale)
    return { id, url, sub: { address: shownAddress(url) } }
  }
  return [
    page('help', '/help/'),
    page('faq', '/help/faq/'),
    page('pricing', '/pricing/'),
    page('website', '/'),
    { id: 'community', url: DISCORD_URL, sub: { key: 'help.link.community.sub' } }
  ]
}

/** The two links of the closing line. */
export function legalLinks(locale: string | undefined): { id: 'privacy' | 'terms'; url: string }[] {
  return [
    { id: 'privacy', url: tracyUrl('/privacy/', locale) },
    { id: 'terms', url: tracyUrl('/terms/', locale) }
  ]
}

/**
 * The version an app announces in its user agent (`TracyCowork/<version>`, src/main.js
 * `markUserAgent`). Only to tell an app from before the update bridge apart from a browser, and to
 * show its version: it decides nothing else.
 */
export function appVersionFromUserAgent(userAgent: string): string | null {
  const match = /\bTracyCowork\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?![^\s])/.exec(userAgent)
  return match === null ? null : match[1]
}

/** One line of release notes, as the page draws it. */
export interface NoteLine {
  readonly kind: 'text' | 'bullet' | 'gap'
  readonly text: string
}

/** Release notes as lines: `- ` starts a bullet, an empty line is a gap, anything else is text. */
export function noteLines(notes: string): NoteLine[] {
  return notes.split('\n').map((line): NoteLine => {
    if (line.trim() === '') return { kind: 'gap', text: '' }
    if (line.startsWith('- ')) return { kind: 'bullet', text: line.slice(2) }
    return { kind: 'text', text: line }
  })
}

/** How a downloaded version gets installed (bridge protocol 3, `AppInfo.installMode`). */
export type InstallMode = 'quit' | 'restart' | 'manual'

/**
 * The oldest version the channel still serves, as the app read it from the channel file (protocol 3).
 * `warn` until `after`, `blocked` from then (or at once when there is no `after`).
 */
export interface UpdatePolicy {
  readonly level: 'ok' | 'warn' | 'blocked'
  readonly minimumVersion: string | null
  /** ms epoch: when `warn` becomes `blocked`; null when blocked at once or no deadline. */
  readonly after: number | null
}

/** A new minor or major version is running and the person has not looked at Help & about since. */
export interface WhatsNew {
  readonly pending: boolean
  readonly from: string | null
  readonly to: string
  readonly page: string
}

/**
 * The update state the app sends (packages/desktop/tracy-desktop/src/update-state.js). The optional
 * fields arrived with bridge protocol 3 and are absent from an older app; an older app may also
 * still send `postponed`, which nothing here reads any more.
 */
export interface UpdateState {
  readonly revision: number
  readonly status:
    | 'off'
    | 'idle'
    | 'checking'
    | 'current'
    | 'downloading'
    | 'downloaded'
    | 'available-manual'
    | 'error'
    | 'installing'
    | 'install-error'
  readonly version: string | null
  readonly percent: number | null
  /** Notes of the NEW version `version`, from the channel file. */
  readonly releaseNotes: string | null
  readonly lastCheckedAt: number | null
  readonly nextRetryAt: number | null
  readonly autoCheck: boolean
  /** ms epoch: when the first version of this wait finished downloading. */
  readonly readySince?: number | null
  /** The version prepared to install on quit (macOS Squirrel, AppImage); null on Windows. */
  readonly stagedVersion?: string | null
  readonly policy?: UpdatePolicy | null
  readonly whatsNew?: WhatsNew | null
  /** The "Notify me what's new after an update" switch. */
  readonly showWhatsNew?: boolean
}

/** A version waits for the person: the nav dot and What's new show. */
export function waitingUpdate(state: UpdateState | null | undefined): boolean {
  return (
    state !== null &&
    state !== undefined &&
    (state.status === 'downloaded' || state.status === 'available-manual' || state.status === 'install-error')
  )
}

/**
 * The running version's own notes (`AppInfo.releaseNotes`, from the app bundle, protocol 3), or null
 * when the app is older or its bundle carries none: then the box is not drawn at all.
 */
export function runningNotes(
  info: { readonly releaseNotes?: string | null } | null | undefined
): string | null {
  const notes = info?.releaseNotes
  return typeof notes === 'string' && notes.trim() !== '' ? notes : null
}

/** Why the Help & about nav item carries its dot, most urgent first; null for no dot. */
export type HelpBadge = 'required' | 'update' | 'whatsNew'

/**
 * The reason for the dot beside Help & about: the running version is no longer (or soon not)
 * supported, a version waits to be installed, or a new minor version runs and its notes are unread.
 */
export function helpBadge(state: UpdateState | null | undefined): HelpBadge | null {
  if (state === null || state === undefined) return null
  if (state.policy?.level === 'warn' || state.policy?.level === 'blocked') return 'required'
  if (waitingUpdate(state)) return 'update'
  if (state.whatsNew?.pending === true) return 'whatsNew'
  return null
}

/** The string key of the dot's words for a screen reader, by its reason; null for no dot. */
export function helpBadgeKey(state: UpdateState | null | undefined): string | null {
  const reason = helpBadge(state)
  if (reason === null) return null
  return reason === 'update' ? 'help.badge' : `help.badge.${reason}`
}

/** The policy line under the update row: which sentence, in which tone, naming what. */
export interface PolicyNotice {
  readonly tone: 'warn' | 'error'
  readonly key: 'help.policy.stopsOn' | 'help.policy.unsupported'
  readonly minimumVersion: string
  /** The date the sentence names (ms epoch), or null for the sentence without a date. */
  readonly after: number | null
}

/**
 * What to say about the channel's minimum version: nothing while it is met, a date to update by
 * while it warns, "no longer supported" once blocked (the date, if any, has passed). A policy with
 * no version to name says nothing rather than half a sentence.
 */
export function policyNotice(policy: UpdatePolicy | null | undefined): PolicyNotice | null {
  if (policy === null || policy === undefined || policy.minimumVersion === null) return null
  if (policy.level === 'warn') {
    return policy.after === null
      ? { tone: 'warn', key: 'help.policy.unsupported', minimumVersion: policy.minimumVersion, after: null }
      : {
          tone: 'warn',
          key: 'help.policy.stopsOn',
          minimumVersion: policy.minimumVersion,
          after: policy.after
        }
  }
  if (policy.level === 'blocked') {
    return {
      tone: 'error',
      key: 'help.policy.unsupported',
      minimumVersion: policy.minimumVersion,
      after: null
    }
  }
  return null
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000]
]

/** "2 minutes ago", "in 10 minutes", "now" — in the interface language. */
export function relativeTime(at: number, now: number, locale: string | undefined): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diff = at - now
  for (const [unit, ms] of UNITS) if (Math.abs(diff) >= ms) return format.format(Math.round(diff / ms), unit)
  return format.format(0, 'second')
}

/** A build date in the interface language, by its UTC day. */
export function buildDate(iso: string, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
}

/** The release-notes box's default height cap; longer notes scroll inside it. */
export const NOTES_BOX_CAP_PX = 150

/**
 * The height the release-notes box opens at, from the height its text needs: `null` (no fixed height,
 * the box is as tall as its text) when the notes fit under the cap, else the cap, so a two-line note
 * leaves no empty band and a long one scrolls. Nothing measured yet keeps the cap. The reader can still
 * drag the box taller (`resize: vertical`).
 */
export function notesBoxHeight(contentHeight: number): number | null {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return NOTES_BOX_CAP_PX
  return contentHeight <= NOTES_BOX_CAP_PX ? null : NOTES_BOX_CAP_PX
}
