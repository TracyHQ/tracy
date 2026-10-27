import { Button, Card, Input, Label } from '@tracy/ui'
import { useState } from 'react'
import type { CampaignView, RealAudience, RealWrite } from './real-api'
import { useT } from '../i18n'

const AUDIENCES: { value: RealAudience; label: string; hint: string }[] = [
  {
    value: 'active_plan',
    label: 'invitations-real.settings.audience.active',
    hint: 'invitations-real.settings.audience.activeHint'
  },
  {
    value: 'past_customers',
    label: 'invitations-real.settings.audience.past',
    hint: 'invitations-real.settings.audience.pastHint'
  }
]

/** Who the campaign sends to, and the names of its groups. */
export function RealCampaignSettingsPanel({
  campaign,
  groups,
  busy,
  write,
  onSaved,
  onDirty
}: {
  campaign: CampaignView
  groups: { key: string; label: string }[]
  busy: boolean
  write: RealWrite
  onSaved: (next: CampaignView) => void
  onDirty: (v: boolean) => void
}) {
  const t = useT()
  const saved = campaign.audience ?? 'active_plan'
  const [audience, setAudience] = useState<RealAudience>(saved)
  const [labels, setLabels] = useState<Record<string, string>>(
    Object.fromEntries(groups.map((g) => [g.key, g.label]))
  )
  const renamed = groups.filter((g) => (labels[g.key] ?? '').trim() !== g.label)
  const valid = groups.every((g) => (labels[g.key] ?? '').trim())
  const changed = audience !== saved || renamed.length > 0
  function dirty(nextAudience: RealAudience, nextLabels: Record<string, string>) {
    onDirty(nextAudience !== saved || groups.some((g) => (nextLabels[g.key] ?? '').trim() !== g.label))
  }
  return (
    <Card className="gap-3 p-4" data-campaign-settings>
      <h2 className="font-semibold">{t('invitations-real.settings.title')}</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium text-sm">{t('invitations-real.settings.sendTo')}</legend>
        {AUDIENCES.map((a) => (
          <label key={a.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="audience"
              value={a.value}
              checked={audience === a.value}
              disabled={busy}
              onChange={() => {
                setAudience(a.value)
                dirty(a.value, labels)
              }}
            />
            <span>
              <b>{t(a.label)}</b>. {t(a.hint)}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{t('invitations-real.settings.groupNames')}</p>
        {groups.map((g) => (
          <Label key={g.key}>
            {t('invitations-real.settings.group', { n: g.key.replace('group_', '') })}
            <Input
              aria-label={t('invitations-real.settings.groupNameAria', { key: g.key })}
              maxLength={120}
              disabled={busy}
              value={labels[g.key] ?? ''}
              onChange={(e) => {
                const next = { ...labels, [g.key]: e.target.value }
                setLabels(next)
                dirty(audience, next)
              }}
            />
          </Label>
        ))}
        <p className="text-xs">{t('invitations-real.settings.renameHint')}</p>
      </div>
      <Button
        disabled={busy || !changed || !valid}
        onClick={() =>
          void write('/settings', {
            audience,
            groupLabels: Object.fromEntries(renamed.map((g) => [g.key, labels[g.key].trim()]))
          })
            .then((next) => {
              onDirty(false)
              onSaved(next as unknown as CampaignView)
            })
            .catch(() => {})
        }
      >
        {t('invitations-real.settings.save')}
      </Button>
    </Card>
  )
}
