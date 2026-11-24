// The newsletter box submits to the Forms plugin in place; the reply's `message` is the confirmation text the editor set.
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-newsletter]')) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const status = form.querySelector<HTMLElement>('[data-status]')
    const data: Record<string, string> = {}
    for (const [k, v] of new FormData(form).entries()) if (k !== 'formId') data[k] = String(v)
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ formId: form.dataset.formId, data })
      })
      const json = await res.json().catch(() => ({}))
      const payload = json.data ?? json
      if (status) {
        const said = payload.message ?? payload.error?.message
        if (said) status.textContent = said
        status.hidden = false
      }
      if (res.ok && payload.success !== false) form.reset()
    } catch {
      if (status) status.hidden = false
    }
  })
}
