/**
 * One template's page — it replaces the Templates list in place, like the old quickstart page did.
 *
 * Three tabs, each the content an older screen already had, moved rather than redrawn:
 *   - Design Inspiration (`view=card`): the old quickstart page's Design inspiration tab
 *     (`DesignInspirationPanel`), in two sections, "Demo Site" (the release's demo on this
 *     server with its Install/Update press, `ReleaseDemo`; content contract; layouts) and
 *     "Listing" (status, Create listing, the listing's fields, Save listing).
 *   - Quickstart settings: the old Setting tab (`QuickstartSettings`), with the release's GitHub
 *     state and install file (and Create the file when it has none).
 *   - Customize question: what a customer of this template is asked (`CustomerQuestionsPreview`),
 *     read from the customer's own door, never a copy.
 * A Releases tab held GitHub state, install file and demo per CMS until 10/10/2026; those now live
 * on the two tabs above, and an old `view=releases` link opens Design Inspiration.
 * A template shows one release at a time, picked with the same CMS chips the list filters with. It
 * opens on the release the address names (`release=`, a tag or a CMS id), else on the one whose
 * listing feeds the customer card (`defaultReleaseTag`).
 *
 * 🔒 THE ROAD GATES PUBLISH. Under its title a template shows the Road to live (`RoadToLive`): every
 * release's seven steps as the server's `road` sends them, the same road the publish door reads
 * its refusal off. Publish (in the header, so it is there on every tab) stays off while any
 * release it would press is still waiting for a step (`templatePublishNeeds`); what it needs is
 * on hover only, as the Road to live right below already lists it (Akemi, 11/10/2026). The listing is
 * made on the Design Inspiration tab: Save listing stores it hidden; Publish then only shows the
 * listing already saved (`card-press.ts`). The header offers ONE press by the template's state:
 * Unpublish on a Published one, Publish on a Disabled one, never both. One release alone is
 * published or unpublished from its own Listing status strip (`ListingPress`).
 *
 * A design pack (every release `kind: 'design-pack'`) is applied on top of a site built from a
 * quickstart and is never offered on Design inspiration: it has no road, no Publish/Unpublish,
 * and one neutral line in place of the road (`cms-templates.detail.designPackLine`).
 */
import { Badge, Button, cn } from '@tracy/ui'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { useT } from '../i18n'
import { pressCard } from './card-press'
import { CustomerQuestionsPreview } from './CustomerQuestionsPreview'
import { type ContractStatus, DesignInspirationPanel } from './DesignInspiration'
import { type QuickstartDetail, QuickstartSettings } from './QuickstartSettings'
import { thrownText } from './response-error'
import { ReleaseDemo } from './ReleaseDemo'
import { CMS_LABEL, CMS_SCREEN_LABEL } from './route'
import { CmsChip, VersionChips } from './Templates'
import type { ReleaseRow } from './Quickstarts'
import {
  chipStatusOf,
  defaultReleaseTag,
  releaseNames,
  needsText,
  type PublishNeed,
  releasePublishNeeds,
  roadOfRelease,
  templatePublishNeeds,
  type TemplateRow
} from './templates-model'
import { ListingPress, type ListingPressNote, publishTone } from './ListingPress'
import { ListingStatusStrip } from './ListingStatusStrip'
import type { ProblemTarget } from './problem-guides'
import { RoadToLive, scrollToSection, scrollToStep } from './RoadToLive'

/**
 * Whether the release's road says its demo is live (`demo-live`, or `demo-version` for a live demo
 * behind the release), or undefined when the road has no demo step to say it.
 */
function demoLiveOnRoad(release: ReleaseRow): boolean | undefined {
  const step = roadOfRelease(release).find((s) => s.step === 'demo')
  return step ? step.state === 'done' || step.state === 'warn' : undefined
}

const VIEWS = [
  ['card', 'cms-templates.detail.viewCard'],
  ['settings', 'cms-templates.detail.viewSettings'],
  ['questions', 'cms-templates.detail.viewQuestions']
] as const
type View = (typeof VIEWS)[number][0]

// Anything else, the removed `releases` and the spelled-out `design-inspiration` included, opens
// the first tab, so an old link still lands on the template.
const viewOf = (v: string | null): View => (VIEWS.some(([id]) => id === v) ? (v as View) : 'card')

export function TemplateDetail({
  row,
  view: asked,
  release: askedRelease = null,
  writable,
  onView,
  onBack,
  onChanged,
  readKey = 0
}: {
  row: TemplateRow
  view: string | null
  /** The address's `release`: a release tag or a CMS id; null opens the card's own release. */
  release?: string | null
  writable: boolean
  onView: (view: string | null) => void
  onBack: () => void
  onChanged: () => void
  /** The page's read generation: the Demo Site row reads its demo again with each one. */
  readKey?: number
}) {
  const t = useT()
  const view = viewOf(asked)
  const [tag, setTag] = useState(() => defaultReleaseTag(row.releases, askedRelease))
  const release = row.releases.find((r) => r.tag === tag) ?? row.releases[0]
  // Why the header Publish is off: the releases it would press that still wait for a step.
  const publishBlockers = templatePublishNeeds(row.releases)
  // Go there: the step's own release chip, its tab, then the section and the control on that tab.
  const goTo = (stepTag: string, target: ProblemTarget) => {
    setTag(stepTag)
    onView(target.view === 'card' ? null : target.view)
    scrollToSection(target.section, target.control)
  }
  // A need under a disabled Publish: its step on the Road to live.
  // 🔒 WHICH RELEASES THE HEADER PRESSES ACT ON — decided HERE and nowhere else: every CMS release
  // of the template (Akemi, 10/10/2026). The CMS picked with the chips only picks what the tabs show.
  // A design pack is never offered on Design inspiration, so it has nothing to press.
  const pressTargets = row.designPack ? [] : row.releases
  // A press in the header changes the card the Design Inspiration tab shows: it is read again.
  const [cardReads, setCardReads] = useState(0)
  // Whether each release's demo on this server runs an older version than the release, as the
  // demo cell reads it; it puts a "Needs update" tag beside the Demo Site title.
  const [demoBehind, setDemoBehind] = useState<Record<string, boolean>>({})
  // Each release's chip name: its CMS, and its tag too when another release shares that CMS.
  const names = releaseNames(row.releases)
  // The selected release as the listing status strip and its press name it.
  const releaseCms =
    (release && names.get(release.tag)) ??
    (release?.platform ? CMS_LABEL[release.platform] : (release?.tag ?? ''))
  // The last answer of a listing's own press; kept here so the reload it starts does not drop it.
  const [listingNote, setListingNote] = useState<ListingPressNote | null>(null)
  const pressChanged = () => {
    setCardReads((n) => n + 1)
    onChanged()
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6" data-template-page={row.id}>
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ms-2" data-back="">
          <ArrowLeft />
          {CMS_SCREEN_LABEL.templates}
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-semibold text-xl tracking-tight">{row.label}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-muted-foreground text-xs">{row.id}</span>
            {row.designPack ? (
              <Badge
                variant="outline"
                className="border-transparent bg-muted font-semibold text-muted-foreground"
              >
                {t('cms-templates.state.designPack')}
              </Badge>
            ) : null}
            {row.active ? (
              <Badge
                variant="outline"
                className="border-transparent bg-emerald-600/10 font-semibold text-emerald-700 dark:text-emerald-400"
              >
                {t('cms-templates.state.published')}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-transparent bg-muted font-semibold text-muted-foreground"
              >
                {t('cms-templates.state.disabled')}
              </Badge>
            )}
            <VersionChips releases={row.releases} />
          </div>
        </div>
        {pressTargets.length > 0 ? (
          <CardActions
            releases={pressTargets}
            active={row.active}
            blockers={publishBlockers}
            writable={writable}
            onChanged={pressChanged}
          />
        ) : null}
      </div>

      {/* Every release's road to live: seven steps, how to fix each, and Go there. */}
      {row.designPack ? (
        <p
          className="rounded-lg bg-muted/40 px-3 py-2.5 text-muted-foreground text-sm"
          data-design-pack-note=""
        >
          {t('cms-templates.detail.designPackLine')}
        </p>
      ) : (
        // Keyed by template: each one's groups start open or collapsed by its own road.
        <RoadToLive
          key={row.id}
          releases={row.releases}
          writable={writable}
          onGo={goTo}
          onChanged={onChanged}
        />
      )}

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-[3px]" role="tablist">
        {VIEWS.map(([id, labelKey]) => {
          // A dot with a number when this tab has something to fix: red for issues that hold
          // Publish, amber for warnings only (Akemi, 10/10/2026).
          const p = row.problems[id]
          const count = p.issues + p.warnings
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              data-view={id}
              onClick={() => onView(id === 'card' ? null : id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-1 focus-visible:outline-ring',
                view === id
                  ? 'bg-background font-semibold text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(labelKey)}
              {count > 0 ? (
                <span
                  className={cn(
                    'inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold text-xs tabular-nums leading-none',
                    p.issues > 0
                      ? 'bg-destructive/15 text-destructive dark:bg-destructive/35 dark:text-red-200'
                      : 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300'
                  )}
                  data-tab-problems={count}
                  title={t('cms-templates.count.both', {
                    issues: t('cms-templates.count.issues', { count: p.issues }),
                    warnings: t('cms-templates.count.warnings', { count: p.warnings })
                  })}
                >
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* On the Design Inspiration tab the chips show even for a template built on one CMS; the selected
          release's status sits in the "Listing" section, its demo in "Demo Site". */}
      {row.releases.length > 1 || view === 'card' ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t('cms-templates.detail.releaseGroup')}
        >
          {row.releases.map((r) => (
            <CmsChip
              key={r.tag}
              cms={r.platform ?? undefined}
              pressed={r.tag === release?.tag}
              onClick={() => setTag(r.tag)}
              label={names.get(r.tag) ?? r.tag}
              // No version known (a design pack): no label, never the word "none".
              count={r.version ?? ''}
            />
          ))}
        </div>
      ) : null}

      {/* A design pack has no listing: the line above already says so, once. */}
      {!release || (view === 'card' && row.designPack) ? null : view === 'card' ? (
        <DesignInspirationPanel
          key={`${release.tag}#${cardReads}`}
          tag={release.tag}
          cell={release.inspiration}
          writable={writable}
          onChanged={onChanged}
          cardOnly
          // The Listing lock reads what the Road to live reads: the demo step of this release's
          // road, from the page's own list, re-read with every page read generation.
          demoLive={demoLiveOnRoad(release)}
          readKey={readKey}
          status={
            <ListingStatusStrip
              // A design pack is asked for no contract: its strip carries no contract line.
              status={row.designPack ? { ...chipStatusOf(release), contract: null } : chipStatusOf(release)}
              cms={releaseCms}
              onContract={() => scrollToStep(release.tag, 'contract')}
              press={
                row.designPack ? null : (
                  <ListingPress
                    key={release.tag}
                    tag={release.tag}
                    name={releaseCms}
                    card={chipStatusOf(release).card}
                    blockers={releasePublishNeeds(release)}
                    writable={writable}
                    note={listingNote}
                    onNote={setListingNote}
                    onChanged={pressChanged}
                  />
                )
              }
            />
          }
          demo={
            <ReleaseDemo
              key={release.tag}
              tag={release.tag}
              releaseVersion={release.version}
              // A demo job that settles changes what the problems say: the list is read again.
              onChanged={onChanged}
              // Read again with the page's list, so the row and the problems never disagree.
              readKey={readKey}
              // The road holds the demo while the contract may still make a new version.
              waitReason={
                roadOfRelease(release).find((s) => s.step === 'demo')?.blockedBy === 'contract'
                  ? t('cms-templates.detail.contractFirst')
                  : null
              }
              onBehind={(behind) =>
                setDemoBehind((seen) =>
                  seen[release.tag] === behind ? seen : { ...seen, [release.tag]: behind }
                )
              }
            />
          }
          siteTag={
            demoBehind[release.tag] ? (
              <Badge
                variant="outline"
                className="border-transparent bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-400"
              >
                {t('cms-templates.detail.needsUpdate')}
              </Badge>
            ) : null
          }
        />
      ) : view === 'settings' ? (
        <SettingsOf
          key={release.tag}
          tag={release.tag}
          writable={writable}
          onChanged={onChanged}
          // A design pack is never offered on Design inspiration, so no contract is asked of it. Any
          // other release's row is built from its typed status (`contractStatus`).
          contract={
            row.designPack ? (
              <span className="text-muted-foreground" data-contract-not-needed="">
                {t('cms-templates.detail.contractNotNeeded')}
              </span>
            ) : undefined
          }
          contractStatus={row.designPack ? undefined : release.contract}
        />
      ) : (
        <CustomerQuestionsPreview key={release.tag} tag={release.tag} />
      )}
    </div>
  )
}

/** The quickstart door for one release; a late answer for another release lands nowhere. */
function SettingsOf({
  tag,
  writable,
  onChanged,
  contract,
  contractStatus
}: {
  tag: string
  writable: boolean
  onChanged: () => void
  contract?: ReactNode
  contractStatus?: ContractStatus
}) {
  const t = useT()
  const [detail, setDetail] = useState<QuickstartDetail>(null)
  const [error, setError] = useState<string | null>(null)
  const loads = useRef(0)
  const load = async () => {
    loads.current += 1
    const mine = loads.current
    setError(null)
    try {
      const response = await fetch(`/api/ops/quickstart?tag=${encodeURIComponent(tag)}`, {
        headers: { accept: 'application/json' }
      })
      if (!response.ok) throw new Error(t('cms-templates.errors.answered', { status: response.status }))
      const body = await response.json()
      if (loads.current === mine) setDetail(body)
    } catch (e) {
      if (loads.current === mine) setError(thrownText(e))
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: one read per release; the component is keyed by tag.
  useEffect(() => {
    void load()
  }, [])
  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!detail) return <p className="text-muted-foreground text-sm">{t('cms-templates.detail.reading')}</p>
  return (
    <QuickstartSettings
      tag={tag}
      detail={detail}
      writable={writable}
      contract={contract}
      contractStatus={contractStatus}
      onChanged={() => {
        void load()
        onChanged()
      }}
    />
  )
}

/**
 * Publish or Unpublish for the whole template, in the header (Akemi, 10/10/2026: one template is
 * one card on Design inspiration, so one press acts on every CMS release of it). ONE press, by the
 * template's state, never both: a Published template offers Unpublish only, a Disabled one Publish
 * only. A release alone is pressed from its Listing status strip (`ListingPress`).
 *
 * Publish shows the saved listing of every release not shown yet, and stays off while any of them
 * still waits for a step of its road (`blockers`); Unpublish hides every release that is shown (two
 * presses, no modal). A release that can never be a listing (a draft, a design pack) is passed over.
 * The releases are pressed one after another and each answers for itself: when one lands and
 * another is refused, the result says which CMS did what — never one success for a partial write.
 * The server refuses the same cases again (`NO_CARD`, `NO_CONTRACT`, `NOT_SHOWABLE`).
 */
export function CardActions({
  releases,
  active,
  blockers,
  writable,
  onChanged
}: {
  releases: ReleaseRow[]
  active: boolean
  /** EVERY step Publish still needs, across the releases it would press (`templatePublishNeeds`). */
  blockers: PublishNeed[]
  writable: boolean
  onChanged: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<{ tag: string; who: string; ok: boolean; text: string }[]>([])
  const [armed, setArmed] = useState(false)
  const many = releases.length > 1
  const names = releaseNames(releases)
  const whoOf = (r: ReleaseRow) => names.get(r.tag) ?? r.tag
  const cards = releases.filter((r) => r.inspiration && r.inspiration.state !== 'n/a')
  const toPublish = cards.filter((r) => r.inspiration?.state !== 'on')
  const toUnpublish = cards.filter((r) => r.inspiration?.state === 'on')

  const press = async (action: 'publish' | 'unpublish', targets: ReleaseRow[]) => {
    if (busy || targets.length === 0) return
    setBusy(true)
    setResults([])
    const out: { tag: string; who: string; ok: boolean; text: string }[] = []
    try {
      for (const r of targets) {
        const done = await pressCard(r.tag, action)
        out.push(
          done.ok
            ? {
                tag: r.tag,
                who: whoOf(r),
                ok: true,
                text: [
                  t(
                    action === 'publish'
                      ? 'cms-templates.actions.published'
                      : 'cms-templates.actions.unpublished'
                  ),
                  ...done.warnings
                ].join(' · ')
              }
            : { tag: r.tag, who: whoOf(r), ok: false, text: done.error }
        )
      }
    } finally {
      setResults(out)
      setBusy(false)
      // Anything that landed changed the list; a press where every release refused changed nothing.
      if (out.some((o) => o.ok)) onChanged()
    }
  }
  const failed = results.filter((r) => !r.ok).length
  // One release and it worked: the badge and the list say so; no line needed.
  const showResults =
    results.length > 0 && (many || failed > 0 || results.some((r) => r.text.includes(' · ')))

  return (
    <div className="flex max-w-sm flex-col items-end gap-1 text-end" data-card-actions="">
      {active && toUnpublish.length > 0 ? (
        <Button
          size="sm"
          // Red always: taking a template off the shelf; the second press reads as a question.
          variant="destructive"
          className={cn(
            'bg-destructive text-white hover:bg-destructive/85 dark:bg-destructive dark:hover:bg-destructive/85',
            armed && 'outline outline-1 outline-offset-2 outline-destructive'
          )}
          disabled={!writable || busy}
          data-card-unpublish=""
          title={
            armed
              ? t('cms-templates.actions.unpublishArmedTitle')
              : t('cms-templates.actions.unpublishTitle', { list: toUnpublish.map(whoOf).join(', ') })
          }
          onClick={() => {
            if (!armed) {
              setArmed(true)
              return
            }
            setArmed(false)
            void press('unpublish', toUnpublish)
          }}
          onBlur={() => setArmed(false)}
        >
          <EyeOff />
          {armed ? t('cms-templates.actions.unpublishArmed') : t('cms-templates.actions.unpublish')}
        </Button>
      ) : null}
      {/* A disabled button takes no pointer, so its reasons hang on this wrapper. */}
      {!active && toPublish.length > 0 ? (
        <span title={blockers.length > 0 ? needsText(blockers) : undefined} className="inline-flex">
          <Button
            size="sm"
            // Green when it can be pressed (Akemi, 10/10/2026); a plain muted button when it cannot,
            // so it never reads as pressable.
            className={publishTone(!writable || busy || blockers.length > 0)}
            disabled={!writable || busy || blockers.length > 0}
            data-card-publish=""
            title={
              blockers.length > 0
                ? undefined
                : t('cms-templates.actions.publishTitle', { list: toPublish.map(whoOf).join(', ') })
            }
            onClick={() => void press('publish', toPublish)}
          >
            <Eye />
            {t('cms-templates.actions.publish')}
          </Button>
        </span>
      ) : null}
      {showResults ? (
        <ul className="flex flex-col gap-0.5 text-xs" data-card-results={failed}>
          {failed > 0 && failed < results.length ? (
            <li className="text-destructive">
              {t('cms-templates.actions.partly', { done: results.length - failed, count: results.length })}
            </li>
          ) : null}
          {results.map((r) => (
            <li key={r.tag} className={r.ok ? 'text-muted-foreground' : 'text-destructive'}>
              {many ? `${r.who}: ` : ''}
              {r.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
