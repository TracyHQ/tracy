/**
 * `/ops/settings` — one screen, a rail of its own, six panels.
 *
 * THE SHAPE COMES FROM THE SHADCN ADMIN TEMPLATE'S Settings PAGE (Lee, 22/09): a vertical list on
 * the left, the chosen panel on the right. It is here rather than six more rows in the main rail
 * because the main rail already carries twelve, and these are things a person opens rarely — see
 * `./route.ts`.
 *
 * 🔒 ONE READ FOR FOUR PANELS. `/api/ops/general` answers the whole document, so switching panels
 * is not a fetch. Team is the exception and always was: it has its own doors, its own writes, and
 * its own refusal vocabulary, so it is rendered untouched rather than folded into this read.
 *
 * ⚠ LAYER A. Nothing here writes. `writable: false` rides on the payload itself, so the day a
 * `system_setting` table lands, the panels that gain an input are the ones whose flag flipped —
 * not whichever ones somebody remembered to revisit.
 */
import { Skeleton } from '@tracy/ui'
import { useEffect, useState } from 'react'

import { useT } from '../i18n'
import { Team } from '../Team'
import { type General, fetchGeneral } from './api'
import { IntegrationsPanel, LimitsPanel, NamingPanel, SignInPanel } from './panels'
import {
  SETTINGS_PANELS,
  type SettingsPanel,
  settingsHref,
  settingsPanelBlurbKey,
  settingsPanelLabelKey
} from './route'
import { WoRetentionPanel } from './WoRetention'

export function Settings({
  panel,
  onPanel
}: {
  panel: SettingsPanel
  onPanel: (panel: SettingsPanel) => void
}) {
  const t = useT()
  const [data, setData] = useState<General | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    fetchGeneral(ac.signal).then((body) => {
      if (ac.signal.aborted) return
      setData(body)
      setFailed(body === null)
    })
    return () => ac.abort()
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-none px-8 pt-7 pb-4">
        <h1 className="font-semibold text-xl tracking-tight">{t('settings.page.title')}</h1>
        <p className="mt-1 text-muted-foreground text-sm">{t('settings.page.blurb')}</p>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 px-8 pb-8 lg:flex-row">
        {/* The panel list. A row of chips below `lg`, where a second vertical column would leave
            the panel itself about 200px wide. */}
        <nav className="flex flex-none flex-row flex-wrap gap-1 lg:w-48 lg:flex-col">
          {SETTINGS_PANELS.map((id) => (
            <a
              key={id}
              href={settingsHref(id)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                onPanel(id)
              }}
              aria-current={id === panel ? 'page' : undefined}
              className={
                id === panel
                  ? 'rounded-lg bg-muted px-3 py-1.5 font-medium text-foreground text-sm no-underline'
                  : 'rounded-lg px-3 py-1.5 text-foreground/80 text-sm no-underline hover:bg-muted/60'
              }
            >
              {t(settingsPanelLabelKey(id))}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {panel === 'team' ? (
            // Untouched, including its own page padding — this screen gives it a column, not a
            // rewrite. Negative margin cancels the outer padding it already brings.
            <div className="-mx-8 -mt-7">
              <Team />
            </div>
          ) : panel === 'wo' ? (
            // Its own door and its own writes, like Team: not part of the General read.
            <>
              <h2 className="font-medium text-base">{t(settingsPanelLabelKey(panel))}</h2>
              <p className="mt-0.5 mb-4 text-muted-foreground text-sm">{t(settingsPanelBlurbKey(panel))}</p>
              <WoRetentionPanel />
            </>
          ) : (
            <>
              <h2 className="font-medium text-base">{t(settingsPanelLabelKey(panel))}</h2>
              <p className="mt-0.5 mb-4 text-muted-foreground text-sm">{t(settingsPanelBlurbKey(panel))}</p>
              {failed ? (
                // Not an error dialog: this screen reports configuration, and a panel that cannot
                // read says so in its own place rather than taking over the page.
                <p className="text-muted-foreground text-sm">{t('settings.page.readFailed')}</p>
              ) : !data ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : panel === 'signin' ? (
                <SignInPanel data={data} />
              ) : panel === 'limits' ? (
                <LimitsPanel data={data} />
              ) : panel === 'integrations' ? (
                <IntegrationsPanel data={data} />
              ) : (
                <NamingPanel data={data} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
