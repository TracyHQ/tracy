// Fills the waiting page from its query string (src/waiting-page.js builds it). Text only
// (`textContent`), and the Cancel link accepts nothing but an http(s) origin, so a crafted query
// cannot inject markup or a `javascript:` link. Runs in the sandboxed renderer with no Node and no
// preload API. Words missing from `t` keep the English already in the page.
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
  if (word('desktopWait.pageTitle')) document.title = word('desktopWait.pageTitle')
  for (const element of document.querySelectorAll('[data-t]')) {
    const text = word(element.dataset.t)
    if (text !== null) element.textContent = text
  }
  for (const element of document.querySelectorAll('[data-t-title]')) {
    const text = word(element.dataset.tTitle)
    if (text !== null) element.title = text
  }
  for (const element of document.querySelectorAll('[data-t-label]')) {
    const text = word(element.dataset.tLabel)
    if (text !== null) element.setAttribute('aria-label', text)
  }

  // An email sign-in names the address the code went to; the address is text, never markup.
  const email = params.get('email')
  const withEmail = word('desktopWait.bodyEmail') ?? 'Tracy opened your browser for {email}.'
  if (email && withEmail.includes('{email}')) {
    const body = document.getElementById('body')
    const [before, ...after] = withEmail.split('{email}')
    const strong = document.createElement('b')
    strong.textContent = email
    body.replaceChildren(document.createTextNode(before), strong, document.createTextNode(after.join(email)))
  }

  document.getElementById('code').textContent = params.get('code') ?? ''

  // First run: the content moves into the Setup frame.
  if (params.get('setup') === '1') {
    document.getElementById('pane-body').append(document.getElementById('content'))
    document.getElementById('plain').hidden = true
    document.getElementById('setup').hidden = false
  }

  const cancel = document.getElementById('cancel')
  try {
    const home = new URL(params.get('home') ?? '')
    if (home.protocol === 'https:' || home.protocol === 'http:') {
      cancel.href = new URL('/login', home.origin).href
      return
    }
  } catch {
    // Fall through: no usable home, so no Cancel link.
  }
  cancel.remove()
})()
