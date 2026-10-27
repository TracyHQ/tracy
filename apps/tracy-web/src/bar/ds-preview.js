/**
 * The Design system preview popup's live frame: a customer's own page, loaded for real at the site's own
 * address with its scripts running, wearing one design system, WITHOUT anything written to the site.
 *
 * The popup frames `<site address>/?tracy_ds_preview=<ticket>`; the ticket is minted by the preview door
 * after its gates (`lib/ds-preview-ticket.js`). This proxy takes the parameter off before the site is asked
 * (`splitDsPreview`), asks the site as nobody, and with a valid ticket lays in the very bytes an apply would
 * write (`sites/design-system-live-page.js`, handed in by `app.js`). Without one — no ticket, a forged or
 * expired one, another site's — the page is answered as it is.
 *
 * Nothing here can change a site: the parameter only ever changes the one response it rides on, which goes
 * out `no-store` and `noindex`, with no badge and no picker.
 */
import { DS_PREVIEW_PARAM } from '../lib/ds-preview-ticket.js'

export { DS_PREVIEW_PARAM }

/**
 * The query string without `tracy_ds_preview`, and the system it named (first occurrence). Every
 * other pair is kept byte for byte, as `splitPreviewParam` does for the picker's ticket.
 * @param {string} search  `url.search`, with its leading `?` or empty
 * @returns {{ search: string, id: string | null }}
 */
export function splitDsPreview(search) {
  if (!search || search.length < 2) return { search: search ?? '', id: null }
  let id = null
  const kept = []
  for (const pair of search.slice(1).split('&')) {
    const eq = pair.indexOf('=')
    const name = eq === -1 ? pair : pair.slice(0, eq)
    if (name === DS_PREVIEW_PARAM) {
      if (id === null) {
        try {
          id = decodeURIComponent((eq === -1 ? '' : pair.slice(eq + 1)).replace(/\+/g, ' '))
        } catch {
          id = ''
        }
      }
      continue
    }
    kept.push(pair)
  }
  if (id === null) return { search, id: null }
  return { search: kept.length ? `?${kept.join('&')}` : '', id }
}

/**
 * A redirect the site answered inside the live frame, the ticket kept on it when it stays on the same
 * site (measured 18/10/2026: JA Vital's profile pages send a visitor to the login page with a 303, and
 * the frame landed there wearing nothing, as the ticket rode only on the address asked). A redirect to
 * another site, or an address that is no URL, is null: the caller leaves the answer as it is.
 * @param {string | null} location the `Location` the proxy answers with (already the viewer's address)
 * @param {{ asked: string, ticket: string }} q `asked`: the address the frame asked for
 * @returns {string | null}
 */
export function locationKeepingTicket(location, { asked, ticket }) {
  if (!location) return null
  try {
    const at = new URL(asked)
    const to = new URL(location, at)
    if (to.origin !== at.origin) return null
    to.searchParams.set(DS_PREVIEW_PARAM, ticket)
    return to.href
  } catch {
    return null
  }
}
