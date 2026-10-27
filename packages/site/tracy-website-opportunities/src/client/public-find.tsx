/**
 * The sign-in-free Find (apps/tracy-web `/find`): the tab's own Find view in public mode, with its own
 * flow. The page hands in an `Api` that reaches only the public doors; Continue gives back the picks.
 */
import { type JSX, useMemo, useReducer } from 'react'

import type { Api } from './api.ts'
import { FindView } from './find.tsx'
import { flowReducer, initialFlow } from './flow.ts'
import { MAX_PICKS } from './public-pick.ts'
import { createRequestIds } from './request-ids.ts'
import type { Translate } from './strings.ts'
import { newUuid } from './uuid.ts'

export interface PublicContinue {
  picks: string[]
  lat: number
  lon: number
  radiusM: number
  /** Build demo was pressed for this place (one of `picks`). */
  build?: string
}

export function PublicFind({
  t,
  api,
  onContinue
}: {
  t: Translate
  api: Api
  onContinue(next: PublicContinue): void
}): JSX.Element {
  const [flow, dispatch] = useReducer(flowReducer, undefined, () => ({
    ...initialFlow(),
    view: { name: 'find' as const }
  }))
  // No request id reaches a public door; Find still wants the helper.
  const ids = useMemo(() => createRequestIds(newUuid), [])
  const publicMode = useMemo(
    () => ({
      maxPicks: MAX_PICKS,
      onContinue: (rows: { providerId: string }[], area: { lat: number; lon: number; radiusM: number }) =>
        onContinue({ picks: rows.map((row) => row.providerId), ...area }),
      onBuild: (row: { providerId: string }, area: { lat: number; lon: number; radiusM: number }) =>
        onContinue({ picks: [row.providerId], ...area, build: row.providerId })
    }),
    [onContinue]
  )
  return (
    <div className="tracy-wo tracy-wo-public">
      <FindView
        t={t}
        api={api}
        ids={ids}
        flow={flow}
        dispatch={dispatch}
        onSent={() => {}}
        publicMode={publicMode}
      />
    </div>
  )
}
