/**
 * M03 · Quickstarts & templates — what a site is built out of, and which design systems can reach it.
 *
 * THE TABLE HAS FOUR COLUMNS THAT ARE USUALLY ONE. Requested design, base, template to install,
 * effective design. They collapse into one only when everything works; the rows worth drawing are
 * the ones where they differ, and a single "design" column would hide exactly those.
 *
 * TWO WAYS A TEMPLATE CAN BE ABSENT, AND THEY DO NOT SHARE A LABEL. `Missing configuration` means
 * no package is declared — somebody has to author one. `Error` means the package is declared,
 * pinned and reachable, and the download failed — somebody has to look at the release. Giving
 * both the same red chip would send the same person to the wrong place half the time.
 */
import {
  Badge,
  Button,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { Boxes, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useOps } from './app'
import { CMS_LABEL, DESIGN_SYSTEM_COUNT, STATUS_LABEL, type Status } from './fixtures'
import { BASES, MAPPINGS, type Base, type Mapping } from './screen-data'
import { Code, Fact, NoResults, Panel, ProvenanceTag, ScreenHead, StatusChip, TextField } from './parts'

const FILTERS: readonly { id: Status | 'all'; label: string }[] = [
  { id: 'all', label: 'Every status' },
  { id: 'ready', label: STATUS_LABEL.ready },
  { id: 'pending', label: STATUS_LABEL.pending },
  { id: 'missing', label: STATUS_LABEL.missing },
  { id: 'error', label: STATUS_LABEL.error }
]

function mb(bytes: number | null): string {
  if (bytes === null) return '—'
  return bytes > 1_000_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

export function Catalog() {
  const ops = useOps()
  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [openBase, setOpenBase] = useState<Base | null>(null)
  const [openRow, setOpenRow] = useState<Mapping | null>(null)

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase()
    return MAPPINGS.filter(
      (m) =>
        (filter === 'all' || m.status === filter) &&
        (needle === '' ||
          m.design.includes(needle) ||
          m.designLabel.toLowerCase().includes(needle) ||
          CMS_LABEL[m.cms].toLowerCase().includes(needle))
    )
  }, [term, filter])

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Quickstarts &amp; templates"
        sub={
          <>
            The base a site is restored from, and the mapping from a requested design inspiration to something
            installable. The catalogue holds {DESIGN_SYSTEM_COUNT} design systems; the table below is a sample
            of {MAPPINGS.length} rows chosen to show every outcome.
          </>
        }
      />

      <Panel title="Bases" icon={<Boxes />}>
        <ul className="divide-y divide-border">
          {BASES.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <Badge variant="outline" className="font-mono">
                {b.id}
              </Badge>
              <span className="text-sm">{b.version}</span>
              <Badge variant="secondary" className="font-normal">
                {CMS_LABEL[b.cms]}
              </Badge>
              <span className="text-muted-foreground text-xs">cowork {b.cowork}</span>
              <span className="font-mono text-muted-foreground text-xs">{b.contract}</span>
              <StatusChip status={b.status} />
              <Button
                variant="ghost"
                size="sm"
                className="ms-auto"
                onClick={() => setOpenBase(b)}
                aria-label={`Artifacts and checksums for ${b.id}`}
              >
                Artifacts &amp; checksums
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Design inspiration → template"
        aside={
          <>
            <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Search className="size-3.5" aria-hidden />
              <TextField
                className="h-8 w-[12rem]"
                placeholder="Search designs"
                aria-label="Search designs"
                value={term}
                onValue={setTerm}
              />
            </label>
            <NativeSelect
              size="sm"
              className="w-[11rem]"
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Status | 'all')}
            >
              {FILTERS.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>
                  {f.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="text-muted-foreground text-xs tabular-nums">
              {rows.length} of {MAPPINGS.length} sample rows
            </span>
          </>
        }
      >
        {rows.length === 0 ? (
          <NoResults
            term={term}
            onClear={() => {
              setTerm('')
              setFilter('all')
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested design</TableHead>
                  <TableHead>CMS</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Template to install</TableHead>
                  <TableHead>Effective design</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={`${m.cms}-${m.design}`}>
                    <TableCell className="font-medium">{m.designLabel}</TableCell>
                    <TableCell>{CMS_LABEL[m.cms]}</TableCell>
                    <TableCell className="font-mono text-xs">{m.base}</TableCell>
                    <TableCell className="max-w-[16rem] whitespace-normal text-xs">
                      {m.template ?? <span className="text-muted-foreground">None declared</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.effective ?? <span className="text-muted-foreground">Build refuses</span>}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={m.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenRow(m)}
                        aria-label={`Why ${m.designLabel} on ${CMS_LABEL[m.cms]} is ${STATUS_LABEL[m.status]}`}
                      >
                        Why
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <p className="text-muted-foreground text-xs">
        Looking at {CMS_LABEL[ops.cms]} because that is what the previous screen carried. Changing CMS is done
        on the build flow screen, so there is one place that owns it.
      </p>

      <Sheet open={openBase !== null} onOpenChange={(open) => !open && setOpenBase(null)}>
        <SheetContent closeLabel="Close" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{openBase?.id}</SheetTitle>
            <SheetDescription>
              {openBase?.version} · {openBase ? CMS_LABEL[openBase.cms] : ''}
            </SheetDescription>
          </SheetHeader>
          {openBase ? (
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              <Fact label="Contract">{openBase.contract}</Fact>
              <Fact label="Cowork">{openBase.cowork}</Fact>
              <Fact label="Compatibility">{openBase.compat}</Fact>
              <div className="mt-3 flex flex-col gap-3">
                {openBase.artifacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No artifacts declared.</p>
                ) : (
                  openBase.artifacts.map((a) => (
                    <div key={a.name} className="rounded-lg border border-border px-3 py-2">
                      <p className="font-mono text-xs">{a.name}</p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {a.kind} · {mb(a.bytes)}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">{a.source}</p>
                      {/* 🔒 NO INVENTED HASHES. A row with no real sha256 says so rather than
                          showing something that looks like one — a fake checksum on a screen
                          about integrity is the worst possible fixture. */}
                      {a.sha256 ? (
                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                          sha256 {a.sha256}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          No checksum in the source — nothing invented here.
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={openRow !== null} onOpenChange={(open) => !open && setOpenRow(null)}>
        <SheetContent closeLabel="Close" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {openRow?.designLabel} on {openRow ? CMS_LABEL[openRow.cms] : ''}
            </SheetTitle>
            <SheetDescription>{openRow ? STATUS_LABEL[openRow.status] : ''}</SheetDescription>
          </SheetHeader>
          {openRow ? (
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <StatusChip status={openRow.status} />
                <ProvenanceTag of={openRow.provenance} />
              </div>
              <Fact label="Why">{openRow.reason}</Fact>
              <Fact label="Base">{openRow.base}</Fact>
              <Fact label="Template">{openRow.template ?? 'None declared'}</Fact>
              <Fact label="What the customer would get">
                {openRow.effective ?? 'Nothing — the build refuses'}
              </Fact>
              {openRow.provenance === 'planned' ? (
                <div className="mt-3 rounded-lg border border-border border-dashed px-3 py-2">
                  <p className="font-medium text-sm">This row describes a plan, not behaviour</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    `tasks/plan-joomla-base-template-selection.md`, handed over 12/09 and not implemented.
                    Today the build refuses instead of falling back, and the refusal happens after the
                    customer has already chosen.
                  </p>
                </div>
              ) : null}
              {openRow.status === 'pending' && openRow.design === 'airbnb' ? (
                <div className="mt-3">
                  <Code
                    path="packages/site/tracy-site-build-joomla/src/host/capabilities.json"
                    excerpt
                    body={`"tracy-airbnb-j6": {
  "version": "1.0.0",
  "platformMajors": [6],
  "requires": ["joomla-content"],
  "recipe": "design.apply",
  "verification": "tracy-airbnb.design",
  "state": "pending",
  "artifact": "tracy-airbnb-j6-1.0.0",
  "reason": "This change requires a separately versioned quickstart content and display contract."
}`}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
