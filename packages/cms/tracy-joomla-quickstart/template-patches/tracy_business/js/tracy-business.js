/**
 * Tracy Business — chrome behaviour.
 *
 * Three small things the header needs beyond what T4 ships:
 *   1. the search toggle reveals the `search` module position and moves focus into it;
 *   2. the language dropdown in the topbar opens on click and closes on outside click / Escape;
 *   3. Escape and outside click close an open megamenu (the source left both unwired).
 * Theme switching is js/darkmode.js; the off-canvas drawer is T4's own js-offcanvas.
 */
;(function () {
  'use strict'

  function closeSearch(btn, panel) {
    panel.hidden = true
    btn.setAttribute('aria-expanded', 'false')
  }

  document.querySelectorAll('[data-tb-search-toggle]').forEach(function (btn) {
    const panel = document.getElementById(btn.getAttribute('aria-controls'))
    if (!panel) {
      return
    }

    btn.addEventListener('click', function () {
      const open = panel.hidden
      panel.hidden = !open
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) {
        const field = panel.querySelector('input[type="search"], input[type="text"]')
        if (field) {
          field.focus()
        }
      }
    })

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        closeSearch(btn, panel)
        btn.focus()
      }
    })

    document.addEventListener('click', function (e) {
      if (panel.hidden) {
        return
      }
      if (panel.contains(e.target) || btn.contains(e.target)) {
        return
      }
      closeSearch(btn, panel)
    })
  })

  // Topbar contacts scroll sideways on a phone. A scrolled row hides its overflow with no sign at
  // all, so mark it while something is actually cut off and let the stylesheet fade that edge —
  // a fade drawn permanently would lie on a wide screen where nothing is hidden.
  document.querySelectorAll('.tb-contacts').forEach(function (list) {
    function mark() {
      const cut = list.scrollWidth - list.clientWidth > 1
      if (cut) {
        list.setAttribute('data-overflow', '')
      } else {
        list.removeAttribute('data-overflow')
      }
    }
    mark()
    addEventListener('resize', mark)
    if (window.ResizeObserver) {
      new ResizeObserver(mark).observe(list)
    }
  })

  document.querySelectorAll('.tb-lang').forEach(function (root) {
    const toggle = root.querySelector('.tb-lang__toggle')
    // The panel wraps the list from the 9-language layout onwards; on a bilingual site the list
    // IS the panel, so fall back to it and everything below keeps working unchanged.
    const panel = root.querySelector('.tb-lang__panel') || root.querySelector('.tb-lang__menu')
    const search = root.querySelector('.tb-lang__search-input')
    const empty = root.querySelector('.tb-lang__empty')
    const items = Array.prototype.slice.call(root.querySelectorAll('.tb-lang__item'))
    if (!toggle || !panel) {
      return
    }

    // Past 8 languages `tb.php` marks the root `--modal` and the dialog opens MODALLY at every
    // width: top layer, backdrop, Escape and focus trap all from the platform. Up to 8 it opens
    // non-modally and stays the anchored dropdown. Not a viewport question — a list-length one,
    // decided once in PHP so the stylesheet and this file cannot disagree about it.
    const modal = root.classList.contains('tb-lang--modal')
    const isDialog = typeof panel.showModal === 'function' && panel.tagName === 'DIALOG'

    function set(open) {
      if (isDialog) {
        if (open && !panel.open) {
          modal ? panel.showModal() : panel.show()
        }
        if (!open && panel.open) {
          panel.close()
        }
      } else {
        panel.hidden = !open
      }
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open && search) {
        search.focus()
      }
      if (!open && search && search.value) {
        search.value = ''
        filter()
      }
    }

    function isOpen() {
      return isDialog ? panel.open : !panel.hidden
    }

    // Filter on a string the layout prepared: native name + English name + code + sef, lower-cased.
    // Matching on the rendered text alone would mean a reader of the Thai page cannot find German
    // by typing "de", which is exactly what someone reaches for when the list is long.
    function filter() {
      const q = (search.value || '').trim().toLowerCase()
      let shown = 0
      items.forEach(function (li) {
        const hit = q === '' || (li.getAttribute('data-tb-lang-find') || '').indexOf(q) !== -1
        li.hidden = !hit
        if (hit) {
          shown++
        }
      })
      if (empty) {
        empty.hidden = shown !== 0
      }
    }

    toggle.addEventListener('click', function () {
      set(!isOpen())
    })
    // A modal dialog closes on Escape and on the backdrop by itself; keep aria-expanded honest.
    if (isDialog) {
      panel.addEventListener('close', function () {
        toggle.setAttribute('aria-expanded', 'false')
      })
      panel.addEventListener('click', function (e) {
        if (e.target === panel) {
          set(false)
        }
      })
    }
    if (search) {
      search.addEventListener('input', filter)
      // Enter on a single remaining match goes straight there — the fastest path out of 43 rows.
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') {
          return
        }
        const visible = items.filter(function (li) {
          return !li.hidden
        })
        if (visible.length === 1) {
          const link = visible[0].querySelector('a')
          if (link) {
            e.preventDefault()
            link.click()
          }
        }
      })
    }
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target) && isOpen()) {
        set(false)
      }
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        set(false)
        toggle.focus()
      }
    })
  })

  // Megamenu: T4 toggles `.show` on BOTH the li and its .dropdown-menu (megamenu.js showDropdown);
  // give it Escape + outside-click, removing the class from both.
  function closeMega(focusTrigger) {
    document
      .querySelectorAll('.t4-megamenu .nav-item.dropdown.show, .t4-megamenu .dropdown-menu.show')
      .forEach(function (el) {
        el.classList.remove('show')
        const link = el.matches('.nav-item') ? el.querySelector(':scope > .nav-link') : null
        if (link) {
          link.setAttribute('aria-expanded', 'false')
          if (focusTrigger) {
            link.focus()
          }
        }
      })
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeMega(true)
    }
  })
  document.addEventListener('click', function (e) {
    if (e.target.closest('.t4-megamenu')) {
      return
    }
    if (document.querySelector('.t4-megamenu .dropdown-menu.show')) {
      closeMega(false)
    }
  })
})()
