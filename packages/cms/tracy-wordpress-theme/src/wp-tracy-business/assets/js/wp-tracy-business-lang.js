/**
 * The language switcher's behaviour. Markup comes from inc/extra.php, which also decides the
 * SHAPE from the list length: nine languages or more marks the root `--modal` and the panel
 * opens modally at every width — top layer, backdrop, Escape and the focus trap all from the
 * platform. Up to eight it opens non-modally and stays the anchored dropdown it has always been.
 * A list-length question, answered once in PHP, so this file and the stylesheet cannot disagree.
 */
;(function () {
  function wire(root) {
    const toggle = root.querySelector('.tracy-lang__toggle')
    const panel = root.querySelector('.tracy-lang__panel')
    if (!toggle || !panel) return
    const search = root.querySelector('.tracy-lang__search-input')
    const empty = root.querySelector('.tracy-lang__empty')
    const items = Array.prototype.slice.call(root.querySelectorAll('.tracy-lang__item'))
    const modal = root.classList.contains('tracy-lang--modal')
    const dialog = typeof panel.showModal === 'function' && panel.tagName === 'DIALOG'

    function filter() {
      if (!search) return
      const q = (search.value || '').trim().toLowerCase()
      let shown = 0
      items.forEach(function (li) {
        const hit = q === '' || (li.getAttribute('data-tracy-lang-find') || '').indexOf(q) !== -1
        li.hidden = !hit
        if (hit) shown++
      })
      if (empty) empty.hidden = shown !== 0
    }

    function open() {
      return dialog ? panel.open : !panel.hidden
    }

    function set(want) {
      if (dialog) {
        if (want && !panel.open) modal ? panel.showModal() : panel.show()
        if (!want && panel.open) panel.close()
      } else {
        panel.hidden = !want
      }
      toggle.setAttribute('aria-expanded', want ? 'true' : 'false')
      if (want && search) search.focus()
      if (!want && search && search.value) {
        search.value = ''
        filter()
      }
    }

    toggle.addEventListener('click', function () {
      set(!open())
    })
    if (dialog) {
      // A modal dialog closes on Escape and on its backdrop by itself; keep aria-expanded honest,
      // and treat a click that lands on the dialog element itself as a backdrop click.
      panel.addEventListener('close', function () {
        toggle.setAttribute('aria-expanded', 'false')
      })
      panel.addEventListener('click', function (e) {
        if (e.target === panel) set(false)
      })
    }
    if (search) {
      search.addEventListener('input', filter)
      // Enter on a single remaining match goes straight there — the fastest way out of 43 rows.
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return
        const visible = items.filter(function (li) {
          return !li.hidden
        })
        if (visible.length === 1) {
          const link = visible[0].querySelector('a')
          if (link) {
            e.preventDefault()
            link.click()
          }
        }
      })
    }
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target) && open()) set(false)
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open()) {
        set(false)
        toggle.focus()
      }
    })
  }

  function start() {
    document.querySelectorAll('[data-tracy-lang]').forEach(wire)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
