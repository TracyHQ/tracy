/**
 * CSS Tailwind generates at build, swapped in by esbuild `define` (see scripts/build-client.mjs).
 */
declare const __TAILWIND_CSS__: string
export const TAILWIND = __TAILWIND_CSS__

/**
 * Restyle dsh's workspace tree and session rows (ui-workspace, mounted in `sidebar.workspaces`)
 * to the design bench's Rail: rows `rounded-md`, 6/12 padding, `sidebar-accent` hover and
 * selection, header label small and muted, icon buttons 28px ghost.
 *
 * Selectors match the readable tail of dsh's hashed CSS-module class names (`[class*="…"]`), the
 * one way DESIGN.md §3 allows — never a full hashed name. Everything reads `--dsw-alias-*` with a
 * fallback so it follows the Tracy layer dsh-brand puts on <body>.
 */
export const CSS = `
/* -- New session: its own fill, because the token cannot give it one -------------------------
   variant="secondary" reads --secondary, which tokens.css maps to --dsw-alias-bg-layer-2.
   Measured 04/09 in dsh's own palette (ui-theme/src/styles/design-platform.css): on LIGHT that
   alias, bg-layer-1 and bg-base are ALL rgb(255,255,255) -- so the button's fill equals the
   column's fill and the button disappears. On dark they differ (36/38 vs 44/46) and it reads fine.

   Fixed here rather than in tokens.css: that file is shared by every Tracy surface, and moving
   --secondary to repaint one button repaints every secondary button in the product.

   No border, Akemi's call 04/09 -- the fill alone carries the separation. Radius 8px, also hers,
   against the 10px rounded-lg the button class ships with. */
/* Weight 400, not the 500 the button class ships with: Akemi's call 04/09, the label should read
   light. Stated here once so both themes take the same number.

   The smoothing pair below is what makes that number LOOK the same in both. A light glyph on a
   dark ground is painted heavier than a dark glyph on a light one -- macOS subpixel rendering,
   not a CSS difference -- so 400 on dark reads closer to 500 next to the light theme. Asking for
   greyscale antialiasing on the dark side only is what actually equalises them. */
/* ONE rule for the New session button, not a light pair plus a dark pair.
   The paired version kept going wrong: a selector in the dark list lost its prefix and leaked
   into light, and even once every prefix was right and matches() confirmed the selector hit,
   the dark declarations still lost — measured on dsh 05/09, the button kept the light fill.
   Chasing that cascade was costing more than the pairing was worth.

   Mixing the column's own foreground into the column's own surface is self-correcting: on light
   that is a little black over a pale ground, on dark a little white over a dark one, and the
   button always sits one step off the surface behind it. Hover doubles the step, which is what
   makes it visible on dark — dsh's --dsw-alias-interactive-bg-hover cannot, because background
   REPLACES rather than overlays, so that 8% white dropped the button toward the column colour
   and read as no hover at all. */
/* -- macOS desktop window strip --------------------------------------------------------------
   Only the desktop app's darwin window has traffic lights over this column (the app's preload sets
   html[data-platform]; html[data-fullscreen] while the lights are hidden). 44px clears them at
   y 18 + 14 with the air dsh leaves under its own top strip. */
.tsb-window-strip { display: none; }
html[data-platform='darwin']:not([data-fullscreen]) .tsb-window-strip { display: block; height: var(--dsh-chrome-height, 44px); }
/* The desktop app's integrated chrome row (html[data-desktop-chrome], set by its preload; dsh's
   ui-layout paints ONE tint behind the whole window and the content card below the top row): the
   column lets that tint through instead of painting its own surface, and draws no edge — the
   card's own edge is the separator, starting under the strip, as in Cherry Studio (Lee, 09/10/2026).
   --tsb-surface stays declared: the New session plate still mixes from it. */
html[data-platform='darwin'][data-desktop-chrome='integrated'] .tsb-root { background: transparent; border-inline-end-width: 0; }
/* Beside the collapsed rail, the conversation header's first control would start 8px after the
   traffic lights (lights end at x 68, header content at 56 + 20). Cherry Studio leaves ~15px there
   (its tab strip starts at x 88), so the header pads to the same 88. Expanded, the lights sit over
   the wide column and the header needs nothing; in fullscreen the lights are gone. */
html[data-platform='darwin'][data-desktop-sidebar-rail]:not([data-fullscreen]) [data-sidebar-collapsed] [data-slot="conversation.header"] > header { padding-inline-start: 32px; }
/* -- Windows desktop window: the open button lives in the caption row ---------------------------
   Under html[data-windows-titlebar] (the app's preload, on Windows) dsh's frame collapses the left
   column to ZERO width -- no icon rail -- and expects the column's own reopen control to stay in the
   40px caption row, fixed at left 12px, in the 48px its Application / Edit menu leaves free
   (--dsh-windows-menu-start). Tracy's column replaces dsh's, so the rail's open button takes that
   seat. Without it a collapsed column -- every page load collapses it once -- could not be opened
   again (Windows VM, 10/10/2026). Fixed, it escapes the zero-width column; no-drag, because the
   caption row around it drags the window. */
html[data-windows-titlebar] .tsb-rail .tsb-rail-open { position: fixed; top: calc((var(--dsh-windows-titlebar-height, 40px) - 28px) / 2); left: 12px; z-index: 30; width: 28px; height: 28px; -webkit-app-region: no-drag; }
/* -- Phone width: the right panel leaves the rail its column ------------------------------------
   Below 768px dsh presents an open right panel (the site's Browser) fullscreen, 100vw wide from the
   frame's right edge (ui-sidebar-right SidebarRight.tsx), so it covered this rail and the person's
   face at its foot could not be pressed (measured 09/10/2026 at 360x740: the Browser's iframe sat
   at the face's centre). The rail is the only way to the account menu, to New session and to the
   site list, so on a phone the panel stops at the rail's edge; --dsh-frame-sidebar is the track
   the frame gives the left column. dsh does the same for its Windows caption column
   (max-width: calc(100vw - var(--dsh-windows-sidebar-width))). A fullscreen the person chose on a
   wider window still covers everything. */
@media (max-width: 767.98px) { [data-sidebar-right-panel='fullscreen'] { max-width: calc(100vw - var(--dsh-frame-sidebar, 0px)); } }

.tsb-new-session { background: color-mix(in oklab, var(--sidebar-foreground) 8%, var(--tsb-surface, var(--sidebar))); border-radius: 8px; font-weight: 400; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.tsb-new-session:hover { background: color-mix(in oklab, var(--sidebar-foreground) 16%, var(--tsb-surface, var(--sidebar))); }
/* Collapsed rail: dsh's tree renders its own icon column (search, new folder) at 28/36px with
   18px glyphs, off-centre against Tracy's 36px buttons with 16px lucide icons. Same box, same
   glyph size, one column — the glyphs themselves stay dsh's until the tree is Tracy's. */
.tsb-rail [data-slot="sidebar.workspaces"] [class*="_rail"], .tsb-rail [data-slot="sidebar.workspaces"] [class*=" rail"] { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; width: 100%; }
.tsb-rail [data-slot="sidebar.workspaces"] [class*="_rail"] button, .tsb-rail [data-slot="sidebar.workspaces"] [class*="_rail"] [class*="iconButton"] { width: 36px !important; height: 36px !important; margin: 0 !important; border-radius: 10px !important; display: inline-flex; align-items: center; justify-content: center; }
.tsb-rail [data-slot="sidebar.workspaces"] [class*="_rail"] button svg { width: 16px; height: 16px; }
.tsb-rail [data-slot="sidebar.workspaces"] [class*="sectionHeader"] { padding: 0 !important; margin-top: 0 !important; }
.tsb-rail [data-slot="sidebar.workspaces"] [class*="headerActions"], .tsb-rail [data-slot="sidebar.workspaces"] [class*="headerActions"] > span, .tsb-rail [data-slot="sidebar.workspaces"] [class*="searchSlot"] { display: flex; justify-content: center; width: 100%; padding: 0; margin: 0; }
.tsb-rail [data-slot="sidebar.workspaces"] [class*="_rail"] > *, .tsb-rail [data-slot="sidebar.workspaces"] [class*=" rail"] > * { display: flex; justify-content: center; width: 100%; padding: 0; margin: 0; }
/* An empty section header leaves the rail: collapsed, it holds no label and, since dsh stopped
   drawing the add-workspace button there, nothing at all, yet the wide 32px height below still
   applied, and with the 4px gap it opened a 48px hole between New session and search (measured
   29/09; the logo to New session step is 12px). Gone, search sits 12px under New session like the
   step above it. A header that still carries a button keeps its place. */
.tsb-rail [data-slot="sidebar.workspaces"] [class*="sectionHeader"]:not(:has(button)) { display: none; }
/* Direct child only: dsh mounts the whole Settings page as a DESCENDANT of this slot, so a
   descendant selector here squeezed every button in Settings to 36px (03/09/2026). */
.tsb-rail [data-slot="sidebar.settings"] > .ts-account > [data-slot="button"] { width: 36px; height: 36px; padding: 0; justify-content: center; margin: 0 auto; }
/* A hairline above the Settings trigger, the way claude.ai separates the foot of its sidebar
   from the list. Without it the trigger reads as one more conversation that happens to have a
   gear on it. The rule is a border on the SLOT, so dsh keeps ownership of what sits inside.

   The negative inline margin spends back the footer own 8px padding (rail.tsx renders that
   footer as p-2), so the line runs edge to edge the way claude.ai draws it. A rule that stops
   short of both walls reads as an underline belonging to the row above, not as a division of
   the column. */

/* The Settings trigger hovers like the rows above it -- same wash, same 10px plate. It is a
   ghost Button, so without this it keeps @tracy/ui's own accent fill and reads as a different
   kind of control sitting at the foot of the same list. */
/* 🔒 THE DIVIDER CANNOT LIVE ON THE SLOT. Measured on real dsh 05/09: that wrapper computes to
   display:contents, so it draws no box at all -- width 0, and border-top/margin/padding on it are
   dropped silently. The rule was there, the colour resolved, and nothing appeared on screen.
   Storybook could not catch it either: the bench renders its own wrapper as a plain div.

   So the line rides the BUTTON as an absolutely-positioned ::before, pulled 8px past each side to
   spend back the footer's padding and reach both walls. It sits above the button rather than on
   it, so the hover plate never overlaps the rule. */
.tsb-root [data-slot="sidebar.settings"] > .ts-account > [data-slot="button"] { position: relative; color: var(--tsb-row-fg); border-radius: 10px; height: 44px; padding-inline: 12px; margin-top: 7px; }
.tsb-root [data-slot="sidebar.settings"] > .ts-account > [data-slot="button"]::before { content: ''; position: absolute; top: -7px; left: -8px; right: -8px; height: 1px; background: color-mix(in oklab, var(--sidebar-foreground) 12%, transparent); }
.tsb-root [data-slot="sidebar.settings"] > .ts-account > [data-slot="button"]:hover { color: var(--tsb-row-fg); background: var(--tsb-hover); }
/* One colour for everything a person reads down this column: conversation rows and the
   Settings trigger at its foot. Named here rather than repeated because the second copy is the
   one that drifts -- the trigger was full-strength white while the rows sat a step below it,
   which is what Akemi spotted (04/09). */
.tsb-root { background: var(--tsb-surface, var(--dsw-specific-sidebar-fill, var(--sidebar, #f9fafb))); --tsb-row-fg: color-mix(in oklab, var(--sidebar-foreground) 42%, var(--muted-foreground)); --tsb-hover: rgba(0, 0, 0, 0.05); }
/* The column takes its own surface on dark (Akemi 05/09, matching claude.ai side by side).
   dsh paints it oklch(0.205 0 0) -- a pure grey, chroma 0. claude.ai reads darker than dsh grey --
   near-black without being flat black -- and carries a little warmth. Second estimate: 0.212 was
   still visibly lighter than claude side by side (Akemi, 05/09). STILL ESTIMATED FROM A
   SCREENSHOT, not sampled: this is the one number to move. Light keeps dsh own fill. */
[data-ds-dark-theme] .tsb-root, .dark .tsb-root, :root[data-theme="dark"] .tsb-root { --tsb-surface: oklch(0.178 0.003 85); --tsb-hover: rgba(255, 255, 255, 0.08); }

/* ONE chrome, TWO sides (Akemi, 15/09). The left column and the right panel (better-sidebar's
   tab strip and pane, plus anything else under dsh's panel host) share one surface, and only the
   stage in the middle -- the conversation, the first-run hero -- keeps the page base. Measured
   before this rule: dark left 0.178 / right pane 0.145 (same as the stage) / tab strip 0.205;
   light left 0.985 / right pane and stage both white. Three greys, no depth.
   Light takes a warm ivory a hair below the base so the stage reads as the lit surface, the same
   hue the dark chrome carries; dark reuses the column's surface above. The number lives HERE and
   nowhere else -- --tsb-surface feeds both sides. Inside the host only --dsw-alias-bg-base moves:
   layer-1 (cards, inputs) and layer-2 stay dsh's, so a card on the chrome still sits one step up.
   Selectors: the host attribute is dsh's own ([data-dsh-panel-host]), the strip is matched by
   its readable suffix, never by hash (DESIGN.md §3).
   dsh's dockkit layout (0.1.7) no longer puts the right panel inside [data-dsh-panel-host]: the
   panel is [data-dockkit-surface], a sibling, so these rules matched nothing and the panel fell back
   to the stage's 0.145 with no error anywhere (measured 29/09, Akemi: "the right panel must match
   the left bar"). Both attributes are named; the conversation column ([data-dsh-center-col]) carries
   neither, so the stage keeps the page base. */
.tsb-root, [data-dsh-panel-host], [data-dockkit-surface] { --tsb-surface: oklch(0.975 0.003 85); }
[data-ds-dark-theme] [data-dsh-panel-host], .dark [data-dsh-panel-host], :root[data-theme="dark"] [data-dsh-panel-host],
[data-ds-dark-theme] [data-dockkit-surface], .dark [data-dockkit-surface], :root[data-theme="dark"] [data-dockkit-surface] { --tsb-surface: oklch(0.178 0.003 85); }
[data-dsh-panel-host], [data-dockkit-surface] { --dsw-alias-bg-base: var(--tsb-surface); }
[data-dsh-panel-host] [class*="tabBar"] { background: var(--tsb-surface); }
/* No accent on the open panel tab (Akemi, 29/09): it keeps dsh's own grey. The 15/09 rule — a 10%
   terracotta wash and a 2px terracotta line — had stopped matching when dsh's dockkit moved the tabs
   out of [data-dsh-panel-host]; shown again on the stand, Akemi chose the grey, so the rule is gone
   rather than left to come back the day the layout changes. */

/* One text rendering for the WHOLE column, not just the button.
   Measured 04/09 with getComputedStyle: the session titles and the New session button were both
   weight 400, yet the titles read heavier. The difference was not weight -- it was that only the
   button had asked for greyscale antialiasing (added the day before), so light glyphs on a dark
   ground were painted fat everywhere else. Fixing one element and leaving its neighbours alone
   is what produced the mismatch; the rule belongs on the column. */
[data-ds-dark-theme] .tsb-root, .dark .tsb-root, :root[data-theme="dark"] .tsb-root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
/* The header hugs both walls, as claude.ai does: its title starts at the column edge and its
   tools end at the other one. The old 12px left / 4px right sat the label further in than the
   conversation titles below it, so the heading looked indented under its own list. Both sides
   now spend back the footer-style padding the tree carries, the same trick the rows use. */
/* Both ends of the header sit the same distance from the wall (Akemi 05/09). The title was flush
   against it while the tools kept theirs: a 28px round button holds its 16px glyph 6px in, so the
   icons looked inset and the label did not. Six pixels of padding on the left puts the first
   letter and the last glyph the same 8px from their own edges. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sectionHeader"] { padding: 0 4px 0 11px; margin: 8px 0 0; height: 32px; }
/* ONE WORKSPACE, ONE SITE (15/09/2026): the other sites follow the open site's tree, they do not
   sit on the column's floor. dsh's browser fills its region (flex: 1 on the root and on the list
   seat), which parked every other site a whole column away from the one just left — so a switch
   read as the list jumping. The tree now takes its content's height and still shrinks, the list
   inside it still scrolls, and the rows below come right after the last session. */
.tsb-root [data-slot="sidebar.workspaces"],
.tsb-root [data-slot="sidebar.workspaces"] > *,
.tsb-root [data-slot="sidebar.workspaces"] [class*="listArea"] { flex: 0 1 auto !important; min-height: 0; }
.tsb-root [data-slot="sidebar.workspaces"] [class*="search"] { border-radius: 8px; }
.tsb-root [data-slot="sidebar.workspaces"] [class*="searchInput"] { font-size: 13px; }
/* The section title, sized against the 28px round tools beside it (Akemi 04/09).
   At 12px it read as a caption next to those buttons rather than as the heading of the list;
   claude.ai's equivalent sits just under its row text, not far below it. 13px keeps it a step
   below the 14px rows, so the hierarchy survives while the label stops disappearing.

   Colour moves off --dsw-alias-label-tertiary for the third time today: dsh's grey carries a
   blue cast on light (its own fallback is #74808a), and Akemi has rejected that cast twice
   already. --muted-foreground is declared in both theme blocks and is neutral. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sectionLabel"] { font-size: 14px; color: var(--muted-foreground); }
/* The header tools sit at the SAME grey as the title, and only the pointer lifts one out
   (Akemi 04/09, against claude.ai's header). A row of icons brighter than the heading they sit
   beside turns the quietest strip in the column into its loudest.

   Colour off --dsw-alias-label-secondary, whose fallback #4a5560 is the fourth blue-grey of dsh's
   scale to be swapped out today; --muted-foreground is the same neutral the title uses. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="iconButton"],
.tsb-root [data-slot="sidebar.workspaces"] [class*="searchButton"] { width: 28px; height: 28px; border-radius: 8px; color: var(--muted-foreground); }
.tsb-root [data-slot="sidebar.workspaces"] [class*="iconButton"]:hover,
.tsb-root [data-slot="sidebar.workspaces"] [class*="searchButton"]:hover { color: var(--sidebar-foreground); background: var(--tsb-hover); }
/* The hover plate runs nearly edge to edge, as claude.ai's does. dsh's tree pads its own
   container, so a row that only fills that box leaves a visible gutter on both sides and the
   plate reads as a floating chip rather than as the row itself. The negative inline margin
   spends that padding back, and the inner padding keeps the text where it was. */
/* The list keeps a gutter on both sides, like claude.ai's (Akemi 05/09, comparing production
   against it). An earlier pass pulled the rows out to the walls so the hover plate would run edge
   to edge; on the real 280px column that read as the list being jammed against the frame. The
   plate is wide enough without it — it still fills everything between the gutters. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="projectRow"],
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] { border-radius: 10px; padding: 0 12px; font-size: 15px; }
.tsb-root [data-slot="sidebar.workspaces"] [class*="projectRow"] { height: 34px; font-weight: 500; }

/* -- The open session is marked by a DOT, not by a grey plate (Akemi's call 04/09) -----------
   Shape borrowed from claude.ai's chat list, which Akemi asked us to follow: the row that is
   open carries a filled dot, every other row a hollow ring in the same column, and no row
   carries a background. Keeping the plate as well would state the same thing twice, and the
   plate is the weaker of the two -- it reads as "hovered" more than "open".

   The dot rides on .slot, which dsh renders for EVERY session row including a blank one
   (Rows.tsx: the slot span is emitted whenever the tree is not flat, and only its StateDot
   child is conditional). So a brand-new "New Session" row gets the mark too, which is exactly
   the row a person is looking at when they arrive.

   Row 40px / text 15px / gap 12px is claude.ai's own rhythm; the previous 32px and 14px were
   what Akemi read as cramped beside it. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] { height: 36px; gap: 12px; }

/* Every conversation reads at ONE brightness, open or not (Akemi 04/09, second pass).
   The first pass gave the open row full strength and dimmed the rest; measured against
   claude.ai, that was one signal too many -- the dot already says which conversation is open,
   so a brighter label only repeats it. What the column needed instead was for ALL the rows to
   sit brighter than dsh's resting grey, which read as disabled next to claude's list.
   Mixed rather than picked: no token sits at this step, and a literal would be written for one
   theme. Kept on the ROW so the timestamp, still tertiary, stays quieter than the title.

   🔒 THE TWO COLOURS ARE TRACY TOKENS, NOT LITERALS, AND THAT IS THE WHOLE POINT. A literal
   fallback is written for ONE theme: #18181b on the selected row rendered black-on-black the
   moment dsh was absent (measured 04/09 in Storybook -- the row lost its text entirely, dot
   still showing). --sidebar-foreground and --muted-foreground are declared in both theme
   blocks of tokens.css and already resolve to dsh aliases when dsh is there. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] { color: var(--tsb-row-fg); }
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] [class*="title"] { font-weight: 400; font-size: 14px; }

.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] [class*="slot"] { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; width: 6px; height: 6px; min-width: 6px; }
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] /* flex:none and border-box keep the dot ROUND. It is a flex item inside a 6px box, so by
   default it shrinks along the main axis while its height holds -- on real dsh that came out as
   an upright oval, and the bench never showed it because dsh sizes .slot at 16x20 there and
   Tracy squeezes it to 6x6 only in the product. With the border counted inside the box, 6px
   means 6px both ways. */
[class*="slot"]::after { content: ''; display: block; flex: none; box-sizing: border-box; width: 6px; height: 6px; border-radius: 50%; border: 0.5px solid color-mix(in oklab, var(--muted-foreground) 75%, transparent); background: transparent; }

/* Filled, in the brand terracotta -- Akemi 04/09 moved the accent off dsh's blue. #BF5B3D is
   the mark's own colour (packages/brand/tracy-brand/src/client/generated.ts). It is written
   literally because the brand has no CSS variable in this tree yet; the day it gets one, this
   is the line to point at it. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"][class*="selected"] [class*="slot"]::after { border-color: transparent; background: #bf5b3d; }

/* ONE marker per row, and it is Tracy's (Akemi 05/09, after seeing all three options side by side).
   dsh puts its own StateDot inside this same span whenever showStatus is true -- Rows.tsx:405
   reads that as "state is not done, OR the session finished while you were elsewhere" -- so a
   running, waiting, errored or newly-finished row carried TWO dots: dsh's colour beside Tracy's
   ring, squeezed into one 6px slot. Storybook never showed it, because the bench only ever drew
   resting rows, where the span is empty.
   
   Hiding dsh's dot costs the three states it distinguished (waiting-on-you, errored, finished).
   Akemi took that trade for a column that reads at a glance; a row that needs attention is found
   by opening it, not by its dot.
   
   ⚠ Scoped to sessionRow ON PURPOSE. The same class tail carries the folder glyph on a
   projectRow, and this rule would erase it.

   Since 28/09 an operator switch (/ops › User Interface, id session-status-dot, @tracy/core
   ui-switches). Off: the rule above as Akemi chose it. On: dsh's dot shows and Tracy's ring steps
   aside on that row only, so a row still carries ONE marker. */
:root[data-tracy-hide~="session-status-dot"] .tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] [class*="slot"] > * { display: none; }
:root:not([data-tracy-hide~="session-status-dot"]) .tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] [class*="slot"]:has(> *)::after { display: none; }

/* Running reads as a filled dot in a softened white -- not the full foreground, which out-shouts
   the terracotta beside it. data-state="ongoing" is dsh's own attribute (StateDot.tsx renders
   that one state as an svg carrying it), so the row needs no extra class from anyone. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] [class*="slot"]:has([data-state="ongoing"])::after { border-color: transparent; background: color-mix(in oklab, var(--sidebar-foreground) 72%, var(--muted-foreground)); }
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"][class*="selected"] { background: transparent; }

/* The workspace folder glyph follows the same accent. dsh paints it with
   --dsw-alias-state-business-primary; overriding the SELECTOR rather than that variable keeps
   the change inside the column, since the same alias colours things elsewhere in dsh. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="projectRow"] [class*="folder"] { color: #bf5b3d; }

/* Hover is a NEUTRAL wash, not dsh's alias -- and that is a deliberate departure.
   dsh sets --dsw-alias-interactive-bg-hover to rgba(255,255,255,0.08) on dark, which is fine,
   but to rgba(38,49,72,0.06) on light: a blue-grey. Akemi rejected exactly that cast in the
   resting-row text, and it is the same cast here. A plain black/white wash at the same weight
   carries the hover without tinting the column.

   Radius 10px matches the rounded plate claude.ai draws under a hovered row; the rows carried
   6px, left over from when the open row wore a plate of its own. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="projectRow"]:hover,
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"]:hover { background: var(--tsb-hover); }
/* No timestamp on a conversation row (Akemi 04/09, following claude.ai's list, which shows
   none either). dsh puts a relative time at the end of every non-blank row; on a 280px column it
   competes with the title for the only horizontal room there is, and it answers a question
   nobody asked while picking a conversation to reopen. The row menu takes that space instead,
   and it appears only under the pointer.

   Hidden rather than removed: the markup is dsh's, and the element still carries the value for
   anything that reads the DOM. Since 28/09 an operator switch (id session-timestamp). */
:root[data-tracy-hide~="session-timestamp"] .tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"] [class*="time"] { display: none; }

/* The row menu, styled like claude.ai's: a small round target that only appears under the
   pointer, and takes a fill of its own when the pointer is on IT rather than merely on the row.
   dsh already does the swap (Rows.module.css hides .time and shows .rowActions on hover); what
   was missing was that the button looked like a bare glyph rather than something clickable. */
/* Under the pointer the title FADES OUT beneath the menu rather than ending in an ellipsis
   (claude.ai's treatment, which Akemi asked for). An ellipsis says "there is more text"; a fade
   says "the row keeps going, something is sitting on top of it" -- which is what is happening,
   since the menu only exists while the pointer is here. Clip, not ellipsis, so the mask has real
   glyphs to dissolve instead of three dots. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"]:hover [class*="title"] {
  text-overflow: clip;
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent 100%);
  mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent 100%);
}

.tsb-root [data-slot="sidebar.workspaces"] [class*="rowActions"] [class*="iconButton"] { width: 24px; height: 24px; border-radius: 6px; color: var(--muted-foreground); }
/* dsh draws the row menu as three dots ACROSS (IconEllipsisOutline16); Akemi wants them down
   the way claude.ai has it. Rotating the glyph keeps dsh owning the icon -- swapping in one of
   ours would fork a symbol we do not maintain, and it would drift the next time dsh redraws it. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="rowActions"] [class*="iconButton"] svg { transform: rotate(90deg); }
/* Stronger than --tsb-hover on purpose: this button sits on a plate that is already lit, so the
   same wash again would not read as a second layer. */
.tsb-root [data-slot="sidebar.workspaces"] [class*="rowActions"] [class*="iconButton"]:hover { color: var(--sidebar-foreground); background: color-mix(in oklab, var(--sidebar-foreground) 14%, transparent); }

/* -- Community: the Discord link (community.tsx) ----------------------------------------------
   Its row lives in the account menu now (drawn by @tracy/core's PopoverItem); only the flash that
   points at the face after the pill is hidden stays here. */
/* After the customer hides the floating pill: two pulses of the brand colour on the face that opens
   the account menu, to show where the link went. Mixed into the column surface so it reads on both themes. */
@keyframes tsb-community-flash { 50% { background: color-mix(in oklab, var(--primary) 24%, var(--tsb-surface, var(--sidebar))); } }
.tsb-root .tsb-community-flash { animation: tsb-community-flash 1.2s ease 2; }

/* -- Need help?: the floating pill above the composer ---------------------------------------
   It renders OUTSIDE the column (conversation.input.dock), so it reads the shared Tracy tokens,
   never the tsb-* ones. The slot holds a zero-height anchor; the dock box is fixed at the
   coordinates community.tsx measures (above the composer, or the column corner), and everything
   inside it hangs from its bottom-right corner. */
.tch-help { height: 0; }
/* The dock slides left (inline transform, community.tsx) to clear dsh's scroll-to-bottom chevron
   and back when it goes. Strong ease-out, so the pill is out of the chevron's way early and the
   rest is settling. Only transform animates: right/bottom keep following the column as before. */
.tch-help-dock { position: fixed; z-index: 20; width: 0; height: 0; transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1); }
/* dsh mounts its chevron with no motion of its own, on the spot the pill sits. While the pill is
   on the page the chevron holds back for 110ms (the pill is mostly clear of it by then, measured
   169ms to fully clear) and fades in, so it shows once the pill has stepped aside instead of
   popping in over it. Scoped to the pill's presence: with the pill hidden or switched off, dsh's
   chevron behaves as it always did. Opacity only: a scale would shift the chevron's measured
   rect, and community.tsx places the pill from it. */
@keyframes tch-help-chevron-in { from { opacity: 0; } }
[data-conversation-scroll]:has(.tch-help-pill) button[class*="toBottom"] { animation: tch-help-chevron-in 200ms ease-out 110ms backwards; }
@media (prefers-reduced-motion: reduce) {
  .tch-help-dock { transition: none; }
  [data-conversation-scroll]:has(.tch-help-pill) button[class*="toBottom"] { animation: none; }
}
.tch-help-pill { position: absolute; right: 0; bottom: 0; display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px 0 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--popover); color: var(--popover-foreground); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16); }
.tch-help-pill:hover { background: color-mix(in oklab, var(--popover-foreground) 6%, var(--popover)); }
.tch-help-pill:focus-visible, .tch-help-close:focus-visible, .tch-help-hide:focus-visible, .tch-help-go:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.tch-help-mark { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; background: var(--primary); color: var(--primary-foreground); font-size: 12px; font-weight: 700; }
.tch-help-mark::before { content: "?"; }
.tch-help-panel { position: absolute; right: 0; bottom: 48px; width: 300px; max-width: calc(100vw - 32px); padding: 16px; border-radius: 14px; border: 1px solid var(--border); background: var(--popover); color: var(--popover-foreground); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22); }
.tch-help-head { display: flex; align-items: center; justify-content: space-between; font-size: 15px; font-weight: 600; }
.tch-help-close { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin: -6px -6px -6px 0; border: 0; border-radius: 8px; background: none; color: var(--muted-foreground); cursor: pointer; }
.tch-help-close:hover { background: color-mix(in oklab, var(--popover-foreground) 8%, var(--popover)); }
.tch-help-close svg { width: 16px; height: 16px; }
.tch-help-body { margin: 8px 0 14px; font-size: 13px; line-height: 1.55; color: var(--muted-foreground); }
/* Discord's own blurple with white text: a brand colour that reads the same on both themes, so
   it is the one literal here. */
.tch-help-go { display: flex; align-items: center; justify-content: center; gap: 8px; height: 36px; border-radius: 8px; background: #5865f2; color: #fff; font-size: 13px; font-weight: 500; text-decoration: none; }
.tch-help-go:hover { color: #fff; filter: brightness(1.08); }
.tch-help-go-icon { width: 16px; height: 16px; }
.tch-help-hide { display: block; margin: 12px auto 0; border: 0; background: none; color: var(--muted-foreground); font: inherit; font-size: 12px; cursor: pointer; }
.tch-help-hide:hover { text-decoration: underline; }
.tch-help-note { position: absolute; right: 0; bottom: 0; width: max-content; max-width: 300px; padding: 10px 14px; border-radius: 10px; background: var(--popover-foreground); color: var(--popover); font-size: 13px; line-height: 1.45; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
`
