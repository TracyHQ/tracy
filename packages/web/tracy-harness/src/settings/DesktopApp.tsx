import {
  Card,
  CardContent,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  Skeleton,
  Switch,
  cn
} from '@tracy/ui'
import { Info } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Trans, tr, useT } from '../i18n'
import { type DesktopDocument, providerRows, providersAfter, tracyModelLine } from './desktop-app'

export function DesktopApp() {
  const t = useT()
  const [doc, setDoc] = useState<DesktopDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/desktop', { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(tr('settings.desktop.readFailed', { status: response.status }))
      setDoc((await response.json()) as DesktopDocument)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const press = async (llm: { connect?: boolean; providers?: string[] }) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/ops/desktop', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ llm })
      })
      if (!response.ok) throw new Error(tr('settings.desktop.readFailed', { status: response.status }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const model = doc ? tracyModelLine(doc.tracyModel) : null

  return (
    <>
      <h2 className="font-medium text-base">{t('settings.desktop.title')}</h2>
      <p className="mt-0.5 mb-4 text-muted-foreground text-sm">{t('settings.desktop.blurb')}</p>
      {error ? <p className="mb-3 text-destructive text-sm">{error}</p> : null}
      {!doc ? (
        error ? null : (
          <Skeleton className="h-40 w-full" />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {!doc.writable ? (
            <p className="text-muted-foreground text-xs">{t('settings.common.readOnlyRole')}</p>
          ) : null}
          <Card className="py-0">
            <CardContent className="px-0">
              <Item size="sm" className="px-5">
                <ItemContent>
                  <ItemTitle>{t('settings.desktop.connect.title')}</ItemTitle>
                  <ItemDescription>{t('settings.desktop.connect.description')}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Switch
                    checked={doc.llm.connect}
                    disabled={!doc.writable || busy}
                    onCheckedChange={(on) => void press({ connect: on })}
                    aria-label={t('settings.desktop.connect.title')}
                  />
                </ItemActions>
              </Item>
              <ItemSeparator />
              <div className="px-5 pt-3 pb-1">
                <div className="font-medium text-sm">{t('settings.desktop.providers.title')}</div>
                <div className="text-muted-foreground text-xs">
                  {t(doc.llm.connect ? 'settings.desktop.providers.on' : 'settings.desktop.providers.off')}
                </div>
              </div>
              <ItemGroup>
                {providerRows(doc).map((p, i) => (
                  <div key={p.id} className={cn(p.dimmed && 'opacity-50')}>
                    {i > 0 ? <ItemSeparator /> : null}
                    <Item size="sm" className="px-5">
                      <ItemContent>
                        <ItemTitle>{p.name}</ItemTitle>
                        <ItemDescription className="font-mono text-[11px]">{p.id}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Switch
                          checked={p.on}
                          disabled={p.disabled || busy}
                          onCheckedChange={(on) => void press({ providers: providersAfter(doc, p.id, on) })}
                          aria-label={p.name}
                        />
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-sm">
            {model ? (
              <Trans
                i18nKey={
                  doc.tracyModel.provider && !doc.tracyModel.model
                    ? 'settings.desktop.tracyModelRuntime'
                    : 'settings.desktop.tracyModel'
                }
                values={{ model }}
                components={{ code: <span className="font-mono text-foreground" /> }}
              />
            ) : (
              t('settings.desktop.tracyModelNone', { door: t('settings.model.door.agent.label') })
            )}
          </p>
          <p className="flex items-start gap-1.5 text-muted-foreground text-sm">
            <Info className="mt-0.5 size-4 flex-none" />
            {t('settings.desktop.preserved')}
          </p>
          {doc.updatedBy ? (
            <p className="text-muted-foreground text-xs">
              {t('settings.desktop.lastChange', { name: doc.updatedBy })}
            </p>
          ) : null}
        </div>
      )}
    </>
  )
}
