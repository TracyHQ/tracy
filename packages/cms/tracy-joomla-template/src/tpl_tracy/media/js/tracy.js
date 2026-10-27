/* tpl_tracy: the two behaviours CSS cannot do — the menu toggle, and marking the highlighted
 * pricing column from the table's own data-hot attribute. */
;(() => {
  const toggle = document.querySelector('.tracy-nav-toggle')
  const nav = document.getElementById('tracy-nav')
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open')
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      document.body.classList.toggle('tracy-nav-open', open)
    })
  }

  for (const table of document.querySelectorAll('table.tracy-pricing[data-hot]')) {
    const hot = Number.parseInt(table.dataset.hot ?? '', 10)
    if (!Number.isInteger(hot) || hot < 0) continue
    for (const row of table.rows) {
      const cell = row.cells[hot + 1]
      if (cell) cell.classList.add('is-hot')
    }
  }
})()
