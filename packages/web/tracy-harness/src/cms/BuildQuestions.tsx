import { Button, NativeSelect, NativeSelectOption } from '@tracy/ui'
import { useEffect, useState } from 'react'
import { tr, useT } from '../i18n'
import { CMS_LABEL, type Cms } from './App'

/** What `GET /api/ops/build-questions/:cms` answers since the sets moved to Quickstarts (f6ecb7b8e). */
interface Setting {
  platform: string
  source: string
  revision: number
  server: string
  writable: boolean
  options: { id: string; name: string; count: number }[]
  feeds: string[]
}

/**
 * 🔒 NOT SERVED THIS ROUND (D11, Akemi 07/10/2026, #1013): every new site is asked the standard
 * questions of its CMS, so the default chosen here changes nothing a customer sees. The choice is
 * kept and shown, never offered for change, until per-template questions come back.
 */
const SERVED_PER_TEMPLATE = false

/**
 * Which questionnaire a CMS's new sites are asked by DEFAULT — the one live setting this screen
 * still owns.
 *
 * ⚠ NO SET IS EDITED ANYWHERE ANY MORE. The per-release editor and generator (`QuestionSets.tsx`,
 * `/api/ops/quickstart/questions/*`) were removed on 10/10/2026; the sets they stored stay in the
 * database as data. What is left here is the chooser, read-only this round.
 */
export function BuildQuestions({ cms }: { cms: Cms; quickstartsHref?: string }) {
  const t = useT()
  const [setting, setSetting] = useState<Setting | null>(null)
  const [choice, setChoice] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    setSetting(null)
    setMessage('')
    fetch(`/api/ops/build-questions/${cms}`, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
          throw new Error(tr('cms-setup.questions.unavailable'))
        const value: Setting = await res.json()
        if (abort.signal.aborted) return
        setSetting(value)
        setChoice(value.source)
      })
      .catch((error) => {
        if (!abort.signal.aborted) setMessage(error.message)
      })
    return () => abort.abort()
  }, [cms])

  async function saveDefault() {
    if (!setting) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/ops/build-questions/${cms}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: choice, revision: setting.revision })
      })
      if (!res.ok)
        throw new Error(res.status === 409 ? tr('cms-setup.conflict') : tr('cms-setup.questions.saveFailed'))
      setSetting({ ...setting, source: choice, revision: setting.revision + 1 })
      setMessage(tr('cms-setup.questions.saved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr('cms-setup.questions.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{t('cms-setup.questions.title', { cms: CMS_LABEL[cms] })}</h2>
      <p data-not-served className="text-muted-foreground text-sm">
        {t('cms-setup.questions.notServed')}
      </p>
      {setting && (
        <div className="flex items-center gap-3">
          <NativeSelect
            aria-label={t('cms-setup.questions.title', { cms: CMS_LABEL[cms] })}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={!SERVED_PER_TEMPLATE || busy || !setting.writable}
          >
            {setting.options.map((o) => (
              <NativeSelectOption key={o.id} value={o.id}>
                {o.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            onClick={saveDefault}
            disabled={!SERVED_PER_TEMPLATE || busy || !setting.writable || choice === setting.source}
          >
            {busy ? t('cms-setup.saving') : t('cms-setup.saveDefault')}
          </Button>
        </div>
      )}
      <p className="text-muted-foreground text-sm">{t('cms-setup.questions.where')}</p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  )
}
