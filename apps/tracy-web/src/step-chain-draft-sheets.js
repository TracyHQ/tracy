// The `sheets` door of a draft write on a real site (#597): the stylesheets the site's template serves, read as a visitor
// reads them, for the accent module (`step-chain-draft-write-accent.js`, `templateAccentOf` and `accentModule`). Request
// `{variables}` (the kit's accent variables, not needed to read), answer `string[]` (each sheet's text once, linked sheets
// and inline styles in page order), as the memory site's door answers (`write-order-memory-sheets.mjs`).
//
// The reading is the write step's own (`write-step/site-sheets.js` `readSiteSheets`): the home page in each theme
// (`THEMED_HOME`: which theme a plain page opens in is the template's choice, never assumed light) and every page the
// site lists (`content.contract` inspect, `lib/site-kept-paths.js`), since a template can merge a different sheet for
// each page and a rule the module does not see keeps the template's colour there; only sheets on the site's own origin.
// The fetch is the caller's `reader` (`{base, text(url)}`): the app passes its site reader (own origin only, no
// redirects followed, a timeout per request); the release gate passes `originReader` below.
//
// Bounds (`SHEETS_LIMITS`): pages read, bytes of one answer, bytes in all, and one deadline for the whole read; at most
// 40 sheets (`readSiteSheets`). Every failure is the typed stop `sheets_unreadable` with a `reason`, never an empty list
// the accent would read as "no colour": `page_list` (the site gave no page list), `no_page` (no page answered),
// `no_sheet` (the pages link no sheet), `answer_too_large`, `sheets_too_large`, `deadline`.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { keptPaths } from './lib/site-kept-paths.js'
import { readSiteSheets } from './write-step/site-sheets.js'

export const SHEETS_UNREADABLE = 'sheets_unreadable'
export const SHEETS_LIMITS = Object.freeze({
  pages: 12,
  answerBytes: 3_000_000,
  totalBytes: 12_000_000,
  deadlineMs: 90_000
})

/** Reasons a second attempt meets again: the site serves the same bytes. */
const SAME_AGAIN = new Set(['no_sheet', 'answer_too_large', 'sheets_too_large'])

/** The typed stop of a sheets read that failed. */
export function sheetsStop(reason, message, details = {}) {
  return Object.assign(
    new DraftWriteError(
      SHEETS_UNREADABLE,
      message,
      { door: 'sheets', reason, ...details },
      { noRerun: SAME_AGAIN.has(reason) }
    ),
    { fatal: SAME_AGAIN.has(reason) }
  )
}

/**
 * The home page in each theme, asked for by name: a template's plain page may open in either (measured: a JA template
 * serves `body.dark-active` to a request with no theme), and a theme may link a sheet of its own. A template that has no
 * theme switch ignores the query and serves the same sheets, read once (`readSiteSheets` keeps each path once).
 */
const THEMED_HOME = ['/index.php?theme=light', '/index.php?theme=dark']

const bytesOf = (text) => Buffer.byteLength(text, 'utf8')

/**
 * @param {{reader: {base: string, text: (url: string) => Promise<string>}, pages?: (() => Promise<object>) | null,
 *   platform?: string, limits?: Partial<typeof SHEETS_LIMITS>, now?: () => number}} input `pages`: the site's
 *   `content.contract` inspect answer, or null to read the home page only
 * @returns {(args?: {variables?: string[]}) => Promise<string[]>} the `sheets` door
 */
export function templateSheetsDoor({
  reader,
  pages = null,
  platform = 'joomla',
  limits = {},
  now = Date.now
}) {
  const bound = { ...SHEETS_LIMITS, ...limits }
  return async () => {
    const deadline = now() + bound.deadlineMs
    let listed = []
    if (pages) {
      try {
        listed = keptPaths(await pages())
      } catch (error) {
        throw sheetsStop('page_list', 'the site gave no page list to read its stylesheets from', {
          cause: String(error?.code ?? error?.message ?? error)
        })
      }
    }
    const paths = [...THEMED_HOME, ...listed.filter((p) => p !== '/')].slice(0, bound.pages)
    let total = 0
    const text = async (url) => {
      if (now() > deadline)
        throw sheetsStop('deadline', `the stylesheets were not read within ${bound.deadlineMs} ms`)
      let body
      try {
        body = await reader.text(String(url))
      } catch {
        // A page or sheet that does not answer is skipped; none at all is `no_page` / `no_sheet` below.
        return null
      }
      const size = bytesOf(String(body))
      if (size > bound.answerBytes)
        throw sheetsStop('answer_too_large', `${new URL(url).pathname} is over ${bound.answerBytes} bytes`, {
          path: new URL(url).pathname,
          bytes: size
        })
      total += size
      if (total > bound.totalBytes)
        throw sheetsStop('sheets_too_large', `the pages and sheets read are over ${bound.totalBytes} bytes`)
      return String(body)
    }
    try {
      return await readSiteSheets({ origin: reader.base, platform, paths, text })
    } catch (error) {
      if (error?.code === SHEETS_UNREADABLE) throw error
      const reason = /no stylesheet/.test(String(error?.message)) ? 'no_sheet' : 'no_page'
      throw sheetsStop(reason, String(error?.message ?? error), { pages: paths.length })
    }
  }
}

/**
 * A reader of one site origin for callers with no site reader of their own (the release gate): only URLs on `base`'s
 * origin, no redirect followed (an answer that moves is not read), a timeout per request.
 * @param {{base: string, fetchImpl?: typeof fetch, timeoutMs?: number}} input
 */
export function originReader({ base, fetchImpl = fetch, timeoutMs = 20_000 }) {
  const origin = new URL(base).origin
  return {
    base: `${origin}/`,
    text: async (url) => {
      const u = new URL(url, `${origin}/`)
      if (u.origin !== origin) throw new Error(`not the site's address: ${u.origin}`)
      const answer = await fetchImpl(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
      if (!answer.ok) throw new Error(`${u.pathname} answered ${answer.status}`)
      return answer.text()
    }
  }
}

/**
 * The app's `site.templateSheets` (`step-chain-draft-site.js`): the `sheets` door over the app's site reader of the run's
 * site. No site is the stop `no_page`.
 * @param {{siteReader: (siteKey: string) => Promise<{base: string, text: Function} | null>, limits?: object}} input
 * @returns {(siteKey: string, args?: {variables?: string[], pages?: () => Promise<object>}) => Promise<string[]>}
 */
export const draftTemplateSheets =
  ({ siteReader, limits = {} }) =>
  async (siteKey, { pages = null, ...args } = {}) => {
    const reader = await siteReader(siteKey)
    if (!reader) throw sheetsStop('no_page', `no site ${siteKey}`)
    return templateSheetsDoor({ reader, pages, limits })(args)
  }
