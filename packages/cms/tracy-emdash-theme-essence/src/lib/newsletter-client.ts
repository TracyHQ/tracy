// The newsletter box submits to the Forms plugin in place. The reply's `message` is the confirmation
// text the editor set on the form. Selectors are this template's own (`.es-newsletter`, Diner D-22:
// a copied script with another template's class names does nothing, silently).
for (const form of document.querySelectorAll<HTMLFormElement>('form.es-newsletter-form')) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const status = form.closest('.es-newsletter')?.querySelector<HTMLElement>('.es-newsletter-status') ?? null
    const show = (text: string, kind: 'ok' | 'error' | '') => {
      if (!status) return
      status.textContent = text
      status.dataset.state = kind
    }
    // the browser's own validation messages, in the visitor's language
    if (!form.checkValidity()) {
      const bad = form.querySelector<HTMLInputElement>(':invalid')
      show(bad?.validationMessage ?? '', 'error')
      bad?.focus()
      return
    }
    const data: Record<string, string> = {}
    for (const [k, v] of new FormData(form).entries()) if (k !== 'formId') data[k] = String(v)
    show('', '')
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (button) button.disabled = true
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ formId: form.dataset.formId, data })
      })
      const json = await res.json().catch(() => ({}))
      const payload = json.data ?? json
      const ok = res.ok && payload.success !== false
      show(payload.message ?? payload.errors?.[0]?.message ?? payload.error?.message ?? (ok ? '' : String(res.status)), ok ? 'ok' : 'error')
      if (ok) form.reset()
    } catch (e) {
      show(String(e), 'error')
    } finally {
      if (button) button.disabled = false
    }
  })
}
