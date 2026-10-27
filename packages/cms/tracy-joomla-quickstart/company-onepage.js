/** Section navigation is local to the native Onepage and does not use T4's megamenu handler. */
for (const link of document.querySelectorAll('.tracy-native-landing a[href^="#"]')) {
  link.addEventListener('click', (event) => {
    const target = document.getElementById(link.hash.slice(1))
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    history.replaceState(null, '', link.hash)
    target.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start'
    })
  })
}

// Joomla's flat section menu stays on this page, so close the shared drawer explicitly.
if (document.getElementById('introduction')) {
  for (const link of document.querySelectorAll('.t4-offcanvas a[href*="#"]')) {
    link.addEventListener('click', () => {
      const target = new URL(link.href, location.href)
      if (target.origin === location.origin && target.pathname === location.pathname) {
        link.closest('.t4-offcanvas')?.querySelector('.js-offcanvas-close')?.click()
      }
    })
  }
}
