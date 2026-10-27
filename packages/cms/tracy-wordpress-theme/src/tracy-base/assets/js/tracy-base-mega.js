/* tracy-base: mega menu behaviour. One block (`[data-tracy-mega]`) is a trigger button and a
 * panel; the panel is painted while the block carries `is-open`, and nothing else opens it — no
 * :hover rule — so this file is the whole contract:
 *
 *   open   — pointer over the block after a short intent delay; keyboard focus on the trigger;
 *            a click on the trigger (touch, and the fallback for everything else)
 *   close  — pointer leaving the block, after a grace delay long enough to cross the header's
 *            bottom border into the panel; Escape (focus goes back to the trigger); a click or
 *            touch outside; focus leaving the block; another block opening
 *
 * The panel is a descendant of the block in the DOM even though it is positioned against the
 * header, so pointerenter/pointerleave treat trigger and panel as one region. */
;(() => {
  const OPEN_DELAY = 60
  const CLOSE_DELAY = 220
  const megas = [...document.querySelectorAll('[data-tracy-mega]')]
  if (megas.length === 0) return
  const hoverable = !window.matchMedia || window.matchMedia('(hover: hover)').matches

  const triggerOf = (mega) => mega.querySelector(':scope > .tracy-mega__trigger')
  const isOpen = (mega) => mega.classList.contains('is-open')

  const setOpen = (mega, open) => {
    if (open) for (const other of megas) if (other !== mega) setOpen(other, false)
    mega.classList.toggle('is-open', open)
    const trigger = triggerOf(mega)
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  for (const mega of megas) {
    let timer = null
    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
    const later = (open, delay) => {
      clear()
      timer = setTimeout(() => {
        timer = null
        setOpen(mega, open)
      }, delay)
    }
    const trigger = triggerOf(mega)

    mega.addEventListener('pointerenter', (event) => {
      if (!hoverable || event.pointerType === 'touch') return
      later(true, OPEN_DELAY)
    })
    mega.addEventListener('pointerleave', (event) => {
      if (!hoverable || event.pointerType === 'touch') return
      later(false, CLOSE_DELAY)
    })
    if (trigger) {
      trigger.addEventListener('click', () => {
        clear()
        setOpen(mega, !isOpen(mega))
      })
    }
    // Keyboard focus opens; a mouse click also focuses the button, but that click toggles on its
    // own, so only a focus the browser marks as visible (keyboard) counts here.
    mega.addEventListener('focusin', (event) => {
      if (event.target === trigger && !trigger.matches(':focus-visible')) return
      clear()
      setOpen(mega, true)
    })
    mega.addEventListener('focusout', (event) => {
      if (event.relatedTarget && mega.contains(event.relatedTarget)) return
      clear()
      setOpen(mega, false)
    })
    mega.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !isOpen(mega)) return
      event.preventDefault()
      clear()
      setOpen(mega, false)
      if (trigger) trigger.focus()
    })
  }

  document.addEventListener('pointerdown', (event) => {
    for (const mega of megas) if (isOpen(mega) && !mega.contains(event.target)) setOpen(mega, false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    for (const mega of megas) if (isOpen(mega)) setOpen(mega, false)
  })
})()
