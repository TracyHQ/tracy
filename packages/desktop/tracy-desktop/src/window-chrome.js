/**
 * The window frame on each operating system, and what the preload marks on the page so dsh's own CSS
 * makes room for that frame. Pure, with the platform passed in (test/window-chrome.test.mjs);
 * shell/main.ts and shell/preload.ts pass `process.platform`.
 *
 * - macOS: dsh's darwin chrome — no title bar, traffic lights inset at { x: 16, y: 18 }, the sidebar
 *   material behind a transparent page. dsh's darwin CSS places its first row around exactly that.
 * - Windows: dsh's Windows chrome — the title bar hidden, the system buttons kept as a
 *   `titleBarOverlay` the height of dsh's caption row (`WINDOWS_TITLEBAR_HEIGHT`, passed in by
 *   shell/main.ts from the dsh submodule). The page clears that row when `<html data-windows-titlebar>`
 *   is set (dsh `syncWindowsAppearance`), and then reports its own palette for the overlay.
 * - Linux: the system frame, its menu bar hidden until Alt. No overlay: window managers draw their
 *   own buttons, and dsh's CSS has no Linux caption row.
 */

/**
 * Overlay colours before the page has measured its own: dsh's `chromeFallbackFill` (the resolved
 * sidebar fill) and the label colour on it, per theme.
 * @param {boolean} dark - `nativeTheme.shouldUseDarkColors`.
 * @returns {{ color: string, symbolColor: string }}
 */
function captionColors(dark) {
  return dark ? { color: '#1b1b1c', symbolColor: '#f9fafb' } : { color: '#f9fafb', symbolColor: '#0f1115' }
}

/**
 * `BrowserWindow` options for the frame.
 * @param {string} platform - `process.platform`.
 * @param {{ dark: boolean, captionHeight: number }} how - the theme now, and dsh's caption height.
 * @returns {Electron.BrowserWindowConstructorOptions}
 */
function windowChrome(platform, { dark, captionHeight }) {
  if (platform === 'darwin')
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      // dsh's darwin page is transparent over the sidebar material, so the window must be too.
      vibrancy: 'sidebar',
      // 'active' keeps the material stable when the window blurs; 'followWindow' washes it out.
      visualEffectState: 'active',
      backgroundColor: '#00000000'
    }
  if (platform === 'win32') {
    const colors = captionColors(dark)
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: captionHeight, ...colors },
      // What shows before the first paint: the caption's own fill, not a dark slab in a light theme.
      backgroundColor: colors.color
    }
  }
  return { autoHideMenuBar: true }
}

/**
 * dsh's check on a colour crossing from the page to `setTitleBarOverlay` (apps/desktop/src/main.ts),
 * narrowed to the hex lengths CSS defines.
 */
const CAPTION_COLOR = /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|rgba?\([\d.,%\s]+\))$/iu

/**
 * @param {unknown} value - a colour the page sent.
 * @returns {value is string} true for a hex or rgb()/rgba() value only; anything else never reaches the overlay.
 */
function validCaptionColor(value) {
  return typeof value === 'string' && CAPTION_COLOR.test(value)
}

/** The alpha of a colour `validCaptionColor` accepted: the fourth rgba() component or the hex alpha digits. */
function alphaOf(value) {
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (hex.length === 4) return Number.parseInt(hex[3].repeat(2), 16) / 255
    if (hex.length === 8) return Number.parseInt(hex.slice(6), 16) / 255
    return 1
  }
  const parts = value.slice(value.indexOf('(') + 1, -1).split(',')
  if (parts.length < 4) return 1
  const alpha = parts[3].trim()
  return alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha)
}

/**
 * The palette a page reported for the overlay (dsh `syncWindowsAppearance`), or null when it is none.
 * A fully transparent fill is none: dsh's probe reads `var(--dsw-specific-sidebar-fill)`, which a page
 * that never declares it resolves to transparent, and a transparent overlay keeps whatever symbol
 * colour was measured while the page under it changes theme (measured on the Windows VM 10/10: dark
 * symbols over a page turned dark, the buttons all but invisible). Such a page keeps the theme fallback.
 * @param {unknown} color - the fill the page sent.
 * @param {unknown} symbolColor - the label colour the page sent.
 * @returns {{ color: string, symbolColor: string } | null}
 */
function measuredPalette(color, symbolColor) {
  if (!validCaptionColor(color) || !validCaptionColor(symbolColor)) return null
  if (alphaOf(color) === 0) return null
  return { color, symbolColor }
}

/**
 * The app's sign-in waiting page (src/signin-waiting.html) is dark in either theme; its overlay is
 * painted in that page's own `--bg` and `--fg` (test/window-chrome.test.mjs reads them from the file).
 */
const WAITING_PAGE_CAPTION = Object.freeze({ color: '#1b1f23', symbolColor: '#eceff1' })

/** @param {string} url @returns {boolean} the app's local sign-in waiting page, whatever its query. */
function isWaitingPage(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/signin-waiting.html')
  } catch {
    return false
  }
}

/**
 * What the overlay buttons show over one window's page: the waiting page's own palette there, the
 * palette the page measured when it has one, else the theme fallback.
 * @param {{ url: string, dark: boolean, measured?: { color: string, symbolColor: string } | null }} page
 *   `url`: the page's address; `dark`: `nativeTheme.shouldUseDarkColors`; `measured`: `measuredPalette`
 *   of what this page reported, if it did.
 * @returns {{ color: string, symbolColor: string }}
 */
function overlayColors({ url, dark, measured }) {
  if (isWaitingPage(url)) return { ...WAITING_PAGE_CAPTION }
  return measured ?? captionColors(dark)
}

/**
 * What the preload marks on the page.
 * @param {string} platform - `process.platform`.
 * @returns {{ platform: boolean, integratedChrome: boolean, windowsCaption: boolean, fullscreen: boolean }}
 *   `platform`: `<html data-platform>` (dsh marks it everywhere). `integratedChrome`: the kept rail and
 *   the integrated chrome row, Tracy fork patches written for darwin. `windowsCaption`: dsh's Windows
 *   caption row and its in-page menu. `fullscreen`: `<html data-fullscreen>`, where fullscreen hides
 *   window controls the page clears.
 */
function pageMarks(platform) {
  return {
    platform: true,
    integratedChrome: platform === 'darwin',
    windowsCaption: platform === 'win32',
    fullscreen: platform === 'darwin' || platform === 'win32'
  }
}

module.exports = { captionColors, measuredPalette, overlayColors, pageMarks, validCaptionColor, windowChrome }
