import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  PanelRight,
  RotateCw,
  X
} from 'lucide-react'
import { useState } from 'react'

import type { Site } from '../../fixtures'

type Door = 'Preview' | 'Live site' | 'Admin' | 'Proposal'

function doorUrl(site: Site, door: Door) {
  switch (door) {
    case 'Preview':
      return site.previewUrl
    case 'Live site':
      return site.liveUrl
    case 'Admin':
      return site.adminUrl
    case 'Proposal':
      return `${site.previewUrl}?proposal=latest`
  }
}

function AddressBar({ site }: { site: Site }) {
  const [door, setDoor] = useState<Door>('Preview')
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-muted/50 pr-1 pl-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex h-6 flex-none items-center gap-1.5 rounded-md px-2 font-medium text-xs transition-colors hover:bg-muted">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  door === 'Live site' ? 'bg-green-500' : 'bg-amber-500'
                )}
              />
              {door}
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>This site’s addresses</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(['Preview', 'Live site', 'Admin', 'Proposal'] as Door[]).map((d) => (
            <DropdownMenuItem key={d} onClick={() => setDoor(d)}>
              <span className="flex w-full items-center gap-2">
                <span className="w-16 flex-none font-medium text-xs">{d}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {doorUrl(site, d)}
                </span>
                {d === door ? <Check className="size-3.5 flex-none" /> : null}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
        {doorUrl(site, door)}
      </span>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Copy address" />}>
          <Copy />
        </TooltipTrigger>
        <TooltipContent>Copy address</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Fake web page inside Preview — only so the mockup has content. */
function FakeSite({ site }: { site: Site }) {
  const brand = site.key.split('.')[0].toUpperCase()
  return (
    <div className="flex h-full flex-col overflow-auto bg-white text-neutral-900">
      <div className="flex flex-none items-center justify-between border-neutral-200 border-b px-8 py-4">
        <span className="font-black text-lg tracking-tight">{brand}</span>
        <div className="flex items-center gap-5 font-medium text-neutral-500 text-xs">
          <span>Products</span>
          <span>Docs</span>
          <span>Pricing</span>
          <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-white">Login</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
        <h1 className="max-w-2xl text-balance font-extrabold text-4xl leading-tight tracking-tight">
          Everything{' '}
          {site.platform === 'joomla' ? 'Joomla' : site.platform === 'wordpress' ? 'WordPress' : 'commerce'},
          beautifully done.
        </h1>
        <p className="mt-4 max-w-xl text-neutral-500 text-sm leading-relaxed">
          For over 19 years we have been helping our clients design, build, and launch highly responsive
          websites that offer exceptional functionality and outstanding design.
        </p>
        <button className="mt-7 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-sm text-white">
          Check it now
        </button>
      </div>
      <div className="pointer-events-none flex justify-end p-4">
        <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-neutral-900 py-2 pr-3 pl-2 font-medium text-white text-xs shadow-lg">
          <span className="flex size-5 items-center justify-center rounded-full bg-white font-black text-[10px] text-neutral-900">
            T
          </span>
          Managed with <b>Tracy</b>
          <X className="size-3.5 opacity-60" />
        </span>
      </div>
    </div>
  )
}

export function PreviewPane({
  site,
  toolPaneOpen,
  onToggleToolPane,
  className
}: {
  site: Site
  toolPaneOpen: boolean
  onToggleToolPane: () => void
  className?: string
}) {
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col bg-background', className)}>
      <div className="flex h-11 flex-none items-center gap-1 border-border border-b px-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back">
          <ArrowLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Forward" disabled>
          <ArrowRight />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh">
          <RotateCw />
        </Button>
        <AddressBar site={site} />
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Open in browser" />}>
            <ExternalLink />
          </TooltipTrigger>
          <TooltipContent>Open in browser</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle tool pane"
                className={toolPaneOpen ? 'text-foreground' : 'text-muted-foreground'}
                onClick={onToggleToolPane}
              />
            }
          >
            <PanelRight />
          </TooltipTrigger>
          <TooltipContent>{toolPaneOpen ? 'Hide changes' : 'Show changes'}</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1">
        <FakeSite site={site} />
      </div>
    </div>
  )
}
