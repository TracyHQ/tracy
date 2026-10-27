/* wp-ja-fresco: the Book Table dialog, the back-to-top button, the menu button's label and the
 * main menu's drawer and dropdown.
 *
 * Book Table is the source's Bootstrap modal: the header button (a link to #jf-book-table, which
 * still lands on the dialog without this script through :target) opens it; the close button,
 * Escape or a click on the dark backdrop closes it, focus stays inside while it is open and goes
 * back to the button that opened it.
 *
 * The search page's "Advanced Search" button folds the search tips, as the source's collapse does.
 *
 * The back-to-top button shows once the page has been scrolled about 46 px, as the source's does
 * (its body class `top-away`, measured 21/10/2026: off at 45 px, on at 48 px).
 *
 * The main menu's mobile drawer is WordPress's navigation overlay; its open button takes the theme's
 * words as its title. Drawn as the source's off-canvas drawer, it carries the site logo in its head (a
 * copy of the header's), a click on the page beside it closes it, and a submenu stays folded until its
 * caret is pressed; the caret toggles the item's `jf-sub-open` class and its own aria-expanded.
 *
 * The desktop dropdown opens on hover (WordPress's navigation submenu, CSS :hover/:focus-within);
 * Escape closes it while the pointer still rests on it, as the source's does, until the pointer or the
 * focus leaves the item. On a touch screen the first tap on a parent item opens its dropdown and the
 * second follows the link, as the source's does (measured at 1024 and 1180 px, 21/10/2026).
 *
 * The gallery strip moves only when a visitor steps it (the motion library has no autoplay, D-05).
 *
 * The cursor ring is the source's curDot effect: a ring that trails the mouse pointer, grows and
 * fills over headings and shrinks over links. It appears on the first mouse move, so touch screens
 * never show it, and it is left out when the visitor asks for reduced motion (D-13). */
;(() => {
  const strings = window.wpJaFresco || {}
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  const bookTable = () => {
    const modal = document.getElementById('jf-book-table')
    if (!modal) return
    const dialog = modal.querySelector('.jf-book-dialog') || modal
    // A transformed or clipped ancestor would carry the fixed backdrop with it.
    if (modal.parentElement !== document.body) document.body.append(modal)
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    const title = modal.querySelector('.book-title')
    if (title) {
      title.id ||= 'jf-book-table-title'
      modal.setAttribute('aria-labelledby', title.id)
    }
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'jf-book-close'
    close.setAttribute('aria-label', strings.closeDialog || 'Close')
    close.innerHTML = '<span aria-hidden="true">&times;</span>'
    dialog.append(close)
    let opener = null
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      )
    const isOpen = () => modal.classList.contains('is-open')
    const set = (open) => {
      modal.classList.toggle('is-open', open)
      modal.inert = !open
      document.documentElement.style.overflow = open ? 'hidden' : ''
      if (open) {
        ;(focusables()[0] || dialog).focus()
      } else {
        if (location.hash === '#jf-book-table')
          history.replaceState(null, '', location.pathname + location.search)
        if (opener) opener.focus()
        opener = null
      }
    }
    modal.inert = true
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href$="#jf-book-table"]')
      if (link) {
        event.preventDefault()
        opener = link
        set(true)
        return
      }
      if (!isOpen()) return
      if (event.target === close || close.contains(event.target) || event.target === modal) set(false)
    })
    document.addEventListener('keydown', (event) => {
      if (!isOpen()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        set(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    })
    // Arriving with #jf-book-table in the address opens the dialog the same way.
    if (location.hash === '#jf-book-table') set(true)
  }

  const backToTop = () => {
    const wrap = document.querySelector('.back-to-top')
    if (!wrap) return
    const button = wrap.querySelector('button')
    const paint = () => wrap.classList.toggle('is-shown', window.scrollY > 45)
    window.addEventListener('scroll', paint, { passive: true })
    paint()
    if (button)
      button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' })
        const skip = document.querySelector('.skip-link, a[href="#wp--skip-link--target"]')
        ;(skip || document.body).focus?.({ preventScroll: true })
      })
  }

  const menuLabels = () => {
    for (const open of document.querySelectorAll(
      '.t4-mainnav .wp-block-navigation__responsive-container-open'
    )) {
      if (strings.openMenu) open.setAttribute('title', strings.openMenu)
    }
    for (const close of document.querySelectorAll(
      '.t4-mainnav .wp-block-navigation__responsive-container-close'
    )) {
      if (strings.closeMenu) close.setAttribute('title', strings.closeMenu)
    }
  }

  const drawer = () => {
    const container = document.querySelector('.t4-mainnav .wp-block-navigation__responsive-container')
    const dialog = container && container.querySelector('.wp-block-navigation__responsive-dialog')
    const logo = document.querySelector('.t4-header .jf-logo a')
    if (dialog && logo && !dialog.querySelector('.jf-drawer-head')) {
      const head = document.createElement('div')
      head.className = 'jf-drawer-head'
      const copy = logo.cloneNode(true)
      copy.removeAttribute('id')
      copy.setAttribute('tabindex', '-1')
      head.append(copy)
      dialog.prepend(head)
    }
    if (!container) return
    document.addEventListener('click', (event) => {
      if (!container.classList.contains('is-menu-open')) return
      const target = event.target instanceof Element ? event.target : null
      if (
        !target ||
        container.contains(target) ||
        target.closest('.wp-block-navigation__responsive-container-open')
      )
        return
      const close = container.querySelector('.wp-block-navigation__responsive-container-close')
      if (close) close.click()
    })
    document.addEventListener(
      'click',
      (event) => {
        const caret =
          event.target instanceof Element
            ? event.target.closest('.is-menu-open .wp-block-navigation-submenu__toggle')
            : null
        if (!caret) return
        event.stopImmediatePropagation()
        const open = caret.closest('.wp-block-navigation-submenu').classList.toggle('jf-sub-open')
        caret.setAttribute('aria-expanded', open ? 'true' : 'false')
      },
      true
    )
    // The overlay starts with every caret reported open by WordPress; the folded state is the truth.
    new MutationObserver(() => {
      for (const caret of container.querySelectorAll('.wp-block-navigation-submenu__toggle')) {
        if (!container.classList.contains('is-menu-open')) break
        const open = caret.closest('.wp-block-navigation-submenu').classList.contains('jf-sub-open')
        if (caret.getAttribute('aria-expanded') !== String(open))
          caret.setAttribute('aria-expanded', String(open))
      }
    }).observe(container, { subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'class'] })
  }

  const escapeCloses = () => {
    const items = document.querySelectorAll('.t4-mainnav .wp-block-navigation-submenu')
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      for (const item of items) {
        if (item.closest('.is-menu-open') || !item.matches(':hover, :focus-within')) continue
        item.classList.add('jf-submenu-closed')
        const link = item.querySelector(':scope > a')
        if (item.contains(document.activeElement) && link) link.focus()
      }
    })
    for (const item of items) {
      const reopen = () => item.classList.remove('jf-submenu-closed')
      item.addEventListener('mouseleave', reopen)
      item.addEventListener('focusout', (event) => {
        if (!item.contains(event.relatedTarget)) reopen()
      })
    }
  }

  const touchOpens = () => {
    const items = [...document.querySelectorAll('.t4-mainnav .wp-block-navigation-submenu')]
    let touch = false
    document.addEventListener(
      'pointerdown',
      (event) => {
        touch = event.pointerType === 'touch'
      },
      true
    )
    const close = (except) => {
      for (const item of items) if (item !== except) item.classList.remove('jf-touch-open')
    }
    for (const item of items) {
      const link = item.querySelector(':scope > a')
      if (!link) continue
      link.addEventListener('click', (event) => {
        if (!touch || item.closest('.is-menu-open') || item.classList.contains('jf-touch-open')) return
        event.preventDefault()
        close(item)
        item.classList.add('jf-touch-open')
      })
    }
    document.addEventListener('click', (event) => {
      if (!items.some((item) => item.contains(event.target))) close(null)
    })
  }

  // The source's curDot settings: a 40px ring easing toward the pointer by a quarter of the gap each frame.
  const cursor = () => {
    if (reduced.matches) return
    const size = 40
    const easing = 4
    const ring = document.createElement('div')
    ring.className = 'jf-cursor'
    ring.setAttribute('aria-hidden', 'true')
    const aim = { x: 0, y: 0, d: size }
    const at = { x: 0, y: 0, d: size, o: 0 }
    const step = () => {
      at.x += (aim.x - at.x) / easing
      at.y += (aim.y - at.y) / easing
      at.d += (aim.d - at.d) / easing
      at.o += (1 - at.o) / easing
      ring.style.width = ring.style.height = `${at.d}px`
      ring.style.opacity = String(at.o)
      ring.style.transform = `translate3d(${at.x - at.d / 2}px, ${at.y - at.d / 2}px, 0)`
      requestAnimationFrame(step)
    }
    document.addEventListener('mousemove', (event) => {
      aim.x = event.clientX
      aim.y = event.clientY
      if (ring.isConnected) return
      at.x = aim.x
      at.y = aim.y
      document.body.append(ring)
      requestAnimationFrame(step)
    })
    const grow = '.t4-cursor-highlight, h1, h2, h3, .h1, .h2, .h3'
    document.addEventListener('mouseover', (event) => {
      const over = event.target instanceof Element ? event.target : null
      const big = over?.closest(grow)
      const link = over?.closest('a')
      aim.d = link ? size * 0.8 : big ? size * 1.8 : size
      ring.classList.toggle('is-filled', Boolean(big || link))
    })
  }

  // The search page's "Advanced Search" button folds and unfolds the search tips (the source's
  // Bootstrap collapse, open on load).
  const finderTips = () => {
    const button = document.querySelector('.jf-finder-toggle')
    const tips = document.getElementById('advancedSearch')
    if (!button || !tips) return
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true'
      button.setAttribute('aria-expanded', String(open))
      tips.hidden = !open
    })
  }

  const start = () => {
    bookTable()
    finderTips()
    backToTop()
    menuLabels()
    drawer()
    escapeCloses()
    touchOpens()
    cursor()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
