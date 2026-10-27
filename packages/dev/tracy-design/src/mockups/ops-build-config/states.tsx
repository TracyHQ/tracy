/**
 * Every state these screens can be in, on one page.
 *
 * WHY A GALLERY RATHER THAN ONE STORY PER STATE. Eight states across seven screens is fifty-six
 * stories nobody opens. The thing a reviewer must actually judge is whether the eight are
 * DISTINGUISHABLE from each other — and that can only be judged side by side. Each entry names
 * where it appears in the flow, so this page stays a legend rather than becoming a second product.
 *
 * EVERY STATE CARRIES WORDS. Not one of them is a bare colour, and the two that look alike from a
 * terminal — `Missing configuration` and `Not verified` — sit next to each other here on purpose:
 * one means nobody wrote it, the other means nobody looked.
 */
import { Badge, Button } from '@tracy/ui'
import { RefreshCcw } from 'lucide-react'

import { STATUS_LABEL, type Status } from './fixtures'
import { LayerLine, LoadingRows, NoResults, Panel, ProvenanceTag, ScreenHead, StatusChip } from './parts'

const MEANINGS: readonly { status: Status; means: string; seenOn: string }[] = [
  {
    status: 'ready',
    means: 'Configured, packaged, and somebody has seen it answer.',
    seenOn: 'Overview · Joomla base'
  },
  {
    status: 'not-verified',
    means:
      'It may be perfect. Nobody has observed it on a running surface, so the running column is unknown.',
    seenOn: 'Overview on QA · verification row on every CMS'
  },
  {
    status: 'missing',
    means: 'Nobody has written this configuration. The repair is to author it.',
    seenOn: 'Contracts · WordPress'
  },
  {
    status: 'pending',
    means: 'Declared and deliberately not finished — a provider marked pending, a CMS with no flow.',
    seenOn: 'Templates · Airbnb on Joomla'
  },
  {
    status: 'blocked',
    means: 'Everything is present and a rule stops it anyway. The rule is named where this appears.',
    seenOn: 'Build flow · Choose design on Joomla'
  },
  {
    status: 'mismatch',
    means:
      'Two versions disagree — repo against host, or contract against what the Claude Cowork plugin reports.',
    seenOn: 'Overview on Dev · base row'
  },
  {
    status: 'error',
    means: 'Something ran and failed. Different from missing: the thing exists, the attempt broke.',
    seenOn: 'Templates · a download that answered 404'
  },
  {
    status: 'loading',
    means: 'The page is fetching. Rows are skeletons, never a spinner over stale numbers.',
    seenOn: 'Every table on first paint'
  }
]

export function States() {
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="States"
        sub="The eight a cell can be in, what each one means, and where it shows up. A legend, not a screen of the product."
      />

      <Panel title="The eight">
        <ul className="divide-y divide-border">
          {MEANINGS.map((m) => (
            <li key={m.status} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
              <span className="w-44 flex-none">
                <StatusChip status={m.status} />
              </span>
              <span className="min-w-0 flex-1 text-sm">{m.means}</span>
              <span className="text-muted-foreground text-xs">{m.seenOn}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Loading">
        <LoadingRows />
      </Panel>

      <Panel title="No search results">
        <NoResults term="tailwind" onClear={() => {}} />
      </Panel>

      <Panel title="The three layers, in every combination that occurs">
        <ul className="divide-y divide-border">
          {[
            {
              label: 'In the repo, built, and seen running',
              layers: { repo: 'yes', packaged: 'yes', running: 'yes' }
            },
            {
              label: 'In the repo, built, never observed — this is Not verified, not Missing',
              layers: { repo: 'yes', packaged: 'yes', running: 'unknown' }
            },
            {
              label: 'In the repo, never built — the host is still serving the old one',
              layers: { repo: 'yes', packaged: 'no', running: 'yes' }
            },
            { label: 'Nowhere yet', layers: { repo: 'no', packaged: 'no', running: 'no' } }
          ].map((r) => (
            <li key={r.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <LayerLine layers={r.layers as never} />
              <span className="text-muted-foreground text-sm">{r.label}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Where a value came from">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <ProvenanceTag of="surveyed" />
          <ProvenanceTag of="planned" />
          <ProvenanceTag of="simulated" />
          <span className="text-muted-foreground text-xs">
            A planned row describes a document, not behaviour. A simulated row describes nothing at all — it
            is there so a shape can be judged.
          </span>
        </div>
      </Panel>

      <Panel title="Buttons that cannot do anything say why">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Button size="sm" disabled>
            Apply to the fleet
            <Badge variant="secondary" className="ms-1 font-normal">
              Not wired up
            </Badge>
          </Button>
          <Button variant="outline" size="sm" disabled>
            <RefreshCcw />
            Re-read the hosts
            <Badge variant="secondary" className="ms-1 font-normal">
              No API yet
            </Badge>
          </Button>
          <span className="text-muted-foreground text-xs">
            No control on these screens pretends to have written anything. There is no Save, and no toast
            claiming a deploy.
          </span>
        </div>
      </Panel>

      <p className="text-muted-foreground text-xs">
        Labels come from one table — <span className="font-mono">STATUS_LABEL</span> — so a state cannot be
        called two things on two screens. {Object.keys(STATUS_LABEL).length} entries.
      </p>
    </div>
  )
}
