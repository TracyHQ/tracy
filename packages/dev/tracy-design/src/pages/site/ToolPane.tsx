import {
  Badge,
  Button,
  cn,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import {
  CheckCircle2,
  GitCommitHorizontal,
  Maximize2,
  RotateCcw,
  ScanSearch,
  TriangleAlert,
  Undo2
} from 'lucide-react'
import { useState } from 'react'

import { changeGroups, releases } from '../../fixtures'
import { Placeholder } from '../../components/Placeholder'

const STATUS_STYLE: Record<string, string> = {
  M: 'text-amber-600 dark:text-amber-400',
  A: 'text-green-600 dark:text-green-400',
  D: 'text-red-600 dark:text-red-400'
}

function ChangesTab() {
  const [filter, setFilter] = useState('All')
  const total = changeGroups.reduce((n, g) => n + g.files.length, 0)
  const shown = filter === 'All' ? changeGroups : changeGroups.filter((g) => g.group === filter)
  return (
    <>
      <div className="flex flex-none flex-wrap items-center gap-1 border-border border-b px-3 py-2">
        {['All', ...changeGroups.map((g) => g.group)].map((f) => {
          const count = f === 'All' ? total : changeGroups.find((g) => g.group === f)?.files.length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors',
                filter === f
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f}
              <span
                className={cn(
                  'text-[10px]',
                  f === 'Core' && filter !== f
                    ? 'rounded-full bg-destructive px-1 text-white'
                    : 'text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-2">
          {shown.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                {g.group === 'Core' ? <TriangleAlert className="size-3 text-amber-500" /> : null}
                {g.group}
              </div>
              <div className="flex flex-col">
                {g.files.map((f) => (
                  <div
                    key={f.path}
                    className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60"
                  >
                    <span
                      className={cn('w-3 flex-none font-bold font-mono text-[11px]', STATUS_STYLE[f.status])}
                    >
                      {f.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]" dir="rtl">
                      <bdi>{f.path}</bdi>
                    </span>
                    <span className="flex-none font-mono text-[10px]">
                      {f.additions != null && f.additions > 0 ? (
                        <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                      ) : null}{' '}
                      {f.deletions != null && f.deletions > 0 ? (
                        <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                      ) : null}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100"
                      aria-label="Revert file"
                    >
                      <Undo2 />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex flex-none items-center justify-between gap-2 border-border border-t px-3 py-2">
        <span className="text-muted-foreground text-xs">{total} files changed on the Preview</span>
        <Button size="sm">Apply to live site</Button>
      </div>
    </>
  )
}

function HistoryTab() {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-3 py-3">
        {releases.map((r, i) => (
          <div key={r.version} className="relative flex gap-3 pb-5 last:pb-1">
            {i < releases.length - 1 ? (
              <span className="absolute top-6 left-[9px] h-full w-px bg-border" />
            ) : null}
            <GitCommitHorizontal className="z-10 mt-0.5 size-4.5 flex-none rounded-full bg-background text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-sm">{r.title}</span>
                <Badge variant="outline" className="flex-none">
                  v{r.version}
                </Badge>
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">
                <code className="font-mono">{r.sha}</code> · {r.author} · {r.ago}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <Button variant="outline" size="xs">
                  <RotateCcw />
                  Take the site back to here
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

function ScanTab() {
  const findings = [
    { level: 'ok', text: 'All 214 internal links resolve' },
    { level: 'warn', text: '3 images above 400 kB on the homepage' },
    { level: 'warn', text: 'Missing meta description on /blog' },
    { level: 'ok', text: 'Sitemap and robots.txt present' }
  ]
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-3 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Nightly Sync</p>
            <p className="text-muted-foreground text-xs">Last scan finished 2 hours ago</p>
          </div>
          <Button variant="outline" size="sm">
            <ScanSearch />
            Scan now
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          {findings.map((f) => (
            <div
              key={f.text}
              className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
            >
              {f.level === 'ok' ? (
                <CheckCircle2 className="mt-0.5 size-3.5 flex-none text-green-600 dark:text-green-400" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 flex-none text-amber-500" />
              )}
              <span className="text-xs">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}

export function ToolPane({ className }: { className?: string }) {
  const [tab, setTab] = useState('changes')
  return (
    <div className={cn('flex min-h-0 flex-col border-border border-r bg-background', className)}>
      <div className="flex h-11 flex-none items-center gap-1 border-border border-b px-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="min-w-0">
          <TabsList>
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="scan">Scan</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Expand" />}>
            <Maximize2 />
          </TooltipTrigger>
          <TooltipContent>Expand</TooltipContent>
        </Tooltip>
      </div>
      {tab === 'changes' ? <ChangesTab /> : null}
      {tab === 'history' ? <HistoryTab /> : null}
      {tab === 'scan' ? <ScanTab /> : null}
      {tab === 'files' ? (
        <div className="min-h-0 flex-1">
          <Placeholder
            title="Files"
            items={[
              'Tree of the site’s working copy',
              'Open a file read-only',
              'Jump from a change to its file'
            ]}
          />
        </div>
      ) : null}
    </div>
  )
}
