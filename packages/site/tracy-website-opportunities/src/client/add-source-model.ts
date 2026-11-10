/**
 * The state of the Add source popover (#537): closed, open with the link being typed, checking it (the add door's
 * own answer is the check), or open with a refusal under the field. Escape while checking closes the popover and
 * leaves a notice on the Sources block that reads the answer when it comes. Pure: the clock is passed in, and the
 * popover component sends the link itself.
 *
 * The checks made before sending (empty, too long, not a link, a private address, a Google link, a platform Tracy
 * cannot read) use the shared link reader (`website-opportunities/domain/link-kinds.mjs`), the same one the server
 * judges by, so they read the same words the server's refusal would.
 */
import { judgeLinks, linkKind, unsupportedLinkOf } from 'website-opportunities/domain/link-kinds.mjs'

import { type SourceLogoKey, sourceLogoKey } from './source-logo.ts'

/** Longest link the add door accepts (`seller-review-routes.js URL_MAX`). */
export const ADD_SOURCE_URL_MAX = 2000
/** After this long without an answer, the field reads Still checking. */
export const ADD_SOURCE_SLOW_MS = 2000
/** How long the notice of a link added after the popover closed stays on the Sources block. */
export const ADD_SOURCE_ADDED_NOTICE_MS = 4000

/**
 * One line shown to the seller: a `strings.ts` key and its parameters. `platform` is a source id (`instagram`,
 * `website`, a listing's name, an unsupported platform's name) the component names with `sourceLabel`.
 */
export interface AddSourceMessage {
  key: string
  params?: Record<string, string | number>
  platform?: string
}

/** The notice on the Sources block once the popover closed while the link was being checked. */
export type AddSourceNotice =
  | { phase: 'pending'; url: string }
  | { phase: 'added'; url: string; platform: string | null }
  | { phase: 'failed'; url: string; error: AddSourceMessage }

export interface AddSourceState {
  open: boolean
  url: string
  /** When Add was pressed (clock ms) while its answer is awaited; null when nothing is being checked. */
  checkingSince: number | null
  /** The refusal shown under the field, or null. */
  error: AddSourceMessage | null
  notice: AddSourceNotice | null
}

export type AddSourceAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'toggle' }
  | { type: 'type'; url: string }
  | { type: 'submit'; at: number }
  | { type: 'done'; refusal: AddSourceMessage | null }
  | { type: 'dismiss' }
  | { type: 'retry' }

export const ADD_SOURCE_CLOSED: AddSourceState = Object.freeze({
  open: false,
  url: '',
  checkingSince: null,
  error: null,
  notice: null
})

const msg = (key: string, extra: Omit<AddSourceMessage, 'key'> = {}): AddSourceMessage => ({ key, ...extra })

/** Why a link cannot be sent, said before any round trip; null when it may be sent. */
export function addSourceCheck(raw: string): AddSourceMessage | null {
  const text = raw.trim()
  if (text === '') return msg('source.add.error.INVALID_URL')
  if (text.length > ADD_SOURCE_URL_MAX) return msg('source.add.error.TOO_LONG')
  const unsupported = unsupportedLinkOf(text)
  if (unsupported !== null)
    return msg('source.add.error.UNSUPPORTED_LINK', { platform: unsupported.platform })
  const [judged] = judgeLinks([text])
  if (judged === undefined || judged.reason === 'invalid') return msg('source.add.error.NOT_A_LINK')
  if (judged.reason === 'not-public') return msg('source.add.error.PRIVATE_ADDRESS')
  if (judged.kind === 'google') return msg('source.add.error.GOOGLE_LINK_NOT_ADDED')
  return null
}

/** The platform a link is a page of, as a source id (`instagram`, `website`, a listing's name), or null. */
export function addSourcePlatformOf(raw: string): string | null {
  const info = linkKind(raw.trim())
  if (info === null) return null
  if (info.kind === 'listing') return info.source ?? 'listing'
  if (info.kind === 'google') return 'google-maps'
  return info.kind
}

/** The glyph at the left of the field while typing: null until the text reads as a link. */
export function addSourceGlyphOf(raw: string): SourceLogoKey | null {
  const info = linkKind(raw.trim())
  if (info === null) return null
  if (info.kind === 'google') return 'maps'
  if (info.kind === 'listing') return sourceLogoKey('listing', info.url)
  if (info.kind === 'website') return sourceLogoKey('website-link', info.url)
  return sourceLogoKey(info.kind, info.url)
}

/** What the add door answered when it refused (`Answer` of `api.ts`, or a thrown call as `NETWORK`). */
export interface AddSourceRefusal {
  code: string
  status: number
  platform?: string | null
  max?: number
  links?: ReadonlyArray<{ reason?: string }>
}

/** The line for a refusal of the add door. Anything not named here reads the generic error. */
export function addSourceRefusal(refusal: AddSourceRefusal): AddSourceMessage {
  const { code, status } = refusal
  switch (code) {
    case 'SOURCE_ALREADY_KNOWN':
    case 'INVALID_URL':
    case 'GOOGLE_LINK_NOT_ADDED':
    case 'JOB_ACTIVE':
    case 'NETWORK':
    case 'NOT_FOUND':
    case 'FEATURE_OFF':
    case 'NOT_SIGNED_IN':
      return msg(`source.add.error.${code}`)
    // The [TAM] developer preview panel blocks every write while it shows a test state (`preview-panel.tsx`).
    case 'PREVIEW_BLOCKED':
      return msg('source.add.error.PREVIEW_BLOCKED')
    case 'UNSUPPORTED_LINK':
      return typeof refusal.platform === 'string' && refusal.platform !== ''
        ? msg('source.add.error.UNSUPPORTED_LINK', { platform: refusal.platform })
        : msg('source.add.error.UNSUPPORTED_LINK_PLAIN')
    case 'PLATFORM_ALREADY_KNOWN':
      if (refusal.platform === 'website') return msg('source.add.error.WEBSITE_ALREADY_KNOWN')
      return typeof refusal.platform === 'string' && refusal.platform !== ''
        ? msg('source.add.error.PLATFORM_ALREADY_KNOWN', { platform: refusal.platform })
        : msg('source.add.error.SOURCE_ALREADY_KNOWN')
    case 'TOO_MANY_SOURCES':
      return msg('source.add.error.TOO_MANY_SOURCES', {
        params: { max: typeof refusal.max === 'number' ? refusal.max : 5 }
      })
    case 'NO_USABLE_LINKS': {
      const reason = refusal.links?.[0]?.reason
      if (reason === 'invalid') return msg('source.add.error.NOT_A_LINK')
      if (reason === 'not-public') return msg('source.add.error.PRIVATE_ADDRESS')
      if (reason === 'blocked') return msg('source.add.error.UNREACHABLE')
      return msg('source.add.error.NO_USABLE_LINKS')
    }
  }
  if (status === 401) return msg('source.add.error.NOT_SIGNED_IN')
  if (status === 403) return msg('source.add.error.FEATURE_OFF')
  // A 405, or a 404 without a code of ours, is an older server without the door.
  if (status === 405 || code === 'HTTP_404') return msg('source.add.error.NO_DOOR')
  return msg('source.add.error.other')
}

/** The link the popover sends on Add, or null when the press sends nothing (checking, closed, or a link refused here). */
export function addSourceLinkOf(state: AddSourceState): string | null {
  if (!state.open || state.checkingSince !== null) return null
  return addSourceCheck(state.url) === null ? state.url.trim() : null
}

/** The words at the right end of the field while checking, from the clock `now`; null when nothing is checked. */
export function addSourceCheckingKey(state: AddSourceState, now: number): string | null {
  if (state.checkingSince === null) return null
  return now - state.checkingSince >= ADD_SOURCE_SLOW_MS ? 'source.add.slow' : 'source.add.checking'
}

const openWith = (url: string): AddSourceState => ({ ...ADD_SOURCE_CLOSED, open: true, url })

export function addSourceStep(state: AddSourceState, action: AddSourceAction): AddSourceState {
  switch (action.type) {
    case 'open':
      if (state.open || state.notice?.phase === 'pending') return state
      return openWith('')
    case 'toggle':
      if (state.open) return addSourceStep(state, { type: 'close' })
      return addSourceStep(state, { type: 'open' })
    case 'close':
      if (!state.open) return state
      // Closed while checking: the answer still comes, and the notice on the Sources block reads it.
      if (state.checkingSince !== null)
        return { ...ADD_SOURCE_CLOSED, notice: { phase: 'pending', url: state.url.trim() } }
      return { ...ADD_SOURCE_CLOSED, notice: state.notice }
    case 'type':
      // Typing again clears the refusal: it was about the link before. The field is locked while checking.
      if (!state.open || state.checkingSince !== null) return state
      return { ...state, url: action.url, error: null }
    case 'submit': {
      if (!state.open || state.checkingSince !== null) return state
      const refused = addSourceCheck(state.url)
      if (refused !== null) return { ...state, error: refused }
      return { ...state, checkingSince: action.at, error: null }
    }
    case 'done': {
      if (state.open && state.checkingSince !== null) {
        if (action.refusal !== null) return { ...state, checkingSince: null, error: action.refusal }
        return {
          ...ADD_SOURCE_CLOSED,
          notice: { phase: 'added', url: state.url.trim(), platform: addSourcePlatformOf(state.url) }
        }
      }
      const pending = state.notice?.phase === 'pending' ? state.notice : null
      if (pending === null) return state
      return {
        ...state,
        notice:
          action.refusal === null
            ? { phase: 'added', url: pending.url, platform: addSourcePlatformOf(pending.url) }
            : { phase: 'failed', url: pending.url, error: action.refusal }
      }
    }
    case 'dismiss':
      return state.notice === null || state.notice.phase === 'pending' ? state : { ...state, notice: null }
    case 'retry':
      // Try again on a failed notice opens the popover with that link and its refusal.
      if (state.notice?.phase !== 'failed') return state
      return { ...openWith(state.notice.url), error: state.notice.error }
  }
}
