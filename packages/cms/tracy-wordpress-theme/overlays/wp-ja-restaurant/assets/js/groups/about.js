/* About group: the rating bars of the statistics section.
   The count is the text of the bar's own paragraph; the bar width follows it, and the
   source's `inview` class (which starts the grow animation) is set when the band scrolls into view. */
;(function () {
  'use strict'
  const bands = document.querySelectorAll('.uber-stats.style-1')
  if (!bands.length) return
  bands.forEach(function (band) {
    band.querySelectorAll('.progressbar').forEach(function (bar) {
      const n = parseFloat((bar.textContent || '').replace(',', '.'))
      if (!isFinite(n)) return
      bar.style.width = Math.max(0, Math.min(100, n)) + '%'
      // the source prints "85%" as the bar's text; the stored count is the bare number, so the sign is added here
      const label = bar.querySelector('.jr-stats-count')
      if (label && label.textContent.indexOf('%') === -1) label.textContent = label.textContent.trim() + '%'
    })
    const show = function () {
      ;(band.parentElement || band).classList.add('inview')
    }
    if (!('IntersectionObserver' in window)) return show()
    const io = new IntersectionObserver(function (entries) {
      if (
        entries.some(function (e) {
          return e.isIntersecting
        })
      ) {
        show()
        io.disconnect()
      }
    })
    io.observe(band)
  })
})()
