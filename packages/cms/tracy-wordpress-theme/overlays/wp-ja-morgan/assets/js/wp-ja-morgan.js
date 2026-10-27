/* wp-ja-morgan: the header's off-canvas sidebar and the slideshow's titled tabs.
 *
 * The off-canvas sidebar is the source's "Sidebar" panel (T3 off-canvas, the Site Pages menu):
 * the red button opens it, the close button, Escape or a click outside closes it, and focus goes
 * back to the button. The main menu's own mobile drawer is WordPress's navigation overlay.
 *
 * The slideshow steps through the motion library's carousel; the source shows the slide titles as a
 * row of tabs under the pictures (Owl `dotsData`), so each tab presses the carousel's own dot of the
 * same index, and the tab of the dot the carousel marks current is marked current too.
 *
 * The main menu's dropdown opens on hover (WordPress's navigation submenu, CSS :hover/:focus-within);
 * Escape closes it while the pointer still rests on it, as the source's does, until the pointer or
 * the focus leaves the item.
 *
 * In the mobile menu a submenu stays folded until its caret is pressed, as in the source; the caret
 * toggles the item's `jm-sub-open` class and its own aria-expanded.
 *
 * On a touch screen wide enough for the desktop menu, the first tap on a parent link opens its
 * dropdown and the second follows the link, as in the source (a tap outside closes it).
 *
 * Also here: the tag-list and tagged-items filter bars (a size change submits, Clear empties the
 * box), the Quick Contact form (sent with fetch, answered in place), and the back-to-top button. */
;(() => {
  const strings = window.wpJaMorgan || {}
  const root = document.documentElement

  const offCanvas = () => {
    const panel = document.getElementById('jm-off-canvas')
    const toggle = document.querySelector('.off-canvas-toggle')
    if (!panel || !toggle) return
    const close = panel.querySelector('.close')
    // The page is pushed 250 px aside while the panel is open, as the source's off-canvas effect does (CSS transform on the page
    // wrapper). A transformed ancestor would carry the fixed panel with it, so the panel is a direct child of the body.
    if (panel.parentElement !== document.body) document.body.append(panel)
    const set = (open) => {
      root.classList.toggle('jm-off-canvas-open', open)
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      panel.setAttribute('aria-hidden', open ? 'false' : 'true')
      // A closed panel is out of the tab order (its links used to be reachable by keyboard while hidden).
      panel.inert = !open
      if (open) (panel.querySelector('a, button') || panel).focus()
      else toggle.focus()
    }
    panel.setAttribute('aria-hidden', 'true')
    panel.inert = true
    panel.setAttribute('tabindex', '-1')
    toggle.addEventListener('click', () => set(!root.classList.contains('jm-off-canvas-open')))
    if (close) close.addEventListener('click', () => set(false))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && root.classList.contains('jm-off-canvas-open')) set(false)
    })
    document.addEventListener('click', (event) => {
      if (!root.classList.contains('jm-off-canvas-open')) return
      if (panel.contains(event.target) || toggle.contains(event.target)) return
      set(false)
    })
    if (strings.openMenu) toggle.setAttribute('title', strings.openMenu)
  }

  const slideTabs = () => {
    for (const show of document.querySelectorAll('.acm-slideshow')) {
      const tabs = Array.from(show.querySelectorAll('.jm-slide-tab'))
      if (!tabs.length) continue
      const dots = () => Array.from(show.querySelectorAll('.tracy-motion-dot'))
      tabs.forEach((tab, i) => {
        tab.setAttribute('role', 'button')
        tab.setAttribute('tabindex', '0')
        const press = () => {
          const dot = dots()[i]
          if (dot) dot.click()
        }
        tab.addEventListener('click', press)
        tab.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            press()
          }
        })
      })
      const paint = () => {
        const current = dots().findIndex((dot) => dot.getAttribute('aria-current') === 'true')
        tabs.forEach((tab, i) => {
          tab.classList.toggle('is-current', i === current)
          tab.setAttribute('aria-pressed', i === current ? 'true' : 'false')
        })
      }
      new MutationObserver(paint).observe(show, {
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-current']
      })
      paint()
    }
  }

  const escapeCloses = () => {
    const items = document.querySelectorAll('.t3-mainnav .wp-block-navigation-submenu')
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      for (const item of items) {
        if (!item.matches(':hover, :focus-within')) continue
        item.classList.add('jm-submenu-closed')
        const link = item.querySelector(':scope > a')
        if (item.contains(document.activeElement) && link) link.focus()
      }
    })
    for (const item of items) {
      const reopen = () => item.classList.remove('jm-submenu-closed')
      item.addEventListener('mouseleave', reopen)
      item.addEventListener('focusout', (event) => {
        if (!item.contains(event.relatedTarget)) reopen()
      })
    }
  }

  const foldedSubmenus = () => {
    document.addEventListener(
      'click',
      (event) => {
        const caret =
          event.target instanceof Element
            ? event.target.closest('.is-menu-open .wp-block-navigation-submenu__toggle')
            : null
        if (!caret) return
        event.stopImmediatePropagation()
        const open = caret.closest('.wp-block-navigation-submenu').classList.toggle('jm-sub-open')
        caret.setAttribute('aria-expanded', open ? 'true' : 'false')
      },
      true
    )
    // The overlay starts with every caret reported open by WordPress; the folded state is the truth.
    new MutationObserver(() => {
      for (const caret of document.querySelectorAll('.is-menu-open .wp-block-navigation-submenu__toggle')) {
        const open = caret.closest('.wp-block-navigation-submenu').classList.contains('jm-sub-open')
        if (caret.getAttribute('aria-expanded') !== String(open))
          caret.setAttribute('aria-expanded', String(open))
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] })
  }

  const touchSubmenus = () => {
    let lastPointer = ''
    document.addEventListener('pointerdown', (event) => (lastPointer = event.pointerType || ''), true)
    const parents = () =>
      document.querySelectorAll('.t3-mainnav .wp-block-navigation__container > .wp-block-navigation-submenu')
    const setOpen = (item, open) => {
      item.classList.toggle('jm-touch-open', open)
      const caret = item.querySelector(':scope > .wp-block-navigation-submenu__toggle')
      if (caret) caret.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : null
        if (!target) return
        const link = target.closest(
          '.t3-mainnav .wp-block-navigation__container > .wp-block-navigation-submenu > a.wp-block-navigation-item__content'
        )
        if (link && lastPointer === 'touch' && !link.closest('.is-menu-open')) {
          const item = link.closest('.wp-block-navigation-submenu')
          if (!item.classList.contains('jm-touch-open')) {
            event.preventDefault()
            for (const other of parents()) setOpen(other, other === item)
          }
          return
        }
        if (target.closest('.t3-mainnav .wp-block-navigation__container > .wp-block-navigation-submenu'))
          return
        for (const other of parents()) setOpen(other, false)
      },
      true
    )
  }

  const tagFilters = () => {
    for (const form of document.querySelectorAll('[data-jm-filter]')) {
      const select = form.querySelector('select')
      const input = form.querySelector('input[name="filter-search"]')
      const send = () => (form.requestSubmit ? form.requestSubmit() : form.submit())
      if (select) select.addEventListener('change', send)
      const clear = form.querySelector('[data-jm-filter-clear]')
      if (clear && input)
        clear.addEventListener('click', () => {
          input.value = ''
          send()
        })
    }
  }

  const quickContact = () => {
    for (const form of document.querySelectorAll('[data-jm-quick-contact]')) {
      const status = form.querySelector('.jm-qc-status')
      const button = form.querySelector('button[type="submit"]')
      let latest = 0
      form.addEventListener('submit', async (event) => {
        if (!window.fetch || !window.FormData) return
        event.preventDefault()
        if (form.dataset.busy === '1' || !form.reportValidity()) return
        form.dataset.busy = '1'
        if (button) button.disabled = true
        const mine = ++latest
        const data = new FormData(form)
        data.append('jm_ajax', '1')
        let ok = false
        let message = strings.quickContactFailed || 'The message could not be sent. Please try again later.'
        try {
          // getAttribute: the form holds a field named `action`, which shadows the `form.action` property
          const response = await fetch(form.getAttribute('action'), {
            method: 'POST',
            body: data,
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
          })
          const json = await response.json()
          ok = json.ok === true
          if (typeof json.message === 'string' && json.message) message = json.message
        } catch {
          ok = false
        }
        if (mine !== latest) return
        if (status) {
          status.textContent = ''
          const note = document.createElement('div')
          note.className = ok ? 'alert alert-success' : 'alert alert-danger'
          note.textContent = message
          status.append(note)
        }
        if (ok) form.reset()
        delete form.dataset.busy
        if (button) button.disabled = false
      })
    }
  }

  const backToTop = () => {
    const box = document.querySelector('.back-to-top')
    if (!box) return
    const press = box.querySelector('button')
    const sync = () => box.classList.toggle('is-visible', window.scrollY > 200)
    window.addEventListener('scroll', sync, { passive: true })
    sync()
    if (press)
      press.addEventListener('click', () => {
        const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
      })
  }

  // The panel's own close button is hidden: the open button stays where the source keeps its toggle and
  // closes the menu while it is open, and says so to a screen reader.
  const drawerToggle = () => {
    const nav = document.querySelector('.t3-mainnav')
    if (!nav) return
    const opener = nav.querySelector('.wp-block-navigation__responsive-container-open')
    const panel = nav.querySelector('.wp-block-navigation__responsive-container')
    const closer = nav.querySelector('.wp-block-navigation__responsive-container-close')
    if (!opener || !panel || !closer) return
    const label = opener.getAttribute('aria-label') || ''
    const sync = () => {
      const open = panel.classList.contains('is-menu-open')
      opener.setAttribute('aria-expanded', open ? 'true' : 'false')
      opener.setAttribute('aria-label', open ? strings.closeMenu || 'Close menu' : label)
    }
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] })
    sync()
    document.addEventListener(
      'click',
      (event) => {
        const hit =
          event.target instanceof Element
            ? event.target.closest('.wp-block-navigation__responsive-container-open')
            : null
        if (!hit || hit !== opener || !panel.classList.contains('is-menu-open')) return
        event.preventDefault()
        event.stopImmediatePropagation()
        closer.click()
        opener.focus()
      },
      true
    )
  }

  const start = () => {
    foldedSubmenus()
    drawerToggle()
    touchSubmenus()
    offCanvas()
    slideTabs()
    escapeCloses()
    tagFilters()
    quickContact()
    backToTop()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
  // The Login field takes focus on load as the source's does, without the browser scrolling it into view.
  const loginField = document.querySelector('.login-wrap input[name="log"], .login-wrap #jm-username')
  if (loginField && !document.activeElement.matches('input, textarea, select'))
    loginField.focus({ preventScroll: true })
  document.addEventListener('click', (event) => {
    const close = event.target.closest && event.target.closest('.jm-system-message__close')
    if (close && close.parentElement) close.parentElement.remove()
  })
})()
