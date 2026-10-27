/* tracy: mark the highlighted pricing column from the table's own data-hot attribute. */
;(() => {
  for (const table of document.querySelectorAll('table.tracy-pricing[data-hot]')) {
    const hot = Number.parseInt(table.dataset.hot ?? '', 10)
    if (!Number.isInteger(hot) || hot < 0) continue
    for (const row of table.rows) {
      const cell = row.cells[hot + 1]
      if (cell) cell.classList.add('is-hot')
    }
  }
})()
