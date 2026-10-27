import { Badge, Button, Card, Input, NativeSelect, NativeSelectOption } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { RealReviewPanel } from './RealReviewPanel'
import { CONTENT_STATUSES, contentStatusLabel } from './real-format'
import { useT } from '../i18n'
import {
  type CampaignView,
  type Page,
  type RecipientDetail,
  type RecipientSummary,
  type RealWrite,
  type Registry,
  type SendingStatus,
  realRequest
} from './real-api'

/** Why approve-all skipped an email (server code → key). */
const SKIP_LABEL: Record<string, string> = {
  SUPPRESSED: 'invitations-real.workspace.skip.suppressed',
  NO_DRAFT: 'invitations-real.workspace.skip.noDraft',
  NEEDS_REVIEW: 'invitations-real.workspace.skip.needsReview',
  CUSTOMIZED: 'invitations-real.workspace.skip.customized',
  NO_ACTIVE_PLAN: 'invitations-real.workspace.skip.noActivePlan',
  MISSING_FIELD: 'invitations-real.workspace.skip.missingField'
}

// Review content: the recipient list and the selected email side by side, as in the approved
// mockup (08-review-emails), so reviewing never depends on a selection made on another tab.
export function RealReviewWorkspace({
  campaign,
  groups,
  registry,
  busy,
  run,
  write,
  onDirty,
  canLeave,
  onError,
  onOpenTemplates,
  initialRecipientId
}: {
  campaign: CampaignView
  groups: { key: string; label: string }[]
  registry: Registry | null
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  write: RealWrite
  onDirty: (dirty: boolean) => void
  canLeave: () => boolean
  onError: (e: unknown) => void
  onOpenTemplates: () => void
  initialRecipientId: string | null
}) {
  const t = useT()
  const [filter, setFilter] = useState({ group: '', content: '', search: '' })
  const [page, setPage] = useState<Page<RecipientSummary> | null>(null)
  const [selected, setSelected] = useState<string | null>(initialRecipientId)
  const [detail, setDetail] = useState<RecipientDetail | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState<SendingStatus | null>(null)
  const [approveAll, setApproveAll] = useState<
    | { step: 'confirm' }
    | { step: 'running'; done: number }
    | { step: 'done'; approved: number; already: number; skipped: Record<string, number> }
    | null
  >(null)
  async function runApproveAll(group: string) {
    let cursor: string | null = null
    const total = { approved: 0, already: 0, skipped: {} as Record<string, number> }
    setApproveAll({ step: 'running', done: 0 })
    try {
      do {
        const page = (await write('/approve-group', { group, cursor })) as unknown as {
          approved: number
          already: number
          skipped: Record<string, number>
          nextCursor: string | null
        }
        total.approved += page.approved
        total.already += page.already
        for (const [k, v] of Object.entries(page.skipped)) total.skipped[k] = (total.skipped[k] ?? 0) + v
        cursor = page.nextCursor
        if (alive.current)
          setApproveAll({
            step: 'running',
            done: total.approved + total.already + Object.values(total.skipped).reduce((a, b) => a + b, 0)
          })
      } while (cursor && alive.current)
      if (alive.current) setApproveAll({ step: 'done', ...total })
    } catch (e) {
      if (alive.current) setApproveAll(null)
      onError(e)
    }
    await loadPage(null).catch(() => {})
    if (selected) await loadDetail(selected).catch(() => {})
  }
  async function loadSending() {
    const next = await realRequest<SendingStatus>({ path: '/sending' })
    if (alive.current) setSending(next)
  }
  useEffect(() => {
    // Read once per campaign view; a refusal leaves the control hidden rather than failing review.
    void loadSending().catch(() => {})
  }, [campaign.id])
  const token = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function loadPage(cursor: string | null, signal?: AbortSignal) {
    const mine = ++token.current
    const next = await realRequest<Page<RecipientSummary>>({
      path: `/campaigns/${campaign.id}/recipients/query`,
      method: 'POST',
      body: {
        group: filter.group || null,
        content: filter.content || null,
        search: filter.search,
        cursor,
        limit: 100
      },
      signal
    })
    if (!alive.current || signal?.aborted || mine !== token.current) return
    setPage(next)
    // Keep a chosen recipient even when it is not on this page (opened from Recipients, or a filter
    // changed); only an empty selection falls back to the first listed email.
    setSelected((s) => s ?? next.items[0]?.id ?? null)
  }
  async function loadDetail(id: string) {
    const next = await realRequest<RecipientDetail>({ path: `/campaigns/${campaign.id}/recipients/${id}` })
    if (!alive.current) return
    setDetail(next)
    setEpoch((v) => v + 1)
    const status = !next.draft
      ? 'not_created'
      : next.draft.contentApproved
        ? 'approved'
        : next.draft.stale
          ? 'needs_review'
          : 'draft'
    setPage(
      (p) => p && { ...p, items: p.items.map((i) => (i.id === id ? { ...i, contentStatus: status } : i)) }
    )
  }
  useEffect(() => {
    const controller = new AbortController()
    setPage(null)
    void loadPage(null, controller.signal).catch((e) => {
      if (!controller.signal.aborted) onError(e)
    })
    return () => controller.abort()
  }, [campaign.id, filter.group, filter.content, filter.search])
  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    setDetail((d) => (d?.id === selected ? d : null))
    void run(() => loadDetail(selected))
  }, [selected])
  const items = page?.items ?? []
  const index = items.findIndex((i) => i.id === selected)
  function choose(id: string | undefined) {
    if (!id || id === selected || !canLeave()) return
    onDirty(false)
    setEditing(false)
    setSelected(id)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <NativeSelect
          aria-label={t('invitations-real.workspace.groupAria')}
          value={filter.group}
          disabled={busy}
          onChange={(e) => canLeave() && setFilter((f) => ({ ...f, group: e.target.value }))}
        >
          <NativeSelectOption value="">{t('invitations-real.common.allGroups')}</NativeSelectOption>
          {groups.map((g) => (
            <NativeSelectOption key={g.key} value={g.key}>
              {g.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('invitations-real.workspace.stateAria')}
          value={filter.content}
          disabled={busy}
          onChange={(e) => canLeave() && setFilter((f) => ({ ...f, content: e.target.value }))}
        >
          <NativeSelectOption value="">{t('invitations-real.workspace.allStates')}</NativeSelectOption>
          {CONTENT_STATUSES.map((key) => (
            <NativeSelectOption key={key} value={key}>
              {contentStatusLabel(t, key)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {filter.group ? (
          approveAll?.step === 'confirm' ? (
            <>
              <Button disabled={busy} onClick={() => void runApproveAll(filter.group)}>
                {t('invitations-real.workspace.confirmAll', {
                  group: groups.find((g) => g.key === filter.group)?.label ?? ''
                })}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setApproveAll(null)}>
                {t('invitations-real.common.cancel')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              disabled={busy || approveAll?.step === 'running'}
              onClick={() => canLeave() && setApproveAll({ step: 'confirm' })}
            >
              {approveAll?.step === 'running'
                ? t('invitations-real.workspace.approving', {
                    done: approveAll.done,
                    total: page?.total ?? '?'
                  })
                : page
                  ? t('invitations-real.workspace.approveAllTotal', {
                      total: page.total,
                      group: groups.find((g) => g.key === filter.group)?.label ?? ''
                    })
                  : t('invitations-real.workspace.approveAll', {
                      group: groups.find((g) => g.key === filter.group)?.label ?? ''
                    })}
            </Button>
          )
        ) : null}
        <Input
          aria-label={t('invitations-real.workspace.findAria')}
          className="max-w-xs"
          autoComplete="off"
          placeholder={t('invitations-real.common.searchPlaceholder')}
          value={filter.search}
          disabled={busy}
          onChange={(e) => canLeave() && setFilter((f) => ({ ...f, search: e.target.value }))}
        />
      </div>
      {approveAll?.step === 'confirm' ? (
        <p className="text-sm" role="note">
          {t('invitations-real.workspace.confirmNote')}
        </p>
      ) : null}
      {approveAll?.step === 'done' ? (
        <p className="text-sm" data-approve-all-result>
          {[
            t('invitations-real.workspace.result', {
              approved: approveAll.approved,
              already: approveAll.already
            }),
            ...Object.entries(approveAll.skipped).map(([code, n]) =>
              t('invitations-real.workspace.skipped', {
                n,
                reason: SKIP_LABEL[code] ? t(SKIP_LABEL[code]) : code
              })
            )
          ].join(' · ')}
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="gap-2 p-3">
          <p className="px-1 text-muted-foreground text-sm">
            {page
              ? page.total > items.length
                ? t('invitations-real.workspace.countShowing', { total: page.total, shown: items.length })
                : t('invitations-real.workspace.count', { total: page.total })
              : t('invitations-real.common.readingRecipients')}
          </p>
          <ul
            className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto"
            aria-label={t('invitations-real.workspace.listAria')}
          >
            {items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === selected ? 'true' : undefined}
                  disabled={busy}
                  onClick={() => choose(r.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    r.id === selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  <span className="block break-all font-medium">{r.email}</span>
                  <span className="block text-muted-foreground text-sm">{r.groupLabel}</span>
                  <Badge variant={r.contentStatus === 'approved' ? 'default' : 'secondary'} className="mt-1">
                    {contentStatusLabel(t, r.contentStatus)}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          {page && !items.length ? (
            <p className="p-2 text-sm">{t('invitations-real.workspace.noMatch')}</p>
          ) : null}
          {page?.nextCursor ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => loadPage(page.nextCursor))}
            >
              {t('invitations-real.workspace.next')}
            </Button>
          ) : null}
        </Card>
        {detail ? (
          <RealReviewPanel
            key={`${detail.id}:${epoch}`}
            recipient={detail}
            campaignId={campaign.id}
            onError={onError}
            registry={registry}
            busy={busy}
            onDirty={onDirty}
            write={write}
            onSaved={() => loadDetail(detail.id)}
            onOpenTemplates={onOpenTemplates}
            onPrevious={index > 0 ? () => choose(items[index - 1]?.id) : null}
            onNext={index >= 0 && index < items.length - 1 ? () => choose(items[index + 1]?.id) : null}
            editing={editing}
            onEditing={setEditing}
            sending={sending}
            run={run}
            onSendingChanged={() => void loadSending().catch(() => {})}
          />
        ) : (
          <Card className="p-4">
            <p>
              {selected
                ? t('invitations-real.workspace.readingEmail')
                : t('invitations-real.workspace.choose')}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
