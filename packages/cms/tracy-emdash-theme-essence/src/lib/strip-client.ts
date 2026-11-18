// Dots for a scroll-snap strip (`data-es-strip` root, `data-es-track` row, `data-es-dots` dot box): one dot per screenful,
// built from the measured widths so they follow the breakpoint. Imported by every component that draws a strip.
document.querySelectorAll<HTMLElement>('[data-es-strip]').forEach((root) => {
	const track = root.querySelector<HTMLElement>('[data-es-track]')
	const dots = root.querySelector<HTMLElement>('[data-es-dots]')
	if (!track || !dots) return
	const items = Array.from(track.children) as HTMLElement[]
	const template = root.dataset.label || '{page}'
	let buttons: HTMLButtonElement[] = []
	let step = 1
	const build = () => {
		const gap = parseFloat(getComputedStyle(track).columnGap) || 0
		const itemW = items[0].offsetWidth + gap
		step = Math.max(1, Math.round((track.clientWidth + gap) / itemW))
		const pages = Math.ceil(items.length / step)
		dots.hidden = pages < 2
		dots.textContent = ''
		buttons = Array.from({ length: pages }, (_, i) => {
			const b = document.createElement('button')
			b.type = 'button'
			b.className = 'es-dot'
			b.setAttribute('aria-label', template.replace('{page}', String(i + 1)).replace('{pages}', String(pages)))
			b.addEventListener('click', () => track.scrollTo({ left: items[Math.min(i * step, items.length - 1)].offsetLeft - items[0].offsetLeft, behavior: 'smooth' }))
			dots.appendChild(b)
			return b
		})
		buttons[0]?.classList.add('is-active')
		mark()
	}
	const mark = () => {
		const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2
		const gap = parseFloat(getComputedStyle(track).columnGap) || 0
		const page = atEnd ? buttons.length - 1 : Math.min(buttons.length - 1, Math.round(track.scrollLeft / ((items[0].offsetWidth + gap) * step)))
		buttons.forEach((b, i) => b.classList.toggle('is-active', i === page))
	}
	track.addEventListener('scroll', mark, { passive: true })
	new ResizeObserver(build).observe(track)
	build()
})
