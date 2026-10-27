/**
 * Settings › Website Opportunities: the account's Default CMS, read from and saved to tracy-web so the
 * web and the desktop app agree. A CMS the server cannot build yet is shown disabled with its reason.
 *
 * Settings itself hides the section when the switch is off (section id = switch id, `keepShown`).
 */
import { type JSX, useEffect, useId, useState } from 'react'
import { NativeSelect, NativeSelectOption } from '@tracy/ui'

import type { Api } from './api.ts'
import { CMS_LABEL } from './cms-label.ts'
import { type SettingsView, settingsView } from './gate.ts'
import type { Translate } from './strings.ts'

export const SECTION_ID = 'website-opportunities'

export function SettingsSection({ t, api }: { t: Translate; api: Api }): JSX.Element {
  const selectId = useId()
  const descId = useId()
  const [view, setView] = useState<SettingsView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    let live = true
    void api.settings().then((answer) => {
      if (!live) return
      const next = answer.ok ? settingsView(answer.body) : null
      if (next === null) setLoadFailed(true)
      else setView(next)
    })
    return () => {
      live = false
    }
  }, [api])

  const choose = async (cms: string): Promise<void> => {
    const picked = view?.options.find((o) => o.cms === cms)
    if (view === null || picked === undefined || !picked.available || picked.cms === view.cms) return
    const before = view
    setView({ ...view, cms: picked.cms, fromDefault: false })
    setSaved('saving')
    const answer = await api.saveSettings(cms)
    const next = answer.ok ? settingsView(answer.body) : null
    if (next === null) {
      setView(before)
      setSaved('failed')
      return
    }
    setView(next)
    setSaved('saved')
  }

  if (loadFailed) return <p className="ts-row-desc">{t('settings.loadFailed')}</p>
  if (view === null) return <div className="tracy-wo-empty" aria-busy="true" />
  const unavailable = view.options.filter((o) => !o.available)
  return (
    <div className="tracy-wo tracy-wo-settings">
      <div className="ts-row">
        <span className="ts-row-text">
          <label className="ts-row-title" htmlFor={selectId}>
            {t('settings.cms.title')}
          </label>
          <span className="ts-row-desc" id={descId}>
            {t('settings.cms.desc')}
          </span>
          {view.fromDefault ? <span className="ts-row-desc">{t('settings.cms.default')}</span> : null}
        </span>
        <NativeSelect
          id={selectId}
          size="sm"
          value={view.cms}
          aria-describedby={descId}
          disabled={saved === 'saving'}
          onChange={(event) => void choose(event.target.value)}
        >
          {view.options.map((o) => (
            <NativeSelectOption key={o.cms} value={o.cms} disabled={!o.available}>
              {CMS_LABEL[o.cms] ?? o.cms}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {unavailable.map((o) => (
        <p key={o.cms} className="ts-row-desc">
          {t('settings.cms.unavailable', {
            cms: CMS_LABEL[o.cms] ?? o.cms,
            reason: t(o.reasonKey ?? 'reason.other')
          })}
        </p>
      ))}
      {saved === 'saved' && (
        <p className="ts-row-desc" role="status">
          {t('settings.saved')}
        </p>
      )}
      {saved === 'failed' && (
        <p className="ts-row-desc tracy-wo-error" role="alert">
          {t('settings.saveFailed')}
        </p>
      )}
    </div>
  )
}
