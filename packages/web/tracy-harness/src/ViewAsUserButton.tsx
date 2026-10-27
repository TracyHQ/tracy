/**
 * The icon beside a customer's email in /ops: one press opens a look at their Tracy in a new tab.
 * Shown only to an owner or admin (`/api/ops/me` → `writable`, the door's own verdict). No dialog, no
 * reason: the people who can press it are trained staff, and the audit row names who looked at whom
 * and when (`apps/tracy-web/src/ops/view-as.js`).
 */
import { Button } from '@tracy/ui'
import { Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchWritable } from './mail-api'
import { useT } from './i18n'
import { startViewAs, viewAsErrorKey } from './view-as-user-api'

// One answer for the whole page: dozens of emails, one question.
let writableOnce: Promise<boolean | null> | null = null
const mayView = () => {
  writableOnce ??= fetchWritable()
  return writableOnce
}

export function ViewAsUserButton({ email }: { email: string | null | undefined }) {
  const t = useT()
  const [allowed, setAllowed] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    mayView().then((ok) => live && setAllowed(ok === true))
    return () => {
      live = false
    }
  }, [])

  if (!allowed || !email) return null

  const go = async () => {
    // Opened now, filled later: a tab opened after an await is taken for a pop-up and blocked.
    const tab = window.open('about:blank', '_blank')
    setBusy(true)
    setErrorKey(null)
    const answer = await startViewAs(email)
    setBusy(false)
    if (answer.ok) {
      if (tab) tab.location.href = answer.url
      return
    }
    tab?.close()
    setErrorKey(viewAsErrorKey(answer.code))
  }

  return (
    <>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={t('team.viewAs.label', { email })}
        title={t('team.viewAs.title')}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          void go()
        }}
      >
        <Eye />
      </Button>
      {errorKey ? (
        <span className="text-destructive text-xs" role="alert">
          {t(errorKey)}
        </span>
      ) : null}
    </>
  )
}
