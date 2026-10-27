/** Enhance dsh's existing job trigger without replacing its roster, menu or event handlers. */
const JOB_TRIGGER =
  '[data-slot="conversation.session.header.actions"] [class*="_root"] > button[aria-expanded][aria-label]:has(> [class*="_count"])'

/** Keep the localized full label for assistive technology and expose only its count to CSS. */
export function installHeaderJobs(): () => void {
  const titles = new WeakMap<HTMLButtonElement, string | null>()
  const enhance = (button: HTMLButtonElement): void => {
    const label = button.getAttribute('aria-label') ?? ''
    const count = label.match(/\p{Decimal_Number}+/u)?.[0]
    if (!count) return
    if (!titles.has(button)) titles.set(button, button.getAttribute('title'))
    button.dataset.tracyJobCount = count
    button.title = label
  }
  const scan = (root: ParentNode): void => {
    if (root instanceof window.HTMLButtonElement && root.matches(JOB_TRIGGER)) enhance(root)
    root.querySelectorAll<HTMLButtonElement>(JOB_TRIGGER).forEach(enhance)
  }
  scan(document)
  const observer = new window.MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const button = record.target
        if (button instanceof window.HTMLButtonElement && button.matches(JOB_TRIGGER)) enhance(button)
      } else {
        for (const node of record.addedNodes) {
          if (node instanceof window.Element) scan(node)
        }
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label']
  })
  return () => {
    observer.disconnect()
    document.querySelectorAll<HTMLButtonElement>(JOB_TRIGGER).forEach((button) => {
      if (!titles.has(button)) return
      const title = titles.get(button)
      if (title === null || title === undefined) button.removeAttribute('title')
      else button.title = title
      delete button.dataset.tracyJobCount
    })
  }
}
