/**
 * `/ops/mail` — mail sent by customer sites after go-live (`tasks/todo-mail-site-khach.md`).
 *
 * Three questions, top to bottom: is site mail on for this deployment and how much of today's cap
 * is gone; which site sends how, and how much, with its limits editable in place; what happened to
 * the last messages. A site ADMIN chooses the mode from My Sites; ops can override it here and is
 * the only one who changes limits (for instance lifting one busy site above the default).
 *
 * 🔒 EMPTY IS HONEST. Every number is the door's; one the door did not send is a dash. When site
 * mail is off (`SITE_MAIL=off`) the screen says so above everything else, and `log` mode says
 * "nothing is sent" in the status itself — a table of "sent today" counts under a relay that sends
 * nothing would otherwise read as delivered mail.
 *
 * 🔒 WRITES FOLLOW THE DOOR'S VERDICT. `writable` comes from the mail door if it says, else from
 * `/api/ops/me` — the same `['owner','admin']` rule every write door here answers. Unknown = read-only.
 *
 * `/api/ops/mail`, NOT `/api/mail` — same reason as `Widget.tsx`: a leading `/` fetch ignores this
 * build's `base: '/ops/'`, so the path names the door itself.
 *
 * OWN DOMAINS SHARE ONE RESEND ACCOUNT. Its plan holds a handful (Tracy's own sending domains
 * included), so the screen shows how many slots are used, when each waiting domain will be released
 * by the clock, and lets staff release one. Tracy deletes on Resend only what it created there; a
 * domain someone added by hand is detached from the site and left on the account.
 *
 * `fetchImpl` exists for the design bench, which has no tracy-web behind it; the app never passes it.
 */
import { Badge, Button, Card, Input, NativeSelect, NativeSelectOption, Skeleton, cn } from '@tracy/ui'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { formatDateTime, Trans, tr, useT } from './i18n'
import {
  codeKey,
  type DomainSlots,
  editBody,
  editFrom,
  fetchMailLog,
  fetchOpsMail,
  fetchWritable,
  limitInput,
  type MailLogEntry,
  MODE_KEY,
  type OpsMail,
  type OpsMailSite,
  putSiteMail,
  RELAY_KEY,
  releaseSiteDomain,
  SITE_MAIL_MODES,
  type SiteEdit,
  type SiteMailMode,
  slotsFull
} from './mail-api'

const DASH = '—'
const LOG_LIMIT = 50

/** Words for a refusal, in the language on screen when it happened. */
function refusalText(status: number, code: string | null): string {
  if (status === 0) return tr('mail.refusal.noAnswer')
  if (status === 401) return tr('mail.refusal.signedOut')
  if (status === 403) return tr('mail.refusal.forbidden')
  const said = codeKey(code)
  if (said) return tr(said)
  if (status === 404) return tr('mail.refusal.noDoor')
  return code ? tr('mail.refusal.code', { code }) : tr('mail.refusal.status', { status })
}

function when(iso: string | null): string {
  if (!iso) return DASH
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : formatDateTime(d)
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-semibold text-base">{value}</span>
      {sub}
    </Card>
  )
}

/** Today's use of the shared cap. No bar when either number is missing — a bar needs both. */
function CapStat({ used, cap }: { used: number | null; cap: number | null }) {
  const t = useT()
  const share = used !== null && cap !== null && cap > 0 ? Math.min(1, used / cap) : null
  return (
    <Stat
      label={t('mail.stat.sentToday')}
      value={t('mail.stat.of', { used: used ?? DASH, limit: cap ?? DASH })}
      sub={
        share === null ? null : (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={cn('h-full rounded-full', share >= 1 ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
        )
      }
    />
  )
}

/** Own-domain slots on the shared Resend account; says "full" in words, not only as a number. */
function SlotStat({ slots }: { slots: DomainSlots | null }) {
  const t = useT()
  const full = slotsFull(slots)
  return (
    <Stat
      label={t('mail.stat.slots')}
      value={t('mail.stat.of', { used: slots?.used ?? DASH, limit: slots?.limit ?? DASH })}
      sub={
        full ? (
          <span className="text-destructive text-xs">{t('mail.stat.slotsFull')}</span>
        ) : (
          <span className="text-muted-foreground text-xs">{t('mail.stat.slotsCount')}</span>
        )
      }
    />
  )
}

export function Mail({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const t = useT()
  const doFetch = fetchImpl ?? fetch
  const [data, setData] = useState<OpsMail | null>(null)
  const [error, setError] = useState('')
  const [writable, setWritable] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const answer = await fetchOpsMail(doFetch)
    if (answer.ok) {
      setData(answer.value)
      setError('')
    } else setError(refusalText(answer.status, answer.code))
  }, [doFetch])

  useEffect(() => {
    void load()
    void fetchWritable(doFetch).then(setWritable)
  }, [load, doFetch])

  const canWrite = (data?.writable ?? writable) === true

  return (
    <div className="mx-auto min-w-0 max-w-6xl px-8 py-7">
      <h1 className="font-semibold text-xl tracking-tight">{t('mail.title')}</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{t('mail.lead')}</p>

      {error ? (
        <p role="status" className="mt-6 text-sm">
          {error}
        </p>
      ) : !data ? (
        <Skeleton className="mt-6 h-40 w-full" />
      ) : (
        <>
          {!data.enabled && (
            <p role="status" className="mt-5 rounded-md border border-border bg-muted px-4 py-3 text-sm">
              <Trans i18nKey="mail.off" components={{ code: <code /> }} />
            </p>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('mail.stat.siteMail')} value={data.mode ? t(RELAY_KEY[data.mode]) : DASH} />
            <Stat label={t('mail.stat.sendingDomain')} value={data.domain ?? t('mail.stat.notSet')} />
            <CapStat used={data.usedToday} cap={data.globalDaily} />
            <SlotStat slots={data.domainSlots} />
          </div>

          <SitesTable data={data} canWrite={canWrite} fetchImpl={doFetch} onSaved={() => void load()} />
          <LogView sites={data.sites} fetchImpl={doFetch} />
        </>
      )}
    </div>
  )
}

function SitesTable({
  data,
  canWrite,
  fetchImpl,
  onSaved
}: {
  data: OpsMail
  canWrite: boolean
  fetchImpl: typeof fetch
  onSaved: () => void
}) {
  const t = useT()
  return (
    <section className="mt-8">
      <h2 className="font-semibold text-base">{t('mail.sites.title')}</h2>
      <p className="mt-1 text-muted-foreground text-xs">
        {t('mail.sites.limits')}
        {data.domainPendingDays !== null
          ? ` ${t('mail.sites.releaseAfter', { days: data.domainPendingDays })}`
          : ''}
        {canWrite ? '' : ` ${t('mail.sites.readOnly')}`}
      </p>
      {data.sites.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-sm">{t('mail.sites.empty')}</p>
      ) : (
        <Card className="mt-3 gap-0 overflow-x-auto p-0">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b text-left text-muted-foreground text-xs">
                <th className="px-4 py-2.5 font-medium">{t('mail.col.site')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.col.mode')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.col.from')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('mail.col.sentToday')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.col.hourly')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.col.daily')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.col.domain')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.col.lastError')}</th>
                <th className="px-3 py-2.5">
                  <span className="sr-only">{t('mail.col.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.sites.map((site) => (
                <SiteRow
                  key={site.siteKey}
                  site={site}
                  canWrite={canWrite}
                  fetchImpl={fetchImpl}
                  onSaved={onSaved}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}

function SiteRow({
  site,
  canWrite,
  fetchImpl,
  onSaved
}: {
  site: OpsMailSite
  canWrite: boolean
  fetchImpl: typeof fetch
  onSaved: () => void
}) {
  const t = useT()
  const [edit, setEdit] = useState<SiteEdit | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // Two presses, no browser dialog: the first arms the button, the second releases.
  const [confirmRelease, setConfirmRelease] = useState(false)
  const body = edit ? editBody(site, edit) : null
  const invalid =
    edit !== null && (limitInput(edit.hourly) === 'invalid' || limitInput(edit.daily) === 'invalid')

  async function save() {
    if (!body) return
    setBusy(true)
    setMessage('')
    const answer = await putSiteMail(site.siteKey, body, fetchImpl)
    setBusy(false)
    if (!answer.ok) {
      setMessage(refusalText(answer.status, answer.code))
      return
    }
    setEdit(null)
    onSaved()
  }

  async function release() {
    setBusy(true)
    setMessage('')
    const answer = await releaseSiteDomain(site.siteKey, fetchImpl)
    setBusy(false)
    setConfirmRelease(false)
    if (!answer.ok) {
      setMessage(refusalText(answer.status, answer.code))
      return
    }
    onSaved()
  }

  const released = site.domainStatus === 'expired'

  const limitCell = (key: 'hourly' | 'daily') =>
    edit ? (
      <Input
        aria-label={t(key === 'hourly' ? 'mail.limit.hourly' : 'mail.limit.daily', { site: site.siteKey })}
        className="h-8 w-20"
        inputMode="numeric"
        placeholder={t('mail.limit.placeholder')}
        value={edit[key]}
        disabled={busy}
        onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
      />
    ) : (
      <span className="tabular-nums">{site[key] ?? DASH}</span>
    )

  return (
    <tr className="border-border border-b align-top last:border-0">
      <td className="px-4 py-3">
        <span className="font-medium">{site.label ?? site.siteKey}</span>
        {site.label !== null && site.label !== site.siteKey && (
          <span className="block text-muted-foreground text-xs">{site.siteKey}</span>
        )}
      </td>
      <td className="px-3 py-3">
        {edit ? (
          <NativeSelect
            aria-label={t('mail.modeFor', { site: site.siteKey })}
            value={edit.mode ?? ''}
            disabled={busy}
            onChange={(e) => setEdit({ ...edit, mode: e.target.value as SiteMailMode })}
          >
            {edit.mode === null && <NativeSelectOption value="">{DASH}</NativeSelectOption>}
            {SITE_MAIL_MODES.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {t(MODE_KEY[m])}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : site.mode ? (
          <Badge variant={site.mode === 'off' ? 'outline' : 'secondary'}>{t(MODE_KEY[site.mode])}</Badge>
        ) : (
          DASH
        )}
      </td>
      <td className="px-3 py-3">
        <span className="break-all font-mono text-[12px]">{site.fromAddress ?? DASH}</span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{site.sentToday ?? DASH}</td>
      <td className="px-3 py-3">{limitCell('hourly')}</td>
      <td className="px-3 py-3">{limitCell('daily')}</td>
      <td className="px-3 py-3">
        {site.domain ? (
          <>
            <span className="[overflow-wrap:anywhere]">{site.domain}</span>
            <span className="block text-muted-foreground text-xs">{site.domainStatus ?? DASH}</span>
            {released ? (
              <span className="block text-muted-foreground text-xs">
                {t('mail.domain.released', { when: when(site.domainReleasedAt) })}
              </span>
            ) : (
              <>
                {site.domainPendingSince && site.domainStatus !== 'verified' && (
                  <span className="block text-muted-foreground text-xs">
                    {t('mail.domain.waiting', { when: when(site.domainPendingSince) })}
                  </span>
                )}
                {site.domainReleaseAt && (
                  <span className="block text-muted-foreground text-xs">
                    {t('mail.domain.releaseAt', { when: when(site.domainReleaseAt) })}
                  </span>
                )}
                {site.domainOwned === false && (
                  <span className="block text-muted-foreground text-xs">{t('mail.domain.notOurs')}</span>
                )}
              </>
            )}
            {canWrite && !edit && (
              <Button
                size="sm"
                variant={confirmRelease ? 'destructive' : 'ghost'}
                className="mt-1 h-7 px-2"
                disabled={busy}
                onBlur={() => setConfirmRelease(false)}
                onClick={() => (confirmRelease ? void release() : setConfirmRelease(true))}
              >
                {busy
                  ? t('mail.domain.releasing')
                  : confirmRelease
                    ? t('mail.domain.confirmRelease')
                    : t('mail.domain.release')}
              </Button>
            )}
          </>
        ) : (
          DASH
        )}
      </td>
      <td className="max-w-[16rem] px-3 py-3">
        {site.lastError ? (
          <span className="break-words text-destructive text-xs">{site.lastError}</span>
        ) : (
          DASH
        )}
        {message && (
          <p role="alert" className="mt-1 text-destructive text-xs">
            {message}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right">
        {edit ? (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit(null)}>
              {t('mail.cancel')}
            </Button>
            <Button size="sm" disabled={busy || invalid || body === null} onClick={() => void save()}>
              {busy ? t('mail.saving') : t('mail.save')}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!canWrite}
            title={canWrite ? undefined : t('mail.editNotAllowed')}
            onClick={() => {
              setMessage('')
              setEdit(editFrom(site))
            }}
          >
            {t('mail.edit')}
          </Button>
        )}
      </td>
    </tr>
  )
}

function LogView({ sites, fetchImpl }: { sites: OpsMailSite[]; fetchImpl: typeof fetch }) {
  const t = useT()
  const [siteKey, setSiteKey] = useState<string>('')
  const [rows, setRows] = useState<MailLogEntry[] | null>(null)
  const [error, setError] = useState('')

  const read = useCallback(async () => {
    setRows(null)
    setError('')
    const answer = await fetchMailLog(siteKey || null, LOG_LIMIT, fetchImpl)
    if (answer.ok) setRows(answer.value)
    else setError(refusalText(answer.status, answer.code))
  }, [siteKey, fetchImpl])

  useEffect(() => {
    void read()
  }, [read])

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base">{t('mail.log.title')}</h2>
          <p className="mt-1 text-muted-foreground text-xs">{t('mail.log.lead', { limit: LOG_LIMIT })}</p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label={t('mail.log.filter')}
            value={siteKey}
            onChange={(e) => setSiteKey(e.target.value)}
          >
            <NativeSelectOption value="">{t('mail.log.allSites')}</NativeSelectOption>
            {sites.map((s) => (
              <NativeSelectOption key={s.siteKey} value={s.siteKey}>
                {s.label ?? s.siteKey}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" onClick={() => void read()} aria-label={t('mail.log.reload')}>
            <RefreshCw />
          </Button>
        </div>
      </div>
      {error ? (
        <p role="status" className="mt-4 text-sm">
          {error}
        </p>
      ) : rows === null ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-sm">
          {siteKey ? t('mail.log.emptySite') : t('mail.log.empty')}
        </p>
      ) : (
        <Card className="mt-3 gap-0 overflow-x-auto p-0">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b text-left text-muted-foreground text-xs">
                <th className="px-4 py-2.5 font-medium">{t('mail.log.when')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.log.site')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.log.result')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.log.to')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.log.subject')}</th>
                <th className="px-3 py-2.5 font-medium">{t('mail.log.error')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                // A log row has no id in the contract; position in this one answer is stable enough.
                <tr key={i} className="border-border border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs">{when(r.at)}</td>
                  <td className="px-3 py-2.5">{r.siteKey ?? DASH}</td>
                  <td className="px-3 py-2.5">
                    {r.result ?? DASH}
                    {r.code && (
                      <span className="block font-mono text-muted-foreground text-xs">{r.code}</span>
                    )}
                  </td>
                  <td className="break-all px-3 py-2.5 text-xs">{r.to ?? DASH}</td>
                  <td className="px-3 py-2.5">{r.subject ?? DASH}</td>
                  <td className="px-3 py-2.5 text-destructive text-xs">{r.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}
