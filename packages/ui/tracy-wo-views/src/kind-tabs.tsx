import { Tabs, TabsList, TabsTrigger } from '@tracy/ui'

import { KIND_ICON } from './cells/type.tsx'
import type { kindCounts } from './model.ts'
import type { Kind, Translate } from './types.ts'
import { KINDS } from './types.ts'

const ALL = 'all'
const asKind = (v: unknown): Kind | null => KINDS.find((k) => k === v) ?? null

/** All + one pill per kind that has places, with counts (@tracy/ui Tabs, default variant). */
export function KindTabs({
  t,
  counts,
  total,
  value,
  onChange
}: {
  t: Translate
  counts: ReturnType<typeof kindCounts>
  total: number
  value: Kind | null
  onChange(k: Kind | null): void
}) {
  return (
    <Tabs value={value ?? ALL} onValueChange={(v) => onChange(asKind(v))} className="tracy-wo-kind-tabs">
      <TabsList aria-label={t('kind.label')} className="tracy-wo-kind-list">
        <TabsTrigger value={ALL}>
          {t('kind.all')}
          <span className="tracy-wo-tab-count">{total}</span>
        </TabsTrigger>
        {counts.map(({ kind, count }) => {
          const Icon = KIND_ICON[kind]
          return (
            <TabsTrigger key={kind} value={kind}>
              <Icon className="size-3.5" aria-hidden />
              {t(`kind.${kind}`)}
              <span className="tracy-wo-tab-count">{count}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
