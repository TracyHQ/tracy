/* Group "blog": the album slider of a gallery article (markup from inc/groups/blog.php, rules from the source's
 * `.ja-gallery-detail-slide`). One picture shows at a time; the arrow boxes and the numbered dots step through them,
 * and a swipe does the same. Without this script the first picture shows. */
;(function () {
  'use strict'

  function init(slider) {
    const track = slider.querySelector('.owl-wrapper')
    const items = slider.querySelectorAll('.owl-item')
    const dots = slider.querySelectorAll('.owl-page')
    if (!track || items.length < 2) return
    let index = 0

    function show(next) {
      index = (next + items.length) % items.length
      track.style.transform = 'translateX(' + String(-100 * index) + '%)'
      items.forEach(function (item, i) {
        if (i === index) item.removeAttribute('inert')
        else item.setAttribute('inert', '')
        item.setAttribute('aria-hidden', i === index ? 'false' : 'true')
      })
      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === index)
        if (i === index) dot.setAttribute('aria-current', 'true')
        else dot.removeAttribute('aria-current')
      })
    }

    function press(el, step) {
      if (!el) return
      el.addEventListener('click', step)
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          step()
        }
      })
    }

    press(slider.querySelector('.owl-prev'), function () {
      show(index - 1)
    })
    press(slider.querySelector('.owl-next'), function () {
      show(index + 1)
    })
    dots.forEach(function (dot, i) {
      press(dot, function () {
        show(i)
      })
    })

    let startX = null
    slider.addEventListener('pointerdown', function (e) {
      startX = e.clientX
    })
    slider.addEventListener('pointerup', function (e) {
      if (startX === null) return
      const dx = e.clientX - startX
      startX = null
      if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1))
    })
    show(0)
  }

  // The finder's Advanced Search button opens the tips, as the source's collapse does.
  function initFinder(button) {
    const panel = document.getElementById(button.getAttribute('aria-controls'))
    if (!panel) return
    button.addEventListener('click', function () {
      const open = panel.classList.toggle('in')
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
  }

  // The tag list's filter row: the select submits on change, Clear empties the field and submits.
  function initTagFilter(form) {
    const select = form.querySelector('select[name="limit"]')
    const clear = form.querySelector('.js-tag-filter-clear')
    if (select)
      select.addEventListener('change', function () {
        form.submit()
      })
    if (clear)
      clear.addEventListener('click', function () {
        const field = form.querySelector('input[name="filter-search"]')
        if (field) field.value = ''
        form.submit()
      })
  }

  document.querySelectorAll('.jr-album-slider').forEach(init)
  document.querySelectorAll('.js-tag-filter').forEach(initTagFilter)
  document.querySelectorAll('.js-finder-searchform button[aria-controls]').forEach(initFinder)
})()
