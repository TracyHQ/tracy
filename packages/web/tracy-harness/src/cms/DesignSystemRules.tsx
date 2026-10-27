/**
 * The Design system step of the Road to live (ADR 0031), kept SHORT (Akemi, 15/10/2026: "the
 * important part is only the paste-into-Claude-Code block"):
 *
 *   1. One verdict line (must fix, worth fixing, passed counts; the grade and x/y are on the title)
 *      and the run each source was measured on, once.
 *   2. The "Paste into Claude Code" block as the main element: its text shut to three lines with
 *      Show all, the Copy button always copying the whole text.
 *   3. Everything else behind ONE closed "Details (n rules)": each failing rule a single line
 *      (severity dot, plain line, id) that opens to what was seen and the fix
 *      (`DesignSystemRuleDetail.tsx`), then Not measured yet and Passed, one quiet line each.
 *
 * Customize your site keeps its own rows (`RuleGroups` in RoadToLive.tsx).
 */
import { Button, cn } from '@tracy/ui'
import { Check, ChevronRight, Copy, ExternalLink } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { FoldedBody, RuleBody, SUMMARY } from './DesignSystemRuleDetail'
import { type DsRun, rowStamp, runsOf } from './ds-rule-display'
import type { CustomizeRule, OutsideFix, StepGuide } from './problem-guides'
import { ruleRows } from './rule-rows'
import { Trans, useT } from '../i18n'

type Rules = NonNullable<StepGuide['rules']>

const DOT = {
  'must-fix': 'bg-destructive',
  'worth-fixing': 'bg-amber-500 dark:bg-amber-400',
  'not-measured': 'bg-muted-foreground/50',
  passed: 'bg-emerald-600 dark:bg-emerald-500'
} as const
type Kind = keyof typeof DOT

/** The dictionary stem of each kind: `cms-design.rules.kind.<stem>` and `….verdict.<stem>`. */
const KIND_KEY: Record<Kind, string> = {
  'must-fix': 'mustFix',
  'worth-fixing': 'worthFixing',
  'not-measured': 'notMeasured',
  passed: 'passed'
}

const LINK =
  'inline-flex w-fit items-center gap-1 rounded text-muted-foreground text-xs underline-offset-2 hover:underline focus-visible:outline-1 focus-visible:outline-ring'

const allOf = (rules: Rules): CustomizeRule[] => [
  ...rules.mustFix,
  ...rules.worthFixing,
  ...(rules.unmeasured ?? []),
  ...(rules.passed ?? [])
]

/** A severity dot. */
function Dot({ kind }: { kind: Kind }) {
  const t = useT()
  return (
    <span
      className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[kind])}
      aria-label={t(`cms-design.rules.kind.${KIND_KEY[kind]}`)}
    />
  )
}

/** "1 must fix · 4 worth fixing · 31 passed", then the step's own fact (e.g. "Live, so it stays published"). */
function Verdict({ rules, detail }: { rules: Rules; detail?: string }) {
  const every: { kind: Kind; n: number }[] = [
    { kind: 'must-fix', n: rules.mustFix.length },
    { kind: 'worth-fixing', n: rules.worthFixing.length },
    { kind: 'not-measured', n: (rules.unmeasured ?? []).length },
    { kind: 'passed', n: (rules.passed ?? []).length }
  ]
  // must fix and worth fixing always say their count, even 0; the others only when there are some
  const parts = every.filter((p) => p.n > 0 || p.kind === 'must-fix' || p.kind === 'worth-fixing')
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm" data-ds-verdict="">
      {parts.map((p) => (
        <span key={p.kind} className="inline-flex items-center gap-1.5" data-ds-count={p.kind}>
          <span className={cn('size-2 rounded-full', DOT[p.kind])} aria-hidden="true" />
          <Trans
            i18nKey={`cms-design.rules.verdict.${KIND_KEY[p.kind]}`}
            values={{ count: p.n }}
            components={{ b: <b className="font-semibold tabular-nums" /> }}
          />
        </span>
      ))}
      {detail ? <span className="text-muted-foreground">{detail}</span> : null}
    </p>
  )
}

/** The run each source was measured on, once, on one line. */
function Runs({ runs }: { runs: DsRun[] }) {
  if (runs.length === 0) return null
  return (
    <p className="flex flex-wrap gap-x-3 text-muted-foreground text-xs" data-ds-runs="">
      {runs.map((r) => (
        <span key={r.source} data-ds-run={r.source}>
          <Trans
            i18nKey="cms-design.rules.run"
            values={{ source: r.source, stamp: r.stamp }}
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        </span>
      ))}
    </p>
  )
}

/** The block the operator uses: titled, Copy up front, the text shut to three lines. */
function PasteBlock({ fix }: { fix: OutsideFix }) {
  const [copied, setCopied] = useState(false)
  const [all, setAll] = useState(false)
  const text = useId()
  const t = useT()
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2.5"
      data-road-outside=""
      data-ds-paste=""
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold text-sm">{fix.label}</h4>
        <Button
          size="sm"
          className="ms-auto h-7"
          data-road-copy=""
          onClick={() => {
            void navigator.clipboard
              ?.writeText(fix.text)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => undefined)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t('cms-design.rules.copied') : t('cms-design.rules.copy')}
        </Button>
      </div>
      {/* the padding sits on the box, the clamp on the text: a clamped line never shows in the padding */}
      <div className="rounded bg-muted/60 px-2 py-1.5">
        <code
          id={text}
          className={cn(
            'block whitespace-pre-wrap break-words font-mono text-xs leading-relaxed',
            !all && 'line-clamp-3'
          )}
          data-road-prompt=""
          data-open={all}
        >
          {fix.text}
        </code>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          className={cn(LINK, 'text-foreground')}
          aria-expanded={all}
          aria-controls={text}
          onClick={() => setAll(!all)}
          data-ds-paste-toggle=""
        >
          {all ? t('cms-design.rules.showLess') : t('cms-design.rules.showAll')}
        </button>
        <a
          href={fix.doc.href}
          target="_blank"
          rel="noreferrer"
          className={cn(LINK, 'break-all font-mono')}
          data-road-doc=""
        >
          {fix.doc.label}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      </div>
      {fix.note ? (
        <p className="text-sm leading-snug" data-road-note="">
          {fix.note}
        </p>
      ) : null}
    </section>
  )
}

/** One line that opens: a dot, the plain line, the id; its body below when open. */
function RuleLine({
  kind,
  text,
  id,
  children,
  ...rest
}: {
  kind: Kind
  text: ReactNode
  id: ReactNode
  children: ReactNode
  [k: `data-${string}`]: string
}) {
  return (
    <li>
      <details className="group/rule" {...rest}>
        <summary className={cn(SUMMARY, 'flex items-start gap-2 py-1 text-sm leading-snug')}>
          <Dot kind={kind} />
          <span className="min-w-0 flex-1 break-words">{text}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground leading-5">{id}</span>
          <ChevronRight
            className="mt-1 size-3 shrink-0 text-muted-foreground transition-transform group-open/rule:rotate-90"
            aria-hidden="true"
          />
        </summary>
        <div className="ms-4 mb-1.5 flex flex-col gap-1.5 border-border border-s ps-3 text-xs">
          {children}
        </div>
      </details>
    </li>
  )
}

/** Must fix or Worth fixing: one line per rule (folded when several wait for the same run). */
function FailingLines({ kind, rules, runs }: { kind: Kind; rules: CustomizeRule[]; runs: DsRun[] }) {
  const t = useT()
  if (rules.length === 0) return null
  return (
    <div className="flex flex-col" data-road-rules={kind}>
      <span className="font-semibold text-muted-foreground text-xs">
        {t(`cms-design.rules.kind.${KIND_KEY[kind]}`)} ({rules.length})
      </span>
      <ul className="flex flex-col">
        {ruleRows(rules, false).map((row) =>
          row.kind === 'folded' ? (
            <RuleLine
              key={row.rules[0].rule}
              kind={kind}
              text={row.text}
              id={t('cms-design.rules.folded', { count: row.rules.length })}
              data-road-rule-folded={row.rules.map((r) => r.rule).join(' ')}
            >
              <FoldedBody row={row} />
            </RuleLine>
          ) : (
            <RuleLine
              key={row.rule.rule}
              kind={kind}
              text={row.rule.text}
              id={row.rule.rule}
              data-road-rule={row.rule.rule}
            >
              <RuleBody r={row.rule} runs={runs} />
            </RuleLine>
          )
        )}
      </ul>
    </div>
  )
}

/** Not measured yet or Passed: one quiet line per rule (folded rows name every rule once). */
function QuietLines({ kind, rules, runs }: { kind: Kind; rules: CustomizeRule[]; runs: DsRun[] }) {
  const t = useT()
  if (rules.length === 0) return null
  return (
    <div className="flex flex-col" data-road-rules={kind}>
      <span className="font-semibold text-muted-foreground text-xs">
        {t(`cms-design.rules.kind.${KIND_KEY[kind]}`)} ({rules.length})
      </span>
      <ul className="flex flex-col text-sm leading-snug">
        {ruleRows(rules, kind === 'not-measured').map((row) => {
          const r = row.kind === 'folded' ? row.rules[0] : row.rule
          const stamp = row.kind === 'one' ? rowStamp(r, runs) : null
          return (
            <li
              key={r.rule}
              className="flex items-start gap-2 py-0.5"
              data-road-rule={row.kind === 'one' ? r.rule : undefined}
            >
              <Dot kind={kind} />
              <span className="min-w-0 flex-1 break-words">
                {row.kind === 'folded' ? row.text : r.text}
                {stamp ? (
                  <span className="block text-muted-foreground text-xs" data-road-rule-measured="">
                    {t('cms-design.rules.measuredOn', { stamp })}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground leading-5">
                {row.kind === 'folded'
                  ? row.rules.map((x, i) => (
                      <span key={x.rule} data-road-rule={x.rule}>
                        {i ? ', ' : ''}
                        {x.rule}
                      </span>
                    ))
                  : r.rule}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Every rule, behind one closed fold. */
function Details({ rules, runs }: { rules: Rules; runs: DsRun[] }) {
  const t = useT()
  const n = allOf(rules).length
  if (n === 0) return null
  return (
    <details className="group/details" data-ds-details="">
      <summary className={cn(SUMMARY, 'inline-flex items-center gap-1 font-medium text-sm')}>
        <ChevronRight
          className="size-3.5 transition-transform group-open/details:rotate-90"
          aria-hidden="true"
        />
        {t('cms-design.rules.details', { count: n })}
      </summary>
      <div className="mt-1.5 flex flex-col gap-2 ps-1" data-road-customize-rules="" data-ds-rules="">
        <FailingLines kind="must-fix" rules={rules.mustFix} runs={runs} />
        <FailingLines kind="worth-fixing" rules={rules.worthFixing} runs={runs} />
        <QuietLines kind="not-measured" rules={rules.unmeasured ?? []} runs={runs} />
        <QuietLines kind="passed" rules={rules.passed ?? []} runs={runs} />
      </div>
    </details>
  )
}

/** The body of the Design system step once checked: verdict, runs, the prompt, then Details. */
export function DesignSystemStepBody({ guide }: { guide: StepGuide & { rules: Rules } }) {
  const runs = runsOf(allOf(guide.rules))
  // the detail that only repeats a run said on the Runs line ("Measured on <stamp>.", in any language) is dropped
  const detail =
    guide.detail && !runs.some((r) => guide.detail?.endsWith(` ${r.stamp}.`)) ? guide.detail : undefined
  return (
    <div className="flex flex-col gap-2" data-ds-step="">
      <Verdict rules={guide.rules} detail={detail} />
      <Runs runs={runs} />
      {guide.outside ? <PasteBlock fix={guide.outside} /> : null}
      <Details rules={guide.rules} runs={runs} />
      {guide.evidence ? (
        <a href={guide.evidence.href} target="_blank" rel="noreferrer" className={LINK} data-road-evidence="">
          {guide.evidence.label}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  )
}
