/* wp-ja-nova: the dark mode switch.
 *
 * The visible theme is light or dark; a click flips whichever one is showing, as the source's
 * darkmode.js does. The choice is kept for a year in the `tracy_theme` cookie. What the page shows is
 * always `data-theme` on the root element: light and dark as chosen, "auto" (no cookie yet, or an
 * old `auto` one) as whatever the OS says right now. (Until 1.1.5 auto was the attribute's absence;
 * the hand-written dark rules are keyed on `[data-theme="dark"]`, so a visitor whose OS is dark and
 * who had chosen nothing got a half-dark page: the typography page's cards stayed white. The
 * source's darkmode.js resolves the OS setting to the attribute too.) Where no script runs, the
 * stylesheet's tokens still follow prefers-color-scheme. The first click from auto always changes
 * the page: it picks the opposite of what the OS shows. This file is enqueued in the head,
 * blocking, so the attribute is on the root before the first paint; the toggle buttons
 * ([data-tracy-theme-toggle], one in the desktop bar and one beside the drawer button) are wired
 * once the document has parsed.
 *
 * The source (JA Nova, js/darkmode.js) keeps the choice in a `ja_nova-theme` cookie but reads it back
 * only when the OS setting changes, so a visitor who picked dark sees light again after a reload on a
 * light OS (content-gaps G10, flagged SOURCE). This switch reads its cookie on every load.
 *
 * `?theme=dark|light` on the address wins for that load and is never saved, as in the source
 * (ja_nova 1.2.3 index.php + js/darkmode.js): a page framing the site from another origin (Tracy's
 * Design inspiration preview) can neither set this cookie nor change the OS preference. Only a click
 * on the toggle writes the cookie. */
;(() => {
  const COOKIE = 'tracy_theme'
  const LABELS = {
    light: 'Theme: light. Switch to dark',
    dark: 'Theme: dark. Switch to light'
  }
  const root = document.documentElement
  const os = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

  const read = () => {
    const match = document.cookie.match(/(?:^|;\s*)tracy_theme=(light|dark|auto)(?:;|$)/)
    return match ? match[1] : 'auto'
  }

  const write = (state) => {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE}=${state}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
  }

  // What the page shows for a state: auto shows what the OS asks for.
  const shown = (state) =>
    state === 'dark' || state === 'light' ? state : os && os.matches ? 'dark' : 'light'

  const apply = (state) => {
    const now = shown(state)
    root.setAttribute('data-theme', now)
    for (const button of document.querySelectorAll('[data-tracy-theme-toggle]')) {
      button.setAttribute('aria-pressed', now === 'dark' ? 'true' : 'false')
      button.setAttribute('aria-label', LABELS[now])
      button.setAttribute('data-theme-state', now)
    }
  }

  // The first `theme` value decides: `?theme=purple&theme=dark` and `?theme=&theme=dark` ask for
  // nothing valid, so the cookie and the default stand.
  const asked = () => {
    try {
      const value = new URLSearchParams(location.search).get('theme')
      return value === 'dark' || value === 'light' ? value : ''
    } catch {
      return ''
    }
  }

  let state = asked() || read()
  apply(state)
  // Running in the head, no button exists yet: label them once the body has parsed.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(state))
  }
  // In auto the page follows the OS live, so the buttons' label and icon must too.
  if (os && os.addEventListener) os.addEventListener('change', () => state === 'auto' && apply(state))

  document.addEventListener('click', (event) => {
    const target = event.target
    const button = target && target.closest ? target.closest('[data-tracy-theme-toggle]') : null
    if (!button) return
    event.preventDefault()
    state = shown(state) === 'dark' ? 'light' : 'dark'
    apply(state)
    write(state)
  })
})()
