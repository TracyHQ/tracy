/**
 * The Road to live panel at the top of a template's page (Akemi, 11/10/2026; it replaced the
 * Problems panel): one group per CMS release, its eight steps in the server's fixed order, the
 * order they finish in (`road` on each release of `GET /api/ops/quickstarts`), each with a status
 * icon, a title, why it matters and how to fix it.
 *
 * Several steps run side by side (11/10/2026): "Next" is the earliest step to act on here on /ops,
 * the content contract (the long pole, made outside /ops) is named beside it while it is to do, and
 * every step that can start now wears a small tag.
 *
 * COMPACT BY STATE (Akemi, 11/10/2026): a done step is ONE line (icon, number, title, its short fact
 * and links such as Open on GitHub); a waiting step is one line with "Waiting for step N" on it; only
 * a step to act on opens, and its tag and Go there sit on the title row. SHORT (Akemi, 11/10/2026):
 * a step to act on shows its why line, at most one fact line and at most three steps; an Outside
 * /ops block is only its label ("Paste into Claude Code"), the one prompt (wrapped) with its copy
 * button, the production line when there is one, and one doc link.
 *
 * Go there opens the tab, picks the release and focuses an enabled control. Every word comes from
 * the guide table (`problem-guides.ts`), keyed by the step's code.
 *
 * CUSTOMIZE YOUR SITE (ADR 0029 §4): the step of the readiness check. Its title carries the score
 * ("Customize your site · 26/29 passed"); open, it lists the failing rules in two short groups,
 * "Must fix (n)" in red and "Worth fixing (n)" in amber, one plain line each, then ONE prompt for the
 * whole release, and a Check again button for owners and admins. While a check runs the panel reads
 * the list again every few seconds (`onChanged`), and stops once nothing is checking.
 *
 * DESIGN SYSTEM (ADR 0031, 12/10/2026): the step of the Template Design System Readiness check, drawn
 * exactly like Customize your site ("Design system · 5/7 passed", the two rule groups, one prompt
 * naming the tdsr skill, Check again pressing its own door).
 *
 * RE-CHECKING (12/10/2026): a release that already has a result and is judged again (new rules, a new
 * profile row, a new contract) keeps that result on its row, with a small "Rechecking…" note, never
 * an empty "Checking": Publish keeps reading the last result until the new one lands.
 */
import { Button, cn, PlatformGlyph } from '@tracy/ui'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Copy,
  ExternalLink,
  LoaderCircle,
  Lock,
  RotateCw,
  TriangleAlert
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { tr, useT } from '../i18n'
import { DesignSystemStepBody } from './DesignSystemRules'
import {
  type CustomizeRule,
  type GuideContext,
  guideOf,
  type OutsideFix,
  type ProblemTarget,
  ROAD_ORDER,
  type RoadStep,
  STEP_TITLE,
  type StepGuide,
  type StepName,
  stepNumber,
  waitingLine
} from './problem-guides'
import { githubReleaseHref } from './QuickstartSettingsParts'
import type { ReleaseRow } from './Quickstarts'
import { CMS_LABEL } from './route'
import { type RuleRow, ruleRows } from './rule-rows'
import { releaseNames, roadOfRelease } from './templates-model'

/** Where Go there lands: the release whose step it is, and the place on the page. */
export type RoadGo = (tag: string, target: ProblemTarget) => void

/** `word` is a key: the state's name for a screen reader. */
const STATE = {
  done: {
    icon: CircleCheck,
    tone: 'text-emerald-700 dark:text-emerald-400',
    word: 'cms-readiness.road.state.done'
  },
  warn: {
    icon: TriangleAlert,
    tone: 'text-amber-700 dark:text-amber-400',
    word: 'cms-readiness.road.state.warn'
  },
  todo: { icon: CircleDot, tone: 'text-destructive', word: 'cms-readiness.road.state.todo' },
  blocked: { icon: Lock, tone: 'text-muted-foreground', word: 'cms-readiness.road.state.blocked' },
  checking: { icon: LoaderCircle, tone: 'text-muted-foreground', word: 'cms-readiness.road.state.checking' }
} as const

/** The tag the content contract wears while it is to do: it takes longest, so it starts first. */
const CONTRACT_TAG = 'cms-readiness.road.tag.contract'
/** The tag of every other step to do while several can be worked on side by side. */
const PARALLEL_TAG = 'cms-readiness.road.tag.parallel'
const FOCUS = 'focus-visible:outline-1 focus-visible:outline-ring'

/** One segment of the header's progress bar per step, coloured by its state (theme tokens). */
const BAR: Record<RoadStep['state'], string> = {
  done: 'bg-emerald-600 dark:bg-emerald-500',
  warn: 'bg-amber-500 dark:bg-amber-400',
  todo: 'bg-destructive',
  blocked: 'bg-muted-foreground/25',
  checking: 'bg-muted-foreground/50'
}

/** How often the panel reads the list again while a Customize your site check runs. */
const CHECKING_POLL_MS = 5000

/** Whether a step is being judged again over the result it shows (`params.rechecking`). */
const isRechecking = (s: RoadStep) => s.params?.rechecking === true

/** Whether any release's check runs now, first time or again: the panel reads the list again meanwhile. */
export function roadIsChecking(releases: ReleaseRow[]): boolean {
  return releases.some((r) => roadOfRelease(r).some((s) => s.state === 'checking' || isRechecking(s)))
}

/**
 * Check again: run one check of one release now (owners and admins): Customize your site by default,
 * Design system when the Design system row presses it (ADR 0031).
 */
export type CheckAgain = (tag: string, step?: StepName) => Promise<string | null>

/** The door each checked step's Check again presses. */
const CHECK_DOOR: Partial<Record<StepName, string>> = {
  customize: '/api/ops/quickstart/customize/check',
  'design-system': '/api/ops/quickstart/design-system/check'
}

/** The door Check again presses; the error text when it refuses, else null. */
export async function pressCheckAgain(tag: string, step: StepName = 'customize'): Promise<string | null> {
  try {
    const door = CHECK_DOOR[step] ?? CHECK_DOOR.customize
    const response = await fetch(`${door}?tag=${encodeURIComponent(tag)}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' }
    })
    if (response.ok) return null
    const body = (await response.json().catch(() => ({}))) as { reason?: string }
    return body.reason ?? tr('cms-readiness.road.checkAgain.refused', { status: response.status })
  } catch {
    return tr('cms-readiness.road.checkAgain.unreachable')
  }
}

/**
 * Where the page scrolls for a section, polled while the tab it is on still loads; then the
 * control Go there names is focused, the first enabled one inside it.
 */
export function scrollToSection(section: ProblemTarget['section'], control?: string) {
  // The Quickstart settings tab's own section names (`data-settings-section`).
  const settingsSection: Partial<Record<ProblemTarget['section'], string>> = {
    contract: 'contract',
    'install-file': 'install',
    'install-files': 'files',
    github: 'release'
  }
  const find = (last: boolean): Element | null => {
    if (section === 'demo-site' || section === 'demo-card')
      return document.querySelector(`[data-card-section="${section}"]`)
    const settings = document.querySelector('[data-quickstart-settings]')
    if (!settings) return null
    const name = settingsSection[section]
    const el = name ? settings.querySelector(`[data-settings-section="${name}"]`) : null
    // "files" is drawn only once tracy_setting.json is ready: the tab itself, once it has drawn.
    return el ?? (last ? settings : null)
  }
  const focusControl = () => {
    if (!control) return
    const holder = document.querySelector(`[data-road-control="${control}"]`)
    if (!holder) return
    const focusable =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    const el = holder.matches(focusable) ? holder : holder.querySelector(focusable)
    if (el instanceof HTMLElement) el.focus({ preventScroll: true })
  }
  let tries = 0
  const tick = () => {
    const el = find(tries >= 39)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // The control may draw a moment after its section (the demo row reads its own state).
      setTimeout(focusControl, 300)
    } else if (++tries < 40) setTimeout(tick, 100)
  }
  setTimeout(tick, 50)
}

/**
 * A need under a disabled Publish, followed: the step's row on the Road to live, its group opened
 * when it was collapsed, scrolled to, and its Go there (else the row) focused.
 */
export function scrollToStep(tag: string, step: string) {
  const group = [...document.querySelectorAll('[data-road-release]')].find(
    (el) => el.getAttribute('data-road-release') === tag
  )
  if (!group) return
  if (group.getAttribute('data-open') !== 'true')
    group.querySelector<HTMLElement>('[data-road-toggle]')?.click()
  setTimeout(() => {
    const row = group.querySelector<HTMLElement>(`[data-road-step="${step}"]`)
    if (!row) return
    row.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    const go = row.querySelector<HTMLElement>('[data-road-go]')
    if (go) go.focus({ preventScroll: true })
    else {
      row.tabIndex = -1
      row.focus({ preventScroll: true })
    }
  }, 50)
}

function CopyButton({ text }: { text: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 shrink-0 px-1.5"
      aria-label={t(copied ? 'cms-readiness.road.copied' : 'cms-readiness.road.copy')}
      title={t(copied ? 'cms-readiness.road.copied' : 'cms-readiness.road.copy')}
      data-road-copy=""
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => undefined)
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

/** The block of a step fixed outside /ops: its label, the one text to paste, and one doc. */
function Outside({ fix }: { fix: OutsideFix }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border border-dashed bg-background px-3 py-2"
      data-road-outside=""
    >
      <span className="text-muted-foreground text-xs">{fix.label}</span>
      <div className="flex items-start gap-1 rounded bg-muted/60 ps-2">
        <code
          className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1 font-mono text-xs"
          data-road-prompt=""
        >
          {fix.text}
        </code>
        <CopyButton text={fix.text} />
      </div>
      {fix.note ? (
        <p className="text-sm leading-snug" data-road-note="">
          {fix.note}
        </p>
      ) : null}
      <a
        href={fix.doc.href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'inline-flex w-fit items-center gap-1 break-all rounded font-mono text-muted-foreground text-xs underline-offset-2 hover:underline',
          FOCUS
        )}
        data-road-doc=""
      >
        {fix.doc.label}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    </div>
  )
}

/** Open on GitHub as a small inline link, on the release step's line. */
function GithubLink({ tag }: { tag: string }) {
  const t = useT()
  return (
    <a
      href={githubReleaseHref(tag)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1 rounded text-primary text-xs underline-offset-2 hover:underline',
        FOCUS
      )}
      data-road-github=""
    >
      {t('cms-readiness.road.openGithub')}
      <ExternalLink className="size-3" />
    </a>
  )
}

/**
 * The groups a checked step lists: must fix, worth fixing, and (Design system) not measured yet and
 * the built-site rules that passed on the measured run.
 */
const RULE_GROUP = {
  'must-fix': { word: 'cms-readiness.road.group.mustFix', tone: 'text-destructive' },
  'worth-fixing': {
    word: 'cms-readiness.road.group.worthFixing',
    tone: 'text-amber-700 dark:text-amber-400'
  },
  'not-measured': { word: 'cms-readiness.road.group.notMeasured', tone: 'text-muted-foreground' },
  passed: { word: 'cms-readiness.road.group.passed', tone: 'text-emerald-700 dark:text-emerald-400' }
} as const

/**
 * One group of rules: its heading with the count, then one plain line per rule. A rule scored from a
 * measurement file says which run under its line (#1313); a rule not measured yet has no such line.
 */
function RuleGroup({ kind, rules }: { kind: keyof typeof RULE_GROUP; rules: CustomizeRule[] }) {
  const t = useT()
  if (rules.length === 0) return null
  const group = RULE_GROUP[kind]
  return (
    <div className="flex flex-col gap-0.5" data-road-rules={kind}>
      <span className={cn('font-semibold text-xs', group.tone)}>
        {t(group.word)} ({rules.length})
      </span>
      <ul className="flex flex-col text-sm leading-snug">
        {ruleRows(rules, kind === 'not-measured').map((row) =>
          row.kind === 'folded' ? (
            <FoldedRuleRow key={row.rules[0].rule} row={row} />
          ) : (
            <OneRuleRow key={row.rule.rule} r={row.rule} />
          )
        )}
      </ul>
    </div>
  )
}

/** One rule's row: its line, and the run it was scored on. */
function OneRuleRow({ r }: { r: CustomizeRule }) {
  const t = useT()
  return (
    <li className="break-words" data-road-rule={r.rule}>
      <span className="font-medium">{r.question}:</span> {r.text}{' '}
      <span className="font-mono text-muted-foreground text-xs">{r.rule}</span>
      {/* a rule waiting for a new run says which run it has (an older preview probe, 14/10/2026) */}
      {r.measuredOn ? (
        <span className="block text-muted-foreground text-xs" data-road-rule-measured="">
          {t('cms-readiness.road.measuredOn', { when: r.measuredOn })}
        </span>
      ) : null}
    </li>
  )
}

/** Rules waiting for the same measurement, once: their line, every rule id, the reason and the fix once. */
function FoldedRuleRow({ row }: { row: Extract<RuleRow, { kind: 'folded' }> }) {
  const t = useT()
  // the run they all come from, once, when they share it (preview rules of one older probe)
  const stamp = row.rules[0]?.measuredOn
  const measuredOn = stamp && row.rules.every((r) => r.measuredOn === stamp) ? stamp : null
  return (
    <li className="break-words" data-road-rule-folded={row.rules.map((r) => r.rule).join(' ')}>
      <span className="font-medium">{row.question}:</span> {row.text}{' '}
      <span className="font-mono text-muted-foreground text-xs">
        {row.rules.map((r, i) => (
          <span key={r.rule} data-road-rule={r.rule}>
            {i ? ', ' : ''}
            {r.rule}
          </span>
        ))}
      </span>
      {measuredOn ? (
        <span className="block text-muted-foreground text-xs" data-road-rule-measured="">
          {t('cms-readiness.road.measuredOn', { when: measuredOn })}
        </span>
      ) : null}
    </li>
  )
}

/**
 * Every group of a checked step, in reading order: must fix, worth fixing, not measured yet, passed.
 * The Design system step draws its own (`DesignSystemStepBody`).
 */
function RuleGroups({ rules }: { rules: NonNullable<StepGuide['rules']> }) {
  return (
    <div className="flex flex-col gap-1.5 py-0.5" data-road-customize-rules="">
      <RuleGroup kind="must-fix" rules={rules.mustFix} />
      <RuleGroup kind="worth-fixing" rules={rules.worthFixing} />
      <RuleGroup kind="not-measured" rules={rules.unmeasured ?? []} />
      <RuleGroup kind="passed" rules={rules.passed ?? []} />
    </div>
  )
}

/**
 * Content coverage: what holds Publish in plain groups, one line each: the holes by cause, then the
 * page problems a customer must never see (raw language constants, PHP errors, placeholders).
 */
function LineGroups({ lists }: { lists: NonNullable<StepGuide['lists']> }) {
  return (
    <div className="flex flex-col gap-1.5 py-0.5" data-road-lists="">
      {lists.map((group) => (
        <div key={group.heading} className="flex flex-col gap-0.5" data-road-list={group.heading}>
          <span className="font-semibold text-destructive text-xs">
            {group.heading} ({group.count})
          </span>
          <ul className="flex flex-col text-sm leading-snug">
            {group.lines.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The screenshots of the measured run (Design system), in a new tab. */
function EvidenceLink({ evidence }: { evidence: NonNullable<StepGuide['evidence']> }) {
  return (
    <a
      href={evidence.href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1 self-start rounded text-primary text-xs underline-offset-2 hover:underline',
        FOCUS
      )}
      data-road-evidence=""
    >
      {evidence.label}
      <ExternalLink className="size-3" />
    </a>
  )
}

/** Check again on a checked row (Customize your site, Design system); it says the server's refusal, if any, under it. */
function CheckAgainButton({
  tag,
  step,
  onCheckAgain
}: {
  tag: string
  step: StepName
  onCheckAgain: CheckAgain
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={busy}
        data-road-check-again=""
        onClick={() => {
          setBusy(true)
          setError(null)
          void onCheckAgain(tag, step).then((refused) => {
            setError(refused)
            setBusy(false)
          })
        }}
      >
        <RotateCw />
        {t('cms-readiness.road.checkAgain')}
      </Button>
      {error ? (
        <span className="text-destructive text-xs" data-road-check-error="">
          {error}
        </span>
      ) : null}
    </span>
  )
}

function StepRow({
  s,
  guide,
  tag,
  startTag,
  writable,
  onGo,
  onCheckAgain
}: {
  s: RoadStep
  guide: StepGuide
  tag: string
  /** The key of the tag the step wears ("Start now, takes longest" or "Start now"), if any. */
  startTag: string | null
  writable: boolean
  onGo: RoadGo
  onCheckAgain?: CheckAgain
}) {
  const t = useT()
  const st = STATE[s.state] ?? STATE.todo
  const Icon = st.icon
  const open = s.state === 'todo' || s.state === 'warn'
  const target = guide.ops?.target
  const waiting = waitingLine(s)
  // A short fact sits on the title line when the row stays shut (done, or a check running).
  const inlineDetail = (s.state === 'done' || s.state === 'checking') && guide.detail
  // A done row that lists rules (Design system: the built-site rules that passed, each with its
  // "Measured on" line, #1313) shows that list too, so a pass says which run it came from.
  const doneRules = s.state === 'done' && guide.rules ? guide.rules : null
  const rechecking = isRechecking(s)
  // the Design system step: verdict, the prompt, then one Details fold (`DesignSystemStepBody`)
  const isDs = s.step === 'design-system'
  const checkAgain =
    guide.checkAgain === true && writable && onCheckAgain && s.state !== 'checking' && !rechecking
  return (
    <li
      className={cn('flex flex-col px-3', open ? 'gap-1 py-2' : 'py-1.5')}
      data-road-step={s.step}
      data-road-state={s.state}
      data-road-code={s.code}
    >
      <div className="flex min-h-6 items-center gap-x-2">
        <span className={cn('flex shrink-0 items-center gap-1.5', st.tone)}>
          <Icon className={cn('size-4', s.state === 'checking' && 'animate-spin')} aria-label={t(st.word)} />
          <span className="w-4 text-end font-semibold text-xs tabular-nums">{stepNumber(s.step)}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <b className={cn('font-semibold text-sm', s.state === 'blocked' && 'text-muted-foreground')}>
            {guide.title}
          </b>
          {!guide.title.startsWith(STEP_TITLE[s.step]) ? (
            <span className="text-muted-foreground text-xs">{STEP_TITLE[s.step]}</span>
          ) : null}
          {startTag ? (
            <span
              className="rounded bg-primary/10 px-1.5 font-semibold text-[11px] text-primary leading-5"
              data-road-tag=""
            >
              {t(startTag)}
            </span>
          ) : null}
          {inlineDetail ? (
            <span className="min-w-0 truncate text-muted-foreground text-xs">{guide.detail}</span>
          ) : null}
          {rechecking ? (
            <span className="flex items-center gap-1 text-muted-foreground text-xs" data-road-rechecking="">
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
              {t('cms-readiness.road.rechecking')}
            </span>
          ) : null}
          {waiting ? (
            <span className="text-muted-foreground text-xs" data-road-waiting={s.blockedBy}>
              {waiting}
            </span>
          ) : null}
          {/* Every state, done or not: the release page of this tag on GitHub, in a new tab. */}
          {s.step === 'release' ? <GithubLink tag={tag} /> : null}
        </span>
        {open && target ? (
          writable ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              title={target.label}
              data-road-go={target.control ?? target.section}
              onClick={() => onGo(tag, target)}
            >
              {t('cms-readiness.road.go')}
              <ArrowRight />
            </Button>
          ) : (
            <span className="shrink-0 text-muted-foreground text-xs">
              {t('cms-readiness.road.ownersFix')}
            </span>
          )
        ) : null}
        {checkAgain && onCheckAgain ? (
          <CheckAgainButton tag={tag} step={s.step} onCheckAgain={onCheckAgain} />
        ) : null}
      </div>
      {open && isDs && guide.rules ? (
        <div className="ps-[2.625rem]">
          <DesignSystemStepBody guide={{ ...guide, rules: guide.rules }} />
        </div>
      ) : open ? (
        <div className="flex flex-col gap-1 ps-[2.625rem]">
          <p className="text-muted-foreground text-sm leading-snug">{guide.why}</p>
          {guide.detail ? <p className="break-words text-sm leading-snug">{guide.detail}</p> : null}
          {guide.rules ? <RuleGroups rules={guide.rules} /> : null}
          {guide.lists ? <LineGroups lists={guide.lists} /> : null}
          {guide.evidence ? <EvidenceLink evidence={guide.evidence} /> : null}
          {guide.ops ? (
            <ol
              className="flex list-decimal flex-col ps-5 text-sm leading-snug"
              aria-label={t('cms-readiness.road.howToFix')}
            >
              {guide.ops.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          ) : null}
          {guide.outside ? <Outside fix={guide.outside} /> : null}
        </div>
      ) : doneRules ? (
        <div className="flex flex-col gap-1 ps-[2.625rem]">
          {isDs ? (
            <DesignSystemStepBody guide={{ ...guide, detail: undefined, rules: doneRules }} />
          ) : (
            <>
              <RuleGroups rules={doneRules} />
              {guide.evidence ? <EvidenceLink evidence={guide.evidence} /> : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  )
}

function ReleaseGroup({
  r,
  name,
  writable,
  onGo,
  onCheckAgain
}: {
  r: ReleaseRow
  name: string
  writable: boolean
  onGo: RoadGo
  onCheckAgain?: CheckAgain
}) {
  const t = useT()
  const road = roadOfRelease(r)
  const ordered = ROAD_ORDER.map((n) => road.find((s) => s.step === n)).filter((s): s is RoadStep => !!s)
  const done = ordered.filter((s) => s.state === 'done' || s.state === 'warn').length
  const ctx: GuideContext = {
    tag: r.tag,
    cms: name,
    platform: r.platform,
    version: r.version,
    label: r.label,
    cmsVersion: r.cms,
    template: r.template
  }
  // Every step that can be acted on now. Next is the earliest one fixed here on /ops (else the
  // earliest at all); the contract, made outside /ops, is named beside it while it is to do.
  // Every step that can be acted on now, in road order: the header's one "To do now" list.
  const actionable = ordered.filter((s) => s.state === 'todo')
  const startTagOf = (s: RoadStep): string | null => {
    if (s.state !== 'todo') return null
    if (s.step === 'contract') return CONTRACT_TAG
    return actionable.length > 1 ? PARALLEL_TAG : null
  }
  const live = ordered.find((s) => s.step === 'published')?.state === 'done'
  // On a live release, what still warns or is left to do: the header says how many.
  const warned = ordered.filter((s) => s.state === 'warn' || s.state === 'todo').length
  // Every group starts collapsed, the one with the next step too (Akemi, 11/10/2026): the admin
  // opens a group by clicking its row; To do now, Publish's Needs and Go there open it on the way.
  const [open, setOpen] = useState(false)
  const body = useId()
  const Chevron = open ? ChevronDown : ChevronRight
  // A "To do now" item: open the group, then scroll to the step and focus its Go there.
  const goToStep = (step: StepName) => {
    setOpen(true)
    setTimeout(() => scrollToStep(r.tag, step), 0)
  }
  return (
    <section className="rounded-lg bg-muted/40" data-road-release={r.tag} data-open={open}>
      {/* The whole header row is the toggle: a button stretched over the row (so its words and its
          progress bar open and close the group too), with the chevron at the row's right edge.
          The "To do now" items sit above it and never toggle the group. */}
      <h3
        className={cn(
          'relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm hover:bg-muted/50',
          open && 'rounded-b-none'
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          aria-label={r.version ? `${name} ${r.version}` : name}
          onClick={() => setOpen(!open)}
          className={cn(
            'absolute inset-0 cursor-pointer rounded-lg -outline-offset-1',
            open && 'rounded-b-none',
            FOCUS
          )}
          data-road-toggle=""
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {r.platform ? <PlatformGlyph platform={r.platform} /> : null}
              {name}
            </span>
            {r.version ? (
              <span className="font-mono font-normal text-muted-foreground text-xs">{r.version}</span>
            ) : null}
          </span>
          <span
            className="inline-flex items-center gap-2"
            role="img"
            aria-label={t('cms-readiness.road.summary', { done, total: ordered.length })}
            data-road-summary={`${done}/${ordered.length}`}
          >
            <span className="flex gap-0.5" aria-hidden="true">
              {ordered.map((s) => (
                <span
                  key={s.step}
                  className={cn('h-1.5 w-3 rounded-full', BAR[s.state] ?? BAR.blocked)}
                  data-road-bar={s.state}
                />
              ))}
            </span>
            <span className="font-normal text-muted-foreground text-xs tabular-nums" aria-hidden="true">
              {done}/{ordered.length}
            </span>
          </span>
          {live ? (
            <span className="font-normal text-muted-foreground text-xs" data-road-live="">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {t('cms-readiness.road.live')}
              </span>
              {warned > 0 ? `, ${t('cms-readiness.road.lookAt', { count: warned })}` : ''}
            </span>
          ) : actionable.length > 0 ? (
            <span className="font-normal text-muted-foreground text-xs" data-road-todo="">
              {t('cms-readiness.road.todoNow')}{' '}
              {actionable.map((s, i) => (
                <span key={s.step}>
                  {i > 0 ? ', ' : null}
                  <button
                    type="button"
                    className={cn(
                      'relative z-10 rounded text-primary underline-offset-2 hover:underline',
                      FOCUS
                    )}
                    data-road-todo-step={s.step}
                    onClick={(e) => {
                      // Opens the group and goes to the step; it must never reach the row's toggle.
                      e.stopPropagation()
                      goToStep(s.step)
                    }}
                  >
                    {STEP_TITLE[s.step]}
                  </button>
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <Chevron
          className="pointer-events-none size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
          data-road-chevron=""
        />
      </h3>
      <div id={body} hidden={!open}>
        {open ? (
          <ol className="flex flex-col divide-y divide-border">
            {ordered.map((s) => (
              <StepRow
                key={s.step}
                s={s}
                guide={guideOf(s, ctx)}
                tag={r.tag}
                startTag={startTagOf(s)}
                writable={writable}
                onGo={onGo}
                onCheckAgain={onCheckAgain}
              />
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  )
}

export function RoadToLive({
  releases,
  writable,
  onGo,
  onChanged,
  checkAgain = pressCheckAgain
}: {
  releases: ReleaseRow[]
  writable: boolean
  onGo: RoadGo
  /** Read the list again: after Check again, and every few seconds while a check runs. */
  onChanged?: () => void
  /** The Check again press (the door by default; a test passes its own). */
  checkAgain?: CheckAgain
}) {
  const t = useT()
  const withRoad = releases.filter((r) => roadOfRelease(r).length > 0)
  const checking = roadIsChecking(withRoad)
  useEffect(() => {
    if (!checking || !onChanged) return
    const timer = setInterval(onChanged, CHECKING_POLL_MS)
    return () => clearInterval(timer)
  }, [checking, onChanged])
  const onCheckAgain: CheckAgain | undefined = onChanged
    ? async (tag, step) => {
        const refused = await checkAgain(tag, step)
        if (refused === null) onChanged()
        return refused
      }
    : undefined
  if (withRoad.length === 0) return null
  const names = releaseNames(releases)
  return (
    <div className="flex flex-col gap-2" data-road-to-live={withRoad.length}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-semibold text-base">{t('cms-readiness.road.title')}</h2>
        <p className="text-muted-foreground text-xs" data-road-help="">
          {t('cms-readiness.road.help')}
        </p>
      </div>
      {withRoad.map((r) => (
        <ReleaseGroup
          key={r.tag}
          r={r}
          name={names.get(r.tag) ?? (r.platform ? CMS_LABEL[r.platform] : r.tag)}
          writable={writable}
          onGo={onGo}
          onCheckAgain={onCheckAgain}
        />
      ))}
    </div>
  )
}
