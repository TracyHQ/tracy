import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  ListTodo,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  RotateCcw,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react'
import { useState } from 'react'

import { messages, type Site, tasks } from '../../fixtures'

function TaskPicker() {
  const [current, setCurrent] = useState(tasks[0])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="min-w-0 font-medium">
            <span className="truncate">{current.title}</span>
            <ChevronDown className="size-3.5 flex-none text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Tasks on this site</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tasks.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => setCurrent(t)}>
            {t.pinned ? (
              <Pin className="text-muted-foreground" />
            ) : (
              <ListTodo className="text-muted-foreground" />
            )}
            <span className="truncate">{t.title}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {t.pending ? <Badge variant="secondary">Pending</Badge> : null}
              {t.id === current.id ? <Check className="size-3.5" /> : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AgentAvatar() {
  return (
    <Avatar className="size-6">
      <AvatarFallback className="bg-primary/15 font-bold text-[10px] text-primary">T</AvatarFallback>
    </Avatar>
  )
}

function Messages() {
  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {messages.map((m) =>
        m.role === 'user' ? (
          <div
            key={m.id}
            className="ml-8 self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-muted px-3 py-2 text-sm"
          >
            {m.text}
          </div>
        ) : (
          <div key={m.id} className="flex gap-2.5">
            <AgentAvatar />
            <div className="min-w-0 flex-1">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
              {m.files ? (
                <div className="mt-2.5 flex flex-col gap-1">
                  {m.files.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
                    >
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{f.name}</code>
                      <span className="truncate text-muted-foreground text-xs">{f.note}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-0.5 text-muted-foreground">
                <Button variant="ghost" size="icon-xs" aria-label="Copy">
                  <Copy />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label="Good answer">
                  <ThumbsUp />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label="Bad answer">
                  <ThumbsDown />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label="Retry">
                  <RotateCcw />
                </Button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}

/**
 * Two states, one component — like dsh: `ConversationRoot` switches `data-phase` between 'hero' and
 * 'active' WITHOUT remounting the composer slot. The bench draws the same two states so it does not create a
 * second tree the real thing does not have.
 *
 * They differ in exactly two points, each mirroring one line of dsh:
 *   - the stats line: only in the composer (`ConversationRoot.tsx`: `footer: !hero && …`)
 *   - the top border: only in the composer, because the hero rests against no transcript
 * The hero's suggestion chips were removed 21/09/2026 together with the four chips of `@tracy/dsh-chat-input`: the
 * Build tab leads the session, nothing sits on the input any more.
 */
function Composer({ variant }: { variant: 'hero' | 'composer' }) {
  const hero = variant === 'hero'
  return (
    <div className={cn('flex-none p-3', !hero && 'border-border border-t')}>
      <div className="rounded-xl border border-border bg-card shadow-xs transition-colors focus-within:border-ring">
        <Textarea
          placeholder="Message the agent"
          className="min-h-9 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          rows={1}
        />
        <div className="flex min-w-0 items-center gap-0.5 overflow-hidden px-2 pb-2">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Attach" />}>
              <Paperclip />
            </TooltipTrigger>
            <TooltipContent>Attach files</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                  Claude Sonnet
                  <ChevronDown className="size-3" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Claude Sonnet</DropdownMenuItem>
              <DropdownMenuItem>Claude Opus</DropdownMenuItem>
              <DropdownMenuItem>DeepSeek V3</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="min-w-0 text-muted-foreground text-xs">
                  <span className="truncate">Ask first</span>
                  <ChevronDown className="size-3 flex-none" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Permission mode</DropdownMenuLabel>
              <DropdownMenuItem>Default (ask before continuing)</DropdownMenuItem>
              <DropdownMenuItem>Accept edits automatically</DropdownMenuItem>
              <DropdownMenuItem>Planning mode (requires plan approval)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="min-w-1 flex-1" />
          <Button size="icon-sm" className="flex-none rounded-full" aria-label="Send">
            <ArrowUp />
          </Button>
        </div>
      </div>
      {hero ? null : (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
          4 turns · 72 steps · 11m 12s working
        </p>
      )}
    </div>
  )
}

// `site` is part of the pane's contract (passed down by Workspace) but the mockup chat frame does not
// read it yet — the underscore name keeps noUnusedParameters quiet and stays visible for the next use.
export function ChatPane({
  site: _site,
  className,
  variant = 'composer'
}: {
  site: Site
  className?: string
  /** 'hero' = a session with no message yet. Defaults to 'composer' because that state lives longer. */
  variant?: 'hero' | 'composer'
}) {
  const hero = variant === 'hero'
  return (
    <div className={cn('flex min-h-0 flex-col border-border border-r bg-background', className)}>
      <div className="flex h-11 flex-none items-center gap-1 border-border border-b px-2">
        <TaskPicker />
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="New task" />}>
            <Plus />
          </TooltipTrigger>
          <TooltipContent>New task</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Rename task</DropdownMenuItem>
            <DropdownMenuItem>Pin task</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Session information</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Delete task</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hero ? (
        // No transcript, no "agent is viewing Preview" line: both talk about what has happened,
        // and in the hero nothing has yet. `justify-center` is the narrow version of
        // dsh's `.root[data-phase='hero'] .scrollBody { justify-content: center }`.
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <Composer variant="hero" />
        </div>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <Messages />
          </ScrollArea>
          <div className="flex-none px-4 pb-1 text-[11px] text-muted-foreground">
            The agent sees the page open in the Preview ·{' '}
            <button className="underline underline-offset-2 hover:text-foreground">Mute</button>
          </div>
          <Composer variant="composer" />
        </>
      )}
    </div>
  )
}
