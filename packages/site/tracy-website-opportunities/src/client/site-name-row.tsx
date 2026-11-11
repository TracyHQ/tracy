/**
 * Site name on Tracy (#519), the first row of the Business brief table: the address the demo is built under
 * (`<label>.<domain>`, parts named by the server), where the name came from, and Edit. Editing checks as the seller
 * types (`site-label-model.ts`): characters and length at once, then whether the name is free through the check door.
 * Saved on the opportunity, a build sent without a label uses it.
 */
import { type JSX, useEffect, useId, useState } from 'react'
import { Button, Input, Spinner } from '@tracy/ui'

import type { Api, SiteLabelInfo } from './api.ts'
import { type SiteLabelCheck, siteAddress, siteLabelVerdict } from './site-label-model.ts'
import type { Translate } from './strings.ts'

/** How long typing pauses before the name is checked. */
const CHECK_AFTER_MS = 300

export function SiteNameRow({
  t,
  api,
  opportunityId,
  readOnly = false,
  layout = 'row'
}: {
  t: Translate
  api: Api
  opportunityId: string
  /** The compact brief of Details: the name shows, its Edit lives on the brief sub-page (#537). */
  readOnly?: boolean
  /** `row`: a row of the Business brief table; `item`: an item of the brief checklist (`brief-checklist.tsx`). */
  layout?: 'row' | 'item'
}): JSX.Element {
  const [info, setInfo] = useState<SiteLabelInfo | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [check, setCheck] = useState<SiteLabelCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  /** The read door answered with an error: say so instead of waiting on a name that will not come. */
  const [loadFailed, setLoadFailed] = useState(false)
  const inputId = useId()
  useEffect(() => {
    let live = true
    void api.siteLabel(opportunityId).then((answer) => {
      if (!live) return
      if (answer.ok) setInfo(answer.body)
      else setLoadFailed(true)
    })
    return () => {
      live = false
    }
  }, [api, opportunityId])

  const shown = info?.label ?? info?.suggested ?? null
  const rules = { min: info?.min ?? 1, max: info?.max ?? 63 }
  const verdict = siteLabelVerdict(draft, info?.label ?? '', rules, check)
  const typed = draft.trim()
  useEffect(() => {
    if (!editing || verdict.state !== 'checking') return
    let live = true
    const timer = setTimeout(() => {
      void api.checkSiteLabel(opportunityId, typed).then((answer) => {
        if (live && answer.ok) setCheck(answer.body)
      })
    }, CHECK_AFTER_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [api, opportunityId, editing, typed, verdict.state])

  const save = async (): Promise<void> => {
    if (busy || verdict.state !== 'free') return
    setBusy(true)
    setFailed(false)
    const answer = await api.saveSiteLabel(opportunityId, typed)
    setBusy(false)
    if (!answer.ok) {
      // Taken between the check and the save: say so on the field.
      if (answer.code === 'LABEL_TAKEN') setCheck({ label: typed, available: false, reason: 'taken' })
      else setFailed(true)
      return
    }
    setInfo((now) => (now === null ? now : { ...now, label: answer.body.label }))
    setEditing(false)
  }
  const open = (): void => {
    setDraft(shown ?? '')
    setCheck(null)
    setFailed(false)
    setEditing(true)
  }

  const value = (
    <>
      {editing && info !== null ? (
        <span className="tracy-wo-stack">
          <span className="tracy-wo-row tracy-wo-wrap">
            <Input
              id={inputId}
              aria-label={t('site.name.input')}
              aria-invalid={verdict.state === 'invalid' ? true : undefined}
              value={draft}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save()
                if (event.key === 'Escape') setEditing(false)
              }}
            />
            <span className="tracy-wo-muted tracy-wo-small">.{info.domain}</span>
          </span>
          <span
            className={
              verdict.state === 'invalid' ? 'tracy-wo-error tracy-wo-small' : 'tracy-wo-muted tracy-wo-small'
            }
            role="status"
          >
            {verdict.key !== null
              ? t(verdict.key)
              : verdict.state === 'checking' && typed !== ''
                ? t('site.name.checking')
                : verdict.state === 'free'
                  ? t('site.name.free')
                  : t('site.name.limits', rules)}
          </span>
          <span className="tracy-wo-row">
            <Button
              type="button"
              size="sm"
              disabled={busy || verdict.state !== 'free'}
              onClick={() => void save()}
            >
              {busy ? <Spinner label={t('site.name.save')} /> : null}
              {t('site.name.save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              {t('site.name.cancel')}
            </Button>
          </span>
          {failed ? (
            <span className="tracy-wo-error tracy-wo-small" role="alert">
              {t('site.name.failed')}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="tracy-wo-row tracy-wo-wrap">
          {loadFailed ? (
            <span className="tracy-wo-muted">{t('site.name.loadFailed')}</span>
          ) : (
            <span>{shown !== null && info !== null ? siteAddress(shown, info) : '…'}</span>
          )}
          {info !== null && !readOnly ? (
            <Button type="button" size="sm" variant="link" className="tracy-wo-site-name-edit" onClick={open}>
              {t('site.name.edit')}
            </Button>
          ) : null}
        </span>
      )}
      <span className="tracy-wo-brief-note">{t('site.name.hint')}</span>
    </>
  )
  const source = info === null ? null : info.label ? t('brief.source.you') : t('site.name.suggested')
  if (layout === 'item')
    return (
      <div className="tracy-wo-brief-it tracy-wo-site-name">
        <span className="tracy-wo-brief-it-lab">{t('site.name.label')}</span>
        <div className="tracy-wo-brief-it-v">{value}</div>
        <span>{source === null ? null : <span className="tracy-wo-brief-src">{source}</span>}</span>
        <span />
        <span />
      </div>
    )
  return (
    <tr className="tracy-wo-site-name">
      <th scope="row">{t('site.name.label')}</th>
      <td>{value}</td>
      <td className="tracy-wo-muted">{source}</td>
      <td />
    </tr>
  )
}
