/** One popup shell for the wizard's starting designs and design systems. */
import { Dialog, DialogContent, PreviewHeader, PreviewHeaderAction } from '@tracy/ui'
import type { JSX, ReactNode, RefObject } from 'react'

import { DeviceRow, type StageDevice, type StageTheme } from './design-system-stage'
import type { Translate } from './strings'

export function PreviewDialog({
  t,
  name,
  description,
  returnTo,
  onUse,
  onBack,
  position,
  onStep,
  pagerLabels,
  swatches,
  lead,
  device,
  onDevice,
  theme,
  attributes,
  actionAttributes,
  children
}: {
  t: Translate
  name: string
  description?: string | null
  returnTo: RefObject<HTMLElement | null>
  onUse: () => void
  onBack: () => void
  position?: { index: number; total: number } | null
  onStep?: ((dir: -1 | 1) => void) | null
  pagerLabels: { previous: string; next: string }
  swatches?: string[]
  lead?: ReactNode
  device: StageDevice
  onDevice: (device: StageDevice) => void
  theme?: { value: StageTheme; onTheme: (theme: StageTheme) => void } | null
  attributes?: Record<string, string>
  actionAttributes?: Record<string, string>
  children: ReactNode
}): JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onBack()}>
      <DialogContent
        closeLabel={t('sheet_close')}
        finalFocus={returnTo}
        className="tas-dspop flex h-[96vh] max-w-[98vw] flex-col gap-0 p-0 sm:max-w-[98vw]"
        {...attributes}
      >
        <PreviewHeader
          pager={
            position && onStep && position.total > 1
              ? {
                  position: t('ds_preview_position', { index: position.index + 1, total: position.total }),
                  prevLabel: pagerLabels.previous,
                  nextLabel: pagerLabels.next,
                  onStep
                }
              : null
          }
          name={name}
          description={description}
          swatches={swatches}
          lead={lead}
        >
          <PreviewHeaderAction onClick={onUse} data-preview-use="1" {...actionAttributes}>
            {t('ds_preview_use', { name })}
          </PreviewHeaderAction>
        </PreviewHeader>
        <DeviceRow
          device={device}
          onDevice={onDevice}
          labels={{ group: t('ds_device'), desktop: t('ds_desktop'), mobile: t('ds_mobile') }}
          theme={
            theme
              ? {
                  ...theme,
                  labels: { group: t('ds_theme'), light: t('ds_light'), dark: t('ds_dark') }
                }
              : null
          }
        />
        {children}
      </DialogContent>
    </Dialog>
  )
}
