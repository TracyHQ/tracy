import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'
import { htmlLang } from '@tracy/core/interface-languages/resolve'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Trans, useLanguage, useT } from './i18n/index.ts'
import { fetchAgainPreview, researchAgain } from './wo-places-api'
import type { AgainPlan } from './wo-places-api'
import { partsOutside } from './wo-place-menu'
import { againReasonLabel, failureText, formatCents, partLabel } from './wo-places-format'

/**
 * What Research again would run on one place, read from the preview door; the run itself recomputes the plan on the
 * server, so a place that went fresh meanwhile answers "up to date". With `parts` it is Read menu again: only those
 * parts may run, and a plan that would run anything else is refused here rather than run.
 */
export function WoResearchAgainDialog({
  open,
  placeId,
  placeName,
  busy,
  parts,
  onClose,
  run
}: {
  open: boolean
  placeId: string | null
  placeName: string | null
  busy: string | null
  parts?: readonly string[]
  onClose(): void
  run(label: string, action: () => Promise<string | null>): void
}) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  const [plan, setPlan] = useState<AgainPlan | null>(null)
  const [error, setError] = useState<{ failure: unknown } | null>(null)

  useEffect(() => {
    if (!open || !placeId) return
    let live = true
    setPlan(null)
    setError(null)
    fetchAgainPreview(placeId, fetch, parts)
      .then((preview) => live && setPlan(preview.plan))
      .catch((e) => live && setError({ failure: e }))
    return () => {
      live = false
    }
  }, [open, placeId, parts])

  const menu = Boolean(parts?.length)
  const nothingDue = plan !== null && plan.run.length === 0
  const outside = plan && parts?.length ? partsOutside(plan, parts) : []
  const kept = plan ? plan.kept.filter((k) => !parts?.length || parts.includes(k.part)) : []
  const action = menu ? t('wo-places.again.readMenu') : t('wo-places.again.research')

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent closeLabel={t('wo-places.dialog.close')} className="sm:max-w-lg">
        <DialogHeader>
          {menu ? (
            <>
              <DialogTitle>
                {placeName
                  ? t('wo-places.again.menuTitle', { name: placeName })
                  : t('wo-places.again.menuTitleUnnamed')}
              </DialogTitle>
              <DialogDescription>{t('wo-places.again.menuDescription')}</DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>
                {placeName
                  ? t('wo-places.again.title', { name: placeName })
                  : t('wo-places.again.titleUnnamed')}
              </DialogTitle>
              <DialogDescription>{t('wo-places.again.description')}</DialogDescription>
            </>
          )}
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{failureText(t, error.failure)}</AlertDescription>
          </Alert>
        ) : !plan ? (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('wo-places.again.working')}
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            {plan.run.length ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {plan.run.map((r) => (
                  <li key={r.part} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{partLabel(t, r.part)}</span>
                      <span className="text-muted-foreground"> · {againReasonLabel(t, r.reason)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">≈ {formatCents(r.ceilingCents, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {outside.length ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {t('wo-places.again.outside', {
                    parts: outside.map((part) => partLabel(t, part)).join(', ')
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
            {kept.length ? (
              <ul className="space-y-1">
                {kept.map((k) => (
                  <li key={k.part} className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span className="min-w-0 truncate" title={k.detail}>
                      {partLabel(t, k.part)} · {againReasonLabel(t, k.reason)}
                      {k.detail ? ` (${k.detail})` : ''}
                    </span>
                    <Badge variant="outline">{t('wo-places.again.kept')}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            {menu ? (
              <p className="flex items-center justify-between gap-2 text-muted-foreground">
                <span>{t('wo-places.again.notPart')}</span>
                <Badge variant="outline">{t('wo-places.again.kept')}</Badge>
              </p>
            ) : null}
            {nothingDue ? (
              <p className="text-muted-foreground">
                {menu ? t('wo-places.again.menuUpToDate') : t('wo-places.again.allUpToDate')}
              </p>
            ) : (
              <p>
                <Trans
                  i18nKey="wo-places.again.ceiling"
                  values={{ amount: formatCents(plan.ceilingCents, locale) }}
                  components={{ b: <span className="font-semibold tabular-nums" /> }}
                />
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('wo-places.dialog.cancel')}
          </Button>
          <Button
            disabled={!plan || nothingDue || outside.length > 0 || busy !== null || !placeId}
            onClick={() => {
              if (!placeId) return
              run(menu ? 'read-menu-again' : 'research-again', async () => {
                const r = await researchAgain(placeId, fetch, parts)
                if (r.outcome === 'up-to-date') return t('wo-places.again.nothingRan')
                if (r.joined) return t('wo-places.again.joined')
                return menu ? t('wo-places.again.readMenuQueued') : t('wo-places.again.researchQueued')
              })
            }}
          >
            {nothingDue ? t('wo-places.again.buttonUpToDate') : action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
