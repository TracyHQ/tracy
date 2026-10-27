/* wp-ja-fresco: the colour-scheme state.
 *
 * The source (JA Fresco) has ONE look and no switch (D-01): both halves of every colour preset are
 * the same, so no toggle is drawn and a state changes nothing visible. The wiring stays because the
 * base theme's contract is the same on every Tracy theme (invariant 4): light and dark are
 * `data-theme` on the root element, read from the `tracy_theme` cookie before the first paint;
 * "auto" (no cookie, or an old `auto` one) is its absence. A [data-tracy-theme-toggle] button, if
 * an owner adds one, flips the state and keeps it for a year.
 *
 * `?theme=dark|light` on the address wins for that load and is never saved: a page framing the
 * site from another origin (Tracy's Design inspiration preview) can neither set this cookie nor
 * change the OS preference. Only a click on the toggle writes the cookie. */
;(() => {
  const COOKIE = 'tracy_theme'
  const LABELS = {
    light: 'Theme: light. Switch to dark',
    dark: 'Theme: dark. Switch to light'
  }
  const os = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const root = document.documentElement

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
    if (state === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', state)
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
