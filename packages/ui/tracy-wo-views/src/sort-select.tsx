import { NativeSelect, NativeSelectOption } from '@tracy/ui'

import { SORT_KEYS } from './types.ts'
import type { SortKey, Translate } from './types.ts'

/** Sort for layouts without column headers: a narrow container, and the grid and map views (CSS decides). */
export function SortSelect({
  t,
  value,
  onChange
}: {
  t: Translate
  value: SortKey
  onChange(k: SortKey): void
}) {
  return (
    <NativeSelect
      size="sm"
      className="tracy-wo-sort-select"
      aria-label={t('results.sort.label')}
      value={value}
      onChange={(e) => {
        const k = SORT_KEYS.find((x) => x === e.currentTarget.value)
        if (k) onChange(k)
      }}
    >
      {SORT_KEYS.map((k) => (
        <NativeSelectOption key={k} value={k}>
          {t('results.sort.option', { sort: t(`results.sort.${k}`) })}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
