/* wp-ja-restaurant: tabs box. Moves the menu sections that follow a tabs box into its panels container and
   turns their tab titles into tab buttons. Without this script the sections simply show one after another. */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.acm-container-tabs').forEach(function (box, boxIndex) {
    const nav = box.querySelector('.jr-tabs-nav')
    const host = box.querySelector('.jr-tabs-panels')
    const root = box.closest('.t3-section-module')
    if (!nav || !host || !root) return
    const panels = []
    let next = root.nextElementSibling
    while (next && next.classList.contains('jr-tab-panel')) {
      panels.push(next)
      next = next.nextElementSibling
    }
    if (!panels.length) return
    const tabs = []
    panels.forEach(function (panel, i) {
      const heading = panel.querySelector('.jr-tab-title')
      const title = heading ? heading.textContent.trim() : ''
      const id = 'jr-tab-' + boxIndex + '-' + i
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.textContent = title || String(i + 1)
      a.id = id + '-tab'
      a.setAttribute('role', 'tab')
      a.setAttribute('aria-controls', id)
      a.href = '#' + id
      li.setAttribute('role', 'presentation')
      li.appendChild(a)
      nav.appendChild(li)
      panel.id = id
      panel.classList.add('tab-pane')
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', id + '-tab')
      host.appendChild(panel)
      tabs.push({ li: li, a: a, panel: panel })
    })
    function show(index, focus) {
      tabs.forEach(function (t, i) {
        const on = i === index
        t.li.classList.toggle('active', on)
        t.a.classList.toggle('active', on)
        t.a.setAttribute('aria-selected', on ? 'true' : 'false')
        t.a.tabIndex = on ? 0 : -1
        t.panel.classList.toggle('active', on)
        t.panel.hidden = !on
      })
      if (focus) tabs[index].a.focus()
    }
    tabs.forEach(function (t, i) {
      t.a.addEventListener('click', function (e) {
        e.preventDefault()
        show(i, false)
      })
      t.a.addEventListener('keydown', function (e) {
        const n = tabs.length
        let to = -1
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % n
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + n) % n
        else if (e.key === 'Home') to = 0
        else if (e.key === 'End') to = n - 1
        if (to < 0) return
        e.preventDefault()
        show(to, true)
      })
    })
    show(0, false)
  })
})
