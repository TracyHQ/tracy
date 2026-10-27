import { Button, NativeSelect, NativeSelectOption } from '@tracy/ui'
import { useEffect, useState } from 'react'
import { tr, useT } from '../i18n'
import { CMS_LABEL, type Cms } from './App'

type Setting = {
  platform: string
  quickstart: string | null
  revision: number
  /** Null for a catalog nothing generates — only Joomla's list of bases can move under a reader. */
  registryRevision: string | null
  server: string
  writable: boolean
  reason?: string
  options: { id: string; name: string; version: string }[]
}

/**
 * This edits the active server, never the git-ref snapshot selected in the catalog.
 *
 * One setting per CMS, because a base means a different thing on each: for Joomla it is the archive
 * every design is built on top of, for EmDash it is the template the site IS. A CMS whose sites do
 * not start from an archive says so instead of offering an empty chooser.
 */
export function BuildBase({ cms }: { cms: Cms }) {
  const t = useT()
  const [setting, setSetting] = useState<Setting | null>(null)
  const [choice, setChoice] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    setSetting(null)
    setMessage('')
    fetch(`/api/ops/build-base/${cms}`, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
          throw new Error(tr('cms-setup.base.unavailable'))
        const value: Setting = await res.json()
        if (!abort.signal.aborted) {
          setSetting(value)
          setChoice(value.quickstart ?? '')
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setMessage(error.message)
      })
    return () => abort.abort()
  }, [cms])
  async function save() {
    if (!setting) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/ops/build-base/${cms}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quickstart: choice,
          revision: setting.revision,
          registryRevision: setting.registryRevision
        })
      })
      if (!res.ok)
        throw new Error(res.status === 409 ? tr('cms-setup.conflict') : tr('cms-setup.base.saveFailed'))
      setSetting({ ...setting, quickstart: choice, revision: setting.revision + 1 })
      setMessage(tr('cms-setup.base.saved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr('cms-setup.base.saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{t('cms-setup.base.title', { cms: CMS_LABEL[cms] })}</h2>
      <p className="text-muted-foreground text-sm">
        {setting ? t('cms-setup.base.introServer', { server: setting.server }) : t('cms-setup.base.intro')}
      </p>
      {setting?.reason ? <p className="text-sm">{setting.reason}</p> : null}
      {setting && setting.options.length > 0 && (
        <div className="flex items-center gap-3">
          <NativeSelect
            aria-label={t('cms-setup.base.title', { cms: CMS_LABEL[cms] })}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={busy || !setting.writable}
          >
            {setting.options.map((o) => (
              <NativeSelectOption key={o.id} value={o.id}>
                {o.name} {o.version}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button onClick={save} disabled={busy || !setting.writable || choice === setting.quickstart}>
            {busy ? t('cms-setup.saving') : t('cms-setup.saveDefault')}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  )
}
