/**
 * The strip on the Design inspiration screen (it moved there from Quickstarts on 04/10/2026):
 * whether Design inspiration offers the design-system library beside the finished templates. One value for the whole server and all three CMSs, so it sits
 * outside the CMS picker's reach and reads the same on every tab.
 *
 * `shown === null` is "not read yet": the switch waits disabled rather than drawing a guess.
 */
import { Switch } from '@tracy/ui'
import { useT } from '../i18n'

export function DesignSystemsSwitch({
  shown,
  writable,
  busy = false,
  onChange
}: {
  shown: boolean | null
  writable: boolean
  busy?: boolean
  onChange: (shown: boolean) => void
}) {
  const t = useT()
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-sm">{t('cms-design.dsSwitch.title')}</p>
        <p className="text-muted-foreground text-xs">{t('cms-design.dsSwitch.hint')}</p>
      </div>
      <Switch
        className="ms-auto"
        checked={shown ?? false}
        disabled={shown === null || !writable || busy}
        onCheckedChange={(v: boolean) => onChange(v)}
        aria-label={t('cms-design.dsSwitch.title')}
        data-design-systems-switch=""
      />
    </div>
  )
}
