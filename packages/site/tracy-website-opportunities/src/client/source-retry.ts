import { useState } from 'react'
import { type AgainPart, type Api, startResearch, startResearchAgain } from './api.ts'
import { type AgainControl, useResearchAgain } from './research-again-dialog.tsx'
import type { SourceRemove, SourceRetry } from './details-parts.tsx'
import { type RemoveNotice, type RemoveStep, removeSource } from './source-remove-model.ts'
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

/**
 * Remove on a pasted source row (#537): the press asks on the row, Remove calls `DELETE …/sources`, then `after`
 * reloads Details when the source went (or was already gone). A refusal leaves its line under the row.
 */
export function useSourceRemove(
  api: Pick<Api, 'removeSource'>,
  opportunityId: string | null,
  after: () => unknown
): SourceRemove {
  const [step, setStep] = useState<RemoveStep>(null)
  const [notice, setNotice] = useState<RemoveNotice | null>(null)
  const onConfirm = async (): Promise<void> => {
    if (step === null || step.phase !== 'confirm' || opportunityId === null) return
    const url = step.url
    setStep({ url, phase: 'pending' })
    const outcome = await removeSource(api, opportunityId, url)
    if (outcome.refresh) await after()
    setStep(null)
    setNotice(outcome.noticeKey === null ? null : { url, key: outcome.noticeKey })
  }
  return {
    step,
    notice,
    onAsk: (url) => {
      if (step?.phase === 'pending') return
      setNotice(null)
      setStep({ url, phase: 'confirm' })
    },
    onKeep: () => setStep(null),
    onConfirm: () => void onConfirm()
  }
}
