/* wp-tracy-business: the dark mode switch.
 *
 * Three states — light, dark, auto — kept for a year in the `tracy_theme` cookie. Light and dark
 * are `data-theme` on the root element; auto is its absence, and the stylesheet then follows the
 * OS through prefers-color-scheme. This file is enqueued in the head, blocking, so the attribute
 * is on the root before the first paint; the toggle buttons ([data-tracy-theme-toggle]) are wired
 * once the document has parsed. A click moves to the OPPOSITE of the scheme in effect: from auto
 * on a light OS the first click goes dark, from auto on a dark OS it goes light. (Cycling
 * light → dark → auto meant the first click from auto landed on `light` — no visible change on a
 * light screen, the word still "Dark" — measured 14/09.) Auto is only ever the state before the
 * viewer has chosen; the cookie then holds light or dark.
 *
 * The source's top bar shows the toggle as a word — "Dark" while the page is light, "Light" while
 * it is dark — so the button's visible text ([data-tracy-theme-toggle-text]) names the scheme a
 * click would move to, judged on the EFFECTIVE scheme (auto resolves through the OS). The
 * screen-reader label is that same word: the page prints both words already in the page language
 * (data-text-dark / data-text-light), so the label follows the language with nothing to translate
 * here. */
;(() => {
  const COOKIE = 'tracy_theme'
  const root = document.documentElement
  const osDark = () => Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const effective = (state) => (state === 'auto' ? (osDark() ? 'dark' : 'light') : state)

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
      button.setAttribute('data-theme-state', state)
      const text = button.querySelector('[data-tracy-theme-toggle-text]')
      if (text) {
        const next = effective(state) === 'dark' ? 'light' : 'dark'
        text.textContent = text.getAttribute(`data-text-${next}`) || (next === 'dark' ? 'Dark' : 'Light')
        button.setAttribute('aria-label', text.textContent)
      }
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
  // Auto follows the OS; when the OS flips, the word on the button flips with it.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(state))
  }

  document.addEventListener('click', (event) => {
    const target = event.target
    const button = target && target.closest ? target.closest('[data-tracy-theme-toggle]') : null
    if (!button) return
    event.preventDefault()
    state = effective(state) === 'dark' ? 'light' : 'dark'
    apply(state)
    write(state)
  })
})()
