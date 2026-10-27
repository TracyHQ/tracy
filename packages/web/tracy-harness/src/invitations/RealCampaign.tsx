import { Badge, Button, Card } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import {
  type CampaignView,
  type Page,
  type RealOverview,
  type RecipientDetail,
  type RecipientSummary,
  type Registry,
  type SendingStatus,
  RealRequestError,
  realRequest
} from './real-api'
import { RealImportPanel } from './RealImportPanel'
import { RealRecipients } from './RealRecipients'
import { RealReviewWorkspace } from './RealReviewWorkspace'
import { andList, localTime } from './real-format'
import { tr, useT } from '../i18n'
import { RealFieldsPanel } from './RealFieldsPanel'
import { RealContentPanel } from './RealContentPanel'
import { RealRetentionPanel } from './RealRetentionPanel'
import { RealSendPanel } from './RealSendPanel'
import { RealMailFormatPanel } from './RealMailFormatPanel'
import { RealEligibilityPanel } from './RealEligibilityPanel'
import { RealCampaignSettingsPanel } from './RealCampaignSettingsPanel'
import { type RealState, beginRealQuery, acceptRealQuery } from './real-state'

type Tab =
  | 'Overview'
  | 'Import'
  | 'Recipients'
  | 'Fields'
  | 'Content / Templates'
  | 'Review content'
  | 'Send'
  | 'Conversations'
  | 'Setup'
const TABS: Tab[] = [
  'Overview',
  'Import',
  'Recipients',
  'Fields',
  'Content / Templates',
  'Review content',
  'Send',
  'Conversations',
  'Setup'
]
// Tab ids stay English state; only their labels are translated.
const TAB_KEYS: Record<Tab, string> = {
  Overview: 'invitations-real.campaign.tab.overview',
  Import: 'invitations-real.campaign.tab.import',
  Recipients: 'invitations-real.campaign.tab.recipients',
  Fields: 'invitations-real.campaign.tab.fields',
  'Content / Templates': 'invitations-real.campaign.tab.content',
  'Review content': 'invitations-real.campaign.tab.review',
  Send: 'invitations-real.campaign.tab.send',
  Conversations: 'invitations-real.campaign.tab.conversations',
  Setup: 'invitations-real.campaign.tab.setup'
}
export function RealCampaign({ campaignId, onLeave }: { campaignId?: string; onLeave?: () => void }) {
  const t = useT()
  const [overview, setOverview] = useState<RealOverview | null>(null)
  const [campaign, setCampaign] = useState<CampaignView | null>(null)
  const [tab, setTab] = useState<Tab>('Overview')
  const [page, setPage] = useState<Page<RecipientSummary> | null>(null)
  const [detail, setDetail] = useState<RecipientDetail | null>(null)
  const [filter, setFilter] = useState({ group: '', state: '', search: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [reviewTarget, setReviewTarget] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [sending, setSending] = useState<SendingStatus | null>(null)
  // Per-group numbers belong to one campaign: ask for the open one, the server-wide status otherwise.
  async function loadSending(campaignId?: string) {
    const next = await realRequest<SendingStatus>({
      path: campaignId ? `/sending?campaign=${campaignId}` : '/sending'
    })
    if (alive.current) setSending(next)
  }
  const dirty = useRef(false),
    pending = useRef(false),
    generation = useRef(0),
    query = useRef(0)
  const alive = useRef(true)
  // Latest known campaign revision: a panel that writes several pages in a row (draft generation)
  // must send the revision the previous write returned, not the one its render captured.
  const revision = useRef<number | null>(null)
  useEffect(() => {
    revision.current = campaign?.revision ?? null
  }, [campaign?.id, campaign?.revision])
  const recipientQuery = useRef<RealState>({
    campaignId: '',
    group: '',
    queryId: 0,
    recipients: [],
    cursor: null,
    dirty: false
  })
  function clearPrivate(code: string) {
    generation.current++
    query.current++
    recipientQuery.current = beginRealQuery(recipientQuery.current, { campaignId: '', group: '' }).state
    setOverview(null)
    setCampaign(null)
    setDetail(null)
    setPage(null)
    setRegistry(null)
    setHeaders([])
    dirty.current = false
    setError(code)
  }
  function failure(e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return
    if (e instanceof RealRequestError && [401, 403, 410, 503].includes(e.status)) clearPrivate(e.code)
    else setError(e instanceof RealRequestError ? e.code : 'REAL_UNAVAILABLE')
  }
  // Also called from window listeners bound once, so it reads the language now (`tr`), not at mount.
  function canLeave() {
    return (
      !pending.current && (!dirty.current || window.confirm(tr('invitations-real.campaign.confirmDiscard')))
    )
  }
  async function run(work: () => Promise<void>) {
    if (pending.current) return false
    const gen = ++generation.current
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await work()
      return alive.current && gen === generation.current
    } catch (e) {
      if (alive.current && gen === generation.current) failure(e)
      return false
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function select(id: string) {
    const gen = generation.current
    query.current++
    dirty.current = false
    setDetail(null)
    setPage(null)
    setRegistry(null)
    setHeaders([])
    setCampaign(null)
    setFilter({ group: '', state: '', search: '' })
    const next = await realRequest<CampaignView>({ path: `/campaigns/${id}` })
    if (alive.current && gen === generation.current) {
      setCampaign(next)
      setTab('Overview')
    }
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    const gen = ++generation.current
    setCampaign(null)
    setPage(null)
    setDetail(null)
    setRegistry(null)
    setHeaders([])
    void realRequest<RealOverview>({ signal: controller.signal })
      .then(async (next) => {
        if (!alive.current || controller.signal.aborted || gen !== generation.current) return
        setOverview(next)
        // The banner reads the server's sending switch; a refusal leaves it on "Reading".
        if (next.writable && next.enabled) void loadSending().catch(() => {})
        if (campaignId && next.writable && next.enabled) await select(campaignId)
      })
      .catch((e) => {
        if (alive.current && !controller.signal.aborted && gen === generation.current) failure(e)
      })
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const navigate = (e: Event) => {
      if (!canLeave()) e.preventDefault()
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('tracy:before-ops-navigation', navigate)
    return () => {
      alive.current = false
      generation.current++
      query.current++
      controller.abort()
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('tracy:before-ops-navigation', navigate)
    }
  }, [campaignId])
  useEffect(() => {
    if (campaign && overview?.writable) void loadSending(campaign.id).catch(() => {})
  }, [campaign?.id])
  useEffect(() => {
    if (!campaign) return
    const expiry = Date.parse(campaign.expiresAt)
    function check() {
      if (Date.now() >= expiry) clearPrivate('REAL_EXPIRED')
    }
    check()
    const timer = setInterval(check, 1000)
    const controller = new AbortController()
    const focus = () => {
      check()
      const gen = generation.current
      if (Date.now() < expiry)
        void realRequest({ path: `/campaigns/${campaign?.id}`, signal: controller.signal }).catch((e) => {
          if (!controller.signal.aborted && gen === generation.current) failure(e)
        })
    }
    window.addEventListener('focus', focus)
    return () => {
      clearInterval(timer)
      controller.abort()
      window.removeEventListener('focus', focus)
    }
  }, [campaign?.id, campaign?.expiresAt])
  useEffect(() => {
    if (!campaign || tab !== 'Recipients') return
    const controller = new AbortController(),
      token = ++query.current
    const started = beginRealQuery(
      { ...recipientQuery.current, dirty: dirty.current },
      { campaignId: campaign.id, group: filter.group }
    )
    recipientQuery.current = started.state
    setPage(null)
    setDetail(null)
    void realRequest<Page<RecipientSummary>>({
      path: `/campaigns/${campaign.id}/recipients/query`,
      method: 'POST',
      body: {
        group: filter.group || null,
        state: filter.state || null,
        search: filter.search,
        cursor: null,
        limit: 100
      },
      signal: controller.signal
    })
      .then((next) => {
        if (alive.current && !controller.signal.aborted && token === query.current) {
          const received = acceptRealQuery(recipientQuery.current, started.token, next)
          if (received !== recipientQuery.current) {
            recipientQuery.current = received
            setPage(next)
          }
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && token === query.current) failure(e)
      })
    return () => controller.abort()
  }, [campaign?.id, tab, filter.group, filter.state, filter.search])
  function changeTab(next: Tab) {
    if (next !== tab && canLeave()) {
      dirty.current = false
      setTab(next)
    }
  }
  async function loadDetail(id: string) {
    const gen = generation.current,
      token = ++query.current
    const next = await realRequest<RecipientDetail>({ path: `/campaigns/${campaign?.id}/recipients/${id}` })
    if (alive.current && gen === generation.current && token === query.current) {
      setDetail(next)
      setHeaders(next.rawSource.headers)
    }
  }
  async function loadRegistry(signal?: AbortSignal) {
    const id = campaign?.id,
      gen = generation.current
    if (!id) return
    const next = await realRequest<Registry>({ path: `/campaigns/${id}/fields`, signal })
    if (alive.current && !signal?.aborted && gen === generation.current) setRegistry(next)
  }
  useEffect(() => {
    if (!campaign || !['Fields', 'Review content'].includes(tab)) return
    const controller = new AbortController(),
      gen = generation.current
    setRegistry(null)
    void loadRegistry(controller.signal).catch((e) => {
      if (!controller.signal.aborted) failure(e)
    })
    if (tab === 'Fields' && !headers.length)
      void realRequest<Page<RecipientSummary>>({
        path: `/campaigns/${campaign.id}/recipients/query`,
        method: 'POST',
        body: { limit: 1 },
        signal: controller.signal
      })
        .then(async (p) => {
          if (!p.items[0]) return
          const d = await realRequest<RecipientDetail>({
            path: `/campaigns/${campaign.id}/recipients/${p.items[0].id}`,
            signal: controller.signal
          })
          if (!controller.signal.aborted && gen === generation.current) setHeaders(d.rawSource.headers)
        })
        .catch((e) => {
          if (!controller.signal.aborted) failure(e)
        })
    return () => controller.abort()
  }, [campaign?.id, tab])
  // A campaign names its own groups; the overview's five are the baseline for campaigns that do not.
  const groups = campaign?.groups ?? overview?.groups ?? []
  async function write(path: string, body: object, refresh?: () => Promise<void>) {
    let result: { revision: number; [key: string]: unknown } | undefined
    const saved = await run(async () => {
      const gen = generation.current
      result = await realRequest({
        path: `/campaigns/${campaign?.id}${path}`,
        method: 'POST',
        body: { ...body, revision: revision.current ?? campaign?.revision }
      })
      if (result) revision.current = result.revision
      if (alive.current && gen === generation.current)
        setCampaign((c) => (c && result ? { ...c, revision: result.revision } : c))
      if (alive.current && gen === generation.current && refresh) await refresh()
    })
    if (!saved || !result) throw new Error('Not saved')
    return result
  }
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-xl">{t('invitations-real.campaign.title')}</h1>
        <div className="flex gap-2">
          {onLeave ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (canLeave()) onLeave()
              }}
            >
              {t('invitations-real.campaign.back')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (canLeave())
                void run(async () => {
                  if (campaign) await select(campaign.id)
                  else setOverview(await realRequest())
                  await loadSending(campaign?.id).catch(() => {})
                })
            }}
          >
            {t('invitations-real.campaign.refresh')}
          </Button>
        </div>
      </div>
      <Card className="gap-2 p-4" data-sending-banner>
        <Badge variant={sending?.mode === 'pilot' ? 'default' : 'secondary'}>
          {!sending
            ? t('invitations-real.campaign.sending.badge.reading')
            : sending.mode === 'pilot'
              ? t('invitations-real.campaign.sending.badge.pilot')
              : sending.mode === 'test'
                ? t('invitations-real.campaign.sending.badge.test')
                : t('invitations-real.campaign.sending.badge.off')}
        </Badge>
        <p className="text-sm">
          {!sending
            ? t('invitations-real.campaign.sending.reading')
            : sending.mode === 'pilot'
              ? `${t('invitations-real.campaign.sending.pilot', { used: sending.pilotUsed, max: sending.pilotMax })} ${
                  sending.mailbox.address
                    ? t(
                        sending.mailbox.send
                          ? 'invitations-real.campaign.sending.mailbox'
                          : 'invitations-real.campaign.sending.mailboxCannotSend',
                        { address: sending.mailbox.address }
                      )
                    : t(
                        sending.mailbox.send
                          ? 'invitations-real.campaign.sending.mailboxMissing'
                          : 'invitations-real.campaign.sending.mailboxMissingCannotSend'
                      )
                }`
              : sending.mode === 'test'
                ? `${t('invitations-real.campaign.sending.test')}${
                    sending.pilotMissing?.length
                      ? ` ${t('invitations-real.campaign.sending.testMissing', { missing: andList(t, sending.pilotMissing) })}`
                      : ''
                  }`
                : t('invitations-real.campaign.sending.off')}{' '}
          {t('invitations-real.campaign.sending.always')}
        </p>
      </Card>
      {error ? (
        <p role="alert">
          {error}.{' '}
          {error === 'REAL_STALE_REVISION'
            ? t('invitations-real.campaign.error.stale')
            : t('invitations-real.campaign.error.other')}
        </p>
      ) : null}
      {!overview ? (
        <p>
          {error
            ? t('invitations-real.campaign.unavailable')
            : t('invitations-real.campaign.readingAvailability')}
        </p>
      ) : !overview.enabled ? (
        <p>{t('invitations-real.campaign.notConfigured')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map((id) => (
              <Button
                key={id}
                variant={tab === id ? 'default' : 'outline'}
                disabled={
                  busy ||
                  (id !== 'Overview' && !overview.writable) ||
                  (!['Overview', 'Import', 'Setup'].includes(id) && !campaign)
                }
                onClick={() => changeTab(id)}
              >
                {t(TAB_KEYS[id])}
              </Button>
            ))}
          </div>
          {tab === 'Overview' ? (
            <div className="flex flex-col gap-3">
              {campaign ? (
                <Card className="gap-2 p-4">
                  <h2>{campaign.name}</h2>
                  <p>
                    {t('invitations-real.campaign.dates', {
                      source: campaign.sourceDate,
                      imported: localTime(campaign.firstImportedAt),
                      expires: localTime(campaign.expiresAt)
                    })}
                  </p>
                  <p>
                    {t('invitations-real.common.counts', {
                      total: campaign.counts.total,
                      blocked: campaign.counts.suppressed,
                      recheck: campaign.counts.recheck
                    })}
                  </p>
                  {groups.map((g) => (
                    <p key={g.key}>
                      {g.label}: {campaign.counts.groups[Number(g.key.replace('group_', '')) - 1] ?? 0}
                    </p>
                  ))}
                  <p>
                    {campaign.audience === 'past_customers'
                      ? t('invitations-real.campaign.sendsTo.past')
                      : t('invitations-real.campaign.sendsTo.active')}
                  </p>
                </Card>
              ) : null}
              {campaign && overview.writable ? (
                <RealCampaignSettingsPanel
                  key={`${campaign.id}:${campaign.revision}`}
                  campaign={campaign}
                  groups={groups}
                  busy={busy}
                  write={write}
                  onSaved={(next) => {
                    setCampaign(next)
                    setOverview(
                      (o) =>
                        o && {
                          ...o,
                          campaigns: o.campaigns.map((old) =>
                            old.id === next.id ? { ...old, ...next } : old
                          )
                        }
                    )
                  }}
                  onDirty={(v) => {
                    dirty.current = v
                  }}
                />
              ) : null}
              {campaign && overview.writable ? (
                <RealEligibilityPanel key={campaign.id} campaign={campaign} busy={busy} run={run} />
              ) : null}
              {overview.campaigns.map((c) => (
                <Card className="gap-2 p-4" key={c.id}>
                  <h2>{overview.writable ? c.name : t('invitations-real.campaign.statsTitle')}</h2>
                  <p>
                    {t('invitations-real.campaign.dates', {
                      source: c.sourceDate,
                      imported: localTime(c.firstImportedAt),
                      expires: localTime(c.expiresAt)
                    })}
                  </p>
                  {c.unavailable ? (
                    <p role="alert">{t('invitations-real.campaign.cannotOpen', { reason: c.unavailable })}</p>
                  ) : null}
                  <p>
                    {t('invitations-real.common.counts', {
                      total: c.counts.total,
                      blocked: c.counts.suppressed,
                      recheck: c.counts.recheck
                    })}
                  </p>
                  {overview.writable ? (
                    <Button
                      disabled={busy || c.expired || Boolean(c.unavailable)}
                      onClick={() => {
                        if (canLeave()) void run(() => select(c.id))
                      }}
                    >
                      {t('invitations-real.campaign.open')}
                    </Button>
                  ) : null}
                </Card>
              ))}
              {!overview.campaigns.length && !campaign ? <p>{t('invitations-real.campaign.empty')}</p> : null}
            </div>
          ) : null}
          {tab === 'Import' && overview.writable ? (
            <RealImportPanel
              key={campaign?.id ?? 'new'}
              campaign={campaign}
              busy={busy}
              run={run}
              onImported={(c) => {
                setCampaign(c)
                setOverview(
                  (o) => o && { ...o, campaigns: [c, ...o.campaigns.filter((old) => old.id !== c.id)] }
                )
                setTab('Overview')
              }}
            />
          ) : null}
          {tab === 'Recipients' && campaign && overview.writable ? (
            <RealRecipients
              page={page}
              detail={detail}
              groups={groups}
              {...filter}
              busy={busy}
              onFilter={(field, value) => {
                if (canLeave()) {
                  dirty.current = false
                  setFilter((f) => ({ ...f, [field]: value }))
                }
              }}
              onSelect={(id) => void run(() => loadDetail(id))}
              onReview={() => {
                setReviewTarget(detail?.id ?? null)
                changeTab('Review content')
              }}
              onNext={() =>
                void run(async () => {
                  const token = ++query.current,
                    gen = generation.current
                  const next = await realRequest<Page<RecipientSummary>>({
                    path: `/campaigns/${campaign.id}/recipients/query`,
                    method: 'POST',
                    body: {
                      group: filter.group || null,
                      state: filter.state || null,
                      search: filter.search,
                      cursor: page?.nextCursor,
                      limit: 100
                    }
                  })
                  if (alive.current && token === query.current && gen === generation.current) {
                    setPage(next)
                    setDetail(null)
                  }
                })
              }
            />
          ) : null}
          {tab === 'Review content' && campaign && overview.writable ? (
            <RealReviewWorkspace
              key={campaign.id}
              campaign={campaign}
              groups={groups}
              registry={registry}
              busy={busy}
              run={run}
              write={write}
              onDirty={(v) => {
                dirty.current = v
              }}
              canLeave={canLeave}
              onError={failure}
              onOpenTemplates={() => changeTab('Content / Templates')}
              initialRecipientId={reviewTarget}
            />
          ) : null}
          {tab === 'Send' && campaign && overview.writable ? (
            <RealSendPanel
              key={campaign.id}
              campaign={campaign}
              groups={groups}
              sending={sending}
              busy={busy}
              run={run}
              onSendingChanged={() => void loadSending(campaign.id).catch(() => {})}
              onReview={(id) => {
                setReviewTarget(id)
                changeTab('Review content')
              }}
            />
          ) : null}
          {tab === 'Conversations' && campaign && overview.writable ? (
            <Card className="gap-2 p-4" data-conversations>
              <h2 className="font-semibold">{t('invitations-real.campaign.tab.conversations')}</h2>
              <p className="text-sm">
                {t('invitations-real.campaign.conversations', {
                  mailbox: sending?.mailbox.address ?? t('invitations-real.common.invitationsMailbox')
                })}
              </p>
            </Card>
          ) : null}
          {tab === 'Fields' && campaign && overview.writable ? (
            registry ? (
              <RealFieldsPanel
                key={`${campaign.id}:${registry.revision}`}
                registry={registry}
                headers={headers}
                groups={groups}
                busy={busy}
                write={write}
                onDirty={(v) => {
                  dirty.current = v
                }}
                onSaved={() => loadRegistry()}
              />
            ) : (
              <p>{t('invitations-real.campaign.readingFields')}</p>
            )
          ) : null}
          {tab === 'Content / Templates' && campaign && overview.writable ? (
            <RealContentPanel
              key={campaign.id}
              campaign={campaign}
              groups={groups}
              busy={busy}
              run={run}
              write={write}
              onDirty={(v) => {
                dirty.current = v
              }}
              onError={failure}
              onConfigure={() => changeTab('Fields')}
            />
          ) : null}
          {tab === 'Setup' && overview.writable ? <RealMailFormatPanel busy={busy} run={run} /> : null}
          {tab === 'Setup' && overview.writable ? (
            <RealRetentionPanel
              campaign={campaign}
              write={write}
              onExtended={(expiresAt) => setCampaign((c) => c && { ...c, expiresAt })}
              busy={busy}
              run={run}
              onError={failure}
              onDirty={(v) => {
                dirty.current = v
              }}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
