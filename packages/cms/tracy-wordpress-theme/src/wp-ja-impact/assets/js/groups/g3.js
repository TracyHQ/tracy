/* wp-ja-impact, group g3: what the source's scripts do for these sections.
 *  - the accordion (Bootstrap collapse in the source): the first answer open, each card toggles on its own;
 *    the question becomes a button with aria-expanded / aria-controls and ids that are unique per item and
 *    per module; the cards are split in two columns (the first holds ceil(n / 2));
 *  - the latest-news cards laid out as masonry (the source's Masonry script): each card spans its own height;
 *  - the funds slider: the card at the right edge of the view loses its divider (Owl's `last-active`).
 * Without the script every answer shows, the news cards sit in a plain grid and the slider scrolls. */
;(() => {
  const ready = (fn) =>
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn()

  const accordion = (root, moduleIndex) => {
    const list = root.querySelector('.jim-acc__list')
    if (!list || list.classList.contains('is-ready')) return
    const items = Array.from(list.querySelectorAll(':scope > .jim-acc__item'))
    items.forEach((item, i) => {
      const heading = item.querySelector('.jim-acc__q')
      const panel = item.querySelector('.jim-acc__body')
      if (!heading || !panel) return
      const id = `jim-acc-${moduleIndex}-${i}`
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'jim-acc__btn'
      button.id = `${id}-button`
      const text = document.createElement('span')
      text.className = 'jim-acc__text'
      while (heading.firstChild) text.appendChild(heading.firstChild)
      const marker = document.createElement('span')
      marker.className = 'jim-acc__marker'
      marker.setAttribute('aria-hidden', 'true')
      button.append(text, marker)
      heading.appendChild(button)
      heading.dataset.n = String(i + 1).padStart(2, '0')
      panel.id = `${id}-panel`
      panel.setAttribute('role', 'region')
      panel.setAttribute('aria-labelledby', button.id)
      button.setAttribute('aria-controls', panel.id)
      const set = (open) => {
        button.setAttribute('aria-expanded', open ? 'true' : 'false')
        panel.hidden = !open
      }
      set(i === 0)
      button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'))
    })
    const perColumn = Math.ceil(items.length / 2)
    for (let c = 0; c < 2; c++) {
      const col = document.createElement('div')
      col.className = 'jim-acc__col'
      items.slice(c * perColumn, (c + 1) * perColumn).forEach((item) => col.appendChild(item))
      list.appendChild(col)
    }
    list.classList.add('is-ready')
  }

  const masonry = (grid) => {
    const cards = Array.from(grid.children)
    // The source's masonry stacks card i in column i % columns, each under the previous one of its column (measured on
    // the source stand); a grid auto-placement would fill the gaps in another order.
    const lay = () => {
      grid.classList.add('is-masonry')
      const style = getComputedStyle(grid)
      const gap = parseFloat(style.columnGap) || 0
      const columns = Math.max(1, style.gridTemplateColumns.split(' ').length)
      const used = Array.from({ length: columns }, () => 0)
      cards.forEach((li, i) => {
        const h = li.firstElementChild ? li.firstElementChild.getBoundingClientRect().height : 0
        const span = Math.ceil(h + gap)
        const column = i % columns
        li.style.gridColumn = String(column + 1)
        li.style.gridRow = `${used[column] + 1} / span ${span}`
        used[column] += span
      })
    }
    lay()
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(lay)
      cards.forEach((li) => li.firstElementChild && ro.observe(li.firstElementChild))
    }
    window.addEventListener('load', lay)
    window.addEventListener('resize', lay)
  }

  const lastActive = (track) => {
    const slides = Array.from(track.children)
    const paint = () => {
      const visible = slides.filter((s) => !s.hasAttribute('aria-hidden'))
      slides.forEach((s) => s.classList.remove('is-last-active'))
      if (visible.length > 1) visible[visible.length - 1].classList.add('is-last-active')
    }
    paint()
    const mo = new MutationObserver(paint)
    slides.forEach((s) => mo.observe(s, { attributes: true, attributeFilter: ['aria-hidden'] }))
  }

  ready(() => {
    document.querySelectorAll('.acm-accordion').forEach((el, i) => accordion(el, i + 1))
    document.querySelectorAll('.style-news .jim-news-grid').forEach(masonry)
    // The carousel runtime marks its slides after it starts: look again once it had its turn.
    window.setTimeout(
      () => document.querySelectorAll('.style-funds .jim-fund-slides').forEach(lastActive),
      300
    )
  })
})()
