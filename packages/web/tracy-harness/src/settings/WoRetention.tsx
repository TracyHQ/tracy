/**
 * `/ops/settings/wo` — Website Opportunity: when unused demo sites freeze and are deleted.
 *
 * The first Settings panel that writes. It reads its own door (`/api/ops/wo/demos/summary`) rather
 * than the General document, and saves only the demo retention keys through `/api/ops/wo/settings`.
 */
import {
  Button,
  Card,
  Field,
  FieldContent,
  FieldLabel,
  Input,
  Separator,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow
} from '@tracy/ui'
import { useEffect, useState } from 'react'

import { useT } from '../i18n'
import {
  type DemoRetention,
  type DemoSummary,
  PUBLIC_FIND_FIELDS,
  type PublicFindLimits,
  RETENTION_FIELDS,
  fetchDemoSummary,
  fieldLabelKey,
  publicFindInputError,
  publicFindLine,
  retentionInputError,
  retentionMilestones,
  saveDemoRetention,
  savePublicFindLimits
} from './wo-retention'

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border px-4 py-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-0.5 font-semibold text-xl tabular-nums">{value}</div>
    </div>
  )
}

export function WoRetentionPanel() {
  const t = useT()
  const [summary, setSummary] = useState<DemoSummary | null>(null)
  const [draft, setDraft] = useState<DemoRetention | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async (signal?: AbortSignal) => {
    try {
      const body = await fetchDemoSummary(t)
      if (signal?.aborted) return
      setSummary(body)
      setDraft(body.retention)
      setFailed(null)
    } catch (error) {
      if (!signal?.aborted) setFailed(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    const ac = new AbortController()
    void load(ac.signal)
    return () => ac.abort()
  }, [])

  if (failed && !summary) return <p className="text-muted-foreground text-sm">{failed}</p>
  if (!summary || !draft)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )

  const writable = summary.writable
  const inputError = retentionInputError(t, draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(summary.retention)
  const set = <K extends keyof DemoRetention>(key: K, value: DemoRetention[K]) => {
    setNotice(null)
    setDraft({ ...draft, [key]: value })
  }
  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await saveDemoRetention(t, draft)
      await load()
      setNotice(t('settings.wo.retention.saved'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Count label={t('settings.wo.count.live')} value={summary.counts.live} />
        <Count label={t('settings.wo.count.frozen')} value={summary.counts.frozen} />
        <Count label={t('settings.wo.count.expiring')} value={summary.counts.expiringSoon} />
      </div>

      <Card className="gap-0 px-5 py-4">
        <h3 className="font-medium text-sm">{t('settings.wo.builds.title')}</h3>
        <p className="mt-0.5 text-muted-foreground text-xs">{t('settings.wo.builds.blurb')}</p>
        <Field className="mt-3">
          <FieldLabel htmlFor="wo-demo-builds-per-day" className="text-xs">
            {t(fieldLabelKey('demoBuildsPerAccountPerDay'))}
          </FieldLabel>
          <FieldContent>
            <Input
              id="wo-demo-builds-per-day"
              type="number"
              min={0}
              max={100_000}
              value={draft.demoBuildsPerAccountPerDay}
              disabled={!writable}
              onChange={(e) => set('demoBuildsPerAccountPerDay', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </FieldContent>
        </Field>
      </Card>

      <Card className="gap-0 px-5 py-4">
        <h3 className="font-medium text-sm">{t('settings.wo.milestones.title')}</h3>
        <p className="mt-0.5 text-muted-foreground text-xs">{t('settings.wo.milestones.blurb')}</p>
        <Separator className="my-3" />
        <Table>
          <TableBody>
            {retentionMilestones(t, summary.retention).map((line) => (
              <TableRow key={line}>
                <TableCell className="whitespace-normal py-1.5 text-sm">{line}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-muted-foreground text-xs">{t('settings.wo.milestones.note')}</p>
      </Card>

      <Card className="gap-0 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-medium text-sm">{t('settings.wo.retention.title')}</h3>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {t(writable ? 'settings.wo.retention.writable' : 'settings.wo.retention.readOnly')}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.demoRetentionEnabled}
              disabled={!writable}
              onCheckedChange={(v) => set('demoRetentionEnabled', Boolean(v))}
            />
            {t('settings.wo.retention.sweepOn')}
          </label>
        </div>
        <Separator className="my-3" />
        <div className="grid gap-3 sm:grid-cols-2">
          {RETENTION_FIELDS.filter((f) => f.key !== 'demoBuildsPerAccountPerDay').map((f) => (
            <Field key={f.key}>
              <FieldLabel className="text-xs" htmlFor={`wo-retention-${f.key}`}>
                {t(fieldLabelKey(f.key))}
              </FieldLabel>
              <FieldContent>
                <Input
                  id={`wo-retention-${f.key}`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={draft[f.key]}
                  disabled={!writable}
                  onChange={(e) => set(f.key, Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </FieldContent>
            </Field>
          ))}
        </div>
        {writable ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={!changed || Boolean(inputError) || saving} onClick={save}>
              {t(saving ? 'settings.common.saving' : 'settings.common.save')}
            </Button>
            {inputError ? (
              <span className="text-destructive text-xs">{inputError}</span>
            ) : notice ? (
              <span className="text-muted-foreground text-xs">{notice}</span>
            ) : null}
          </div>
        ) : null}
      </Card>

      <PublicFindCard summary={summary} onSaved={() => load()} />
    </div>
  )
}

/** The sign-in-free `/find` page's limits; its own Save so it never rides a retention edit. */
function PublicFindCard({ summary, onSaved }: { summary: DemoSummary; onSaved: () => Promise<void> }) {
  const t = useT()
  const saved = summary.publicFind
  const [draft, setDraft] = useState<PublicFindLimits>(saved)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => setDraft(saved), [saved])
  const writable = summary.writable
  const inputError = publicFindInputError(t, draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await savePublicFindLimits(t, draft)
      await onSaved()
      setNotice(t('settings.wo.find.saved'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card className="gap-0 px-5 py-4">
      <h3 className="font-medium text-sm">{t('settings.wo.find.title')}</h3>
      <p className="mt-0.5 text-muted-foreground text-xs">
        {publicFindLine(t, saved)} {t('settings.wo.find.blurb')}
      </p>
      <Separator className="my-3" />
      <div className="grid gap-3 sm:grid-cols-2">
        {PUBLIC_FIND_FIELDS.map((f) => (
          <Field key={f.key}>
            <FieldLabel className="text-xs" htmlFor={`wo-public-find-${f.key}`}>
              {t(fieldLabelKey(f.key))}
            </FieldLabel>
            <FieldContent>
              <Input
                id={`wo-public-find-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                value={draft[f.key]}
                disabled={!writable}
                onChange={(e) => {
                  setNotice(null)
                  setDraft({ ...draft, [f.key]: Number(e.target.value) })
                }}
                className="h-8 text-sm"
              />
            </FieldContent>
          </Field>
        ))}
      </div>
      {writable ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={!changed || Boolean(inputError) || saving} onClick={save}>
            {t(saving ? 'settings.common.saving' : 'settings.common.save')}
          </Button>
          {inputError ? (
            <span className="text-destructive text-xs">{inputError}</span>
          ) : notice ? (
            <span className="text-muted-foreground text-xs">{notice}</span>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
