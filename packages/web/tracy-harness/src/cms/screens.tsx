/**
 * The seven readings, drawn from a snapshot and from nothing else.
 *
 * 🔒 EVERY NUMBER ON THESE SCREENS CAME OUT OF THE SELECTED REF. There are no constants here — not
 * 152 designs, not 197 entities, not six stages. The drawing these screens were approved from
 * carried those as fixtures, and carrying them into the product would have produced a page that
 * kept describing 12 September for ever.
 *
 * 🔒 PER-CMS AND SHARED ARE NOT MIXED. Five sections answer per CMS (capabilities, stages, designs,
 * questions, contracts); three describe the whole build (bases, presets, tools). The overview says
 * which is which instead of splitting a shared file three ways and inventing a per-CMS claim it
 * does not make.
 */
import {
  Badge,
  Button,
  cn,
  NativeSelect,
  NativeSelectOption,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { Boxes, FlaskConical, Layers, Lock, MessageSquareText, ScrollText, Wrench } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { formatNumber, Trans, tr, useT } from '../i18n'
import { CMS_LABEL, CMS_SCREEN_LABEL, CMS_SCREENS, type Cms, cmsHrefFor, type ScreenId } from './route'
import {
  type DesignPage,
  fetchDesigns,
  fetchRuntime,
  type Refusal,
  type Runtime,
  type Snapshot,
  type Status
} from './api'
import {
  Code,
  Fact,
  LayerLine,
  LoadingRows,
  NoResults,
  Panel,
  RefusalNotice,
  RowDrawer,
  ScreenHead,
  Search,
  SectionGate,
  SourceList,
  StatusChip
} from './parts'

export type { ScreenId }

export const SCREENS: readonly { id: ScreenId; readonly label: string }[] = CMS_SCREENS.map((id) => ({
  id,
  get label() {
    return CMS_SCREEN_LABEL[id]
  }
}))

export interface ScreenProps {
  snapshot: Snapshot | null
  loading: boolean
  env: string
  cms: Cms
  setCms: (cms: Cms) => void
  goToScreen: (screen: ScreenId) => void
}

/** The screens below run only once a snapshot exists; `renderScreen` is the one place that proves it. */
type LoadedProps = ScreenProps & { snapshot: Snapshot }

export function renderScreen(id: ScreenId, props: ScreenProps): ReactNode {
  if (!props.snapshot)
    return (
      <div className="px-6 py-6">
        <Panel title={tr('cms-screens.readingSnapshot')}>
          <LoadingRows />
        </Panel>
      </div>
    )
  const loaded = props as LoadedProps
  switch (id) {
    // Quickstarts draws itself in App.tsx: it reads live doors, not the snapshot every case here
    // is handed, and giving it a snapshot it ignores would invite the next reader to pass one.
    case 'templates':
    case 'inspiration':
    case 'quickstarts':
    case 'demos':
      return null
    case 'overview':
      return <Overview {...loaded} />
    case 'stages':
      return <Stages {...loaded} />
    case 'catalog':
      return <Catalog {...loaded} />
    case 'contracts':
      return <Contracts {...loaded} />
    case 'presets':
      return <Presets {...loaded} />
    case 'tools':
      return <Tools {...loaded} />
    case 'questions':
      return <Questions {...loaded} />
  }
}

/** Per-CMS readings; each `key` names its words: `cms-screens.overview.<key>.label` and `.blurb`. */
const PER_CMS: { key: string; screen: ScreenId }[] = [
  { key: 'capabilities', screen: 'catalog' },
  { key: 'stages', screen: 'stages' },
  { key: 'designs', screen: 'catalog' },
  { key: 'questions', screen: 'questions' },
  { key: 'contracts', screen: 'contracts' }
]

/** Whole-build readings; words at `cms-screens.overview.<key>.label`. */
const SHARED: { key: string; screen: ScreenId }[] = [
  { key: 'bases', screen: 'catalog' },
  { key: 'presets', screen: 'presets' },
  { key: 'tools', screen: 'tools' }
]

/**
 * The image a host reports, whatever shape it arrives in.
 *
 * The inventory answers with an object for a host that replied and `null` for one that did not;
 * printing it straight gives `[object Object]`, which looks like data and is not.
 */
function imageOf(image: unknown): string {
  if (!image) return '—'
  if (typeof image === 'string') return image
  const o = image as Record<string, unknown>
  const parts = [o.repository ?? o.name ?? o.image, o.tag, o.digest ?? o.id]
    .filter((v) => typeof v === 'string' && v !== '')
    .map((v) => String(v))
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(image).slice(0, 80)
}

/** The one area a drafts-only contract leaves writable: a path, shown as written in every language. */
const DRAFTS_AREA = '<site>/docs/agents/**'

function page(children: ReactNode) {
  return <div className="flex w-full flex-col gap-4 px-6 py-6">{children}</div>
}

/**
 * A section's per-CMS entry, or a clear absence — never an assumed one.
 *
 * 🔒 CONTRACTS ARE ATTRIBUTED BY THE `platform` FIELD, NOT BY A `byCms` KEY. Every other per-CMS
 * section is shaped `{ byCms: { joomla, wordpress, emdash } }`; contracts are a flat list of
 * profiles, each naming the platform it belongs to. The first version of this function looked for
 * `byCms` in all four and therefore told a reader "the contracts section says nothing about
 * Joomla" on a ref whose contracts section held a Joomla profile — an `unknown` where the answer
 * was known, which is the exact failure this screen exists to prevent. Measured in the browser
 * before it shipped.
 */
function perCms(
  snapshot: Snapshot,
  key: string,
  cms: Cms
): { status: Status; reason: string | null; data: any } {
  const section = snapshot.sections[key]
  if (!section) return { status: 'error', reason: tr('cms-screens.perCms.noSection', { key }), data: null }
  if (section.status !== 'ok') return { status: section.status, reason: section.reason, data: null }

  if (key === 'contracts') {
    const all: any[] = section.data?.profiles ?? []
    const mine = all.filter((p) => (p.platform ?? 'joomla') === cms)
    if (mine.length === 0)
      return {
        status: 'unsupported',
        reason:
          all.length === 0
            ? tr('cms-screens.perCms.noContracts')
            : tr('cms-screens.perCms.otherContracts', { cms: CMS_LABEL[cms], count: all.length }),
        data: null
      }
    return { status: 'ok', reason: null, data: { profiles: mine } }
  }

  const entry = section.data?.byCms?.[cms]
  if (!entry)
    return {
      status: 'unknown',
      reason: tr('cms-screens.perCms.silent', { key, cms: CMS_LABEL[cms] }),
      data: null
    }
  return { status: entry.status ?? 'ok', reason: entry.reason ?? null, data: entry }
}

// ── M01 ──────────────────────────────────────────────────────────────────────────────────────

function Overview({ snapshot, goToScreen, setCms }: LoadedProps) {
  const t = useT()
  return page(
    <>
      <ScreenHead
        title={t('cms-screens.overview.title')}
        sub={
          <Trans
            i18nKey="cms-screens.overview.sub"
            values={{ ref: snapshot.source.ref, sha: snapshot.source.sha.slice(0, 9) }}
            components={{ c: <span className="font-mono" /> }}
          />
        }
      />
      {(['joomla', 'wordpress', 'emdash'] as Cms[]).map((cms) => {
        const rows = PER_CMS.map((a) => ({ ...a, ...perCms(snapshot, a.key, cms) }))
        const ready = rows.filter((r) => r.status === 'ok').length
        return (
          <Panel
            key={cms}
            title={CMS_LABEL[cms]}
            aside={
              <span className="text-muted-foreground text-xs tabular-nums">
                {t('cms-screens.overview.ready', { ready, count: rows.length })}
              </span>
            }
          >
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-start md:gap-4"
                >
                  <div className="flex min-w-0 flex-none flex-col gap-0.5 md:w-52">
                    <span className="font-medium text-sm">{t(`cms-screens.overview.${row.key}.label`)}</span>
                    <span className="text-muted-foreground text-xs">
                      {t(`cms-screens.overview.${row.key}.blurb`)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={row.status} />
                      <span className="text-sm">{headline(row.key, row.data)}</span>
                    </div>
                    {row.reason ? (
                      <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{row.reason}</p>
                    ) : null}
                    <LayerLine className="mt-1.5" inRepo={row.status === 'ok' ? 'ok' : row.status} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-none"
                    aria-label={t('cms-screens.overview.openRow', {
                      cms: CMS_LABEL[cms],
                      reading: t(`cms-screens.overview.${row.key}.label`),
                      screen: CMS_SCREEN_LABEL[row.screen]
                    })}
                    onClick={() => {
                      setCms(cms)
                      goToScreen(row.screen)
                    }}
                  >
                    {t('cms-screens.overview.open')}
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        )
      })}

      <Panel
        title={t('cms-screens.overview.shared')}
        aside={<span className="text-muted-foreground text-xs">{t('cms-screens.overview.sharedAside')}</span>}
      >
        <ul className="divide-y divide-border">
          {SHARED.map((s) => {
            const section = snapshot.sections[s.key]
            return (
              <li key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="w-44 flex-none font-medium text-sm">
                  {t(`cms-screens.overview.${s.key}.label`)}
                </span>
                <StatusChip status={section?.status ?? 'error'} />
                <span className="min-w-0 flex-1 text-muted-foreground text-xs">
                  {section?.reason ?? headline(s.key, section?.data)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => goToScreen(s.screen)}>
                  {t('cms-screens.overview.open')}
                </Button>
              </li>
            )
          })}
        </ul>
      </Panel>

      <p className="text-muted-foreground text-xs">{t('cms-screens.overview.note')}</p>
    </>
  )
}

/** One line naming what was found, computed from the data rather than written down. */
function headline(key: string, data: any): string {
  if (!data) return '—'
  switch (key) {
    case 'capabilities':
      return tr('cms-screens.headline.providers', { count: data.providers?.length ?? 0 })
    case 'stages':
      return Array.isArray(data.stages) ? data.stages.join(' → ') : '—'
    case 'designs':
      return tr('cms-screens.headline.designs', { count: data.count ?? 0 })
    case 'contracts':
      return tr('cms-screens.headline.contracts', { count: data.profiles?.length ?? 0 })
    case 'bases':
      return tr('cms-screens.headline.bases', { count: data.bases?.length ?? 0 })
    case 'presets':
      return `${tr('cms-screens.headline.presets', { count: data.presets?.length ?? 0 })} · ${tr('cms-screens.headline.toolRows', { count: data.toolRows?.length ?? 0 })}`
    case 'questions':
      return tr('cms-screens.headline.questions', { count: data.questions?.length ?? 0 })
    case 'tools':
      return tr('cms-screens.headline.tools', { count: data.fence?.tools?.length ?? 0 })
    default:
      return '—'
  }
}

// ── M02 ──────────────────────────────────────────────────────────────────────────────────────

function Stages({ snapshot, cms }: LoadedProps) {
  const entry = perCms(snapshot, 'stages', cms)
  const t = useT()
  const [at, setAt] = useState(0)
  useEffect(() => setAt(0), [cms, snapshot.source.sha])

  return page(
    <>
      <ScreenHead
        title={t('cms-screens.stages.title')}
        sub={
          <Trans
            i18nKey="cms-screens.stages.sub"
            values={{ cms: CMS_LABEL[cms] }}
            components={{ c: <span className="font-mono" /> }}
          />
        }
      />
      {entry.status !== 'ok' || !Array.isArray(entry.data?.stages) ? (
        <Panel
          title={t('cms-screens.stages.panel', { cms: CMS_LABEL[cms] })}
          aside={<StatusChip status={entry.status} />}
        >
          <p className="px-4 py-5 text-sm">{entry.reason ?? t('cms-screens.stages.none')}</p>
        </Panel>
      ) : (
        <>
          <Panel
            title={t('cms-screens.stages.count', { cms: CMS_LABEL[cms], count: entry.data.stages.length })}
            aside={
              <span className="font-mono text-muted-foreground text-xs">{entry.data.stages.join(' · ')}</span>
            }
          >
            <div className="flex flex-wrap items-stretch gap-1.5 px-4 py-4">
              {entry.data.stages.map((id: string, i: number) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAt(i)}
                  aria-pressed={i === at}
                  aria-label={t('cms-screens.stages.step', { cms: CMS_LABEL[cms], n: i + 1, id })}
                  className={cn(
                    'flex min-w-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
                    i === at ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-muted-foreground text-xs tabular-nums">{i + 1}</span>
                    <span className="font-medium font-mono text-sm">{id}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={<span className="font-mono">{entry.data.stages[at]}</span>} icon={<FlaskConical />}>
            <div className="px-4 py-3">
              <Fact label={t('cms-screens.stages.declaredIn')}>
                <span className="font-mono text-xs">{entry.data.path}</span>
              </Fact>
              <Fact label={t('cms-screens.stages.position')}>
                {t('cms-screens.stages.positionOf', { n: at + 1, count: entry.data.stages.length })}
              </Fact>
              <Fact label={t('cms-screens.stages.covers')}>
                <Trans
                  i18nKey="cms-screens.stages.coversText"
                  components={{ c: <span className="font-mono" /> }}
                />
              </Fact>
            </div>
          </Panel>
        </>
      )}
      <SourceList sources={snapshot.sections.stages?.sources ?? []} />
    </>
  )
}

// ── M03 ──────────────────────────────────────────────────────────────────────────────────────

function Catalog({ snapshot, cms, env }: LoadedProps) {
  const t = useT()
  const caps = perCms(snapshot, 'capabilities', cms)
  const [q, setQ] = useState('')
  const [designs, setDesigns] = useState<DesignPage | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const ac = new AbortController()
    const mine = ++seq.current
    setRefusal(null)
    const timer = setTimeout(
      () => {
        fetchDesigns(env, cms, { q, limit: 50 }, ac.signal).then((r) => {
          if (ac.signal.aborted || mine !== seq.current) return
          if (!r.ok) {
            setDesigns(null)
            setRefusal(r.refusal)
            return
          }
          setDesigns(r.value)
        })
      },
      q ? 180 : 0
    )
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [env, cms, q])

  return page(
    <>
      <ScreenHead title={t('cms-screens.catalog.title')} sub={t('cms-screens.catalog.sub')} />
      <p className="-mt-2 text-muted-foreground text-xs">
        <Trans
          i18nKey="cms-screens.catalog.declared"
          components={{
            a: (
              <a
                href={cmsHrefFor({ screen: 'inspiration', env, cms, tag: null, set: null })}
                className="text-foreground underline underline-offset-2"
              />
            )
          }}
        />
      </p>

      <SectionGate section={snapshot.sections.bases} what="bases">
        {(data: any) => {
          // One catalogue file holds every CMS's archives, so the tab has to do the filtering the
          // file does not. Attributed by the entry's own `platform` field, never by the id's suffix
          // — `tracy-business/j6` and `tracy-business/emdash` are two different sites.
          const mine = data.bases.filter((b: any) => (b.platform ?? 'joomla') === cms)
          return (
            <Panel title={t('cms-screens.overview.bases.label')} icon={<Boxes />}>
              {mine.length === 0 ? (
                <p className="px-4 py-5 text-sm">
                  {t('cms-screens.catalog.noBase', { cms: CMS_LABEL[cms], count: data.bases.length })}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {mine.map((b: any) => (
                    <li key={b.id} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {b.id}
                        </Badge>
                        <span className="text-sm">{b.version}</span>
                        {b.template?.label ? (
                          <span className="text-muted-foreground text-xs">{b.template.label}</span>
                        ) : null}
                        {b.contract ? (
                          <span className="font-mono text-muted-foreground text-xs">{b.contract}</span>
                        ) : null}
                        <LayerLine className="ms-auto" inRepo="ok" />
                      </div>
                      <RowDrawer
                        label={t('cms-screens.catalog.artifactsFor', { id: b.id })}
                        trigger={t('cms-screens.catalog.artifacts')}
                        title={b.id}
                        description={`${b.version}${b.contract ? ` · ${b.contract}` : ''}`}
                      >
                        <Fact label={t('cms-screens.catalog.cowork')}>{b.cowork?.version ?? '—'}</Fact>
                        <Fact label={t('cms-screens.catalog.contract')}>{b.contract ?? '—'}</Fact>
                        <div className="mt-3 flex flex-col gap-3">
                          {[...b.artifacts, ...(b.cowork ? [{ ...b.cowork, kind: 'cowork' }] : [])].map(
                            (a: any) => (
                              <div
                                key={`${a.kind}-${a.file}`}
                                className="rounded-lg border border-border px-3 py-2"
                              >
                                <p className="font-mono text-xs">{a.file}</p>
                                <p className="mt-1 text-muted-foreground text-xs">
                                  {a.kind} ·{' '}
                                  {a.bytes
                                    ? t('cms-screens.sources.bytes', {
                                        count: a.bytes,
                                        bytes: formatNumber(a.bytes)
                                      })
                                    : '—'}{' '}
                                  · {a.host ?? t('cms-screens.catalog.noHost')}
                                </p>
                                {a.sha256 ? (
                                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                                    {`sha256 ${a.sha256}`}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {t('cms-screens.catalog.noChecksum')}
                                  </p>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </RowDrawer>
                      <p className="text-muted-foreground text-xs">{t('cms-screens.catalog.hashNote')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )
        }}
      </SectionGate>

      <Panel
        title={t('cms-screens.catalog.providers', { cms: CMS_LABEL[cms] })}
        aside={<StatusChip status={caps.status} />}
      >
        {caps.status !== 'ok' || !caps.data?.providers ? (
          <p className="px-4 py-5 text-sm">{caps.reason ?? t('cms-screens.catalog.noProviders')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cms-screens.catalog.col.provider')}</TableHead>
                  <TableHead>{t('cms-screens.catalog.col.version')}</TableHead>
                  <TableHead>{t('cms-screens.catalog.col.recipe')}</TableHead>
                  <TableHead>{t('cms-screens.catalog.col.state')}</TableHead>
                  <TableHead>{t('cms-screens.catalog.col.why')}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {caps.data.providers.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell className="text-xs">{p.version ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{p.recipe ?? '—'}</TableCell>
                    <TableCell>
                      <StatusChip
                        status={
                          p.state === 'ready' ? 'ok' : p.state === 'pending' ? 'unsupported' : 'unknown'
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-[24rem] whitespace-normal text-xs">
                      {p.reason ?? '—'}
                    </TableCell>
                    <TableCell>
                      <RowDrawer
                        label={
                          p.state
                            ? t('cms-screens.catalog.whyState', { id: p.id, state: p.state })
                            : t('cms-screens.catalog.whyThisState', { id: p.id })
                        }
                        trigger={t('cms-screens.catalog.col.why')}
                        title={p.id}
                        description={`${p.version ?? t('cms-screens.catalog.noVersion')} · ${p.state ?? t('cms-screens.catalog.stateUnknown')}`}
                      >
                        <Fact label={t('cms-screens.catalog.col.why')}>
                          {p.reason ?? t('cms-screens.catalog.noReason')}
                        </Fact>
                        <Fact label={t('cms-screens.catalog.col.recipe')}>{p.recipe ?? '—'}</Fact>
                        <Fact label={t('cms-screens.catalog.verification')}>{p.verification ?? '—'}</Fact>
                        <Fact label={t('cms-screens.catalog.artifact')}>
                          {p.artifact ?? t('cms-screens.catalog.noneDeclared')}
                        </Fact>
                        <Fact label={t('cms-screens.catalog.requires')}>
                          {(p.requires ?? []).join(', ') || t('cms-screens.catalog.nothing')}
                        </Fact>
                        <Fact label={t('cms-screens.catalog.majors')}>
                          {(p.platformMajors ?? []).join(', ') || '—'}
                        </Fact>
                        <Fact label={t('cms-screens.catalog.extensions')}>
                          {(p.extensions ?? [])
                            .map((e: any) => [e.type, e.folder, e.element].filter(Boolean).join('/'))
                            .join(' · ') || t('cms-screens.catalog.none')}
                        </Fact>
                        <p className="mt-3 text-muted-foreground text-xs">
                          {t('cms-screens.catalog.pendingNote')}
                        </p>
                      </RowDrawer>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel
        title={t(
          designs?.kind === 'template' ? 'cms-screens.catalog.templates' : 'cms-screens.catalog.designs',
          {
            cms: CMS_LABEL[cms]
          }
        )}
        aside={
          <>
            <Search
              value={q}
              onValue={setQ}
              label={t(
                designs?.kind === 'template'
                  ? 'cms-screens.catalog.searchTemplates'
                  : 'cms-screens.catalog.searchDesigns'
              )}
              placeholder={t(
                designs?.kind === 'template'
                  ? 'cms-screens.catalog.searchTemplates'
                  : 'cms-screens.catalog.searchDesigns'
              )}
            />
            <span className="text-muted-foreground text-xs tabular-nums">
              {designs
                ? t('cms-screens.catalog.matched', { matched: designs.matched, total: designs.total })
                : '—'}
            </span>
          </>
        }
      >
        {refusal ? (
          <div className="px-4 py-4">
            <RefusalNotice refusal={refusal} />
          </div>
        ) : !designs ? (
          <LoadingRows rows={3} />
        ) : designs.status !== 'ok' ? (
          <p className="px-4 py-5 text-sm">{designs.reason}</p>
        ) : designs.systems.length === 0 ? (
          <NoResults term={q} onClear={() => setQ('')} />
        ) : (
          <ul className="flex flex-wrap gap-1.5 px-4 py-3">
            {designs.systems.map((s) => (
              <li key={s.id}>
                <Badge
                  variant="outline"
                  className="font-normal"
                  title={
                    s.quickstart
                      ? `${s.quickstart} · ${s.version ?? t('cms-screens.catalog.noVersion')}`
                      : (s.category ?? undefined)
                  }
                >
                  {s.name}
                  {s.quickstart ? (
                    <span className="ms-1.5 font-mono text-[11px] text-muted-foreground">{s.version}</span>
                  ) : null}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {designs && designs.matched > designs.systems.length ? (
          <p className="px-4 pb-3 text-muted-foreground text-xs">
            {t('cms-screens.catalog.firstOf', { shown: designs.systems.length, count: designs.matched })}
          </p>
        ) : null}
      </Panel>
    </>
  )
}

// ── M07 ──────────────────────────────────────────────────────────────────────────────────────

function Contracts({ snapshot, cms }: LoadedProps) {
  const t = useT()
  const section = snapshot.sections.contracts
  return page(
    <>
      <ScreenHead title={t('cms-screens.contracts.title')} sub={t('cms-screens.contracts.sub')} />
      {cms !== 'joomla' ? (
        <Panel
          title={t('cms-screens.contracts.panel', { cms: CMS_LABEL[cms] })}
          aside={<StatusChip status="unsupported" />}
        >
          <p className="px-4 py-5 text-sm">
            {t('cms-screens.contracts.joomlaOnly', { cms: CMS_LABEL[cms] })}
          </p>
        </Panel>
      ) : (
        <SectionGate section={section} what="contracts">
          {(data: any) =>
            data.profiles.map((p: any) => (
              <Panel
                key={p.id}
                title={<span className="font-mono">{p.id}</span>}
                icon={<ScrollText />}
                aside={<Badge variant="secondary">{p.mode ?? t('cms-screens.contracts.modeUnknown')}</Badge>}
                className="mb-4"
              >
                <div className="grid gap-x-8 px-4 py-3 md:grid-cols-2">
                  <div>
                    <Fact label={t('cms-screens.contracts.template')}>{p.template ?? '—'}</Fact>
                    <Fact label={t('cms-screens.catalog.cowork')}>{p.coworkContractVersion ?? '—'}</Fact>
                    <Fact label={t('cms-screens.contracts.quickstart')}>
                      {p.quickstart
                        ? `${p.quickstart.release} ${p.quickstart.version} · Joomla ${p.quickstart.platformVersion}`
                        : '—'}
                    </Fact>
                  </div>
                  <div>
                    <Fact label={t('cms-screens.contracts.entities')}>
                      {p.entityTotal === null ? (
                        <span className="text-muted-foreground">{p.coverage}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          <Badge variant="secondary">
                            {t('cms-screens.contracts.total', { count: p.entityTotal })}
                          </Badge>
                          {Object.entries(p.entityCounts ?? {}).map(([k, n]) => (
                            <Badge key={k} variant="outline" className="font-normal">
                              {k} {String(n)}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </Fact>
                    <Fact label={t('cms-screens.contracts.files')}>
                      {p.files.map((f: any) => `${f.name} (${formatNumber(f.bytes)} B)`).join(' · ')}
                    </Fact>
                  </div>
                </div>
                <Separator />
                <div className="px-4 py-3">
                  <p className="font-medium text-sm">
                    {t('cms-screens.contracts.lock')}{' '}
                    {p.lock?.status === 'ok' ? (
                      <span className="font-normal text-muted-foreground text-xs">
                        {t('cms-screens.contracts.sampled', { sampled: p.lock.sampled, count: p.lock.total })}
                        {p.lock.sampledBy ? `, ${p.lock.sampledBy}` : ''}
                      </span>
                    ) : null}
                  </p>
                  {p.lock?.status !== 'ok' ? (
                    <p className="mt-1 text-muted-foreground text-sm">{p.lock?.reason}</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('cms-screens.contracts.col.entity')}</TableHead>
                            <TableHead>{t('cms-screens.contracts.col.title')}</TableHead>
                            <TableHead>{t('cms-screens.contracts.col.type')}</TableHead>
                            <TableHead>{t('cms-screens.contracts.col.position')}</TableHead>
                            <TableHead>{t('cms-screens.contracts.col.published')}</TableHead>
                            <TableHead>{t('cms-screens.contracts.col.access')}</TableHead>
                            <TableHead>{t('cms-screens.contracts.col.language')}</TableHead>
                            <TableHead className="w-0" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.lock.rows.map((r: any) => (
                            <TableRow key={r.key}>
                              <TableCell className="font-mono text-xs">{r.key}</TableCell>
                              <TableCell className="max-w-[18rem] whitespace-normal text-xs">
                                {r.title ?? '—'}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{r.module ?? '—'}</TableCell>
                              <TableCell className="font-mono text-xs">{r.position ?? '—'}</TableCell>
                              <TableCell className="text-xs">{r.published ?? '—'}</TableCell>
                              <TableCell className="text-xs">{r.access ?? '—'}</TableCell>
                              <TableCell className="text-xs">{r.language ?? '—'}</TableCell>
                              <TableCell>
                                <RowDrawer
                                  label={t('cms-screens.contracts.recordFor', { key: r.key })}
                                  trigger={t('cms-screens.contracts.record')}
                                  title={r.title ?? r.key}
                                  description={`${r.key} · ${r.module ?? t('cms-screens.contracts.noModule')}`}
                                >
                                  <Fact label={t('cms-screens.contracts.col.position')}>
                                    {r.position ?? '—'}
                                  </Fact>
                                  <Fact label={t('cms-screens.contracts.col.published')}>
                                    {r.published ?? '—'}
                                  </Fact>
                                  <Fact label={t('cms-screens.contracts.col.access')}>{r.access ?? '—'}</Fact>
                                  <Fact label={t('cms-screens.contracts.showTitle')}>
                                    {r.showtitle ?? '—'}
                                  </Fact>
                                  <Fact label={t('cms-screens.contracts.ordering')}>{r.ordering ?? '—'}</Fact>
                                  <Fact label={t('cms-screens.contracts.col.language')}>
                                    {r.language ?? '—'}
                                  </Fact>
                                  <Fact label={t('cms-screens.contracts.params')}>
                                    {r.paramsBytes === null || r.paramsBytes === undefined ? (
                                      <span className="text-muted-foreground">
                                        {t('cms-screens.contracts.noneRecorded')}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {t('cms-screens.contracts.paramsBytes', {
                                          count: r.paramsBytes,
                                          bytes: formatNumber(r.paramsBytes)
                                        })}
                                      </span>
                                    )}
                                  </Fact>
                                </RowDrawer>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <p className="mt-2 text-muted-foreground text-xs">
                    <Trans
                      i18nKey="cms-screens.contracts.sampleNote"
                      components={{ c: <span className="font-mono" /> }}
                    />
                  </p>
                </div>
              </Panel>
            ))
          }
        </SectionGate>
      )}
      <SourceList sources={section?.sources ?? []} />
    </>
  )
}

// ── M04 ──────────────────────────────────────────────────────────────────────────────────────

function Presets({ snapshot, cms }: LoadedProps) {
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)
  return page(
    <>
      <ScreenHead title={t('cms-screens.presets.title')} sub={t('cms-screens.presets.sub')} />
      <SectionGate section={snapshot.sections.presets} what="presets">
        {(data: any) => (
          <>
            <Panel
              title={t('cms-screens.presets.matrix')}
              aside={
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t('cms-screens.presets.roles', { count: data.roles.length })} ×{' '}
                  {t('cms-screens.presets.platforms', { count: data.platforms.length })} ·{' '}
                  {t('cms-screens.headline.toolRows', { count: data.toolRows.length })} ·{' '}
                  {t('cms-screens.presets.skillRows', { count: data.skillRows.length })}
                </span>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cms-screens.presets.col.preset')}</TableHead>
                      <TableHead>{t('cms-screens.presets.col.tools')}</TableHead>
                      <TableHead>{t('cms-screens.presets.col.skills')}</TableHead>
                      <TableHead>{t('cms-screens.contracts.files')}</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.presets.map((p: any) => {
                      const role = data.roles.find((r: any) => p.id.startsWith(`${r.id}-`))
                      const platform = data.platforms.find((pl: any) => p.id.endsWith(`-${pl.id}`))
                      const count = (rows: any[]) =>
                        rows.filter(
                          (r) =>
                            (role && r.roles?.[role.id]) || (platform && r.platforms?.[platform.id] === true)
                        ).length
                      return (
                        <TableRow
                          key={p.id}
                          className={p.id.endsWith(`-${cms}`) ? 'bg-accent/40' : undefined}
                        >
                          <TableCell className="font-mono text-xs">{p.id}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {count(data.toolRows)}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {count(data.skillRows)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.files.map((f: any) => f.name).join(', ')}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('cms-screens.presets.readId', { id: p.id })}
                              onClick={() => setOpen(open === p.id ? null : p.id)}
                            >
                              {t('cms-screens.presets.read')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </Panel>
            <TryTheRule resolver={data.resolver} />
            {open ? (
              <Panel title={<span className="font-mono">{open}</span>} icon={<Layers />}>
                <div className="px-4 py-3">
                  {(() => {
                    const p = data.presets.find((x: any) => x.id === open)
                    if (!p?.cordisExcerpt)
                      return (
                        <p className="text-muted-foreground text-sm">{t('cms-screens.presets.noCordis')}</p>
                      )
                    return (
                      <Code
                        path={p.path ?? `${p.dir}/agent.cordis.yml`}
                        lines={p.cordisExcerpt.lines}
                        totalLines={p.cordisExcerpt.totalLines}
                        truncated={p.cordisExcerpt.truncated}
                      />
                    )
                  })()}
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </SectionGate>
      <SourceList sources={snapshot.sections.presets?.sources ?? []} />
    </>
  )
}

/**
 * Try the rule — the bench from the approved drawing, wired to the ref rather than to a copy.
 *
 * 🔒 IT APPLIES THE RULE THE SNAPSHOT CARRIES, NOT ONE WRITTEN HERE. The three things that decide
 * the answer — the role list, the platform list and the fallback role — are read out of
 * `preset-for.mjs` at the selected commit, so switching Dev/Main switches the policy too. A copy
 * of the policy in this file would keep answering confidently after the policy moved, which is the
 * one failure a bench like this can have.
 *
 * 🔒 AND IT ONLY ANSWERS. No session is started, no preset is selected, nothing is written. The
 * panel says so, because a control that computes a real answer looks like a control that acts.
 */
function TryTheRule({ resolver }: { resolver: any }) {
  const t = useT()
  const readable = Boolean(resolver?.roles && resolver?.platforms && resolver?.fallbackRole)
  const sources: string[] = readable
    ? [
        ...resolver.roles.flatMap((r: string) => resolver.platforms.map((p: string) => `${r}-${p}`)),
        'standard',
        'plan'
      ]
    : []
  const [current, setCurrent] = useState(sources[0] ?? '')
  const [target, setTarget] = useState(readable ? resolver.platforms[0] : '')
  useEffect(() => {
    setCurrent(sources[0] ?? '')
    setTarget(readable ? resolver.platforms[0] : '')
  }, [resolver?.path, resolver?.roles?.join(','), resolver?.platforms?.join(',')])

  const answer = (() => {
    if (!readable) return null
    if (!resolver.platforms.includes(target)) return null
    const have = typeof current === 'string' ? current : ''
    const role =
      resolver.roles.find((r: string) => resolver.platforms.some((p: string) => have === `${r}-${p}`)) ??
      resolver.fallbackRole
    return `${role}-${target}`
  })()

  return (
    <Panel
      title={t('cms-screens.rule.title')}
      aside={<span className="font-mono text-muted-foreground text-xs">{resolver?.path}</span>}
    >
      {!readable ? (
        <p className="px-4 py-5 text-sm">{resolver?.unreadable ?? t('cms-screens.rule.unreadable')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 px-4 py-4">
            <label className="flex flex-col gap-1 text-muted-foreground text-xs">
              {t('cms-screens.rule.sessionOn')}
              <NativeSelect
                size="sm"
                className="w-[13rem]"
                aria-label={t('cms-screens.rule.source')}
                value={current}
                onChange={(e: { target: { value: string } }) => setCurrent(e.target.value)}
              >
                {sources.map((id) => (
                  <NativeSelectOption key={id} value={id}>
                    {id}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-muted-foreground text-xs">
              {t('cms-screens.rule.pressed')}
              <NativeSelect
                size="sm"
                className="w-[10rem]"
                aria-label={t('cms-screens.rule.target')}
                value={target}
                onChange={(e: { target: { value: string } }) => setTarget(e.target.value)}
              >
                {resolver.platforms.map((id: string) => (
                  <NativeSelectOption key={id} value={id}>
                    {id}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">{t('cms-screens.rule.wouldRun')}</span>
              <output
                aria-label={t('cms-screens.rule.resolved')}
                className="rounded-lg border border-border bg-muted px-3 py-1.5 font-mono text-sm"
              >
                {answer ?? 'null'}
              </output>
            </div>
          </div>
          <Separator />
          <p className="px-4 py-3 text-muted-foreground text-xs">
            <Trans
              i18nKey="cms-screens.rule.note"
              values={{ role: resolver.fallbackRole }}
              components={{ c: <span className="font-mono" /> }}
            />
          </p>
        </>
      )}
    </Panel>
  )
}

// ── M05 ──────────────────────────────────────────────────────────────────────────────────────

function Tools({ snapshot }: LoadedProps) {
  const t = useT()
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    fetchRuntime(ac.signal).then((r) => {
      if (ac.signal.aborted) return
      if (!r.ok) setRefusal(r.refusal)
      else setRuntime(r.value)
    })
    return () => ac.abort()
  }, [])

  return page(
    <>
      <ScreenHead title={t('cms-screens.tools.title')} sub={t('cms-screens.tools.sub')} />
      <SectionGate section={snapshot.sections.tools} what="tools">
        {(data: any) => (
          <>
            <Panel
              title={t('cms-screens.tools.fence')}
              icon={<Wrench />}
              aside={<span className="font-mono text-muted-foreground text-xs">{data.fence?.path}</span>}
            >
              {!data.fence ? (
                <p className="px-4 py-5 text-sm">{t('cms-screens.tools.noFence')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('cms-screens.tools.col.tool')}</TableHead>
                        <TableHead>{t('cms-screens.tools.col.paths')}</TableHead>
                        <TableHead>{t('cms-screens.tools.col.content')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.fence.tools.map((tool: any) => (
                        <TableRow key={tool.name}>
                          <TableCell className="font-mono text-sm">{tool.name}</TableCell>
                          <TableCell className="whitespace-normal font-mono text-xs">
                            {tool.paths.join(', ') || '—'}
                          </TableCell>
                          <TableCell className="whitespace-normal font-mono text-xs">
                            {tool.content.join(', ') || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>

            {data.contentContract ? (
              <Panel title={t('cms-screens.tools.contract')} icon={<Lock />}>
                <div className="px-4 py-3">
                  {data.contentContract.dbWriteRefusal ? (
                    <>
                      <Fact label={t('cms-screens.tools.refuses')}>{t('cms-screens.tools.refusesText')}</Fact>
                      <Fact label={t('cms-screens.tools.toldDb')}>
                        <span className="block rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs">
                          {data.contentContract.dbWriteRefusal}
                        </span>
                      </Fact>
                    </>
                  ) : (
                    <>
                      <Fact label={t('cms-screens.tools.mayCall')}>
                        {[
                          ...(data.contentContract.fileTools ?? []),
                          ...(data.contentContract.doorTools ?? [])
                        ].join(', ') || t('cms-screens.tools.notReadable')}
                      </Fact>
                      <Fact label={t('cms-screens.tools.writable')}>
                        {data.contentContract.draftsOnly ? (
                          <span className="font-mono">{DRAFTS_AREA}</span>
                        ) : (
                          <span className="text-muted-foreground">{t('cms-screens.tools.notNarrowed')}</span>
                        )}
                      </Fact>
                      <Fact label={t('cms-screens.tools.toldTool')}>
                        {data.contentContract.toolRefusal ? (
                          <span className="block rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs">
                            {data.contentContract.toolRefusal}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('cms-screens.tools.notReadableShort')}
                          </span>
                        )}
                      </Fact>
                      <Fact label={t('cms-screens.tools.toldPath')}>
                        {data.contentContract.pathRefusal ? (
                          <span className="block rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs">
                            {data.contentContract.pathRefusal}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('cms-screens.tools.notReadableShort')}
                          </span>
                        )}
                      </Fact>
                    </>
                  )}
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </SectionGate>

      <Panel
        title={t('cms-screens.tools.observed')}
        aside={runtime ? <StatusChip status={runtime.status} /> : null}
      >
        {refusal ? (
          <div className="px-4 py-4">
            <RefusalNotice refusal={refusal} />
          </div>
        ) : !runtime ? (
          <LoadingRows rows={2} label={t('cms-screens.tools.asking')} />
        ) : (
          <div className="px-4 py-3">
            <Fact label={t('cms-screens.tools.observedAt')}>{runtime.observedAt}</Fact>
            <Fact label={t('cms-screens.tools.asked')}>
              <Trans
                i18nKey="cms-screens.tools.askedText"
                components={{ c: <span className="font-mono" /> }}
              />
            </Fact>
            {runtime.reason ? <Fact label={t('cms-screens.tools.result')}>{runtime.reason}</Fact> : null}
            {/*
              🔒 A HOST THAT DID NOT ANSWER KEEPS ITS OWN ROW. The inventory returns one entry per
              configured host whether or not it replied, and the first version of this panel printed
              `h.id` — a field the payload does not have — so every host rendered as "unnamed" and a
              failed one was indistinguishable from a healthy one. A host that is down is a fact
              about that host, not an absence of configuration.
            */}
            {Array.isArray(runtime.hosts) && runtime.hosts.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cms-screens.tools.col.host')}</TableHead>
                      <TableHead>{t('cms-screens.tools.col.answered')}</TableHead>
                      <TableHead>{t('cms-screens.tools.col.image')}</TableHead>
                      <TableHead>{t('cms-screens.tools.col.whyNot')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runtime.hosts.map((h: any) => (
                      <TableRow key={String(h.host ?? h.id ?? Math.random())}>
                        <TableCell className="font-mono text-xs">{String(h.host ?? h.id ?? '—')}</TableCell>
                        <TableCell>
                          <StatusChip status={h.ok ? 'ok' : h.error ? 'unavailable' : 'unknown'} />
                        </TableCell>
                        <TableCell className="whitespace-normal font-mono text-[11px]">
                          {imageOf(h.image)}
                        </TableCell>
                        <TableCell className="max-w-[22rem] whitespace-normal text-xs">
                          {h.error ?? (h.ok ? '—' : t('cms-screens.tools.noReason'))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
      <SourceList sources={snapshot.sections.tools?.sources ?? []} />
    </>
  )
}

// ── M06 ──────────────────────────────────────────────────────────────────────────────────────

function Questions({ snapshot, cms }: LoadedProps) {
  const t = useT()
  const rows = (questions: any[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0">#</TableHead>
            <TableHead>{t('cms-screens.questions.col.question')}</TableHead>
            <TableHead>{t('cms-screens.questions.col.kind')}</TableHead>
            <TableHead>{t('cms-screens.questions.col.options')}</TableHead>
            <TableHead>{t('cms-screens.questions.col.readBy')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q: any, i: number) => (
            <TableRow key={q.id}>
              <TableCell className="tabular-nums">{i + 1}</TableCell>
              <TableCell className="min-w-[14rem] whitespace-normal">
                <span className="text-sm">{q.label ?? q.id}</span>
                <span className="ms-2 font-mono text-[11px] text-muted-foreground">{q.id}</span>
                {q.hint ? <p className="text-muted-foreground text-xs">{q.hint}</p> : null}
              </TableCell>
              <TableCell className="font-mono text-xs">{q.kind ?? '—'}</TableCell>
              <TableCell className="max-w-[16rem] whitespace-normal text-xs">
                {q.options ? q.options.join(', ') : '—'}
              </TableCell>
              <TableCell className="font-mono text-[11px]">{(q.feeds ?? []).join(' · ') || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
  return page(
    <>
      <ScreenHead title={t('cms-screens.questions.title')} sub={t('cms-screens.questions.sub')} />
      <SectionGate section={snapshot.sections.questions} what="questions">
        {(data: any) => {
          const own = data.byCms?.[cms]
          const mine: any[] = (data.byQuickstart ?? []).filter((q: any) => q.platform === cms)
          return (
            <>
              <Panel
                title={t('cms-screens.questions.defaults', { cms: CMS_LABEL[cms] })}
                icon={<MessageSquareText />}
                aside={
                  own?.status === 'ok' ? (
                    <span className="font-mono text-muted-foreground text-xs">
                      {own.path} · {own.languages.join(', ')}
                    </span>
                  ) : (
                    <StatusChip status={own?.status ?? 'unknown'} />
                  )
                }
              >
                {own?.status === 'ok' ? (
                  rows(own.questions)
                ) : (
                  <p className="px-4 py-5 text-sm">
                    {own?.reason ?? t('cms-screens.questions.silent', { cms: CMS_LABEL[cms] })}
                  </p>
                )}
                <Separator />
                <p className="px-4 py-3 text-muted-foreground text-xs">
                  {t('cms-screens.questions.readOnly')}
                </p>
              </Panel>

              <Panel title={t('cms-screens.questions.quickstarts', { cms: CMS_LABEL[cms] })}>
                {mine.length === 0 ? (
                  <p className="px-4 py-5 text-sm">
                    {t('cms-screens.questions.noQuickstart', { cms: CMS_LABEL[cms] })}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {mine.map((q: any) => (
                      <li key={q.id} className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {q.id}
                          </Badge>
                          {q.own ? (
                            <span className="text-xs">
                              {t('cms-screens.questions.ownSet', { count: q.count })} ·{' '}
                              {q.languages.join(', ')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {t('cms-screens.questions.fallsBack', { cms: CMS_LABEL[cms] })}
                            </span>
                          )}
                        </div>
                        {q.own ? rows(q.questions) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title={t('cms-screens.questions.whoReads')}>
                <ul className="divide-y divide-border">
                  {Object.entries(data.feeds ?? {}).map(([feed, where]) => (
                    <li key={feed} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
                      <span className="w-36 font-mono">{feed}</span>
                      <span className="text-muted-foreground">{String(where)}</span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <p className="px-4 py-3 text-muted-foreground text-xs">
                  {t('cms-screens.questions.feedNote')}
                </p>
              </Panel>
              <SourceList sources={snapshot.sections.questions?.sources ?? []} />
            </>
          )
        }}
      </SectionGate>
    </>
  )
}
