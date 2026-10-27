// /ops/wo › Settings › Demos for outside builders: the live cap and model budget of `/v1/demos`, saved on their own.
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Input
} from '@tracy/ui'
import { useEffect, useState } from 'react'

import { type T, useT } from './i18n/index.ts'
import {
  PUBLIC_DEMO_FIELDS,
  PublicDemosDoorError,
  type PublicDemoSettings,
  type PublicDemoSettingsDocument,
  publicDemoInputError,
  readPublicDemoSettings,
  savePublicDemoSettings
} from './wo-public-demos.ts'

/** What a failed read or save said, in the operator's language when the door said nothing itself. */
const failureOf = (t: T, error: unknown) =>
  error instanceof PublicDemosDoorError
    ? t(error.key, { status: error.status })
    : error instanceof Error
      ? error.message
      : String(error)

export function WoPublicDemosPanel() {
  const t = useT()
  const [doc, setDoc] = useState<PublicDemoSettingsDocument | null>(null)
  const [draft, setDraft] = useState<PublicDemoSettings | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    readPublicDemoSettings()
      .then((read) => {
        if (!live) return
        setDoc(read)
        setDraft(read.settings)
      })
      .catch((error) => live && setNotice(failureOf(t, error)))
    return () => {
      live = false
    }
  }, [])

  const inputError = draft ? publicDemoInputError(t, draft) : null
  const changed = Boolean(doc && draft && JSON.stringify(doc.settings) !== JSON.stringify(draft))
  const save = async () => {
    if (!draft) return
    setSaving(true)
    setNotice(null)
    try {
      const saved = await savePublicDemoSettings(draft)
      setDoc(saved)
      setDraft(saved.settings)
      setNotice(t('wo-misc.demos.saved'))
    } catch (error) {
      setNotice(failureOf(t, error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="py-4">
      <CardHeader className="px-5 py-0 pb-4">
        <CardTitle className="text-base">{t('wo-misc.demos.title')}</CardTitle>
        <CardDescription className="text-sm">{t('wo-misc.demos.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-0 text-sm">
        {draft ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {PUBLIC_DEMO_FIELDS.map((f) => (
              <Field key={f.key}>
                <FieldLabel htmlFor={`wo-public-${f.key}`} className="text-xs">
                  {t(f.labelKey)}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id={`wo-public-${f.key}`}
                    type="number"
                    min={f.min}
                    max={f.max}
                    value={draft[f.key]}
                    disabled={!doc?.writable}
                    onChange={(e) => {
                      setNotice(null)
                      setDraft({ ...draft, [f.key]: Number(e.target.value) })
                    }}
                    className="h-8 text-xs"
                  />
                  <FieldDescription className="text-[11px]">{t(f.hintKey)}</FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </div>
        ) : null}
        {inputError || notice ? (
          <p className="text-muted-foreground text-xs">{inputError ?? notice}</p>
        ) : null}
        {doc?.writable ? (
          <Button size="sm" disabled={!changed || Boolean(inputError) || saving} onClick={() => void save()}>
            {saving ? t('wo-misc.demos.saving') : t('wo-misc.demos.save')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
