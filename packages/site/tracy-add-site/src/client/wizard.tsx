import { chatDraftAnswers, type chatDraftOf } from './chat-draft.mjs'
/**
 * The add-site flow: pick a source → name it → watch it build → receive the handover.
 *
 * ONE SCREEN FOR THE FIRST QUESTION, TWO SOURCES — not two doors behind a menu. `tracy-desk`
 * `AddSitePopup.tsx` once did it the other way and dropped it on 24/08, with the reason written in the file: a two-verb
 * menu *"makes people answer a question before either door can say anything about itself"*. Two radios ask the
 * question exactly where the answer is given.
 *
 * `create` is preselected: a site that does not exist yet has nowhere else to be created, while
 * import { tracyWebFetch as fetch } from '@tracy/core/web-path'
 * importing an existing site has other doors too (onboarding, a teammate's invitation).
 *
 * THREE STAGES, ONE COMPONENT. Form → console → handover are three faces of one job, and keeping them
 * in one React tree is what keeps `siteKey`/`jobId` from detouring through an external
 * store. A console that reopens after the tab is closed does NOT exist yet — it needs storage more durable than the component's
 * state, and it is task D6.
 *
 * THE UI is `@tracy/ui` components on Tailwind utility classes (since 03/09): Button,
 * Input, Label, RadioGroup, Separator, Alert. Colours go only through tokens — no `#hex` here, and
 * dark mode follows dsh automatically (DESIGN.md §1.2). The remaining hand-written CSS is in `styles.ts`.
 */

import { interfaceLocale } from '@tracy/core/interface-languages'
import { uiSwitches } from '@tracy/core/ui-switches'
import {
  Alert,
  AlertDescription,
  Button,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Label,
  RadioGroup
} from '@tracy/ui'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { type JSX, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
// The left column's own reading of "which site is this page open on" — reused, not restated.
import { currentSiteKey, readSites, sharedSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'
import { START_POLL_MS } from './agent-start.mjs'
import { agentWaitVerdict, buildLanding, pressAgent, watchBuild } from './build-watch.mjs'
import { CHIP_SELECTED, ChoiceOption, FIELD_LABEL, Note } from './choice'
import {
  type CreateRefused,
  createSite,
  type JobState,
  openingId,
  openingUsed,
  pollJob,
  started,
  wizardOpened,
  wizardStep
} from './create'
import { createDoneBefore, createEntryStep, createNextStep, createStepIds } from './create-navigation.mjs'
import { CreateRefusalProblem, CreateStep } from './create-step'
import { createRefusalGuidance, createRefusalTitle, REDIRECT_WAIT_MS } from './create-step-model.mjs'
import { DesignSystemCard } from './design-system-card'
import { pickLine, pickOf, quickstartTagOf, swatchesOf } from './design-system-pick.mjs'
import { PickStep, ReadyPick, usePickRetry } from './design-system-ready'
import { DesignSystemPage } from './design-system-sheet'
import { useDesignSystemField } from './design-system-state'
import { chosenDesign } from './dsh-url'
import { forkUrlRefusal, normalizeForkUrl } from './fork-url.mjs'
import { FromBusiness } from './from-business'
import { keptBusiness } from './from-business-flow.mjs'
import { ImportProblem } from './import-problems'
import { recoveryAsk } from './import-recovery.mjs'
import { ImportWizard } from './import-wizard'
import { nativeBriefAnswers, readNativeSeed } from './native-seed.mjs'
import { readyLanding, workspacePath } from './open-workspace.mjs'
import { CREATE_PLATFORMS, type CreatePlatform, DEFAULT_CREATE_PLATFORM, toggleKeyFor } from './platforms'
import { applyPress, chosenPlatform, initialPress } from './press-state.mjs'
import { canFrameCopy } from './preview.mjs'
import { QuestionsPage, type QuestionsState, QuestionsStatus, type SheetAnswers } from './questions-sheet'
import {
  backgroundKey,
  clearJob,
  onScreen,
  pendingForSite,
  readPending,
  rememberSeen,
  writePending
} from './resume.mjs'
import {
  briefAnswered,
  briefProgress,
  carryAnswers,
  EMPTY_BRIEF,
  fetchSiteQuestions,
  QUESTIONS_FAILED,
  type SiteQuestionsServed,
  sheetOrder,
  toBrief
} from './site-brief.mjs'
import { useSiteDomain } from './site-domain'
import { siteLabelRefusal } from './site-label.mjs'
import {
  appliesTo,
  buildsOn,
  designFor,
  previewOf,
  START_TEMPLATE,
  startTemplateFrom
} from './start-template.mjs'
import { StartingDesignGallery } from './starting-design-gallery'
import { startingDesignImage } from './starting-design-image.mjs'
import { stepsFrom } from './steps.mjs'
import type { Translate } from './strings'
import { chatCarryOf, draftOf, forgetDraft, keepDraft } from './wizard-draft.mjs'
import { WizardFooter } from './wizard-footer'
import { reviewBusiness, WizardReview } from './wizard-review'
import { WizardSteps } from './wizard-steps'
import { wizardStepName } from './wizard-usage.mjs'

/**
 * The store for the unfinished-run pointer.
 *
 * Read through a function rather than captured once: touching `window.localStorage` THROWS when the browser
 * blocks third-party storage, and dsh runs in an iframe on the `web` surface. One throw at module load
 * loses the whole tab.
 * @returns The store, or null when unusable.
 */
/** This tab's own storage, or null — where the wizard opening's id lives (`openingId`). */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * The environment's address prefix — `''` in production, `dev-` on dev. ASK THE SERVER, DO NOT GUESS.
 *
 * 🔒 THE SCREEN ONCE PROMISED AN ADDRESS THE FLEET NEVER CREATES. This place used to draw
 * `<name>.tracy.ai` straight from `FLEET_ZONE`, while `seat-registry`'s `handleCreateSite` builds
 * `${SITE_ADDRESS_PREFIX}${label}.${zone}`. On dev that meant the user typed `devprobe0908`, read
 * on screen "your site will answer at `devprobe0908.tracy.ai`", and the fleet then built
 * `dev-devprobe0908.tracy.ai`. Measured 08/09 by walking the wizard to its last step.
 *
 * A promise the system does not keep is worse than no preview: people copy that address, type it
 * into DNS, or tell their customers.
 *
 * `''` is the right default: production has no prefix, and a failed ask draws like production
 * rather than making up extra letters.
 */
function useAddressPrefix(): string {
  const [prefix, setPrefix] = useState('')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // The page's one `/api/sites` answer, shared with the left column (`sharedSites`).
        const body = (await sharedSites()) as { addressPrefix?: string } | null
        if (!cancelled && typeof body?.addressPrefix === 'string') setPrefix(body.addressPrefix)
      } catch {
        // Keep `''`. See the note above: guessing extra letters is worse than drawing too few.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return prefix
}

/**
 * The tab's root. `tas-root` anchors the hand-written CSS (`styles.ts`); the rest is utilities.
 * `text-sm` sets the base font size for everything inside — `@tracy/ui` components carry their own sizes.
 */
const ROOT = 'tas-root flex h-full flex-col gap-4 overflow-y-auto p-4 text-foreground text-sm'

/** One group: label + control + helper line. The same spacing in both branches. */
const GROUP = 'flex flex-col gap-2'

type Origin = 'create' | 'import' | 'fork' | 'business'

/**
 * Card #3 (fork from a URL) is hidden from 22/09. The branch stays wired so turning it back on
 * is this one flag; while false nothing can select `origin === 'fork'`.
 */
const FORK_ENABLED = false

/** The operator's switch of Build from my business (`ui-switches/catalogue.json`, default off). */
const switches = uiSwitches()
const FROM_BUSINESS = 'site-from-business'

/** The flow's stage. `building` and `ready` carry the same `siteKey` — the same site. */
type Stage =
  /** `note`: the build that was on screen is gone (403/404) — said on the form, never silently. */
  | { at: 'form'; note?: 'gone' }
  | {
      at: 'building'
      /** The job door has gone unanswered for `UNREACHABLE_SAY_MS` (`build-watch.mjs`); asking goes on. */
      unreachable?: boolean
      signedOut?: boolean
      slow?: boolean
      siteKey: string
      jobId: string
      platform: string
      job: JobState | null
      /**
       * The milestones seen, joined.
       *
       * 🔒 THEY MUST ACCUMULATE HERE, because the job row carries only **one** milestone: `step` is where the fleet stands,
       * not a log. Without accumulating, the console has exactly one line and it jumps — people
       * cannot see where the work has been.
       *
       * Lost when the tab closes, and that is a deliberate trade-off: the stored pointer is a QUESTION, not
       * the old answer (`resume.mjs`). Reopening midway, the console narrates from the current milestone — true,
       * just shorter.
       */
      seen: string
      /** Carried from the fork branch so a reload can re-open the workspace with `?fork=`. */
      forkUrl?: string
    }
  /**
   * The copy is built; the wizard has pressed "Start the agent" itself and is waiting for the
   * site's row in `/api/sites` to carry an agent (`agent-start.mjs`). `since` bounds the wait.
   */
  | {
      at: 'starting'
      siteKey: string
      /** The build's pointer stays until the handover is over, so a refresh comes back here. */
      jobId?: string
      platform: string
      job: JobState
      seen: string
      /**
       * While `posting`, the press itself and the name of this attempt; once the press is answered,
       * when patience starts. A press still out is never read as an agent that failed to start.
       */
      since: number
      posting: boolean
      forkUrl?: string
    }
  /** `agent`: 'up' — one button into the workspace; 'failed' — the same button My Sites has, as the retry. */
  | {
      at: 'ready'
      siteKey: string
      jobId?: string
      platform: string
      job: JobState
      seen: string
      agent: 'up' | 'failed'
      forkUrl?: string
    }

/** Tells the left column (`tracy-sidebar` `other-sites.tsx`) a new site, hence a new workspace, exists. */
const SITES_CHANGED = 'tracy:sites-changed'
/** Asks the side card to show a site (`index.tsx`, the workspace site effect). */
const SHOW_SITE = 'tracy:show-site'

/** The site this page is open on (`/<siteKey>/`), or null on the creation workspace. */
function pageSite(): string | null {
  return currentSiteKey({
    pathname: location.pathname,
    basePathname: new URL(document.baseURI).pathname,
    cookie: document.cookie
  })
}

/**
 * The starting stage: if an unfinished run remains, go straight to the console.
 *
 * Read ONCE at mount (`useState` with an initializer), not on every render. And what is read
 * is only a question — the content comes from the first poll, a few seconds later.
 * @returns The initial stage.
 */
function initialStage(sessionId?: string, siteKey?: string): Stage {
  const own = pageSite()
  // ONE WORKSPACE, ONE SITE: a site's workspace shows a build of THAT site (or of the site a
  // workspace row asked for), never whatever a conversation there happened to start — that build
  // belongs to its own site's row. Only the creation workspace, which has no site, follows the
  // conversation.
  const pending = siteKey
    ? pendingForSite(storage(), siteKey)
    : own
      ? pendingForSite(storage(), own)
      : readPending(storage(), sessionId)
  if (!pending) return { at: 'form' }
  return {
    at: 'building',
    siteKey: pending.siteKey,
    jobId: pending.jobId,
    platform: pending.platform,
    job: null,
    seen: pending.seen ?? '',
    forkUrl: pending.forkUrl
  }
}

export interface WizardProps {
  t: Translate
  /**
   * This tab's own configuration (`pluginSettings['tracy:add-site']`). A switched-off platform
   * disappears from the picker; `undefined` means nobody has touched the gear yet, and the default is ON.
   */
  settings: Record<string, unknown>
  /** Open a site address in the sidebar, with a viewing session asked for — see `openSite` in `index.tsx`. */
  openSite: (url: string, siteKey: string) => void
  /** Opens the existing Design inspiration preview for the given template and platform. */
  /** Opens or focuses the existing My Sites tab through the host sidebar service. */
  onMySites?: () => void
  /** The dsh session this side card shows: the pending build pointer is kept per conversation. */
  sessionId?: string
  /** A site whose build to show first — one a workspace row asked for (`index.tsx`). */
  siteKey?: string
  /**
   * The platform a "Create with <CMS>" press asked for (`platformPressOf`), or undefined for a tab
   * opened without one — the wizard then starts on `DEFAULT_CREATE_PLATFORM`, and a later press
   * without one leaves the pill where it is.
   */
  pressedPlatform?: CreatePlatform
  /** The template that press starts from; undefined falls back to the address (`chosenDesign`). */
  pressedDesign?: string
  /** The origin card that press selects (`create` or `import`, from the start screen on `/new/`). */
  pressedOrigin?: 'create' | 'import' | 'business'
  /** Which press these came from: a new key re-applies them, the same key never does. */
  pressKey?: string
  chatDraft?: ReturnType<typeof chatDraftOf>
}

/**
 * Which platforms are offered.
 *
 * Not configured = on. An empty list when the operator has never opened the gear would be
 * a wizard that can do nothing, with no line saying why.
 * @param settings The tab's configuration.
 * @returns The platforms still switched on.
 */
function enabledPlatforms(settings: Record<string, unknown>) {
  return CREATE_PLATFORMS.filter((entry) => settings[toggleKeyFor(entry.value)] !== false)
}

/**
 * The console's milestones once the fleet is done, plus the one the wizard owns: the agent.
 *
 * Everything the fleet reported is done by now (a filled check each); the last row is the agent —
 * under way, up, or not — so the wait for it reads as the last step of the same job, not a new
 * spinner somewhere else. Same row shape as the live console above it.
 */
function Milestones({
  t,
  steps,
  agent
}: {
  t: Translate
  steps: Array<{ key: string; stringKey: string; done: boolean }>
  agent: 'active' | 'done' | 'failed'
}): JSX.Element {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {steps.map((step) => (
        <li key={step.key} data-done="1" className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="size-4 shrink-0 text-primary" />
          {t(step.stringKey)}
        </li>
      ))}
      <li
        key="agent-start"
        data-done={agent === 'done' ? '1' : '0'}
        data-agent={agent}
        className={cn('flex items-center gap-2 text-xs', agent === 'active' && 'text-muted-foreground')}
      >
        {agent === 'done' ? (
          <CheckCircle2 className="size-4 shrink-0 text-primary" />
        ) : agent === 'failed' ? (
          <XCircle className="size-4 shrink-0 text-destructive" />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        )}
        {t('step_agent_start')}
      </li>
    </ol>
  )
}

export function AddSiteWizard({
  t,
  settings,
  openSite,
  onMySites,
  sessionId,
  siteKey,
  pressedPlatform,
  pressedDesign,
  pressedOrigin,
  pressKey,
  chatDraft
}: WizardProps): JSX.Element {
  // The right column unmounts a tab that is off screen ("Change design" opens Design inspiration in
  // it), so the person's picks are kept per wizard scope and handed back under the same press
  // (`wizard-draft.mjs`, walkthrough 11/10/2026 bug 6).
  const draftScope = `${sessionId ?? ''}:${siteKey ?? ''}`
  const [kept] = useState(() => draftOf(draftScope, pressKey))
  const [chatKept] = useState(() => (chatDraft ? chatCarryOf(draftScope) : undefined))
  // Which card and platform a press lands on is `press-state.mjs`'s call; this holds the results.
  const [start] = useState(() =>
    initialPress({
      pressedPlatform,
      pressedDesign,
      pressedOrigin,
      addressDesign: chosenDesign(),
      defaultPlatform: DEFAULT_CREATE_PLATFORM,
      kept
    })
  )
  // The import recovery page (`?import=<siteKey>`, `import-recovery.mjs`): tracy-web sends a person
  // here instead of into a site whose import never finished, so the tab opens on the import branch.
  const [recovering] = useState(() => recoveryAsk(location.search))
  // A business this viewer is building from (`keptBusiness`) opens its own page again, where it follows on; a press
  // or a kept draft still wins.
  const [resuming] = useState(() => {
    if (pressedOrigin !== undefined || kept !== undefined) return false
    try {
      return keptBusiness(window.localStorage) !== null
    } catch {
      return false
    }
  })
  const [origin, setOrigin] = useState<Origin>(
    recovering ? 'import' : resuming ? 'business' : (start.origin as Origin)
  )
  const fromBusinessOn = useSyncExternalStore(switches.subscribe, () => switches.isShown(FROM_BUSINESS))
  const [currentStep, setCurrentStep] = useState<string>(() =>
    recovering || resuming
      ? 'platform'
      : createEntryStep({
          pressedOrigin,
          pressedPlatform,
          pressedDesign,
          addressDesign: chosenDesign(),
          keptStep: kept?.currentStep
        })
  )
  const [doneSteps, setDoneSteps] = useState<string[]>(
    () =>
      kept?.doneSteps ??
      createDoneBefore(
        createEntryStep({ pressedOrigin, pressedPlatform, pressedDesign, addressDesign: chosenDesign() }),
        createStepIds(true)
      )
  )
  const [returnToReview, setReturnToReview] = useState(kept?.returnToReview ?? false)
  const [customizeSkipped, setCustomizeSkipped] = useState(kept?.customizeSkipped ?? false)
  const [previewFailure, setPreviewFailure] = useState<{ url: string; siteKey: string } | null>(null)
  useEffect(() => {
    const failed = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (typeof detail?.url === 'string' && typeof detail.siteKey === 'string') setPreviewFailure(detail)
    }
    window.addEventListener('tracy:import-preview-failed', failed)
    return () => window.removeEventListener('tracy:import-preview-failed', failed)
  }, [])

  const [platform, setPlatform] = useState<CreatePlatform>(start.platform as CreatePlatform)
  // A press is applied once. The opener re-lands the same press (pending → ready) and better-sidebar
  // hands the tab over on every render, so re-applying on each would undo a pick made by hand; a
  // NEW press on the tab already open (a new `pressKey`) is what moves the pill — and the template:
  // a press of another card must not create from the previous card's template (#386).
  const appliedPress = useRef(pressKey)
  const [wantedDesign, setWantedDesign] = useState<string | undefined>(start.design)
  const [confirmedDesign, setConfirmedDesign] = useState<string | null>(null)
  useEffect(() => {
    // The address is read again, not kept: the press that named no design wrote it there last.
    const next = applyPress(appliedPress.current, {
      pressKey,
      pressedPlatform,
      pressedDesign,
      pressedOrigin,
      addressDesign: chosenDesign()
    })
    if (next === null) return
    appliedPress.current = next.key
    setConfirmedDesign(null)
    if (next.platform !== undefined) setPlatform(next.platform as CreatePlatform)
    if (next.origin !== undefined) setOrigin(next.origin as Origin)
    setWantedDesign(next.design)
    const step = createEntryStep({
      pressedOrigin: next.origin,
      pressedPlatform: next.platform,
      pressedDesign: next.design
    })
    setCurrentStep(step)
    setDoneSteps(createDoneBefore(step, createStepIds(true)))
    setReturnToReview(false)
  }, [pressKey, pressedPlatform, pressedDesign, pressedOrigin])
  const [name, setName] = useState(kept?.name ?? '')
  const [stage, setStage] = useState<Stage>(() => initialStage(sessionId, siteKey))
  // What is on screen now, for answers that arrive after an await (the poll below, `startAgent`).
  const lastBuildChecked = useRef(Date.now())
  const stageRef = useRef(stage)
  stageRef.current = stage
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // Usage (`tasks/todo-do-dung-that.md` U4): this opening's id, told to tracy-web now and sent again with
  // Create, so an opening that never reached Create can be counted. Not awaited; a failure says nothing.
  const wizardId = useRef<string>('')
  if (wizardId.current === '') wizardId.current = openingId(tabStorage())
  useEffect(() => {
    wizardOpened(wizardId.current, pageSite() === null ? 'new' : 'site')
  }, [])
  // Fork branch: the URL of the site whose look the customer wants to start from.
  const [forkUrl] = useState('')
  // Shown only after blur on the fork URL field (same pattern as address refusals).

  // The start template's card (start-template.mjs). null while loading or on any failure: the
  // preview is a bonus and never stands between the customer and Create site.
  //
  // WHICH card depends on the press (`wantedDesign`: the tab's press, else `?design=<id>` on the
  // address), and with neither the wizard falls back to the one template every Add site press used
  // before the gallery could reach here. A new press drops the old card first, and Create waits for
  // the card being read (`cardRead`) instead of sending what is on screen: during the read that is
  // no card at all, and a create with no design is built from the server's default template — not
  // the card just pressed. A late answer for an earlier press never lands (`live`).
  const [templates, setTemplates] = useState<any[]>([])
  const catalogueRead = useRef<Promise<any> | null>(null)
  const [startCard, setStartCard] = useState<unknown>(null)
  const cardRead = useRef<Promise<unknown>>(Promise.resolve(null))
  useEffect(() => {
    let live = true
    const wanted = wantedDesign
    setStartCard(null)
    // One catalogue read supplies every gallery choice and the existing create path.
    catalogueRead.current ??= fetch('/api/templates', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
    const read = catalogueRead.current.then((body) => {
      if (live) setTemplates(Array.isArray(body?.templates) ? body.templates : [])
      return startTemplateFrom(body, wanted)
    })
    cardRead.current = read
    void read.then((card) => {
      if (live) setStartCard(card)
    })
    return () => {
      live = false
    }
  }, [wantedDesign])

  /**
   * Start the site's agent through the same door as the "Start the agent" button on My Sites —
   * one door, not a second channel (Lee, 04/09). The wizard presses it the moment the copy is
   * built; pressing it again from the handover IS the retry, the way it is on My Sites.
   *
   * The screen moves to `starting` BEFORE the press is answered (#362 review): a finished build must
   * not stay on the building console, with its "Add another site", while a slow POST is out. The
   * answer only matters when it is a refusal, and then only if the screen is still on THIS attempt
   * (`since` names it) — a late answer never brings back a build the person has moved on from, nor
   * sets state on a wizard that is gone.
   *
   * Patience (`START_PATIENCE_MS`) counts from the ANSWER, not the press (#362 review): a door that
   * takes longer than four minutes to accept the press must not turn into "the agent failed" with
   * its success thrown away when it lands.
   */
  const startAgent = async (base: {
    siteKey: string
    jobId?: string
    platform: string
    job: JobState
    seen: string
    forkUrl?: string
  }) => {
    await pressAgent({
      base,
      press: async () => {
        const res = await fetch(`/api/sites/${encodeURIComponent(base.siteKey)}/agent`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        return res.ok
      },
      getStage: () => stageRef.current,
      show: (next: Stage) => {
        stageRef.current = next
        setStage(next)
      },
      isMounted: () => mounted.current
    })
  }
  const [busy, setBusy] = useState(false)
  // "Customize your site" (`questions-sheet.tsx`): the answers given so far, by question id, kept while the panel is
  // open (a refused name keeps them too), and whether its page is up.
  const [answers, setAnswers] = useState<SheetAnswers>(
    ((kept?.answers ?? chatKept?.answers) as SheetAnswers | undefined) ?? EMPTY_BRIEF
  )
  const chatApplied = useRef<Record<string, unknown>>(kept?.chatApplied ?? chatKept?.chatApplied ?? {})
  const chatEdited = useRef(new Set<string>(kept?.chatEdited ?? chatKept?.chatEdited ?? []))
  const answersRef = useRef(answers)
  answersRef.current = answers
  /** After a change of template kept or left behind some answers: said once on the page, gone when it closes. */
  const [carried, setCarried] = useState<{ kept: number; dropped: number } | null>(null)
  /**
   * The questionnaire of the template in sight, read as soon as the card says which one it is. `loading` until it
   * lands; `failed` when the door did not answer (the card then offers Try again); `none` when the set asks nothing.
   * Create site never waits on it: with no set in hand it makes the site without a brief.
   */
  const [questions, setQuestions] = useState<
    | { at: 'loading' | 'failed' | 'none' | 'unwritable' }
    | { at: 'ready'; served: SiteQuestionsServed; ordered: SiteQuestionsServed['questions'] }
  >({ at: 'loading' })
  const questionsRead = useRef<Promise<SiteQuestionsServed | null | 'failed'>>(Promise.resolve(null))
  /** Try again on the card: asks the same door once more. */
  const [questionsTry, setQuestionsTry] = useState(0)
  /** A refusal that came from the SERVER (`taken`, or a code no sentence matches). */
  const [refused, setRefused] = useState<CreateRefused | null>(null)
  const nameId = useId()

  const platforms = useMemo(() => enabledPlatforms(settings), [settings])
  // Zone of THIS deployment — production's `tracy.ai` by default, whatever `/api/config` answers
  // otherwise (Task 11).
  const zone = useSiteDomain()

  // Normalise at the CALLER, not inside `siteLabelRefusal`: a function that both checks and fixes would accept one
  // name and send another.
  const label = name.trim().toLowerCase()
  // An empty field is not an error — it is the not-yet-typed state. Speak only once something has been typed.
  const localRefusal = label === '' ? null : siteLabelRefusal(label)
  // Fork URL refusal: computed from the trimmed raw input.
  const forkUrlTrimmed = forkUrl.trim()
  const forkUrlLocalRefusal = forkUrlTrimmed === '' ? null : forkUrlRefusal(forkUrlTrimmed, zone)
  /**
   * The platform actually selected.
   *
   * `platform` holds the user's choice, but the operator may SWITCH OFF that very platform
   * in the tab's gear while the wizard is open. Without falling back to one still on, the screen
   * shows no lit button and a name typed into nowhere — a state nobody can choose their way
   * out of. Fall back softly rather than reset `platform`: if that platform is switched on again the old choice
   * comes back instead of being swallowed.
   */
  const chosen = chosenPlatform(platforms, platform)
  const addressPrefix = useAddressPrefix()

  // The start template as the form names it: only the create branch has one. Named whether or not
  // its picture loads (`previewOf`), with the platform beside it, so the customer reads which look
  // and which CMS Create site will use before pressing it. A card with no build on the platform in
  // sight is said as such (`startBuilds`), not hidden: the site would then start from no template,
  // and a form that simply stopped naming it looked like the pick had been lost.
  const startPreview = origin === 'create' && chosen ? previewOf(startCard) : null
  const startBuilds = chosen !== undefined && designFor(startCard, chosen.value) !== undefined

  // Design systems follow the starting design and use the selected template build.
  const dsShown = startPreview !== null && startBuilds
  const dsField = useDesignSystemField({
    shown: dsShown,
    card: startCard,
    platform: chosen?.value,
    kept: kept?.designSystem
  })
  const { ds } = dsField
  const nativeSeedAllowed = useRef(
    !kept && !siteKey && !pressKey && !pressedDesign && !pressedPlatform && stage.at === 'form'
  )
  const nativeSeed = useRef<Awaited<ReturnType<typeof readNativeSeed>>>(null)
  const seedState = useRef({ stage: stage.at, name, platform, wantedDesign, pressKey })
  seedState.current = { stage: stage.at, name, platform, wantedDesign, pressKey }
  useEffect(() => {
    if (!nativeSeedAllowed.current) return
    let live = true
    const initial = { ...seedState.current }
    void readNativeSeed(sessionId).then((seed) => {
      if (
        !live ||
        !seed ||
        !nativeSeedAllowed.current ||
        Object.keys(initial).some(
          (key) => initial[key as keyof typeof initial] !== seedState.current[key as keyof typeof initial]
        ) ||
        !platforms.some((entry) => entry.value === seed.platform)
      )
        return
      nativeSeedAllowed.current = false
      nativeSeed.current = seed
      setPlatform(seed.platform as CreatePlatform)
      setOrigin('create')
      setCurrentStep('system')
      setDoneSteps(createDoneBefore('system', createStepIds(true)))
      setWantedDesign(seed.template)
      setAnswers((current) => ({
        ...nativeBriefAnswers(
          questions.at === 'ready' ? questions.served.questions : [],
          seed.brief,
          current
        ),
        ...current
      }))
    })
    return () => {
      live = false
    }
  }, [sessionId])
  useEffect(() => {
    const seed = nativeSeed.current
    if (
      !seed?.designSystem ||
      ds.pick ||
      ds.support !== 'yes' ||
      !Array.isArray(ds.library) ||
      wantedDesign !== seed.template
    )
      return
    const row = ds.library.find((entry) => entry.id === seed.designSystem)
    if (row) ds.setPick(pickOf(row))
    seed.designSystem = null
  }, [ds.library, ds.support, ds.pick, wantedDesign])
  // After the press effect above, so the draft names the press these picks were made under.
  useEffect(() => {
    keepDraft(draftScope, {
      pressKey: appliedPress.current,
      platform,
      origin,
      name,
      design: wantedDesign,
      designSystem: ds.pick,
      currentStep,
      doneSteps,
      returnToReview,
      customizeSkipped,
      answers,
      chatApplied: chatApplied.current,
      chatEdited: [...chatEdited.current]
    })
  }, [
    draftScope,
    wantedDesign,
    pressKey,
    platform,
    origin,
    name,
    ds.pick,
    currentStep,
    doneSteps,
    returnToReview,
    customizeSkipped,
    answers
  ])
  // Try again on the ready screen; the pick itself travels with Create site and the server puts it on (`createSite`).
  const dsRetry = usePickRetry(() => mounted.current)
  const dsHandled = useRef<string | null>(null)

  // The site's questionnaire, asked of the same door the Build form uses, for the template and the platform in
  // sight. It waits for the card (`cardRead`) so it names the same template Create site will send. A late answer for an
  // earlier template never lands (`live`). The answers follow it: those the new set still asks are kept, the rest go.
  const askedPlatform = origin === 'create' ? chosen?.value : undefined
  useEffect(() => {
    let live = true
    setQuestions({ at: 'loading' })
    if (askedPlatform === undefined) {
      questionsRead.current = Promise.resolve(null)
      return
    }
    const read = cardRead.current.then((card) =>
      fetchSiteQuestions({
        platform: askedPlatform,
        design: designFor(card, askedPlatform),
        lang: document.documentElement.lang || 'en'
      })
    )
    questionsRead.current = read
    void read.then((found) => {
      if (!live) return
      if (found === QUESTIONS_FAILED) return setQuestions({ at: 'failed' })
      if (found === null) return setQuestions({ at: 'none' })
      // No text model to write the answers (#1403 item 7): the card says so, and nothing is asked.
      if (!found.answersWritten) return setQuestions({ at: 'unwritable' })
      const seeded = nativeSeed.current
        ? nativeBriefAnswers(found.questions, nativeSeed.current.brief, answersRef.current)
        : {}
      const preserved = chatDraft
        ? Object.fromEntries(
            Object.entries(answersRef.current).filter(
              ([id, value]) =>
                chatEdited.current.has(id) ||
                !(id in chatApplied.current) ||
                JSON.stringify(value) !== JSON.stringify(chatApplied.current[id])
            )
          )
        : answersRef.current
      const fromChat = chatDraftAnswers(found.questions, chatDraft, preserved)
      if (chatDraft) chatApplied.current = fromChat
      const carry = carryAnswers(found.questions, { ...seeded, ...fromChat, ...preserved }, { fresh: true })
      // Only a change that touched earlier answers is worth a line; a first read says nothing.
      setCarried(carry.kept + carry.dropped > 0 ? { kept: carry.kept, dropped: carry.dropped } : null)
      setAnswers(carry.answers)
      setQuestions({ at: 'ready', served: found, ordered: sheetOrder(found.questions) })
    })
    return () => {
      live = false
    }
  }, [askedPlatform, wantedDesign, questionsTry, chatDraft])
  // The card and the sheet ask about a NEW site whose words the brief can write; a fork takes its look and words from
  // the repository it was given, and a template no content contract seals keeps its own (`appliesTo`).
  const asksQuestions = origin === 'create' && appliesTo(startCard, chosen?.value) && questions.at !== 'none'
  const frame = useRef<HTMLDivElement>(null)
  const formRoot = useRef<HTMLDivElement>(null)
  const [waitingForSupport, setWaitingForSupport] = useState(false)
  const createIds = createStepIds(dsShown && ds.support === 'yes')
  const createSteps = createIds.map((id) => ({ id, label: t(`wizard_${id === 'source' ? 'adding' : id}`) }))
  // A template entry waits on its support answer before offering the optional page.
  const activeStep = createIds.includes(currentStep)
    ? currentStep
    : currentStep === 'system'
      ? ds.support === 'no'
        ? 'address'
        : 'design'
      : 'review'
  useEffect(() => {
    if (currentStep === 'system' && ds.support === 'no') setCurrentStep('address')
  }, [currentStep, ds.support])
  // Usage: the page this opening shows, told once per page (tracy-web keeps one per opening and page), so an
  // opening that never reached Create says where it was left. The import wizard tells its own page.
  const [importFormPage, setImportFormPage] = useState<string | null>(null)
  const usageStep = wizardStepName({
    stageAt: stage.at,
    currentStep,
    activeStep,
    origin,
    businessOn: fromBusinessOn,
    importPage: importFormPage
  })
  useEffect(() => {
    if (usageStep) wizardStep(wizardId.current, usageStep)
  }, [usageStep])
  useEffect(() => {
    if (stage.at !== 'form' || (origin === 'import' && currentStep !== 'source')) return
    if (frame.current) frame.current.scrollTop = 0
    if (formRoot.current) formRoot.current.scrollTop = 0
    formRoot.current?.querySelector<HTMLElement>('.tas-wizard-title')?.focus({ preventScroll: true })
  }, [activeStep, stage.at, origin])
  const advance = () => {
    if (activeStep === 'design' && dsShown && ds.support === 'loading') {
      setWaitingForSupport(true)
      return
    }
    setDoneSteps((done) => (done.includes(activeStep) ? done : [...done, activeStep]))
    setCurrentStep(createNextStep(activeStep, createIds, returnToReview))
    setReturnToReview(false)
    if (activeStep === 'customize') setCarried(null)
  }
  useEffect(() => {
    if (!waitingForSupport || (dsShown && ds.support === 'loading')) return
    setWaitingForSupport(false)
    advance()
  }, [waitingForSupport, dsShown, ds.support])
  // A preview's Use action confirms this design. Wait for its own catalogue/support answer:
  // the previous card's support must never decide which page follows the newly confirmed card.
  useEffect(() => {
    if (confirmedDesign === null) return
    if (activeStep !== 'design') {
      setConfirmedDesign(null)
      return
    }
    if ((startCard as { id?: string } | null)?.id !== confirmedDesign) return
    if (dsShown && ds.support === 'loading') return
    setConfirmedDesign(null)
    advance()
  }, [confirmedDesign, activeStep, startCard, dsShown, ds.support])
  const goBack = () => {
    setCurrentStep(createIds[Math.max(0, createIds.indexOf(activeStep) - 1)])
    setReturnToReview(false)
  }
  const editStep = (id: string) => {
    setCurrentStep(id)
    setReturnToReview(true)
  }
  const returnToForm = () => {
    if ('jobId' in stage && stage.jobId) clearJob(storage(), stage.jobId)
    setStage({ at: 'form' })
  }
  const reviewRefusal = (action: string) => {
    returnToForm()
    setRefused(null)
    editStep(
      action === 'create_change_template'
        ? 'design'
        : action === 'create_change_platform'
          ? 'platform'
          : action === 'create_change_system'
            ? 'system'
            : action === 'create_change_name'
              ? 'address'
              : 'review'
    )
  }
  const completedSteps =
    origin === 'import'
      ? [
          { id: 'source', label: t('wizard_adding') },
          { id: 'address', label: t('wizard_site_address') },
          { id: 'platform', label: t('wizard_platform') },
          { id: 'access', label: t('wizard_access') },
          { id: 'details', label: t('wizard_signin') },
          { id: 'review', label: t('wizard_review') }
        ]
      : createSteps
  const createProgressState =
    stage.at === 'ready'
      ? stage.agent === 'failed'
        ? 'failed'
        : 'done'
      : stage.at === 'building' && stage.job?.state === 'failed'
        ? 'failed'
        : 'running'
  const allDoneBar = (
    <WizardSteps
      t={t}
      steps={origin === 'import' ? completedSteps : [...completedSteps, { id: 'create', label: t('submit') }]}
      current={origin === 'import' ? 'complete' : 'create'}
      currentState={origin === 'import' ? undefined : createProgressState}
      done={completedSteps.map((step) => step.id)}
    />
  )
  /**
   * What Create site sends with the site: the answers when there are some, judged against the set they answer, or
   * nothing at all. A press while a new set is still loading waits for it only when there are answers to carry over
   * (a local read, capped by `QUESTIONS_WAIT_MS`); with nothing answered there is nothing to wait for.
   */
  const briefFor = async (card: unknown, platformValue: string) => {
    if (origin !== 'create' || customizeSkipped || !appliesTo(card, platformValue)) return undefined
    const given = answersRef.current
    if (Object.keys(given).length === 0) return undefined
    const found = questions.at === 'ready' ? questions.served : await questionsRead.current
    if (!found || found === QUESTIONS_FAILED || !found.answersWritten) return undefined
    const kept = carryAnswers(found.questions, given).answers
    return briefAnswered(found.questions, kept) ? toBrief(found.questions, found.set, kept) : undefined
  }

  /**
   * The progress watch loop.
   *
   * 🔒 `cancelled` is not empty ritual: `setStage` after the component has unmounted is a React
   * warning and a loop nobody stops. Closing the tab midway is normal
   * here — the work keeps running on the fleet, only the screen stops watching.
   *
   * 🔒 THE WATCH ENDS ON A SETTLED JOB, AND ONLY ONE ASK IS EVER IN FLIGHT (#362). The loop used to
   * be an interval re-armed on every stage change: a failed build stayed `building` and was asked
   * again every two seconds for ever, and a 403 (its site deleted) read as "ask again" — measured
   * ~70 min of 403s in one session. Now each ask schedules the next only while the job is still
   * under way; `done`, `failed` and `gone` schedule nothing. The effect is keyed on the job alone,
   * so a new milestone does not restart it. A pointer restored after a reload goes through the same
   * loop: one ask, and a settled answer ends it there.
   */
  const watched =
    stage.at === 'building' && stage.job?.state !== 'failed' ? `${stage.siteKey}\n${stage.jobId}` : null
  useEffect(() => {
    if (watched === null) return
    const [siteKey, jobId] = watched.split('\n')
    return watchBuild({
      siteKey,
      jobId,
      ask: async (siteKey: string, jobId: string) => {
        const answer = await pollJob(siteKey, jobId)
        lastBuildChecked.current = Date.now()
        return answer
      },
      getStage: () => stageRef.current,
      effects: {
        forget: (id: string) => clearJob(storage(), id),
        showForm: (note?: 'gone') => setStage(note ? { at: 'form', note } : { at: 'form' }),
        startAgent: (base: Parameters<typeof startAgent>[0]) => void startAgent(base),
        remember: (id: string, seen: string) => rememberSeen(storage(), id, seen),
        show: (next: Stage) => setStage(next)
      }
    })
  }, [watched])

  // The build on screen is this wizard's to finish (`onScreen` in `resume.mjs`), and the pointer is
  // forgotten once its handover is over.
  const shownJob = stage.at === 'form' ? undefined : stage.jobId
  useEffect(() => {
    if (shownJob === undefined) return
    onScreen.add(shownJob)
    return () => {
      onScreen.delete(shownJob)
    }
  }, [shownJob])
  useEffect(() => {
    if (stage.at === 'ready' && stage.jobId !== undefined) clearJob(storage(), stage.jobId)
  }, [stage])

  /**
   * A build has started. Its pointer is written at once, before the first poll: a tab closed in the
   * next two seconds must still find it.
   *
   * THE SAME ROAD FROM EVERY WORKSPACE (Vincent, 22/09/2026). Pressed in a site's workspace, the
   * build used to run in the background: the form reset, the side card jumped back to the site
   * already open, and the new site was only a row in the left column (`739d5dcf7`, 15/09). Measured
   * 22/09 from `chrometest2`'s workspace: POST 202, the site building — and the screen said nothing
   * had happened. Now the console shows it here, the conversation on the left stays usable, and
   * Builds started from an existing site's workspace keep this screen available; builds started
   * from `/new/` still land in the new site's workspace when its agent is up.
   *
   * An IMPORT pressed in a site's workspace keeps the old road: the import wizard shows its own
   * completion screen and the page keeps its site (#166, verified by QC — `import-handover-ui.test`).
   */
  const buildStarted = (
    pending: { siteKey: string; jobId: string; platform: string; forkUrl?: string },
    from: 'create' | 'import' = 'create'
  ) => {
    const background = buildLanding({ from, inSite: pageSite() !== null }) === 'background'
    // The site is on its way: the next Add site starts from a clean form.
    forgetDraft(draftScope)
    writePending(storage(), pending, background ? backgroundKey(pending.jobId) : sessionId)
    window.dispatchEvent(new Event(SITES_CHANGED))
    if (!background) {
      setStage({ at: 'building', ...pending, job: null, seen: '' })
      return
    }
    setName('')
    setStage({ at: 'form' })
    window.dispatchEvent(new CustomEvent(SHOW_SITE))
  }

  useEffect(() => {
    if (refused?.refusal !== 'elsewhere' || refused.redirectFailed) return
    const timer = setTimeout(() => setRefused({ ...refused, redirectFailed: true }), REDIRECT_WAIT_MS)
    return () => clearTimeout(timer)
  }, [refused])

  const createPress = useRef<{ key: string; buildId: string } | null>(null)

  /**
   * Create the site, with the answers of "Customize your site" when there are some (`briefFor`). Never blocked by a
   * question: every one is optional.
   */
  const submit = async () => {
    if (busy || localRefusal || label === '' || !chosen || (startPreview && !startBuilds)) return
    // For the fork branch, also block when the URL field is blank or refused.
    if (origin === 'fork' && (forkUrlTrimmed === '' || forkUrlLocalRefusal !== null)) return
    setBusy(true)
    setRefused(null)
    // Only the create branch starts from the start template: a fork takes its look from the URL it
    // was given, and a template installed underneath would be one more thing to paint over.
    const card = origin === 'create' ? await cardRead.current : null
    const design = origin === 'create' ? designFor(card, chosen.value) : undefined
    const brief = await briefFor(card, chosen.value)
    if (!mounted.current) return
    const key = JSON.stringify([label, chosen.value, design])
    if (createPress.current?.key !== key) {
      const savedKey = `tracy:create-press:${sessionId}`
      let saved: { key?: string; buildId?: string } | null = null
      try {
        saved = JSON.parse(storage()?.getItem(savedKey) ?? 'null')
      } catch {}
      createPress.current = {
        key,
        buildId: saved?.key === key && typeof saved.buildId === 'string' ? saved.buildId : crypto.randomUUID()
      }
      try {
        storage()?.setItem(savedKey, JSON.stringify(createPress.current))
      } catch {}
    }
    // With nothing answered no brief travels, so that body is exactly the one the door has always had.
    // The design system picked in the form travels with the press: the server keeps it on the new site and puts it on at
    // the end of the build, so a reload or a closed tab no longer loses it. Template default sends nothing.
    const outcome = await createSite(
      label,
      chosen.value,
      design,
      createPress.current.buildId,
      brief,
      origin === 'create' ? ds.sendable?.id : undefined,
      wizardId.current
    )
    setBusy(false)
    if (!started(outcome)) {
      setRefused(outcome)
      setCurrentStep('address')
      setReturnToReview(true)
      // This person's sites are kept on another Tracy server (shard beta): say so, then go there.
      // The URL is the door's own, already checked to be an absolute https address (`elsewhereUrl`).
      if (outcome.refusal === 'elsewhere' && outcome.url !== undefined) {
        try {
          window.location.assign(outcome.url)
        } catch {
          // The refusal view exposes recovery if navigation does not complete.
        }
      }
      return
    }
    openingUsed(tabStorage())
    // Carry the fork URL into the resume pointer so a reload can restore `?fork=` on the workspace link.
    const resolvedForkUrl =
      origin === 'fork' ? (normalizeForkUrl(forkUrlTrimmed, zone) ?? undefined) : undefined
    // Write the pointer RIGHT AWAY, even before the first poll: if the tab closes in the next two seconds the work
    // still runs on the fleet, and people must be able to find it again.
    buildStarted({
      siteKey: outcome.siteKey,
      jobId: outcome.jobId,
      platform: chosen.value,
      forkUrl: resolvedForkUrl
    })
  }

  // The wait for the agent: the same list My Sites reads, at the same cadence, until the site's
  // row carries an agent or patience runs out. `cancelled` because the tab closes mid-wait often,
  // and My Sites is the net underneath: it shows "Starting" for the same site the same way.
  useEffect(() => {
    if (stage.at !== 'starting') return
    let cancelled = false
    const tick = async () => {
      // A fresh ask every tick, shared with any other reader waiting on the same list (My Sites).
      const { body } = await readSites({ refresh: true })
      const rows = (body as { sites?: Array<{ siteKey: string; agent: string | null }> } | null)?.sites ?? []
      if (cancelled) return
      const verdict = agentWaitVerdict({ rows, stage, now: Date.now() })
      if (verdict === null) return
      setStage({
        at: 'ready',
        siteKey: stage.siteKey,
        jobId: stage.jobId,
        platform: stage.platform,
        job: stage.job,
        seen: stage.seen,
        agent: verdict,
        forkUrl: stage.forkUrl
      })
    }
    const timer = setInterval(() => void tick(), START_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [stage])

  // Keep the completion screen when a build was started from an existing site's workspace. It is
  // the only place with the explicit workspace button, so automatic navigation here hides it.
  const [openedReady] = useState(() => stage.at === 'ready')
  /** Show the site in the side card when the page is already that site's workspace. */
  const landOn = (stage: Extract<Stage, { at: 'ready' }>) => {
    // A different existing site keeps the ready screen here; the explicit button below owns
    // navigation. The `/new/` workspace keeps its original automatic landing behavior.
    const landing = readyLanding({ siteKey: stage.siteKey, pageSite: pageSite(), forkUrl: stage.forkUrl })
    if (landing !== null) {
      if (pageSite() !== null) return
      window.location.assign(landing)
      return
    }
    // Already on this site's workspace: no page load, the site that just came up is shown in the
    // side card. `ready` skips the "still being created" check — the list the side card holds was
    // read before the agent came up.
    window.dispatchEvent(new Event(SITES_CHANGED))
    window.dispatchEvent(
      new CustomEvent(SHOW_SITE, {
        // `platform` rides along so the side card knows an EmDash copy cannot be framed before its
        // `/api/sites` row loads (`index.tsx`).
        detail: {
          siteKey: stage.siteKey,
          url: stage.job.liveUrl ?? undefined,
          platform: stage.platform,
          ready: true
        }
      })
    )
  }
  useEffect(() => {
    if (openedReady || stage.at !== 'ready' || stage.agent !== 'up') return
    if (dsHandled.current === stage.siteKey) return
    dsHandled.current = stage.siteKey
    // A pick the server could not put on is said here, on the ready screen, and the page stays (no silent template
    // look); otherwise the build is over. Existing-site workspaces stay here; `/new/` keeps its
    // automatic landing.
    if (pickLine(stage.job.designSystem)?.at === 'failed') return
    // So are Customize answers that did not all go in: never a site handed over as if they had.
    if (stage.job.brief === 'failed') return
    if (origin === 'import' && (!stage.job.liveUrl || stage.job.addressError)) return
    landOn(stage)
  }, [stage, openedReady])

  if (origin !== 'import' && stage.at !== 'form') {
    const ready = stage.at === 'ready' ? stage : null
    return (
      <div
        className={ROOT}
        data-stage={stage.at === 'building' && stage.job?.state === 'failed' ? 'build-failed' : stage.at}
      >
        {allDoneBar}
        <CreateStep
          t={t}
          phase={stage.at}
          siteKey={stage.siteKey}
          platform={stage.platform}
          job={stage.job}
          seen={stage.seen}
          unreachable={stage.at === 'building' ? stage.unreachable : undefined}
          signedOut={stage.at === 'building' ? stage.signedOut : undefined}
          slow={stage.at === 'building' ? stage.slow : undefined}
          posting={stage.at === 'starting' ? stage.posting : undefined}
          agent={ready?.agent}
          pickLine={
            ready ? dsRetry.lineFor(ready.siteKey, ready.job.designSystem) : pickLine(stage.job?.designSystem)
          }
          onBack={() => {
            returnToForm()
            editStep('review')
          }}
          onStartAgent={() => {
            if (ready) void startAgent({ ...ready })
          }}
          onWorkspace={() =>
            window.location.assign(workspacePath({ siteKey: stage.siteKey, forkUrl: stage.forkUrl }))
          }
          onOpenSite={() => {
            const liveUrl = stage.job?.liveUrl
            if (!liveUrl) return
            window.open(liveUrl, '_blank', 'noopener,noreferrer')
          }}
          onDesignRetry={() => {
            if (ready?.job.designSystem)
              void dsRetry.retry(ready.siteKey, ready.job.designSystem, () => landOn(ready))
          }}
          onMySites={onMySites}
        />
      </div>
    )
  }

  if (stage.at === 'starting') {
    return (
      <div className={ROOT}>
        {allDoneBar}
        <div className={GROUP}>
          <div className="font-medium">{t('progress_title', { domain: stage.siteKey })}</div>
          <Milestones t={t} steps={stepsFrom(stage.seen, stage.platform)} agent="active" />
          <Note>{t('ready_agent_note', { url: stage.job.liveUrl ?? stage.siteKey })}</Note>
        </div>
      </div>
    )
  }

  if (stage.at === 'building') {
    const state = stage.job?.state ?? 'queued'
    const steps = stepsFrom(stage.seen, stage.platform)
    const diagnosis = [stage.job?.detail?.trim(), stage.job?.output?.trim()].filter(Boolean).join('\n')
    const pickWaiting = state === 'failed' ? null : pickLine(stage.job?.designSystem)
    const content = (
      // `data-stage` is what the UI tests read to tell "still shown as building" from what comes after,
      // a failed build included (it stays on this screen, with Try again).
      <div
        className={ROOT}
        data-import-ux={origin === 'import' ? '' : undefined}
        data-stage={state === 'failed' ? 'build-failed' : 'building'}
      >
        {allDoneBar}
        <div className={GROUP}>
          <div className="font-medium">{t('progress_title', { domain: stage.siteKey })}</div>

          {/*
            The list holds ONLY steps that happened. No grey line for work not reached — `baseline` only
            runs when the site keeps per-file history, `address` only when cloudflared is on the machine, and a
            console listing them up front would describe steps nobody is waiting for (D4).
          */}
          {origin === 'import' && (state === 'failed' || stage.unreachable) ? null : steps.length === 0 ? (
            <Note>{state === 'failed' ? t('progress_failed') : t('progress_start')}</Note>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {steps.map((step) => (
                <li
                  key={step.key}
                  data-done={step.done ? '1' : '0'}
                  className={cn(
                    'flex items-center gap-2 font-normal text-xs',
                    !step.done && 'text-muted-foreground'
                  )}
                >
                  {/* The marker carries the state, so a screenshot still reads in greyscale:
                      a filled check for a step that is done, a spinner for the one under way,
                      an empty ring for the one the fleet stopped on. */}
                  {step.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : state === 'failed' ? (
                    <XCircle className="size-3.5 shrink-0 text-destructive" />
                  ) : (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  )}
                  {t(step.stringKey)}
                </li>
              ))}
            </ol>
          )}

          {/* The design system picked in the form, while the server puts it on: the last step of the same list. */}
          {pickWaiting?.at === 'running' ? <PickStep t={t} line={pickWaiting} /> : null}
          {origin === 'import' && stage.unreachable && state !== 'failed' ? (
            <ImportProblem
              problem="p47"
              t={t}
              domain={stage.siteKey}
              params={{
                checked: new Date(lastBuildChecked.current).toLocaleTimeString(interfaceLocale(), {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              }}
            />
          ) : stage.unreachable && state !== 'failed' ? (
            <Alert data-build-unreachable="1">
              <AlertDescription>{t('progress_unreachable')}</AlertDescription>
            </Alert>
          ) : null}
          {origin === 'import' && state === 'failed' ? (
            <ImportProblem
              problem="p46"
              t={t}
              domain={stage.siteKey}
              technicalDetails={diagnosis}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      clearJob(storage(), stage.jobId)
                      setStage({ at: 'form' })
                    }}
                  >
                    {t('import_retry')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        JSON.stringify({ siteKey: stage.siteKey, jobId: stage.jobId, detail: diagnosis })
                      )
                    }
                  >
                    {t('import_copy_details')}
                  </Button>
                </div>
              }
            />
          ) : state === 'failed' ? (
            <>
              <Alert variant="destructive">
                <AlertDescription>{t('progress_failed')}</AlertDescription>
              </Alert>
              {/*
                The raw output shows ONLY on failure. In a normal run it is noise; on failure it is the
                only fact that can say why, and swallowing it makes people open a ticket to find out.
                `wrap-anywhere`: the fleet speaks in long lines, and scrolling the whole page sideways is worse than wrapping.

                🔒 `job.output` COMES FIRST, AND IT IS WHAT THE COMMENT ABOVE STILL REFERS TO. Until
                17/09 this box only showed `stage.seen` — which gathers STEP NAMES (`job.step`), not
                the reason. Measured 16/09 on `demoemdash`: the customer saw `The build stopped.` and a box
                reading just `provision`, while that same object carried the sentence

                    !! no tracy/emdash image on this host yet.
                       build the latest upstream:  bash …/emdash/build-image.sh

                — both the cause and the cure. The step list still shows below: it answers
                "where it stopped", while `output` answers "why", and the reader needs both.
              */}
              {/* The host's one-line `detail` heads the box (e.g. "tracy-host restarted before this
                  job finished" — a failure with no `output` at all), then the log tail. */}
              {diagnosis ? (
                <pre
                  data-diagnosis="1"
                  className="wrap-anywhere m-0 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-destructive/40 bg-muted px-2.5 py-2 font-mono text-[11px] text-foreground leading-relaxed"
                >
                  {diagnosis}
                </pre>
              ) : null}
              {stage.seen.trim() ? (
                <pre className="wrap-anywhere m-0 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted px-2.5 py-2 font-mono text-[11px] text-muted-foreground leading-relaxed">
                  {stage.seen.trim()}
                </pre>
              ) : null}
              <Button
                type="button"
                className="self-start"
                onClick={() => {
                  clearJob(storage(), stage.jobId)
                  setStage({ at: 'form' })
                }}
              >
                {t('progress_retry')}
              </Button>
            </>
          ) : null}
          {/* No "Add another site" while a build runs (Akemi, 29/09): the screen is about the site
              being built. The next site starts from the + menu's Add site. */}
        </div>
      </div>
    )
    return origin === 'import' ? (
      <div data-add-site-form="1" className="relative h-full overflow-y-auto">
        {content}
      </div>
    ) : (
      content
    )
  }

  if (stage.at === 'ready') {
    const up = stage.agent === 'up'
    // The pick as the server ended it; once Try again was pressed here, that press's own state.
    const pick = stage.job.designSystem
    const line = dsRetry.lineFor(stage.siteKey, pick)
    // `liveUrl` is what the server reported (ADR 0088 §7.4); a URL assembled here would look right
    // until the fleet places a site in another zone.
    const url = stage.job.liveUrl ?? stage.siteKey
    if (origin === 'import' && !up)
      return (
        <div data-add-site-form="1" className="relative h-full overflow-y-auto">
          <div className={ROOT} data-import-ux="">
            {allDoneBar}
            <ImportProblem
              problem="p49"
              t={t}
              domain={stage.siteKey}
              actions={
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void startAgent({
                      siteKey: stage.siteKey,
                      platform: stage.platform,
                      job: stage.job,
                      seen: stage.seen,
                      forkUrl: stage.forkUrl
                    })
                  }
                >
                  {t('import_retry')}
                </Button>
              }
            />
          </div>
        </div>
      )
    if (origin === 'import' && (!stage.job.liveUrl || stage.job.addressError))
      return (
        <div data-add-site-form="1" className="relative h-full overflow-y-auto">
          <div className={ROOT} data-import-ux="">
            {allDoneBar}
            <ImportProblem
              problem="p50"
              t={t}
              domain={stage.siteKey}
              actions={
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    window.location.assign(workspacePath({ siteKey: stage.siteKey, forkUrl: stage.forkUrl }))
                  }
                >
                  {t('ready_open_workspace')}
                </Button>
              }
            />
          </div>
        </div>
      )
    if (origin === 'import' && previewFailure)
      return (
        <div data-add-site-form="1" className="relative h-full overflow-y-auto">
          <div className={ROOT} data-import-ux="">
            {allDoneBar}
            <ImportProblem
              problem="p51"
              t={t}
              domain={stage.siteKey}
              actions={
                <a
                  data-slot="button"
                  className="bg-primary text-primary-foreground"
                  href={previewFailure.url}
                  target="_blank"
                  rel="noopener"
                >
                  {t('import_problem_p51_action_0')}
                </a>
              }
            />
          </div>
        </div>
      )
    return (
      <div className={ROOT}>
        {allDoneBar}
        <div className={GROUP}>
          <div className="font-medium">
            {up ? t('ready_agent_title', { url }) : t('ready_title', { url })}
          </div>
          <Milestones t={t} steps={stepsFrom(stage.seen, stage.platform)} agent={up ? 'done' : 'failed'} />
          <ReadyPick
            t={t}
            line={line}
            pick={pick}
            onRetry={(p) => void dsRetry.retry(stage.siteKey, p, () => landOn(stage))}
          />
          {stage.job.brief === 'failed' ? (
            <Alert data-brief-outcome="failed">
              <AlertDescription>{t('ready_brief_failed')}</AlertDescription>
            </Alert>
          ) : null}
          {up ? null : origin === 'import' ? (
            <ImportProblem problem="p49" t={t} domain={stage.siteKey} />
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{t('agent_failed')}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {up ? (
              // A REAL tab, never a frame: the lane recognises the viewer through the header
              // `fleet-bar` sets from its own session; in a frame third-party cookies are blocked
              // and the door opens on a sign-in screen. Same call My Sites makes for "Chat".
              // Fork branch: `?fork=<url>` starts the extraction on the new lane (brand engine's client hook);
              // `tab=` + `site=` is better-sidebar's own deep link, so the Brand builder tab opens on the
              // fork's progress — or its failure — instead of the seed tab.
              <Button
                type="button"
                onClick={() => {
                  // The site is a workspace of its own: open it in this tab (`open-workspace.mjs`).
                  window.location.assign(workspacePath({ siteKey: stage.siteKey, forkUrl: stage.forkUrl }))
                }}
              >
                {t('ready_open_workspace')}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  void startAgent({
                    siteKey: stage.siteKey,
                    platform: stage.platform,
                    job: stage.job,
                    seen: stage.seen,
                    forkUrl: stage.forkUrl
                  })
                }
              >
                {t('agent_retry')}
              </Button>
            )}
            {/* The site's public copy stays reachable, as the secondary action. "Open the admin"
                was dropped on 02/09 (Lee): that link lives on the My Sites card, where people
                come back to, not on a handover that shows once.

                An EmDash copy refuses framing (`preview.mjs`), so its "Open" is a real tab opened
                synchronously in this click, or the pop-up blocker eats it. A frameable copy goes to
                the Browser tab via `openSite`, which mints the viewer session first. */}
            {stage.job.liveUrl ? (
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => {
                  const liveUrl = stage.job.liveUrl
                  if (!liveUrl) return
                  if (canFrameCopy(stage.platform)) void openSite(liveUrl, stage.siteKey)
                  else window.open(liveUrl, '_blank', 'noopener,noreferrer')
                }}
              >
                {t('ready_open')}
              </Button>
            ) : null}
          </div>
          {origin === 'import' && previewFailure ? (
            <ImportProblem
              problem="p51"
              t={t}
              domain={stage.siteKey}
              actions={
                <a
                  href={previewFailure.url}
                  target="_blank"
                  rel="noopener"
                  className="text-primary text-xs underline-offset-4 hover:underline"
                >
                  {t('import_problem_p51_action_0')}
                </a>
              }
            />
          ) : null}
          {/* Built but with no address is its own state — say so, rather than let the link be
              missing without a word. */}
          {origin === 'import' && (!stage.job.liveUrl || stage.job.addressError) ? (
            <ImportProblem problem="p50" t={t} domain={stage.siteKey} />
          ) : !stage.job.liveUrl || stage.job.addressError ? (
            <Alert variant="destructive">
              <AlertDescription>{t('ready_no_url')}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    )
  }

  if (stage.at === 'form' && stage.note === 'gone' && origin === 'import')
    return (
      <div data-add-site-form="1" className="relative h-full overflow-y-auto">
        <div className={ROOT} data-import-ux="">
          <ImportProblem
            problem="p48"
            t={t}
            actions={
              <Button type="button" size="sm" variant="outline" onClick={() => setStage({ at: 'form' })}>
                {t('import_problem_p48_action_0')}
              </Button>
            }
          />
        </div>
      </div>
    )

  const importPage =
    origin === 'import' ? (
      <div className={ROOT} hidden={currentStep === 'source'}>
        <ImportWizard
          initialAddress={chatDraft?.importUrl}
          t={t}
          onBackToSource={() => setCurrentStep('source')}
          onPage={setImportFormPage}
          onCreate={() => {
            setOrigin('create')
            setCurrentStep('platform')
            setDoneSteps(['source'])
          }}
          onMySites={onMySites}
          recover={recovering}
          onProvisioned={({ siteKey, platform: chosenPlatform, jobId }) => {
            buildStarted({ siteKey, jobId, platform: chosenPlatform }, 'import')
          }}
        />
      </div>
    ) : null
  // Build from my business (`from-business.tsx`): its own page, like import's, behind its own switch. A press of
  // its start card while the operator has the switch off lands on Create instead (`shownOrigin`).
  const shownOrigin = origin === 'business' && !fromBusinessOn ? 'create' : origin
  const businessPage =
    shownOrigin === 'business' ? (
      <div className={ROOT} hidden={currentStep === 'source'}>
        <FromBusiness
          initialQuery={chatDraft?.businessQuery}
          t={t}
          lang={interfaceLocale() || 'en'}
          onBack={() => {
            setOrigin('create')
            setCurrentStep('source')
          }}
        />
      </div>
    ) : null
  const domain = `${addressPrefix}${label === '' ? t('name_placeholder') : label}.${zone}`
  const progress =
    questions.at === 'ready' ? briefProgress(questions.ordered, answers) : { answered: 0, total: 0 }
  const titles: Record<string, string> = {
    source: 'wizard_source_title',
    platform: 'wizard_platform_title',
    design: 'wizard_design_title',
    address: 'wizard_address_title',
    customize: 'sheet_title',
    system: 'ds_title',
    review: 'wizard_review_title'
  }
  const descriptions: Record<string, string> = {
    source: 'wizard_source_desc',
    platform: 'wizard_platform_desc',
    design: 'wizard_design_desc',
    address: 'wizard_address_desc',
    customize: 'customize_lead',
    system: 'ds_desc',
    review: 'wizard_review_desc'
  }
  const blocked =
    busy ||
    (activeStep === 'platform' && !chosen) ||
    (activeStep === 'design' && !startBuilds) ||
    ((activeStep === 'address' || activeStep === 'review') &&
      (label === '' || Boolean(localRefusal) || !chosen)) ||
    (activeStep === 'review' && Boolean(startPreview && !startBuilds))
  return (
    <div ref={frame} className="relative h-full overflow-y-auto" data-add-site-form="1">
      {importPage}
      {businessPage}
      <div
        ref={formRoot}
        className={cn(ROOT, 'tas-wizard-card')}
        data-wizard-step={activeStep}
        aria-busy={
          confirmedDesign !== null ||
          waitingForSupport ||
          (currentStep === 'system' && ds.support === 'loading')
        }
        hidden={(shownOrigin === 'import' || shownOrigin === 'business') && currentStep !== 'source'}
        onPointerDownCapture={() => {
          nativeSeedAllowed.current = false
        }}
        onKeyDownCapture={() => {
          nativeSeedAllowed.current = false
        }}
      >
        <WizardSteps
          t={t}
          steps={origin === 'import' ? completedSteps : createSteps}
          current={activeStep}
          done={doneSteps}
          onStep={(id) => {
            setCurrentStep(id)
            setReturnToReview(false)
          }}
        />
        <div className="tas-wizard-body">
          <div className="tas-wizard-head">
            <h2 className="tas-wizard-title" tabIndex={-1}>
              {t(refused ? createRefusalTitle(createRefusalGuidance(refused)) : titles[activeStep])}
            </h2>
            {descriptions[activeStep] ? (
              <p className="tas-wizard-desc">{t(descriptions[activeStep], { domain })}</p>
            ) : null}
          </div>
          {stage.note === 'gone' ? (
            <div data-build-gone="1">
              <CreateRefusalProblem refused={{ refusal: 'other', code: 'BUILD_GONE' }} t={t} />
            </div>
          ) : null}
          {activeStep === 'source' ? (
            <RadioGroup
              value={undefined}
              onValueChange={(value) => {
                if (value === 'business') {
                  setOrigin('business')
                  setCurrentStep('platform')
                  return
                }
                const sameBranchEdit = returnToReview && value === origin
                setOrigin(value as Origin)
                setDoneSteps((done) => (sameBranchEdit ? done : ['source']))
                setReturnToReview(false)
                setCurrentStep(sameBranchEdit ? 'review' : 'platform')
              }}
              className="gap-2"
            >
              <ChoiceOption
                value="create"
                selected={returnToReview && origin === 'create'}
                title={t('origin_create')}
                description={t('origin_create_desc')}
              />
              <ChoiceOption
                value="import"
                selected={returnToReview && origin === 'import'}
                title={t('origin_import')}
                description={t('origin_import_desc')}
              />
              {fromBusinessOn ? (
                <ChoiceOption
                  value="business"
                  selected={false}
                  title={t('own_title')}
                  description={t('own_desc')}
                />
              ) : null}
              {FORK_ENABLED ? (
                <ChoiceOption
                  value="fork"
                  selected={false}
                  title={t('origin_fork')}
                  description={t('origin_fork_desc')}
                />
              ) : null}
            </RadioGroup>
          ) : null}
          {activeStep === 'platform' ? (
            <>
              <div className={GROUP}>
                <div className={FIELD_LABEL}>{t('platform_label')}</div>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((entry) => (
                    <Button
                      key={entry.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={entry.value === chosen?.value}
                      className={cn('rounded-md', entry.value === chosen?.value && CHIP_SELECTED)}
                      data-selected={entry.value === chosen?.value ? '1' : '0'}
                      disabled={!entry.installable}
                      onClick={() => {
                        if (!buildsOn(startCard, entry.value)) setWantedDesign(START_TEMPLATE)
                        setPlatform(entry.value)
                        advance()
                      }}
                    >
                      {entry.label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {activeStep === 'design' && chosen ? (
            <div className="tas-wizard-inline">
              <StartingDesignGallery
                key={`${appliedPress.current ?? ''}:${chosen.value}`}
                t={t}
                templates={templates}
                platform={chosen.value}
                selected={wantedDesign ?? START_TEMPLATE}
                onSelect={(id) => {
                  setConfirmedDesign(null)
                  setWantedDesign(id)
                }}
                onUse={(id) => {
                  setWantedDesign(id)
                  setConfirmedDesign(id)
                }}
              />
            </div>
          ) : null}
          {activeStep === 'address' ? (
            <>
              <div className={GROUP}>
                <Label htmlFor={nameId} className={FIELD_LABEL}>
                  {t('name_label')}
                </Label>
                {/*
              One box, not three: the prefix and the zone are parts of the address, so they sit
              INSIDE the field as addons (`InputGroup`), and the input itself carries no border or
              radius of its own. The previous shape (Input + two bordered spans glued with
              `rounded-r-none` / `border-l-0`) rendered as separate boxes with a double border on
              the dsh page: nine plugin stylesheets each carry the full Tailwind utility set, this
              plugin's is injected first, and a later `.rounded-lg` / `.border` wins the tie against
              any modifier only this plugin uses. Measured 15/09 on the local stack. InputGroupInput
              replaces those utilities through tailwind-merge (`rounded-none border-0`), so there is
              no tie to lose.
            */}
                {/* Same fill as the plain Input next door (transparent): InputGroup's own dark default is a
                4.5% white wash, which made this one field lighter than every other on the tab. */}
                <InputGroup className="bg-transparent dark:bg-transparent">
                  {addressPrefix === '' ? null : (
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>{addressPrefix}</InputGroupText>
                    </InputGroupAddon>
                  )}
                  <InputGroupInput
                    id={nameId}
                    value={name}
                    placeholder={t('name_placeholder')}
                    // A site label is not form history. With suggestions on, Chrome paints its autofill
                    // preview over the <input> alone, and inside an InputGroup that reads as a two-tone
                    // box: the name half blue-grey, the zone half dark (Akemi, 15/09, dark theme).
                    autoComplete="off"
                    aria-invalid={Boolean(localRefusal || refused) || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      // A server refusal describes the name just submitted. Clear it when the input
                      // changes so it does not describe the new name incorrectly.
                      setRefused(null)
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>.{zone}</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {/*
          The four refusals are FOUR separate sentences, and they come from two places: three are computed in place
          while typing, while `taken` only the server knows — so it only shows after a press.
        */}
                {localRefusal ? (
                  <CreateRefusalProblem
                    refused={{ refusal: localRefusal, code: 'INVALID_LABEL' }}
                    t={t}
                    onBack={reviewRefusal}
                    onMySites={onMySites}
                  />
                ) : refused ? (
                  <CreateRefusalProblem
                    refused={refused}
                    t={t}
                    onBack={reviewRefusal}
                    onMySites={onMySites}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t('name_hint', {
                      domain: `${addressPrefix}${label === '' ? t('name_placeholder') : label}.${zone}`
                    })}
                  </span>
                )}
              </div>
            </>
          ) : null}
          <div className="tas-wizard-inline">
            {activeStep === 'customize' ? (
              asksQuestions && questions.at === 'ready' ? (
                <QuestionsPage
                  inline
                  t={t}
                  questions={questions.ordered}
                  oneLanguage={questions.served.oneLanguage}
                  answers={answers}
                  onAnswers={(next) => {
                    for (const id of new Set([...Object.keys(answersRef.current), ...Object.keys(next)])) {
                      if (JSON.stringify(answersRef.current[id]) !== JSON.stringify(next[id]))
                        chatEdited.current.add(id)
                    }
                    setAnswers(next)
                  }}
                  note={
                    carried
                      ? [
                          carried.kept > 0 ? t('sheet_kept', { count: carried.kept }) : '',
                          carried.dropped > 0 ? t('sheet_dropped', { count: carried.dropped }) : ''
                        ]
                          .filter(Boolean)
                          .join(' ')
                      : undefined
                  }
                  onClose={() => {
                    setCustomizeSkipped(false)
                    advance()
                  }}
                />
              ) : (
                <QuestionsStatus
                  t={t}
                  state={
                    (!asksQuestions || questions.at === 'none'
                      ? 'unwritable'
                      : questions.at) as QuestionsState
                  }
                  onRetry={() => setQuestionsTry((n) => n + 1)}
                />
              )
            ) : null}
            {activeStep === 'system' && startPreview ? (
              Array.isArray(ds.library) ? (
                <DesignSystemPage
                  inline
                  t={t}
                  rows={ds.library}
                  template={startPreview.name}
                  templateImage={startPreview.image}
                  platformLabel={chosen?.label ?? ''}
                  quickstart={quickstartTagOf(startCard, chosen?.value)}
                  platform={chosen?.value}
                  picked={ds.pick}
                  onPick={ds.setPick}
                  onClose={goBack}
                />
              ) : (
                <DesignSystemCard t={t} state={ds} onOpen={() => {}} cardRef={dsField.cardRef} />
              )
            ) : null}
          </div>
          {activeStep === 'review' ? (
            <WizardReview
              t={t}
              hero={{
                address: domain,
                image: startingDesignImage(startCard),
                template: startPreview?.name,
                platform: chosen?.label ?? '',
                system: ds.sendable
                  ? {
                      name: ds.sendable.name,
                      colors: swatchesOf(
                        Array.isArray(ds.library)
                          ? ds.library.find((row) => row.id === ds.sendable?.id)
                          : null
                      )
                    }
                  : null
              }}
              rows={[
                { id: 'platform', label: t('wizard_platform'), value: chosen?.label ?? '' },
                { id: 'design', label: t('wizard_design'), value: startPreview?.name ?? '' },
                ...(createIds.includes('system')
                  ? [
                      {
                        id: 'system',
                        label: t('wizard_system'),
                        value: ds.sendable?.name ?? t('wizard_system_default'),
                        secondary: ds.sendable ? t('wizard_review_system_note') : undefined
                      }
                    ]
                  : []),
                { id: 'address', label: t('wizard_address'), value: domain },
                {
                  id: 'customize',
                  label: t('wizard_review_business'),
                  ...reviewBusiness({
                    t,
                    questions: questions.at === 'ready' ? questions.ordered : [],
                    answers,
                    skipped: customizeSkipped,
                    locale: interfaceLocale() || 'en'
                  })
                }
              ]}
              onEdit={editStep}
            />
          ) : null}
        </div>
        {activeStep !== 'source' ? (
          <WizardFooter
            t={t}
            outlined={activeStep === 'customize' || activeStep === 'review'}
            answeredStatus={
              activeStep === 'customize' && questions.at === 'ready'
                ? t('customize_answered', { n: progress.answered, total: progress.total })
                : undefined
            }
            onBack={goBack}
            onContinue={
              activeStep === 'review'
                ? () => void submit()
                : () => {
                    if (activeStep === 'customize') setCustomizeSkipped(false)
                    advance()
                  }
            }
            continueLabel={activeStep === 'review' ? (busy ? t('submitting') : t('submit')) : undefined}
            disabled={Boolean(blocked)}
            busy={busy || waitingForSupport || confirmedDesign !== null}
            onSkip={
              activeStep === 'customize' && asksQuestions && questions.at !== 'unwritable'
                ? () => {
                    setCustomizeSkipped(true)
                    advance()
                  }
                : activeStep === 'system'
                  ? () => {
                      ds.setPick(null)
                      advance()
                    }
                  : undefined
            }
          />
        ) : null}
      </div>
    </div>
  )
}
