/* wp-ja-kinetic: mobile drawer drill navigation (C-18).
 *
 * Source: css/template.css:20366-20486 — `.kinetic-offcanvas` replaces its WHOLE top-level list
 * with a submenu's own items when a parent opens (a full-panel "drill", `kinetic-drill-back` row
 * at the top), not an in-place accordion, and opens with every item collapsed (measured live:
 * every top-level `aria-expanded="false"` on first open, even the current page's own parent).
 *
 * Core's own Navigation block already opens a submenu's markup in place
 * (`.wp-block-navigation-submenu__toggle[aria-expanded]` + its sibling
 * `.wp-block-navigation__submenu-container`) and auto-expands the CURRENT page's own parent on
 * load for its own accessibility contract — neither matches the source, and core does not treat
 * "one submenu open at a time" as a hard rule for click-opened items, so this file does not read
 * `aria-expanded` for its own drill state. It tracks which top-level item was drilled into with
 * its own class (`.tracy-drill-open`), driven only by real clicks on a parent's own toggle and on
 * the back row (inc/extra.php's `wp_ja_kinetic_drawer_drill_back()`); the drill CSS in
 * assets/css/wp-ja-kinetic.css reads that class, not core's own state. Core's toggle still flips
 * its own `aria-expanded`/`aria-controls` for screen readers — untouched, just not read here.
 *
 * Also mirrors open/closed onto `aria-hidden` on the responsive container — the source's own
 * `<aside aria-hidden="true">` while closed (measured live), which core's container carries no
 * equivalent of on its own (it relies on the `hidden-by-default` class plus focus trapping).
 *
 * The drill trigger is each parent's own LINK, not its submenu-toggle icon button: core's own
 * default-overlay stylesheet (`wp-includes/blocks/navigation/style.min.css`) hides
 * `.wp-block-navigation__submenu-icon` outright inside an open overlay — measured live, every
 * toggle computed `display:none` there, by a rule four classes deep this theme's own three-class
 * override cannot outrank — and pre-expands every submenu's `aria-expanded` to `true` on open,
 * since the default overlay has no click-to-expand affordance of its own to read state from. The
 * parent's own `<a>` (`.wp-block-navigation-item__content`) stays visible and clickable there
 * instead, so that is what this file drills on.
 */
;(() => {
  const root = document.querySelector('.tracy-header__menu .wp-block-navigation__responsive-container')
  const list = root ? root.querySelector('.wp-block-navigation__container') : null
  if (!root || !list) return
  const topLevel = [...list.children]

  // Sub-labels. The source's drawer is a flat mod_menu; its own script (js/darkmode.js,
  // initDrill) regroups each drilled panel under the desktop mega panel's column titles — rows
  // matched to a column by link, columns in order, one label per column, rows no column names
  // kept in order at the end, unlabelled (measured live: Product → Platform / Content / Discover,
  // FAQ last). Done the same way here, reading the mega blocks of this header part.
  const pathOf = (href) => {
    try {
      return new URL(href, location.origin).pathname.replace(/\/$/, '')
    } catch {
      return href
    }
  }
  const labelOf = (el) => (el ? el.textContent.trim().toLowerCase() : '')
  for (const li of topLevel) {
    const menu = li.querySelector(':scope > .wp-block-navigation__submenu-container')
    const name = labelOf(li.querySelector(':scope > .wp-block-navigation-item__content'))
    const mega = [...document.querySelectorAll('.tracy-mega')].find(
      (m) => labelOf(m.querySelector('.tracy-mega__label')) === name
    )
    if (!menu || !mega) continue
    const rows = new Map()
    for (const row of menu.querySelectorAll(':scope > li')) {
      const a = row.querySelector(':scope > a[href]')
      if (a) rows.set(pathOf(a.getAttribute('href')), row)
    }
    const used = new Set()
    for (const title of mega.querySelectorAll('.tracy-mega__title')) {
      const column = [...title.parentElement.querySelectorAll('.tracy-mega__links a[href]')]
        .map((a) => pathOf(a.getAttribute('href')))
        .filter((href) => rows.has(href) && !used.has(href))
      if (!column.length) continue
      const label = document.createElement('li')
      label.className = 'tracy-nav__drill-sublabel'
      label.setAttribute('role', 'presentation')
      label.textContent = title.textContent.trim()
      menu.append(label)
      for (const href of column) {
        menu.append(rows.get(href))
        used.add(href)
      }
    }
    for (const [href, row] of rows) if (!used.has(href)) menu.append(row)
  }

  const setDrill = (li) => {
    for (const item of topLevel) item.classList.toggle('tracy-drill-open', item === li)
    if (li) root.setAttribute('data-tracy-drill', '1')
    else root.removeAttribute('data-tracy-drill')
  }

  // The modal root carries core's own `data-wp-on--focusout="actions.handleMenuFocusout"` — a
  // `preventDefault()`+`stopPropagation()`'d click alone still closed the whole drawer (measured
  // live): the click itself does not bubble to close it, a FOCUSOUT it triggers does (clicking a
  // `href="#"` link shifts focus in a way core's own handler reads as "focus left the menu").
  // Swallowing one `focusout` right after our own drill click keeps the modal open without
  // touching core's handler for every other real case (Escape, a genuine outside click/tab).
  let suppressNextFocusout = false
  root.addEventListener(
    'focusout',
    (event) => {
      if (!suppressNextFocusout) return
      suppressNextFocusout = false
      event.stopImmediatePropagation()
    },
    true
  )

  list.addEventListener(
    'click',
    (event) => {
      // the row's link, or core's chevron button beside it: that button flipped aria-expanded
      // while the drill CSS kept the submenu hidden, so it announced "expanded" and opened nothing
      const link = event.target.closest(
        '.wp-block-navigation-item__content, .wp-block-navigation-submenu__toggle'
      )
      const li = link ? link.closest('li') : null
      if (!li || li.parentElement !== list || !li.classList.contains('has-child')) return
      event.preventDefault()
      suppressNextFocusout = true
      setDrill(li)
    },
    true
  )

  // The back row has no behaviour of its own — it only returns to the flat top-level list; core's
  // own submenu stays however core left it, since this file never reads that state back.
  root.addEventListener(
    'click',
    (event) => {
      if (!event.target.closest('[data-tracy-drill-back]')) return
      event.preventDefault()
      suppressNextFocusout = true
      setDrill(null)
    },
    true
  )

  let wasOpen = root.classList.contains('is-menu-open')
  const syncOpenState = () => {
    const isOpen = root.classList.contains('is-menu-open')
    root.setAttribute('aria-hidden', isOpen ? 'false' : 'true')
    // a closed panel takes no focus and no clicks (a hidden panel that stays in the tab order is a trap)
    root.inert = !isOpen
    // The source's drawer always opens flat, closed submenu — reset the drill on every fresh
    // open, matching that, rather than leaving it wherever a previous visit left off.
    if (isOpen && !wasOpen) setDrill(null)
    wasOpen = isOpen
  }
  new MutationObserver(syncOpenState).observe(root, { attributes: true, attributeFilter: ['class'] })
  syncOpenState()

  // A click on the page beside the open drawer closes it, as the source's backdrop does
  // (`.t4-offcanvas` overlay). Core's overlay has no backdrop: wider than 400px the page stayed
  // clickable next to the panel and the drawer stayed open. Below 400px the drawer is the viewport.
  document.addEventListener(
    'click',
    (event) => {
      if (!root.classList.contains('is-menu-open') || root.contains(event.target)) return
      if (event.target.closest('.wp-block-navigation__responsive-container-open')) return
      event.preventDefault()
      event.stopPropagation()
      root.querySelector('.wp-block-navigation__responsive-container-close')?.click()
    },
    true
  )
})()
