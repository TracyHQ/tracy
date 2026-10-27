/* wp-ja-impact: header and page behaviour. Each job works on elements the theme's parts and patterns
 * draw, and on nothing else of the page:
 *
 *   drawer — below the desktop breakpoint the header menu is a drawer from the left, as the source's
 *            off-canvas is: opened by `.jim-drawer-toggle`, closed by its × button (`.jim-drawer-close`),
 *            Escape or a click on the dimmed page; focus goes back to the toggle. Inside it every parent item
 *            (Pages, its three columns) opens as a drill-down panel with a back row — the state is the toggle's
 *            aria-expanded, which this script owns below 992 px (WordPress's navigation script owns it above).
 *            Below 992 px the panel lives on `<body>` (the part that holds it is a stored row, so it cannot be
 *            moved in the markup): a transform on the page wrapper pushes the page aside while it is open,
 *            and a transform would turn a fixed panel inside that wrapper into a page-long one. Closed, the
 *            panel is `inert`; from 992 px it goes back to its place in the header.
 *   menus  — from 992 px a parent item opens on a press of its label or its caret (touch has no hover) and closes
 *            on a press outside it; hover and keyboard stay with the stylesheet and WordPress's navigation script.
 *
 * Page-group scripts (assets/js/groups/*.js) add the behaviour of their own sections. */
;(() => {
  const t = window.wpJaImpact || {}
  const desktop = window.matchMedia ? window.matchMedia('(min-width: 992px)') : { matches: true }

  const toggle = document.querySelector('.jim-drawer-toggle')
  const drawer = toggle ? document.getElementById(toggle.getAttribute('aria-controls') || '') : null
  const isDrawerOpen = () => document.documentElement.classList.contains('jim-drawer-open')
  // Where the panel sits in the header, kept so that it can go back from `<body>`.
  const drawerHome = drawer && drawer.parentNode ? document.createComment('jim-drawer-home') : null
  if (drawerHome) drawer.before(drawerHome)
  const placeDrawer = () => {
    if (!drawer || !drawerHome || !drawerHome.parentNode) return
    if (desktop.matches) {
      drawer.inert = false
      if (drawer.parentNode !== drawerHome.parentNode) drawerHome.after(drawer)
    } else {
      if (drawer.parentNode !== document.body) document.body.append(drawer)
      drawer.inert = !isDrawerOpen()
    }
  }
  const setDrawer = (open, { restore = false } = {}) => {
    if (!toggle || !drawer) return
    document.documentElement.classList.toggle('jim-drawer-open', open)
    if (!desktop.matches) drawer.inert = !open
    if (!open && typeof closeAll === 'function') closeAll()
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggle.setAttribute('aria-label', open ? t.closeMenu || 'Close the menu' : t.openMenu || 'Open the menu')
    if (open) {
      // The drawer is still visibility: hidden in the first frame of its transition, where focus()
      // does nothing: focus its first control once it shows (and again when the slide ends).
      const first = drawer.querySelector('.jim-drawer-close, a, button')
      const focus = () => {
        if (first && isDrawerOpen() && document.activeElement !== first) first.focus()
      }
      requestAnimationFrame(() => requestAnimationFrame(focus))
      drawer.addEventListener('transitionend', focus, { once: true })
    } else if (restore) toggle.focus()
  }
  if (toggle && drawer) {
    let close = drawer.querySelector('.jim-drawer-close')
    if (!close) {
      close = document.createElement('button')
      close.type = 'button'
      close.className = 'jim-drawer-close'
      close.textContent = '×'
      const head = drawer.querySelector('.jim-drawer__head') || drawer
      head.append(close)
    }
    close.setAttribute('aria-label', t.closeMenu || 'Close the menu')
    close.addEventListener('click', () => setDrawer(false, { restore: true }))
    toggle.addEventListener('click', () => setDrawer(!isDrawerOpen(), { restore: isDrawerOpen() }))
    document.addEventListener('click', (event) => {
      if (!isDrawerOpen()) return
      if (drawer.contains(event.target) || toggle.contains(event.target)) return
      setDrawer(false, { restore: true })
    })
    placeDrawer()
    if (desktop.addEventListener)
      desktop.addEventListener('change', () => {
        if (desktop.matches) setDrawer(false)
        placeDrawer()
      })
  }
  // ── Parent items ─────────────────────────────────────────────────────────────────────────────────
  const menu = document.querySelector('.jim-header__menu')
  const parents = menu ? [...menu.querySelectorAll('li.wp-block-navigation-submenu')] : []
  const partsOf = (item) => ({
    toggle:
      [...item.children].find((c) => c.classList.contains('wp-block-navigation-submenu__toggle')) || null,
    label: [...item.children].find((c) => c.classList.contains('wp-block-navigation-item__content')) || null,
    panel:
      [...item.children].find((c) => c.classList.contains('wp-block-navigation__submenu-container')) || null
  })
  const isOpen = (item) => {
    const { toggle } = partsOf(item)
    return Boolean(toggle) && toggle.getAttribute('aria-expanded') === 'true'
  }
  const openParents = () => parents.filter(isOpen)
  // The panel that shows now: the open one with no open parent item inside it.
  const deepest = () =>
    openParents()
      .filter((item) => !openParents().some((other) => other !== item && item.contains(other)))
      .pop() || null
  // While a panel covers the list, nothing behind it takes focus or a click.
  const syncDrill = () => {
    const top = deepest()
    const panel = top ? partsOf(top).panel : null
    if (menu) menu.classList.toggle('jim-drill', Boolean(panel))
    if (panel && drawer) drawer.scrollTop = 0
    // a panel opened inside a scrolled panel starts at the top of the one that covers it
    if (panel)
      for (let up = panel.parentElement; up && up !== menu; up = up.parentElement)
        if (up.matches('.wp-block-navigation__submenu-container')) up.scrollTop = 0
    for (const node of menu
      ? menu.querySelectorAll(
          '.wp-block-navigation-item__content, .wp-block-navigation-submenu__toggle, .jim-drill-back__button'
        )
      : []) {
      node.inert = Boolean(panel) && !panel.contains(node)
    }
  }
  const setParent = (item, open, { focus = true } = {}) => {
    const { toggle, panel } = partsOf(item)
    if (!toggle || !panel) return
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (!open) {
      // closing a panel closes the ones inside it
      for (const inner of parents)
        if (inner !== item && item.contains(inner) && isOpen(inner))
          inner
            .querySelector(':scope > .wp-block-navigation-submenu__toggle')
            .setAttribute('aria-expanded', 'false')
    }
    syncDrill()
    if (!focus) return
    if (open) {
      const back = panel.querySelector(':scope > .jim-drill-back .jim-drill-back__button')
      // the panel is display:none until the attribute lands; focus on the next frame
      requestAnimationFrame(() => isOpen(item) && back && back.focus())
    } else toggle.focus()
  }
  const closeAll = () => {
    for (const item of parents) {
      const { toggle } = partsOf(item)
      if (toggle) toggle.setAttribute('aria-expanded', 'false')
    }
    syncDrill()
  }
  // A back row heads every panel (hidden from 992 px by the stylesheet).
  for (const item of parents) {
    const { label, panel } = partsOf(item)
    if (!panel || panel.querySelector(':scope > .jim-drill-back')) continue
    const row = document.createElement('li')
    row.className = 'jim-drill-back'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jim-drill-back__button'
    button.textContent = (label && label.textContent.trim()) || t.back || 'Back'
    button.setAttribute('aria-label', `${t.backTo || 'Back'}: ${button.textContent}`)
    row.append(button)
    panel.prepend(row)
  }
  let syncing = false
  const parentOf = (node) => (node && node.closest ? node.closest('li.wp-block-navigation-submenu') : null)
  // A press on a parent's label (a link with no address) or caret: below 992 px the drawer opens that item's panel, from
  // 992 px the press goes to WordPress's own toggle (open/close state), which the stylesheet reads.
  document.addEventListener(
    'click',
    (event) => {
      if (syncing || !menu || !menu.contains(event.target)) return
      const back = event.target.closest('.jim-drill-back__button')
      if (back) {
        const item = parentOf(back.closest('.wp-block-navigation__submenu-container'))
        if (item) setParent(item, false)
        return
      }
      const item = parentOf(event.target)
      if (!item || !partsOf(item).toggle) return
      const { toggle, label } = partsOf(item)
      const onToggle = toggle.contains(event.target)
      const onLabel = Boolean(label) && label.contains(event.target) && !label.getAttribute('href')
      if (!onToggle && !onLabel) return
      if (!desktop.matches) {
        event.preventDefault()
        event.stopPropagation()
        setParent(item, !isOpen(item))
      } else if (
        onLabel &&
        item.parentElement &&
        item.parentElement.classList.contains('wp-block-navigation__container') &&
        !item.parentElement.closest('.wp-block-navigation-submenu')
      ) {
        // top-level label: same as its caret
        event.preventDefault()
        toggle.click()
      }
    },
    true
  )
  // WordPress's hover and focus handlers would rewrite aria-expanded under the drawer's drill-down: below 992 px they
  // never see the pointer.
  for (const type of ['pointerenter', 'pointerleave']) {
    document.addEventListener(
      type,
      (event) => {
        if (!desktop.matches && event.target instanceof Element && event.target.closest('.jim-header__menu'))
          event.stopPropagation()
      },
      true
    )
  }
  // A press outside an open desktop panel closes it.
  document.addEventListener('click', (event) => {
    if (!desktop.matches || syncing) return
    for (const item of openParents()) {
      if (item.contains(event.target)) continue
      const { toggle } = partsOf(item)
      syncing = true
      try {
        toggle.click()
      } finally {
        syncing = false
      }
    }
  })
  // Crossing 992 px: the drill-down is the drawer's alone, WordPress's open state the desktop's alone — settle both.
  const settle = () => {
    syncing = true
    try {
      for (const item of openParents()) {
        const { toggle } = partsOf(item)
        // going to desktop the attribute was ours; going to the drawer it was WordPress's, so its own toggle closes it
        if (desktop.matches) toggle.setAttribute('aria-expanded', 'false')
        else toggle.click()
      }
    } finally {
      syncing = false
    }
    closeAll()
  }
  if (desktop.addEventListener) desktop.addEventListener('change', settle)
  syncDrill()

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const top = !desktop.matches ? deepest() : null
    if (top) {
      // a drill-down panel is open: Escape goes back one level before it closes the drawer
      event.preventDefault()
      setParent(top, false)
    } else if (isDrawerOpen()) setDrawer(false, { restore: true })
    else if (
      desktop.matches &&
      menu &&
      menu.contains(document.activeElement) &&
      parentOf(document.activeElement)
    ) {
      // a panel a keyboard opened by focus alone closes when focus leaves it (WordPress's Escape only closes a pressed one)
      document.activeElement.blur()
    }
  })

  // The password field's toggle: show or hide what was typed (Joomla's `input-password-toggle`).
  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('.input-password-toggle')
    const input = button && button.parentElement.querySelector('input')
    if (!input) return
    const show = input.type === 'password'
    input.type = show ? 'text' : 'password'
    button.classList.toggle('is-shown', show)
  })

  // Back to top (the source's `#back-to-top`): shown once the page has been scrolled past the header, as the source does with
  // its `top-away` class on <body>; a press scrolls to the top (smoothly unless the visitor asked for less motion).
  const topButton = document.getElementById('back-to-top')
  if (topButton) {
    const sync = () =>
      document.body.classList.toggle('top-away', (window.scrollY || document.documentElement.scrollTop) > 250)
    window.addEventListener('scroll', sync, { passive: true })
    sync()
    topButton.addEventListener('click', (event) => {
      event.preventDefault()
      const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })
    })
  }
})()
