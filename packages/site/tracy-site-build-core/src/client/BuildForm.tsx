/**
 * 🔒 NOT A WAY INTO A NEW SITE ANY MORE (since 24/09/2026) — kept whole, on purpose.
 *
 * A press in Design inspiration used to land here: this form, its four questions, the
 * `POST /api/sites/claim` it fires before asking any of them, and a wait budgeted at thirty
 * minutes. Making a site is one flow now, the Add site wizard, and the gallery's pick rides in as
 * its `design` — so nothing opens this tab from the creation workspace. Measured 24/09 on dev,
 * the cost of the old way: pressing *Create with Joomla* merely to LOOK at this form left a
 * claimed site (`j-fq0j3y`) behind, before a single question was answered.
 *
 * Nothing here is deleted because nothing here is wrong: asking a customer what their business is
 * and writing the site from the answer is the feature, and it is meant to come back once it is
 * solid ("we will round the feature out later"). Bringing it back is pointing `creationTabFor()`
 * (`@tracy/core/tab-link`) at `buildTabFor(platform)` again — the two call sites in
 * `tracy-tab-link`, the local copy in `tracy-design-inspiration`, and the one typed-out string in
 * `apps/tracy-web/src/workspace/route.js`.
 *
 * The tab itself still registers and still opens on a site that already exists; what changed is
 * only who sends a customer to it.
 *
 * The form the AGENT sent to the Build tab (07/09, after Claude Design): the agent's
 * own questions when it wrote some, the standard FIVE otherwise, and three ways out — Tracy
 * decides, Ask me follow-up questions, Send answer. Nothing reaches the chat until one of them is
 * pressed; then the answers go as the customer's own message and the build starts.
 *
 * THE STANDARD FIVE COME IN TWO STEPS (08/09): what the business is, then how it should read.
 * The agent's own questions do NOT — a form this file did not author has no groups it can trust,
 * so those stay one column, and so does the form the engine hands back asking for what it missed.
 */
import { Button, cn, Input, Textarea } from '@tracy/ui'
import { AlertCircle, ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type Answers,
  type BuildApi,
  type DesignPlan,
  type Job,
  type Question,
  type Questionnaire,
  type QuestionnaireSet,
  type SitePreview
} from './api'
import { Chips, Field } from './ask-form/primitives'
import { labelOf, readCarry, writeCarry } from './carry.mjs'
import { agentReachable, askAgent } from './composer'
import { currentSiteKey, inOnboarding } from './dsh-url'
import { LanguageBox } from './LanguageBox'
import { languageLabel, languageName } from './languages.mjs'
import { defaultLanguage, defaultLanguages } from './languages.mjs'
import {
  claimNewSite,
  createNewSite,
  signInPlan,
  signedIn,
  waitForProvision,
  waitForSignIn,
  whoAmI
} from './new-site.mjs'
import { effectiveAnswers, missingRequired, SEED_PAGES, visibleQuestions } from '../questions.mjs'
import { quickstartFor } from '../quickstarts.mjs'
import { refusalText } from './host-text'
import type { Translate } from './strings'
import { revealTaskPanel } from './task-panel'

/**
 * The label of the site this page IS, or null in the creation workspace.
 *
 * A site key is `<label>.<domain>` everywhere this runs (`site-4x82yk.tracy.test`), and the label is
 * what the create door names a site by. Null under `/new/`, where there is no site yet and the
 * customer's answer is the only thing that can name one.
 */
function labelOfCurrentWorkspace(): string | null {
  if (inOnboarding()) return null
  const key = currentSiteKey()
  const label = typeof key === 'string' ? (key.split('.')[0] ?? '') : ''
  return label === '' ? null : label
}

/**
 * The pages the form offers, in menu order. `home` is on and cannot be turned off — every site has
 * one, which is also why no line of text says so.
 *
 * 🔒 THESE IDS ARE THE SEEDER'S SLUGS (`MENU` of `seed-plan.mjs`), not labels. They travel as
 * `answers.pages` → `site.wanted` → `buildSeedPlan`, and a slug that does not match there seeds
 * nothing while looking perfectly fine on screen.
 */
/** The pages a `seed.pages` question may offer — one list, owned by `questions.mjs`. */
export const PAGES: readonly string[] = SEED_PAGES

/** Option labels for the standard ids come from the dictionary; the agent's options are its own words. */
function optionLabel(q: Question, option: string, t: Translate, { spoken = false } = {}): string {
  // A set that ships its own labels (tracy-questions/v1) is drawn from them; the dictionary keys
  // below remain for an agent's ad-hoc questions that reuse the standard ids.
  const own = q.optionLabels?.[option]
  if (typeof own === 'string' && own !== '') return own
  if (q.id === 'pages') return t(`page.${option}` as never)
  if (q.id === 'tone') return t(`tone.${option}` as never)
  // A language is named by the browser, never printed as its code. The chip carries the English
  // name of the language alone ("Vietnamese"); the sentence SPOKEN to the agent carries English only, because
  // the host reads the customer's language off that sentence by its script (`languageName` says
  // how a native "中文" turned a Vietnamese brief's whole build Chinese, 21/09).
  if (q.kind === 'languages' || q.id === 'languages')
    return spoken ? languageName(option) : languageLabel(option)
  return option
}

/**
 * 🔒 EVERY PAGE STARTS ON (Lee, 08/09). The customer turns pages OFF rather than hunting for the
 * ones they want, so the chips read as a summary of what is about to be built rather than as a
 * shopping list — and `DEFAULTS` stops being a promise only the code can see.
 */
const DEFAULTS: Answers = { pages: [...PAGES], tone: 'plain', languages: ['en'] }

export function BuildForm({
  api,
  id,
  name,
  platform,
  platformName,
  questions,
  questionnaireSet = null,
  allowedLanguages,
  oneLanguage = false,
  uiLang = 'en',
  prefill,
  agentSent,
  site,
  job,
  fresh = false,
  t,
  header,
  onStarted,
  onProvisionFailed
}: {
  api: BuildApi
  id: string
  name: string
  platform: string
  /** How the customer reads the platform: "WordPress". */
  platformName: string
  prefill?: Answers
  questions: Question[]
  /**
   * The exact candidate `questions` came from (22/09), when Tracy's door said. Carried into the
   * build so its submit is judged against these questions, whatever an administrator uses later.
   */
  questionnaireSet?: QuestionnaireSet | null
  allowedLanguages?: readonly string[]
  /** The design can never carry a second edition: exactly one language is asked for. */
  oneLanguage?: boolean
  /** The person's own language (the page's), what the language question starts from. */
  uiLang?: string
  /** Whether the agent sent these (a line says so) or the tab fell back to the standard six. */
  agentSent: boolean
  site: SitePreview | null
  /** The job that came back for answers (`waiting: form:…`), else null for a fresh form. */
  /** Opened by a press just now (not restored): the creation workspace may claim on its own. */
  fresh?: boolean
  job: Job | null
  t: Translate
  header: ReactNode
  onStarted: (job: Job) => void
  /**
   * A provision that failed on a site that DOES exist — the tab must remember this after the
   * customer walks away, so it goes to the host rather than staying in this component's state.
   */
  onProvisionFailed?: (failed: { siteKey: string; message: string } | null) => void
}): JSX.Element {
  const missing = job?.waiting?.startsWith('form:') ? job.waiting.slice('form:'.length).split(',') : null
  // The languages a build can be asked for: the question's own options when the template ships
  // a fixed set (EmDash), the CMS's allowance otherwise (Joomla, WordPress: any).
  const languagesOffered =
    questions.find((q) => q.kind === 'languages' || q.id === 'languages')?.options ?? allowedLanguages
  /** The browser's languages: they say which English, when the build offers several. */
  const browserLanguages: string[] =
    typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [navigator.language])].filter(Boolean)
  /** The starting languages: one for a one-language design, English plus the person's otherwise. */
  const startLanguages = (): string[] =>
    oneLanguage
      ? [defaultLanguage(uiLang, languagesOffered, browserLanguages)]
      : defaultLanguages(uiLang, languagesOffered, browserLanguages)
  const [answers, setAnswers] = useState<Answers>({
    ...DEFAULTS,
    languages: startLanguages(),
    ...prefill,
    ...job?.answers
  })
  /** Whether the person chose languages themselves — a default is never put over a choice. */
  const pickedLanguages = useRef(false)
  const offeredKey = languagesOffered?.join(',') ?? ''
  useEffect(() => {
    // The questions arrive after the form drew: the default is recomputed against what they
    // offer, unless the person, a carry or an agent's ask already said which languages.
    if (pickedLanguages.current || prefill?.languages !== undefined || job?.answers?.languages !== undefined)
      return
    setAnswers((a) => ({ ...a, languages: startLanguages() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the offer is keyed by its string
  }, [offeredKey, uiLang, oneLanguage])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * The site was claimed and the fleet did not finish it (or finished it and its workspace is not
   * ready): the press is offered again, and pressing again continues the SAME logical build.
   */
  const [failed, setFailed] = useState<{ message: string; siteKey?: string } | null>(null)
  /**
   * Which page. The pages are the set's own `step` values (below); a claimed site starts on the
   * second when the set puts the name on the first — it was answered in the creation workspace.
   */
  const [at, setAt] = useState(1)
  /**
   * Who is signed in, as `/auth/me` answers once the form mounts: `undefined` until it answers,
   * `null` for nobody. Read here for two reasons — a carry is only read back for the account that
   * wrote it, and a press by somebody already signed in must not flash a sign-in window.
   */
  const [me, setMe] = useState<string | null | undefined>(undefined)
  /**
   * The press's own identity, kept across retries and across the sign-in reload (in the carry):
   * `POST /api/sites` treats a second request carrying it as the first one asked again, never as a
   * second site. Every successful press ends by clearing the carry, so the next press is a new
   * build with a new id.
   */
  const [buildId, setBuildId] = useState<string>(() => crypto.randomUUID())
  const attempt = useRef(0)
  /** Whether the customer has typed since the form mounted — a carry never overwrites typing. */
  const touched = useRef(false)
  /**
   * What the fleet says this design will ACTUALLY build with.
   *
   * Asked while the customer is still filling the form, so a picked inspiration with no Joomla
   * template of its own says "this will be built with Apple" above the button rather than as a
   * failed stage twenty minutes later. Null while it is being asked and whenever it cannot be
   * asked — the notice is something the form adds, never something it waits for.
   */
  const [designPlan, setDesignPlan] = useState<DesignPlan | null>(null)
  /**
   * The site this form already claimed by its name, when it has (`POST /api/sites/claim`). Set from
   * the carry on mount: a claim ends in a navigation to that site's own workspace, and the form that
   * draws there is this one, continuing (tasks/todo-claim-then-workspace.md).
   */
  const [claimed, setClaimed] = useState<{ siteKey: string; label: string } | null>(null)
  /**
   * For a brand press: the site the brand was extracted in (`Brand/<host>/` of its folder). Known
   * where the press begins — the page of that site — and carried across the claim's move into the
   * new site's workspace, where the page no longer knows it (`carry.mjs`).
   */
  const brandSource = useRef<string | null>(id.startsWith('brand:') ? currentSiteKey() : null)

  /**
   * Two steps only for the form this file authored. An agent's own questions, and the engine coming
   * back for what it missed, both stay one column — see the comment above that branch.
   */
  const stepped = !agentSent && missing === null

  // The design plan is the fleet's answer, not the lane's guess, so it is fetched rather than
  // derived. Re-asked when the picked design or the platform changes, which is the only thing that
  // can change the answer while this form is open.
  useEffect(() => {
    let live = true
    setDesignPlan(null)
    if (!id) return undefined
    void api.fetchDesignPlan(id, platform).then((plan) => {
      if (live) setDesignPlan(plan)
    })
    return () => {
      live = false
    }
  }, [api, id, platform])

  // The carry: what this same account answered before the sign-in reload, or before a retry. Read
  // only once the account is known, and only for it — B signing in on A's tab never continues A's
  // form. A carry for another inspiration is left alone; it belongs to another tab's press.
  useEffect(() => {
    let live = true
    void whoAmI().then((email) => {
      if (!live) return
      setMe(email)
      // `platform` as well as `email`: a carry written by another CMS's Build tab carries that
      // build's id, and reusing it here is refused by the claim door — see the block in
      // `readCarry`. The inspiration matching is not enough; two CMSes share one inspiration.
      const carried = readCarry(undefined, { email, platform })
      if (!carried || carried.id !== id || touched.current) return
      setAnswers((a) => ({ ...a, ...(carried.answers as Answers) }))
      if (carried.buildId) setBuildId(carried.buildId)
      if (carried.brandFrom) brandSource.current = carried.brandFrom
      // The claim this form made before the move — honoured only IN the site it claimed, never back
      // in the creation workspace, where it would offer to build a site this page cannot reach.
      if (carried.siteKey && carried.label && carried.siteKey === currentSiteKey())
        setClaimed({ siteKey: carried.siteKey, label: carried.label })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per form
  }, [])

  // The site block arrives after the form mounted: its name fills an empty box once, never a typed one.
  useEffect(() => {
    const siteName = site?.site.name
    if (typeof siteName === 'string' && siteName !== '' && !answers.name)
      setAnswers((a) => ({ ...a, name: siteName }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fill once when the site lands
  }, [site])

  const set = (qid: string, value: string | string[]) => {
    touched.current = true
    if (qid === 'languages') pickedLanguages.current = true
    setAnswers((a) => ({ ...a, [qid]: value }))
    // A required question answered clears its own mark; the others keep theirs until the press.
    setClientMissing((m) => (m?.includes(qid) ? m.filter((x) => x !== qid) : m))
  }
  /**
   * Required questions the customer left empty at the last press — marked the same way the engine
   * marks what it came back for (`job.waiting`), because to the customer it is the same thing.
   * Judged by the ONE evaluator (`questions.mjs`): a question hidden by an earlier choice is never
   * required, and its answer never leaves this form.
   */
  const [clientMissing, setClientMissing] = useState<string[] | null>(null)
  const hi = (qid: string) =>
    missing?.includes(qid) || clientMissing?.includes(qid)
      ? 'rounded-md ring-1 ring-destructive ring-offset-2 ring-offset-background'
      : ''
  /** The questions on show right now, given what was answered so far. */
  const shown = visibleQuestions(questions, answers) as Question[]
  const snapshot: Questionnaire | undefined = questionnaireSet
    ? { set: questionnaireSet, questions }
    : undefined

  /** What the customer said, one line, for the message the chat shows as theirs. */
  const said = (given: Answers) => {
    const none = t('msg.none')
    const words = (v: unknown, q?: Question) =>
      Array.isArray(v)
        ? v.map((o) => (q ? optionLabel(q, o, t, { spoken: true }) : o)).join(', ') || none
        : typeof v === 'string' && v.trim() !== ''
          ? q
            ? optionLabel(q, v.trim().replace(/[.!?]+$/, ''), t, { spoken: true })
            : v.trim()
          : none
    const byId = new Map(questions.map((q) => [q.id, q]))
    // A name-only form (see `standardQuestions`) posts a message that promises nothing it did not
    // ask: no pages, no tone, no language — those would read as things about to be built. A
    // TEMPLATE (D37) is the one case where what was picked IS what is built, so its message says
    // that instead of "noted for later" — and carries the other answers, which the template's own
    // personalize step puts into the site.
    if (!byId.has('about') && !byId.has('pages')) {
      const rest = questions.filter((q) => q.id !== 'name').map((q) => `${q.label}: ${words(given[q.id], q)}`)
      const line = t(designPlan?.workflow === 'template' ? 'msg.answeredTemplate' : 'msg.answeredName', {
        name,
        platform: platformName,
        business: words(given.name)
      })
      return rest.length > 0 ? `${line} ${rest.join('. ')}.` : line
    }
    // An edit after the build is not a new build: the agent reads it as the brief changing.
    const standard = t(job?.targetSiteKey && missing === null ? 'msg.revised' : 'msg.answered', {
      name,
      platform: platformName,
      business: words(given.name),
      about: words(given.about),
      pages: words(given.pages, byId.get('pages')),
      tone: words(given.tone, byId.get('tone')),
      language: words(given.languages, byId.get('languages')),
      contact: words(given.contact)
    })
    const extras = questions
      .filter((q) => !['name', 'about', 'pages', 'tone', 'languages', 'contact'].includes(q.id))
      .map((q) => `${q.label}: ${words(given[q.id], q)}`)
    return extras.length > 0 ? `${standard} ${extras.join('. ')}.` : standard
  }

  /**
   * The press: a NEW site first, then the build on it (tasks/todo-build-new-site.md).
   *
   * 🔒 THE SESSION HALF IS `holdsSession`, and it is one function for both presses. It opens the
   * sign-in window first, before any `await`, ONLY when nobody is KNOWN to be signed in — Chrome
   * blocks a `window.open` that runs after an await, which is why the window cannot simply wait
   * for a check. What it no longer does is treat "not heard back yet" as "signed out": that is
   * what flashed a window at signed-in people on the Design inspiration flow (19/09).
   *
   * Pressed again after a failure, this is the SAME build: same `buildId`, same answers, one more
   * attempt. The task list opens itself once per attempt, and the door continues the claim it
   * already holds rather than making a second site.
   */
  /**
   * The press itself claims the site — no question asked first (Lee, 15/09: B). The answer is the
   * address of that site's own workspace, where the whole form, the build and the agent belong; the
   * site's address is a DRAFT the door makes up, and the business name is an answer like any other.
   *
   * 🔒 THE MOVE IS A NAVIGATION, NOT A SESSION SWITCH. A seat is a site's page: the fence that keeps
   * one customer's agent out of another's site compares a session's folder with the seat the page
   * holds (`siteSeatGrant`, ADR 0014 §3). A session opened in `/site/<label>` from `/new/` is
   * refused by that same fence — the agent could not read the site it had just built (measured
   * 15/09). So the claim ends here, and the site's own page continues.
   */
  /**
   * The session half of a press, for the two presses that need it (claim and start).
   *
   * 🔒 NOTHING IS OPENED AT SOMEBODY WHO MIGHT ALREADY BE SIGNED IN. `signInPlan` tells the three
   * states apart (`new-site.mjs` says why three): a known email goes straight through; a known
   * absence opens the window INSIDE the click, where a popup blocker still allows it; and an
   * unknown state — the form has not heard back from `/auth/me`, or heard a failure — asks the
   * door before bothering anybody. Measured 19/09 on the Design inspiration flow: a press in that
   * third state flashed a sign-in window at a signed-in person and closed it a beat later, which
   * reads exactly like being asked to sign in again.
   *
   * When the ask says nobody is there, the window cannot be opened any more (the click is spent),
   * so the whole page goes to `/login` instead — the carry is written first, so the answers come
   * back with the person.
   *
   * @returns true when the press may continue; false when this press is over (the page is
   *   reloading or navigating, or the customer gave up on the sign-in window).
   */
  const holdsSession = async (given: Answers): Promise<boolean> => {
    const plan = signInPlan(me)
    if (plan === 'go') return true
    const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`
    if (plan === 'ask') {
      const email = await whoAmI()
      if (email) {
        setMe(email)
        return true
      }
      writeCarry({ id, platform, answers: given, buildId })
      location.assign(loginHref)
      return false
    }
    const opened = window.open(loginHref, 'tracy-signin', 'width=480,height=760')
    if (await signedIn()) {
      opened?.close()
      return true
    }
    writeCarry({ id, platform, answers: given, buildId })
    const landed = await waitForSignIn()
    if (!landed) {
      setBusy(false)
      setError(t('form.signInFailed'))
      return false
    }
    opened?.close()
    // The session cookie is new: everything on this page was fetched without it. A reload is the
    // honest way to start again as the signed-in person; the carry brings these answers back.
    location.reload()
    return false
  }

  const claim = async (given: Answers) => {
    setBusy(true)
    setError(null)
    if (!(await holdsSession(given))) return
    // The same plan the build will be asked for: a claim's fingerprint is the create door's own, so
    // the press that follows is the same request and never a second site.
    const plan = designPlan ?? (await api.fetchDesignPlan(id, platform))
    if (plan) setDesignPlan(plan)
    if (platform === 'joomla' && !plan) {
      setBusy(false)
      setError(t('form.planUnavailable'))
      return
    }
    const brandFrom = brandSource.current ? { brandFrom: brandSource.current } : {}
    writeCarry({
      id,
      platform,
      answers: given,
      ...(typeof me === 'string' ? { email: me } : {}),
      buildId,
      ...brandFrom
    })
    const result = await claimNewSite({
      platform,
      buildId,
      ...(platform === 'joomla' && plan?.baseQuickstart ? { quickstart: plan.baseQuickstart } : {}),
      ...(plan ? { design: plan.requestedDesign, designRevision: plan.registryRevision } : {})
    })
    if (!result.ok) {
      setBusy(false)
      setError(t('form.claimFailed', { message: result.message }))
      return
    }
    writeCarry({
      id,
      platform,
      answers: given,
      ...(typeof me === 'string' ? { email: me } : {}),
      buildId,
      siteKey: result.siteKey,
      label: result.label,
      // The inspiration's NAME travels too: the site's page opens the Build tab from the carry, and
      // a header reading `tracy-business` is an id shown to a customer.
      name,
      ...brandFrom
    })
    // Warm the site's door before going through it: the first request to `/<siteKey>/` mints the
    // seat cookie and answers 302; done here, the navigation that follows lands in one go.
    try {
      await fetch(result.next, { credentials: 'include', redirect: 'follow' })
    } catch {
      // The navigation will mint it the slow way.
    }
    location.assign(result.next)
  }

  // In the creation workspace the tab has one job: claim, then move. Once, when the account is
  // known (the claim needs a seat), and never again after a failure — the button below does that.
  const autoClaimed = useRef(false)
  useEffect(() => {
    if (!fresh || !inOnboarding() || job?.targetSiteKey || me === undefined || autoClaimed.current) return
    autoClaimed.current = true
    void claim(answers)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when `me` is known
  }, [me, fresh])

  /**
   * Continue a press whose page went away.
   *
   * 🔒 THE PRESS LIVES IN A PROMISE, AND NOTHING OUTLIVES THE PAGE THAT HELD IT. `go` reports
   * `creating`, then POLLS the provision itself — and only when that poll says `done` does
   * `startBuild` run, which is the ONE call that carries the customer's answers to the site. A
   * reload, a navigation, a workspace switch: the promise goes with the page, the to-do list
   * freezes at the last step it managed to report, and the build is never started. Nothing errors.
   *
   * Measured 22/09/2026 on three sites built through Design inspiration, one per CMS: all three
   * provisioned fine (`job.state = done`, all three serving), all three still showing the
   * template's demo content, and `docs/agents/build/` absent on every one — `startBuild` had never
   * run. Their to-do lists read `creating` completed and `fetching webroot` in progress, for sites
   * that had finished minutes earlier. The customer read it as the build being stuck.
   *
   * 🔒 IT DOES NOT GO BACK THROUGH THE CREATE DOOR, AND THE FIRST VERSION OF THIS DID. Reasoning
   * that `createNewSite` is idempotent on `buildId` was true but beside the point: the site this
   * press asked for ALREADY EXISTS by the time a resume runs, so asking to create it again is
   * asking the wrong question. Measured 22/09/2026 on `site-g5dm6x` — the press had in fact
   * succeeded (row `done`, `docs/agents/build/job.json` written by the provision sweep), only its
   * page had died before it could clear the carry, and the resume's second create was refused
   * `IDEMPOTENCY_CONFLICT`. The customer read a finished site as a failed one.
   *
   * What is actually missing after a lost press is the BUILD, so that is what this asks for. No
   * create, no poll, no second claim — one call, and the whole class of conflict with it.
   *
   * ⚠ FOR JOOMLA AND WORDPRESS IT IS THE ONLY ROAD. It used to be the fast one, with
   * `cron.js: startUnwatchedBuilds` finishing any press no page came back for. Since #249 the sweep
   * builds only EmDash — a Joomla/WordPress build writes through the Apply door, which needs a
   * person present — so a resume that starts too early is not rescued by anything: it has to wait
   * for the site's handover first (`resume` below).
   *
   * ⚠ IT RESUMES ONLY WHAT WAS ACTUALLY PRESSED. `pressedAt` is written by `go` and never by
   * `claim`, which is the whole distinction: a claimed site whose questions have NOT been answered
   * must sit and wait for its customer, not build itself out of half a form.
   */
  const autoResumed = useRef(false)
  useEffect(() => {
    if (autoResumed.current || me === undefined || inOnboarding()) return
    // A build already exists: whatever happened, it is not lost. `null` is "asked, and there is
    // none" — anything else means the answer is not in yet, and acting during that gap is how the
    // first version of this raced its own press.
    if (job !== null) return
    const carried = readCarry(undefined, { email: me ?? undefined, platform })
    if (!carried || carried.id !== id) return
    if (typeof carried.pressedAt !== 'number') return
    if (carried.siteKey === undefined || carried.siteKey !== currentSiteKey()) return
    const given = carried.answers as Answers
    if (!given || Object.keys(given).length === 0) return
    autoResumed.current = true
    void resume(carried.siteKey, given, carried.jobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when `me` and the job are known
  }, [me, job])

  /**
   * Ask for the build a lost press never got to ask for — once the site it is for has been handed
   * over, which is the one thing the lost press was still waiting on.
   *
   * 🔒 A SITE THAT ANSWERS IS NOT A SITE THAT HAS BEEN HANDED OVER. The fleet serves the restored
   * pages before it installs the content door, and the door is paired only when the job-poll door
   * answers `done` (`waitForProvision`). A resume that asked for the build as soon as the page came
   * back reached a site whose component was not in the seat book yet: measured 23/09/2026 on
   * `wp-oyib7i`, `check` died `COMPONENT_NOT_REGISTERED` 107 s after the claim, and since the sweep
   * no longer builds Joomla/WordPress sites (#249) nothing ran it again. So when the press left its
   * job behind, this polls that job exactly as `go` did, and reports its steps to the task list the
   * reload froze. A carry written before the job was known still resumes at once, as before.
   */
  const resume = async (siteKey: string, given: Answers, jobId?: string) => {
    let liveUrl = site?.site?.url ?? undefined
    if (jobId) {
      const handed = await waitForProvision(siteKey, jobId, {
        onStep: (s) => {
          void api.reportProvision(s)
        }
      })
      // Quiet on a site that is not done: `go`'s own press, or the customer pressing again, is the
      // road on — a failure said from here would repeat, in other words, what the task list shows.
      if (!handed.ok) return
      void api.reportProvision('complete')
      liveUrl = handed.liveUrl ?? liveUrl
    }
    const started = await api.startBuild(
      id,
      platform,
      given,
      siteKey,
      liveUrl,
      designPlan ?? undefined,
      snapshot
    )
    if (!started.ok) {
      // Quiet on purpose: the sweep is the road that does not need this page, and an error here
      // would tell the customer their site failed when it is merely not finished YET.
      return
    }
    writeCarry(null)
    onStarted(started.job)
  }

  /** The site this press is FOR: the one the claim took, else the workspace this page is in. */
  const pressedSite = claimed?.siteKey ?? currentSiteKey()

  const go = async (typed: Answers, message: string) => {
    if (!job?.targetSiteKey && !agentReachable()) {
      setError(t('form.noSession'))
      return
    }
    // What counts: the answers of shown questions only, and every shown required one answered.
    const need = missingRequired(questions, typed)
    if (need.length > 0) {
      setClientMissing(need)
      setError(t('form.missingRequired'))
      return
    }
    setClientMissing(null)
    const given = effectiveAnswers(questions, typed) as Answers
    setBusy(true)
    setError(null)
    setFailed(null)
    if (job?.targetSiteKey) {
      const accepted = await api.sendAnswers(given, job.targetSiteKey, snapshot)
      const resumed = accepted ? await api.fetchJob(job.targetSiteKey) : null
      setBusy(false)
      if (resumed) {
        onStarted(resumed)
        // The chat keeps the record; the engine already has the answers, so an unreachable
        // composer loses the line, not the change.
        if (agentReachable()) askAgent(message)
      } else setError(t('form.failed', { message: t('form.missing') }))
      return
    }
    if (!(await holdsSession(given))) return

    const plan = designPlan ?? (platform === 'joomla' ? await api.fetchDesignPlan(id, platform) : null)
    if (platform === 'joomla' && !plan) {
      setBusy(false)
      setError(t('form.planUnavailable'))
      return
    }
    if (plan) setDesignPlan(plan)
    // Written BEFORE the fleet is asked, stamped for this account: a reload mid-provision lands on
    // this same form with these answers and this same build id, and the resume effect below
    // continues it.
    //
    // 🔒 IT KEEPS THE SITE AND STAMPS THE PRESS, AND BOTH ARE LOAD-BEARING. This used to write
    // `{id, platform, answers, email, buildId}` — dropping the `siteKey` the claim had put there.
    // A page that came back then held answers it could not attribute to any site, so nothing could
    // tell "this press was interrupted" from "this site is claimed and still waiting to be
    // answered", and the only way on was the customer pressing again. `pressedAt` is the
    // difference: the claim never writes one.
    writeCarry({
      id,
      platform,
      answers: given,
      ...(typeof me === 'string' ? { email: me } : {}),
      buildId,
      ...(pressedSite ? { siteKey: pressedSite } : {}),
      ...(claimed?.label ? { label: claimed.label } : {}),
      ...(brandSource.current ? { brandFrom: brandSource.current } : {}),
      pressedAt: Date.now()
    })
    attempt.current += 1
    void api.reportProvision('creating')
    void revealTaskPanel(`${buildId}:${attempt.current}`)
    // `contact` becomes public page content. Only customer-provided answers may fill it;
    // the account signing in can belong to an agency rather than this business.
    // Joomla: the base the fleet's plan resolved. WordPress: the archive the picked template IS
    // (Tracy Base → tracy-base/wp7); any other inspiration restores nothing and dresses the released
    // theme instead. One function answers both (`quickstarts.mjs`).
    const quickstart = quickstartFor(platform, id, plan)
    const site = await createNewSite(
      {
        // The name the claim already took, when there was one: the site exists under it, and
        // deriving a label again from a name edited since would build a second one.
        //
        // 🔒 AND INSIDE A SITE'S OWN WORKSPACE, THAT SITE IS THE ANSWER — NEVER A LABEL MADE FROM
        // THE NAME. `labelOf` turns the business name into a label, and an empty name into
        // `site-<six random characters>`. In the creation workspace that is exactly right: no site
        // exists yet and the name IS the address. Drawn inside a site that already exists it is a
        // second site, built from the first one's workspace, with the first left behind holding the
        // chat. Measured 20/09/2026: a customer's questionnaire never arrived (the Build tab's own
        // wait had no end), they submitted with nothing filled in, and `labelOf({})` made
        // `site-4x82yk` — provisioned, addressless, never served. Answering again later, with a
        // name this time, made `ban-xe-noi-that`. The agent went on editing the first.
        //
        // `createNewSite` is still the road: the door answers a label that already exists with that
        // site rather than a second one, which is the same answer the claim path relies on.
        label: claimed?.label ?? labelOfCurrentWorkspace() ?? labelOf(given, platform),
        platform,
        buildId,
        ...(quickstart ? { quickstart } : {}),
        // A brand press: the site its brand was extracted in; the door checks the seat, the host
        // copies `Brand/<host>/` into this site's folder before the build is started.
        ...(brandSource.current ? { brandFrom: brandSource.current } : {}),
        // 🔒 THE ANSWERS TRAVEL WITH THE PRESS, NOT ONLY WITH THE BUILD. `startBuild` below is
        // still what begins the build, and on the ordinary path it runs the moment this poll says
        // `done`. But this poll lives in a promise owned by the page, and a reload or a navigation
        // takes it — after which nothing anywhere knows what the customer asked for. Written down
        // here, the provision sweep can finish the press without a browser
        // (`cron.js: startUnwatchedBuilds`).
        // 🔒 AND THE QUESTIONNAIRE TRAVELS WITH THEM, for the same reason the answers do. The
        // snapshot is what lets the server judge these answers with the evaluator the form used
        // and write the set's identity into `brief.json`; without it a press finished by the
        // sweep produces a brief that cannot say WHICH questions it answers, and an
        // administrator's later Use silently becomes the meaning of a build already running.
        press: {
          id,
          ...(plan ? { designPlan: plan } : {}),
          answers: given,
          ...(snapshot ? { questionnaire: snapshot } : {})
        },
        // The design the customer picked, plus the revision the notice above the button was
        // resolved against. The fleet decides what that becomes; sending the revision is what
        // makes a registry that moved while this form was open come back with the NEW plan.
        ...(plan ? { design: plan.requestedDesign, designRevision: plan.registryRevision } : {})
      },
      {
        onStep: (s) => {
          void api.reportProvision(s)
        },
        // The job this press started, into the carry the moment it is known: a reload before the
        // poll below ends comes back holding it, and the resume waits for the same handover instead
        // of asking for a build too early.
        onJob: ({ jobId }) => {
          const now = readCarry(undefined, { email: me ?? undefined, platform })
          if (now) writeCarry({ ...now, jobId })
        }
      }
    )
    if (!site.ok) {
      // The reason goes into the task list in this page's language when the page has words for it
      // (`messageKey`); a server's own sentence goes as it was sent.
      void api.reportProvision(
        'failed',
        'messageKey' in site && typeof site.messageKey === 'string'
          ? t(site.messageKey as Parameters<typeof t>[0])
          : site.message
      )
      setBusy(false)
      // A registry that moved comes back as the new plan: show it, keep the answers, and let the
      // customer press again knowing what they are getting. Not an error they can only read.
      if (site.plan) {
        setDesignPlan(site.plan as DesignPlan)
        setError(t('form.planChanged'))
        return
      }
      // A fleet-created site has its durable progress in the chat task list, step by step; below
      // the questionnaire only the fact and the way out: failed, and a Retry that continues this
      // same build. A refusal BEFORE a site key exists is still said in full here, as before.
      if (site.siteKey) {
        setFailed({ message: site.message, siteKey: site.siteKey })
        // 🔒 AND SAY IT SOMEWHERE THAT OUTLIVES THIS COMPONENT. `setFailed` is React state: switch
        // to another site's workspace and back — which is exactly what a customer does while they
        // wait — and the tab is rebuilt from `meta`, the failure is gone, and `BuildTab` falls
        // through to "Tracy is preparing a few questions…" for a site that was never stood up.
        // Measured 19/09/2026 on `site-5big32`: provision died after 2.04s on a 404 from the
        // quickstart release, the chat's task list said so, and the panel beside it span for ever.
        // The customer read that as the build not running in parallel.
        onProvisionFailed?.({ siteKey: site.siteKey, message: site.message })
      } else {
        // A sentence this page wrote itself has a key; a server's own sentence is shown as sent.
        const message =
          'messageKey' in site && typeof site.messageKey === 'string'
            ? t(site.messageKey as Parameters<typeof t>[0])
            : site.message
        setError(t('form.failed', { message }))
      }
      return
    }
    // 🔒 EVERY WORKFLOW ENDS HERE, TEMPLATE-BUILD INCLUDED — there is nothing to hand over any
    // more. The name claimed the site and moved the customer into its workspace before anything
    // was built (D39), so by the time this press runs the session, the seat and the folder are
    // already the site's own: the build starts where it belongs, in place, with no second page.
    // The `construction-handoff` overlay that used to open the new site after the build was
    // deleted 15/09 with the road it served (`tasks/todo-claim-then-workspace.md`).
    void api.reportProvision('complete')
    const started = await api.startBuild(
      id,
      platform,
      given,
      site.siteKey,
      site.liveUrl ?? undefined,
      // What the fleet answered for THIS site, when it answered; the plan the form showed is only
      // the fallback for a create that returned none.
      (site.design as DesignPlan | null) ?? plan ?? undefined,
      snapshot
    )
    setBusy(false)
    if (!started.ok) {
      setError(t('form.failed', { message: refusalText(t, started) }))
      return
    }
    writeCarry(null)
    askAgent(site.liveUrl ? `${message} ${t('form.created', { url: site.liveUrl })}` : message)
    onStarted(started.job)
  }

  /** One question, drawn by its kind. The language box is the one that is not a row of chips. */
  const ask = (q: Question): JSX.Element => {
    const value = answers[q.id]
    return (
      <div key={q.id} className={hi(q.id)}>
        <Field
          label={q.required ? `${q.label} *` : q.label}
          {...(q.id === 'name' && claimed
            ? { note: t('form.draftAddress', { address: claimed.siteKey }) }
            : {})}
        >
          {q.kind === 'languages' ? (
            <LanguageBox
              typed={typeof answers.about === 'string' ? answers.about : ''}
              picked={Array.isArray(value) ? value : ['en']}
              allowedLanguages={languagesOffered}
              single={oneLanguage}
              onChange={(next) => set(q.id, next)}
              t={t}
            />
          ) : q.kind === 'longtext' ? (
            <Textarea
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => set(q.id, e.target.value)}
              rows={3}
              placeholder={q.hint}
            />
          ) : q.kind === 'text' ? (
            <Input
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => set(q.id, e.target.value)}
              placeholder={q.hint}
            />
          ) : (
            <Chips
              items={(q.options ?? []).map((o) => [o, optionLabel(q, o, t)])}
              on={Array.isArray(value) ? value : typeof value === 'string' ? [value] : []}
              onToggle={(o) => {
                if (q.kind === 'choice') set(q.id, o)
                else if (q.id === 'pages' && o === 'home') return
                else {
                  const cur = Array.isArray(value) ? value : []
                  set(q.id, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])
                }
              }}
            />
          )}
        </Field>
      </div>
    )
  }

  const send = (
    <Button className="w-full" disabled={busy} onClick={() => void go(answers, said(answers))}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : null}
      {missing ? t('form.continue') : t('form.send')}
    </Button>
  )
  const notice = error ? <p className="text-destructive text-sm">{error}</p> : null
  /**
   * Failed, and said so — not a spinner, not the step-by-step the task list already shows. The
   * Retry continues the same build (`buildId`), with the answers as they stand.
   */
  const failedNotice = failed ? (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <span className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
        <span>{failed.siteKey ? t('form.provisionFailed') : failed.message}</span>
      </span>
      <div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void go(answers, said(answers))}>
          <RotateCcw size={14} /> {t('form.retry')}
        </Button>
      </div>
    </div>
  ) : null
  /**
   * The one sentence this whole path exists to be able to say, and it has to sit ABOVE the button.
   *
   * Informational chrome, not a refusal: `border-primary` is what this form already uses to tell a
   * customer something they can act on, and `text-destructive` stays reserved for "this did not
   * work". It never disables Submit — a picked design with no Joomla template is a perfectly good
   * site built with the default one, and blocking it would be a worse answer than saying so.
   */
  const fallbackNotice = designPlan?.fallback ? (
    <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-primary" />
      {t(designPlan.workflow === 'template-build' ? 'form.designBuildFromBase' : 'form.designFallback', {
        requested: name,
        effective: designPlan.effectiveDesignName ?? designPlan.effectiveDesign
      })}
    </div>
  ) : null

  // ── The agent's own form, or the engine asking again: one column, no steps ────────────────────
  //
  // 🔒 A form this file did not author has no groups it can trust. The two steps below are the
  // shape of the standard five and of nothing else; imposing them on an agent's questions would
  // put a Next between two halves chosen at random.
  if (!stepped)
    return (
      <div className="flex flex-col gap-5 p-4">
        {header}
        {missing ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-primary" />
            {t('form.missing')}
          </div>
        ) : agentSent ? (
          <p className="text-muted-foreground text-sm">{t('form.sent')}</p>
        ) : null}
        {questions.map(ask)}
        {fallbackNotice}
        {failedNotice}
        {notice}
        {send}
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={busy}
            className="text-muted-foreground text-sm underline underline-offset-4"
            onClick={() => {
              if (!agentReachable()) {
                setError(t('form.noSession'))
                return
              }
              askAgent(t('msg.followup'))
            }}
          >
            {t('form.followup')}
          </button>
        </div>
      </div>
    )

  // ── In the creation workspace: the NAME, and nothing else ────────────────────────────────────
  //
  // The name IS the site's address, so it is the one answer that can be given before a site exists.
  // Pressing Next claims the site and moves into ITS workspace, where the rest of this form draws
  // (tasks/todo-claim-then-workspace.md, Lee 15/09) — so a customer answers the other questions in
  // the place the build, the chat and the agent will live, instead of being moved afterwards.
  if (inOnboarding() && !job?.targetSiteKey)
    return (
      <div className="flex flex-col gap-5 p-4">
        {header}
        {error ? (
          <>
            {notice}
            <Button className="w-full" disabled={busy} onClick={() => void claim(answers)}>
              <RotateCcw size={14} /> {t('form.retry')}
            </Button>
          </>
        ) : fresh || busy ? (
          <p role="status" className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 size={14} className="animate-spin" /> {t('form.claiming')}
          </p>
        ) : (
          // A tab restored from an earlier visit: it asks before it makes a site.
          <Button className="w-full" onClick={() => void claim(answers)}>
            {t('form.claimStart')}
          </Button>
        )}
      </div>
    )

  // ── The pages the SET declared ───────────────────────────────────────────────────────────────
  //
  // Until 15/09 page one was a hard-coded list of ids (`name`, `about`, `pages`), so a set that
  // named its questions anything else put everything on page two and drew an empty page one. The
  // pages are data now: as many as there are distinct `step` values, in order.
  const steps = [...new Set(questions.map((q) => q.step ?? 1))].sort((x, y) => x - y)
  const page = steps[Math.min(at, steps.length) - 1] ?? 1
  const onPage = shown.filter((q) => (q.step ?? 1) === page)
  // One page: one column and Submit right there. Bars with a Next leading nowhere would be worse
  // than no bars at all.
  if (steps.length <= 1)
    return (
      <div className="flex flex-col gap-5 p-4">
        {header}
        {shown.map(ask)}
        {fallbackNotice}
        {failedNotice}
        {notice}
        {send}
      </div>
    )
  const last = at >= steps.length
  return (
    <div className="flex flex-col gap-5 p-4">
      {header}
      {/* Which page you are on, as bars — one per page. It replaces a row of headings, and it is
          why they could go: a group that fills the whole card needs counting, not naming. */}
      <div className="flex items-center gap-1.5">
        {steps.map((n, i) => (
          <span
            key={n}
            aria-label={`${i + 1} / ${steps.length}`}
            className={cn('h-1 w-8 rounded-full', i + 1 <= at ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </div>
      {onPage.map(ask)}
      {/* Only on the page that carries Submit: a notice about what the button does belongs beside
          the button, not two screens before it. */}
      {last ? fallbackNotice : null}
      {failedNotice}
      {notice}
      {last ? (
        send
      ) : (
        <Button className="w-full" onClick={() => setAt(at + 1)}>
          {t('form.next')}
        </Button>
      )}
      <div className="flex items-center justify-between text-sm">
        {at > 1 ? (
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setAt(at - 1)}
          >
            <ArrowLeft size={14} /> {t('form.back')}
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
