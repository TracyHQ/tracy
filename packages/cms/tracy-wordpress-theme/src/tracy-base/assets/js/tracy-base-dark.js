/* tracy-base: the dark mode switch.
 *
 * Three states — light, dark, auto — kept for a year in the `tracy_theme` cookie. Light and dark
 * are `data-theme` on the root element; auto is its absence, and the stylesheet then follows the
 * OS through prefers-color-scheme. This file is enqueued in the head, blocking, so the attribute
 * is on the root before the first paint; the toggle buttons ([data-tracy-theme-toggle]) are wired
 * once the document has parsed. Each click cycles light → dark → auto. */
;(() => {
  const COOKIE = 'tracy_theme'
  const STATES = ['light', 'dark', 'auto']
  const LABELS = {
    light: 'Theme: light. Switch to dark',
    dark: 'Theme: dark. Switch to automatic',
    auto: 'Theme: automatic. Switch to light'
  }
  const root = document.documentElement

  const read = () => {
    const match = document.cookie.match(/(?:^|;\s*)tracy_theme=(light|dark|auto)(?:;|$)/)
    return match ? match[1] : 'auto'
  }

  const write = (state) => {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE}=${state}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
  }

  const apply = (state) => {
    if (state === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', state)
    for (const button of document.querySelectorAll('[data-tracy-theme-toggle]')) {
      button.setAttribute('aria-pressed', state === 'dark' ? 'true' : 'false')
      button.setAttribute('aria-label', LABELS[state])
      button.setAttribute('data-theme-state', state)
    }
  }

  // `?theme=dark|light` on the address wins for THIS load and is not saved: it is how Tracy's
  // Design inspiration preview, which frames the site from another origin, shows the theme it was
  // asked for — it cannot reach this cookie, and a frame cannot change what the page reads as the
  // OS preference (measured 29/09). The same rule as the EmDash themes' Base.astro.
  const asked = () => {
    try {
      const value = new URLSearchParams(location.search).get('theme')
      return value === 'dark' || value === 'light' ? value : null
    } catch {
      return null
    }
  }

  let state = asked() ?? read()
  apply(state)
  // Running in the head, no button exists yet: label them once the body has parsed.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(state))
  }

  document.addEventListener('click', (event) => {
    const target = event.target
    const button = target && target.closest ? target.closest('[data-tracy-theme-toggle]') : null
    if (!button) return
    event.preventDefault()
    state = STATES[(STATES.indexOf(state) + 1) % STATES.length]
    apply(state)
    write(state)
  })
})()
