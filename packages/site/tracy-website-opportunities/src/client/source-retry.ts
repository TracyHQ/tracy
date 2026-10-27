import { useState } from 'react'
import { type AgainPart, type Api, startResearch, startResearchAgain } from './api.ts'
import { type AgainControl, useResearchAgain } from './research-again-dialog.tsx'
import type { SourceRetry } from './inspector.tsx'
import type { RequestIds } from './request-ids.ts'
import type { ShownSource } from './status.ts'

/** Retry on one source row: that source alone (`POST …/research` with `only`), then `after` reloads the page. */
export function useSourceRetry(
  api: Pick<Api, 'research'>,
  ids: RequestIds,
  opportunityId: string | null,
  after: () => unknown
): SourceRetry {
  const [busy, setBusy] = useState<ShownSource | null>(null)
  const [failed, setFailed] = useState<ShownSource | null>(null)
  const onPress = async (source: ShownSource): Promise<void> => {
    if (busy !== null || opportunityId === null) return
    setBusy(source)
    setFailed(null)
    const answer = await startResearch(api, opportunityId, ids, source)
    setBusy(null)
    if (!answer.ok) setFailed(source)
    await after()
  }
  return { busy, failed, onPress: (source) => void onPress(source) }
}

/**
 * Research again on the place card: the account's preview, asked again whenever `moved` changes (another
 * place, or its research moved on), and the press (`POST …/research` with `again`), then `after`.
 */
export function useCardResearchAgain(
  api: Pick<Api, 'researchAgain' | 'researchAgainPreview'>,
  ids: RequestIds,
  opportunityId: string | null,
  moved: string,
  after: () => unknown,
  /** Limits the preview and the press to these parts (Read menu again: `MENU_PARTS`). */
  parts?: readonly AgainPart[]
): AgainControl {
  return useResearchAgain({
    key: opportunityId === null ? null : `${opportunityId}:${moved}`,
    eager: true,
    load: async () =>
      opportunityId === null
        ? { ok: false, code: 'NOT_FOUND' }
        : api.researchAgainPreview(opportunityId, parts),
    start: async () =>
      opportunityId === null
        ? { ok: false, code: 'NOT_FOUND' }
        : startResearchAgain(api, opportunityId, ids, parts),
    after
  })
}
