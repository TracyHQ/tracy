import { ToggleGroup, ToggleGroupItem } from '@tracy/ui'
import { LayoutGridIcon, MapIcon, TableIcon } from 'lucide-react'

import type { Translate, ViewMode } from './types.ts'

const VIEWS: Array<{ id: ViewMode; Icon: typeof TableIcon }> = [
  { id: 'table', Icon: TableIcon },
  { id: 'grid', Icon: LayoutGridIcon },
  { id: 'map', Icon: MapIcon }
]

/** Table / Grid / Map. Table drops out on a narrow container, where rows are cards anyway. */
export function ViewSwitch({
  t,
  value,
  onChange,
  mapAvailable,
  mapHidden = false
}: {
  t: Translate
  value: ViewMode
  onChange(v: ViewMode): void
  mapAvailable: boolean
  /** No Map button at all (the public Find: loading Maps costs per page view). */
  mapHidden?: boolean
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={(next: unknown[]) => {
        const v = VIEWS.find((x) => x.id === next[0])
        if (v) onChange(v.id)
      }}
      aria-label={t('results.view.label')}
      className="tracy-wo-view-switch"
    >
      {VIEWS.filter(({ id }) => !(mapHidden && id === 'map')).map(({ id, Icon }) => {
        const off = id === 'map' && !mapAvailable
        return (
          <ToggleGroupItem
            key={id}
            value={id}
            disabled={off}
            data-view={id}
            aria-label={t(`results.view.${id}`)}
            title={off ? t('results.view.mapUnavailable') : undefined}
          >
            <Icon aria-hidden />
            <span className="tracy-wo-tool-label">{t(`results.view.${id}`)}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
