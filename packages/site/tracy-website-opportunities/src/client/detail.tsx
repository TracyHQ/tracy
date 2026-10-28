import { useDemoChatNavigation } from './demo-chat.ts'
/**
 * The Details page of one opportunity and the page of one of its site briefs (plan D7), inside the
 * My opportunities sub-tab, with a breadcrumb back to the list (`My opportunities › Name › Brief N`).
 *
 * Details is built from the Inspector's blocks in two columns: Research (per source) · What happens
 * next · Demo site · Demos · Site brief on the left; Profile · Photos and videos · Colors · Google Place ·
 * Current website · Social on the right; the row's next action top right. A brief is an immutable
 * snapshot of the research that names no CMS or template; its page shows it read-only beside the Build
 * form, where the person chooses both (the name field is focused when "Build demo site" opened it).
 */
import { Fragment, type JSX, useCallback, useEffect, useId, useState } from 'react'
import { Bot, ExternalLink, FileText, Hammer } from 'lucide-react'
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Spinner,
  useTabLoading
} from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'

import { type Api, type BuildChoices, MENU_PARTS, handOffBuild, pressDemo, startResearch } from './api.ts'
import { buildChoice } from './build-choice.ts'
import type { BriefTabSeed } from './brief-tab.tsx'
import {
  LOW_WEBSITE_SCORE,
  SOCIAL_NAME,
  type SocialLine,
  SocialStatLine,
  ageInDays,
  formatAgo,
  formatDistance,
  hostOf as viewsHostOf,
  providerLabel
} from '@tracy/wo-views'
import {
  type GooglePlaceView,
  type PageSpeedView,
  type ProfileRow,
  PROFILE_FIELDS,
  buildFailure,
  briefStatus,
  demoRows,
  googlePlaceView,
  mediaRowView,
  mediaTile,
  pageSpeedView,
  profileFields,
  shownBuildId,
  socialStatsLines,
  suggestedLabelOf
} from './detail-model.ts'
import { MediaRow } from './media-row.tsx'
import { MenuBlock } from './menu-block.tsx'
import { PlaceProfileBlock } from './place-profile-block.tsx'
import { heldNameOf, nameOnSite, nameRowView } from './profile-name-model.ts'
import { ProfileNameRow } from './profile-name-row.tsx'
import { hoursRowView } from './profile-hours-model.ts'
import { type HoursChoice, type HoursSaved, ProfileHoursRow } from './profile-hours-row.tsx'
import { ratingRowView } from './profile-rating-model.ts'
import { phonesView } from './profile-phones-model.ts'
import { ProfilePhonesRows } from './profile-phones-rows.tsx'
import { type RatingChoice, ProfileRatingRow } from './profile-rating-row.tsx'
import { type ReadingPick, readingRowsView } from './profile-reading-model.ts'
import { ProfileFactsRows } from './profile-facts-rows.tsx'
import { factRowsView } from './profile-facts-model.ts'
import { ProfileKeyMessages } from './profile-key-messages.tsx'
import {
  type KeyMessageView,
  keyMessagePicksOf,
  keyMessagesView,
  removedKeyMessageIds
} from './profile-key-messages-model.ts'
import { ProfileReadingRows } from './profile-reading-rows.tsx'
import { menuAgainTarget, readMenu } from './menu-model.ts'
import { TripadvisorReviews } from './tripadvisor-reviews.tsx'
import { CMS_LABEL } from './cms-label.ts'
import { Steps, type DemoStepFacts } from './demo-progress.tsx'
import { SendDemo } from './send-demo.tsx'
import { usageFull, type OutreachDraft, type DemoUsage } from './outreach-model.ts'
import { DemoSection, Section, Sources } from './inspector.tsx'
import { rowFromDetail } from './inspector-model.ts'
import { useCardResearchAgain, useSourceRetry } from './source-retry.ts'
import { ActionButton, StatusCell } from './opportunity-cells.tsx'
import { type NextAction, nextAction, nextStepText, relativeTime } from './opportunity-row.ts'
import { usePoll } from './poll.ts'
import type { RequestIds } from './request-ids.ts'
import { runAction } from './row-actions.ts'
import { type SourceInput, buildView, reasonKey, shouldPoll } from './status.ts'
import type { Translate } from './strings.ts'

type Body = Record<string, unknown>
type Job = { id?: string; state?: string; stage?: string; createdAt?: string }
type Revision = {
  id?: string
  n?: number
  createdAt?: string
}

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const isRecord = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v)

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(interfaceLocale(), { dateStyle: 'medium' }).format(date)
}

function useDetail(
  api: Api,
  id: string
): { body: Body | null; failed: boolean; reload: () => Promise<void> } {
  const [body, setBody] = useState<Body | null>(null)
  const [failed, setFailed] = useState(false)
  const reload = useCallback(async () => {
    const answer = await api.detail(id)
    if (!answer.ok || answer.body === null || typeof answer.body !== 'object') {
      setFailed(true)
      return
    }
    setFailed(false)
    setBody(answer.body)
  }, [api, id])
  useEffect(() => {
    setBody(null)
    void reload()
  }, [reload])
  const jobs = asArray<Job>(body?.jobs)
  const action = body?.demoAction as { state?: string } | undefined
  const builds = asArray<{ state?: string | null; siteKey?: string | null }>(body?.builds)
  // A build is still moving until its site exists (`state` stays `requesting` while the site is made).
  const building = builds.filter(
    (b) =>
      buildView({ build: { state: b.state }, site: b.siteKey ? { key: b.siteKey } : null }).phase ===
      'running'
  )
  usePoll(
    reload,
    body !== null &&
      (shouldPoll(jobs.map((job) => ({ job }))) || building.length > 0 || action?.state === 'queued')
  )
  return { body, failed, reload }
}

/** The place profile, read again whenever the research job moves (`refresh` changes). */
function usePlaceProfile(
  api: Api,
  id: string,
  refresh: string
): { profile: unknown; decisions: unknown; siteName: unknown; failed: boolean } {
  const [state, setState] = useState<{
    profile: unknown
    decisions: unknown
    siteName: unknown
    failed: boolean
  }>({
    profile: null,
    decisions: null,
    siteName: null,
    failed: false
  })
  useEffect(() => {
    let live = true
    void api.placeProfile(id).then((answer) => {
      if (!live) return
      setState(
        answer.ok
          ? {
              profile: answer.body?.profile ?? null,
              decisions: answer.body?.decisions ?? null,
              // While the brief holds the business name: the neutral identity the site goes by instead.
              siteName: answer.body?.siteName ?? null,
              failed: false
            }
          : { profile: null, decisions: null, siteName: null, failed: true }
      )
    })
    return () => {
      live = false
    }
  }, [api, id, refresh])
  return state
}

/** `My opportunities › Name › Brief N`: every step but the last goes back. */
function Crumbs({
  t,
  items
}: {
  t: Translate
  items: Array<{ label: string; onClick?: () => void }>
}): JSX.Element {
  return (
    <Breadcrumb label={t('crumbs.label')} className="tracy-wo-crumbs">
      <BreadcrumbList>
        {items.map((item, i) => (
          <BreadcrumbItem key={`${i}-${item.label}`}>
            {item.onClick && i < items.length - 1 ? (
              <>
                <BreadcrumbLink render={<button type="button" onClick={item.onClick} />}>
                  {item.label}
                </BreadcrumbLink>
                <BreadcrumbSeparator />
              </>
            ) : (
              <BreadcrumbPage>{item.label}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function PageState({
  t,
  failed,
  failedKey,
  onRetry
}: {
  t: Translate
  failed: boolean
  failedKey: string
  onRetry: () => void
}): JSX.Element {
  return failed ? (
    <div className="tracy-wo-stack">
      <p className="tracy-wo-error" role="alert">
        {t(failedKey)}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t('action.retry')}
      </Button>
    </div>
  ) : (
    <div className="tracy-wo-empty" aria-busy="true" />
  )
}

export function DetailView({
  t,
  api,
  ids,
  id,
  onList,
  onChanged,
  onOpenRevision,
  openBriefTab = null
}: {
  t: Translate
  api: Api
  ids: RequestIds
  id: string
  cms: string | null
  onList: () => void
  onChanged: () => void
  /** `focusName`: the brief opens with its Demo site name field focused (Build demo site). */
  onOpenRevision: (revisionId: string, focusName: boolean) => void
  /** Opens a brief in its own side-card tab; null → the Brief page instead. */
  openBriefTab?: ((seed: BriefTabSeed) => void) | null
}): JSX.Element {
  const { body, failed, reload } = useDetail(api, id)
  const [logoWait, setLogoWait] = useState(false)
  const beginDemoChat = useDemoChatNavigation(api, true, setLogoWait)
  const [busy, setBusy] = useState(false)
  const [send, setSend] = useState<OutreachDraft | null>(null)
  const [actionFailed, setActionFailed] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const retrySource = useSourceRetry(api, ids, id, async () => {
    await reload()
    onChanged()
  })
  useTabLoading(body === null && !failed)
  const row = rowFromDetail(body)
  const [decisionsTick, setDecisionsTick] = useState(0)
  const placeProfile = usePlaceProfile(
    api,
    id,
    `${row?.job?.state ?? ''}:${row?.job?.updatedAt ?? ''}:${decisionsTick}`
  )
  const researchAgain = useCardResearchAgain(
    api,
    ids,
    id,
    `${row?.job?.state ?? ''}:${row?.job?.updatedAt ?? ''}`,
    async () => {
      await reload()
      onChanged()
    }
  )
  // Only a place with a Menu previews Read menu again (`menuAgainTarget`).
  const readMenuAgain = useCardResearchAgain(
    api,
    ids,
    menuAgainTarget(id, body?.menu),
    `${row?.job?.state ?? ''}:${row?.job?.updatedAt ?? ''}`,
    async () => {
      await reload()
      onChanged()
    },
    MENU_PARTS
  )
  if (body === null || row === null) {
    return (
      <div className="tracy-wo-page">
        <Crumbs t={t} items={[{ label: t('list.title'), onClick: onList }, { label: '…' }]} />
        <PageState
          t={t}
          failed={failed || (body !== null && row === null)}
          failedKey="detail.failed"
          onRetry={() => void reload()}
        />
      </div>
    )
  }
  const locale = interfaceLocale() ?? 'en'
  const now = Date.now()
  const act = async (action: NextAction): Promise<void> => {
    if (busy) return
    setBusy(true)
    setActionFailed(false)
    const followChat = beginDemoChat()
    try {
      const outcome = await runAction(api, ids, action, row)
      if (outcome.kind === 'demo-chat' && !(await followChat(outcome.actions))) setActionFailed(true)
      if (outcome.kind === 'send-demo') {
        const answer = await api.outreach(row.id)
        if (answer.ok) setSend(answer.body.outreach)
        else setActionFailed(true)
        return
      }
      if (outcome.kind === 'open-brief') return onOpenRevision(outcome.revisionId, true)
      if (outcome.kind === 'navigate') return window.location.assign(outcome.href)
      if (outcome.kind === 'failed') setActionFailed(true)
      await reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  const demoPress = async (press: 'extend' | 'reopen' | 'rebuild'): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const answer = await pressDemo(api, ids, row.id, press)
      setActionFailed(!answer.ok)
      await reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  /** Retry on the logo: that part alone, never the whole research (`POST …/research` with `only: 'logo'`). */
  const retryLogo = async (): Promise<void> => {
    if (logoBusy) return
    setLogoBusy(true)
    setLogoFailed(false)
    const answer = await startResearch(api, id, ids, 'logo')
    setLogoBusy(false)
    setLogoFailed(!answer.ok)
    await reload()
    onChanged()
  }
  const cancel = async (jobId: string): Promise<void> => {
    setBusy(true)
    const answer = await api.cancel(jobId)
    setBusy(false)
    setActionFailed(!answer.ok)
    await reload()
    onChanged()
  }

  const profile = isRecord(body.profile) ? body.profile : null
  // The name the site carries (the person's pick, else the one the sources agree on) titles the page.
  const shownName = nameOnSite(profile, row.name)
  // A name the brief holds off the site says so, with the neutral identity the site goes by (#1791).
  const nameRow = nameRowView(profile, heldNameOf(placeProfile.decisions, placeProfile.siteName))
  const saveName = async (name: string): Promise<boolean> => {
    const answer = await api.setName(id, name)
    if (!answer.ok) return false
    await reload()
    onChanged()
    return true
  }
  const hoursRow = hoursRowView(profile)
  const saveHours = async (choice: HoursChoice): Promise<HoursSaved> => {
    const answer = await api.setHours(id, choice)
    if (!answer.ok) return answer.code === 'INVALID_HOURS' ? 'unreadable' : 'failed'
    await reload()
    onChanged()
    return 'ok'
  }
  const ratingRow = ratingRowView(profile)
  // The main phone and the business's other numbers (`business-phones.js`).
  const phonesRow = phonesView(profile)
  const saveRating = async (choice: RatingChoice): Promise<boolean> => {
    const answer = await api.setRating(id, choice)
    if (!answer.ok) return false
    await reload()
    onChanged()
    return true
  }
  // What the business sells, who it is for and its team, as the research read them (#1780).
  const readingRows = readingRowsView(profile)
  const pickReading = async (item: string, choice: ReadingPick): Promise<boolean> => {
    const answer = await api.setReading(id, item, choice)
    if (!answer.ok) return false
    await reload()
    onChanged()
    return true
  }
  // Every fact with how sure Tracy is and whether the site says it, and the key messages (#1791).
  const factRows = factRowsView(placeProfile.profile, placeProfile.decisions)
  const toggleFact = async (factId: string, onSite: boolean | null): Promise<boolean> => {
    const answer = await api.setFact(id, factId, onSite)
    if (!answer.ok) return false
    setDecisionsTick((n) => n + 1)
    await reload()
    onChanged()
    return true
  }
  const keyMessages = keyMessagesView(profile)
  const saveKeyMessages = async (before: KeyMessageView[], next: KeyMessageView[]): Promise<boolean> => {
    const answer = await api.setKeyMessages(
      id,
      keyMessagePicksOf(before, next, removedKeyMessageIds(profile))
    )
    if (!answer.ok) return false
    await reload()
    onChanged()
    return true
  }
  const sources = asArray<SourceInput>(body.sources).filter((s) => typeof s?.source === 'string')
  const media = asArray<Body>(body.media).flatMap((m) => {
    const tile = mediaTile(m)
    return tile === null ? [] : [tile]
  })
  const menu = readMenu(body.menu)
  const revisions = asArray<Revision>(body.revisions).filter((r) => typeof r?.id === 'string')
  const candidate = isRecord(row.candidate) ? row.candidate : {}
  const job = row.job ?? null
  const next = nextStepText(row)
  const ago = (at: unknown) => relativeTime(typeof at === 'string' ? at : null, now, locale)
  const added = ago(row.createdAt)
  const distance =
    typeof candidate.distanceM === 'number' ? formatDistance(candidate.distanceM, locale) : null
  const price =
    typeof candidate.priceLevel === 'number' && candidate.priceLevel > 0
      ? '$'.repeat(candidate.priceLevel)
      : null
  const website = typeof candidate.website === 'string' && candidate.website !== '' ? candidate.website : null
  const phone = typeof candidate.phone === 'string' && candidate.phone !== '' ? candidate.phone : null
  const meta = [typeof candidate.category === 'string' ? candidate.category : null, distance, price].filter(
    Boolean
  )
  // A paused or blocked run is resumed by the next action; cancelling it stays one press away.
  const cancellable =
    typeof job?.id === 'string' && (job.state === 'paused' || job.state === 'blocked') ? job.id : null

  return (
    <div className="tracy-wo-page">
      <div className="tracy-wo-row tracy-wo-between tracy-wo-wrap">
        <Crumbs t={t} items={[{ label: t('list.title'), onClick: onList }, { label: shownName }]} />
        <ActionButton
          t={t}
          row={row}
          size="sm"
          busy={busy}
          disabled={usageFull(body.usage as DemoUsage) && ['build', 'retry-demo'].includes(nextAction(row))}
          onAction={(a) => void act(a)}
        />
      </div>
      <div className="tracy-wo-page-head">
        <div className="tracy-wo-row tracy-wo-wrap">
          <StatusCell t={t} row={row} />
          {added ? (
            <span className="tracy-wo-muted tracy-wo-small">{t('research.added', { ago: added })}</span>
          ) : null}
        </div>
        <h2 className="tracy-wo-page-title">
          {shownName}
          {row.branch ? <span className="tracy-wo-muted">{` · ${row.branch}`}</span> : null}
        </h2>
        <p className="tracy-wo-row tracy-wo-wrap tracy-wo-small tracy-wo-muted">
          {meta.length > 0 ? <span>{meta.join(' · ')}</span> : null}
          {website !== null ? (
            <a className="tracy-wo-action-link" href={website} target="_blank" rel="noopener noreferrer">
              {viewsHostOf(website) ?? website}
              <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
            </a>
          ) : (
            <span>{t('cell.website.none')}</span>
          )}
          {phone !== null ? <span>{phone}</span> : null}
        </p>
        {actionFailed ? (
          <p className="tracy-wo-error" role="alert">
            {t('action.failed')}
          </p>
        ) : null}
        {logoWait ? (
          <p className="tracy-wo-note" role="status">
            {t('demo.logoPending')}
          </p>
        ) : null}
      </div>
      <div className="tracy-wo-page-grid">
        <div className="tracy-wo-col">
          {send ? (
            <SendDemo key={row.id} t={t} draft={send} locale={locale} onClose={() => setSend(null)} />
          ) : null}
          <Steps
            t={t}
            row={row}
            facts={body.progress as DemoStepFacts | undefined}
            locale={locale}
            now={now}
            onBrief={
              row.latestRevision?.id ? () => onOpenRevision(row.latestRevision!.id!, false) : undefined
            }
            again={researchAgain}
          >
            <>
              <Sources t={t} sources={sources} retry={retrySource} />
              {cancellable !== null ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void cancel(cancellable)}
                >
                  {t('job.cancel')}
                </Button>
              ) : null}
            </>
          </Steps>
          <Section title={t('inspector.next')}>
            <p className="tracy-wo-muted">
              {next.reasonKey ? `${t(next.reasonKey)} ` : null}
              {t(next.key, next.params)}
            </p>
          </Section>
          <DemoSection
            t={t}
            row={row}
            detail={body}
            locale={locale}
            now={now}
            actions={{
              busy,
              onExtend: () => void demoPress('extend'),
              onReopen: () => void demoPress('reopen'),
              onRebuild: () => void demoPress('rebuild'),
              onRetry: () => void act('build')
            }}
          />
          <Demos
            t={t}
            api={api}
            id={id}
            revisions={revisions}
            builds={asArray<unknown>(body.builds)}
            brief={body.brief}
            onOpen={(revisionId, n) => {
              if (openBriefTab === null) return onOpenRevision(revisionId, false)
              openBriefTab({
                revisionId,
                opportunityId: id,
                title: `${t('brief.number', { n })} · ${shownName}`
              })
            }}
            onRefreshed={() => {
              void reload()
              onChanged()
            }}
          />
        </div>
        <div className="tracy-wo-col">
          <Profile
            t={t}
            profile={profile}
            nameRow={
              nameRow === null ? null : (
                <ProfileNameRow
                  key={`${nameRow.name}:${nameRow.chip}`}
                  t={t}
                  view={nameRow}
                  onSave={saveName}
                />
              )
            }
            hoursRow={
              hoursRow === null ? null : (
                <ProfileHoursRow
                  key={`${hoursRow.hours.join('|')}:${hoursRow.chip}:${hoursRow.left}`}
                  t={t}
                  view={hoursRow}
                  onSave={saveHours}
                />
              )
            }
            phonesRow={
              phonesRow === null || (phonesRow.others.length === 0 && !phonesRow.mainWhatsapp) ? null : (
                <ProfilePhonesRows t={t} view={phonesRow} />
              )
            }
            ratingRow={
              ratingRow === null ? null : (
                <ProfileRatingRow
                  key={`${ratingRow.shown}:${ratingRow.chosen}`}
                  t={t}
                  view={ratingRow}
                  locale={locale}
                  onSave={saveRating}
                />
              )
            }
            readingRows={
              readingRows === null ? null : (
                <ProfileReadingRows t={t} view={readingRows} onPick={pickReading} />
              )
            }
            keyMessagesRows={
              keyMessages.length === 0 ? null : (
                <ProfileKeyMessages
                  key={keyMessages.map((m) => `${m.id}:${m.label}`).join('|')}
                  t={t}
                  messages={keyMessages}
                  onSave={saveKeyMessages}
                />
              )
            }
            factsRows={
              factRows === null ? null : <ProfileFactsRows t={t} rows={factRows} onToggle={toggleFact} />
            }
          />
          <MenuBlock t={t} locale={locale} menu={menu} name={shownName} again={readMenuAgain} />
          <MediaRow
            t={t}
            menu={menu}
            view={mediaRowView({ profile, media, sources })}
            retryLogo={{ busy: logoBusy, failed: logoFailed, onPress: () => void retryLogo() }}
            food={profile?.trade === 'food'}
          />
          <GooglePlace t={t} place={googlePlaceView(profile?.googlePlace)} food={profile?.trade === 'food'} />
          <TripadvisorReviews t={t} profile={profile} media={media} />
          <CurrentSite t={t} site={pageSpeedView(profile?.pageSpeed)} />
          <Social t={t} lines={socialStatsLines(profile, now)} />
          <PlaceProfileBlock t={t} profile={placeProfile.profile} failed={placeProfile.failed} />
        </div>
      </div>
    </div>
  )
}

function Profile({
  t,
  profile,
  nameRow,
  hoursRow,
  ratingRow,
  phonesRow,
  readingRows,
  keyMessagesRows,
  factsRows
}: {
  t: Translate
  profile: Body | null
  /** "Name on the site" (`profile-name-row.tsx`) in place of the plain Name row, when research decided a name. */
  nameRow: JSX.Element | null
  /** "Opening hours" (`profile-hours-row.tsx`), after the phone, when there are hours to show or check. */
  hoursRow: JSX.Element | null
  /** "Google rating" (`profile-rating-row.tsx`), before the phone, when Google rates the place. */
  ratingRow: JSX.Element | null
  /** "Phone" with Main and "Other phones" (`profile-phones-rows.tsx`) in place of the plain Phone row. */
  phonesRow: JSX.Element | null
  /** "Services", "Who it is for" and "Team" (`profile-reading-rows.tsx`), after the other rows, when research read them. */
  readingRows: JSX.Element | null
  /** "Key messages" (`profile-key-messages.tsx`), after the reading, when the reading found some. */
  keyMessagesRows: JSX.Element | null
  /** "What the site may say" (`profile-facts-rows.tsx`), last: every fact, its confidence and its switch. */
  factsRows: JSX.Element | null
}): JSX.Element {
  const rows = profileFields(profile)
  const drawRow = (row: ProfileRow): JSX.Element =>
    row.field === 'name' && nameRow !== null ? (
      <Fragment key={row.field}>{nameRow}</Fragment>
    ) : (
      <div key={row.field} className="tracy-wo-field">
        <dt className="tracy-wo-muted tracy-wo-small">{t(`field.${row.field}`)}</dt>
        <dd>
          <span>{row.value}</span>
          {row.staleSince !== null ? (
            <span className="tracy-wo-warn tracy-wo-small">
              {t('detail.stale', { date: row.staleSince === '' ? '' : formatDate(row.staleSince) })}
            </span>
          ) : null}
        </dd>
      </div>
    )
  // Each field in its place, with the decided rows where they belong: the rating before the phone, the phones and
  // the hours in place of their plain rows.
  const drawn: JSX.Element[] = []
  for (const field of PROFILE_FIELDS) {
    if (field === 'phone' && ratingRow !== null)
      drawn.push(<Fragment key="googleRating">{ratingRow}</Fragment>)
    if (field === 'hours' && hoursRow !== null) {
      drawn.push(<Fragment key="hours">{hoursRow}</Fragment>)
      continue
    }
    if (field === 'phone' && phonesRow !== null) {
      drawn.push(<Fragment key="phone">{phonesRow}</Fragment>)
      continue
    }
    const row = rows.find((r) => r.field === field)
    if (row) drawn.push(drawRow(row))
  }
  if (readingRows !== null) drawn.push(<Fragment key="reading">{readingRows}</Fragment>)
  if (keyMessagesRows !== null) drawn.push(<Fragment key="keyMessages">{keyMessagesRows}</Fragment>)
  if (factsRows !== null) drawn.push(<Fragment key="facts">{factsRows}</Fragment>)
  return (
    <Section title={t('detail.profile')}>
      {drawn.length === 0 ? (
        <p className="tracy-wo-muted">{t('detail.noProfile')}</p>
      ) : (
        <dl className="tracy-wo-fields">{drawn}</dl>
      )}
    </Section>
  )
}

const answer = (t: Translate, v: boolean | null): string =>
  t(v === true ? 'answer.yes' : v === false ? 'answer.no' : 'answer.unknown')

/** What Google lists for the place; every fact is Google's, so reviews are quoted as written, with their author. */
/** `food`: the profile's trade is food, so Google's reservable reads Book a table; any other trade reads Takes bookings. */
function GooglePlace({
  t,
  place,
  food
}: {
  t: Translate
  place: GooglePlaceView | null
  food: boolean
}): JSX.Element | null {
  if (place === null) return null
  const amenities = (ids: string[]) => ids.map((id) => t(`amenity.${id}`)).join(', ')
  return (
    <Section title={t('detail.google')}>
      <dl className="tracy-wo-fields">
        {place.offered.length > 0 && (
          <div className="tracy-wo-field">
            <dt className="tracy-wo-muted tracy-wo-small">{t('detail.google.offered')}</dt>
            <dd>{amenities(place.offered)}</dd>
          </div>
        )}
        {place.notOffered.length > 0 && (
          <div className="tracy-wo-field">
            <dt className="tracy-wo-muted tracy-wo-small">{t('detail.google.notOffered')}</dt>
            <dd>{amenities(place.notOffered)}</dd>
          </div>
        )}
        <div className="tracy-wo-field">
          <dt className="tracy-wo-muted tracy-wo-small">
            {t(food ? 'detail.google.reservable' : 'detail.google.reservable.any')}
          </dt>
          <dd>{answer(t, place.reservable)}</dd>
        </div>
        {place.price !== null && (
          <div className="tracy-wo-field">
            <dt className="tracy-wo-muted tracy-wo-small">{t('detail.google.price')}</dt>
            <dd>{place.price === 'free' ? t('detail.google.price.free') : place.price}</dd>
          </div>
        )}
        {place.summaries.map((s) => (
          <div key={s.kind} className="tracy-wo-field">
            <dt className="tracy-wo-muted tracy-wo-small">{t(`detail.google.summary.${s.kind}`)}</dt>
            <dd>{s.text}</dd>
          </div>
        ))}
        {place.openingHours.length > 0 && (
          <div className="tracy-wo-field">
            <dt className="tracy-wo-muted tracy-wo-small">{t('field.hours')}</dt>
            <dd>
              {place.openingHours.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </dd>
          </div>
        )}
        {place.reviews.length > 0 && (
          <div className="tracy-wo-field">
            <dt className="tracy-wo-muted tracy-wo-small">{t('detail.google.reviews')}</dt>
            <dd className="tracy-wo-reviews">
              {place.reviews.map((r, i) => (
                <blockquote key={`${r.author}-${i}`} className="tracy-wo-review">
                  <q>{r.text}</q>
                  <span className="tracy-wo-muted tracy-wo-small tracy-wo-review-author">
                    {r.authorAvatarUrl ? (
                      <img
                        src={r.authorAvatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    {r.authorUri ? (
                      <a href={r.authorUri} target="_blank" rel="noopener noreferrer">
                        {r.rating === null
                          ? t('detail.google.by', { author: r.author })
                          : t('detail.google.byRated', { author: r.author, rating: r.rating })}
                      </a>
                    ) : r.rating === null ? (
                      t('detail.google.by', { author: r.author })
                    ) : (
                      t('detail.google.byRated', { author: r.author, rating: r.rating })
                    )}
                  </span>
                </blockquote>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </Section>
  )
}

/** Mobile PageSpeed of the place's own website, as measured; a score under 50 reads red like the Website column. */
function CurrentSite({ t, site }: { t: Translate; site: PageSpeedView | null }): JSX.Element | null {
  if (site === null) return null
  const scoreText = (v: number | null) =>
    v === null ? (
      t('answer.unknown')
    ) : (
      <span className="tracy-wo-web-score" data-low={v < LOW_WEBSITE_SCORE}>
        {t('cell.website.score', { score: v })}
      </span>
    )
  const lcp =
    site.lcpSeconds === null
      ? t('answer.unknown')
      : new Intl.NumberFormat(interfaceLocale(), {
          style: 'unit',
          unit: 'second',
          unitDisplay: 'short',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        }).format(site.lcpSeconds)
  const facts: Array<[string, JSX.Element | string]> = [
    ['detail.site.performance', scoreText(site.performance)],
    ['detail.site.seo', scoreText(site.seo)],
    ['detail.site.lcp', lcp],
    ['detail.site.https', answer(t, site.https)],
    ['detail.site.mobileFriendly', answer(t, site.mobileFriendly)]
  ]
  return (
    <Section title={t('detail.site')}>
      <p className="tracy-wo-facts">
        {facts.map(([key, value], i) => (
          <span key={key}>
            {i > 0 ? ' · ' : null}
            <span className="tracy-wo-muted">{t(key)}</span> {value}
          </span>
        ))}
      </p>
      <p className="tracy-wo-muted tracy-wo-small">
        {t('detail.site.checked', { date: formatDate(site.checkedAt) })}
      </p>
    </Section>
  )
}

/** Followers, last post and posts a month per page, with where they came from; nothing until research stored some. */
function Social({ t, lines }: { t: Translate; lines: SocialLine[] }): JSX.Element | null {
  if (lines.length === 0) return null
  const locale = interfaceLocale() ?? 'en'
  const now = Date.now()
  return (
    <Section title={t('columns.social')}>
      <ul className="tracy-wo-stack">
        {lines.map((line) => {
          const days = ageInDays(line.fetchedAt, now)
          const source = [
            SOCIAL_NAME[line.network],
            line.provider ? providerLabel(line.provider) : null,
            days !== null ? t('cell.social.checked', { ago: formatAgo(days, locale) }) : null
          ].filter(Boolean)
          return (
            <li key={line.network} className="tracy-wo-row tracy-wo-wrap">
              <SocialStatLine t={t} line={line} locale={locale} />
              <span className="tracy-wo-muted tracy-wo-small">{source.join(' · ')}</span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/**
 * Demos and the site brief (Lee, 23/10/2026): a brief is the research frozen once and names no template, so the
 * card lists every demo with what it was built with and the brief it came from; the brief line says whether the
 * research still reads the same, with Refresh to make a new brief now and View brief to read it.
 */
function Demos({
  t,
  api,
  id,
  revisions,
  builds,
  brief,
  onOpen,
  onRefreshed
}: {
  t: Translate
  api: Api
  id: string
  revisions: Revision[]
  builds: unknown[]
  brief: unknown
  onOpen: (revisionId: string, n: number) => void
  onRefreshed: () => void
}): JSX.Element {
  const locale = interfaceLocale() ?? 'en'
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const rows = demoRows(builds, revisions)
  const status = briefStatus(brief)
  const refresh = async (): Promise<void> => {
    if (refreshing) return
    setRefreshing(true)
    setFailed(false)
    const answer = await api.createRevision(id)
    setRefreshing(false)
    if (!answer.ok) return setFailed(true)
    onRefreshed()
  }
  const when = status ? relativeTime(status.createdAt, Date.now(), locale) : ''
  return (
    <>
      <Section title={t('demos.title')}>
        {rows.length === 0 ? (
          <p className="tracy-wo-muted">{t('demos.none')}</p>
        ) : (
          <ul className="tracy-wo-briefs">
            {rows.map((r) => {
              const facts = [
                r.cms ? (CMS_LABEL[r.cms] ?? r.cms) : null,
                r.template,
                relativeTime(r.createdAt, Date.now(), locale),
                r.briefN === null ? null : t('demos.fromBrief', { n: r.briefN })
              ].filter(Boolean)
              const live = r.phase === 'done'
              return (
                <li key={r.id} className="tracy-wo-brief-row">
                  <span className="tracy-wo-name">{t('demos.number', { n: r.n })}</span>
                  <span className="tracy-wo-muted tracy-wo-small tracy-wo-brief-facts">
                    {facts.join(' · ')}
                  </span>
                  <Badge
                    variant={live ? 'secondary' : 'outline'}
                    className={live ? 'tracy-wo-badge-live' : undefined}
                  >
                    {t(`demos.state.${r.phase}`)}
                  </Badge>
                  {r.siteKey !== null && r.phase !== 'deleted' ? (
                    <span className="tracy-wo-row tracy-wo-brief-acts">
                      <a className="tracy-wo-action-link" href={`/${encodeURIComponent(r.siteKey)}/`}>
                        {t('demos.open')}
                        <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
                      </a>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <Section title={t('revision.document')}>
        {status === null ? (
          <p className="tracy-wo-muted">{t('brief.none')}</p>
        ) : (
          <div className="tracy-wo-row tracy-wo-wrap">
            <p className="tracy-wo-muted">
              {status.current === null
                ? t('brief.number', { n: status.n })
                : t(status.current ? 'brief.current' : 'brief.stale', { n: status.n, when })}
            </p>
            <Button type="button" size="xs" variant="outline" onClick={() => onOpen(status.id, status.n)}>
              <FileText aria-hidden="true" />
              {t('brief.view')}
            </Button>
            {status.current === false ? (
              <Button type="button" size="xs" disabled={refreshing} onClick={() => void refresh()}>
                {refreshing ? <Spinner label={t('brief.refreshing')} /> : null}
                {refreshing ? t('brief.refreshing') : t('brief.refresh')}
              </Button>
            ) : null}
          </div>
        )}
        {failed && (
          <p className="tracy-wo-error" role="alert">
            {t('brief.failed')}
          </p>
        )}
      </Section>
    </>
  )
}

export function RevisionView({
  t,
  api,
  ids,
  opportunityId,
  revisionId,
  focusName = false,
  onList,
  onDetails
}: {
  t: Translate
  api: Api
  ids: RequestIds
  opportunityId: string
  revisionId: string
  /** Opened by "Build demo site": the Demo site name field takes the focus. */
  focusName?: boolean
  onList: () => void
  onDetails: () => void
}): JSX.Element {
  const [revision, setRevision] = useState<Body | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [lastBuildId, setLastBuildId] = useState<string | null>(null)
  const [usage, setUsage] = useState<DemoUsage | null>(null)
  const [suggestedLabel, setSuggestedLabel] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    const [meta, md] = await Promise.all([api.revision(revisionId), api.revisionMarkdown(revisionId)])
    if (!meta.ok || typeof meta.body?.revision !== 'object' || meta.body.revision === null) {
      setFailed(true)
      return
    }
    setFailed(false)
    setRevision(meta.body.revision as Body)
    setUsage(meta.body.usage as DemoUsage)
    setLastBuildId(
      shownBuildId(
        Array.isArray(meta.body.builds) ? (meta.body.builds as { id?: unknown; state?: unknown }[]) : null
      )
    )
    setSuggestedLabel(suggestedLabelOf(meta.body))
    setMarkdown(md.ok ? md.body : null)
  }, [api, revisionId])
  useEffect(() => {
    void load()
  }, [load])
  // The breadcrumb names the place; the brief alone does not carry its name.
  useEffect(() => {
    let live = true
    void api.detail(opportunityId).then((answer) => {
      const opportunity =
        answer.ok && isRecord(answer.body) && isRecord(answer.body.opportunity)
          ? answer.body.opportunity
          : null
      if (live && typeof opportunity?.name === 'string') setName(opportunity.name)
    })
    return () => {
      live = false
    }
  }, [api, opportunityId])
  useTabLoading(revision === null && !failed)
  const n = typeof revision?.n === 'number' ? revision.n : ''
  const crumbs = (
    <Crumbs
      t={t}
      items={[
        { label: t('list.title'), onClick: onList },
        { label: name ?? '…', onClick: onDetails },
        { label: t('brief.number', { n }) }
      ]}
    />
  )
  if (revision === null) {
    return (
      <div className="tracy-wo-page">
        {crumbs}
        <PageState t={t} failed={failed} failedKey="revision.failed" onRetry={() => void load()} />
      </div>
    )
  }
  return (
    <div className="tracy-wo-page">
      {crumbs}
      <div className="tracy-wo-page-head">
        <h2 className="tracy-wo-page-title">{t('brief.number', { n })}</h2>
        <p className="tracy-wo-muted tracy-wo-small">{t('brief.readOnly')}</p>
      </div>
      <div className="tracy-wo-page-grid is-brief">
        <div className="tracy-wo-col">
          <Section title={t('revision.document')}>
            {markdown !== null ? (
              <pre className="tracy-wo-markdown">{markdown}</pre>
            ) : (
              <p className="tracy-wo-muted">{t('revision.failed')}</p>
            )}
          </Section>
        </div>
        <div className="tracy-wo-col">
          <Build
            key={lastBuildId ?? 'new'}
            t={t}
            api={api}
            ids={ids}
            revisionId={revisionId}
            opportunityId={opportunityId}
            onStarted={onDetails}
            cms=""
            suggestedLabel={suggestedLabel}
            usage={usage}
            initialBuildId={lastBuildId}
            focusName={focusName}
          />
        </div>
      </div>
    </div>
  )
}

function Build({
  t,
  api,
  ids,
  revisionId,
  opportunityId,
  onStarted,
  cms,
  suggestedLabel,
  usage: initialUsage,
  initialBuildId = null,
  focusName = false
}: {
  t: Translate
  api: Api
  ids: RequestIds
  revisionId: string
  opportunityId: string
  onStarted: () => void
  cms: string
  usage: DemoUsage | null
  /** The server's name for the site; shown until the person types their own. */
  suggestedLabel: string
  /** The revision's latest build, so a reload still shows its site and the handoff. */
  initialBuildId?: string | null
  focusName?: boolean
}): JSX.Element {
  const labelId = useId()
  const cmsId = useId()
  const templateId = useId()
  const [usage, setUsage] = useState(initialUsage)
  usePoll(
    async () => {
      const result = await api.demoUsage()
      if (result.ok) setUsage(result.body.usage)
    },
    true,
    15000
  )
  const [typed, setTyped] = useState<string | null>(null)
  const label = typed ?? suggestedLabel
  const [buildId] = useState<string | null>(initialBuildId)
  const [status, setStatus] = useState<ReturnType<typeof buildView> | null>(null)
  const [failure, setFailure] = useState<ReturnType<typeof buildFailure>>(null)
  const [startCode, setStartCode] = useState<string | null>(null)
  const [logoWait, setLogoWait] = useState(false)
  const beginDemoChat = useDemoChatNavigation(api, true, setLogoWait)
  const [busy, setBusy] = useState(false)
  const [handing, setHanding] = useState(false)
  const [handOffReason, setHandOffReason] = useState<string | null>(null)
  const [handOffWaiting, setHandOffWaiting] = useState(false)
  const read = useCallback(async () => {
    if (buildId === null) return
    const answer = await api.buildStatus(buildId)
    if (!answer.ok) return
    setStatus(buildView(answer.body as Parameters<typeof buildView>[0]))
    setFailure(buildFailure(answer.body as Parameters<typeof buildFailure>[0]))
  }, [api, buildId])
  useEffect(() => {
    void read()
  }, [read])
  usePoll(read, buildId !== null && (status === null || status.phase === 'running'))

  // The CMS and template are the person's choice; the template /ops/wo pins for the CMS is preselected.
  const [choices, setChoices] = useState<BuildChoices | null>(null)
  const [pickedCms, setPickedCms] = useState<string | null>(null)
  const [pickedDesign, setPickedDesign] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void api.capabilities().then((answer) => {
      const offered = answer.ok ? answer.body.templates : undefined
      if (live && offered && !('error' in offered)) setChoices(offered)
    })
    return () => {
      live = false
    }
  }, [api])
  const picked = buildChoice(choices, cms, pickedCms, pickedDesign)
  const { cmsList, cms: buildCms, template: buildTemplate } = picked
  const offered = choices?.[buildCms]

  const start = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setStartCode(null)
    const followChat = beginDemoChat()
    try {
      let accepted = false
      const outcome = await runAction(
        {
          ...api,
          buildDemo: async (id, requestId, retryOf, selection) => {
            const answer = await api.buildDemo(id, requestId, retryOf, selection, label.trim())
            accepted = answer.ok
            return answer
          }
        },
        ids,
        'build',
        { id: opportunityId },
        // The form's choice when this server offers one; else the shared picker opens, as before.
        buildTemplate
          ? async () => ({
              cms: buildCms,
              design: buildTemplate.design,
              quickstart: buildTemplate.quickstart
            })
          : undefined
      )
      if (outcome.kind === 'demo-chat' && !(await followChat(outcome.actions))) setStartCode('HTTP_500')
      if (outcome.kind === 'failed') setStartCode(outcome.code)
      else if (outcome.kind === 'done' && accepted) onStarted()
    } finally {
      setBusy(false)
    }
  }

  /** The stopped build's demo action pressed again (`retryOf`): the same build, its CMS and template kept. */
  const retry = async (): Promise<void> => {
    if (busy || failure === null || failure.actionId === null) return
    setBusy(true)
    setStartCode(null)
    const key = `retry-build:${revisionId}:${buildId}`
    const { id: requestId } = ids.begin(key)
    const answer = await api.buildDemo(opportunityId, requestId, failure.actionId)
    if (answer.ok) ids.succeed(key)
    else ids.fail(key)
    setBusy(false)
    if (!answer.ok) {
      setStartCode(answer.code)
      return
    }
    setFailure(null)
    setStatus(null)
  }

  const handOff = async (): Promise<void> => {
    if (buildId === null || handing) return
    setHanding(true)
    setHandOffReason(null)
    setHandOffWaiting(false)
    const answer = await handOffBuild(api, buildId, { onWaiting: () => setHandOffWaiting(true) })
    if (answer.ok) {
      window.location.assign(answer.target)
      return
    }
    setHanding(false)
    setHandOffWaiting(false)
    setHandOffReason(answer.reasonKey)
  }

  return (
    <Section title={t('build.start')} tint>
      {logoWait ? (
        <p className="tracy-wo-note" role="status">
          {t('demo.logoPending')}
        </p>
      ) : null}
      {usageFull(usage) ? (
        <p className="tracy-wo-error" role="status">
          {t('v3.limitReached')}
        </p>
      ) : null}
      {buildTemplate && buildId === null ? (
        <>
          <label className="tracy-wo-field">
            <span className="tracy-wo-label" id={cmsId}>
              {t('build.cms')}
            </span>
            <NativeSelect
              aria-labelledby={cmsId}
              value={buildCms}
              onChange={(event) => {
                setPickedCms(event.target.value)
                setPickedDesign(null)
              }}
            >
              {cmsList.map((key) => (
                <NativeSelectOption key={key} value={key}>
                  {CMS_LABEL[key] ?? key}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="tracy-wo-field">
            <span className="tracy-wo-label" id={templateId}>
              {t('build.template')}
            </span>
            <NativeSelect
              aria-labelledby={templateId}
              value={buildTemplate.design}
              onChange={(event) => setPickedDesign(event.target.value)}
            >
              {(offered?.templates ?? []).map((tpl) => (
                <NativeSelectOption key={tpl.design} value={tpl.design}>
                  {tpl.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </>
      ) : (
        <p className="tracy-wo-muted tracy-wo-small">{t('build.cmsNote')}</p>
      )}
      <label className="tracy-wo-field">
        <span className="tracy-wo-label" id={labelId}>
          {t('build.label')}
        </span>
        {/* autoFocus, not a ref: dsh's React 18 drops a ref passed to a function component. */}
        <Input
          autoFocus={focusName}
          aria-labelledby={labelId}
          value={label}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
        <span className="tracy-wo-muted tracy-wo-small">{t('build.labelHint')}</span>
      </label>
      {buildId === null ? (
        <Button type="button" disabled={busy || usageFull(usage)} onClick={() => void start()}>
          {busy ? <Spinner label={t('build.running')} /> : <Hammer aria-hidden="true" />}
          {t('build.start')}
        </Button>
      ) : null}
      {buildId === null ? <p className="tracy-wo-muted tracy-wo-small">{t('build.after')}</p> : null}
      {startCode !== null && (
        <p className="tracy-wo-error" role="alert">
          {t('build.failed', {
            reason: t(reasonKey(startCode) ?? 'reason.other')
          })}
        </p>
      )}
      {buildId !== null && (status === null || status.phase === 'running') && (
        <p className="tracy-wo-note" role="status">
          <Spinner label={t('build.running')} /> {t('build.running')}
        </p>
      )}
      {status?.phase === 'done' && (
        <p className="tracy-wo-ok" role="status">
          {t('build.done')}
        </p>
      )}
      {status?.phase === 'done' && buildId !== null && (
        <Button type="button" variant="outline" disabled={handing} onClick={() => void handOff()}>
          {handing ? <Spinner label={t('handoff.running')} /> : <Bot aria-hidden="true" />}
          {handing ? t('handoff.running') : t('handoff.start')}
        </Button>
      )}
      {handing && handOffWaiting && (
        <p className="tracy-wo-note" role="status">
          {t('handoff.waiting')}
        </p>
      )}
      {handOffReason !== null && (
        <p className="tracy-wo-error" role="alert">
          {t('handoff.failed', { reason: t(handOffReason) })}
        </p>
      )}
      {status?.phase === 'failed' && (
        <p className="tracy-wo-error" role="alert">
          {t('build.failed', {
            reason: t(
              failure?.code === 'PROVISION_FAILED'
                ? 'reason.provision_failed'
                : (status.reasonKey ?? 'reason.other')
            )
          })}
        </p>
      )}
      {status?.phase === 'failed' && failure?.reason ? (
        <p className="tracy-wo-muted tracy-wo-small">{failure.reason}</p>
      ) : null}
      {status?.phase === 'failed' && failure?.actionId && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || usageFull(usage)}
          onClick={() => void retry()}
        >
          {busy ? <Spinner label={t('build.running')} /> : <Hammer aria-hidden="true" />}
          {t('action.retry')}
        </Button>
      )}
      {status?.links ? (
        <span className="tracy-wo-row tracy-wo-wrap">
          <a className="tracy-wo-action-link" href={status.links.workspace}>
            {t('build.openSite')}
          </a>
          {status.links.live !== null ? (
            <a
              className="tracy-wo-action-link"
              href={status.links.live}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('build.openLive')}
              <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
            </a>
          ) : null}
        </span>
      ) : null}
    </Section>
  )
}
