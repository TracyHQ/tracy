// Fills the "can't reach" page from its query string (src/load-failure.js `unreachableQuery`). Text
// only (`textContent`), and Retry accepts nothing but an http(s) address, so a crafted query cannot
// inject markup or a `javascript:` link. Runs in the sandboxed renderer with no Node and no preload
// API. Words missing from `t` keep the English already in the page.
;(() => {
  const params = new URLSearchParams(location.search)
  let words = {}
  try {
    const parsed = JSON.parse(params.get('t') ?? '{}')
    if (parsed !== null && typeof parsed === 'object') words = parsed
  } catch {
    // Unreadable words: the English in the page stays.
  }
  const word = (key) => (typeof words[key] === 'string' && words[key] !== '' ? words[key] : null)

  const lang = params.get('lang')
  if (lang && /^[a-z]{2}$/.test(lang)) document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
  for (const element of document.querySelectorAll('[data-t]')) {
    const text = word(element.dataset.t)
    if (text !== null) element.textContent = text
  }
  if (word('unreachable.title')) document.title = word('unreachable.title')

  // Chromium's error name, for whoever is asked for help; only when there is one.
  document.getElementById('detail').hidden = (params.get('detail') ?? '') === ''

  // Retry is a plain link back to the page that failed: the window's own navigation guard keeps it
  // on Tracy, and a failure again brings this page back.
  const retry = document.getElementById('retry')
  try {
    const target = new URL(params.get('retry') ?? '')
    if (target.protocol === 'https:' || target.protocol === 'http:') {
      retry.href = target.href
      retry.hidden = false
    }
  } catch {
    // No usable address: no Retry link.
  }
})()
