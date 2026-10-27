/**
 * M07 · Contracts & files — what a built site will let an agent change, read three ways.
 *
 * READING · FILE · DIFF, and each answers a question the other two answer badly. The reading is
 * fast and is an interpretation. The file never drifts and is 800 KB of records nobody can read.
 * The diff is the only one that answers "would this particular change go through", which is the
 * question somebody actually arrives with.
 *
 * THE LOCK TABLE PUTS POSITION AND ACCESS NEXT TO THE EDITABLE FIELDS, on one row, because that
 * is the sentence: you may rewrite this module's words, and you may not move it or change who
 * sees it. Split across a table and a drawer, the two halves get read a day apart.
 *
 * WORDPRESS HAS NO CONTRACT AND THE SCREEN SAYS SO RATHER THAN DRAWING AN EMPTY TABLE. An empty
 * table reads as "nothing is locked yet"; the truth is that nothing was ever written, and the
 * limits on a WordPress site come from the sandbox instead.
 */
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NativeSelect,
  NativeSelectOption,
  Separator,
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
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn
} from '@tracy/ui'
import { Ban, Check, ScrollText, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { useOps } from './app'
import { CMS_LABEL } from './fixtures'
import { BINDING, CHANGES, ENTITY_KINDS, LOCK_ROWS, SLOTS, type LockRow } from './screen-data'
import { Code, Fact, Panel, ProvenanceTag, ScreenHead, StatusChip } from './parts'

const MANIFEST = `{
  "schemaVersion": "tracy-quickstart-contract/v1",
  "id": "tracy-apple/j6/1.1.0",
  "platform": "joomla",
  "template": "tracy",
  "quickstart": {
    "release": "tracy-apple/j6",
    "version": "1.1.0",
    "platformVersion": "6.1.1",
    "coworkVersion": "0.13.0",
    "writeDoor": "disabled-until-provision"
  },
  "coworkContractVersion": "0.14.0",
  "mode": "content-recommendation"
}`

const CONTENT_MAP = `{
  "entities": [
    {
      "key": "module-169",
      "kind": "module",
      "identity": {
        "title": "[Tracy Apple] Chrome - Mobile menu",
        "module": "mod_menu",
        "position": "off-canvas",
        "language": "*",
        "client_id": "0"
      },
      "sourceId": 169
    }
  ]
}
// 197 entities in the real file — 78 article, 51 module, 46 menuItem, 14 category, 8 templateStyle`

const LOCK_FILE = `{
  "entities": {
    "module-169": {
      "title": "[Tracy Apple] Chrome - Mobile menu",
      "ordering": "1",
      "position": "off-canvas",
      "published": "1",
      "module": "mod_menu",
      "access": "1",
      "showtitle": "0",
      "params": "{\\"menutype\\":\\"tracy\\",\\"startLevel\\":1,\\"endLevel\\":0,…}",
      "client_id": "0",
      "language": "*"
    }
  }
}`

export function Contracts() {
  const ops = useOps()
  const [version, setVersion] = useState('1.1.0')
  const [openRow, setOpenRow] = useState<LockRow | null>(null)

  if (ops.cms !== 'joomla') return <NoContract cms={ops.cms} />

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Contracts &amp; files"
        sub={
          <>
            Three files decide what a built Joomla site will accept: a manifest, a content map of 197
            entities, and a presentation lock. The mode is{' '}
            <span className="font-mono">content-recommendation</span> — the map says how to change the words
            and keep the design.
          </>
        }
      >
        <NativeSelect size="sm" className="w-[12rem]" aria-label="Quickstart" value="tracy-apple/j6" disabled>
          <NativeSelectOption value="tracy-apple/j6">tracy-apple/j6</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          size="sm"
          className="w-[8rem]"
          aria-label="Contract version"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        >
          <NativeSelectOption value="1.1.0">1.1.0</NativeSelectOption>
          <NativeSelectOption value="1.0.0">1.0.0</NativeSelectOption>
        </NativeSelect>
      </ScreenHead>

      {version === '1.0.0' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <StatusChip status="mismatch" />
          <span className="text-sm">
            1.0.0 is the Akeeba quickstart, before the runtime archive and the 0.14.0 cowork. Its files are
            not in this repo — only the release is pinned in the capability catalogue.
          </span>
          <ProvenanceTag of="surveyed" />
        </div>
      ) : null}

      <Tabs defaultValue="reading" className="gap-3">
        <TabsList>
          <TabsTrigger value="reading">Reading</TabsTrigger>
          <TabsTrigger value="files">JSON</TabsTrigger>
          <TabsTrigger value="diff">Changes &amp; drift</TabsTrigger>
        </TabsList>

        <TabsContent value="reading">
          <div className="flex flex-col gap-3">
            <Panel title="What the contract covers" icon={<ScrollText />}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity kind</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead>An agent may change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ENTITY_KINDS.map((k) => (
                      <TableRow key={k.kind}>
                        <TableCell className="font-mono text-sm">{k.kind}</TableCell>
                        <TableCell className="text-right tabular-nums">{k.count}</TableCell>
                        <TableCell className="whitespace-normal text-xs">{k.editable}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel
              title="Presentation lock"
              aside={
                <span className="text-muted-foreground text-xs">
                  {LOCK_ROWS.length} of 197 entities — four modules and the template style · open one for the
                  rest of its record
                </span>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Menu assignment</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Fields an agent may edit</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {LOCK_ROWS.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="max-w-[16rem] whitespace-normal text-sm">{r.title}</TableCell>
                        <TableCell className="font-mono text-xs">{r.type}</TableCell>
                        <TableCell className="text-xs">{r.status}</TableCell>
                        <TableCell className="font-mono text-xs">{r.position}</TableCell>
                        <TableCell className="text-xs">{r.menu}</TableCell>
                        <TableCell className="text-xs">{r.access}</TableCell>
                        <TableCell className="text-xs">
                          {r.editable.length === 0 ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Ban className="size-3.5" aria-hidden />
                              Nothing
                            </span>
                          ) : (
                            r.editable.join(', ')
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Full record for ${r.key}`}
                            onClick={() => setOpenRow(r)}
                          >
                            Record
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel title="Content map → customer answers" aside={<ProvenanceTag of="simulated" />}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Filled from</TableHead>
                      <TableHead>Sample</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SLOTS.map((s) => (
                      <TableRow key={`${s.entity}-${s.slot}`}>
                        <TableCell className="whitespace-normal text-xs">{s.entity}</TableCell>
                        <TableCell className="font-mono text-xs">{s.slot}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {s.kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{s.from}</TableCell>
                        <TableCell className="whitespace-normal text-xs">{s.sample}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <p className="px-4 py-3 text-muted-foreground text-xs">
                This mapping is invented. The real content map holds raw Joomla records, not slots — turning
                those into a table a person can read is one of the things this screen would have to do, and
                drawing it is how we find out whether it is worth doing.
              </p>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <div className="flex flex-col gap-3">
            <Code path="contracts/tracy-apple/j6/1.1.0/manifest.json" body={MANIFEST} excerpt />
            <Code path="contracts/tracy-apple/j6/1.1.0/content-map.json" body={CONTENT_MAP} excerpt />
            <Code path="contracts/tracy-apple/j6/1.1.0/presentation-lock.json" body={LOCK_FILE} excerpt />
            <p className="text-muted-foreground text-xs">
              The two big files are 802 KB and 1.1 MB on disk. Every block above is an excerpt and says so;
              the sha256 of all three is pinned in <span className="font-mono">quickstarts.json</span> under{' '}
              <span className="font-mono">cowork.contractFiles</span>.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="diff">
          <div className="flex flex-col gap-3">
            {CHANGES.map((c) => (
              <Panel
                key={c.id}
                title={c.what}
                aside={
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1.5 font-normal [&_svg]:size-3',
                      c.verdict === 'allowed'
                        ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                        : 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {c.verdict === 'allowed' ? <Check /> : <TriangleAlert />}
                    {c.verdict === 'allowed' ? 'Within the quickstart design' : 'Allowed, with a warning'}
                  </Badge>
                }
              >
                <div className="flex flex-col gap-2 px-4 py-3">
                  <Fact label="Target">
                    <span className="font-mono">{c.target}</span>
                  </Fact>
                  <Fact label="Why">{c.reason}</Fact>
                  <div className="overflow-hidden rounded-lg border border-border font-mono text-xs">
                    <div className="border-border border-b bg-destructive/5 px-3 py-1.5">
                      <span className="text-muted-foreground">− </span>
                      {c.before}
                    </div>
                    <div className="bg-emerald-500/5 px-3 py-1.5">
                      <span className="text-muted-foreground">+ </span>
                      {c.after}
                    </div>
                  </div>
                </div>
              </Panel>
            ))}

            <Panel
              title="One site, checked against the contract"
              aside={
                <>
                  <ProvenanceTag of="simulated" />
                  <span className="font-mono text-muted-foreground text-xs">
                    {BINDING.site} · {BINDING.contract}
                  </span>
                </>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Contract says</TableHead>
                      <TableHead>Site has</TableHead>
                      <TableHead>Verdict</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BINDING.drift.map((d) => (
                      <TableRow key={`${d.key}-${d.field}`}>
                        <TableCell className="font-mono text-xs">{d.key}</TableCell>
                        <TableCell className="font-mono text-xs">{d.field}</TableCell>
                        <TableCell className="text-xs">{d.expected}</TableCell>
                        <TableCell className="text-xs">{d.found}</TableCell>
                        <TableCell className="whitespace-normal text-xs">{d.verdict}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <p className="px-4 py-3 text-muted-foreground text-xs">
                Bound {BINDING.boundAt}. Site label and entity ids are invented; no webroot, cookie or token
                is in this fixture, and a real version of this screen must not put one in a browser either.
              </p>
            </Panel>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={openRow !== null} onOpenChange={(open) => !open && setOpenRow(null)}>
        <SheetContent closeLabel="Close" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{openRow?.title}</SheetTitle>
            <SheetDescription>
              {openRow?.key} · {openRow?.type}
            </SheetDescription>
          </SheetHeader>
          {openRow ? (
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              <Fact label="Position">{openRow.position}</Fact>
              <Fact label="Menu assignment">{openRow.menu}</Fact>
              <Fact label="Access">{openRow.access}</Fact>
              <Fact label="Fields an agent may edit">
                {openRow.editable.length === 0 ? 'Nothing' : openRow.editable.join(', ')}
              </Fact>
              {Object.entries(openRow.detail).map(([k, v]) => (
                <Fact key={k} label={k}>
                  <span className="font-mono text-xs">{v}</span>
                </Fact>
              ))}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function NoContract({ cms }: { cms: 'wordpress' | 'emdash' }) {
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Contracts &amp; files"
        sub={`${CMS_LABEL[cms]} has no contract files in this repository.`}
      />
      <Empty className="rounded-xl border border-border border-dashed py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollText />
          </EmptyMedia>
          <EmptyTitle>No contract for {CMS_LABEL[cms]}</EmptyTitle>
          <EmptyDescription>
            {cms === 'wordpress'
              ? 'There is no contracts/ folder and no capability catalogue. What an agent may change on a built WordPress site is decided by the sandbox mode and the path fence — not by a lock somebody wrote down.'
              : 'EmDash has no base to write a contract against. The decision about what a new EmDash site starts from comes first.'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <Panel title="What stands in for it today">
        <ul className="divide-y divide-border">
          <li className="px-4 py-3 text-sm">
            <span className="font-medium">Path fence</span>
            <p className="text-muted-foreground text-xs">
              Every path argument must resolve inside the session&rsquo;s site. Nothing narrower.
            </p>
          </li>
          <li className="px-4 py-3 text-sm">
            <span className="font-medium">Sandbox mode</span>
            <p className="text-muted-foreground text-xs">
              Read-only runs as nobody; write modes run as www-data inside the site container.
            </p>
          </li>
          <li className="px-4 py-3 text-sm">
            <span className="font-medium">Nothing about structure</span>
            <p className="text-muted-foreground text-xs">
              An agent that can write can move a block, change a template part, or alter who sees a page. On
              Joomla the presentation lock refuses that; here nothing does.
            </p>
          </li>
        </ul>
      </Panel>
    </div>
  )
}
