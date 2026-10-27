import { useState, type SyntheticEvent } from 'react'
import type { IslandMarks } from '@/lib/stamps'

export interface NewsletterProps {
  /** Accessible name of the email field (the band's title). */
  label: string
  placeholder: string
  buttonLabel: string
  /** EmDash Forms form id; empty means the form is not wired yet and submitting does nothing. */
  formId: string
  /** Provenance stamps of the placeholder and button label (`src/lib/stamps.ts`); absent on an ordinary request. */
  marks?: IslandMarks<'input' | 'button'>
}

type Status = { kind: 'idle' | 'sending' } | { kind: 'done' | 'error'; message: string }

const SUBMIT_URL = '/_emdash/api/plugins/emdash-forms/submit'

/** Footer newsletter form, posted to the EmDash Forms plugin; shows the form's own confirmation. */
export default function Newsletter({ label, placeholder, buttonLabel, formId, marks }: NewsletterProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!formId || status.kind === 'sending') return
    setStatus({ kind: 'sending' })
    try {
      const res = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formId, data: { email } })
      })
      const body = await res.json().catch(() => ({}))
      // Plugin routes wrap their result in `data`; errors come back as `error.message` or `errors[]`.
      const result = body && typeof body.data === 'object' && body.data ? body.data : body
      if (res.ok && result?.success !== false) {
        setStatus({ kind: 'done', message: String(result?.message ?? '') })
        setEmail('')
      } else {
        const message = result?.errors?.[0]?.message ?? body?.error?.message ?? res.statusText
        setStatus({ kind: 'error', message: String(message ?? '') })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : '' })
    }
  }

  const message = status.kind === 'done' || status.kind === 'error' ? status.message : ''

  return (
    <div className="k-news-form-wrap">
      <form className="k-news-form" onSubmit={onSubmit} data-form-id={formId || undefined}>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="k-news-input"
          placeholder={placeholder || undefined}
          aria-label={label || placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...marks?.input}
        />
        {buttonLabel && (
          <button
            type="submit"
            className="k-btn k-btn-primary k-news-button"
            disabled={status.kind === 'sending'}
            {...marks?.button}
          >
            {buttonLabel}
          </button>
        )}
      </form>
      <p
        className={`k-news-status ${status.kind === 'error' ? 'is-error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  )
}
