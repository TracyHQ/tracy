// Newsletter boxes submit to the Forms plugin in place (shared by the News sidebar, Investors and
// the kit Newsletter page). The reply's `message` is the confirmation text the editor set.
for (const form of document.querySelectorAll<HTMLFormElement>('form.ng-newsletter')) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const status = form.querySelector('.ng-newsletter-status')
    const data: Record<string, string> = {}
    for (const [k, v] of new FormData(form).entries()) if (k !== 'formId') data[k] = String(v)
    if (status) status.textContent = '…'
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ formId: form.dataset.formId, data })
      })
      const json = await res.json().catch(() => ({}))
      const payload = json.data ?? json
      if (status)
        status.textContent = payload.message ?? payload.error?.message ?? (res.ok ? 'OK' : String(res.status))
      if (res.ok && payload.success !== false) form.reset()
    } catch (e) {
      if (status) status.textContent = String(e)
    }
  })
}
