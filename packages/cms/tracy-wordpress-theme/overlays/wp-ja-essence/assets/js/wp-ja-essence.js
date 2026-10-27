/* wp-ja-essence: the behaviour the source's scripts give its chrome, kept small and dependency free.
 *
 *  1. the header drawer (the source's off-canvas menu): the hamburger opens it, the close button, Escape or a
 *     click outside closes it; its submenus drill down like the source's (the panel replaces the list, a
 *     "back" row leads one level up, three levels are reachable);
 *  2. the desktop submenus: a tap on the parent or on its chevron opens the panel (touch has no hover), a tap
 *     outside or Escape closes it, keyboard focus opens it;
 *  3. the lead slider: dots and previous/next buttons over a row that scrolls natively, so touch swipes work and
 *     every card is reachable by mouse, touch and keyboard;
 *  4. the gallery article: its pictures become a slider with arrows and thumbnails in the hero place;
 *  5. the back-to-top tab of Home 4: shown once the header has scrolled away.
 *
 * Every part is an enhancement: without this file the drawer stays closed, the menus open on hover and focus
 * through core, the slider is a row to scroll and the gallery pictures follow the text. */
;(() => {
  const html = document.documentElement
  const reduced = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  }

  /* ---------- 1. drawer ---------- */
  const drawerToggle = document.querySelector('.je-drawer-toggle')
  const drawer = document.getElementById('je-drawer')
  // The panel sits at the end of <body>, outside the page wrapper that slides away when it opens (a fixed box inside a moved box moves with it).
  if (drawer && drawer.parentElement !== document.body) document.body.appendChild(drawer)
  let resetDrill = () => {}
  const drawerOpen = () => html.classList.contains('je-drawer-open')
  const setDrawer = (open) => {
    html.classList.toggle('je-drawer-open', open)
    drawerToggle?.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (!open) resetDrill()
  }
  if (drawerToggle && drawer) {
    drawerToggle.addEventListener('click', () => setDrawer(!drawerOpen()))
    drawer.querySelector('.je-drawer-close')?.addEventListener('click', () => setDrawer(false))
    document.addEventListener('keydown', (e) => e.key === 'Escape' && drawerOpen() && setDrawer(false))
    document.addEventListener('click', (e) => {
      if (drawerOpen() && !e.target.closest('#je-drawer, .je-drawer-toggle')) setDrawer(false)
    })
  }

  const labelOf = (li) =>
    li
      .querySelector(':scope > .wp-block-navigation-item__content .wp-block-navigation-item__label')
      ?.textContent?.trim() ?? ''
  const toggleOf = (li) => li.querySelector(':scope > .wp-block-navigation-submenu__toggle')
  const panelOf = (li) => li.querySelector(':scope > .wp-block-navigation__submenu-container')
  // A parent item with a submenu: core's markup gives it a toggle button and a panel.
  const isParent = (li) => Boolean(li && li.classList.contains('has-child') && toggleOf(li) && panelOf(li))

  const drillNav = drawer?.querySelector('.je-drawer-nav')
  const drillRoot = drillNav?.querySelector(':scope > .wp-block-navigation__container')
  if (drillNav && drillRoot) {
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'je-drill-back'
    back.hidden = true
    // The chevron is drawn by CSS (the source's back row has no arrow character in its text).
    back.innerHTML =
      '<span class="je-drill-arrow" aria-hidden="true"></span><span class="je-drill-label"></span>'
    drillNav.insertBefore(back, drillRoot)
    // The open path, outermost parent first; the last item's panel is the list on screen.
    let path = []

    const render = (focus) => {
      for (const el of drillNav.querySelectorAll('.je-d-path, .je-d-open, .je-d-cur'))
        el.classList.remove('je-d-path', 'je-d-open', 'je-d-cur')
      path.forEach((li, i) => li.classList.add('je-d-path', ...(i === path.length - 1 ? ['je-d-open'] : [])))
      const current = path.length ? panelOf(path[path.length - 1]) : drillRoot
      current.classList.add('je-d-cur')
      drillNav.classList.toggle('je-drilled', path.length > 0)
      for (const li of drillNav.querySelectorAll('li.has-child')) {
        toggleOf(li)?.setAttribute('aria-expanded', path.includes(li) ? 'true' : 'false')
      }
      back.hidden = path.length === 0
      back.querySelector('.je-drill-label').textContent = path.length ? labelOf(path[path.length - 1]) : ''
      if (focus) (focus === 'back' ? back : focus).focus({ preventScroll: true })
    }
    const drill = (li) => {
      if (!isParent(li) || path.includes(li)) return
      // Only a direct child of the list on screen can be opened.
      const parentList = li.parentElement
      if (!parentList?.classList.contains('je-d-cur') && !(path.length === 0 && parentList === drillRoot))
        return
      path = [...path, li]
      render(panelOf(li).querySelector('a, button') ?? 'back')
    }
    const up = () => {
      if (!path.length) return
      const left = path[path.length - 1]
      path = path.slice(0, -1)
      render(toggleOf(left))
    }
    resetDrill = () => {
      path = []
      render(null)
    }
    render(null)

    back.addEventListener('click', up)
    // Capture phase: core's own handler on the toggle (a flyout) never sees the click.
    drillNav.addEventListener(
      'click',
      (e) => {
        const toggle = e.target.closest('.wp-block-navigation-submenu__toggle')
        if (toggle && drillNav.contains(toggle)) {
          e.preventDefault()
          e.stopPropagation()
          drill(toggle.closest('li'))
          return
        }
        // A parent without an address of its own (a heading such as "#Category"): the label opens it as well.
        const link = e.target.closest('a.wp-block-navigation-item__content')
        if (link && !link.hasAttribute('href') && drillNav.contains(link)) {
          e.preventDefault()
          e.stopPropagation()
          drill(link.closest('li'))
        }
      },
      true
    )
  }

  /* ---------- 2. desktop submenus ---------- */
  const nav = document.querySelector('.je-header nav.je-nav, nav.je-nav')
  const top = nav?.querySelector(':scope > .wp-block-navigation__container')
  if (nav && top) {
    const parents = () => [...top.children].filter(isParent)
    const setOpen = (li, open) => {
      li.classList.toggle('je-open', open)
      toggleOf(li)?.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    const closeAll = (except) => {
      for (const li of parents()) if (li !== except) setOpen(li, false)
    }
    const focusVisible = (el) => {
      try {
        return el.matches(':focus-visible')
      } catch {
        return true
      }
    }
    nav.addEventListener(
      'click',
      (e) => {
        const item = parents().find((li) => li.contains(e.target))
        if (!item) return
        const isOpen = item.classList.contains('je-open')
        const toggle = e.target.closest('.wp-block-navigation-submenu__toggle')
        if (toggle && toggle.parentElement === item) {
          e.preventDefault()
          e.stopPropagation()
          closeAll(item)
          setOpen(item, !isOpen)
          return
        }
        const link = e.target.closest('a.wp-block-navigation-item__content')
        if (!link || link.parentElement !== item) return
        // Touch has no hover: the first tap on a parent opens its panel; a parent without an address only opens.
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen'
        const bare = !link.hasAttribute('href')
        if (bare || (touch && !isOpen)) {
          e.preventDefault()
          e.stopPropagation()
          closeAll(item)
          setOpen(item, bare ? !isOpen : true)
        }
      },
      true
    )
    // Keyboard focus opens the panel of the item it enters and closes the ones it leaves.
    nav.addEventListener('focusin', (e) => {
      const item = parents().find((li) => li.contains(e.target))
      if (!item) return closeAll()
      if (focusVisible(e.target)) {
        closeAll(item)
        setOpen(item, true)
      }
    })
    nav.addEventListener('focusout', (e) => {
      const item = parents().find((li) => li.contains(e.target))
      if (item && !item.contains(e.relatedTarget) && item.classList.contains('je-open') && e.relatedTarget)
        setOpen(item, false)
    })
    document.addEventListener('pointerdown', (e) => {
      if (!nav.contains(e.target)) closeAll()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      const open = parents().find((li) => li.classList.contains('je-open'))
      if (!open) return
      closeAll()
      if (open.contains(document.activeElement)) toggleOf(open)?.focus()
    })
  }

  /* ---------- 3. lead slider ---------- */
  const initSlider = (root) => {
    const track = root.querySelector('.je-lead__items')
    if (!track) return
    const items = [...track.children]
    if (items.length < 2) return
    root.setAttribute('role', 'region')
    root.setAttribute('aria-roledescription', 'carousel')
    if (!root.hasAttribute('aria-label')) root.setAttribute('aria-label', 'Featured articles')

    const controls = document.createElement('div')
    controls.className = 'je-slider__nav'
    controls.innerHTML =
      '<button type="button" class="je-slider__btn je-slider__prev" aria-label="Previous slides"><span aria-hidden="true">&lsaquo;</span></button>' +
      '<ul class="je-slider__dots"></ul>' +
      '<button type="button" class="je-slider__btn je-slider__next" aria-label="Next slides"><span aria-hidden="true">&rsaquo;</span></button>'
    root.appendChild(controls)
    const prev = controls.querySelector('.je-slider__prev')
    const next = controls.querySelector('.je-slider__next')
    const dots = controls.querySelector('.je-slider__dots')

    let visible = 1
    let starts = [0]
    const measure = () => {
      const first = items[0].getBoundingClientRect().width || 1
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0
      visible = Math.max(1, Math.min(items.length, Math.round((track.clientWidth + gap) / (first + gap))))
      const pages = Math.ceil(items.length / visible)
      starts = Array.from({ length: pages }, (_, p) => Math.min(p * visible, items.length - visible))
    }
    const offsetOf = (i) => items[i].offsetLeft - items[0].offsetLeft
    const current = () => {
      let best = 0
      for (let p = 1; p < starts.length; p++) {
        if (
          Math.abs(offsetOf(starts[p]) - track.scrollLeft) <
          Math.abs(offsetOf(starts[best]) - track.scrollLeft)
        )
          best = p
      }
      return best
    }
    const goTo = (page) => {
      const p = Math.max(0, Math.min(starts.length - 1, page))
      track.scrollTo({ left: offsetOf(starts[p]), behavior: reduced() ? 'auto' : 'smooth' })
    }
    const paint = () => {
      const page = current()
      const total = starts.length
      controls.hidden = total < 2
      prev.disabled = page <= 0
      next.disabled = page >= total - 1
      for (const [p, dot] of [...dots.children].entries()) {
        const button = dot.firstElementChild
        if (p === page) button.setAttribute('aria-current', 'true')
        else button.removeAttribute('aria-current')
      }
      // Slides off screen are out of the tab order: focus never lands on a card the visitor cannot see.
      items.forEach((item, i) => {
        const shown = i >= starts[page] && i < starts[page] + visible
        item.toggleAttribute('inert', !shown)
      })
    }
    const build = () => {
      measure()
      dots.replaceChildren(
        ...starts.map((start, p) => {
          const li = document.createElement('li')
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute(
            'aria-label',
            visible > 1
              ? `Show slides ${start + 1} to ${Math.min(items.length, start + visible)}`
              : `Show slide ${start + 1}`
          )
          button.addEventListener('click', () => goTo(p))
          li.appendChild(button)
          return li
        })
      )
      paint()
    }
    prev.addEventListener('click', () => goTo(current() - 1))
    next.addEventListener('click', () => goTo(current() + 1))
    let frame = 0
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(paint)
    })
    let width = track.clientWidth
    const observer = new ResizeObserver(() => {
      if (track.clientWidth === width) return
      width = track.clientWidth
      const before = current()
      build()
      track.scrollTo({ left: offsetOf(starts[Math.min(before, starts.length - 1)]), behavior: 'auto' })
    })
    observer.observe(track)
    build()
  }
  for (const root of document.querySelectorAll('.je-lead--slide')) initSlider(root)
})()

/* 1.0.3: the Instagram strip is a carousel as the source's Owl one: 5 pictures from 992px, 3 from 768px, 2 from 480px and 1 below,
   a 9px gap, one dot per scroll position (the active dot is a 24px pill). Without script the strip is a plain row that scrolls. */
;(() => {
  const perView = () =>
    innerWidth >= 992
      ? document.body.classList.contains('je-slug-home-5')
        ? 6
        : 5
      : innerWidth >= 768
        ? 3
        : innerWidth >= 480
          ? 2
          : 1
  for (const row of document.querySelectorAll('.je-gallery__row')) {
    const items = [...row.children]
    if (items.length < 2) continue
    const dots = document.createElement('div')
    dots.className = 'je-gallery__dots'
    dots.setAttribute('role', 'group')
    dots.setAttribute('aria-label', 'Pictures')
    row.after(dots)
    let buttons = []
    const step = () => items[1].offsetLeft - items[0].offsetLeft || row.clientWidth
    const current = () => Math.round(row.scrollLeft / step())
    const paint = () => {
      const at = Math.min(current(), buttons.length - 1)
      buttons.forEach((b, i) => {
        b.classList.toggle('is-active', i === at)
        b.setAttribute('aria-current', i === at ? 'true' : 'false')
      })
    }
    const build = () => {
      const n = Math.max(1, items.length - perView() + 1)
      if (buttons.length === n) return paint()
      dots.replaceChildren()
      buttons = []
      for (let i = 0; i < n; i++) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'je-gallery__dot'
        b.setAttribute('aria-label', `Show pictures from ${i + 1}`)
        b.addEventListener('click', () => row.scrollTo({ left: i * step(), behavior: 'smooth' }))
        dots.appendChild(b)
        buttons.push(b)
      }
      dots.hidden = n < 2
      paint()
    }
    row.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true })
    addEventListener('resize', build)
    build()
  }
})()

/* 1.0.3: a video article shows its picture with a play button (as the source's player does); pressing it loads the embedded
   player in the picture's place and starts it. Without script the core embed is shown instead. */
;(() => {
  for (const box of document.querySelectorAll('.je-video')) {
    const frame = box.querySelector('.je-video__embed iframe')
    if (!frame || !box.querySelector('.je-video__poster')) continue
    const src = frame.getAttribute('src') || ''
    frame.removeAttribute('src')
    frame.dataset.src = src
    box.classList.add('is-poster')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'je-video__play'
    button.setAttribute('aria-label', 'Play the video')
    button.innerHTML =
      '<svg viewBox="0 0 448 512" width="24" height="27" aria-hidden="true" focusable="false"><path fill="currentColor" d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"/></svg>'
    button.addEventListener('click', () => {
      frame.src = src + (src.includes('?') ? '&' : '?') + 'autoplay=1'
      box.classList.remove('is-poster')
      frame.focus()
    })
    box.appendChild(button)
  }
})()

/* 1.0.3: the account forms: a show/hide button on every password field (as the source's) and a strength bar under the new password. */
;(() => {
  const eye =
    '<svg viewBox="0 0 576 512" width="18" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"/></svg>'
  for (const input of document.querySelectorAll('.je-acct input[type="password"]')) {
    let group = input.closest('.je-acct__pw')
    if (!group) {
      group = document.createElement('div')
      group.className = 'je-acct__pw'
      input.before(group)
      group.appendChild(input)
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'je-acct__eye'
    button.setAttribute('aria-label', 'Show password')
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = eye
    button.addEventListener('click', () => {
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      button.setAttribute('aria-pressed', show ? 'true' : 'false')
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
    })
    group.appendChild(button)
    if (input.id === 'je-je_password') {
      // a native <meter>, as the source's password field draws it (low 40, high 99, optimum 100)
      const bar = document.createElement('meter')
      bar.className = 'je-acct__strength'
      bar.setAttribute('aria-label', 'Password strength')
      bar.min = 0
      bar.max = 100
      bar.low = 40
      bar.high = 99
      bar.optimum = 100
      bar.value = 0
      group.after(bar)
      input.addEventListener('input', () => {
        const v = input.value
        const score = Math.min(
          4,
          (v.length >= 12) + (/[a-z]/.test(v) && /[A-Z]/.test(v)) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v)
        )
        bar.value = (v ? Math.max(1, score) : 0) * 25
        bar.dataset.score = String(v ? score : 0)
      })
    }
  }
})()

/* 1.0.3: the Date of Birth field is a text field with a calendar button, as the source draws it (YYYY-MM-DD typed or picked). Without script it stays the browser's own date input. */
;(() => {
  for (const input of document.querySelectorAll('.je-acct input[type="date"]')) {
    const value = input.value
    input.type = 'text'
    input.value = value
    input.placeholder = 'YYYY-MM-DD'
    input.pattern = '\\d{4}-\\d{2}-\\d{2}'
    input.inputMode = 'numeric'
    input.autocomplete = 'bday'
    const group = document.createElement('div')
    group.className = 'je-acct__pw'
    input.before(group)
    group.appendChild(input)
    const picker = document.createElement('input')
    picker.type = 'date'
    picker.tabIndex = -1
    picker.setAttribute('aria-hidden', 'true')
    picker.setAttribute('aria-label', 'Date picker')
    picker.className = 'je-acct__datepicker'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'je-acct__cal'
    button.setAttribute('aria-label', 'Choose a date')
    button.innerHTML =
      '<svg viewBox="0 0 448 512" width="16" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M0 464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V192H0v272zm320-196c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12v-40zm0 128c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12v-40zM192 268c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12v-40zm0 128c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12v-40zM64 268c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12v-40zm0 128c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12v-40zM400 64h-48V16c0-8.8-7.2-16-16-16h-32c-8.8 0-16 7.2-16 16v48H160V16c0-8.8-7.2-16-16-16h-32c-8.8 0-16 7.2-16 16v48H48C21.5 64 0 85.5 0 112v48h448v-48c0-26.5-21.5-48-48-48z"/></svg>'
    button.addEventListener('click', () => {
      picker.value = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : ''
      if (typeof picker.showPicker === 'function') {
        try {
          picker.showPicker()
        } catch {
          input.focus()
        }
      } else {
        input.focus()
      }
    })
    picker.addEventListener('change', () => {
      input.value = picker.value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    group.append(button, picker)
  }
})()

/* 1.0.3: the search card's Advanced Search button opens and closes its panel (open at first, as the source's is). */
;(() => {
  for (const button of document.querySelectorAll('.je-sf__adv')) {
    const panel = document.getElementById(button.getAttribute('aria-controls') || '')
    if (!panel) continue
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true'
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
      panel.hidden = !open
    })
  }
})()

/* 1.0.3: home 4 lists its cards as a masonry (the source's Masonry layout): every card goes under the shortest column, 36px apart;
   three 352px columns from 1200px, two from 768px, one below. Without script the cards stay in the plain grid. */
;(() => {
  const list = document.querySelector(
    'body.je-slug-home-4 .je-list--grid .je-list__items, body.je-slug-category-style-3 .tracy-query .tracy-grid, body:is(.je-slug-category-style-1, .je-slug-resources, .je-slug-lifestyle) .tracy-query .tracy-grid'
  )
  if (!list) return
  const tabletOnly = !list.closest('.je-slug-home-4, .je-slug-category-style-3') // Style 1 and its siblings are one card wide except from 768px to 991px
  const phoneGap = 24 // the card gap below 768px (1.0.8 pass 4: measured source pitch is card height + 24px on home 4 too)
  const rowOrder = true // the source's Isotope runs with horizontalOrder: card n goes to column n mod columns, under what that column holds (home 4 too, Trending included)
  const layout = () => {
    const items = [...list.children]
    if (tabletOnly && (innerWidth < 768 || innerWidth > 991)) {
      for (const el of [list, ...items]) el.removeAttribute('style')
      return
    }
    const cols = innerWidth >= 1200 ? 3 : innerWidth >= 768 ? 2 : 1
    const gap = 36
    list.style.position = 'relative'
    const colW = (list.parentElement.clientWidth - (cols - 1) * gap) / cols
    const heights = Array.from({ length: cols }, () => 0)
    items.forEach((li, i) => {
      li.style.position = 'absolute'
      li.style.width = `${colW}px`
      const at = rowOrder ? i % cols : heights.indexOf(Math.min(...heights))
      li.style.left = `${at * (colW + gap)}px`
      li.style.top = `${heights[at]}px`
      heights[at] +=
        li.offsetHeight + (cols === 1 ? phoneGap + (li.classList.contains('je-trend-cell') ? 22 : 0) : gap)
    })
    // home 4's one-column list keeps the last card's 24px margin inside the list, like the source
    const keepTail = cols === 1 && list.closest('.je-slug-home-4')
    list.style.height = `${Math.max(...heights) - (keepTail ? 0 : cols === 1 ? phoneGap : gap)}px`
  }
  layout()
  addEventListener('load', layout)
  addEventListener('resize', layout)
  if (window.ResizeObserver) new ResizeObserver(layout).observe(list.parentElement)
})()

/* 1.0.3: the category picture row of home 2 is a sideways row like the source's Owl one: below 1200px it shows one dot per scroll
   position (the active dot is a 24px pill). Without script it is a plain row that scrolls. */
;(() => {
  for (const list of document.querySelectorAll('.je-cattiles__list')) {
    const items = [...list.children]
    if (items.length < 2) continue
    const dots = document.createElement('div')
    dots.className = 'je-cattiles__dots'
    dots.setAttribute('role', 'group')
    dots.setAttribute('aria-label', 'Categories')
    list.after(dots)
    let buttons = []
    const step = () => items[1].offsetLeft - items[0].offsetLeft || list.clientWidth
    const perView = () =>
      Math.max(1, Math.round((list.clientWidth + (step() - items[0].offsetWidth)) / step()))
    const paint = () => {
      const at = Math.min(Math.round(list.scrollLeft / step()), buttons.length - 1)
      buttons.forEach((b, i) => {
        b.classList.toggle('is-active', i === at)
        b.setAttribute('aria-current', i === at ? 'true' : 'false')
      })
    }
    const build = () => {
      const n = Math.max(1, items.length - perView() + 1)
      if (buttons.length === n) return paint()
      dots.replaceChildren()
      buttons = []
      for (let i = 0; i < n; i++) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'je-gallery__dot'
        b.setAttribute('aria-label', `Show categories from ${i + 1}`)
        b.addEventListener('click', () => list.scrollTo({ left: i * step(), behavior: 'smooth' }))
        dots.appendChild(b)
        buttons.push(b)
      }
      dots.hidden = n < 2
      paint()
    }
    list.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true })
    addEventListener('resize', build)
    build()
  }
  /* ---------- 4. gallery article ---------- */
  const initGallery = (card) => {
    const gallery = card.querySelector('.jes-gallery')
    const pictures = gallery ? [...gallery.querySelectorAll('img')] : []
    if (pictures.length < 2) return
    const slider = document.createElement('div')
    slider.className = 'je-gslider'
    slider.setAttribute('role', 'group')
    slider.setAttribute('aria-roledescription', 'carousel')
    slider.setAttribute('aria-label', 'Gallery')
    const viewport = document.createElement('div')
    viewport.className = 'je-gslider__viewport'
    const slides = pictures.map((img, i) => {
      const figure = document.createElement('figure')
      figure.className = 'je-gslider__slide'
      figure.setAttribute('role', 'group')
      figure.setAttribute('aria-roledescription', 'slide')
      figure.setAttribute('aria-label', `${i + 1} of ${pictures.length}`)
      const copy = img.cloneNode(true)
      copy.removeAttribute('class')
      copy.removeAttribute('loading')
      copy.alt = img.alt || ''
      figure.appendChild(copy)
      viewport.appendChild(figure)
      return figure
    })
    const arrow = (cls, label, glyph) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `je-gslider__arrow ${cls}`
      button.setAttribute('aria-label', label)
      button.innerHTML = `<span aria-hidden="true">${glyph}</span>`
      return button
    }
    const prev = arrow('je-gslider__prev', 'Previous picture', '&lsaquo;')
    const next = arrow('je-gslider__next', 'Next picture', '&rsaquo;')
    const thumbs = document.createElement('ul')
    thumbs.className = 'je-gslider__thumbs'
    let index = 0
    const show = (i) => {
      index = (i + slides.length) % slides.length
      slides.forEach((slide, n) => {
        slide.hidden = n !== index
      })
      for (const [n, li] of [...thumbs.children].entries()) {
        const button = li.firstElementChild
        if (n === index) button.setAttribute('aria-current', 'true')
        else button.removeAttribute('aria-current')
      }
    }
    pictures.forEach((img, n) => {
      const li = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label', `Show picture ${n + 1}`)
      const thumb = document.createElement('img')
      thumb.src = img.currentSrc || img.src
      thumb.alt = ''
      thumb.loading = 'lazy'
      button.appendChild(thumb)
      button.addEventListener('click', () => show(n))
      li.appendChild(button)
      thumbs.appendChild(li)
    })
    prev.addEventListener('click', () => show(index - 1))
    next.addEventListener('click', () => show(index + 1))
    slider.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1)
      else if (e.key === 'ArrowRight') show(index + 1)
      else return
      e.preventDefault()
    })
    viewport.append(prev, next, thumbs)
    slider.appendChild(viewport)
    const hero = card.querySelector('.je-page__hero')
    if (hero) hero.before(slider)
    else card.prepend(slider)
    card.classList.add('je-gslider-on')
    show(0)
  }
  /* ---------- 5. back to top ---------- */
  // Shown once the header has scrolled out of view, as the source's `top-away` does; the tab itself is printed by the theme on Home 4 only.
  const toTop = document.getElementById('back-to-top')
  if (toTop) {
    const head = document.querySelector('.je-header')
    const away = () =>
      document.body.classList.toggle(
        'je-top-away',
        head ? head.getBoundingClientRect().bottom <= 0 : window.scrollY > 200
      )
    window.addEventListener('scroll', away, { passive: true })
    away()
    toTop.addEventListener('click', (e) => {
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })
    })
  }

  /* the source draws the slider above the title of every gallery-format article (1.0.4: the posts too, not only the gallery page) */
  for (const card of document.querySelectorAll('.je-articlecard'))
    if (card.querySelector('.jes-gallery')) initGallery(card)
})()
