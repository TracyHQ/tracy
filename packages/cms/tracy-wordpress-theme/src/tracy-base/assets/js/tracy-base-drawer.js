/* tracy-base: the phone menu, as the Joomla source's off-canvas menu draws it.
 *
 * The header's overlay menu is the core navigation block (`overlayMenu: always`); WordPress opens
 * and closes it, traps focus and restores it. Its own tree is the short navigation menu, so on the
 * source's narrow screens the Service, Resources and Company groups were missing. This file fills
 * the overlay with the same tree as the desktop row instead: every plain link, and every mega
 * block as a parent whose chevron drills into its panel's link lists, with a back link — the
 * source's "menu-item-drill" off-canvas. The brand is repeated in the overlay's top bar. The
 * desktop row stays the one source of the links; nothing here is content. */
;(() => {
  const row = document.querySelector('.tracy-header__links')
  const content = document.querySelector(
    '.tracy-header__menu .wp-block-navigation__responsive-container-content'
  )
  if (!row || !content || content.querySelector('.tracy-drawer')) return

  const brand = document.querySelector('.tracy-header__brand')
  const dialog = content.closest('.wp-block-navigation__responsive-dialog')
  if (brand && dialog) {
    const bar = document.createElement('div')
    bar.className = 'tracy-drawer__bar'
    const copy = brand.cloneNode(true)
    copy.setAttribute('aria-hidden', 'true')
    for (const link of copy.querySelectorAll('a')) link.tabIndex = -1
    bar.append(copy)
    dialog.prepend(bar)
  }

  const drawer = document.createElement('div')
  drawer.className = 'tracy-drawer'
  const root = document.createElement('ul')
  root.className = 'tracy-drawer__list'
  drawer.append(root)

  const item = (href, text) => {
    const li = document.createElement('li')
    li.className = 'tracy-drawer__item'
    const a = document.createElement('a')
    a.className = 'tracy-drawer__link'
    a.href = href
    a.textContent = text
    if (new URL(href, location.href).pathname === location.pathname) a.setAttribute('aria-current', 'page')
    li.append(a)
    return li
  }

  const subs = []
  const close = () => {
    drawer.classList.remove('is-drilled')
    for (const { panel, open } of subs) {
      panel.hidden = true
      open.setAttribute('aria-expanded', 'false')
    }
  }

  for (const node of row.children) {
    if (node.matches('[data-tracy-mega]')) {
      const label = node.querySelector('.tracy-mega__label')?.textContent.trim() || ''
      const links = [...node.querySelectorAll('.tracy-mega__links a')]
      const li = document.createElement('li')
      li.className = 'tracy-drawer__item has-children'
      const name = document.createElement('span')
      name.className = 'tracy-drawer__link'
      name.textContent = label
      const open = document.createElement('button')
      open.type = 'button'
      open.className = 'tracy-drawer__open'
      open.setAttribute('aria-expanded', 'false')
      open.setAttribute('aria-label', label)
      const panel = document.createElement('div')
      panel.className = 'tracy-drawer__sub'
      panel.hidden = true
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'tracy-drawer__back'
      back.textContent = label
      const list = document.createElement('ul')
      list.className = 'tracy-drawer__list'
      for (const a of links) list.append(item(a.getAttribute('href'), a.textContent.trim()))
      panel.append(back, list)
      li.append(name, open)
      root.append(li)
      drawer.append(panel)
      subs.push({ panel, open })
      const drill = () => {
        close()
        drawer.classList.add('is-drilled')
        panel.hidden = false
        open.setAttribute('aria-expanded', 'true')
        back.focus()
      }
      open.addEventListener('click', drill)
      name.addEventListener('click', drill)
      back.addEventListener('click', () => {
        close()
        open.focus()
      })
      continue
    }
    const a = node.querySelector('a')
    if (a) root.append(item(a.getAttribute('href'), a.textContent.trim()))
  }

  content.append(drawer)
  content.classList.add('has-drawer')
  // A fresh open starts at the top level.
  document
    .querySelector('.tracy-header__menu .wp-block-navigation__responsive-container-open')
    ?.addEventListener('click', close)
})()
