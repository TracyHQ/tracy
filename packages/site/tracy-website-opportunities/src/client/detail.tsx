import { useDemoChatNavigation } from './demo-chat.ts'
/**
 * The Details page of one opportunity and the page of one of its site briefs (plan D7), inside the
 * My opportunities sub-tab.
 *
 * Details (#517, layout C of spec #512): a sticky header (Back, name and type, status, a ⋯ menu with Research again
 * and Delete) over two columns of cards. The left column holds Progress (the three steps with the one action of the
 * current step), Profile (the rows the person can check and edit) and Sources (one line each); the right column holds
 * Business brief (the brief line and the first rows of the facts table), Photos & video (two rows of tiles) and Demo
 * site (the block of #515 and every demo). A narrow page is one column in that order. Profile, Business brief and
 * Photos & video each open as a sub-page (`wo-section`, `details-sections.tsx`) with the whole section: the Profile
 * with menu, Google, reviews, current website, social and place profile; the full facts table; every photo and video.
 * Sources is the table on Details alone (#537), with Try again and remove on its rows. A brief is an immutable snapshot of the research that names no CMS or template; its page shows it
 * read-only beside the Build form, where the person chooses both (the name field is focused when "Build demo site"
 * opened it).
 */
import { type JSX, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Bot, ChevronLeft, ChevronRight, ExternalLink, FileText, Hammer, Lock } from 'lucide-react'
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
  Spinner,
  useTabLoading
} from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'

import { type Api, type BuildChoices, MENU_PARTS, handOffBuild, pressDemo, startResearch } from './api.ts'
import { buildChoice, buildLabel, buildLabelHintKey } from './build-choice.ts'
import { BriefUnderstanding } from './brief-understanding.tsx'
import { BriefControl, type BriefJobControl, briefChip, useBriefJob } from './brief-control.tsx'
import { Stepper } from './stepper.tsx'
import { type StepAction, bandSubSteps, effectiveOf, reviewChipOf, stepperView } from './stepper-model.ts'
import { ProgressBand } from './progress-band.tsx'
import { type ApprovalView, gateText } from './seller-review.tsx'
import type { AddSourceRefusal } from './add-source-model.ts'
import { AddSourcePopover } from './add-source-popover.tsx'
import { EditableText } from './editable-text.tsx'
import { profileEditBody, profileEditView, profileEditedAt, typedHours } from './profile-edit-model.ts'
import { briefControlView, briefLineKey, researchOf } from './research-gate-model.ts'
import { useRevisionPage } from './revision-page.ts'
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
  PROFILE_FIELDS,
  buildFailure,
  briefStatus,
  demoRows,
  googlePlaceView,
  mediaRowView,
  mediaTile,
  failureReasonText,
  pageSpeedView,
  profileFields,
  socialStatsLines,
  tripadvisorReviewView
} from './detail-model.ts'
import { MediaRow } from './media-row.tsx'
import { MenuBlock } from './menu-block.tsx'
import { PlaceProfileBlock } from './place-profile-block.tsx'
import { heldNameOf, nameOnSite, nameRowView } from './profile-name-model.ts'
import { ProfileNameRow } from './profile-name-row.tsx'
import { hoursRowView } from './profile-hours-model.ts'
import { type HoursChoice, type HoursSaved } from './profile-hours-row.tsx'
import { ratingRowView } from './profile-rating-model.ts'
import type { RatingChoice } from './profile-rating-row.tsx'
import { type ReadingPick, readingRowsView } from './profile-reading-model.ts'
import { briefSummaryRows, businessBriefRows, orderBriefRows, websiteRow } from './business-brief-model.ts'
import { BusinessBriefTable } from './business-brief-table.tsx'
import { SiteNameRow } from './site-name-row.tsx'
import { type DemoCommand, demoBlockView, demoCommand } from './demo-block-model.ts'
import { DemoSiteBlock } from './demo-site-block.tsx'
import { SubPage } from './details-sections.tsx'
import { WorkspaceCard, demoHostOf } from './workspace-card.tsx'
import {
  type SectionId,
  type SubSection,
  pageOf,
  researchRunning as researchMovingOf,
  sectionMetas,
  sourceCounts
} from './section-model.ts'
import { overviewSourcesOf, sourcesToShow } from './source-links-model.ts'
import { DetailsHeader } from './details-header.tsx'
// [TAM] preview panel (temporary, never ships)
import { PreviewPanel, usePreview, usePreviewApi } from './preview-panel.tsx'
import { applyPreview } from './preview-states.ts'
import { Section, SourcesTable } from './details-parts.tsx'
import { sourceProgressOf, sourceStateOf } from './source-table-model.ts'
import { type DeleteAsk, deleteFailedKey, deleteOpportunities, hasLiveDemo } from './delete-model.ts'
import { DeleteDialog } from './delete-dialog.tsx'
import { ResearchAgainDialog } from './research-again-dialog.tsx'
import { ProfileKeyMessages } from './profile-key-messages.tsx'
import {
  type KeyMessageView,
  keyMessagePicksOf,
  keyMessagesView,
  removedKeyMessageIds
} from './profile-key-messages-model.ts'
import { ProfileReadingRows } from './profile-reading-rows.tsx'
import { BusinessFactsPage } from './business-facts-page.tsx'
import { businessFactsView } from './business-facts-model.ts'
import { menuAgainTarget, readMenu } from './menu-model.ts'
import { TripadvisorReviews } from './tripadvisor-reviews.tsx'
import { CMS_LABEL } from './cms-label.ts'
import { BuildEstimate, DemoProgress } from './demo-progress.tsx'
import { SendDemo } from './send-demo.tsx'
import { usageFull, type OutreachDraft, type DemoUsage } from './outreach-model.ts'
import { rowFromDetail } from './inspector-model.ts'
import { useCardResearchAgain, useSourceRemove, useSourceRetry } from './source-retry.ts'
import { StatusBadge } from './my-places.tsx'
import { placeStatus } from './opportunity-pieces.ts'
import { type NextAction, relativeTime } from './opportunity-row.ts'
import { usePoll } from './poll.ts'
import type { RequestIds } from './request-ids.ts'
import { rankingFor, runAction } from './row-actions.ts'
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
/** The header chip's look by tone (#537). */
const CHIP_CLASS: Record<string, string> = {
  ok: 'tracy-wo-chip-ok',
  warn: 'tracy-wo-chip-warn',
  run: 'tracy-wo-chip-brand',
  error: 'tracy-wo-chip-bad',
  mute: 'tracy-wo-chip-mute'
}
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
  api: realApi,
  ids,
  id,
  onList,
  section = null,
  onSection = () => undefined,
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
  /** The section open as a sub-page (`wo-section`); null = the two columns of Details. */
  section?: SubSection | null
  /** Opens a section as a sub-page, or null to come back to Details. */
  onSection?: (section: SubSection | null) => void
  onChanged: () => void
  /** `focusName`: the brief opens with its Demo site name field focused (Build demo site). */
  onOpenRevision: (revisionId: string, focusName: boolean) => void
  /** Opens a brief in its own side-card tab; null → the Brief page instead. */
  openBriefTab?: ((seed: BriefTabSeed) => void) | null
}): JSX.Element {
  // [TAM] preview panel: with wo-preview=1 a chosen state replaces the answer and every write door is a toast.
  const preview = usePreview()
  const api = usePreviewApi(realApi, preview)
  const { body: realBody, failed, reload } = useDetail(api, id)
  const body = useMemo(() => applyPreview(realBody, preview.state, Date.now()), [realBody, preview.state])
  const [logoWait, setLogoWait] = useState(false)
  const beginDemoChat = useDemoChatNavigation(api, true, setLogoWait)
  const [busy, setBusy] = useState(false)
  const [send, setSend] = useState<OutreachDraft | null>(null)
  const [actionFailed, setActionFailed] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const buildChoices = useBuildChoices(api)
  const recommended = useRecommendedDesigns(api, id)
  const retrySource = useSourceRetry(api, ids, id, async () => {
    await reload()
    onChanged()
  })
  const removeSourceControl = useSourceRemove(api, id, async () => {
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
  // A section opened as a sub-page, or the pager to the next one, starts at the top of the page.
  const page = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    page.current?.closest<HTMLElement>('.tracy-wo-tab')?.scrollTo({ top: 0 })
  }, [section])
  // Delete this place (the same confirmation and door as the list), then back to the list.
  const [deleting, setDeleting] = useState<DeleteAsk | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState<string | null>(null)
  // The Content brief job (#524): pressed from the stepper, polled here, drawn in the Site brief block.
  const briefJob = useBriefJob(api, id, body?.briefJob ?? null, () => {
    void reload()
    onChanged()
  })
  if (body === null || row === null) {
    return (
      <div className="tracy-wo-page">
        <Button type="button" size="sm" variant="ghost" className="tracy-wo-details-back" onClick={onList}>
          <ChevronLeft aria-hidden="true" />
          {t('details.back')}
        </Button>
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
    if (preview.block(action)) return // [TAM]
    if (busy) return
    setBusy(true)
    setActionFailed(false)
    const followChat = beginDemoChat()
    try {
      const outcome = await runAction(api, ids, action, row)
      if (outcome.kind === 'demo-chat' && !(await followChat(outcome.actions))) setActionFailed(true)
      if (outcome.kind === 'send-demo') {
        const answer = await api.outreach(row.id)
        if (answer.ok) {
          // The Send panel lives in the Demo site card.
          setSend(answer.body.outreach)
          if (section !== null) onSection(null)
          requestAnimationFrame(() =>
            page.current
              ?.querySelector<HTMLElement>('[data-section="demo"]')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          )
        } else setActionFailed(true)
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

  const confirmDelete = async (): Promise<void> => {
    if (deleting === null || deleteBusy) return
    setDeleteBusy(true)
    setDeleteFailed(null)
    const outcome = await deleteOpportunities(api, ids, deleting.ids)
    setDeleteBusy(false)
    setDeleting(null)
    if (!outcome.ok || outcome.failed > 0) {
      setDeleteFailed(outcome.ok ? 'action.failed' : deleteFailedKey(outcome.code))
      return
    }
    onChanged()
    onList()
  }

  const profile = isRecord(body.profile) ? body.profile : null
  // This card's own research (#524): nothing researched shows, and the brief waits, until it is done.
  const research = researchOf(body)
  const editProfileRow = (field: string, value: string, open = false): JSX.Element | null => {
    const view = profileEditView(profile, field)
    if (view === null) return null
    return (
      <EditableText
        key={`${field}:${value}`}
        t={t}
        value={value}
        label={t(`field.${field}`)}
        edited={view.edited}
        editedKey="profile.editedByYou"
        multiline={field === 'bio'}
        startOpen={open}
        maxLength={field === 'bio' ? 1200 : field === 'phone' ? 40 : 300}
        onSave={async (typed) => {
          const sent = profileEditBody(field, typed, view.value)
          if (sent === null) return true
          const answer = await api.editProfile(id, sent.edits)
          if (answer.ok) void reload()
          return answer.ok
        }}
      />
    )
  }
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
  // Before research has a row, the links the owner pasted (and the Google listing of a search), Not collected yet.
  // While research runs (again) the rows are reset to the pasted links, Not collected yet: progress shows in the band.
  // A link added after research has no row of research yet: it shows beside them while the server says the sources
  // changed, waiting for the next research.
  const sourcesChanged = isRecord(body.approval) && body.approval.research === 'sources_changed'
  const shownSources = sourcesToShow(
    researchMovingOf({ research, researchJob: row.job ?? null }) ? [] : sources,
    body.opportunity,
    sourcesChanged
  )
  // The overview table lists what research collected or could not collect, and links added since; a row research
  // skipped by itself stays on the Sources sub-page. Before research the pasted links all show, waiting.
  const sourcesRead = research.done && !researchMovingOf({ research, researchJob: row.job ?? null })
  const overviewSources = overviewSourcesOf(shownSources, sourcesRead)
  const sourceProgress = sourceProgressOf(
    body.stepProgress,
    researchMovingOf({ research, researchJob: row.job ?? null })
  )
  const overviewStates = overviewSources.map(
    (s) => sourceStateOf(s, sourcesRead, locale, sourceProgress).state
  )
  const media = asArray<Body>(body.media).flatMap((m) => {
    const tile = mediaTile(m)
    return tile === null ? [] : [tile]
  })
  const menu = readMenu(body.menu)
  const revisions = asArray<Revision>(body.revisions).filter((r) => typeof r?.id === 'string')
  const candidate = isRecord(row.candidate) ? row.candidate : {}
  const job = row.job ?? null
  const ago = (at: unknown) => relativeTime(typeof at === 'string' ? at : null, now, locale)
  const added = ago(row.createdAt)
  const distance =
    typeof candidate.distanceM === 'number' ? formatDistance(candidate.distanceM, locale) : null
  const price =
    typeof candidate.priceLevel === 'number' && candidate.priceLevel > 0
      ? '$'.repeat(candidate.priceLevel)
      : null
  const website = typeof candidate.website === 'string' && candidate.website !== '' ? candidate.website : null
  const editedAt = profileEditedAt(body.opportunity)
  const meta = [typeof candidate.category === 'string' ? candidate.category : null, distance, price].filter(
    Boolean
  )
  // A paused or blocked run is resumed by the next action; cancelling it stays one press away.
  const cancellable =
    typeof job?.id === 'string' && (job.state === 'paused' || job.state === 'blocked') ? job.id : null

  const limitReached = usageFull(body.usage as DemoUsage)
  const demoView = demoBlockView(row, body, t, { now, locale })
  const onDemo = (command: Exclude<DemoCommand, null>): void => {
    if (command.kind === 'action') return void act(command.action)
    if (command.kind === 'press') return void demoPress(command.press)
    window.open(command.href, '_blank', 'noopener,noreferrer')
  }
  // The three steps with the ONE action of the current step: the Progress card, or one line on a sub-page.
  const stepperInput = {
    research,
    researchJob: job,
    briefJob: briefJob.job,
    brief: isRecord(body.brief) ? body.brief : null,
    demo: demoView.state,
    demoAt: demoView.state === 'ready' ? (row.demoAction?.updatedAt ?? null) : null,
    approval: isRecord(body.approval) ? body.approval : null
  }
  // What still counts as made: a reset upstream clears the brief and the site on screen (`effectiveOf`).
  const effective = effectiveOf(stepperInput)
  const stepper = stepperView(stepperInput)
  const approval = isRecord(body.approval) ? body.approval : null
  const onStep = (step: StepAction): void => {
    if (!step.startsWith('review-') && preview.block(step)) return // [TAM]
    if (step === 'start-research') return void act('start')
    if (step === 'resume-research') return void act('resume')
    if (step === 'make-brief' || step === 'retry-brief') return void briefJob.press()
    // The seller's review steps (#537) open the sub-page to review; research again opens its dialog where it is.
    if (step === 'review-profile') return onSection('profile')
    if (step === 'review-brief') return onSection('brief')
    if (step === 'research-again') return researchAgain.onOpen()
    const command = demoCommand('primary', row, body)
    if (command !== null) onDemo(command)
  }
  // On a sub-page, the strip's Review press never points at the page already open.
  const stripView =
    section !== null &&
    ((stepper.action?.kind === 'review-profile' && pageOf(section) === 'profile') ||
      (stepper.action?.kind === 'review-brief' && pageOf(section) === 'brief'))
      ? { ...stepper, action: null }
      : stepper
  const stepperBlock = (strip: boolean): JSX.Element => (
    <Stepper
      t={t}
      view={strip ? stripView : stepper}
      locale={locale}
      busy={busy || briefJob.pressing}
      disabled={limitReached && ['build', 'retry-build', 'rebuild'].includes(stepper.action?.kind ?? '')}
      strip={strip}
      onAction={onStep}
    />
  )
  // The Progress band (#537): the running step's real sub-steps, from the brief job or the server's stepProgress.
  const briefSteps = briefControlView({
    research: { state: 'done' },
    brief: body.brief,
    briefJob: briefJob.job
  })
  // A brief being written, or a run that failed with no current brief, leaves the brief card empty (#537): the band
  // alone shows the job, and the older brief is reset on screen until a new one is made.
  const briefEmpty =
    briefSteps.mode === 'running'
      ? 'brief.beingWritten'
      : briefSteps.mode === 'failed'
        ? 'section.meta.brief.none'
        : null
  const subSteps =
    stepper.current === 'brief' && stepper.running && briefSteps.steps.length > 0
      ? briefSteps.steps.map((s) => ({ key: s.step, label: t(s.labelKey), state: s.state }))
      : bandSubSteps(body.stepProgress, stepper.current)
  const progressBand = (
    <ProgressBand
      t={t}
      view={stepper}
      locale={locale}
      busy={busy || briefJob.pressing}
      disabled={limitReached && ['build', 'retry-build', 'rebuild'].includes(stepper.action?.kind ?? '')}
      subSteps={subSteps}
      buildSteps={<DemoProgress t={t} row={row} locale={locale} now={now} open />}
      error={briefJob.refusedCode === null ? null : gateText(t, briefJob.refusedCode)}
      onAction={onStep}
    />
  )
  const reviewChip = approval === null ? null : reviewChipOf(stepper)
  // The seller's own doors (#537): each answers the refusal code, or null once it went through and Details reloaded.
  const settle = async (answer: { ok: boolean; code?: string }): Promise<string | null> => {
    if (!answer.ok) return answer.code ?? 'HTTP'
    await reload()
    onChanged()
    return null
  }
  const approveProfile = async (): Promise<string | null> => {
    const code = await settle(await api.approveProfile(id))
    if (code === null) onSection(null)
    return code
  }
  const approveBrief = async (): Promise<string | null> => {
    const code = await settle(await api.approveBrief(id))
    if (code === null) onSection(null)
    return code
  }
  // Add source keeps the whole refusal: its line may name the platform or the most listing pages.
  const addSource = async (url: string): Promise<AddSourceRefusal | null> => {
    const answer = await api.addSource(id, url)
    if (!answer.ok) return answer
    await reload()
    onChanged()
    return null
  }
  const uploadMedia = async (file: File): Promise<string | null> => settle(await api.uploadMedia(id, file))
  const approvedLine = (key: string, at: unknown): string | null => {
    const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN
    if (!Number.isFinite(ms)) return null
    return t(key, { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms) })
  }
  const researchRunning = job?.state === 'running' || job?.state === 'queued'
  const addSourceButton = (
    <AddSourcePopover t={t} researched={research.done} researchRunning={researchRunning} onAdd={addSource} />
  )
  const researchAgainOpen =
    job !== null &&
    !researchRunning &&
    !(researchAgain.phase === 'ready' && researchAgain.preview?.plan === null)
  const facts = [...meta.map(String), added ? t('research.added', { ago: added }) : null].filter(
    (v): v is string => typeof v === 'string' && v !== ''
  )
  const keyMessagesRows = (titled: boolean): JSX.Element | null =>
    keyMessages.length === 0 ? null : (
      <ProfileKeyMessages
        key={keyMessages.map((m) => `${m.id}:${m.label}`).join('|')}
        t={t}
        messages={keyMessages}
        onSave={saveKeyMessages}
        titled={titled}
      />
    )
  // The name and the hours keep their own doors (`setName`, `setHours`); in the table they edit like any other fact.
  const editNameCell = (value: string): JSX.Element => (
    <EditableText
      key={`name:${value}`}
      t={t}
      value={value}
      label={t('field.name')}
      edited={false}
      editedKey="profile.editedByYou"
      maxLength={200}
      onSave={async (typed) => (typed.trim() === value.trim() ? true : saveName(typed.trim()))}
    />
  )
  const editHoursCell = (value: string): JSX.Element => {
    const lines = hoursRow?.hours ?? value.split(';').map((line) => line.trim())
    return (
      <EditableText
        key={`hours:${lines.join('|')}`}
        t={t}
        value={lines.join('\n')}
        label={t('field.hours')}
        edited={false}
        editedKey="profile.editedByYou"
        multiline
        maxLength={1200}
        onSave={async (typed) => {
          const hours = typedHours(typed)
          if (hours.length === 0 || hours.join('|') === lines.join('|')) return true
          return (await saveHours({ choice: 'edit', hours })) === 'ok'
        }}
      />
    )
  }
  // A row the seller corrected (#524) came from them, whatever research said.
  const factRows = businessBriefRows(placeProfile.profile, placeProfile.decisions, t, locale).map((r) =>
    r.field !== null && profileEditView(profile, r.field)?.edited
      ? { ...r, source: t('brief.source.you') }
      : r
  )
  // In the Profile's order, with the place's website (read only) when the brief states none.
  const siteRow = factRows.length === 0 ? null : websiteRow(factRows, website, t)
  const briefRows = orderBriefRows(siteRow === null ? factRows : [...factRows, siteRow])
  const websiteLink = (url: string): JSX.Element => (
    <a className="tracy-wo-action-link" href={url} target="_blank" rel="noopener noreferrer">
      {viewsHostOf(url) ?? url}
      <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
    </a>
  )
  // Once research is done and the brief lists its facts, the Business brief table is the one place to check them.
  const tableListsFacts = research.done && briefRows.length > 0
  const briefValue = (row: (typeof briefRows)[number]): JSX.Element | null => {
    // The website no door edits: its link, read only.
    if (row.readOnly) return website === null ? null : websiteLink(website)
    // The seller's own edit shows at once, before a new brief freezes it (#524).
    if (row.field === null || !research.done) return null
    if (row.field === 'name') return editNameCell(row.value)
    if (row.field === 'hours') return editHoursCell(row.value)
    const mine = profileEditView(profile, row.field)
    return editProfileRow(row.field, mine?.edited ? mine.value : row.value)
  }
  const summaryRows = briefSummaryRows(briefRows)
  const mediaView = mediaRowView({ profile, media, sources })
  const profileRows = profileFields(profile)
  const researchMoving = researchMovingOf({ research, researchJob: job })
  const metas = sectionMetas({
    research,
    researchJob: job,
    profile: {
      filled: profileRows.length + (ratingRow === null ? 0 : 1) + (readingRows === null ? 0 : 1),
      total: PROFILE_FIELDS.length + 2
    },
    sources: sourceCounts(shownSources),
    briefJob: briefJob.job,
    brief: isRecord(body.brief) ? body.brief : null,
    media: {
      photos: mediaView.photos.groups.reduce((n, g) => n + g.tiles.filter((m) => m.stored).length, 0),
      videos: mediaView.videos.tiles.filter((m) => m.stored).length
    },
    demo: demoView.state,
    locale
  })
  const metaOf = (id: SectionId) => metas.find((e) => e.id === id)
  // What else research read about the place (menu, Google, reviews, current website, social, place profile).
  const hasMore =
    research.done &&
    (menu !== null ||
      googlePlaceView(profile?.googlePlace) !== null ||
      pageSpeedView(profile?.pageSpeed) !== null ||
      socialStatsLines(profile, now).length > 0 ||
      placeProfile.profile !== null ||
      placeProfile.failed ||
      tripadvisorReviewView(profile, media).length > 0)

  // The compact Business facts card of Details: the plain rows, read only (#537); the sub-page holds the cards. While
  // research runs it holds nothing partial: progress shows in the band only.
  const profileBlock = (): JSX.Element => (
    <Profile
      t={t}
      profile={researchMoving ? null : profile}
      bare
      emptyKey={
        researchMoving ? 'reason.not_collected' : research.done ? 'detail.noProfile' : 'research.profileEmpty'
      }
      website={research.done && !researchMoving ? { url: website, link: websiteLink } : null}
    />
  )
  const briefTable = (full: boolean): JSX.Element => (
    <BusinessBriefTable
      t={t}
      rows={full ? briefRows : summaryRows}
      firstRow={<SiteNameRow t={t} api={api} opportunityId={id} readOnly={!full} />}
      editValue={full ? briefValue : (r) => (r.readOnly && website !== null ? websiteLink(website) : null)}
      readOnly={!full}
      onToggle={toggleFact}
    />
  )

  const openBrief = (revisionId: string, n: number): void => {
    if (openBriefTab === null) return onOpenRevision(revisionId, false)
    openBriefTab({
      revisionId,
      opportunityId: id,
      title: `${t('brief.number', { n })} · ${shownName}`
    })
  }
  const briefLine = (
    <BriefLine
      t={t}
      brief={body.brief}
      research={body.research}
      briefJob={briefJob}
      profileEditedAt={editedAt}
      review={approval === null ? null : { lockKey: stepper.steps[1]?.lockKey ?? null }}
      onOpen={openBrief}
    />
  )
  const mediaBlock = (full: boolean): JSX.Element => (
    <MediaRow
      t={t}
      menu={menu}
      view={mediaView}
      open={full}
      bare
      retryLogo={{ busy: logoBusy, failed: logoFailed, onPress: () => void retryLogo() }}
      food={profile?.trade === 'food'}
    />
  )
  const cancelButton =
    cancellable !== null ? (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={busy}
        onClick={() => void cancel(cancellable)}
      >
        {t('job.cancel')}
      </Button>
    ) : null
  const errors = (
    <>
      {actionFailed || deleteFailed !== null ? (
        <p className="tracy-wo-error" role="alert">
          {t(deleteFailed ?? 'action.failed')}
        </p>
      ) : null}
      {logoWait ? (
        <p className="tracy-wo-note" role="status">
          {t('demo.logoPending')}
        </p>
      ) : null}
    </>
  )
  const dialogs = (
    <>
      {/* Research again asks here, from the step strip or the page menu (the Sources sub-page is gone, #537). */}
      <ResearchAgainDialog t={t} locale={locale} name={row.name ?? ''} control={researchAgain} />
      <DeleteDialog
        t={t}
        locale={locale}
        ask={deleting}
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
  const previewPanel = <PreviewPanel preview={preview} /> // [TAM]

  // A section opened as a sub-page: that section alone, whole.
  if (section !== null) {
    const shown = pageOf(section)
    const content =
      shown === 'profile' ? (
        <BusinessFactsPage
          t={t}
          locale={locale}
          view={businessFactsView({
            profile,
            candidate,
            name: shownName,
            researched: research.done && !researchMoving,
            approval,
            briefCreatedAt:
              isRecord(body.brief) && typeof body.brief.createdAt === 'string' ? body.brief.createdAt : null,
            colors: mediaView.colors.state === 'found' ? mediaView.colors.colors : [],
            reviews: [
              ...(googlePlaceView(profile?.googlePlace)?.reviews ?? []).map((r) => ({
                ...r,
                source: 'google'
              })),
              ...tripadvisorReviewView(profile, media).map((r) => ({ ...r, source: 'tripadvisor' }))
            ],
            // Each chip's collected time and page address (#537).
            sources
          })}
          media={mediaView}
          food={profile?.trade === 'food'}
          running={researchMoving}
          websiteLink={websiteLink}
          doors={{
            nameRow:
              nameRow === null ? null : (
                <ProfileNameRow
                  key={`${nameRow.name}:${nameRow.chip}`}
                  t={t}
                  view={nameRow}
                  onSave={saveName}
                />
              ),
            saveName,
            field: (field, value) => editProfileRow(field, value, true),
            saveHours,
            saveRating,
            pickReading,
            readingRows: (groups) =>
              readingRows === null ? null : (
                <ProfileReadingRows t={t} view={readingRows} onPick={pickReading} groups={groups} />
              ),
            keyMessages: keyMessagesRows(false),
            uploadMedia,
            retryLogo: { busy: logoBusy, failed: logoFailed, onPress: () => void retryLogo() }
          }}
          researchDetails={
            hasMore ? (
              <div className="tracy-wo-psec-more">
                <MenuBlock t={t} locale={locale} menu={menu} name={shownName} again={readMenuAgain} />
                <GooglePlace
                  t={t}
                  place={googlePlaceView(profile?.googlePlace)}
                  food={profile?.trade === 'food'}
                />
                <TripadvisorReviews t={t} profile={profile} media={media} />
                <CurrentSite t={t} site={pageSpeedView(profile?.pageSpeed)} />
                <Social t={t} lines={socialStatsLines(profile, now)} />
                <PlaceProfileBlock t={t} profile={placeProfile.profile} failed={placeProfile.failed} />
              </div>
            ) : null
          }
        />
      ) : !research.done ? (
        <p className="tracy-wo-psec-lock">{t('section.locked.research')}</p>
      ) : briefEmpty !== null ? (
        <p className="tracy-wo-muted">{t(briefEmpty)}</p>
      ) : effective.brief == null && isRecord(body.brief) ? (
        // A reset upstream: the old brief is not shown at all, the page reads as not made yet.
        <p className="tracy-wo-psec-lock">
          <Lock aria-hidden="true" className="tracy-wo-icon" />
          {t(stepper.steps[1]?.lockKey ?? 'workspace.wait.brief')}
        </p>
      ) : (
        <>
          {briefLine}
          {briefTable(true)}
          {tableListsFacts ? <p className="tracy-wo-muted tracy-wo-small">{t('profile.editNote')}</p> : null}
        </>
      )
    // Back and Approve in the header (#537): on the Profile once research is done, on the brief once one is made and
    // current; elsewhere on those two pages only Back.
    const approvalView: ApprovalView | null =
      approval === null
        ? null
        : shown === 'profile'
          ? {
              kind: 'profile',
              pending: approval.profile !== 'none' && approval.profile !== undefined,
              approvedLine:
                approval.profile === 'approved'
                  ? approvedLine('approve.done.profile', approval.profileApprovedAt)
                  : null,
              onBack: () => onSection(null),
              onApprove: approveProfile
            }
          : shown === 'brief'
            ? {
                kind: 'brief',
                pending:
                  effective.brief != null && (approval.brief === 'needed' || approval.brief === 'approved'),
                approvedLine:
                  effective.brief != null && approval.brief === 'approved'
                    ? approvedLine('approve.done.brief', approval.briefApprovedAt)
                    : null,
                onBack: () => onSection(null),
                onApprove: approveBrief
              }
            : null
    return (
      <div className="tracy-wo-page tracy-wo-details" ref={page}>
        {errors}
        <SubPage
          t={t}
          section={section}
          name={shownName}
          meta={metaOf(shown)}
          progress={stepperBlock(true)}
          onList={onList}
          onSection={onSection}
          approval={approvalView}
        >
          {content}
        </SubPage>
        {dialogs}
        {previewPanel /* [TAM] */}
      </div>
    )
  }

  return (
    <div className="tracy-wo-page tracy-wo-details" ref={page}>
      <DetailsHeader
        t={t}
        name={shownName}
        branch={row.branch ?? null}
        facts={facts}
        status={
          reviewChip === null ? (
            <StatusBadge status={placeStatus(row, t)} />
          ) : (
            <Badge variant="outline" className={`tracy-wo-details-chip ${CHIP_CLASS[reviewChip.tone]}`}>
              {t(reviewChip.key)}
            </Badge>
          )
        }
        busy={busy}
        onBack={onList}
        menu={{
          onResearchAgain: researchAgainOpen ? researchAgain.onOpen : undefined,
          onDelete: () => setDeleting({ ids: [row.id], withSite: hasLiveDemo(row) ? 1 : 0, name: shownName })
        }}
      />
      {errors}
      {progressBand}
      <WorkspaceCard
        t={t}
        opportunityId={id}
        onSection={onSection}
        addSource={addSourceButton}
        input={{
          stepper,
          researchDone: research.done,
          researchMoving,
          researchedAt: research.researchedAt,
          sources: overviewStates,
          fields: profileRows.length,
          brief: effective.brief != null && isRecord(body.brief) ? { n: Number(body.brief.n ?? 1) } : null,
          briefEmpty:
            briefSteps.mode === 'running' ? 'running' : briefSteps.mode === 'failed' ? 'failed' : null,
          demo: effective.demo,
          demoHost: demoHostOf(demoCommand('primary', row, body)),
          locale
        }}
        bodies={{
          sources: (
            <div className="tracy-wo-stack">
              <SourcesTable
                t={t}
                sources={overviewSources}
                researched={sourcesRead}
                progress={sourceProgress}
                retry={retrySource}
                remove={removeSourceControl}
                researchState={research.state}
              />
              {cancelButton !== null ? <span className="tracy-wo-row">{cancelButton}</span> : null}
            </div>
          ),
          profile: (
            <div className="tracy-wo-stack tracy-wo-profile-card">
              {profileBlock()}
              {/* Photos & video belong to the Business facts (#537): a strip at its foot, opened on its sub-page. */}
              {!researchMoving &&
              (research.done ||
                mediaView.videos.tiles.length > 0 ||
                mediaView.photos.groups.some((g) => g.tiles.length > 0)) ? (
                <div className="tracy-wo-profile-media">
                  <div className="tracy-wo-profile-media-head">
                    <span>
                      {t('details.section.media')}
                      {metaOf('media')
                        ? ` · ${(metaOf('media')?.status ?? []).map((x) => t(x.key, x.params)).join(', ')}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="tracy-wo-open"
                      aria-label={t('section.openNamed', { section: t('details.section.media') })}
                      onClick={() => onSection('media')}
                    >
                      {t('media.strip.open')}
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                  {mediaBlock(false)}
                </div>
              ) : null}
            </div>
          ),
          brief: (
            <div className="tracy-wo-stack">
              {briefLine}
              {briefTable(false)}
            </div>
          ),
          demo: (
            <div className="tracy-wo-stack">
              {send ? (
                <SendDemo key={row.id} t={t} draft={send} locale={locale} onClose={() => setSend(null)} />
              ) : null}
              <DemoSiteBlock
                t={t}
                row={row}
                detail={body}
                locale={locale}
                now={now}
                busy={busy}
                bare
                limitReached={limitReached}
                onCommand={onDemo}
                estimate={
                  buildChoice(buildChoices, row.latestRevision?.cms ?? '', null, null, recommended).template
                    ?.estimate
                }
              />
              <DemoHistory t={t} revisions={revisions} builds={asArray<unknown>(body.builds)} />
            </div>
          )
        }}
      />
      {dialogs}
      {previewPanel /* [TAM] */}
    </div>
  )
}

function Profile({
  t,
  profile,
  bare = false,
  emptyKey = 'detail.noProfile',
  website = null
}: {
  t: Translate
  profile: Body | null
  /** The place's website row after the hours, read only (no door edits it); null before research. */
  website?: { url: string | null; link: (url: string) => JSX.Element } | null
  /** What an empty card says: before this card's research, how to fill it (#524); while it runs, Not collected yet. */
  emptyKey?: string
  /** Inside the Business facts section of Details, which carries the title: no card of its own. */
  bare?: boolean
}): JSX.Element | null {
  const rows = profileFields(profile)
  const drawn: JSX.Element[] = []
  for (const field of PROFILE_FIELDS) {
    if (field === 'bio' && website !== null)
      drawn.push(
        <div key="website" className="tracy-wo-field">
          <dt className="tracy-wo-muted tracy-wo-small">{t('field.website')}</dt>
          <dd>{website.url === null ? t('cell.website.none') : website.link(website.url)}</dd>
        </div>
      )
    const row = rows.find((r) => r.field === field)
    if (row)
      drawn.push(
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
  }
  return (
    <Section title={t('detail.profile')} bare={bare}>
      {drawn.length === 0 ? (
        <p className="tracy-wo-muted">{t(emptyKey)}</p>
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
 * Every demo of the place (Lee, 23/10/2026), with what it was built with and the brief it came from; nothing until
 * there is a history (the Demo site block says what comes next).
 */
function DemoHistory({
  t,
  revisions,
  builds
}: {
  t: Translate
  revisions: Revision[]
  builds: unknown[]
}): JSX.Element | null {
  const locale = interfaceLocale() ?? 'en'
  const rows = demoRows(builds, revisions)
  if (rows.length === 0) return null
  return (
    <div className="tracy-wo-stack">
      <h4 className="tracy-wo-h3">{t('demos.title')}</h4>
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
              <span className="tracy-wo-muted tracy-wo-small tracy-wo-brief-facts">{facts.join(' · ')}</span>
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
    </div>
  )
}

/**
 * The brief line at the top of the Business brief section (Lee, 23/10/2026): a brief is the research frozen once and
 * names no template; the line says whether the research still reads the same, with View brief to read it, and the
 * Content brief job's steps while a new one is made in the background (`brief-control.tsx`).
 */
function BriefLine({
  t,
  brief,
  research,
  briefJob,
  profileEditedAt,
  review = null,
  onOpen
}: {
  t: Translate
  brief: unknown
  /** This card's research (#524): the brief waits for it. */
  research: unknown
  /** The Content brief job (#524), made in the background and pressed from the stepper (`brief-control.tsx`). */
  briefJob: BriefJobControl
  /** When the seller last edited the Profile: a newer edit makes the brief out of date in its own words. */
  profileEditedAt: string | null
  /**
   * The seller's approvals (#537), when the server sends them: the brief step's lock line (it replaces Make and
   * Refresh while the Profile waits for approval). Its words replace the older out-of-date line.
   */
  review?: { lockKey: string | null } | null
  onOpen: (revisionId: string, n: number) => void
}): JSX.Element {
  const locale = interfaceLocale() ?? 'en'
  const status = briefStatus(brief)
  const edited = isRecord(brief) && brief.editedBySeller === true
  const when = status ? relativeTime(status.createdAt, Date.now(), locale) : ''
  const view = briefControlView({ research, brief, briefJob: briefJob.job, profileEditedAt })
  const chip = briefChip(view)
  // While a new brief is being made, the old one is only named: its out-of-date reason is already being acted on.
  const lineKey = chip === 'working' || review != null ? 'brief.number' : briefLineKey(brief, profileEditedAt)
  return (
    <div className="tracy-wo-stack">
      {status === null ? (
        chip !== null || view.mode === 'locked' ? null : (
          <p className="tracy-wo-muted">{t('brief.none')}</p>
        )
      ) : (
        <div className="tracy-wo-row tracy-wo-wrap">
          <p className="tracy-wo-muted">{t(lineKey, { n: status.n, when })}</p>
          {chip === null ? null : (
            <Badge
              variant="outline"
              className={chip === 'working' ? 'tracy-wo-chip-brand' : 'tracy-wo-chip-bad'}
            >
              {t(`brief.chip.${chip}`)}
            </Badge>
          )}
          <Button type="button" size="xs" variant="outline" onClick={() => onOpen(status.id, status.n)}>
            <FileText aria-hidden="true" />
            {t('brief.view')}
          </Button>
        </div>
      )}
      {edited ? <p className="tracy-wo-muted tracy-wo-small">{t('brief.editedByYou')}</p> : null}
      {review?.lockKey ? (
        <p className="tracy-wo-psec-lock tracy-wo-small">
          <Lock aria-hidden="true" className="tracy-wo-icon" />
          {t(review.lockKey)}
        </p>
      ) : review != null && view.mode === 'make' ? null : (
        // With approvals the Progress band carries Make and Make again; this block keeps the job's own progress.
        <BriefControl t={t} view={view} control={briefJob} />
      )}
    </div>
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
  const page = useRevisionPage(api, revisionId)
  const { revision, markdown, lastBuildId, usage, suggestedLabel, siteLabel, failed } = page
  const [name, setName] = useState<string | null>(null)
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
        <PageState t={t} failed={failed} failedKey="revision.failed" onRetry={() => void page.reload()} />
      </div>
    )
  }
  return (
    <div className="tracy-wo-page">
      {crumbs}
      <div className="tracy-wo-page-grid is-brief">
        <div className="tracy-wo-col">
          <BriefUnderstanding t={t} brief={revision.brief} markdown={markdown} />
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
            siteLabel={siteLabel}
            usage={usage}
            initialBuildId={lastBuildId}
            focusName={focusName}
          />
        </div>
      </div>
    </div>
  )
}

/** The templates this server offers per CMS and the one /ops/wo pins (`GET /capabilities`); null until read or when absent. */
function useBuildChoices(api: Api): BuildChoices | null {
  const [choices, setChoices] = useState<BuildChoices | null>(null)
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
  return choices
}

/**
 * The designs the template picker recommends for this opportunity's trade (`templateRanking`), so the Build card and
 * the Demo site block show the same template the picker puts first; empty until read or when the trade is unknown.
 */
function useRecommendedDesigns(api: Api, opportunityId: string): string[] {
  const [recommended, setRecommended] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void rankingFor(api, [opportunityId]).then((ranking) => {
      if (live) setRecommended(ranking?.recommended ?? [])
    })
    return () => {
      live = false
    }
  }, [api, opportunityId])
  return recommended
}

export function Build({
  t,
  api,
  ids,
  revisionId,
  opportunityId,
  onStarted,
  cms,
  suggestedLabel,
  siteLabel = null,
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
  /** Site name on Tracy saved on the opportunity (#519); shown before the suggestion. */
  siteLabel?: string | null
  /** The revision's latest build, so a reload still shows its site and the handoff. */
  initialBuildId?: string | null
  focusName?: boolean
}): JSX.Element {
  const labelId = useId()
  const locale = interfaceLocale() ?? 'en'
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
  const label = buildLabel(typed, siteLabel, suggestedLabel)
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

  // The card shows the template the picker recommends for this business (else the one /ops/wo pins); the person
  // chooses in the same template picker the Demo site block opens, never with one click here.
  const choices = useBuildChoices(api)
  const recommended = useRecommendedDesigns(api, opportunityId)
  const { cms: buildCms, template: buildTemplate } = buildChoice(choices, cms, null, null, recommended)

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
        { id: opportunityId }
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
      {buildId === null ? (
        buildTemplate ? (
          <div className="tracy-wo-field">
            <span className="tracy-wo-label">{t('build.template')}</span>
            <span>
              {buildTemplate.label} · {CMS_LABEL[buildCms] ?? buildCms}
            </span>
            <span className="tracy-wo-muted tracy-wo-small">{t('build.pickNote')}</span>
          </div>
        ) : (
          <p className="tracy-wo-muted tracy-wo-small">{t('build.cmsNote')}</p>
        )
      ) : null}
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
        <span className="tracy-wo-muted tracy-wo-small">{t(buildLabelHintKey(typed, siteLabel))}</span>
      </label>
      {buildId === null ? (
        <Button type="button" disabled={busy || usageFull(usage)} onClick={() => void start()}>
          {busy ? <Spinner label={t('build.running')} /> : <Hammer aria-hidden="true" />}
          {t('build.start')}
        </Button>
      ) : null}
      {buildId === null ? <BuildEstimate t={t} locale={locale} estimate={buildTemplate?.estimate} /> : null}
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
        <p className="tracy-wo-muted tracy-wo-small">{failureReasonText(failure.reason, t)}</p>
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
