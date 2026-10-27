/**
 * THROWAWAY MOCK — where the CMS overlay sits next to the mode picker. Not shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER. Since 03/09 the lane ships **4 presets per platform** (`includeShippedRoot:
 * false`, default `designer`), so what the user picks is the *role*, while the *platform* is already decided
 * beforehand — by the very site they have open. The two combine into one preset (`designer-wordpress`),
 * and the question is: how does the overlay show next to the mode picker, when it is NOT a choice?
 *
 * THREE OPTIONS, and the second is the easy one to pick by mistake:
 *
 *   A. The overlay is a LABEL on the mode. One button: `Designer · WordPress`. It opens four roles, and a
 *      last line says the platform comes from the site. Fewest controls, and it tells the truth.
 *   B. TWO pickers side by side.          `[Designer ▾] [WordPress ▾]`. Looks balanced, but it invites
 *      people to change the platform — what can be changed must REALLY change, and really changing means the agent
 *      brings WordPress-reading tools into a Joomla site.
 *   C. One dropdown, two groups.          "Mode" (4 selectable rows) and "Platform" (1 locked row).
 *      As compact as A, but a locked row inside a selection list still looks selectable.
 *
 * The mockup draws **A** and **B** to compare side by side. I lean towards A, and not for looks: the platform is
 * a property of the SITE, not a user preference. A changeable control for something that cannot
 * change is a lying control — the same kind just removed from the harness screen.
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real surface is **MODE B**: this picker
 * lives in the dsh page, next to the workspace picker, so the version to review must be the one REWRITTEN in
 * plain `tv-*` CSS, not this one (`DESIGN.md` §0, `ui-workflow.md` step 4).
 *
 * ⚠ DELETE WHEN DONE.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  type PlatformId,
  platforms,
  type RoleId,
  resolve,
  roles,
  skillRows,
  toolRows
} from '@tracy/harness-web'
import { Badge, Button, Card, cn, PlatformGlyph, Separator } from '@tracy/ui'
import { TracyMark } from '@tracy/ui/brand'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  FolderOpen,
  Lock,
  Palette,
  PenLine,
  Plus,
  TrendingUp,
  TriangleAlert
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { expect } from 'storybook/test'

/**
 * 🔒 THE PANEL ANCHORS TO THE BUTTON'S RIGHT EDGE, NOT ITS LEFT (`right-0`, not `left-0`).
 *
 * Caught 03/09: the panel is twice as wide as the button, so a left anchor opens it to the right and **covers the
 * select next to it** — in the screenshot, the Mode menu covered the `WordPress` button. This picker group sits in the right
 * half of the row, so the direction with room is to the LEFT.
 *
 * This is a shared constant rather than four identical strings: the four panels in this file each used to write
 * `left-0` separately, and fixing three of four is the kind of bug nobody sees — three menus right, one overflowing,
 * and it only overflows when the viewer opens that exact story.
 */
const MENU_ANCHOR = 'absolute right-0 z-10 gap-0 overflow-hidden py-0 text-left'

const ROLE_ICON: Record<RoleId, ReactNode> = {
  designer: <Palette />,
  developer: <Code2 />,
  writer: <PenLine />,
  'seo-geo': <TrendingUp />
}

/** The dark strip the picker actually sits on, so the mock is judged in its real surroundings. */
function Stage({ children, note }: { children: ReactNode; note: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{note}</p>
      <div className="rounded-xl bg-neutral-900 px-5 py-4 dark:bg-neutral-950">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-neutral-200 hover:text-white">
            TracyHQ
            <ChevronDown />
          </Button>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── A: overlay is a label on the mode ─────────────────────────────────────────────────────────

function OptionA({ platform = 'wordpress' as PlatformId, open = true }) {
  const [role, setRole] = useState<RoleId>('designer')
  const platformLabel = platforms.find((p) => p.id === platform)?.label

  return (
    <Stage note="A — one button. Platform is a label, not a choice.">
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-primary/60 bg-transparent text-neutral-100 hover:text-white"
        >
          {ROLE_ICON[role]}
          {roles.find((r) => r.id === role)?.label}
          <span className="text-neutral-400">·</span>
          <PlatformGlyph platform={platform === 'emdash' ? null : platform} letter="W" />
          {platformLabel}
          <ChevronDown />
        </Button>

        {open ? (
          <Card className={cn(MENU_ANCHOR, 'top-10 w-[26rem]')}>
            {roles.map((r) => {
              const counts = resolve(r.id, platform)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent',
                    r.id === role && 'bg-accent/60'
                  )}
                >
                  <span className="mt-0.5 flex size-5 flex-none items-center justify-center text-muted-foreground [&_svg]:size-4">
                    {ROLE_ICON[r.id]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm">{r.label}</span>
                    <span className="block text-muted-foreground text-xs">{r.hint}</span>
                    <span className="mt-0.5 block text-muted-foreground text-xs tabular-nums">
                      {counts.tools.length} tools · {counts.skills.length} skills
                    </span>
                  </span>
                  {r.id === role ? <Check className="mt-0.5 size-4 flex-none" /> : null}
                </button>
              )
            })}
            <Separator />
            {/* 🔒 THE LINE THAT MAKES A A DIFFERENT PROPOSAL FROM B. It is inside the menu, so a
                reader meets it while choosing — and it is a sentence, not a row, so nobody tries
                to click it. */}
            <div className="flex items-center gap-2 px-4 py-2.5">
              <Lock className="size-3.5 flex-none text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                On <span className="font-medium text-foreground">{platformLabel}</span>, because that is what
                this site runs. Adds its own tools and skills to every mode above.
              </span>
            </div>
          </Card>
        ) : null}
      </div>
    </Stage>
  )
}

// ── B: two pickers side by side ───────────────────────────────────────────────────────────────

function OptionB({ platform = 'wordpress' as PlatformId }) {
  const [role, setRole] = useState<RoleId>('designer')
  return (
    <Stage note="B — two pickers. Symmetric, but it invites changing what cannot change.">
      <Button
        variant="outline"
        size="sm"
        className="rounded-full border-primary/60 bg-transparent text-neutral-100 hover:text-white"
        onClick={() => setRole(role === 'designer' ? 'writer' : 'designer')}
      >
        {ROLE_ICON[role]}
        {roles.find((r) => r.id === role)?.label}
        <ChevronDown />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full border-neutral-700 bg-transparent text-neutral-300"
        disabled
      >
        <PlatformGlyph platform={platform === 'emdash' ? null : platform} letter="W" />
        {platforms.find((p) => p.id === platform)?.label}
        <ChevronDown />
      </Button>
      <Badge variant="secondary" className="ms-1 font-normal">
        locked — yet it still reads as a picker
      </Badge>
    </Stage>
  )
}

function Compare() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="font-semibold text-lg tracking-tight">Mode picker · CMS overlay</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Four presets, one per platform. The reader picks a <strong>role</strong>; the platform comes from
          the site they have open, so the question is how the overlay shows up without posing as a choice.
        </p>
      </div>
      <OptionA />
      <div className="h-40" />
      <OptionB />
    </div>
  )
}

// ── the picker where it actually lives ────────────────────────────────────────────────────────

/**
 * dsh's empty-session frame, rebuilt here.
 *
 * Once copied from `HeroFrame` in `pages/chat/PromptChips.stories.tsx` — that story and the four suggestion chips
 * it proposed were removed 21/09/2026: in a site's workspace the Build tab leads the session, and no
 * chips remain on the input. This frame keeps exactly what the real thing still draws: mark, workspace +
 * mode row, input.
 */
function HeroFrame({ picker }: { picker: ReactNode }) {
  return (
    <div className="mx-auto flex w-[640px] flex-col gap-4 bg-background px-4 py-10 text-foreground">
      <div className="flex justify-center">
        <TracyMark size={40} />
      </div>
      {/* Workspace + mode row. Where `Standard mode` stands today is exactly where the new picker goes. */}
      <div className="flex items-center gap-4 px-1 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <FolderOpen className="size-4" /> TracyHQ
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </span>
        {picker}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
        <div className="min-h-10 px-1 text-muted-foreground text-sm">
          Describe what you want to build… / commands, @ files or sessions
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 rounded-full border border-border">
            <Plus className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            Accept edits automatically <ChevronDown className="size-3.5" />
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            DeepSeek-V4-Flash <span className="text-xs">High</span>
            <ChevronDown className="size-3.5" />
          </Button>
          <Button size="icon" className="size-8 rounded-full">
            <ArrowRight className="size-4 -rotate-90" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Option A, at its real size and in the exact place it will stand. */
function InFrame({ platform = 'wordpress' as PlatformId, open = false }) {
  const [role, setRole] = useState<RoleId>('designer')
  const [menu, setMenu] = useState(open)
  const platformLabel = platforms.find((p) => p.id === platform)?.label

  return (
    <HeroFrame
      picker={
        <span className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium text-sm hover:bg-accent"
          >
            <span className="flex size-4 items-center justify-center [&_svg]:size-4">{ROLE_ICON[role]}</span>
            {roles.find((r) => r.id === role)?.label}
            <span className="text-muted-foreground">·</span>
            <PlatformGlyph platform={platform === 'emdash' ? null : platform} letter="E" />
            <span className="text-muted-foreground">{platformLabel}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>

          {menu ? (
            <Card className={cn(MENU_ANCHOR, 'top-9 w-[24rem] shadow-lg')}>
              {roles.map((r) => {
                const counts = resolve(r.id, platform)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRole(r.id)
                      setMenu(false)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent',
                      r.id === role && 'bg-accent/60'
                    )}
                  >
                    <span className="mt-0.5 flex size-4 flex-none items-center justify-center text-muted-foreground [&_svg]:size-4">
                      {ROLE_ICON[r.id]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">{r.label}</span>
                      <span className="block text-muted-foreground text-xs">{r.hint}</span>
                      {/* This number ALREADY INCLUDES the current platform's overlay — switching to Joomla makes it
                          drop, and that itself says what WordPress is adding. */}
                      <span className="block text-muted-foreground text-xs tabular-nums">
                        {counts.tools.length} tools · {counts.skills.length} skills
                      </span>
                    </span>
                    {r.id === role ? <Check className="mt-0.5 size-4 flex-none" /> : null}
                  </button>
                )
              })}
              <Separator />
              <div className="flex items-start gap-2 px-4 py-2.5">
                <Lock className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                <span className="text-muted-foreground text-xs">
                  On <span className="font-medium text-foreground">{platformLabel}</span>, because that is
                  what this site runs. Adds its own tools and skills to every mode above.
                </span>
              </div>
            </Card>
          ) : null}
        </span>
      }
    />
  )
}

const meta = {
  title: 'Mockups/Mode picker',
  component: Compare,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Compare>

export default meta
type Story = StoryObj<typeof meta>

/** The two options side by side, to compare by eye rather than by description. */
export const Compared: Story = {
  play: async ({ canvas }) => {
    // A states the platform in one sentence, in the menu, where people are choosing.
    await expect(canvas.getByText(/because that is what this site runs/)).toBeVisible()
    // B has a locked platform button — exactly what this mock exists to show is wrong.
    await expect(canvas.getByRole('button', { name: /WordPress/ })).toBeDisabled()
  }
}

/** Option A only, open — the one I propose. */
export const OptionAOnly: StoryObj<typeof OptionA> = {
  render: () => (
    <div className="p-10">
      <OptionA />
      <div className="h-72" />
    </div>
  ),
  play: async ({ canvas }) => {
    // Four roles, each saying how many tools/skills it brings on this platform.
    for (const label of ['Designer', 'Developer', 'Writer', 'SEO/GEO']) {
      await expect(canvas.getByText(label)).toBeVisible()
    }
    await expect(canvas.getByText('Theme, layout, brand, visual direction')).toBeVisible()
  }
}

/** On a Joomla site: the same four roles, a different overlay, and it is empty — the screen must say so. */
export const OnJoomla: StoryObj<typeof OptionA> = {
  render: () => (
    <div className="p-10">
      <OptionA platform="joomla" />
      <div className="h-72" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/On.*Joomla/)).toBeVisible()
  }
}

/** Closed: exactly where `Standard mode` stands, same row, same font size. */
export const InTheRealFrame: StoryObj<typeof InFrame> = {
  render: () => <InFrame />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Designer')).toBeVisible()
    await expect(canvas.getByText('WordPress')).toBeVisible()
    // The real frame: chip, workspace, input — to review in context rather than on a white background.
    await expect(canvas.getByText('TracyHQ')).toBeVisible()
    await expect(canvas.getByText(/Describe what you want to build/)).toBeVisible()
  }
}

/** Open: four roles, counts including the overlay, and a sentence saying why the platform cannot change. */
export const InTheRealFrameOpen: StoryObj<typeof InFrame> = {
  render: () => (
    <div className="pb-72">
      <InFrame open />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/because that is what this site runs/)).toBeVisible()
    await expect(canvas.getByText('14 tools · 28 skills')).toBeVisible()
  }
}

/** The same frame on a Joomla site: empty overlay, and the counts drop. */
export const InTheRealFrameOnJoomla: StoryObj<typeof InFrame> = {
  render: () => (
    <div className="pb-72">
      <InFrame platform="joomla" open />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('13 tools · 27 skills')).toBeVisible()
  }
}

// ── B decided: two pickers, the second one a dropdown ───────────────────────────────────────────

/**
 * Two pickers: mode, then CMS.
 *
 * WHY A DROPDOWN AND NOT THREE BUTTONS SIDE BY SIDE (segmented). Three buttons show every option without
 * opening, and with three items that is usually right. Not here, for three reasons:
 *
 *   1. This row already has `TracyHQ` and the mode. Three more buttons make a long bar for something changed
 *      a few times a month — exactly what should be folded away.
 *   2. The three items are NOT equal: WordPress adds a tool and a skill, Joomla and Emdash add nothing yet. A
 *      segmented control draws three equal boxes, and three equal boxes are a lie about the library.
 *   3. Consistent with the picker right next to it: mode is also a dropdown, same size, same shape.
 *
 * EACH ROW SAYS WHAT IT ADDS. That is where the dropdown clearly beats segmented: `Joomla — nothing yet` read
 * once tells you picking it gives the agent nothing extra, while a plain `Joomla` button says nothing at all.
 */
function TwoPickers({
  platform = 'wordpress' as PlatformId,
  siteRuns = 'wordpress' as PlatformId,
  open = false
}) {
  // The mode picker in this story is only there to show the shapes side by side; the one that opens is the CMS picker.
  const [role] = useState<RoleId>('designer')
  const [plat, setPlat] = useState<PlatformId>(platform)
  const [menu, setMenu] = useState(open)

  const overlaySize = (p: PlatformId) => {
    const tools = toolRows.filter((r) => r.platforms[p] === true).length
    const skills = skillRows.filter((r) => r.platforms[p] === true).length
    return { tools, skills, total: tools + skills }
  }

  return (
    <HeroFrame
      picker={
        <>
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium text-sm">
            <span className="flex size-4 items-center justify-center [&_svg]:size-4">{ROLE_ICON[role]}</span>
            {roles.find((r) => r.id === role)?.label}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>

          <span className="relative">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium text-sm hover:bg-accent"
            >
              <PlatformGlyph platform={plat === 'emdash' ? null : plat} letter="E" />
              {platforms.find((p) => p.id === plat)?.label}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>

            {menu ? (
              <Card className={cn(MENU_ANCHOR, 'top-9 w-[19rem] shadow-lg')}>
                {platforms.map((p) => {
                  const size = overlaySize(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPlat(p.id)
                        setMenu(false)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent',
                        p.id === plat && 'bg-accent/60'
                      )}
                    >
                      <PlatformGlyph platform={p.id === 'emdash' ? null : p.id} letter={p.letter} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-sm">{p.label}</span>
                        {/* Where the dropdown beats segmented: the three items are not equal, and this line says
                            so before anyone picks. */}
                        <span className="block text-muted-foreground text-xs">
                          {size.total === 0
                            ? 'nothing yet — agents run on their mode alone'
                            : `adds ${size.tools} tool · ${size.skills} skill`}
                        </span>
                      </span>
                      {p.id === plat ? <Check className="size-4 flex-none" /> : null}
                    </button>
                  )
                })}
                {/* Selectable means really selectable — even when it differs from the site. But a mismatch must be SAID. */}
                {plat !== siteRuns ? (
                  <>
                    <Separator />
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <TriangleAlert className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                      <span className="text-muted-foreground text-xs">
                        This site runs{' '}
                        <span className="font-medium text-foreground">
                          {platforms.find((p) => p.id === siteRuns)?.label}
                        </span>
                        . The agent will carry {platforms.find((p) => p.id === plat)?.label} tools on it.
                      </span>
                    </div>
                  </>
                ) : null}
              </Card>
            ) : null}
          </span>
        </>
      }
    />
  )
}

/** Two pickers, closed — the bar's everyday shape. */
export const TwoPickersClosed: StoryObj<typeof TwoPickers> = {
  render: () => <TwoPickers />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Designer')).toBeVisible()
    await expect(canvas.getByText('WordPress')).toBeVisible()
  }
}

/** CMS picker open: three items, each saying what it adds. */
export const TwoPickersCmsOpen: StoryObj<typeof TwoPickers> = {
  render: () => (
    <div className="pb-72">
      <TwoPickers open />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('adds 1 tool · 1 skill')).toBeVisible()
    // The two empty ones say plainly they are empty, instead of looking level with WordPress.
    await expect(canvas.getAllByText(/nothing yet/)).toHaveLength(2)
  }
}

/** Picking something different from the site: allowed, but said out loud. */
export const CmsDiffersFromSite: StoryObj<typeof TwoPickers> = {
  render: () => (
    <div className="pb-72">
      <TwoPickers platform="joomla" siteRuns="wordpress" open />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/This site runs/)).toBeVisible()
  }
}

// ── C: ONE dropdown, two groups ─────────────────────────────────────────────────────────────────

/**
 * One button, opening two groups: Mode and Platform.
 *
 * ⚠ I DISMISSED C WRONGLY. When I dismissed it, the assumption was that the platform could NOT be chosen, so a row in the
 * selection list that cannot be clicked was a trap. It was then decided that it can be chosen — and the trap went away with the
 * assumption. What remains is the upside: one control instead of two, and the two axes show side by side so people
 * see the PAIR they are choosing rather than two separate things.
 *
 * THE MENU DOES NOT CLOSE WHEN ONE AXIS IS PICKED. A session needs both, and most openings are to change one
 * of the two and glance at the other. Closing right after the first click forces a second opening for the unfinished job.
 *
 * GROUP LABELS ARE PLAIN TEXT, NOT CLICKABLE ROWS. `Mode` and `Platform` are group headings; keeping
 * them clearly different from selectable rows is the only thing that stops people clicking the heading.
 */
function OneDropdownTwoGroups({
  platform = 'wordpress' as PlatformId,
  siteRuns = 'wordpress' as PlatformId,
  open = false
}) {
  const [role, setRole] = useState<RoleId>('designer')
  const [plat, setPlat] = useState<PlatformId>(platform)
  const [menu, setMenu] = useState(open)

  const overlaySize = (p: PlatformId) => {
    const tools = toolRows.filter((r) => r.platforms[p] === true).length
    const skills = skillRows.filter((r) => r.platforms[p] === true).length
    return { tools, skills, total: tools + skills }
  }
  const counts = resolve(role, plat)

  return (
    <HeroFrame
      picker={
        <span className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium text-sm hover:bg-accent"
          >
            <span className="flex size-4 items-center justify-center [&_svg]:size-4">{ROLE_ICON[role]}</span>
            {roles.find((r) => r.id === role)?.label}
            <span className="text-muted-foreground">·</span>
            <PlatformGlyph platform={plat === 'emdash' ? null : plat} letter="E" />
            <span className="text-muted-foreground">{platforms.find((p) => p.id === plat)?.label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>

          {menu ? (
            <Card className={cn(MENU_ANCHOR, 'top-9 w-[23rem] shadow-lg')}>
              <p className="px-3 pt-2.5 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Mode
              </p>
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent',
                    r.id === role && 'bg-accent/60'
                  )}
                >
                  <span className="flex size-4 flex-none items-center justify-center text-muted-foreground [&_svg]:size-4">
                    {ROLE_ICON[r.id]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm">{r.label}</span>
                    <span className="block text-muted-foreground text-xs">{r.hint}</span>
                  </span>
                  {r.id === role ? <Check className="size-4 flex-none" /> : null}
                </button>
              ))}

              <Separator />
              <p className="px-3 pt-2.5 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Platform
              </p>
              {platforms.map((p) => {
                const size = overlaySize(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlat(p.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent',
                      p.id === plat && 'bg-accent/60'
                    )}
                  >
                    <PlatformGlyph platform={p.id === 'emdash' ? null : p.id} letter={p.letter} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">{p.label}</span>
                      <span className="block text-muted-foreground text-xs">
                        {size.total === 0 ? 'nothing yet' : `adds ${size.tools} tool · ${size.skills} skill`}
                        {p.id === siteRuns ? ' — what this site runs' : ''}
                      </span>
                    </span>
                    {p.id === plat ? <Check className="size-4 flex-none" /> : null}
                  </button>
                )
              })}

              {/* 🔒 WHAT C CAN DO AND TWO SEPARATE PICKERS CANNOT: the selected pair, and that pair's own
                  number, sit right under both groups. With two separate dropdowns this number has no
                  place to stand without being repeated twice. */}
              <Separator />
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="font-mono text-muted-foreground text-xs">
                  {role}-{plat}
                </span>
                <span className="ms-auto text-muted-foreground text-xs tabular-nums">
                  {counts.tools.length} tools · {counts.skills.length} skills
                </span>
              </div>
              {plat !== siteRuns ? (
                <div className="flex items-start gap-2 border-border border-t px-3 py-2.5">
                  <TriangleAlert className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">
                    This site runs{' '}
                    <span className="font-medium text-foreground">
                      {platforms.find((p) => p.id === siteRuns)?.label}
                    </span>
                    . The agent will carry {platforms.find((p) => p.id === plat)?.label} tools on it.
                  </span>
                </div>
              ) : null}
            </Card>
          ) : null}
        </span>
      }
    />
  )
}

/** C — one dropdown, two groups. Open, to compare with B. */
export const OneDropdownGrouped: StoryObj<typeof OneDropdownTwoGroups> = {
  render: () => (
    <div className="pb-96">
      <OneDropdownTwoGroups open />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Mode')).toBeVisible()
    await expect(canvas.getByText('Platform')).toBeVisible()
    // The selected pair has a name, and the number belongs to that pair.
    await expect(canvas.getByText('designer-wordpress')).toBeVisible()
    await expect(canvas.getByText('14 tools · 28 skills')).toBeVisible()
  }
}

/** Changing the first axis keeps the menu open, because the session needs both. */
export const GroupedKeepsMenuOpen: StoryObj<typeof OneDropdownTwoGroups> = {
  render: () => (
    <div className="pb-96">
      <OneDropdownTwoGroups open />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Writer'))
    // Still open, and the pair has changed with it.
    await expect(canvas.getByText('writer-wordpress')).toBeVisible()
    await userEvent.click(canvas.getByText('Joomla'))
    await expect(canvas.getByText('writer-joomla')).toBeVisible()
    await expect(canvas.getByText(/This site runs/)).toBeVisible()
  }
}
