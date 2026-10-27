import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea
} from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { formatDateTime, useT } from '../i18n'
import type { InvitationsKey } from '../i18n/ns/invitations'
import { type Campaign, type GmailStatus, type Overview, type Preview, request, sampleCsv } from './api'
import { ContentPanel } from './ContentPanel'
import { ConversationPanel, ReviewPanel } from './EmailPanels'
import { simulationReason, visibleRecipients } from './review-state'
import { RealCampaign } from './RealCampaign'

const TABS = [
  'overview',
  'import',
  'recipients',
  'content',
  'review',
  'conversations',
  'activity',
  'setup'
] as const
type Tab = (typeof TABS)[number]
const tabLabel = (tab: Tab) => `invitations.tab.${tab}` as const

export function Invitations() {
  const t = useT()
  const [mode, setMode] = useState<'sandbox' | 'real'>('sandbox')
  function choose(next: 'sandbox' | 'real') {
    if (next === mode) return
    if (!window.dispatchEvent(new Event('tracy:before-ops-navigation', { cancelable: true }))) return
    setMode(next)
  }
  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pt-4 md:px-6">
        <Button variant={mode === 'sandbox' ? 'default' : 'outline'} onClick={() => choose('sandbox')}>
          {t('invitations.mode.sandbox')}
        </Button>
        <Button variant={mode === 'real' ? 'default' : 'outline'} onClick={() => choose('real')}>
          {t('invitations.mode.real')}
        </Button>
      </div>
      {mode === 'real' ? <RealCampaign /> : <SandboxInvitations />}
    </>
  )
}

function SandboxInvitations() {
  const t = useT()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [gmail, setGmail] = useState<GmailStatus | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [name, setName] = useState('Sandbox invitations')
  const [csv, setCsv] = useState('')
  const [fileError, setFileError] = useState<InvitationsKey | ''>('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [group, setGroup] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editorEpoch, setEditorEpoch] = useState(0)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const recipients = campaign?.recipients ?? []
  const recipient = recipients.find((r) => r.id === selected)
  const view = tab === 'review' ? 'review' : tab === 'conversations' ? 'conversations' : 'recipients'
  const visible = visibleRecipients(recipients, view, group, status, search)
  function canLeave() {
    return !dirtyRef.current || window.confirm(t('invitations.page.confirmDiscard'))
  }
  function changeView(next: Tab) {
    if (next === tab || !canLeave()) return
    setDirty(false)
    setSelected(null)
    setGroup('')
    setStatus('')
    setSearch('')
    setTab(next)
  }
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const navigate = (event: Event) => {
      if (!canLeave()) event.preventDefault()
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('tracy:before-ops-navigation', navigate)
    return () => {
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('tracy:before-ops-navigation', navigate)
    }
  }, [])

  async function refresh() {
    const next = await request<Overview>()
    setOverview(next)
    if (next.enabled && next.writable) setGmail(await request<GmailStatus>('/gmail'))
    if (campaign) {
      setCampaign(await request<Campaign>(`/${campaign.id}`))
      setEditorEpoch((value) => value + 1)
      setDirty(false)
    }
  }
  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t('invitations.request.failed'))
      return false
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('gmail')
    void run(refresh).then(() => {
      if (result) {
        setNotice(
          result === 'connected'
            ? t('invitations.notice.gmailVerified')
            : t('invitations.notice.gmailResult', { result })
        )
        window.history.replaceState(window.history.state, '', window.location.pathname)
        setTab('setup')
      }
    })
  }, [])
  async function mutate(path: string, body: object = {}) {
    if (!campaign) return
    const next = await request<Campaign>(`/${campaign.id}${path}`, { revision: campaign.revision, ...body })
    setCampaign(next)
    setPreview(null)
    setOverview((current) =>
      current
        ? {
            ...current,
            campaigns: current.campaigns.map((row) =>
              row.id === next.id
                ? { ...row, name: next.name, revision: next.revision, counts: next.counts }
                : row
            )
          }
        : current
    )
    setNotice(t('invitations.notice.saved'))
  }
  async function edit(path: string, body: object = {}) {
    const saved = await run(() => mutate(path, body))
    if (!saved) throw new Error(t('invitations.notice.notSaved'))
    setDirty(false)
  }
  const writable = overview?.enabled && overview.writable && !busy
  const runReason = simulationReason(recipients, Boolean(overview?.writable), busy, dirty)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('invitations.page.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('invitations.page.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (canLeave()) void run(refresh)
          }}
        >
          {t('invitations.page.refresh')}
        </Button>
      </div>
      <Card className="gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t('invitations.mode.sandbox')}</Badge>
          <span className="text-sm">{t('invitations.page.sandboxNotice')}</span>
        </div>
        <p className="text-muted-foreground text-sm">{t('invitations.page.sandboxHint')}</p>
      </Card>
      {error ? (
        <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">
          {t('invitations.page.errorBanner', { error })}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {!overview ? (
        <p role="status">{t('invitations.page.loading')}</p>
      ) : !overview.enabled ? (
        <Card className="p-4">{t('invitations.page.disabled')}</Card>
      ) : (
        <>
          {!overview.writable ? (
            <p className="text-muted-foreground text-sm">{t('invitations.page.readOnly')}</p>
          ) : null}
          <div className="flex flex-wrap gap-2" aria-label={t('invitations.page.campaignsLabel')}>
            {overview.campaigns.map((item) =>
              overview.writable ? (
                <Button
                  key={item.id}
                  variant={campaign?.id === item.id ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => {
                    if (!canLeave()) return
                    void run(async () => {
                      setCampaign(await request<Campaign>(`/${item.id}`))
                      setEditorEpoch((value) => value + 1)
                      setDirty(false)
                      setPreview(null)
                      setSelected(null)
                    })
                  }}
                >
                  {item.name ?? t('invitations.campaign.fallbackName')}
                </Button>
              ) : (
                <Card key={item.id} className="gap-2 p-4">
                  <span className="font-mono text-xs">
                    {t('invitations.campaign.idLabel', { id: item.id.slice(0, 8) })}
                  </span>
                  {Object.entries(item.counts).map(([key, value]) => (
                    <p key={key} className="text-sm">
                      {key}: {value}
                    </p>
                  ))}
                </Card>
              )
            )}
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!canLeave()) return
              void run(async () => {
                const created = await request<Campaign>('', { name })
                setCampaign(created)
                setDirty(false)
                setOverview(await request<Overview>())
                setTab('import')
                setPreview(null)
                setSelected(null)
              })
            }}
          >
            <div className="grid min-w-56 gap-1">
              <Label htmlFor="campaign-name">{t('invitations.campaign.nameLabel')}</Label>
              <Input
                id="campaign-name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                disabled={!writable}
              />
            </div>
            <Button type="submit" disabled={!writable || !name.trim()}>
              {t('invitations.campaign.create')}
            </Button>
          </form>
          <div
            className="flex flex-wrap gap-1 border-border border-b pb-2"
            aria-label={t('invitations.page.viewsLabel')}
          >
            {TABS.map((item) => (
              <Button
                key={item}
                variant={tab === item ? 'secondary' : 'ghost'}
                aria-pressed={tab === item}
                disabled={busy}
                onClick={() => changeView(item)}
              >
                {t(tabLabel(item))}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">{t('invitations.page.steps')}</p>
          {tab === 'setup' ? (
            <div className="grid gap-3">
              <Card className="gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{t('invitations.setup.gmailTitle')}</h2>
                  <Badge variant="outline">
                    {(gmail?.status ?? overview.integrations.gmail).replaceAll('_', ' ')}
                  </Badge>
                </div>
                <p className="text-sm">
                  {t('invitations.setup.requiredMailbox', {
                    mailbox: t('invitations-real.common.invitationsMailbox'),
                    sender: 'Sarah'
                  })}
                </p>
                {overview.writable ? (
                  <>
                    <p className="text-sm">
                      {t('invitations.setup.address', {
                        address: gmail?.address ?? t('invitations.setup.notVerified')
                      })}
                    </p>
                    <p className="text-sm">
                      {t('invitations.setup.access', {
                        read: t(gmail?.read ? 'invitations.setup.verified' : 'invitations.setup.blocked'),
                        send: t(gmail?.send ? 'invitations.setup.verified' : 'invitations.setup.blocked')
                      })}
                    </p>
                    <p className="text-sm">
                      {t('invitations.setup.generation', {
                        generation: gmail?.generation ?? 0,
                        when: gmail?.lastVerifiedAt
                          ? formatDateTime(gmail.lastVerifiedAt)
                          : t('invitations.setup.never')
                      })}
                    </p>
                    <p className="text-sm">
                      {t('invitations.setup.lastSync', {
                        when: gmail?.lastSyncAt
                          ? formatDateTime(gmail.lastSyncAt)
                          : t('invitations.setup.never')
                      })}
                    </p>
                    {gmail?.errorCode ? (
                      <p role="alert" className="text-sm">
                        {t('invitations.setup.connectionError', { code: gmail.errorCode })}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busy || !gmail?.configured}
                        onClick={() =>
                          void run(async () => {
                            const result = await request<{ authorizationUrl: string }>('/gmail/connect', {})
                            window.location.assign(result.authorizationUrl)
                          })
                        }
                      >
                        {t(
                          gmail?.status === 'connected'
                            ? 'invitations.setup.reconnect'
                            : 'invitations.setup.connect'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          busy || !gmail || !['connected', 'reconnect_required'].includes(gmail.status)
                        }
                        onClick={() =>
                          void run(async () => {
                            const result = await request<GmailStatus & { revocation: string }>(
                              '/gmail/disconnect',
                              {}
                            )
                            setGmail(result)
                            setOverview(await request<Overview>())
                            setNotice(
                              result.revocation === 'succeeded'
                                ? t('invitations.notice.disconnected')
                                : t('invitations.notice.disconnectedLocally', { result: result.revocation })
                            )
                          })
                        }
                      >
                        {t('invitations.setup.disconnect')}
                      </Button>
                    </div>
                    {!gmail?.configured ? (
                      <p className="text-muted-foreground text-sm">{t('invitations.setup.notConfigured')}</p>
                    ) : null}
                    <p className="break-all text-muted-foreground text-xs">
                      {t('invitations.setup.redirectUri', { uri: gmail?.redirectUri ?? '' })}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('invitations.setup.ownerManages')}</p>
                )}
                <p className="text-muted-foreground text-sm">{t('invitations.setup.connectingNote')}</p>
              </Card>
              <Card className="gap-3 p-4">
                <h2 className="font-semibold">{t('invitations.setup.sourcesTitle')}</h2>
                {(['aMember', 'Sendy'] as const).map((source) => (
                  <div key={source} className="flex justify-between gap-3">
                    <span>{source}</span>
                    <Badge variant="outline">{t('invitations.setup.notConnected')}</Badge>
                  </div>
                ))}
                <p className="text-muted-foreground text-sm">{t('invitations.setup.sourcesNote')}</p>
              </Card>
              <Card className="gap-2 p-4">
                <h2 className="font-semibold">{t('invitations.setup.readinessTitle')}</h2>
                <p className="text-sm">{t('invitations.setup.readinessBlocked')}</p>
                <p className="text-muted-foreground text-sm">{t('invitations.setup.quotaNote')}</p>
              </Card>
            </div>
          ) : !campaign ? (
            <p className="text-muted-foreground">{t('invitations.page.empty')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{campaign.name}</h2>
                <Badge variant="outline">
                  {t('invitations.campaign.revision', { revision: campaign.revision })}
                </Badge>
              </div>
              {tab === 'overview' ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {Object.entries(campaign.counts ?? {}).map(([key, count]) => (
                    <Card key={key} className="gap-1 p-4">
                      <span className="text-muted-foreground text-sm">{key}</span>
                      <strong className="text-2xl">{count}</strong>
                    </Card>
                  ))}
                  <p className="text-muted-foreground text-sm sm:col-span-3">
                    {t('invitations.campaign.overviewHint')}
                  </p>
                </div>
              ) : null}
              {tab === 'import' ? (
                <Card className="gap-3 p-4">
                  <h3 className="font-semibold">{t('invitations.import.title')}</h3>
                  <p className="text-sm">{t('invitations.import.csvPurpose')}</p>
                  <p className="text-muted-foreground text-sm">{t('invitations.import.limits')}</p>
                  <p className="text-muted-foreground text-sm">{t('invitations.import.localOnly')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!writable}
                      onClick={() => {
                        setCsv(sampleCsv())
                        setFileError('')
                        setPreview(null)
                      }}
                    >
                      {t('invitations.import.useSample')}
                    </Button>
                    <Label htmlFor="sandbox-csv-file" className="self-center">
                      {t('invitations.import.chooseFile')}
                    </Label>
                    <Input
                      id="sandbox-csv-file"
                      type="file"
                      accept=".csv,text/csv"
                      disabled={!writable}
                      className="max-w-xs"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const input = e.currentTarget
                        setCsv('')
                        setPreview(null)
                        setFileError('')
                        if (file.size > 512 * 1024) {
                          input.value = ''
                          setFileError('invitations.import.tooLarge')
                          return
                        }
                        void run(async () => {
                          try {
                            setCsv(await file.text())
                          } catch {
                            input.value = ''
                            setFileError('invitations.import.unreadable')
                          }
                        })
                      }}
                    />
                  </div>
                  {fileError ? (
                    <p role="alert" className="text-destructive text-sm">
                      {t(fileError)}
                    </p>
                  ) : null}
                  <Label htmlFor="sandbox-csv">{t('invitations.import.csvContent')}</Label>
                  <Textarea
                    id="sandbox-csv"
                    className="min-h-44 font-mono text-xs"
                    value={csv}
                    disabled={!writable}
                    onChange={(e) => {
                      setCsv(e.target.value)
                      setPreview(null)
                    }}
                  />
                  <Button
                    disabled={!writable || !csv}
                    onClick={() =>
                      void run(async () => {
                        setPreview(
                          await request<Preview>(`/${campaign.id}/preview`, {
                            revision: campaign.revision,
                            csv
                          })
                        )
                      })
                    }
                  >
                    {t('invitations.import.preview')}
                  </Button>
                  {preview ? (
                    <>
                      {preview.readOnly ? (
                        <div role="status" className="text-sm">
                          {t('invitations.import.localInspection')}
                          <p>
                            {t('invitations.import.mapping', {
                              mapping: Object.entries(preview.mapping ?? {})
                                .map(([source, target]) => `${source} → ${target}`)
                                .join(', ')
                            })}
                          </p>
                          <p>
                            {t('invitations.import.ignored', {
                              columns: preview.ignoredColumns?.join(', ') ?? ''
                            })}
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(preview.counts).map(([key, value]) => (
                          <Badge variant="outline" key={key}>
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                      <p className="break-all font-mono text-muted-foreground text-xs">
                        {t('invitations.import.digest', { digest: preview.digest })}
                      </p>
                      <div className="max-h-60 overflow-auto">
                        {preview.candidates.map((item, i) => (
                          <p className="text-sm" key={i}>
                            {item.normalizedEmail} · {item.sourceGroup} · {item.state}
                          </p>
                        ))}
                        {preview.issues.map((issue, i) => (
                          <p className="text-sm" key={`issue-${i}`}>
                            {t('invitations.import.issue', { row: issue.row, code: issue.code })}
                          </p>
                        ))}
                      </div>
                      <Button
                        disabled={!writable || preview.readOnly}
                        onClick={() =>
                          void run(async () => {
                            await mutate('/commit', { previewId: preview.id, digest: preview.digest })
                            setTab('recipients')
                          })
                        }
                      >
                        {t('invitations.import.commit')}
                      </Button>
                    </>
                  ) : null}
                </Card>
              ) : null}
              {tab === 'content' ? (
                <ContentPanel
                  key={`${campaign.id}-${editorEpoch}`}
                  campaign={campaign}
                  groups={overview.groups}
                  writable={Boolean(overview.writable)}
                  busy={busy}
                  onDirty={setDirty}
                  onSave={(group, subject, bodyText) => edit('/content', { group, subject, bodyText })}
                  onPreview={(group, recipientId) =>
                    request(`/${campaign.id}/content-preview`, {
                      revision: campaign.revision,
                      group,
                      recipientId
                    })
                  }
                  onGenerate={async (group, replaceExisting) => {
                    await edit('/generate', { group, replaceExisting })
                    setGroup(group ?? '')
                    setStatus('')
                    setSearch('')
                    setSelected(null)
                    setTab('review')
                  }}
                />
              ) : null}
              {tab === 'recipients' || tab === 'review' || tab === 'conversations' ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-lg">{t(tabLabel(tab))}</h2>
                      <p className="text-muted-foreground text-sm">
                        {t(
                          tab === 'conversations'
                            ? 'invitations.list.hintConversations'
                            : tab === 'review'
                              ? 'invitations.list.hintReview'
                              : 'invitations.list.hintRecipients'
                        )}
                      </p>
                    </div>
                    {tab !== 'conversations' ? (
                      <div className="grid max-w-sm gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" disabled={busy} onClick={() => changeView('content')}>
                            {t('invitations.list.openTemplates')}
                          </Button>
                          <Button
                            disabled={Boolean(runReason)}
                            aria-describedby="sandbox-run-reason"
                            onClick={() => void run(() => mutate('/simulate'))}
                          >
                            {t('invitations.list.runSandbox')}
                          </Button>
                        </div>
                        <p id="sandbox-run-reason" className="text-muted-foreground text-xs">
                          {t(runReason || 'invitations.list.runHint')}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-1">
                      <Label htmlFor="review-group">{t('invitations.list.group')}</Label>
                      <NativeSelect
                        id="review-group"
                        value={group}
                        disabled={busy}
                        onChange={(e) => {
                          if (canLeave()) {
                            setDirty(false)
                            setSelected(null)
                            setGroup(e.target.value)
                          }
                        }}
                      >
                        <NativeSelectOption value="">{t('invitations.list.allGroups')}</NativeSelectOption>
                        {overview.groups.map((g) => (
                          <NativeSelectOption key={g.key} value={g.key}>
                            {g.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="review-status">{t('invitations.list.status')}</Label>
                      <NativeSelect
                        id="review-status"
                        value={status}
                        disabled={busy}
                        onChange={(e) => {
                          if (canLeave()) {
                            setDirty(false)
                            setSelected(null)
                            setStatus(e.target.value)
                          }
                        }}
                      >
                        <NativeSelectOption value="">{t('invitations.list.allStatuses')}</NativeSelectOption>
                        <NativeSelectOption value="needs_review">
                          {t('invitations.list.needsApproval')}
                        </NativeSelectOption>
                        <NativeSelectOption value="approved">
                          {t('invitations.list.approved')}
                        </NativeSelectOption>
                        <NativeSelectOption value="suppressed">
                          {t('invitations.list.suppressed')}
                        </NativeSelectOption>
                        <NativeSelectOption value="simulated">
                          {t('invitations.list.simulated')}
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="review-search">{t('invitations.list.find')}</Label>
                      <Input
                        id="review-search"
                        value={search}
                        disabled={busy || dirty}
                        onChange={(e) => {
                          setSelected(null)
                          setSearch(e.target.value)
                        }}
                        placeholder={t('invitations.list.searchPlaceholder')}
                      />
                    </div>
                    <p className="py-2 text-muted-foreground text-sm">
                      {t('invitations.list.count', { visible: visible.length, count: recipients.length })}
                      {dirty ? ` · ${t('invitations.list.saveBeforeSearch')}` : ''}
                    </p>
                  </div>
                  <div className="grid items-start gap-4 xl:grid-cols-2">
                    <div className="min-w-0 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('invitations.list.recipient')}</TableHead>
                            <TableHead>{t('invitations.list.group')}</TableHead>
                            <TableHead>{t('invitations.list.status')}</TableHead>
                            <TableHead>{t('invitations.list.draft')}</TableHead>
                            <TableHead>{t('invitations.list.open')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visible.map((r) => (
                            <TableRow key={r.id} data-state={selected === r.id ? 'selected' : undefined}>
                              <TableCell>{r.email}</TableCell>
                              <TableCell>{r.group}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{r.state}</Badge>
                              </TableCell>
                              <TableCell>
                                {t(
                                  r.draft
                                    ? r.draft.approved
                                      ? 'invitations.list.approvedSnapshot'
                                      : 'invitations.list.needsApproval'
                                    : 'invitations.list.noDraft'
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    if (selected !== r.id && canLeave()) {
                                      setDirty(false)
                                      setSelected(r.id)
                                    }
                                  }}
                                >
                                  {t('invitations.list.open')}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {recipient ? (
                      tab === 'conversations' ? (
                        <ConversationPanel
                          key={`${recipient.id}-${campaign.revision}-${editorEpoch}`}
                          recipient={recipient}
                          writable={Boolean(overview.writable)}
                          busy={busy}
                          onDirty={setDirty}
                          onMessage={(bodyText, direction) =>
                            edit(`/recipients/${recipient.id}/message`, { bodyText, direction })
                          }
                        />
                      ) : (
                        <ReviewPanel
                          key={`${recipient.id}-${campaign.revision}-${editorEpoch}`}
                          recipient={recipient}
                          writable={Boolean(overview.writable)}
                          busy={busy}
                          onDirty={setDirty}
                          onSave={(subject, bodyText) =>
                            edit(`/recipients/${recipient.id}/draft`, { subject, bodyText })
                          }
                          onApprove={() =>
                            edit(`/recipients/${recipient.id}/approve`, {
                              contentHash: recipient.draft?.contentHash
                            })
                          }
                        />
                      )
                    ) : (
                      <Card className="p-6 text-muted-foreground text-sm">
                        {t(
                          !visible.length
                            ? tab === 'conversations'
                              ? 'invitations.list.emptyConversations'
                              : tab === 'review'
                                ? 'invitations.list.emptyReview'
                                : 'invitations.list.emptyRecipients'
                            : 'invitations.list.selectHint'
                        )}
                      </Card>
                    )}
                  </div>
                </>
              ) : null}
              {tab === 'activity' ? (
                <Card className="gap-2 p-4">
                  <h3 className="font-semibold">{t('invitations.activity.title')}</h3>
                  {campaign.audit?.length ? (
                    campaign.audit.map((event, i) => (
                      <p className="text-sm" key={i}>
                        {event.action} · {event.createdAt}
                      </p>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">{t('invitations.activity.empty')}</p>
                  )}
                </Card>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
