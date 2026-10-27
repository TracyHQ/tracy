import { Button, Card } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { localTime } from './real-format'
import { useT } from '../i18n'
import { type CampaignView, type EligibilityView, realRequest } from './real-api'

/** Check eligibility: asks aMember for every recipient that is not suppressed, a page at a time,
 * and shows the stored answers. It informs the operator only; sending asks aMember again. */
export function RealEligibilityPanel({
  campaign,
  busy,
  run
}: {
  campaign: CampaignView
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
}) {
  const t = useT()
  const [view, setView] = useState<EligibilityView | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const alive = useRef(true)
  const base = `/campaigns/${campaign.id}`
  async function load(signal?: AbortSignal) {
    const next = await realRequest<EligibilityView>({ path: `${base}/eligibility`, signal })
    if (alive.current && !signal?.aborted) setView(next)
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void load(controller.signal).catch(() => {})
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [campaign.id])
  async function checkAll() {
    let cursor: string | null = null,
      done = 0
    setProgress(0)
    try {
      do {
        const page: { checked: number; nextCursor: string | null } = await realRequest({
          path: `${base}/eligibility/check`,
          method: 'POST',
          body: { cursor, limit: 50 }
        })
        done += page.checked
        cursor = page.nextCursor
        if (alive.current) setProgress(done)
      } while (cursor && alive.current)
    } finally {
      if (alive.current) setProgress(null)
      await load().catch(() => {})
    }
  }
  return (
    <Card className="gap-2 p-4" data-eligibility>
      <h2 className="font-semibold">{t('invitations-real.eligibility.title')}</h2>
      {view ? (
        <>
          <p className="text-sm">
            {view.checked
              ? t('invitations-real.eligibility.summary', {
                  allow: view.counts.allow,
                  none: view.counts.none,
                  unknown: view.counts.unknown,
                  checked: view.checked,
                  checkable: view.checkable
                })
              : t('invitations-real.eligibility.notChecked', { checkable: view.checkable })}
          </p>
          {view.newest ? (
            <p className="text-muted-foreground text-sm">
              {view.oldest && view.oldest !== view.newest
                ? t('invitations-real.eligibility.checkedRange', {
                    from: localTime(view.oldest),
                    to: localTime(view.newest)
                  })
                : t('invitations-real.eligibility.checkedAt', { at: localTime(view.newest) })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm">{t('invitations-real.eligibility.reading')}</p>
      )}
      <p className="text-muted-foreground text-sm">{t('invitations-real.eligibility.explain')}</p>
      <div>
        <Button disabled={busy || progress !== null} onClick={() => void run(checkAll)}>
          {progress !== null
            ? t('invitations-real.eligibility.checking', { done: progress, total: view?.checkable ?? '?' })
            : view?.checked
              ? t('invitations-real.eligibility.checkAgain')
              : t('invitations-real.eligibility.check')}
        </Button>
      </div>
    </Card>
  )
}
