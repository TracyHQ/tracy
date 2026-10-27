/* wp-ja-kinetic: the back-to-top button.
 *
 * The source toggles a `.top-away` class on <body> and shows `#back-to-top` under that hook
 * (css/template.css:11440-11449, 17606-17629); this file is the WordPress-side equivalent,
 * `.tracy-top-away` (assets/css/wp-ja-kinetic.css). The rule is the source's own, not a fixed
 * scroll offset (plugins/system/t4/themes/base/js/base.js:6-52): an IntersectionObserver watches
 * the page's layout sections from the top, stopping at the first one that does not sit within the
 * first screen (starts below the fold, or ends more than 200px past it); every change sets the class
 * from that one section — fully scrolled past = away, else not — so the last change reported wins.
 * The site's blocks stand in for the source's sections, as its layouts group them (measured on all
 * 30 step-8 pages): the header; on the three home pages (Terminal `item-214`, and the Blueprint and
 * Signal pages pinned to their direction, D-14) one section per module; on the contact page its
 * page-top / main-body / page-bottom blocks; on the account and search pages the source's masthead
 * slot, which is `display:none` there (so it reports once, at load, and never again), before the main
 * body; elsewhere the main body as one section (the page's masthead is part of it: measured on Features, Pricing, About and
 * the other marketing pages, where the source lists only its header, main body and footer); then the footer, which is a section on the source too. */
;(() => {
  const button = document.getElementById('back-to-top')
  if (!button || !('IntersectionObserver' in window)) return

  const root = document.querySelector('.wp-site-blocks') ?? document.body
  const header = root.querySelector(':scope > header')
  const home =
    document.body.classList.contains('item-214') ||
    /^(blueprint|signal)$/.test(document.documentElement.dataset.style ?? '')
  const blocks = []
  for (const el of Array.from(root.children)) {
    if (el === header) continue
    const content = el.tagName === 'MAIN' ? el.querySelector(':scope > .entry-content') : null
    if (el.tagName === 'DIV' && !el.className) {
      const slot = document.createElement('div')
      slot.hidden = true
      el.before(slot)
      blocks.push(slot)
    } else if (content && home) blocks.push(...content.querySelectorAll(':scope > .ja-acm'))
    else if (
      el.classList.contains('tracy-page-stack--contact') &&
      content?.firstElementChild?.classList.contains('acm-page-masthead')
    )
      blocks.push(...content.children)
    else blocks.push(el)
  }
  const sections = []
  for (const el of [header, ...blocks].filter(Boolean)) {
    if (!(el.offsetTop < window.innerHeight && el.offsetTop + el.offsetHeight < window.innerHeight + 200))
      break
    sections.push(el)
  }

  const observer = new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        const box = change.boundingClientRect
        document.body.classList.toggle('tracy-top-away', box.top <= -box.height)
      }
    },
    { root: null, rootMargin: '0px', threshold: 0 }
  )
  for (const el of sections) observer.observe(el)

  // The header's shadow once the page has scrolled 100px past the header's bottom edge (T4 `not-at-top`, base.js).
  const notAtTop = () => {
    const bottom = header ? header.offsetHeight : 0
    document.body.classList.toggle('tracy-not-at-top', window.scrollY - bottom >= 100)
  }
  window.addEventListener('scroll', notAtTop, { passive: true })
  notAtTop()

  button.addEventListener('click', (event) => {
    event.preventDefault()
    // Smooth only when it can run and is wanted: a hidden page never animates it (the scroll then
    // never happened), and a visitor who asked for reduced motion gets the jump.
    const smooth = !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' })
  })
})()
