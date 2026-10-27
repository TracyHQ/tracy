/* wp-ja-nova: header and page behaviour. Each job works on elements the theme's parts and patterns
 * draw, and on nothing else of the page:
 *
 *   drawer    — below the desktop breakpoint the header menu is a drawer from the right, as the
 *               source's off-canvas is: opened by `.jn-drawer-toggle`, closed by its × button
 *               (`.jn-drawer-close`), Escape or a click on the dimmed page; focus goes back to the
 *               toggle. Inside it a parent item drills down: its caret opens the children as a panel with a
 *               back row ("‹ ABOUT US") over the list, as the source's drawer does; Back, the caret again
 *               and Escape return one level, closing the drawer closes them all.
 *   menus     — from 992 px a parent item opens on its first touch tap (touch has no hover) and its
 *               link opens the page on the second; mouse hover and the keyboard stay with the stylesheet
 *               and WordPress's navigation script. A tap outside an open panel closes it.
 *   accordion — each `.jn-accordion__item` header becomes a button that shows or hides the part
 *               under it. `--single` lets one item be open at a time (the source's Bootstrap
 *               collapse with a data-parent); the first item of a questions list starts open, the
 *               rows of a positions list start closed. Without this file every part stays shown.
 *   tabs      — the pricing plan names (`.jn-pricing__tab`) become tabs that show one plan panel
 *               (`.jn-pricing__panel`) at a time, the first one to start with.
 *   marquee   — a `.jn-marquee__track` row drifts without end, as the source's Owl text sliders do
 *               (linear, autoplay, 15 s a slide, paused under the pointer): its items are cloned once
 *               so the row wraps seamlessly, and the stylesheet moves it; `cta-1` on the section
 *               runs it right to left.
 *   clients   — the client logo row loops on its own, one logo every 5 s as the source's Owl `loop` +
 *               `autoplay` does: the first logos are cloned after the last so the row wraps with no
 *               gap, it waits while the pointer or focus is inside it, and stands still under reduced
 *               motion.
 *   sign-in   — the sign-in page opens with the cursor in the username field, as the source's
 *               login view does.
 *   passkey   — the sign-in form's "Sign in with a passkey" button and the account page's "Add a passkey" /
 *               "Remove" buttons talk to the theme's REST routes (inc/extra.php), which verify everything; this file
 *               only moves the browser's WebAuthn answer there.
 *   video     — a `.jn-play__button` link to a YouTube address opens the player in a dialog instead
 *               of leaving the page, as the source's play button opens its modal; Escape, the close
 *               button or a click on the backdrop close it and stop the video.
 */
;(() => {
  const t = window.wpJaNova || {}
  const desktop = window.matchMedia ? window.matchMedia('(min-width: 992px)') : { matches: true }
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── drawer ─────────────────────────────────────────────────────────────────────────────────────
  const toggle = document.querySelector('.jn-drawer-toggle')
  const drawer = toggle ? document.getElementById(toggle.getAttribute('aria-controls') || '') : null
  const isDrawerOpen = () => document.documentElement.classList.contains('jn-drawer-open')
  // Closes every drill-down panel; assigned below, once the menu's parts are known.
  let closeAll = () => {}
  const setDrawer = (open, { restore = false } = {}) => {
    if (!toggle || !drawer) return
    document.documentElement.classList.toggle('jn-drawer-open', open)
    if (!open) closeAll()
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggle.setAttribute('aria-label', open ? t.closeMenu || 'Close the menu' : t.openMenu || 'Open the menu')
    if (open) {
      // The drawer is still visibility: hidden in the first frame of its transition, where focus()
      // does nothing: focus its first control once it shows (and again when the slide ends).
      const first = drawer.querySelector('.jn-drawer-close, a, button')
      const focus = () => {
        if (first && isDrawerOpen() && document.activeElement !== first) first.focus()
      }
      requestAnimationFrame(() => requestAnimationFrame(focus))
      drawer.addEventListener('transitionend', focus, { once: true })
    } else if (restore) toggle.focus()
  }
  if (toggle && drawer) {
    let close = drawer.querySelector('.jn-drawer-close')
    if (!close) {
      close = document.createElement('button')
      close.type = 'button'
      close.className = 'jn-drawer-close'
      close.textContent = '×'
      const head = drawer.querySelector('.jn-drawer__head') || drawer
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
    const onChange = () => {
      if (desktop.matches) setDrawer(false)
    }
    if (desktop.addEventListener) desktop.addEventListener('change', onChange)
  }

  // ── parent items ───────────────────────────────────────────────────────────────────────────────
  const menu = document.querySelector('.jn-header__menu')
  const parents = menu ? [...menu.querySelectorAll('li.wp-block-navigation-submenu')] : []
  const child = (item, cls) => [...item.children].find((c) => c.classList.contains(cls)) || null
  const partsOf = (item) => ({
    toggle: child(item, 'wp-block-navigation-submenu__toggle'),
    label: child(item, 'wp-block-navigation-item__content'),
    panel: child(item, 'wp-block-navigation__submenu-container')
  })
  const isOpen = (item) => {
    const { toggle: caret } = partsOf(item)
    return Boolean(caret) && caret.getAttribute('aria-expanded') === 'true'
  }
  const openParents = () => parents.filter(isOpen)
  const parentOf = (node) => (node && node.closest ? node.closest('li.wp-block-navigation-submenu') : null)
  // While a panel covers the list, nothing behind it takes focus or a click.
  const syncDrill = () => {
    const top = openParents().pop() || null
    const panel = top ? partsOf(top).panel : null
    if (menu) menu.classList.toggle('jn-drill', Boolean(panel))
    if (panel && drawer) drawer.scrollTop = 0
    for (const node of menu
      ? menu.querySelectorAll(
          '.wp-block-navigation-item__content, .wp-block-navigation-submenu__toggle, .jn-drill-back__button'
        )
      : []) {
      node.inert = Boolean(panel) && !panel.contains(node)
    }
  }
  const setParent = (item, open, { focus = true } = {}) => {
    const { toggle: caret, panel } = partsOf(item)
    if (!caret || !panel) return
    caret.setAttribute('aria-expanded', open ? 'true' : 'false')
    syncDrill()
    if (!focus) return
    if (open) {
      const back = panel.querySelector(':scope > .jn-drill-back .jn-drill-back__button')
      // the panel is display:none until the attribute lands: focus on the next frame
      requestAnimationFrame(() => isOpen(item) && back && back.focus())
    } else caret.focus()
  }
  closeAll = () => {
    for (const item of parents) {
      const { toggle: caret } = partsOf(item)
      if (caret) caret.setAttribute('aria-expanded', 'false')
    }
    syncDrill()
  }
  // A back row heads every panel (hidden from 992 px by the stylesheet).
  for (const item of parents) {
    const { label, panel } = partsOf(item)
    if (!panel || panel.querySelector(':scope > .jn-drill-back')) continue
    const row = document.createElement('li')
    row.className = 'jn-drill-back'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jn-drill-back__button'
    button.textContent = (label && label.textContent.trim()) || t.back || 'Back'
    button.setAttribute('aria-label', `${t.backTo || 'Back'}: ${button.textContent}`)
    row.append(button)
    panel.prepend(row)
  }

  let syncing = false
  // Which kind of pointer pressed last: the tap that follows decides whether a parent link opens its panel first.
  let lastPointer = 'mouse'
  document.addEventListener(
    'pointerdown',
    (event) => {
      lastPointer = event.pointerType || 'mouse'
    },
    true
  )
  const toggleOf = (item) => {
    const { toggle: caret } = partsOf(item)
    syncing = true
    try {
      caret.click()
    } finally {
      syncing = false
    }
  }
  document.addEventListener(
    'click',
    (event) => {
      if (syncing || !menu || !(event.target instanceof Element)) return
      if (!menu.contains(event.target)) {
        // a tap outside an open desktop panel closes it
        if (desktop.matches) for (const item of openParents()) toggleOf(item)
        return
      }
      const back = event.target.closest('.jn-drill-back__button')
      if (back) {
        const item = parentOf(back.closest('.wp-block-navigation__submenu-container'))
        if (item) setParent(item, false)
        return
      }
      const item = parentOf(event.target)
      if (!item || !partsOf(item).toggle) return
      const { toggle: caret, label } = partsOf(item)
      const onCaret = caret.contains(event.target)
      const onLabel = Boolean(label) && label.contains(event.target)
      if (!desktop.matches) {
        // the drawer: the caret drills down, the link goes to its page
        if (!onCaret) return
        event.preventDefault()
        event.stopPropagation()
        setParent(item, !isOpen(item))
        return
      }
      const top = !item.parentElement.closest('li.wp-block-navigation-submenu')
      const touch = event.pointerType ? event.pointerType === 'touch' : lastPointer === 'touch'
      if (onLabel && touch && top && !isOpen(item)) {
        // first tap on a parent link: open its panel, stay on the page; the second tap follows the link
        event.preventDefault()
        event.stopPropagation()
        for (const other of openParents()) if (other !== item) toggleOf(other)
        toggleOf(item)
      }
    },
    true
  )
  // Hover handlers of WordPress's navigation script would rewrite aria-expanded under the drawer's drill-down, and a
  // touch tap would open a panel before the click decides: neither pointer event reaches them in those cases.
  for (const type of ['pointerenter', 'pointerleave']) {
    document.addEventListener(
      type,
      (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.jn-header__menu')) return
        if (!desktop.matches || event.pointerType === 'touch') event.stopPropagation()
      },
      true
    )
  }
  // Crossing 992 px: the drill-down is the drawer's alone, WordPress's open state the desktop's alone: settle both.
  const settle = () => {
    for (const item of openParents()) {
      const { toggle: caret } = partsOf(item)
      // going to desktop the attribute was ours; going to the drawer it was WordPress's, so its own toggle closes it
      if (desktop.matches) caret.setAttribute('aria-expanded', 'false')
      else toggleOf(item)
    }
    closeAll()
  }
  if (desktop.addEventListener) desktop.addEventListener('change', settle)
  syncDrill()

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const top = !desktop.matches ? openParents().pop() : null
    if (top) {
      // a drill-down panel is open: Escape goes back one level before it closes the drawer
      event.preventDefault()
      setParent(top, false)
    } else if (isDrawerOpen()) setDrawer(false, { restore: true })
  })

  // ── accordion ──────────────────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.jn-accordion').forEach((accordion, a) => {
    const single = accordion.classList.contains('jn-accordion--single')
    const startOpen = !accordion.classList.contains('jn-accordion--jobs')
    const items = [...accordion.querySelectorAll(':scope > .jn-accordion__item')]
    const sets = []
    items.forEach((item, i) => {
      const header = item.querySelector('.jn-accordion__header')
      const body = item.querySelector('.jn-accordion__body')
      if (!header || !body || header.querySelector('.jn-accordion__button')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'jn-accordion__button'
      button.append(...header.childNodes)
      header.append(button)
      body.id = body.id || `jn-accordion-${a}-${i}`
      button.setAttribute('aria-controls', body.id)
      const set = (open) => {
        item.classList.toggle('is-open', open)
        button.setAttribute('aria-expanded', String(open))
        body.hidden = !open
      }
      sets.push(set)
      set(startOpen && i === 0)
      button.addEventListener('click', () => {
        const open = !item.classList.contains('is-open')
        if (open && single) sets.forEach((other) => other(false))
        set(open)
      })
    })
  })

  // ── tabs ───────────────────────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.jn-pricing').forEach((section, s) => {
    const tabs = [...section.querySelectorAll('.jn-pricing__tab')]
    const panels = [...section.querySelectorAll('.jn-pricing__panel')]
    if (!tabs.length || tabs.length !== panels.length) return
    const list = tabs[0].parentElement
    list.setAttribute('role', 'tablist')
    const select = (k, focus = false) => {
      tabs.forEach((tab, i) => {
        const on = i === k
        tab.classList.toggle('is-active', on)
        tab.setAttribute('aria-selected', String(on))
        tab.tabIndex = on ? 0 : -1
        panels[i].hidden = !on
        panels[i].classList.toggle('is-active', on)
      })
      if (focus) tabs[k].focus()
    }
    tabs.forEach((tab, i) => {
      tab.setAttribute('role', 'tab')
      tab.id = tab.id || `jn-tab-${s}-${i}`
      panels[i].id = panels[i].id || `jn-panel-${s}-${i}`
      panels[i].setAttribute('role', 'tabpanel')
      panels[i].setAttribute('aria-labelledby', tab.id)
      tab.setAttribute('aria-controls', panels[i].id)
      tab.addEventListener('click', () => select(i))
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select(i)
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
          event.preventDefault()
          select((i + 1) % tabs.length, true)
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
          event.preventDefault()
          select((i - 1 + tabs.length) % tabs.length, true)
        }
      })
    })
    select(0)
  })

  // ── marquee ────────────────────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.jn-marquee__track').forEach((track) => {
    if (track.dataset.jnMarquee) return
    track.dataset.jnMarquee = '1'
    const items = [...track.children]
    if (!items.length) return
    for (const item of items) {
      const copy = item.cloneNode(true)
      copy.setAttribute('aria-hidden', 'true')
      copy.querySelectorAll('a, button').forEach((el) => (el.tabIndex = -1))
      track.append(copy)
    }
    // 15 s for each slide, as the source's autoplaySpeed; half the track is one full turn.
    track.style.setProperty('--jn-marquee-duration', `${items.length * 15}s`)
    if (!reduced) track.classList.add('is-moving')
  })

  // ── clients loop ───────────────────────────────────────────────────────────────────────────────
  // The source's Owl `loop` + `autoplay`: one slide a step, linear over 500 ms, on a 5 s grid that
  // keeps ticking while the pointer is over the row or the tab is hidden (those ticks are skipped, not
  // made up). The first slides are cloned after the last so the row wraps with no gap, and the clones
  // are hidden from the reading order and the tab order. This script alone owns the track.
  document.querySelectorAll('.jn-clients__carousel').forEach((carousel) => {
    const track = carousel.querySelector(':scope > .jn-clients__track')
    if (!track || carousel.dataset.jnLoop) return
    const slides = [...track.children].filter((el) => el.classList.contains('jn-clients__slide'))
    if (slides.length < 2) return
    carousel.dataset.jnLoop = '1'
    const GRID = 5000
    const SPEED = 500
    const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    let index = 0
    let stepping = false
    let hovered = false
    let focused = false
    let tick = 0
    let settle = 0
    let origin = 0
    let beat = 0

    const width = () => slides[0].getBoundingClientRect().width
    const place = () => {
      track.style.setProperty('--jn-clients-x', `${-index * width()}px`)
    }
    // Clones as many slides as one view shows, taken round the real ones, so the row never runs short.
    const fillClones = () => {
      const w = width()
      if (!(w > 0)) return
      const want = Math.ceil(carousel.getBoundingClientRect().width / w - 0.01)
      track.querySelectorAll(':scope > .jn-clients__slide--clone').forEach((el) => el.remove())
      for (let i = 0; i < want; i++) {
        const copy = slides[i % slides.length].cloneNode(true)
        copy.classList.add('jn-clients__slide--clone')
        copy.setAttribute('aria-hidden', 'true')
        copy.inert = true
        copy.removeAttribute('id')
        copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
        copy.querySelectorAll('a, button').forEach((el) => (el.tabIndex = -1))
        track.append(copy)
      }
    }
    // Ends a step now: back to the first slide when the step went onto the clones, with no transition.
    const finish = () => {
      window.clearTimeout(settle)
      track.classList.remove('is-stepping')
      stepping = false
      if (index >= slides.length) index = 0
      place()
    }
    const step = () => {
      if (stepping || !(width() > 0)) return
      stepping = true
      index += 1
      track.classList.add('is-stepping')
      place()
      settle = window.setTimeout(finish, SPEED + 300)
    }
    track.addEventListener('transitionend', (event) => {
      if (event.target === track && event.propertyName === 'transform') finish()
    })

    const running = () => !(motion && motion.matches)
    const arm = () => {
      window.clearTimeout(tick)
      if (!running()) return
      // A late callback skips the grid points it missed instead of making them up.
      beat = Math.max(beat + 1, Math.floor((Date.now() - origin) / GRID) + 1)
      const due = origin + beat * GRID
      tick = window.setTimeout(
        () => {
          if (!hovered && !focused && !document.hidden && running()) step()
          arm()
        },
        Math.max(0, due - Date.now())
      )
    }
    const start = () => {
      window.clearTimeout(tick)
      finish()
      if (!running()) {
        delete carousel.dataset.autoplay
        return
      }
      carousel.dataset.autoplay = 'true'
      origin = Date.now()
      beat = 0
      arm()
    }

    // Hover and focus hold the row separately: it runs again only when neither is left.
    carousel.addEventListener('pointerenter', () => (hovered = true))
    carousel.addEventListener('pointerleave', () => (hovered = false))
    carousel.addEventListener('focusin', () => (focused = true))
    carousel.addEventListener('focusout', (event) => {
      if (!event.relatedTarget || !carousel.contains(event.relatedTarget)) focused = false
    })
    if (motion) {
      if (motion.addEventListener) motion.addEventListener('change', start)
      else if (motion.addListener) motion.addListener(start)
    }

    let seen = width()
    const relayout = () => {
      const w = width()
      if (w === seen) return
      seen = w
      finish()
      fillClones()
      place()
    }
    fillClones()
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(carousel)
    else window.addEventListener('resize', relayout)
    start()
  })

  // ── video ──────────────────────────────────────────────────────────────────────────────────────
  const youtubeId = (href) => {
    try {
      const url = new URL(href, location.href)
      if (/(^|\.)youtube\.com$/.test(url.hostname))
        return url.searchParams.get('v') || url.pathname.split('/').pop()
      if (url.hostname === 'youtu.be') return url.pathname.slice(1)
    } catch {}
    return null
  }
  for (const link of document.querySelectorAll('.jn-play__button')) {
    link.addEventListener('click', (event) => {
      const id = youtubeId(link.getAttribute('href') || '')
      if (!id || typeof HTMLDialogElement !== 'function') return
      event.preventDefault()
      const dialog = document.createElement('dialog')
      dialog.className = 'jn-video'
      dialog.setAttribute('aria-label', t.video || 'Video')
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'jn-video__close'
      close.setAttribute('aria-label', t.close || 'Close')
      close.textContent = '×'
      const frame = document.createElement('iframe')
      frame.className = 'jn-video__frame'
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`
      frame.allow = 'autoplay; encrypted-media; picture-in-picture'
      frame.allowFullscreen = true
      frame.title = t.video || 'Video'
      dialog.append(close, frame)
      document.body.append(dialog)
      const done = () => {
        dialog.close()
        dialog.remove()
        link.focus()
      }
      close.addEventListener('click', done)
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault()
        done()
      })
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) done()
      })
      dialog.showModal()
    })
  }

  // The tag list's "Display #" select applies on change, as the source's does.
  document.querySelectorAll('.jn-tagged__limit').forEach((select) => {
    select.addEventListener('change', () => select.form?.requestSubmit())
  })

  // The password field carries a "Show Password" button beside it, as the source's login form does.
  document.querySelectorAll('.jn-auth #loginform .login-password input[type="password"]').forEach((input) => {
    const group = document.createElement('div')
    group.className = 'jn-input-group'
    input.parentNode.insertBefore(group, input)
    group.appendChild(input)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jn-password-toggle'
    button.setAttribute('aria-label', 'Show Password')
    button.innerHTML =
      '<svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C4.4 0 1.6 2.2 0 6c1.6 3.8 4.4 6 8 6s6.4-2.2 8-6c-1.6-3.8-4.4-6-8-6Zm0 9.5A3.5 3.5 0 1 1 8 2.5a3.5 3.5 0 0 1 0 7Z"/><circle cx="8" cy="6" r="1.8" fill="currentColor"/></svg>'
    group.appendChild(button)
    button.addEventListener('click', () => {
      const shown = input.type === 'text'
      input.type = shown ? 'password' : 'text'
      button.setAttribute('aria-label', shown ? 'Show Password' : 'Hide Password')
    })
  })

  // The Project page's tabs (pattern section-project-tabs): the tab buttons switch the lists, and each list
  // shows four cards a page, as the source's script does. Without the script every list shows in full.
  document.querySelectorAll('.jn-ptabs').forEach((root) => {
    const nav = root.querySelector('.jn-ptabs__nav')
    const panels = [...root.querySelectorAll('.jn-ptabs__panel')]
    const tabs = nav ? [...nav.querySelectorAll('.wp-block-button__link')] : []
    if (!panels.length || tabs.length !== panels.length) return
    const words = window.wpJaNova || {}
    const SIZE = 4

    const page = (panel) => {
      const items = [...panel.querySelectorAll('.jn-ptabs__items > li')]
      const pages = Math.max(1, Math.ceil(items.length / SIZE))
      const pager = document.createElement('nav')
      pager.className = 'jn-ptabs__pager'
      pager.setAttribute('aria-label', words.pages || 'Pages')
      const list = document.createElement('ul')
      pager.appendChild(list)
      panel.appendChild(pager)
      const button = (label, go, extra) => {
        const item = document.createElement('li')
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = label
        if (extra) b.className = extra
        b.addEventListener('click', () => go())
        item.appendChild(b)
        list.appendChild(item)
        return b
      }
      const show = (n) => {
        const now = Math.min(pages, Math.max(1, n))
        items.forEach((li, k) => {
          li.hidden = Math.floor(k / SIZE) + 1 !== now
        })
        list.textContent = ''
        const prev = button('\u2039', () => show(now - 1), 'jn-ptabs__step')
        prev.setAttribute('aria-label', words.previousPage || 'Previous page')
        prev.disabled = now === 1
        for (let k = 1; k <= pages; k++) {
          const b = button(String(k), () => show(k))
          if (k === now) b.setAttribute('aria-current', 'page')
        }
        const next = button('\u203a', () => show(now + 1), 'jn-ptabs__step')
        next.setAttribute('aria-label', words.nextPage || 'Next page')
        next.disabled = now === pages
      }
      show(1)
    }

    const select = (i, focus) => {
      tabs.forEach((tab, k) => {
        const on = k === i
        tab.parentElement.classList.toggle('is-active', on)
        tab.setAttribute('aria-selected', on ? 'true' : 'false')
        tab.tabIndex = on ? 0 : -1
        panels[k].classList.toggle('is-active', on)
        panels[k].hidden = !on
      })
      if (focus) tabs[i].focus()
    }
    nav.setAttribute('role', 'tablist')
    tabs.forEach((tab, i) => {
      tab.parentElement.setAttribute('role', 'presentation')
      tab.setAttribute('role', 'tab')
      tab.id = 'jn-ptab-tab-' + i
      tab.setAttribute('aria-controls', panels[i].id)
      panels[i].setAttribute('role', 'tabpanel')
      panels[i].setAttribute('aria-labelledby', tab.id)
      tab.addEventListener('click', (event) => {
        event.preventDefault()
        select(i, false)
      })
      tab.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        event.preventDefault()
        select((i + step + tabs.length) % tabs.length, true)
      })
    })
    panels.forEach(page)
    root.classList.add('is-ready')
    select(0, false)
  })

  // ── passkeys ───────────────────────────────────────────────────────────────────────────────────
  const b64uToBuffer = (text) => {
    const pad = '='.repeat((4 - (text.length % 4)) % 4)
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer
  }
  const bufferToB64u = (buffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const post = async (path, body) => {
    const response = await fetch((t.rest || '/wp-json/wp-ja-nova/v1/') + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': t.restNonce || '' },
      body: JSON.stringify(body || {})
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || t.passkeyFailed || 'The passkey could not be used.')
    return data
  }
  const say = (button, text) => {
    const status = button.parentElement && button.parentElement.querySelector('.jn-passkey__status')
    if (status) status.textContent = text
  }
  const passkeyError = (button, error) =>
    say(
      button,
      error && error.name === 'NotAllowedError'
        ? t.passkeyCancelled || 'The passkey request was cancelled.'
        : (error && error.message) || t.passkeyFailed || 'The passkey could not be used.'
    )
  const supported = Boolean(window.PublicKeyCredential && navigator.credentials)
  for (const button of document.querySelectorAll('[data-jn-passkey]')) {
    if (!supported) {
      button.disabled = true
      say(button, t.passkeyUnsupported || 'This browser does not support passkeys.')
      continue
    }
    button.addEventListener('click', async () => {
      if (button.disabled) return
      button.disabled = true
      say(button, '')
      try {
        if (button.dataset.jnPasskey === 'login') {
          const options = await post('passkey/login-options')
          const credential = await navigator.credentials.get({
            publicKey: {
              challenge: b64uToBuffer(options.challenge),
              rpId: options.rpId,
              userVerification: options.userVerification,
              timeout: options.timeout
            }
          })
          const response = credential.response
          const done = await post('passkey/login', {
            id: credential.id,
            clientDataJSON: bufferToB64u(response.clientDataJSON),
            authenticatorData: bufferToB64u(response.authenticatorData),
            signature: bufferToB64u(response.signature)
          })
          window.location.assign(done.redirect || '/')
          return
        }
        const options = await post('passkey/register-options')
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge: b64uToBuffer(options.challenge),
            rp: options.rp,
            user: { ...options.user, id: b64uToBuffer(options.user.id) },
            pubKeyCredParams: options.pubKeyCredParams,
            excludeCredentials: options.excludeCredentials.map((c) => ({ ...c, id: b64uToBuffer(c.id) })),
            authenticatorSelection: options.authenticatorSelection,
            attestation: options.attestation,
            timeout: options.timeout
          }
        })
        await post('passkey/register', {
          id: credential.id,
          clientDataJSON: bufferToB64u(credential.response.clientDataJSON),
          attestationObject: bufferToB64u(credential.response.attestationObject)
        })
        window.location.reload()
      } catch (error) {
        passkeyError(button, error)
        button.disabled = false
      }
    })
  }
  for (const button of document.querySelectorAll('[data-jn-passkey-remove]')) {
    button.addEventListener('click', async () => {
      button.disabled = true
      try {
        await post('passkey/remove', { id: button.dataset.jnPasskeyRemove })
        window.location.reload()
      } catch (error) {
        passkeyError(button, error)
        button.disabled = false
      }
    })
  }

  // The search page's "Advanced Search" button shows and hides its panel, as the source's collapse does.
  document.querySelectorAll('.jn-search__advanced').forEach((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls') || '')
    if (!panel) return
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true'
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
      panel.hidden = !open
    })
  })

  // The sign-in page opens with the cursor in the username field, as the source's login view does.
  const login = document.querySelector('.jn-auth #loginform #user_login')
  if (login && !document.activeElement?.matches('input, textarea, select'))
    login.focus({ preventScroll: true })
})()
