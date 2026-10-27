/**
 * CMS agents — the matrix, read as four agents.
 *
 * WHAT THIS SCREEN DECIDES. A dsh session is composed from exactly one preset, so an agent a
 * customer picks has to be one flat preset id. Tracy wants two axes instead: a role (what the agent
 * is for) and a platform (which CMS it works on). This screen is where the two meet: every cell is
 * one of the twelve presets `scripts/gen-presets.ts` writes.
 *
 * WHY THE ROWS ARE EDITABLE HERE AND NOT ON THE PRESET SCREEN. This screen reads
 * `tasks/mode-matrix.json` — the source, the thing people write. The preset screen reads the files
 * generated from it. Editing a generated file makes the two disagree with nothing to notice.
 *
 * 🔒 BUT "EDITABLE" IS NOT "IN EFFECT". ADR 0008: the route to a customer is the image. So the
 * button at the end of an edit says **Create pull request**, not Save — the change waits in a PR
 * and travels with the next image. A Save button here would promise the opposite, and the person
 * pressing it would walk away believing customers had it.
 *
 * WHY THE PLATFORM SITS ABOVE THE LIST, NOT INSIDE EACH AGENT. The platform is one choice that
 * re-reads all four agents at once — a person works on a WordPress site, not on a WordPress
 * Designer and a Joomla Writer in the same breath.
 *
 * WHY EMPTY COLUMNS ARE DRAWN, NOT HIDDEN. Joomla and Emdash carry no rows, and SEO/GEO borrows
 * every skill it has. Both facts are the point: this is what the library is missing, and a screen
 * that hid them would report a roster that is ready when it is not.
 */
import { Badge, Button, Card, cn, PlatformGlyph } from '@tracy/ui'
import {
  ArrowRight,
  Code2,
  ExternalLink,
  FileCode2,
  Grid3x3,
  Layers,
  Palette,
  PenLine,
  Rows3,
  TrendingUp,
  Wrench
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type T, Trans, useLanguage, useT } from './i18n'
import { MatrixGrid } from './MatrixGrid'
import {
  overlays,
  type PlatformId,
  personas,
  platforms,
  type RoleId,
  resolve,
  roleLabel,
  roles,
  skillRows,
  toolRows
} from './matrix'
import { RowList } from './RowList'

const REPO = 'https://github.com/TracyHQ/tch/blob/main'
const MATRIX_FILE = 'tasks/mode-matrix.json'

const ROLE_ICON: Record<RoleId, ReactNode> = {
  designer: <Palette />,
  developer: <Code2 />,
  writer: <PenLine />,
  'seo-geo': <TrendingUp />
}

type ViewId = 'roster' | 'matrix'

const VIEWS: readonly { id: ViewId; icon: ReactNode }[] = [
  { id: 'roster', icon: <Rows3 /> },
  { id: 'matrix', icon: <Grid3x3 /> }
]

/**
 * What the chosen platform adds, and which of the others add nothing.
 *
 * Naming the empty ones is the whole line: the card shows one platform at a time, so without this
 * a reader would have to click through the three to learn that two are empty.
 */
function emptiness(platform: PlatformId, t: T, lang: string) {
  const size = (p: PlatformId) => {
    const tools = toolRows.filter((r) => r.platforms[p] === true)
    const skills = skillRows.filter((r) => r.platforms[p] === true)
    const files = overlays[p]?.prompts ?? []
    return { tools, skills, files, total: tools.length + skills.length + files.length }
  }
  const here = size(platform)
  const label = platforms.find((p) => p.id === platform)?.label ?? platform
  const adds =
    here.total === 0
      ? t('agents.cms.addsNothing', { count: 1, names: label })
      : t('agents.cms.adds', {
          platform: label,
          tools: t('agents.cms.tools', { count: here.tools.length }),
          skills: t('agents.cms.skills', { count: here.skills.length }),
          files: t('agents.cms.files', { count: here.files.length })
        })
  const bare = platforms.filter((p) => p.id !== platform && size(p.id).total === 0).map((p) => p.label)
  if (bare.length === 0) return adds
  const names = new Intl.ListFormat(lang, { type: 'conjunction' }).format(bare)
  return `${adds} ${t('agents.cms.addsNothing', { count: bare.length, names })}`
}

export function CmsAgents({
  role = 'designer',
  platform = 'wordpress',
  view = 'roster',
  onOpenPreset
}: {
  role?: RoleId
  platform?: PlatformId
  view?: ViewId
  onOpenPreset?: (role: RoleId, platform: PlatformId) => void
}) {
  const t = useT()
  const { lang } = useLanguage()
  const [selected, setSelected] = useState<RoleId>(role)
  const [plat, setPlat] = useState<PlatformId>(platform)
  const [mode, setMode] = useState<ViewId>(view)
  const [off, setOff] = useState<readonly string[]>([])

  const { tools, skills } = resolve(selected, plat)
  const toggle = (id: string, on: boolean) =>
    setOff((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-lg tracking-tight">{t('agents.cms.title')}</h1>
          <p className="mt-0.5 text-muted-foreground text-sm">{t('agents.cms.intro')}</p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setMode(v.id)}
                aria-pressed={v.id === mode}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
                  '[&_svg]:size-3.5',
                  v.id === mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v.icon}
                {t(`agents.cms.view.${v.id}`)}
              </button>
            ))}
          </div>
          {/* 🔒 THE FILE THIS SCREEN IS A READING OF, named where a reader meets it. The preset
              screen has the same affordance for its own file; without it the matrix would be the
              one source with no way to reach it, and somebody would search the wrong repository. */}
          <Button
            variant="outline"
            size="sm"
            // A link wearing a button's clothes: without this base-ui expects a native <button> and

            // warns in the console on every render.

            nativeButton={false}
            render={<a href={`${REPO}/${MATRIX_FILE}`} target="_blank" rel="noreferrer" />}
          >
            <FileCode2 />
            {MATRIX_FILE}
            <ExternalLink />
          </Button>
        </div>
      </div>

      {/* Only when something actually changed. A permanent bar would be furniture; this one is a
          statement about the state of the screen. */}
      {off.length > 0 ? (
        <Card className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 border-primary/40 px-5 py-3">
          <span className="font-medium text-sm">{t('agents.cms.switchedOff', { count: off.length })}</span>
          <span className="min-w-0 flex-1 text-muted-foreground text-xs">
            <Trans
              i18nKey="agents.cms.pending"
              values={{ file: MATRIX_FILE }}
              components={{ code: <span className="font-mono" /> }}
            />
          </span>
          <Button variant="ghost" size="sm" onClick={() => setOff([])}>
            {t('agents.cms.discard')}
          </Button>
          <Button size="sm" disabled>
            {t('agents.cms.createPr')}
            <Badge variant="secondary" className="ms-1 font-normal">
              {t('agents.cms.comingSoon')}
            </Badge>
          </Button>
        </Card>
      ) : null}

      {mode === 'matrix' ? (
        <MatrixGrid />
      ) : (
        <>
          <Card className="flex flex-row flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{t('agents.cms.platform')}</div>
              <p className="mt-0.5 text-muted-foreground text-xs">{emptiness(plat, t, lang)}</p>
            </div>
            <div className="flex flex-none gap-1 rounded-lg bg-muted p-[3px]">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlat(p.id)}
                  aria-pressed={p.id === plat}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
                    p.id === plat
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {/* @tracy/ui has colours for two platforms; Emdash falls back to its letter. */}
                  <PlatformGlyph platform={p.id === 'emdash' ? null : p.id} letter={p.letter} />
                  {p.label}
                </button>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <Card className="h-fit gap-0 overflow-hidden py-0">
              {roles.map((r) => {
                const counts = resolve(r.id, plat)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      'flex w-full items-center gap-3 border-border border-b px-4 py-3 text-left last:border-b-0',
                      r.id === selected && 'bg-accent'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 flex-none items-center justify-center rounded-lg [&_svg]:size-4',
                        r.id === selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {ROLE_ICON[r.id]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-sm">{roleLabel(r, t)}</span>
                      <span className="block text-muted-foreground text-xs tabular-nums">
                        {t('agents.cms.tools', { count: counts.tools.length })} ·{' '}
                        {t('agents.cms.skills', { count: counts.skills.length })}
                      </span>
                    </span>
                    {/* Persona is the one thing that differs per agent and is missing on most of
                        them. Saying it here is what makes the column worth reading down. */}
                    {personas[r.id]?.trim() ? null : (
                      <Badge variant="outline" className="ms-auto flex-none font-normal">
                        {t('agents.cms.noPersona')}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </Card>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="font-semibold text-base tracking-tight">
                  {t('agents.cms.roleFor', {
                    role: roleLabel(
                      roles.find((r) => r.id === selected) ?? { id: selected, label: selected, hint: '' },
                      t
                    ),
                    platform: platforms.find((p) => p.id === plat)?.label ?? plat
                  })}
                </h2>
                <Badge variant="outline" className="font-mono">
                  {selected}-{plat}
                </Badge>
                {/* The one door to the other screen, carrying the pair already chosen. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  onClick={() => onOpenPreset?.(selected, plat)}
                >
                  {t('agents.cms.openPreset')}
                  <ArrowRight />
                </Button>
              </div>

              <RowList
                title={t('agents.cms.toolsTitle')}
                icon={<Wrench />}
                rows={tools}
                kind="tool"
                platform={plat}
                editable
                off={off}
                onToggle={toggle}
              />
              <RowList
                title={t('agents.cms.skillsTitle')}
                icon={<Layers />}
                rows={skills}
                kind="skill"
                platform={plat}
                editable
                off={off}
                onToggle={toggle}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
