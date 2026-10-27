import { Button, Card, Input, Label, NativeSelect, NativeSelectOption } from '@tracy/ui'
import { useState } from 'react'
import type { Field, Registry, RealWrite } from './real-api'
import { useT } from '../i18n'
export function RealFieldsPanel({
  registry,
  headers,
  groups,
  busy,
  write,
  onDirty,
  onSaved
}: {
  registry: Registry
  headers: string[]
  groups: { key: string; label: string }[]
  busy: boolean
  write: RealWrite
  onDirty: (v: boolean) => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const [edited, setEdited] = useState(() => structuredClone(registry))
  const [key, setKey] = useState(''),
    [label, setLabel] = useState(''),
    [scope, setScope] = useState('campaign')
  const dirty = JSON.stringify(edited) !== JSON.stringify(registry)
  function change(next: Registry) {
    setEdited(next)
    onDirty(JSON.stringify(next) !== JSON.stringify(registry))
  }
  function field(index: number, patch: Partial<Field>) {
    change({ ...edited, fields: edited.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
  }
  function value(k: string, text: string) {
    const values = { ...(scope === 'campaign' ? edited.campaignValues : (edited.groupValues[scope] ?? {})) }
    if (text) values[k] = text
    else delete values[k]
    change(
      scope === 'campaign'
        ? { ...edited, campaignValues: values }
        : { ...edited, groupValues: { ...edited.groupValues, [scope]: values } }
    )
  }
  return (
    <Card className="gap-4 p-4">
      <h2 className="font-semibold">{t('invitations-real.fields.title')}</h2>
      <p className="text-muted-foreground text-sm">{t('invitations-real.fields.intro')}</p>
      <div className="flex flex-wrap gap-3">
        <Label>
          {t('invitations-real.fields.newKey')}
          <Input
            aria-label={t('invitations-real.fields.newKeyAria')}
            autoComplete="off"
            disabled={busy}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </Label>
        <Label>
          {t('invitations-real.fields.label')}
          <Input
            aria-label={t('invitations-real.fields.newLabelAria')}
            autoComplete="off"
            disabled={busy}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Label>
        <Button
          disabled={
            busy ||
            !/^[a-z][a-z0-9_]{0,63}$/.test(key) ||
            !label.trim() ||
            edited.fields.some((f) => f.key === `custom.${key}`)
          }
          onClick={() => {
            change({
              ...edited,
              fields: [
                ...edited.fields,
                { key: `custom.${key}`, label, source: { kind: 'manual' }, missing: 'required' }
              ]
            })
            setKey('')
            setLabel('')
          }}
        >
          {t('invitations-real.fields.add')}
        </Button>
      </div>
      <NativeSelect
        aria-label={t('invitations-real.fields.scopeAria')}
        value={scope}
        disabled={busy}
        onChange={(e) => setScope(e.target.value)}
      >
        <NativeSelectOption value="campaign">
          {t('invitations-real.fields.scope.campaign')}
        </NativeSelectOption>
        {groups.map((g) => (
          <NativeSelectOption key={g.key} value={g.key}>
            {t('invitations-real.fields.scope.group', { group: g.label })}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {edited.fields.map((f, i) => (
        <div key={f.key} className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div>
            <strong>{f.key}</strong>
            <p className="text-muted-foreground text-xs">{'{{' + f.key + '}}'}</p>
          </div>
          <Input
            aria-label={t('invitations-real.fields.labelAria', { key: f.key })}
            autoComplete="off"
            disabled={busy}
            value={f.label}
            onChange={(e) => field(i, { label: e.target.value })}
          />
          <NativeSelect
            aria-label={t('invitations-real.fields.sourceAria', { key: f.key })}
            value={f.source.kind === 'manual' ? '' : f.source.column}
            disabled={busy || f.key === 'group'}
            onChange={(e) =>
              field(i, {
                source: e.target.value ? { kind: 'column', column: e.target.value } : { kind: 'manual' }
              })
            }
          >
            <NativeSelectOption value="">{t('invitations-real.fields.source.manual')}</NativeSelectOption>
            {headers.map((h) => (
              <NativeSelectOption key={h} value={h}>
                {h}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('invitations-real.fields.missingAria', { key: f.key })}
            value={f.missing}
            disabled={busy || ['first_name', 'group'].includes(f.key)}
            onChange={(e) =>
              field(i, {
                missing: e.target.value as Field['missing'],
                ...(e.target.value === 'default' ? { defaultValue: f.defaultValue ?? '' } : {})
              })
            }
          >
            <NativeSelectOption value="required">
              {t('invitations-real.fields.missing.required')}
            </NativeSelectOption>
            <NativeSelectOption value="default">
              {t('invitations-real.fields.missing.default')}
            </NativeSelectOption>
            <NativeSelectOption value="omit">{t('invitations-real.fields.missing.omit')}</NativeSelectOption>
          </NativeSelect>
          {f.missing === 'default' ? (
            <Label>
              {t('invitations-real.fields.defaultLabel')}
              <Input
                aria-label={t('invitations-real.fields.defaultAria', { key: f.key })}
                autoComplete="off"
                disabled={busy || f.key === 'first_name'}
                value={f.defaultValue ?? ''}
                onChange={(e) => field(i, { defaultValue: e.target.value })}
              />
            </Label>
          ) : null}
          {f.source.kind === 'manual' && f.key !== 'group' ? (
            <Label>
              {t('invitations-real.fields.valueLabel')}
              <Input
                aria-label={t('invitations-real.fields.valueAria', { key: f.key })}
                autoComplete="off"
                disabled={busy}
                value={
                  (scope === 'campaign' ? edited.campaignValues : edited.groupValues[scope])?.[f.key] ?? ''
                }
                onChange={(e) => value(f.key, e.target.value)}
              />
            </Label>
          ) : null}
        </div>
      ))}
      <Button
        disabled={busy || !dirty}
        onClick={() =>
          void write('/fields', { registry: edited }, async () => {
            await onSaved()
            onDirty(false)
          }).catch(() => {})
        }
      >
        {t('invitations-real.fields.save')}
      </Button>
      {dirty ? <p>{t('invitations-real.fields.unsaved')}</p> : null}
    </Card>
  )
}
