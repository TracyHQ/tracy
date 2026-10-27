/* Group "blog": the masonry layout of the article lists (the source's Isotope grid), the Advanced Search button of the
 * finder and the filter row of the tag list. Without this script the lists stay in the carried sheet's floated rows. */
;(function () {
  'use strict'

  // The source's Isotope grid in masonry mode: items are placed in the shortest column, as absolutely positioned boxes.
  function layout(grid) {
    const sizer = grid.querySelector('.grid-sizer')
    const items = Array.prototype.slice.call(grid.children).filter(function (el) {
      return el !== sizer && el.classList.contains('isotope-item')
    })
    if (!sizer || !items.length) return
    const colWidth = sizer.getBoundingClientRect().width
    if (!colWidth) return
    const cols = Math.max(1, Math.round(grid.clientWidth / colWidth))
    const heights = []
    for (let c = 0; c < cols; c++) heights.push(0)
    grid.style.position = 'relative'
    items.forEach(function (item) {
      item.style.position = 'absolute'
      item.style.width = colWidth + 'px'
      const col = heights.indexOf(Math.min.apply(null, heights))
      item.style.left = col * colWidth + 'px'
      item.style.top = heights[col] + 'px'
      heights[col] +=
        item.getBoundingClientRect().height + parseFloat(getComputedStyle(item).marginBottom || '0')
    })
    grid.style.height = Math.max.apply(null, heights) + 'px'
  }

  function initGrid(grid) {
    const run = function () {
      layout(grid)
    }
    run()
    window.addEventListener('load', run)
    window.addEventListener('resize', run)
    grid.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', run)
    })
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run)
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

  document.querySelectorAll('.ja-masonry-wrap .isotope').forEach(initGrid)
  document.querySelectorAll('.js-tag-filter').forEach(initTagFilter)
  document.querySelectorAll('.js-finder-searchform button[aria-controls]').forEach(initFinder)
})()
