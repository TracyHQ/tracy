/* wp-ja-essence: the dark mode switch.
 *
 * Three states — light, dark, auto — kept for a year in the `tracy_theme` cookie. What the page shows is
 * always `data-theme` on the root element: light and dark as chosen, auto as whatever the OS says right
 * now. (Until 1.0.4 auto was the attribute's absence; the theme's hand-written dark rules are all keyed on
 * `[data-theme="dark"]`, so a visitor whose OS is dark got a half-dark page. The source's darkmode.js
 * resolves the OS setting to the attribute too.) Where no script runs, the stylesheet's tokens still follow
 * prefers-color-scheme. This file is enqueued in the head, blocking, so the attribute
 * is on the root before the first paint; the toggle buttons ([data-tracy-theme-toggle]) are wired
 * once the document has parsed. Each click flips what the page shows, light ↔ dark, as the source's
 * darkmode.js does: from `auto` the click goes to the opposite of the OS setting, so the first click always
 * changes the page. `auto` stays a readable cookie value (a saved 1.0.0 choice) but a click never writes it.
 *
 * The source (JA Essence, js/darkmode.js) keeps the choice in a `ja_nova-theme` cookie but reads it back
 * only when the OS setting changes, so a visitor who picked dark sees light again after a reload on a
 * light OS (content-gaps G10, flagged SOURCE). This switch reads its cookie on every load.
 *
 * `?theme=dark|light` on the address wins for that load and is never saved, as in the source
 * (ja_nova 1.2.3 index.php + js/darkmode.js): a page framing the site from another origin (Tracy's
 * Design inspiration preview) can neither set this cookie nor change the OS preference. Only a click
 * on the toggle writes the cookie. */
;(() => {
  const COOKIE = 'tracy_theme'
  const root = document.documentElement

  // What the page shows for a state: `auto` follows the OS (light when it cannot be read).
  const shown = (state) => {
    if (state !== 'auto') return state
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  }
  // The theme writes these in the site's language (`inc/words.php`); without them the button reads English.
  const words = (typeof window.wpJaEssenceWords === 'object' && window.wpJaEssenceWords) || {}
  const label = (state) =>
    shown(state) === 'dark'
      ? words.dark || 'Theme: dark. Switch to light'
      : words.light || 'Theme: light. Switch to dark'

  const read = () => {
    const match = document.cookie.match(/(?:^|;\s*)tracy_theme=(light|dark|auto)(?:;|$)/)
    return match ? match[1] : 'auto'
  }

  const write = (state) => {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE}=${state}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
  }

  const apply = (state) => {
    root.setAttribute('data-theme', shown(state))
    for (const button of document.querySelectorAll('[data-tracy-theme-toggle]')) {
      button.setAttribute('aria-pressed', shown(state) === 'dark' ? 'true' : 'false')
      button.setAttribute('aria-label', label(state))
      button.setAttribute('data-theme-state', state)
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

  // While the state is `auto` the label follows the OS setting.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state === 'auto') apply(state)
    })
  } catch {
    // no matchMedia: the label stays as drawn
  }

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
