export {}
// The behaviours of the page that need a script: carousels (scroll-snap tracks with dots and arrows), the hero's dots and the video dialog.
// Everything works without it: the tracks scroll by touch and keyboard, the dialog is a link-less button that does nothing until the script runs.
for (const root of document.querySelectorAll<HTMLElement>('[data-carousel]')) {
  const track = root.querySelector<HTMLElement>('[data-track]')
  if (!track) continue
  const slides = [...track.querySelectorAll<HTMLElement>('[data-slide]')]
  const dotsBox = root.querySelector<HTMLElement>('.im-dots')
  const perView = () => Math.max(1, Math.round(track.clientWidth / (slides[0]?.getBoundingClientRect().width || track.clientWidth)))
  const pages = () => Math.max(1, slides.length - perView() + 1)
  const go = (i: number) => {
    const target = slides[Math.min(Math.max(i, 0), slides.length - 1)]
    if (target) track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' })
  }
  const index = () => {
    const x = track.scrollLeft
    let best = 0
    slides.forEach((s, i) => { if (Math.abs(s.offsetLeft - track.offsetLeft - x) < Math.abs(slides[best].offsetLeft - track.offsetLeft - x)) best = i })
    return best
  }
  const paint = () => {
    const at = index()
    dotsBox?.querySelectorAll<HTMLElement>('.im-dot').forEach((d, i) => {
      d.classList.toggle('is-active', i === at)
      if (i === at) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current')
    })
    slides.forEach((s, i) => { if (root.classList.contains('im-hero')) s.setAttribute('aria-hidden', i === at ? 'false' : 'true') })
  }
  if (dotsBox && !dotsBox.children.length) {
    for (let i = 0; i < pages(); i++) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'im-dot'
      b.setAttribute('aria-label', `${dotsBox.getAttribute('aria-label') ?? ''} ${i + 1}`.trim())
      dotsBox.append(b)
    }
  }
  dotsBox?.querySelectorAll<HTMLElement>('.im-dot').forEach((d, i) => d.addEventListener('click', () => go(i)))
  root.querySelector('[data-prev]')?.addEventListener('click', () => go(index() - 1))
  root.querySelector('[data-next]')?.addEventListener('click', () => go(index() + 1))
  track.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true })
  paint()
}
const dialog = document.querySelector<HTMLDialogElement>('[data-video-dialog]')
const frame = dialog?.querySelector<HTMLElement>('[data-video-frame]')
document.querySelectorAll<HTMLElement>('[data-video]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!dialog || !frame || !dialog.showModal) return
    const f = document.createElement('iframe')
    f.src = b.dataset.video ?? ''
    f.allow = 'autoplay; encrypted-media; picture-in-picture'
    f.allowFullscreen = true
    f.title = b.getAttribute('aria-label') ?? ''
    frame.replaceChildren(f)
    dialog.showModal()
  })
)
const clearVideo = () => frame?.replaceChildren()
dialog?.querySelector('[data-video-close]')?.addEventListener('click', () => dialog.close())
dialog?.addEventListener('close', clearVideo)
dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close() })
