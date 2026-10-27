/* wp-ja-impact: the dark mode switch.
 *
 * The visible theme is light or dark; a click flips whichever one is showing, as the source's darkmode.js does. The
 * choice is kept for a year in the `tracy_theme` cookie. Light and dark are `data-theme` on the root element; "auto" (no
 * cookie yet, or an old `auto` one) is its absence, and the stylesheet then follows the OS through prefers-color-scheme.
 * The first click from auto therefore always changes the page: it picks the opposite of what the OS shows. This file is
 * enqueued in the head, blocking, so the attribute is on the root before the first paint; the toggle buttons
 * ([data-tracy-theme-toggle] — one in the desktop header bar, one in the phone header) are wired once the document has
 * parsed.
 *
 * The source (JA Impact, js/darkmode.js) keeps the choice in a `ja_impact-theme` cookie and its head script
 * (index.php:50-75) reads it on every load, else the template default (`auto`), else the OS preference. This
 * switch does the same with the `tracy_theme` cookie.
 *
 * `?theme=dark|light` on the address wins for that load and is never saved, as in the source
 * (ja_impact 1.2.2 index.php + js/darkmode.js): a page framing the site from another origin (Tracy's
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
    if (state === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', state)
    const now = shown(state)
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
