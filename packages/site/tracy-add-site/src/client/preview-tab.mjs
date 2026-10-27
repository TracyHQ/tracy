/**
 * Which Browser tab (`tracy:browser`) already shows a site — pure, so `test/preview-tab.test.mjs`
 * holds it without a browser.
 */

export const PREVIEW_TAB = 'tracy:browser'

/**
 * The id of a preview tab already on `host`, or null. A preview holds its address in `meta.url` and
 * follows its navigation there (`BrowserView`), and a page of the site keeps the site's host.
 * @param {readonly { id: string, type: string, meta?: unknown }[] | undefined} tabs -
 *   the open preview tabs (`openTabsOf('tracy:browser')`).
 * @param {string} host - the site's hostname.
 * @returns {string | null}
 */
export function browserTabOn(tabs, host) {
  for (const tab of tabs ?? []) {
    const url = /** @type {{ url?: unknown } | undefined} */ (tab.meta)?.url
    try {
      if (tab.type === PREVIEW_TAB && typeof url === 'string' && new URL(url).hostname === host) return tab.id
    } catch {
      // An address that does not parse is on no host.
    }
  }
  return null
}
