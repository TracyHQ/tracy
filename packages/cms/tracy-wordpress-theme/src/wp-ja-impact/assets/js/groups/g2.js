/* g2 — scripts of the ACM `features` styles of JA Impact.
 *  1. Style 3 (the icon-card carousel): the source's Owl Carousel autoplays, one step every four seconds. The
 *     motion library's carousel steps only when asked, so this script asks: it clicks the carousel's own "next"
 *     control. It stops while focus is inside the carousel, while the tab is hidden, while the menu drawer is open and under reduced motion.
 *  2. Style 7 (video + subscribe panel): the play button is a link to the video; with script it opens the video in a
 *     dialog on the page (the source opens a Bootstrap modal with the same YouTube embed, autoplay on).
 */
;(function () {
  'use strict'

  let AUTOPLAY_MS = 4000

  function autoplay(section) {
    let next = section.querySelector('.tracy-motion-next a, .tracy-motion-next button')
    let carousel = section.querySelector('.features-carousel.tracy-motion-carousel-step')
    if (!next || !carousel) {
      return
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    window.setInterval(function () {
      // The step is a click on the carousel's control, which the drawer reads as a click outside and closes on.
      if (
        document.hidden ||
        section.contains(document.activeElement) ||
        document.documentElement.classList.contains('jim-drawer-open')
      ) {
        return
      }
      next.click()
    }, AUTOPLAY_MS)
  }

  function videoId(href) {
    try {
      let url = new URL(href, window.location.href)
      if (url.hostname === 'youtu.be') {
        return url.pathname.slice(1)
      }
      return url.searchParams.get('v') || (url.pathname.indexOf('/embed/') === 0 ? url.pathname.slice(7) : '')
    } catch {
      return ''
    }
  }

  let dialog = null

  function build() {
    let el = document.createElement('dialog')
    el.className = 'jim-video-dialog'
    el.innerHTML =
      '<button type="button" class="jim-video-dialog__close" aria-label="Close">&times;</button>' +
      '<div class="jim-video-dialog__frame"><iframe allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe></div>'
    el.querySelector('button').addEventListener('click', function () {
      el.close()
    })
    // The source's modal is static: a click on its backdrop does not close it. Escape and the close button do.
    el.addEventListener('close', function () {
      el.querySelector('iframe').removeAttribute('src')
    })
    document.body.appendChild(el)
    return el
  }

  function open(id) {
    if (!dialog) {
      dialog = build()
    }
    dialog.querySelector('iframe').src =
      'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?autoplay=1&modestbranding=1&showinfo=0'
    dialog.showModal()
  }

  document.addEventListener('click', function (event) {
    let link =
      event.target instanceof Element ? event.target.closest('.acm-features.style-7 .video-btn a') : null
    if (!link || typeof HTMLDialogElement === 'undefined') {
      return
    }
    let id = videoId(link.getAttribute('href') || '')
    if (!id) {
      return
    }
    event.preventDefault()
    open(id)
  })

  function init() {
    document.querySelectorAll('.acm-features.style-3').forEach(autoplay)
  }

  // The motion library marks a carousel it has taken over; wait for the page to settle before asking it to step.
  if (document.readyState === 'complete') {
    window.setTimeout(init, 0)
  } else {
    window.addEventListener('load', function () {
      window.setTimeout(init, 0)
    })
  }
})()
