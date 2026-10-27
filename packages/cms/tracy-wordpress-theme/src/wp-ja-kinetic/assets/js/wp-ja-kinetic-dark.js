/* wp-ja-kinetic: the dark mode switch.
 *
 * Two states — light and dark — kept for a year in the `tracy_theme` cookie, both written to
 * `data-theme` on the root element. There is no `auto` state: the Joomla source this theme is
 * carried from resolves its theme server-side from `window.jaKineticTheme.def` and its own
 * toggle() is a two-way flip, so no visitor of the original can reach a third state. The
 * default is the page's own, as it is there: dark, except on the Blueprint page (light).
 *
 * This file is enqueued in the head, blocking, so the attribute is on the root before the first
 * paint; the toggle buttons ([data-tracy-theme-toggle]) are wired once the document has parsed.
 * Each click flips light ⇄ dark.
 *
 * The source's own button carries a STATIC accessible name and a hard-coded `aria-pressed=
 * "false"` regardless of which theme is actually resolved (measured live on both light and the
 * dark default: `aria-label="Toggle dark mode" aria-pressed="false"`) — the markup
 * (parts/header.html) already carries both, so this file only ever flips the root itself: the
 * `data-theme` attribute, which the dark palette (theme.overlay.json) and the sun/moon icon swap
 * in assets/css/wp-ja-kinetic.css read, and the `t4-dark` class, which the source's own apply()
 * sets alongside it and which the rules carried over in assets/css/wp-ja-kinetic-sections.css
 * still key on.
 *
 * `?theme=dark|light` on the address wins for that load, over the cookie and the page default, and
 * is never saved: a page framing the site from another origin (Tracy's Design inspiration preview)
 * cannot set this cookie. Only a click on the toggle writes it. */
;(() => {
  const COOKIE = 'tracy_theme'
  const root = document.documentElement
  // The page's own default (inc/extra.php, D-14): Blueprint is light, every other page dark.
  const DEFAULT = root.getAttribute('data-theme-default') === 'light' ? 'light' : 'dark'

  const read = () => {
    const match = document.cookie.match(/(?:^|;\s*)tracy_theme=(light|dark)(?:;|$)/)
    return match ? match[1] : DEFAULT
  }

  const write = (state) => {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE}=${state}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
  }

  const apply = (state) => {
    root.setAttribute('data-theme', state)
    root.classList.toggle('t4-dark', state === 'dark')
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
  // Running in the head, before <body> exists: re-apply once it has parsed, in case something
  // between here and DOMContentLoaded reset the root attribute.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(state))
  }

  document.addEventListener('click', (event) => {
    const target = event.target
    const button = target && target.closest ? target.closest('[data-tracy-theme-toggle]') : null
    if (!button) return
    event.preventDefault()
    state = state === 'dark' ? 'light' : 'dark'
    apply(state)
    write(state)
  })
})()
