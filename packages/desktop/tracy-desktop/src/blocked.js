// Draws the blocked screen from the view the main process sends (src/blocked-screen.js
// `blockedView`): text through `textContent` only, buttons that name one of three actions. Runs in
// the sandboxed renderer; `tracyBlocked` is the page's whole reach (src/blocked-preload.js).
;(() => {
  const api = window.tracyBlocked
  if (!api) return
  const $ = (id) => document.getElementById(id)
  let pressing = false

  const draw = (view) => {
    if (!view || typeof view !== 'object') return
    if (typeof view.lang === 'string') document.documentElement.lang = view.lang
    $('title').textContent = String(view.title ?? '')
    document.title = String(view.title ?? document.title)
    $('body').textContent = String(view.body ?? '')
    const status = $('status')
    status.textContent = view.status ? String(view.status.text ?? '') : ''
    if (view.status) status.dataset.tone = String(view.status.tone ?? '')
    else delete status.dataset.tone
    const row = $('buttons')
    row.replaceChildren()
    for (const item of Array.isArray(view.buttons) ? view.buttons : []) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = String(item.label ?? '')
      button.dataset.primary = item.primary === true ? 'true' : 'false'
      button.dataset.action = String(item.action ?? '')
      button.disabled = pressing
      button.addEventListener('click', () => {
        if (pressing) return
        pressing = true
        for (const b of row.querySelectorAll('button')) b.disabled = true
        api
          .act(item.action)
          .then(draw, () => {})
          .finally(() => {
            pressing = false
            for (const b of row.querySelectorAll('button')) b.disabled = false
          })
      })
      row.append(button)
    }
  }

  api.onState(draw)
  api.get().then(draw, () => {})
})()
