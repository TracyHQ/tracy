/** Import setup pages retain the existing claim, read and handover lifecycle. */
import { Button, Checkbox, cn, Input, Label, RadioGroup } from '@tracy/ui'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { type JSX, useEffect, useId, useRef, useState } from 'react'

import { CHIP_SELECTED, ChoiceOption, FIELD_LABEL, Note } from './choice'
import {
  claimSite,
  defaultAdminUrl,
  type ExtensionInfo,
  failedRunDetail,
  fetchExtension,
  type ImportErrorDetail,
  type ImportRun,
  importAddressRefusal,
  normalizeSiteKey,
  pollImport,
  provisionImported,
  reconcileImport,
  recoverImport,
  removeImport,
  standingRun,
  startImport,
  UNANSWERED_START_MS
} from './import'
import { filesProgress } from './import-progress.mjs'
import { watchImport } from './import-watch.mjs'
import { pendingImport, rememberImport } from './import-resume.mjs'
import { IMPORT_RECOVERY_PARAM } from './import-recovery.mjs'
import {
  adminPreflight,
  usePreflightAnimation,
  sitePreflight,
  checkImportAddress,
  checkImportOwnership,
  PreflightIcon,
  PreflightRows,
  type PreflightResult,
  type PreflightVerdict
} from './import-preflight'
import { IMPORT_PROBLEMS } from './import-problem-data'
import {
  ImportProblem,
  ImportProblemActions,
  importProblemCase,
  type ImportProblemContext
} from './import-problems'
import { useSiteDomain } from './site-domain'
import type { Translate } from './strings'
import { WizardSteps } from './wizard-steps'
import { WizardFooter } from './wizard-footer'
import { WizardReview } from './wizard-review'

/** The progress polling interval. As sparse as the create branch, for the same reason: this work is measured in minutes. */

/** The two platforms that can be brought in. Shopify is absent: it `connect`s, it does not `migrate`. */
const FORM_REFUSALS = new Set([
  'invalid_credential',
  'no_backend_access',
  'mfa_required',
  'captcha_required',
  'login_locked_out',
  'blocked_by_firewall',
  'unreachable',
  'basic_auth_required',
  'basic_auth_invalid',
  'admin_gate',
  'admin_form_not_found',
  'tls_invalid',
  'cowork_not_answering'
])

const IMPORT_PLATFORMS = [
  { value: 'joomla', label: 'Joomla' },
  { value: 'wordpress', label: 'WordPress' }
] as const

/** One group: label + control + helper line. Same spacing as `wizard.tsx`, so the two branches look like one. */
const GROUP = 'flex flex-col gap-2'

/** An outbound link: accent colour, underline on hover — the same look as `Button variant="link"`. */
const LINK = 'self-start text-primary text-xs underline-offset-4 hover:underline'

type Way = 'admin' | 'manual'
export type ImportPage = 'address' | 'platform' | 'access' | 'details' | 'review'
const IMPORT_PAGES: ImportPage[] = ['address', 'platform', 'access', 'details', 'review']

type Step =
  | { at: 'site' }
  | { at: 'connect' }
  /**
   * The import recovery page (`?import=<siteKey>`, `import-recovery.mjs`): the site's run is asked of
   * the host (`recoverImport`). A run found goes on as `found`; `none` and `unknown` are said here.
   */
  | { at: 'recover'; siteKey: string; answer: 'asking' | 'none' | 'unknown' }
  | { at: 'found'; siteKey: string; platform: string; runId: string; run: ImportRun | null; owned: boolean }
  | { at: 'failed'; siteKey: string; platform: string; run: ImportRun }
  /**
   * `platform` is the one that was SUBMITTED, kept in the step so nothing later reads the picker.
   * `owned`: this wizard made the claim (201) and opened this run itself, so when the run is seen
   * to end without a site, no start of this wizard's is out any more and it may start again
   * (`starts`). A run found by site key (one already going at the press, or after an unconfirmed
   * start) says nothing about that.
   */
  | { at: 'running'; siteKey: string; platform: string; runId: string; run: ImportRun | null; owned: boolean }
  /**
   * The start door gave no answer that says whether a read began (#796). No other start is
   * offered: the only action is asking the status door.
   * `checked`: at least one such check came back without a run to follow.
   * `prior`: the id of the site's latest run BEFORE the start was sent, or null. The status door
   * answers the site's latest run, so that id coming back is the earlier run, not this press's.
   */
  | {
      at: 'unconfirmed'
      siteKey: string
      platform: string
      prior: string | null
      checked: boolean
      since?: number
    }
  /**
   * The site was read and stored, and only the handover to the fleet failed. The keys are kept so
   * "try again" retries THAT step — not a 25-minute re-read of a site already in the store.
   * Measured 2026-09-04: the fleet's Claude Cowork plugin was restarted in the second the handover arrived.
   */
  | {
      at: 'handover_failed'
      siteKey: string
      platform: string
      result: NonNullable<ImportRun['result']>
      code: string
    }
  /**
   * The content is in the store and the fleet took the job (a `jobId` came back). The parent was
   * told, so the new site's build is on its way — in the creation workspace `onProvisioned` swaps
   * this wizard for the build console, but in a SITE workspace the parent keeps its own site on
   * screen and this component stays mounted (`wizard.tsx` buildStarted, `inSite`). Without a step of
   * its own the wizard would sit forever on the "Packing up your files" spinner even though the
   * handover succeeded (issue #166). This is that missing terminal: a done screen, not a spinner.
   */
  | { at: 'handed_over'; siteKey: string }
  /** The recovery page's Remove went through: the site and what was copied are gone. */
  | { at: 'removed'; siteKey: string }

export interface ImportWizardProps {
  t: Translate
  onBackToSource?: () => void
  /** Once the content is in storage and the fleet has taken the job — the parent switches to the site-build console. */
  onCreate?: () => void
  onMySites?: () => void
  onProvisioned: (input: { siteKey: string; platform: string; jobId: string }) => void
  /** The site the import recovery page names (`?import=`): its run is read back from the host. */
  recover?: string
  /** The form page now shown, for usage (`wizardStep`); null once the form gives way to a run. */
  onPage?: (page: ImportPage | null) => void
}

/** The same five status rows remain visible when a run stops. */
export function ImportProgress({
  t,
  platform,
  run,
  failed = false,
  handover = false
}: {
  t: Translate
  platform: string
  run?: ImportRun | null
  failed?: boolean
  handover?: boolean
}): JSX.Element {
  const names = ['signing_in', 'installing', 'reading_content', 'reading_files', 'handing_over']
  const at = handover ? 4 : Math.max(0, names.indexOf(run?.step ?? 'signing_in'))
  // Bytes, a total and a moving clock, not only a file count (#1567).
  const files = filesProgress(run?.detail, run?.now)
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" data-import-progress="">
      {names.map((name, index) => (
        <li
          key={name}
          data-import-step={name}
          data-state={index < at ? 'done' : index === at ? (failed ? 'failed' : 'running') : 'pending'}
          className={cn(
            'flex items-center gap-2 text-xs font-normal',
            index === at && failed ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          <span data-import-marker="" aria-hidden="true">
            {index < at ? '✓' : index === at && failed ? '✕' : null}
          </span>
          <span>
            {t(name === 'installing' ? `import_step_installing_${platform}` : `import_step_${name}`)}
            {name === 'reading_content' && run?.detail?.tables && index <= at ? (
              <span className="text-muted-foreground">
                {' '}
                · {t('import_detail_tables', { count: run.detail.tables })}
              </span>
            ) : null}
            {name === 'reading_files' && run?.detail?.files && index <= at ? (
              <span className="text-muted-foreground">
                {' '}
                · {t('import_detail_files', { count: run.detail.files })}
              </span>
            ) : null}
            {name === 'reading_files' && index <= at
              ? [files.sent, files.left].map((line) =>
                  line ? (
                    <span key={line.key} className="text-muted-foreground">
                      {' '}
                      · {t(line.key, line.params)}
                    </span>
                  ) : null
                )
              : null}
            {name === 'reading_files' && index === at && !failed && run?.state === 'running' && files.part ? (
              <span className="block text-muted-foreground" data-import-part="">
                {t(files.part.key, files.part.params)}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function ImportWizard({
  t,
  onProvisioned,
  onCreate,
  onMySites,
  onBackToSource,
  recover,
  onPage
}: ImportWizardProps): JSX.Element {
  const [platform, setPlatform] = useState<string>('')
  const [formPage, setFormPage] = useState<ImportPage>('details')
  const [reached, setReached] = useState(0)
  const [editing, setEditing] = useState(false)
  const [checkingAddress, setCheckingAddress] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const checkedAddress = useRef('')
  const confirmedPlatform = useRef('')
  const [address, setAddress] = useState('')
  const [step, setStep] = useState<Step>(() => {
    // The recovery page asks the host, never this tab's memory: the same after a reload, on another device.
    if (recover) return { at: 'recover', siteKey: recover, answer: 'asking' }
    try {
      const saved = pendingImport(localStorage)
      if (saved) return { at: 'found', ...saved, run: null, owned: false }
    } catch {
      /* An unavailable browser store never blocks the form. */
    }
    return { at: 'site' }
  })
  /**
   * 🔒 THE HANDOVER MAY ONLY RUN ONCE, and this guard is the only thing ensuring it.
   *
   * The watch loop below is a `setInterval`, and the `provisionImported` call it makes once the read
   * finishes is a LONG `await` — downloading the whole webroot then restoring, tens of seconds for a site of a hundred MB.
   * `setInterval` does not wait: the next tick still fires, still sees `state === 'done'`, and calls the handover a second time.
   *
   * ⚠ THE TWO CALLS DO NOT TIE — the second ALWAYS loses, and it loses by lying. `/provision`
   * writes `host:<siteKey>` once the fleet takes the job, and that very row is what the 409
   * `ALREADY_PROVISIONED` guard reads. So the first call builds the site, the second reads the row just written and returns 409 —
   * whichever comes last wins the UI, and the user sees "This site is already set up on Tracy" for
   * an import that just ran to completion.
   *
   * Measured 08/09 on a 113 MB WordPress site: 13 tables and 718 files all came across, data matching the source
   * (4 posts / 4 posts), the container up, dsh seeing the site — and the screen reporting failure.
   *
   * `busy` cannot replace it: it is React state, and two consecutive interval ticks read the same
   * render so both see `false`. A `ref` changes immediately within the current tick.
   */
  const handingOver = useRef(false)
  /**
   * One press at a time, and no answer acted on after its press stopped mattering.
   *
   * `inFlight` is a ref for the reason `handingOver` is: `busy` is React state, so two clicks in
   * one render both read `false`. `attempt` counts presses; an answer that comes back to an older
   * count, or to an unmounted wizard (`alive`), is dropped whole — it starts nothing and hands
   * nothing over.
   */
  const inFlight = useRef(false)
  const attempt = useRef(0)
  const alive = useRef(true)
  /**
   * Which addresses THIS wizard may send a start for (#796), by normalized address.
   *
   * A claim that already stood (200) may carry a start that is still on its way to the host — from
   * another tab, or from this page before it was opened again — and the status door cannot show a
   * run that does not exist yet. A first start requires a claim this wizard made itself (201),
   * with no unaccounted start. An existing claim can instead retry a matching failed run only
   * after the claim door confirms no build job; the host deduplicates its retryOf replacement.
   *
   * - `clear`: this wizard made the claim, and every start it sent has a known end — refused by
   *   the door's own word before a read began, or a run it opened and watched fail or be forgotten.
   * - `out`: a start was sent and its end is not known (still out, unconfirmed, or running).
   * - absent: this wizard did not make the claim. It follows an active read, or retries a failed
   *   read only with the separate claim and host confirmations described above.
   *
   * A ref, not state: nothing is drawn from it, and it must not reset between renders.
   */
  const starts = useRef(new Map<string, 'clear' | 'out'>())
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const [way, setWay] = useState<Way>('admin')
  const [adminUrl, setAdminUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [needsBasic, setNeedsBasic] = useState(false)
  const [basicUser, setBasicUser] = useState('')
  const [basicPass, setBasicPass] = useState('')
  const [token, setToken] = useState('')
  const [extension, setExtension] = useState<ExtensionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  /** The CODE of the refusal on screen, or null; `ImportErrorText` turns it into words (#796). */
  const [error, setError] = useState<string | null>(null)
  // Only a failed run carries it (`php_too_old`'s versions, `blocked_by_host`'s IP); read only next to that code.
  const [errorDetail, setErrorDetail] = useState<ImportErrorDetail | null>(null)
  useEffect(() => {
    if (!['NOT_SIGNED_IN', 'HTTP_401'].includes(error ?? '')) return
    // Returning from the sign-in tab restores the form with its existing values.
    const resume = () => setError(null)
    window.addEventListener('focus', resume)
    return () => window.removeEventListener('focus', resume)
  }, [error])
  /** The platform the site LOOKS like it runs. `null` = could not tell, and that is not a warning. */
  const [looksLike, setLooksLike] = useState<string | null>(null)
  const [lastHeard, setLastHeard] = useState(Date.now())
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])
  /**
   * Drop the resume pointer the moment the build is handed over, BEFORE the parent hears of it: in
   * the creation workspace `onProvisioned` swaps this wizard for the build console, so the
   * `handed_over` step below never lands and the pointer would outlive the import — every later Add
   * site would follow the finished run and open its build again (#1664).
   */
  const forgetImport = () => {
    try {
      rememberImport(localStorage, null)
    } catch {
      /* Reading a site continues if storage is disabled. */
    }
  }
  useEffect(() => {
    try {
      if (step.at === 'running' || step.at === 'found') rememberImport(localStorage, step)
      else if (['failed', 'handover_failed', 'handed_over'].includes(step.at))
        rememberImport(localStorage, null)
    } catch {
      /* Reading a site continues if storage is disabled. */
    }
  }, [step])
  /** One prefix for every `htmlFor` here — React-generated, so it clashes with no other id in the dsh page. */
  const [extensionLoading, setExtensionLoading] = useState(true)
  useEffect(() => {
    if (step.at !== 'recover' || step.answer !== 'asking') return
    let cancelled = false
    void recoverImport(step.siteKey).then((found) => {
      if (cancelled) return
      if (found.kind !== 'run') return setStep({ ...step, answer: found.kind })
      // From here the run is followed as one found after a reload: running is followed, an
      // interrupted one offers Continue, a failed one Retry through the form (`begin`, `retryOf`).
      setStep({
        at: 'found',
        siteKey: step.siteKey,
        platform: found.platform,
        runId: found.runId,
        run: null,
        owned: false
      })
    })
    return () => {
      cancelled = true
    }
  }, [step])
  useEffect(() => {
    if (step.at !== 'found' || step.run) return
    let cancelled = false
    setAddress(step.siteKey)
    setPlatform(step.platform)
    // A retry goes back through the form, which then starts from the site's own sign-in page.
    setAdminUrl((typed) => typed || defaultAdminUrl(step.siteKey, step.platform))
    confirmedPlatform.current = step.platform
    void pollImport(step.runId).then((run) => {
      if (cancelled || !run) return
      if (run === 'lost') {
        rememberImport(localStorage, null)
        setError('run_lost')
        setFormPage('details')
        setStep({ at: 'connect' })
        return
      }
      if (run.state === 'running') setStep({ ...step, run })
      else if (run.state === 'done') setStep({ ...step, at: 'running', run })
      else {
        setError(run.error ?? 'other')
        setErrorDetail(failedRunDetail(run))
        setStep(
          run.step === 'signing_in' && run.error !== 'interrupted'
            ? { at: 'connect' }
            : { at: 'failed', siteKey: step.siteKey, platform: step.platform, run }
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [step])
  const id = useId()

  // Zone of THIS deployment — production's `tracy.ai` by default, whatever `/api/config` answers
  // otherwise (Task 11); same hook the Fork branch's `wizard.tsx` uses.
  const zone = useSiteDomain()
  const siteKey = normalizeSiteKey(address)
  // Refuse RIGHT AT the address step, before asking for a password — see `importAddressRefusal`.
  const addressRefusal = importAddressRefusal(siteKey, zone)
  const [siteCheck, setSiteCheck] = useState<
    (PreflightResult & { address: string; platform: string }) | null
  >(null)
  const [adminCheck, setAdminCheck] = useState<(PreflightResult & { address: string }) | null>(null)
  const [claimJoinPath, setClaimJoinPath] = useState<string | undefined>(undefined)
  const siteCheckSequence = useRef(0)
  const adminCheckSequence = useRef(0)
  const siteMeasured =
    siteCheck?.address === siteKey && siteCheck.platform === platform
      ? sitePreflight(siteCheck, platform)
      : { rows: [], blocked: false }
  const adminMeasured =
    adminCheck?.address === adminUrl ? adminPreflight(adminCheck, platform) : { rows: [], blocked: false }
  const { verdict: siteVerdict, pending: siteAnimating } = usePreflightAnimation(
    siteMeasured,
    !!siteCheck?.pending
  )
  const { verdict: adminVerdict, pending: adminAnimating } = usePreflightAnimation(
    adminMeasured,
    !!adminCheck?.pending
  )
  const checkSite = async (address = siteKey, selected = platform): Promise<PreflightVerdict> => {
    if (!address) return { rows: [], blocked: true }
    const mine = ++siteCheckSequence.current
    setSiteCheck({ address, platform: selected, detection: null, pending: true })
    const detection = await checkImportAddress(address)
    if (mine !== siteCheckSequence.current) return { rows: [], blocked: true }
    const detected = IMPORT_PLATFORMS.some((entry) => entry.value === detection?.platform)
      ? (detection?.platform ?? null)
      : null
    setLooksLike(detected)
    if (step.at === 'site') {
      setPlatform(detected ?? '')
      if (checkedAddress.current !== address) setAdminUrl(defaultAdminUrl(address, detected ?? ''))
      checkedAddress.current = address
    }
    const chosen = step.at === 'site' ? (detected ?? '') : selected
    const checked = { address, platform: chosen, detection, unavailable: !detection, pending: false }
    const verdict = sitePreflight(checked, chosen)
    if (verdict.blocked || !detection) {
      setSiteCheck(checked)
      return verdict
    }
    setSiteCheck({ ...checked, pending: true })
    const ownership = await checkImportOwnership(address)
    if (mine !== siteCheckSequence.current) return { rows: [], blocked: true }
    const complete = { ...checked, ownership }
    setSiteCheck(complete)
    return sitePreflight(complete, chosen)
  }
  const checkAdmin = async (address = adminUrl) => {
    if (!address) return
    const mine = ++adminCheckSequence.current
    setAdminCheck({ address, detection: null, pending: true })
    const detection = await checkImportAddress(siteKey, address, platform)
    if (mine !== adminCheckSequence.current) return
    const complete = { address, detection, pending: false, unavailable: !detection }
    setAdminCheck(complete)
    if (detection?.admin) setNeedsBasic(detection.admin.basicAuthRequired)
  }
  useEffect(() => {
    if (step.at === 'connect' && formPage === 'details' && way === 'admin') void checkAdmin()
    return () => {
      adminCheckSequence.current++
    }
  }, [step.at, formPage, way, platform])
  useEffect(() => {
    if (error === 'basic_auth_required' || error === 'basic_auth_invalid') setNeedsBasic(true)
  }, [error])

  // The current extension release, asked on entering step 2. One source for BOTH ways, so the link people press
  // and the copy Tracy installs itself never drift apart.
  useEffect(() => {
    if (step.at !== 'connect') return
    let cancelled = false
    setExtensionLoading(true)
    void (async () => {
      const answer = await fetchExtension(platform)
      if (cancelled) return
      setExtension('packageUrl' in answer ? answer : null)
      setExtensionLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [step.at, platform])

  // The watch loop for reading the old site. `cancelled` is not empty ritual: closing the tab midway is
  // ordinary, and the work keeps running in the host half.
  useEffect(() => {
    if (step.at !== 'running') return
    return watchImport({
      runId: step.runId,
      poll: pollImport,
      provision: (result) =>
        provisionImported(step.siteKey, step.platform, result as NonNullable<ImportRun['result']>),
      latch: handingOver,
      effects: {
        // The host half forgot the run (dsh restarted): nothing will ever move again, so say so.
        // Starting again is cheap — the extension's code is on disk (`tokens.ts`).
        // Either way the run this wizard opened is over, so the start it sent is accounted for and
        // it may start again under its own claim. The claim itself stays (`ClaimOutcome`).
        lost: () => {
          if (step.owned) starts.current.set(step.siteKey, 'clear')
          setError('run_lost')
          setFormPage('details')
          setStep({ at: 'connect' })
        },
        failed: (run: ImportRun) => {
          if (step.owned) starts.current.set(step.siteKey, 'clear')
          setError(run.error ?? 'other')
          setErrorDetail(failedRunDetail(run))
          setStep(
            (run.step === 'signing_in' && run.error !== 'interrupted') || FORM_REFUSALS.has(run.error ?? '')
              ? { at: 'connect' }
              : { at: 'failed', siteKey: step.siteKey, platform: step.platform, run }
          )
        },
        progress: (run: ImportRun) => {
          setLastHeard(Date.now())
          setStep({ ...step, run })
        },
        handedOver: (jobId: string) => {
          forgetImport()
          onProvisioned({ siteKey: step.siteKey, platform: step.platform, jobId })
          // LEAVE the spinner. In the creation workspace `onProvisioned` swaps this wizard for the
          // build console, so this `setStep` lands on an unmounting tree and is dropped. In a site
          // workspace the parent keeps its own site on screen and this component stays mounted, so
          // without this the wizard hangs on "Packing up your files" forever (issue #166).
          setStep({ at: 'handed_over', siteKey: step.siteKey })
        },
        handoverFailed: (code: string, result: object) => {
          setError(code)
          setStep({
            at: 'handover_failed',
            siteKey: step.siteKey,
            platform: step.platform,
            result: result as NonNullable<ImportRun['result']>,
            code
          })
        }
      }
    })
  }, [step, onProvisioned])

  const goToConnect = async () => {
    if (!siteKey || addressRefusal || checkingAddress) return
    setCheckingAddress(true)
    const verdict = await checkSite()
    setCheckingAddress(false)
    if (verdict.blocked) return
    setError(null)
    setFormPage(editing ? 'review' : 'platform')
    setEditing(false)
    setReached((value) => Math.max(value, 1))
    setStep({ at: 'connect' })
  }

  /** Whether the press numbered `mine` is still the one this (mounted) wizard is waiting on. */
  const current = (mine: number) => alive.current && attempt.current === mine

  /** The handover alone, again, with the keys already in the store. Pressing IS the retry. */
  const handOverAgain = async (
    target: { siteKey: string; platform: string },
    result: NonNullable<ImportRun['result']>
  ) => {
    if (inFlight.current) return
    inFlight.current = true
    const mine = ++attempt.current
    setBusy(true)
    setError(null)
    // A manual press IS the retry, so the automatic guard opens for it — `inFlight` guards this spot.
    handingOver.current = true
    const provisioned = await provisionImported(target.siteKey, target.platform, result)
    if (!current(mine)) return
    inFlight.current = false
    setBusy(false)
    if ('jobId' in provisioned) {
      forgetImport()
      onProvisioned({ ...target, jobId: provisioned.jobId })
      // Same terminal as the automatic path — a done screen, not the failed one it came from.
      setStep({ at: 'handed_over', siteKey: target.siteKey })
      return
    }
    setError(provisioned.code)
    setStep({ at: 'handover_failed', ...target, result, code: provisioned.code })
  }

  useEffect(() => {
    if (step.at !== 'handover_failed' || step.code !== 'HOST_UPDATING') return
    const timer = setInterval(() => {
      void handOverAgain({ siteKey: step.siteKey, platform: step.platform }, step.result)
    }, 60000)
    return () => clearInterval(timer)
  }, [step])

  /**
   * Find out what became of a start nobody could confirm, by asking the status door for the run of
   * this site. A run of exactly this site and platform that was not there before the start is
   * followed from where it stands — a finished one through the same watch and the same once-only
   * handover as any other. Anything else leaves the wizard where it is, with no other start
   * (`reconcileImport`).
   */
  const checkStatus = async (target: {
    siteKey: string
    platform: string
    prior: string | null
    since?: number
  }) => {
    if (inFlight.current) return
    inFlight.current = true
    const mine = ++attempt.current
    setBusy(true)
    const found = await reconcileImport(target.siteKey, target.platform, target.prior)
    if (!current(mine)) return
    inFlight.current = false
    setBusy(false)
    if (found.kind === 'unresolved') {
      setStep({ at: 'unconfirmed', ...target, since: target.since ?? Date.now(), checked: true })
      return
    }
    // Not `owned`: this run was found, not opened here — it may be another tab's.
    setStep({
      at: 'running',
      siteKey: target.siteKey,
      platform: target.platform,
      runId: found.run.id,
      run: found.run,
      owned: false
    })
  }

  const begin = async () => {
    if (inFlight.current) return
    inFlight.current = true
    const mine = ++attempt.current
    // What was submitted, fixed at the press: nothing below reads the fields again.
    const target = { siteKey, platform }
    const details =
      way === 'admin'
        ? {
            adminUrl,
            username,
            password,
            ...(needsBasic && basicUser ? { basicAuth: { username: basicUser, password: basicPass } } : {})
          }
        : { token: token.trim(), webRootUrl: `https://${siteKey}` }
    setBusy(true)
    setError(null)
    setClaimJoinPath(undefined)

    // Establish the owner FIRST. Without a book row every later storage URL signing returns 403, and that shows up after
    // signing into the customer's site — far later than where it should fail.
    const claim = await claimSite(target.siteKey, target.platform)
    if (!current(mine)) return
    if (claim.kind !== 'claimed') {
      // A refusal made no claim, and an unconfirmed answer does not say whose row stands under
      // that address. Claiming again is safe — the door answers a claim that already stands as
      // such — so Start stays available.
      inFlight.current = false
      setBusy(false)
      setError(claim.kind === 'refused' ? claim.code : (claim.code ?? 'other'))
      setClaimJoinPath(claim.kind === 'refused' ? claim.joinPath : undefined)
      return
    }
    // The row was made by this press: no start can have been sent under it before.
    if (claim.created) starts.current.set(claim.siteKey, 'clear')

    // What the host knows of this site BEFORE anything is started. The claim says nothing about a
    // read: one that already stood may carry a read from another tab, or from a start whose answer
    // was lost before this wizard was opened again.
    const standing = await standingRun(claim.siteKey, target.platform)
    if (!current(mine)) return
    if (standing.kind === 'running' && standing.run) {
      // A read of this site is going: follow it, never open a second one. Nothing typed here was
      // sent, and nothing after this needs it. Not `owned`: the read was not opened by this press.
      inFlight.current = false
      setBusy(false)
      setPassword('')
      setBasicPass('')
      setStep({
        at: 'running',
        siteKey: claim.siteKey,
        platform: target.platform,
        runId: standing.run.id,
        run: standing.run,
        owned: false
      })
      return
    }
    if (standing.kind === 'running' || standing.kind === 'unknown') {
      // A read this wizard cannot follow, or no clear answer: nothing is started. Pressing Start
      // asks again.
      inFlight.current = false
      setBusy(false)
      setError('other')
      return
    }
    const retryOf =
      claim.retryable && standing.kind === 'ended' && standing.retryable ? standing.runId : undefined
    // A claim nobody pressed for `UNANSWERED_START_MS`, with no build job and no run on the host:
    // any start sent under it has arrived (and been refused, or its run would show) or never will.
    // Without this, a refused or cut-off start left a claim that refused every later one (#1665).
    // Only with both presses named: the take-over start tells the host which press it supersedes, so
    // a start of that press arriving late is followed, never doubled (`import.ts` `ClaimOutcome`).
    const abandoned =
      claim.retryable === true &&
      standing.kind === 'none' &&
      (claim.idleMs ?? 0) >= UNANSWERED_START_MS &&
      claim.press !== undefined &&
      claim.pressBefore !== undefined
    const takeOver = starts.current.get(claim.siteKey) !== 'clear' && !retryOf && abandoned
    if (starts.current.get(claim.siteKey) !== 'clear' && !retryOf && !abandoned) {
      // The claim stood before this wizard, or a start of its own is unaccounted for: "no read is
      // going" does not show a start still on its way, so none is sent. Nothing typed was sent
      // either; pressing Start looks again and follows a read once the host shows one.
      inFlight.current = false
      setBusy(false)
      setError('claim_stands')
      return
    }
    const prior = standing.kind === 'ended' ? standing.runId : null

    starts.current.set(claim.siteKey, 'out')
    const started = await startImport({
      siteKey: claim.siteKey,
      platform: target.platform,
      ...details,
      ...(retryOf ? { retryOf } : {}),
      ...(claim.press ? { press: claim.press } : {}),
      ...(takeOver ? { after: claim.pressBefore } : {})
    })
    if (!current(mine)) return
    if (started.kind === 'refused') {
      // Refused before any read began, by the door's own word: the start is accounted for. The
      // claim stays (`ClaimOutcome`), and the next press starts under it.
      starts.current.set(claim.siteKey, 'clear')
      inFlight.current = false
      setBusy(false)
      setError(started.code)
      return
    }
    inFlight.current = false
    setBusy(false)
    // The details were sent, whatever became of them. Wipe the passwords from the screen now: no
    // step after this needs them.
    setPassword('')
    setBasicPass('')
    if (started.kind === 'unconfirmed') {
      // A read may be going under the claim. Offer no second start, and look.
      const pending = { siteKey: claim.siteKey, platform: target.platform, prior, since: Date.now() }
      setStep({ at: 'unconfirmed', ...pending, checked: false })
      void checkStatus(pending)
      return
    }
    setStep({
      at: 'running',
      siteKey: claim.siteKey,
      platform: target.platform,
      runId: started.runId,
      run: null,
      owned: true
    })
  }

  /**
   * Continue a run a dsh restart cut (#1565): a new run of the same site that names it, with no
   * credentials — the host goes on with the code Claude Cowork minted and from the upload cursor,
   * so nothing typed is needed and no stored part is sent again. The same checks as a retry from
   * the form (#1578): the claim door confirms no build job, the status door that the interrupted
   * run is still the site's latest; a read already going is followed, never doubled. The host
   * joins two presses into one run (`startRun` `retryOf`).
   */
  const continueRun = async (target: { siteKey: string; platform: string; runId: string }) => {
    if (inFlight.current) return
    inFlight.current = true
    const mine = ++attempt.current
    setBusy(true)
    setError(null)
    const done = (code: string | null) => {
      inFlight.current = false
      setBusy(false)
      if (code) setError(code)
    }
    const claim = await claimSite(target.siteKey, target.platform)
    if (!current(mine)) return
    if (claim.kind !== 'claimed' || !claim.retryable)
      return done(claim.kind === 'refused' ? claim.code : claim.kind === 'claimed' ? 'claim_stands' : 'other')
    const standing = await standingRun(claim.siteKey, target.platform)
    if (!current(mine)) return
    if (standing.kind === 'running' && standing.run) {
      done(null)
      setStep({
        at: 'running',
        siteKey: claim.siteKey,
        platform: target.platform,
        runId: standing.run.id,
        run: standing.run,
        owned: false
      })
      return
    }
    if (standing.kind !== 'ended' || standing.runId !== target.runId) return done('other')
    const started = await startImport({
      siteKey: claim.siteKey,
      platform: target.platform,
      retryOf: target.runId,
      ...(claim.press ? { press: claim.press } : {})
    })
    if (!current(mine)) return
    if (started.kind === 'refused') return done(started.code)
    done(null)
    if (started.kind === 'unconfirmed') {
      const pending = {
        siteKey: claim.siteKey,
        platform: target.platform,
        prior: target.runId,
        since: Date.now()
      }
      setStep({ at: 'unconfirmed', ...pending, checked: false })
      void checkStatus(pending)
      return
    }
    setStep({
      at: 'running',
      siteKey: claim.siteKey,
      platform: target.platform,
      runId: started.runId,
      run: null,
      owned: false
    })
  }

  const manual = () => {
    setWay('manual')
    setFormPage('details')
    setError(null)
    setStep({ at: 'connect' })
  }
  const preflightText = (problem: string) => {
    if (problem === 'pf1.mismatch')
      return t('import_preflight_mismatch', {
        detected: siteCheck?.detection?.platform === 'wordpress' ? 'WordPress' : 'Joomla',
        platform: platform === 'wordpress' ? 'WordPress' : 'Joomla'
      })
    return t(IMPORT_PROBLEMS[problem]?.what ?? 'import_preflight_unavailable', { domain: siteKey })
  }
  const problemContext: ImportProblemContext = {
    domain: siteKey,
    platform,
    adminUrl,
    username,
    extensionVersion: extension?.version,
    detail: errorDetail,
    joinPath: claimJoinPath ?? siteCheck?.ownership?.joinPath,
    params: { platform: platform === 'wordpress' ? 'WordPress' : 'Joomla' },
    onManual: manual,
    onCreate,
    onMySites
  }
  const showProblem = (code: string, actions?: JSX.Element | null) => (
    <ImportProblem
      problem={importProblemCase(code, errorDetail, username)}
      t={t}
      {...problemContext}
      actions={actions}
    />
  )
  const fieldError = error
    ? ['basic_auth_required', 'basic_auth_invalid'].includes(error)
      ? 'basic'
      : error === 'admin_form_not_found'
        ? 'url'
        : way === 'manual'
          ? 'token'
          : 'signin'
    : null
  const errorProblem = error ? importProblemCase(error, errorDetail, username) : null
  useEffect(() => {
    if (step.at === 'connect' && error) setFormPage('details')
  }, [step.at, error])
  const errorNote = error
    ? showProblem(
        error,
        errorProblem && ['p23', 'p31', 'p45', 'p45.server'].includes(errorProblem) ? (
          <ImportProblemActions
            problem={errorProblem}
            t={t}
            onAction={(key) => {
              if (errorProblem === 'p23') {
                setUsername('')
                setPassword('')
                setError(null)
                document.getElementById(`${id}-username`)?.focus()
                return
              }
              if (errorProblem === 'p31') {
                setExtensionLoading(true)
                void fetchExtension(platform).then((answer) => {
                  setExtension('packageUrl' in answer ? answer : null)
                  setError('packageUrl' in answer ? null : answer.code)
                  setExtensionLoading(false)
                })
                return
              }
              if (key.endsWith('action_1'))
                void navigator.clipboard.writeText(
                  JSON.stringify({ siteKey, code: error, detail: errorDetail })
                )
              else void begin()
            }}
          />
        ) : null
      )
    : null

  const page = step.at === 'site' ? 'address' : formPage
  const inForm = step.at === 'site' || step.at === 'connect'
  useEffect(() => {
    onPage?.(inForm ? page : null)
  }, [page, inForm])
  useEffect(() => {
    const card = frame.current
    if (!inForm || !card || card.closest('[hidden]')) return
    let scroller: HTMLElement | null = card
    while (scroller) {
      if (/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
        scroller.scrollTop = 0
        break
      }
      scroller = scroller.parentElement
    }
    card.querySelector<HTMLElement>('.tas-wizard-title')?.focus({ preventScroll: true })
  }, [page, inForm])
  const goToPage = (next: ImportPage) => {
    setFormPage(next)
    setStep({ at: next === 'address' ? 'site' : 'connect' })
  }
  const advance = () => {
    if (page === 'address') return void goToConnect()
    if (page === 'review') return void begin()
    if (page === 'platform' && confirmedPlatform.current !== platform) {
      setAdminUrl(defaultAdminUrl(siteKey, platform))
      confirmedPlatform.current = platform
    }
    if (page === 'details' && adminVerdict.problem === 'pf2.gate' && way === 'admin') return manual()
    const next = editing ? 'review' : IMPORT_PAGES[IMPORT_PAGES.indexOf(page) + 1]
    setReached((value) => Math.max(value, IMPORT_PAGES.indexOf(next)))
    goToPage(next)
    if (editing) setEditing(false)
  }
  const formRefusal = !!errorProblem && ['p31', 'p44', 'p45', 'p45.server'].includes(errorProblem)
  const detailsInvalid =
    way === 'admin'
      ? adminVerdict.problem !== 'pf2.gate' &&
        (!adminUrl ||
          !username ||
          !password ||
          adminVerdict.blocked ||
          (needsBasic && (!basicUser || !basicPass)))
      : !token.trim() || extensionLoading || !extension
  const labels = {
    address: t('wizard_site_address'),
    platform: t('wizard_platform'),
    access: t('wizard_access'),
    details: t('wizard_signin'),
    review: t('wizard_review')
  }
  const titles = {
    address: t('import_address_title'),
    platform: t('import_platform_title'),
    access: t('import_access_title'),
    details: t('import_details_title'),
    review: t('import_review_title')
  }
  const descriptions = {
    address: t('import_address_description'),
    platform: t('import_platform_description'),
    access: t('import_access_description'),
    details: t(way === 'admin' ? 'import_details_admin_description' : 'import_details_manual_description'),
    review: t('wizard_review_desc')
  }
  /** The recovery page's Remove: `asking` shows the confirm, `busy` while its answer is on its way. */
  const [removal, setRemoval] = useState<'idle' | 'asking' | 'busy'>('idle')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const confirmRemove = async (target: string) => {
    if (removal === 'busy') return
    setRemoval('busy')
    setRemoveError(null)
    const outcome = await removeImport(target)
    if (!alive.current) return
    if (outcome.kind === 'refused') {
      // The confirm stays open: pressing Remove again is the retry.
      setRemoval('asking')
      setRemoveError(
        t(outcome.code === 'IMPORT_RUNNING' ? 'import_remove_running' : 'import_remove_later', {
          domain: target
        })
      )
      return
    }
    try {
      rememberImport(localStorage, null)
    } catch {
      /* Storage may be disabled. */
    }
    // The address named the import this page recovered; it is gone, so a reload opens the form.
    const url = new URL(window.location.href)
    if (url.searchParams.has(IMPORT_RECOVERY_PARAM)) {
      url.searchParams.delete(IMPORT_RECOVERY_PARAM)
      window.history.replaceState(window.history.state, '', url)
    }
    window.dispatchEvent(new window.CustomEvent('tracy:sites-changed'))
    setRemoval('idle')
    setStep({ at: 'removed', siteKey: target })
  }
  /** Remove, on the recovery page only: a press asks first, inline, then the one Remove door. */
  const removeControls = (target: string): JSX.Element | null => {
    if (!recover) return null
    return (
      <div className="flex flex-col gap-2" data-import-remove={removal}>
        {removal === 'idle' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => {
              setRemoveError(null)
              setRemoval('asking')
            }}
          >
            {t('import_remove')}
          </Button>
        ) : (
          <>
            <Note>{t('import_remove_confirm', { domain: target })}</Note>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={removal === 'busy'}
                onClick={() => void confirmRemove(target)}
              >
                {removal === 'busy' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t('import_remove_yes')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={removal === 'busy'}
                onClick={() => setRemoval('idle')}
              >
                {t('import_remove_no')}
              </Button>
            </div>
          </>
        )}
        {removeError ? (
          <p className="m-0 text-destructive text-xs" role="alert">
            {removeError}
          </p>
        ) : null}
      </div>
    )
  }

  /** The form, empty, for the next import: after a handover, and after a Remove. */
  const freshImport = () => {
    setRemoval('idle')
    setRemoveError(null)
    // A fresh import of a DIFFERENT source: no field of the last one may carry over. Password
    // and basic password were already wiped when the read began, but username/token/basic-user
    // linger in state — clearing them here means the next source cannot be connected with the
    // previous source's credentials.
    setError(null)
    setAddress('')
    setAdminUrl('')
    checkedAddress.current = ''
    confirmedPlatform.current = ''
    setPlatform('')
    setFormPage('details')
    setReached(0)
    setEditing(false)
    setSiteCheck(null)
    setAdminCheck(null)
    setWay('admin')
    setLooksLike(null)
    setUsername('')
    setPassword('')
    setNeedsBasic(false)
    setBasicUser('')
    setBasicPass('')
    setToken('')
    // Re-arm the once-only handover latch. It was set true for the import that just finished;
    // without this the next import's poll would see it already closed and never hand over.
    handingOver.current = false
    setStep({ at: 'site' })
  }
  const renderContent = (): JSX.Element => {
    if (step.at === 'connect' && errorProblem && ['p31', 'p44', 'p45', 'p45.server'].includes(errorProblem))
      return errorNote ?? <></>

    if (step.at === 'recover') {
      if (step.answer === 'asking')
        return (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" data-import-recover="asking" />
        )
      return (
        <div className={GROUP} data-import-recover={step.answer}>
          <div className="font-medium">{t('import_progress_title', { domain: step.siteKey })}</div>
          <ImportProblem
            problem={step.answer === 'none' ? 'p54' : 'p54.unreachable'}
            t={t}
            {...problemContext}
            domain={step.siteKey}
            actions={
              step.answer === 'unknown' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setStep({ ...step, answer: 'asking' })}
                >
                  {t('import_check_status')}
                </Button>
              ) : null
            }
          />
          {removeControls(step.siteKey)}
        </div>
      )
    }

    if (step.at === 'removed')
      return (
        <div className={GROUP} data-import-removed="">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-primary" />
            {t('import_removed_title', { domain: step.siteKey })}
          </div>
          <Button type="button" variant="outline" className="self-start" onClick={freshImport}>
            {t('import_handed_over_another')}
          </Button>
        </div>
      )

    if (step.at === 'found' && !step.run)
      return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />

    if (step.at === 'found')
      return (
        <div className={GROUP}>
          <ImportProblem
            problem="p52"
            t={t}
            {...problemContext}
            domain={step.siteKey}
            actions={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddress(step.siteKey)
                  setPlatform(step.platform)
                  setLastHeard(Date.now())
                  setStep({ ...step, at: 'running' })
                }}
              >
                {t('import_follow')}
              </Button>
            }
          />
        </div>
      )

    if (step.at === 'running' || step.at === 'failed') {
      const run = step.run
      const failed = step.at === 'failed'
      const problem = importProblemCase(error ?? run?.error ?? 'other', errorDetail, username)
      return (
        <div className={GROUP}>
          <div className="font-medium">{t('import_progress_title', { domain: step.siteKey })}</div>
          <ImportProgress t={t} platform={step.platform} run={run} failed={failed} />
          {!failed && clock - lastHeard >= 180000 ? (
            <ImportProblem problem="p42" t={t} {...problemContext} />
          ) : null}
          {failed ? (
            <ImportProblem
              problem={problem}
              t={t}
              {...problemContext}
              actions={
                <ImportProblemActions
                  problem={problem}
                  t={t}
                  onAction={(key) => {
                    if (key === 'import_problem_p53_action_0' && run)
                      return void continueRun({
                        siteKey: step.siteKey,
                        platform: step.platform,
                        runId: run.id
                      })
                    if (key.includes('p25_') || key === 'import_problem_p26_action_0') return manual()
                    if (key.includes('p36_')) {
                      void navigator.clipboard.writeText(
                        JSON.stringify({ site: siteKey, code: error, detail: errorDetail, run: run?.id })
                      )
                      return
                    }
                    setError(null)
                    setFormPage('details')
                    setStep({ at: 'connect' })
                  }}
                />
              }
            />
          ) : null}
          {failed ? removeControls(step.siteKey) : null}
        </div>
      )
    }

    if (step.at === 'unconfirmed') {
      return (
        <div className={GROUP}>
          <div className="font-medium">{t('import_progress_title', { domain: step.siteKey })}</div>
          <ImportProblem
            problem="p41"
            t={t}
            {...problemContext}
            actions={
              <>
                {clock - (step.since ?? clock) < UNANSWERED_START_MS ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void checkStatus({
                        siteKey: step.siteKey,
                        platform: step.platform,
                        prior: step.prior,
                        since: step.since
                      })
                    }
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {t('import_check_status')}
                  </Button>
                ) : null}
                {clock - (step.since ?? clock) >= UNANSWERED_START_MS ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null)
                      setFormPage('details')
                      setStep({ at: 'connect' })
                    }}
                  >
                    {t('import_restart')}
                  </Button>
                ) : null}
              </>
            }
          />
        </div>
      )
    }

    if (step.at === 'handed_over') {
      // The handover is done and the parent was told; the new site's build is on its way. In a site
      // workspace the parent keeps its own site on screen (intentional — no auto-switch, no lost
      // conversation), so this is where the wizard says the work landed and offers the next import,
      // instead of leaving the reader on a spinner that will never resolve (issue #166).
      return (
        <div className={GROUP}>
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-primary" />
            {t('import_handed_over_title', { domain: step.siteKey })}
          </div>
          <Note>{t('import_handed_over_note')}</Note>
          <Button type="button" variant="outline" className="self-start" onClick={freshImport}>
            {t('import_handed_over_another')}
          </Button>
        </div>
      )
    }

    if (step.at === 'handover_failed') {
      const problem =
        step.code === 'HOST_UPDATING'
          ? 'p40'
          : step.code === 'ALREADY_PROVISIONED'
            ? 'pf1.mine'
            : ['NOT_SIGNED_IN', 'HTTP_401'].includes(step.code)
              ? 'p44'
              : 'p43'
      return (
        <div className={GROUP}>
          <div className="font-medium">{t('import_progress_title', { domain: step.siteKey })}</div>
          <ImportProgress t={t} platform={step.platform} failed handover />
          <ImportProblem
            problem={problem}
            t={t}
            {...problemContext}
            actions={
              <Button
                type="button"
                disabled={busy}
                size="sm"
                variant={problem === 'p40' ? 'outline' : 'default'}
                onClick={() =>
                  void handOverAgain({ siteKey: step.siteKey, platform: step.platform }, step.result)
                }
              >
                {t(problem === 'p40' ? 'import_retry_now' : 'import_setup_again')}
              </Button>
            }
          />
        </div>
      )
    }

    if (step.at === 'connect' && page === 'platform')
      return (
        <div className={GROUP} data-import-platform="">
          <div className="flex flex-wrap gap-2">
            {IMPORT_PLATFORMS.map((entry) => (
              <Button
                key={entry.value}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={platform === entry.value}
                className={cn('rounded-md', platform === entry.value && CHIP_SELECTED)}
                data-selected={platform === entry.value ? '1' : '0'}
                onClick={() => {
                  setPlatform(entry.value)
                  setAdminCheck(null)
                  setError(null)
                }}
              >
                {entry.label}
                {looksLike === entry.value ? (
                  <span className="text-muted-foreground text-xs">{t('import_detected')}</span>
                ) : null}
              </Button>
            ))}
          </div>
          {looksLike && platform && looksLike !== platform ? (
            <Note>{preflightText('pf1.mismatch')}</Note>
          ) : null}
          {!looksLike ? <Note>{t('import_preflight_unavailable')}</Note> : null}
        </div>
      )

    if (step.at === 'connect' && page === 'review')
      return (
        <WizardReview
          t={t}
          hero={{
            address: siteKey,
            platform: IMPORT_PLATFORMS.find((entry) => entry.value === platform)?.label ?? '',
            live: false
          }}
          rows={[
            { id: 'address', label: labels.address, value: siteKey },
            {
              id: 'platform',
              label: labels.platform,
              value: IMPORT_PLATFORMS.find((entry) => entry.value === platform)?.label
            },
            {
              id: 'access',
              label: labels.access,
              value: t(way === 'admin' ? 'import_way_admin' : 'import_way_manual')
            },
            {
              id: 'details',
              label: labels.details,
              value: way === 'admin' ? username : t('import_code_pasted')
            }
          ]}
          onEdit={(next) => {
            setEditing(true)
            goToPage(next as ImportPage)
          }}
        />
      )

    if (step.at === 'connect') {
      const basicFields = needsBasic ? (
        <div className="grid grid-cols-2 gap-3">
          <div className={GROUP}>
            <Label htmlFor={`${id}-basic-user`} className={FIELD_LABEL}>
              {t('import_basic_user')}
            </Label>
            <Input
              id={`${id}-basic-user`}
              aria-invalid={fieldError === 'basic' || adminVerdict.basic || undefined}
              value={basicUser}
              onChange={(event) => setBasicUser(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
            />
          </div>
          <div className={GROUP}>
            <Label htmlFor={`${id}-basic-pass`} className={FIELD_LABEL}>
              {t('import_basic_pass')}
            </Label>
            <Input
              id={`${id}-basic-pass`}
              type="password"
              aria-invalid={fieldError === 'basic' || adminVerdict.basic || undefined}
              value={basicPass}
              onChange={(event) => setBasicPass(event.target.value)}
            />
          </div>
        </div>
      ) : null

      return (
        <div className="flex flex-col gap-4">
          {page === 'access' ? (
            <div className={GROUP}>
              <RadioGroup
                value={way}
                onValueChange={(value) => {
                  setWay(value as Way)
                  setError(null)
                }}
                className="gap-2"
                data-import-way=""
              >
                <ChoiceOption
                  value="admin"
                  selected={way === 'admin'}
                  title={t('import_way_admin')}
                  description={t('import_way_admin_desc')}
                />
                <ChoiceOption
                  value="manual"
                  selected={way === 'manual'}
                  title={t('import_way_manual')}
                  description={t('import_way_manual_desc')}
                />
              </RadioGroup>
            </div>
          ) : null}

          {page === 'details' ? (
            way === 'admin' ? (
              <div className={GROUP} data-import-fields="">
                <Label htmlFor={`${id}-admin-url`} className={FIELD_LABEL}>
                  {t('import_admin_url')}
                </Label>
                <div className="relative">
                  {' '}
                  <Input
                    id={`${id}-admin-url`}
                    value={adminUrl}
                    onChange={(event) => {
                      setAdminUrl(event.target.value)
                      adminCheckSequence.current++
                      setAdminCheck(null)
                      setError(null)
                    }}
                    onBlur={() => void checkAdmin()}
                    className="pr-8"
                    spellCheck={false}
                    aria-invalid={fieldError === 'url' || undefined}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
                    {!error ? <PreflightIcon verdict={adminVerdict} pending={adminAnimating} /> : null}
                  </span>
                </div>
                {!error ? (
                  <PreflightRows
                    verdict={adminVerdict}
                    t={t}
                    platform={platform}
                    problemText={preflightText}
                  />
                ) : null}
                {!error && adminVerdict.problem ? (
                  <ImportProblem problem={adminVerdict.problem} t={t} {...problemContext} hideStatus />
                ) : null}
                {fieldError === 'url' ? errorNote : null}
                {adminVerdict.basic && !error ? basicFields : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className={GROUP}>
                    <Label htmlFor={`${id}-username`} className={FIELD_LABEL}>
                      {t('import_username')}
                    </Label>
                    <Input
                      id={`${id}-username`}
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      spellCheck={false}
                      autoCapitalize="off"
                      aria-invalid={
                        (!!errorProblem && IMPORT_PROBLEMS[errorProblem]?.field === 'cred') || undefined
                      }
                    />
                  </div>
                  <div className={GROUP}>
                    <Label htmlFor={`${id}-password`} className={FIELD_LABEL}>
                      {t('import_password')}
                    </Label>
                    <Input
                      id={`${id}-password`}
                      type="password"
                      placeholder={error ? t('import_password_again') : undefined}
                      aria-invalid={
                        (!!errorProblem && IMPORT_PROBLEMS[errorProblem]?.field === 'cred') || undefined
                      }
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                </div>
                {fieldError === 'signin' ? errorNote : null}
                <Label className="font-normal text-muted-foreground text-xs">
                  <Checkbox checked={needsBasic} onCheckedChange={(checked) => setNeedsBasic(checked)} />
                  {t('import_basic_auth')}
                </Label>
                {!adminVerdict.basic || error ? basicFields : null}
                {fieldError === 'basic' ? errorNote : null}
              </div>
            ) : (
              <div className={GROUP} data-import-fields="">
                {fieldError === 'token' ? null : extension ? (
                  <>
                    <a className={LINK} href={extension.packageUrl} target="_blank" rel="noreferrer">
                      {t('import_manual_download', { version: extension.version })}
                    </a>
                    {extension.releaseUrl ? (
                      <a className={LINK} href={extension.releaseUrl} target="_blank" rel="noreferrer">
                        {t('import_manual_release')}
                      </a>
                    ) : null}
                    {/* Joomla's Install from URL is the only path when file_uploads is disabled.
                        WordPress has no equivalent screen, so this hint is Joomla-only. */}
                    {platform === 'joomla' ? (
                      <Note>
                        {t('import_manual_url_hint')}{' '}
                        <code className="wrap-anywhere block font-mono text-[11px] text-foreground">
                          {extension.packageUrl}
                        </code>
                      </Note>
                    ) : null}
                  </>
                ) : extensionLoading ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <ImportProblem
                    problem="p31"
                    t={t}
                    {...problemContext}
                    actions={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void fetchExtension(platform).then((answer) => {
                            setExtension('packageUrl' in answer ? answer : null)
                            setExtensionLoading(false)
                          })
                        }
                      >
                        {t('import_load_again')}
                      </Button>
                    }
                  />
                )}
                {fieldError === 'token' ? null : <Note>{t('import_manual_steps')}</Note>}
                <Label htmlFor={`${id}-token`} className={FIELD_LABEL}>
                  {t('import_token_label')}
                </Label>
                <Input
                  id={`${id}-token`}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  spellCheck={false}
                  aria-invalid={fieldError === 'token' || undefined}
                />
                {fieldError === 'token' ? errorNote : null}
              </div>
            )
          ) : null}
        </div>
      )
    }

    return (
      <>
        <div className={GROUP} data-import-fields="">
          <Label htmlFor={`${id}-address`} className={FIELD_LABEL}>
            {t('import_address_label')}
          </Label>
          <div className="relative">
            <Input
              id={`${id}-address`}
              value={address}
              placeholder="yoursite.com"
              className="pr-8"
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setAddress(event.target.value)
                if (normalizeSiteKey(event.target.value) !== siteKey) {
                  siteCheckSequence.current++
                  setSiteCheck(null)
                }
                setError(null)
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
              <PreflightIcon
                verdict={
                  addressRefusal ? { rows: [{ key: 'address', state: 'error' }], blocked: true } : siteVerdict
                }
                pending={siteAnimating}
              />
            </span>
          </div>
          {!error ? (
            <PreflightRows verdict={siteVerdict} t={t} platform={platform} problemText={preflightText} />
          ) : null}
          {!error && siteVerdict.problem ? (
            <ImportProblem
              problem={siteVerdict.problem}
              t={t}
              {...problemContext}
              additionalProblems={
                siteVerdict.blocked
                  ? []
                  : siteVerdict.rows.flatMap((row) =>
                      row.state === 'warning' && row.problem && row.problem !== siteVerdict.problem
                        ? [row.problem]
                        : []
                    )
              }
              hideStatus={siteVerdict.rows.some((row) => row.problem === siteVerdict.problem)}
            />
          ) : null}
          {siteMeasured.blocked && !siteCheck?.pending ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => void checkSite()}
            >
              {t('import_preflight_retry')}
            </Button>
          ) : null}
          {error ? (
            showProblem(error)
          ) : addressRefusal ? (
            <ImportProblem problem="pf1.tracy" t={t} {...problemContext} />
          ) : siteCheck ? null : (
            <span className="text-muted-foreground text-xs">{t('import_address_hint')}</span>
          )}
        </div>
      </>
    )
  }
  return (
    <div
      ref={frame}
      className="tas-root tas-wizard-card"
      data-import-page={inForm ? page : 'progress'}
      data-wizard-step={inForm ? page : undefined}
    >
      <WizardSteps
        t={t}
        steps={[
          { id: 'source', label: t('wizard_adding') },
          ...IMPORT_PAGES.map((id) => ({ id, label: labels[id] }))
        ]}
        current={inForm ? page : 'complete'}
        done={inForm ? ['source', ...IMPORT_PAGES.slice(0, reached)] : ['source', ...IMPORT_PAGES]}
        onStep={
          inForm && !busy && !checkingAddress
            ? (next) => {
                setEditing(false)
                if (next === 'source') onBackToSource?.()
                else goToPage(next as ImportPage)
              }
            : undefined
        }
      />
      <div className="tas-wizard-body">
        {inForm ? (
          <div className="tas-wizard-head">
            <h2 className="tas-wizard-title" tabIndex={-1}>
              {titles[page]}
            </h2>
            <p className="tas-wizard-desc">{descriptions[page]}</p>
          </div>
        ) : null}
        {renderContent()}
      </div>
      {inForm ? (
        <WizardFooter
          t={t}
          outlined={page === 'review'}
          onBack={() => {
            if (page === 'address') onBackToSource?.()
            else goToPage(IMPORT_PAGES[IMPORT_PAGES.indexOf(page) - 1])
          }}
          onContinue={advance}
          busy={busy || checkingAddress}
          disabled={
            busy ||
            checkingAddress ||
            formRefusal ||
            (page === 'address'
              ? !siteKey || !!addressRefusal || siteMeasured.blocked
              : page === 'platform'
                ? !platform
                : page === 'details' || page === 'review'
                  ? !!detailsInvalid
                  : false)
          }
          continueLabel={
            page === 'review'
              ? t('import_start')
              : page === 'details' && adminVerdict.problem === 'pf2.gate' && way === 'admin'
                ? t('import_problem_p25_action_0')
                : undefined
          }
        />
      ) : null}
    </div>
  )
}
