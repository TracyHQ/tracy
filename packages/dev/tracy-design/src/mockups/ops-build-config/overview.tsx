/**
 * M01 · Website builds — one panel per CMS, seven rows of configuration inside each.
 *
 * 🔒 THE UNIT IS THE CMS (Lee, 12/09). An earlier draft put the configuration AREA on the outside —
 * seven sections, three CMS side by side in each — on the theory that the common question is
 * "who has a template and who does not". Lee's answer is that people arrive holding a CMS, so the
 * CMS is the heading and the seven areas are what you read down.
 *
 * WHAT THE OLD SHAPE WAS GOOD AT IS KEPT AS ONE LINE, NOT AS A LAYOUT: each panel opens with a
 * count — how many of the seven are ready on this CMS — so the three panels can still be compared
 * at a glance without three columns to do it.
 *
 * EMPTY PANELS ARE DRAWN IN FULL. EmDash carries almost nothing and still gets all seven rows, for
 * the reason `CmsAgents` gives about empty platform columns: a screen that hides what is missing
 * reports a roster that is ready when it is not.
 *
 * NO PERCENTAGES, NO PROGRESS BARS. A percentage of an unknown is an invention, and every number
 * here would be one. A row says a state, a reason, and the steps still missing.
 */
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, PlatformGlyph } from '@tracy/ui'
import { ChevronDown, ExternalLink, FileCode2 } from 'lucide-react'

import { SCREEN_LABEL, useOps } from './app'
import {
  AREAS,
  CMS_LABEL,
  CMS_LIST,
  DESIGN_SYSTEM_COUNT,
  GRID,
  SURVEYED,
  type AreaId,
  type Cell,
  type Cms
} from './fixtures'
import { LayerLine, MissingSteps, Panel, ProvenanceTag, ScreenHead, StatusChip } from './parts'

export function Overview() {
  const ops = useOps()
  const grid = GRID[ops.env]

  return (
    <div className="flex w-full flex-col gap-5 px-6 py-6">
      <ScreenHead
        title="Website builds"
        sub={
          <>
            One panel per CMS, seven pieces of configuration in each. Every row says what is configured, what
            is packaged, what anybody has actually seen running — and, when a build stops, the step that is
            missing rather than a number.
          </>
        }
      />

      <Collapsible>
        <CollapsibleTrigger render={<Button variant="outline" size="sm" />} className="w-fit">
          <FileCode2 />
          Where these values came from
          <ChevronDown />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-lg border border-border px-4 py-3">
            <p className="text-muted-foreground text-xs">
              Copied by hand on 12/09/2026 from <span className="font-mono">develop @ d0da35c55</span>.
              Nothing on this screen fetches anything. The design catalogue is {DESIGN_SYSTEM_COUNT} systems,
              counted in both <span className="font-mono">inspirations.json</span> files — the tables below
              show samples, and each says so.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {SURVEYED.map((s) => (
                <li key={s.path} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-mono text-foreground/80">{s.path}</span>
                  <span className="text-muted-foreground">— {s.gives}</span>
                </li>
              ))}
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {CMS_LIST.map((cms) => {
        const ready = AREAS.filter((a) => grid[a.id][cms].status === 'ready').length
        return (
          <Panel
            key={cms}
            // 🔒 THE GLYPH GOES IN THE ICON SLOT, NOT INSIDE THE HEADING. Inside it, its letter
            // joins the accessible name and the panel announces itself as "J Joomla".
            icon={<PlatformGlyph platform={cms} />}
            title={CMS_LABEL[cms]}
            aside={
              <span className="text-muted-foreground text-xs tabular-nums">
                {ready} of {AREAS.length} ready
              </span>
            }
          >
            <ul className="divide-y divide-border">
              {AREAS.map((area) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  cms={cms}
                  cell={grid[area.id][cms]}
                  onOpen={() => ops.go(area.goto, { cms, focus: area.label, from: 'overview' })}
                />
              ))}
            </ul>
          </Panel>
        )
      })}

      <p className="text-muted-foreground text-xs">
        The three panels carry the same seven rows on purpose, so a row can be compared across CMS by
        scrolling rather than by remembering. The counts above each panel are the short version of that
        comparison.
      </p>
    </div>
  )
}

function AreaRow({
  area,
  cms,
  cell,
  onOpen
}: {
  area: { id: AreaId; label: string; blurb: string; goto: Parameters<ReturnType<typeof useOps>['go']>[0] }
  cms: Cms
  cell: Cell
  onOpen: () => void
}) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-start md:gap-4">
      <div className="flex min-w-0 flex-none flex-col gap-0.5 md:w-56">
        <span className="font-medium text-sm">{area.label}</span>
        <span className="text-muted-foreground text-xs">{area.blurb}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={cell.status} />
          <span className="font-medium text-sm">{cell.headline}</span>
        </div>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{cell.reason}</p>
        <MissingSteps steps={cell.missing} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <LayerLine layers={cell.layers} />
          <ProvenanceTag of={cell.provenance} />
        </div>
      </div>
      <div className="flex-none">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          aria-label={`${CMS_LABEL[cms]} · ${area.label} — open ${SCREEN_LABEL[area.goto]}`}
        >
          Open
          <ExternalLink />
        </Button>
      </div>
    </li>
  )
}
