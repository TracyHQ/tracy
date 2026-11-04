// The review page's behaviour (#357), as a string for one script tag. The choices live in the browser's local storage when
// it lets the page use it (a private window may not) and in memory when it does not.
export const CLIENT_SOURCE = `(() => {
  const root = document.documentElement
  const data = JSON.parse(document.getElementById('review-config').textContent)
  const memory = {}
  const store = {
    get(k) { try { return localStorage.getItem(k) } catch { return memory[k] ?? null } },
    set(k, v) { try { localStorage.setItem(k, v) } catch { memory[k] = v } }
  }
  const key = 'write-review:' + data.runKey
  let decisions = {}
  try { decisions = JSON.parse(store.get(key) || '{}') } catch { decisions = {} }
  const save = () => store.set(key, JSON.stringify(decisions))
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]

  const theme = store.get('write-review:theme')
  if (theme) root.dataset.theme = theme
  document.getElementById('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = dark ? 'light' : 'dark'
    store.set('write-review:theme', root.dataset.theme)
  })

  function showTab(name) {
    $$('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name))
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name })
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name)
  }
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)))
  showTab(location.hash === '#pictures' ? 'pictures' : 'pages')

  const rejected = () => $$('article.frame').map((a) => a.dataset.frame).filter((id) => decisions[id]?.verdict === 'reject')
  function paint() {
    $$('article.frame').forEach((a) => {
      const d = decisions[a.dataset.frame] || {}
      $$('[data-verdict]', a).forEach((b) => b.setAttribute('aria-pressed', String(d.verdict === b.dataset.verdict)))
      const box = a.querySelector('textarea')
      if (box && document.activeElement !== box) box.value = d.note || ''
    })
    document.getElementById('redo-count').textContent = String(rejected().length)
    applyFilter()
  }
  let filter = 'all'
  function applyFilter() {
    $$('article.frame').forEach((a) => {
      const d = decisions[a.dataset.frame] || {}
      a.hidden = !(filter === 'all' || (filter === 'failed' && a.dataset.state === 'failed') ||
        (filter === 'rejected' && d.verdict === 'reject') || (filter === 'open' && !d.verdict))
    })
    $$('[data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === filter))
  }
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; applyFilter() }))
  $$('article.frame').forEach((a) => {
    const id = a.dataset.frame
    $$('[data-verdict]', a).forEach((b) => b.addEventListener('click', () => {
      const d = decisions[id] || (decisions[id] = {})
      d.verdict = d.verdict === b.dataset.verdict ? null : b.dataset.verdict
      save(); paint()
    }))
    a.querySelector('textarea').addEventListener('input', (e) => {
      (decisions[id] || (decisions[id] = {})).note = e.target.value
      save()
    })
  })
  async function copy(text, button) {
    try { await navigator.clipboard.writeText(text) } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select()
      try { document.execCommand('copy') } finally { t.remove() }
    }
    const was = button.textContent
    button.textContent = data.copied
    setTimeout(() => { button.textContent = was }, 1400)
  }
  document.getElementById('copy-redo').addEventListener('click', (e) => copy(JSON.stringify(rejected()), e.currentTarget))
  document.getElementById('copy-notes').addEventListener('click', (e) =>
    copy(rejected().map((id) => id + ': ' + ((decisions[id] && decisions[id].note) || '').replace(/\\s+/g, ' ').trim()).join('\\n'), e.currentTarget))
  document.addEventListener('click', (e) => {
    if (e.target.matches('.shot img, .crops img')) e.target.classList.toggle('full')
  })
  paint()
})()`
