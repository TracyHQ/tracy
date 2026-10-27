/* wp-ja-vega: header and page behaviour. Seven jobs, each on elements the theme's parts and patterns
 * draw, and nothing else on the page:
 *
 *   mega    — a `[data-jv-mega]` item opens its panel when the pointer rests on it (short intent
 *             delay), when keyboard focus reaches its caret button, or on a click of that button;
 *             on a touch screen (no hover) the first tap on the item's LABEL opens the panel and does
 *             not follow the link, the second tap on it follows the link, as the source's T4 menu does;
 *             it closes when the pointer leaves (a grace delay long enough to cross into the
 *             panel), on Escape (focus goes back to the button), on a click outside, when focus
 *             leaves it, or when another item opens. Panels are painted while `is-open` is on;
 *             there is no :hover rule, so this file is the whole contract.
 *   drawer  — below the desktop breakpoint the header menu is a drawer, opened by `.jv-drawer-toggle`
 *             and closed by the same button, Escape or a click on the dimmed page. A mega item's caret
 *             drills into it as the source's off-canvas does: the menu slides out, the item's first
 *             link list slides in under a ‹ back button (added here) that slides it out again.
 *   video   — a `.jv-play__button` link to a YouTube address opens the player in a dialog instead
 *             of leaving the page, as the source's video button opens its modal; Escape, the close
 *             button or a click on the backdrop close it and stop the video.
 *   top     — `.jv-back-to-top` shows once the header has scrolled out of view, as the source's
 *             `#back-to-top` does (T4 `top-away`: the 80 px header section fully above the viewport).
 *   accordion — each `.jv-accordion__item` heading becomes a button that shows or hides the text
 *             under it, as the source's service questions do (Bootstrap "stay open": items toggle
 *             on their own, the first one starts open). Without this file every answer stays shown.
 *   peek    — the success-story and team carousels show the slide they would wrap to beside the
 *             row while they sit at an end, as the source's looping sliders do.
 *   password — the log-in form's `.jv-password__toggle` (inc/extra.php) shows or hides the password
 *             it controls, as the source's eye button does; `aria-pressed` says which. The button is
 *             `hidden` until this file runs, so without it there is no button that does nothing.
 */
;(() => {
  const t = window.wpJaVega || {}
  const desktop = window.matchMedia ? window.matchMedia('(min-width: 992px)') : { matches: true }
  const hoverable = !window.matchMedia || window.matchMedia('(hover: hover)').matches

  // ── mega ───────────────────────────────────────────────────────────────────────────────────────
  const OPEN_DELAY = 60
  const CLOSE_DELAY = 220
  const megas = [...document.querySelectorAll('[data-jv-mega]')]
  const triggerOf = (mega) => mega.querySelector(':scope > .jv-mega__trigger')
  const isOpen = (mega) => mega.classList.contains('is-open')
  const setOpen = (mega, open) => {
    if (open) for (const other of megas) if (other !== mega) setOpen(other, false)
    mega.classList.toggle('is-open', open)
    const trigger = triggerOf(mega)
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  for (const mega of megas) {
    let timer = null
    const clear = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const later = (open, delay) => {
      clear()
      timer = setTimeout(() => {
        timer = null
        setOpen(mega, open)
      }, delay)
    }
    const trigger = triggerOf(mega)
    mega.addEventListener('pointerenter', (event) => {
      if (!hoverable || event.pointerType === 'touch' || !desktop.matches) return
      later(true, OPEN_DELAY)
    })
    mega.addEventListener('pointerleave', (event) => {
      if (!hoverable || event.pointerType === 'touch' || !desktop.matches) return
      later(false, CLOSE_DELAY)
    })
    if (trigger) {
      trigger.addEventListener('click', () => {
        clear()
        setOpen(mega, !isOpen(mega))
      })
    }
    // Touch has no hover: the first tap on the label of a closed item opens its panel instead of leaving
    // the page; a tap on the label of an open one follows the link. A mouse click, a key press (Enter on
    // the link has no pointerType) and the phone drawer (where the caret drills in) keep the link.
    const link = mega.querySelector(':scope > .jv-mega__link')
    if (link) {
      link.addEventListener('click', (event) => {
        if (!desktop.matches || isOpen(mega)) return
        if (
          event.pointerType !== 'touch' &&
          event.pointerType !== 'pen' &&
          !(event.pointerType === undefined && !hoverable)
        )
          return
        event.preventDefault()
        clear()
        setOpen(mega, true)
      })
    }
    mega.addEventListener('focusin', (event) => {
      if (!desktop.matches) return
      // Only a keyboard focus opens the panel. A tap or a click focuses the label first, and opening there would make the
      // tap that follows look like a second one (and follow the link).
      if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return
      clear()
      setOpen(mega, true)
    })
    mega.addEventListener('focusout', (event) => {
      if (!desktop.matches) return
      if (event.relatedTarget && mega.contains(event.relatedTarget)) return
      clear()
      setOpen(mega, false)
    })
    mega.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !isOpen(mega)) return
      event.preventDefault()
      event.stopPropagation()
      clear()
      setOpen(mega, false)
      if (trigger) trigger.focus()
    })
  }
  document.addEventListener('pointerdown', (event) => {
    if (!desktop.matches) return
    for (const mega of megas) if (isOpen(mega) && !mega.contains(event.target)) setOpen(mega, false)
  })
  // Keep every desktop panel inside the viewport (16 px margin). Between 992 and 1199 the Services panel
  // (880 px, anchored at its trigger) ran to x 1190–1200, so the whole page scrolled sideways even while
  // the panel was hidden (M6c, measured at 992 / 1024 / 1199). The shift is measured with itself reset.
  const fitPanels = () => {
    for (const mega of megas) {
      const panel = mega.querySelector(':scope > .jv-mega__panel')
      if (!panel) continue
      panel.style.removeProperty('--jv-mega-shift')
      if (!desktop.matches) continue
      const right = panel.getBoundingClientRect().right
      const limit = document.documentElement.clientWidth - 16
      if (right > limit) panel.style.setProperty('--jv-mega-shift', `${Math.floor(limit - right)}px`)
    }
  }
  fitPanels()
  window.addEventListener('resize', fitPanels)

  // ── drill (drawer) ─────────────────────────────────────────────────────────────────────────────
  // Below the desktop breakpoint an open mega item is a level of the drawer (the source's T4 off-canvas,
  // `data-effect="drill"`): the CSS slides the menu out and the item's first link list in. This adds the
  // ‹ back button that slides it out again, in the item's own words, and carries focus across the levels:
  // to the back button when a level opens, to the caret when it closes. The desktop panel hides the button.
  // Focus moves without scrolling: both targets are mid-slide, and letting the browser bring one into view
  // scrolled the drawer sideways by the slide's 300 px, which left the panel blank.
  for (const mega of megas) {
    const panel = mega.querySelector(':scope > .jv-mega__panel')
    const trigger = triggerOf(mega)
    if (!panel || !trigger) continue
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'jv-mega__back'
    const icon = document.createElement('span')
    icon.className = 'jv-mega__back-icon'
    icon.setAttribute('aria-hidden', 'true')
    const hint = document.createElement('span')
    hint.className = 'screen-reader-text'
    hint.textContent = `${t.backMenu || 'Back to the main menu:'} `
    const label = (mega.querySelector(':scope > .jv-mega__link') || trigger).textContent.trim()
    back.append(icon, hint, document.createTextNode(label))
    panel.prepend(back)
    back.addEventListener('click', () => {
      setOpen(mega, false)
      trigger.focus({ preventScroll: true })
    })
    trigger.addEventListener('click', () => {
      if (!desktop.matches && isOpen(mega)) back.focus({ preventScroll: true })
    })
  }
  // A level opened in the drawer is not a desktop panel, nor the other way round.
  const closeAll = () => {
    for (const mega of megas) setOpen(mega, false)
  }
  if (desktop.addEventListener) desktop.addEventListener('change', closeAll)

  // ── drawer ─────────────────────────────────────────────────────────────────────────────────────
  const toggle = document.querySelector('.jv-drawer-toggle')
  const drawer = toggle ? document.getElementById(toggle.getAttribute('aria-controls') || '') : null
  // Closing returns focus to the menu button (the opener) whenever focus was on it or inside the
  // drawer, however the drawer closed: a tap on the button, a tap outside, or Escape (#512).
  const setDrawer = (open) => {
    if (!toggle || !drawer) return
    const focusInside = drawer.contains(document.activeElement)
    document.documentElement.classList.toggle('jv-drawer-open', open)
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggle.setAttribute('aria-label', open ? t.closeMenu || 'Close the menu' : t.openMenu || 'Open the menu')
    if (open) {
      const first = drawer.querySelector('a, button')
      if (first) first.focus()
    } else if (focusInside || document.activeElement === toggle) {
      toggle.focus()
    }
  }
  if (toggle && drawer) {
    toggle.addEventListener('click', () => {
      const open = !document.documentElement.classList.contains('jv-drawer-open')
      setDrawer(open)
      if (!open) toggle.focus()
    })
    document.addEventListener('click', (event) => {
      if (!document.documentElement.classList.contains('jv-drawer-open')) return
      if (drawer.contains(event.target) || toggle.contains(event.target)) return
      setDrawer(false)
      // A tap on the dimmed page (not on a control of its own) hands focus back to the opener.
      const target = event.target instanceof Element ? event.target : null
      if (!target || !target.closest('a, button, input, select, textarea, [tabindex]')) toggle.focus()
    })
    const onChange = () => {
      if (desktop.matches) setDrawer(false)
    }
    if (desktop.addEventListener) desktop.addEventListener('change', onChange)
  }

  // ── Escape: the innermost open thing closes first ──────────────────────────────────────────────
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const open = megas.filter(isOpen)
    if (open.length) {
      for (const mega of open) setOpen(mega, false)
      return
    }
    if (document.documentElement.classList.contains('jv-drawer-open')) {
      setDrawer(false)
      toggle.focus()
    }
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
  for (const link of document.querySelectorAll('.jv-play__button')) {
    link.addEventListener('click', (event) => {
      const id = youtubeId(link.getAttribute('href') || '')
      if (!id || typeof HTMLDialogElement !== 'function') return
      event.preventDefault()
      const dialog = document.createElement('dialog')
      dialog.className = 'jv-video'
      dialog.setAttribute('aria-label', t.video || 'Video')
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'jv-video__close'
      close.setAttribute('aria-label', t.close || 'Close')
      close.textContent = '×'
      const frame = document.createElement('iframe')
      frame.className = 'jv-video__frame'
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

  // ── accordion ──────────────────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.jv-accordion').forEach((accordion, a) => {
    accordion.querySelectorAll(':scope > .jv-accordion__item').forEach((item, i) => {
      const header = item.querySelector(':scope > .jv-accordion__header')
      const body = item.querySelector(':scope > .jv-accordion__body')
      if (!header || !body || header.querySelector('button')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'jv-accordion__button'
      button.append(...header.childNodes)
      header.append(button)
      body.id = body.id || `jv-accordion-${a}-${i}`
      button.setAttribute('aria-controls', body.id)
      const set = (open) => {
        item.classList.toggle('is-open', open)
        button.setAttribute('aria-expanded', String(open))
        body.hidden = !open
      }
      set(i === 0)
      button.addEventListener('click', () => set(!item.classList.contains('is-open')))
    })
  })

  // ── password ───────────────────────────────────────────────────────────────────────────────────
  for (const toggle of document.querySelectorAll('.jv-password__toggle')) {
    const field = document.getElementById(toggle.getAttribute('aria-controls') || '')
    if (!field || (field.type !== 'password' && field.type !== 'text')) continue
    toggle.hidden = false
    toggle.addEventListener('click', () => {
      const show = field.type === 'password'
      field.type = show ? 'text' : 'password'
      toggle.setAttribute('aria-pressed', String(show))
    })
  }

  // ── back to top ────────────────────────────────────────────────────────────────────────────────
  const top = document.querySelector('.jv-back-to-top')
  if (top) {
    const header = document.querySelector('.jv-header')
    const onScroll = () =>
      top.classList.toggle('is-shown', window.scrollY > (header ? header.offsetHeight : 80))
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    top.addEventListener('click', (event) => {
      event.preventDefault()
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      })
    })
  }

  // ── peek ───────────────────────────────────────────────────────────────────────────────────────
  // The source's success-story and team sliders loop (owl `loop: true`), so the slide before the
  // first one peeks in on the left, and the first one follows the last. The shared carousel runtime
  // does not loop: while a carousel sits at an end, a decorative, inert copy of the neighbour it
  // would wrap to is drawn one gap outside the row, and dropped as soon as the row moves away.
  for (const root of document.querySelectorAll(
    '.jv-stories .tracy-motion-carousel, .jv-teams .tracy-motion-carousel'
  )) {
    const track = root.querySelector(':scope > .tracy-motion-track')
    const slides = track ? [...track.children] : []
    if (slides.length < 2) continue
    const ghost = (side) => {
      const el = document.createElement('div')
      el.className = 'jv-peek jv-peek--' + side
      el.setAttribute('aria-hidden', 'true')
      el.inert = true
      root.append(el)
      return el
    }
    const before = ghost('before')
    const after = ghost('after')
    const fill = (el, slide) => {
      if (!slide) {
        el.replaceChildren()
        el.dataset.of = ''
        return
      }
      const of = String(slides.indexOf(slide))
      if (el.dataset.of !== of) {
        const copy = slide.cloneNode(true)
        copy.setAttribute('aria-hidden', 'true')
        el.replaceChildren(copy)
        el.dataset.of = of
      }
      // The copy is as wide as a slide and sits one track gap outside the row.
      const width = slides[0].getBoundingClientRect().width
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0
      el.style.width = width + 'px'
      el.style.left = (el === before ? -(width + gap) : root.clientWidth + gap) + 'px'
    }
    let turn = 0
    const paint = () => {
      const shown = slides.filter((slide) => slide.getAttribute('aria-hidden') !== 'true')
      if (shown.length === 0 || shown.length === slides.length) return
      const atStart = shown[0] === slides[0]
      const atEnd = shown[shown.length - 1] === slides[slides.length - 1]
      if (!atStart) fill(before, null)
      if (!atEnd) fill(after, null)
      // Drawn once the row has stopped, so the copy never sits over a slide still moving in.
      const mine = ++turn
      const moving = typeof track.getAnimations === 'function' ? track.getAnimations() : []
      Promise.all(moving.map((animation) => animation.finished.catch(() => null))).then(() => {
        if (mine !== turn) return
        fill(before, atStart ? slides[slides.length - 1] : null)
        fill(after, atEnd ? slides[0] : null)
      })
    }
    new MutationObserver(paint).observe(track, { subtree: true, attributeFilter: ['aria-hidden'] })
    window.addEventListener('resize', paint)
    paint()
  }
})()
