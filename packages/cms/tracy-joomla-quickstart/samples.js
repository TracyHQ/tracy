/**
 * The URL hash is the sample selection; every document is bundled with the quickstart.
 *
 * The list is read from the markup the ACM module renders, not from `manifest.json`: the titles and
 * blurbs are admin fields now, and a fetch would quietly overwrite what the owner typed with what
 * the last build wrote.
 */
const collection = document.querySelector('.tracy-marketing')
if (collection) {
  const base = collection.dataset.sampleBase
  const frame = collection.querySelector('iframe')
  const theme = collection.querySelector('[data-sample-theme]')
  const links = [...collection.querySelectorAll('[data-sample]')]
  const description = collection.querySelector('[data-sample-description]:not([data-sample])')
  const samples = links.map((link) => ({
    kind: link.dataset.sample,
    title: link.textContent.trim(),
    description: link.dataset.sampleDescription ?? ''
  }))
  if (!samples.length) throw new Error('The sample collection is empty.')
  const render = () => {
    const sample = samples.find((entry) => entry.kind === location.hash.slice(1)) ?? samples[0]
    for (const link of links) {
      if (link.dataset.sample === sample.kind) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    }
    const url = `${base}${sample.kind}-${theme.value}.html`
    frame.src = url
    frame.title = sample.title
    description.textContent = sample.description
    collection.querySelector('[data-sample-open]').href = url
    collection.querySelector('[data-sample-download]').href = url
  }
  window.addEventListener('hashchange', render)
  for (const link of links)
    link.addEventListener('click', (event) => {
      // T4 intercepts hash links for smooth scrolling; these hashes select documents instead.
      event.preventDefault()
      event.stopPropagation()
      history.replaceState(null, '', link.hash)
      render()
    })
  theme.addEventListener('change', render)
  render()
}
