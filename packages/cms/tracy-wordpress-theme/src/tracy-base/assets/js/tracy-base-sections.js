/* tracy-base: the two section behaviours the Joomla ACM blocks carry in script, restored as
 * progressive enhancement. Without this file every tab panel shows in order and the carousel is a
 * plain scroll container — readable, only longer.
 *
 *   tabs      — `.acm-tabs`: the label links become a WAI-ARIA tablist (roving tabindex, arrow
 *               keys, Home/End); only the selected panel shows, as on the source.
 *   carousel  — `.acm-carousel`: two step buttons beside the heading scroll the track by one
 *               slide; each is disabled at its end of the track.
 *   questions — `.tracy-faq__list` on the front page: the first answer starts open, as on the
 *               source, unless the page already opened one.
 *   people    — `.tracy-testimonials` cards: the name and role sit beside a round badge of the
 *               name's initials, as the source draws its people. The badge is decoration
 *               (aria-hidden); the name stays the editable paragraph.
 *   topics    — the "Topics" page (a page body that is only linked headings, their lines and
 *               pictures): each top-level heading becomes a card with its line under a rule, and
 *               the sub-topics under it fold behind a round "+" button, as the source's category
 *               tree. The headings and lines stay the editable blocks, only regrouped.
 *   social    — the footer's social list: each mark is followed by the handle, one network per
 *               row, as the source footer lists them; the handle paragraph stays the one to edit. */
;(() => {
  for (const block of document.querySelectorAll('.acm-tabs')) {
    const links = [...block.querySelectorAll('.acm-tabs__tab a[href^="#"]')]
    const pairs = links
      .map((link) => ({ link, panel: document.getElementById(link.getAttribute('href').slice(1)) }))
      .filter((p) => p.panel && block.contains(p.panel))
    if (pairs.length < 2) continue
    const list = block.querySelector('.acm-tabs__list')
    if (list) list.setAttribute('role', 'tablist')
    pairs.forEach(({ link, panel }, i) => {
      if (!link.id) link.id = `${panel.id}-tab`
      link.setAttribute('role', 'tab')
      link.setAttribute('aria-controls', panel.id)
      link.parentElement?.setAttribute('role', 'presentation')
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', link.id)
      panel.setAttribute('tabindex', '0')
      panel.dataset.index = String(i)
    })
    const select = (index, focus) => {
      pairs.forEach(({ link, panel }, i) => {
        const on = i === index
        link.setAttribute('aria-selected', on ? 'true' : 'false')
        link.setAttribute('tabindex', on ? '0' : '-1')
        link.parentElement?.classList.toggle('is-active', on)
        panel.hidden = !on
      })
      if (focus) pairs[index].link.focus()
    }
    pairs.forEach(({ link }, i) => {
      link.addEventListener('click', (event) => {
        event.preventDefault()
        select(i, false)
      })
      link.addEventListener('keydown', (event) => {
        const last = pairs.length - 1
        const next = {
          ArrowRight: i === last ? 0 : i + 1,
          ArrowLeft: i === 0 ? last : i - 1,
          Home: 0,
          End: last
        }[event.key]
        if (next === undefined) return
        event.preventDefault()
        select(next, true)
      })
    })
    select(0, false)
  }

  for (const block of document.querySelectorAll('.acm-carousel')) {
    const track = block.querySelector('.acm-carousel__track')
    const head = block.querySelector('.tracy-section__head')
    if (!track || !head || track.children.length < 2) continue
    const nav = document.createElement('div')
    nav.className = 'acm-carousel__nav'
    const make = (dir, label) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `acm-carousel__step acm-carousel__step--${dir}`
      button.setAttribute('aria-label', label)
      button.addEventListener('click', () => {
        const slide = track.children[0]
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0
        const step = (slide ? slide.getBoundingClientRect().width : track.clientWidth) + gap
        track.scrollBy({ left: dir === 'prev' ? -step : step, behavior: 'smooth' })
      })
      nav.append(button)
      return button
    }
    const prev = make('prev', 'Previous slide')
    const next = make('next', 'Next slide')
    const update = () => {
      prev.disabled = track.scrollLeft <= 1
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1
    }
    track.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    head.parentElement.insertBefore(nav, head.nextSibling)
    block.classList.add('has-steps')
    update()
  }

  for (const list of document.querySelectorAll('.home .tracy-faq__list')) {
    const items = list.querySelectorAll('details')
    if (items.length && ![...items].some((d) => d.open)) items[0].open = true
  }

  for (const card of document.querySelectorAll('.tracy-testimonials .tracy-card')) {
    const name = card.querySelector('.acm-testimonials__name')
    if (!name || card.querySelector('.acm-testimonials__person')) continue
    const role = card.querySelector('.acm-testimonials__role')
    const initials = name.textContent
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase()
    const person = document.createElement('div')
    person.className = 'acm-testimonials__person'
    const badge = document.createElement('span')
    badge.className = 'acm-testimonials__badge'
    badge.setAttribute('aria-hidden', 'true')
    badge.textContent = initials
    const who = document.createElement('div')
    who.className = 'acm-testimonials__who'
    name.before(person)
    who.append(name)
    if (role) who.append(role)
    person.append(badge, who)
  }

  for (const block of document.querySelectorAll('.tracy-footer__social .acm-social-links')) {
    const handle = block.querySelector('.acm-social-links__handle')
    const text = handle?.textContent.trim()
    if (!text || block.classList.contains('has-row-handles')) continue
    for (const anchor of block.querySelectorAll('.wp-block-social-link-anchor')) {
      const label = document.createElement('span')
      label.className = 'acm-social-links__row-handle'
      label.setAttribute('aria-hidden', 'true')
      label.textContent = text
      anchor.append(label)
    }
    block.classList.add('has-row-handles')
  }

  for (const body of document.querySelectorAll('.tracy-page-stack > .wp-block-post-content')) {
    const kids = [...body.children]
    const isPicture = (el) => el.matches('.wp-block-group') && el.querySelector(':scope > .wp-block-image')
    const topics = kids.filter((el) => el.matches('h2.wp-block-heading') && el.querySelector(':scope > a'))
    const allowed = kids.every(
      (el) => el.matches('h2.wp-block-heading, h3.wp-block-heading, p.wp-block-paragraph') || isPicture(el)
    )
    if (topics.length < 3 || !allowed || body.classList.contains('has-topics')) continue
    const grid = document.createElement('div')
    grid.className = 'tracy-topics'
    let card = null
    let children = null
    let index = 0
    for (const el of kids) {
      if (el.matches('h2')) {
        card = document.createElement('div')
        card.className = 'tracy-topics__card'
        el.classList.add('tracy-topics__title')
        card.append(el)
        children = null
        grid.append(card)
      } else if (el.matches('h3') && card) {
        if (!children) {
          index += 1
          children = document.createElement('div')
          children.className = 'tracy-topics__children'
          children.id = `tracy-topics-${index}`
          children.hidden = true
          const toggle = document.createElement('button')
          toggle.type = 'button'
          toggle.className = 'tracy-topics__toggle'
          toggle.setAttribute('aria-expanded', 'false')
          toggle.setAttribute('aria-controls', children.id)
          toggle.setAttribute('aria-label', 'Show more categories')
          toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') !== 'true'
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
            children.hidden = !open
          })
          card.querySelector('.tracy-topics__title').append(toggle)
          card.append(children)
        }
        const sub = document.createElement('div')
        sub.className = 'tracy-topics__card'
        el.classList.add('tracy-topics__title')
        sub.append(el)
        children.append(sub)
      } else if (card) {
        const target = children ? children.lastElementChild : card
        if (el.matches('p')) el.classList.add('tracy-topics__desc')
        target.append(el)
      }
    }
    body.append(grid)
    body.classList.add('has-topics')
  }
})()
