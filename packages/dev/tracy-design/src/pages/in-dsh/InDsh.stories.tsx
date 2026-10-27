/**
 * THE REAL PRODUCT SURFACE — what a user sees at `cowork.tracy.ai`, rendered from the running code itself.
 *
 * 🔒 THIS IS MODE B, AND THAT IS THE BIGGEST DIFFERENCE FROM EVERY OTHER STORY IN THIS STORYBOOK.
 * `Screens/App` and `Mockups/*` are mode A — Tracy owns `<html>`. The four things below do not:
 * they are **plugins plugged into dsh's page**, dsh owns the document, and they occupy only a slot.
 * `DESIGN.md` §0 holds the table comparing the two modes.
 *
 * ⚠ THREE THINGS HERE LOOK **BETTER THAN THE TRUTH**, and you must know them before reviewing:
 *
 *   1. **Preflight is on here, and OFF in dsh.** The bench is mode A, so `@import "tailwindcss"` brings
 *      the reset along. The shipped build drops preflight on purpose (RULE #4 — bringing a second reset into the host page
 *      breaks the host UI), so in dsh `ul`, `p`, `h3` keep the browser's default margins
 *      and `a` stays blue and underlined. Anything that lines up better here than in the real thing is almost certainly this.
 *   2. **No dsh aliases.** `tokens.css` declares `var(--dsw-alias-…, <fallback>)`; in dsh the
 *      alias IS present so the alias wins; here it is absent so **the fallback decides the colour**. Same component,
 *      two palettes — and nothing on screen says so.
 *   3. **No siblings in the slot.** `Rail` and `TracySettingsRoot` declare `renderSlot`; in dsh
 *      those slots are filled by dsh's workspace tree, the brand, and footer actions. Here I return
 *      placeholders, so the empty space is FAKE.
 *
 * To see the truth, open dsh: `./run.sh web`. This Storybook answers "what does this component
 * render", not "what does the real page look like".
 *
 * ⚠ WHAT CANNOT BE RENDERED, AND WHY. The conversation area in the screenshot — "Simple Greeting", the
 * `Conversation | Progress` tab (shown in Vietnamese there), the transcript, the three `permission · preset danger-full-access` rows — belongs to
 * **`@deepseek-ai/dsh-web-app`**, and that package in `node_modules` **has only the built bundle, no
 * `src/`**. It is not a callable component either: it boots through cordis with a whole plugin
 * graph. The composer at the bottom of that area, however, IS Tracy's, and it has its own story: `pages/chat/Composer`.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'

import { AddSiteWizard } from '../../../../../site/tracy-add-site/src/client/wizard'
import { en as addSiteEn } from '../../../../../site/tracy-add-site/src/client/strings'
import { MySitesTab } from '../../../../../site/tracy-my-sites/src/client/index'
import { en as mySitesEn } from '../../../../../site/tracy-my-sites/src/client/strings'
import { Rail } from '../../../../../ui/tracy-sidebar/src/client/rail'
import { CSS as railCss } from '../../../../../ui/tracy-sidebar/src/client/styles'
import { en as railEn } from '../../../../../ui/tracy-sidebar/src/client/strings'
import viAddSite from '../../../../../locale/tracy-locale-vi/vi/tracy-add-site.json'
import viMySites from '../../../../../locale/tracy-locale-vi/vi/tracy-my-sites.json'
import viSidebar from '../../../../../locale/tracy-locale-vi/vi/tracy-sidebar.json'
import { TracySettingsRoot } from '../../../../../ui/tracy-settings/src/client/index'
import { en as settingsEn } from '../../../../../ui/tracy-settings/src/client/strings'

const meta: Meta = {
  title: 'Screens/In dsh',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

/**
 * The string lookup, in exactly the shape a plugin receives from dsh.
 *
 * In dsh, `t` is provided by `ctx.locale`, which has already picked the language. Here I rebuild it from the two
 * real dictionaries — `strings.ts` (en) and `locale/tracy-locale-vi/vi/*.json` — so the `vi` switch
 * below **is not text I typed by hand**: it is the shipped translation.
 */
const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )

/**
 * Placeholder for a slot dsh will fill.
 *
 * Drawn instead of returning `null`: an empty slot returning `null` becomes blank space, and that
 * blank space looks exactly like a layout bug. The dashed box says "someone else sits here".
 */
function Slot({ name, h = 'h-8' }: { name: string; h?: string }): ReactNode {
  return (
    <div
      className={`flex ${h} items-center justify-center rounded-md border border-muted-foreground/40 border-dashed px-2 text-[10px] text-muted-foreground/70`}
    >
      {name}
    </div>
  )
}

/** Fake dsh page background: only so the component does not float on white. */
function HostPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <style>{railCss}</style>
      {children}
    </div>
  )
}

/**
 * dsh's session tree, REBUILT — and the honest name for it is a stand-in, not the thing.
 *
 * 🔒 WHY IT IS NOT dsh's OWN COMPONENT, measured 04/09 after trying:
 *
 *   · `ProjectRowItem` / `SessionNodeItem` in `ui-workspace/src/client/rows/Rows.tsx` take plain
 *     props and touch no cordis, so they LOOK mountable. They are not reachable, though: the
 *     published package ships no `src/` (its `exports` advertises `./src/*`, the tarball has
 *     only `lib/` + `README`), and `lib/client.js` exports exactly two names — `apply` and
 *     `inject`. The rows never leave the bundle.
 *   · Importing from `vendor/tracy/deepseek-harness` reaches the source but drags dsh's whole type
 *     graph into this package's TypeScript program, where none of it resolves — down to
 *     `Cannot find module 'react'`, because that submodule has no node_modules of its own.
 *     Installing dsh's monorepo to render one sidebar is not a trade worth making.
 *
 * SO WHAT THIS IS WORTH. The markup below is copied element for element from Rows.tsx and
 * WorkspaceBrowser.tsx (rows 112-200 / 379-500 / 1119-1123), and the class names carry the same
 * readable tails Tracy's selectors match on. That makes the CSS under review REAL — every rule
 * in `styles.ts` bites here exactly as it does in the product. What it cannot prove is that dsh
 * still emits these nodes today. Before shipping a change to this column, confirm it on dsh
 * itself; `tch/storages/workspace.json` needs at least one session for the list to appear.
 *
 * The row set covers the three states a person actually meets: the blank row they land on, an
 * idle one, and one that finished while they were elsewhere.
 */
function Row({
  kind,
  title,
  time,
  selected,
  running
}: {
  kind: 'project' | 'session'
  title: string
  time?: string
  selected?: boolean
  /** dsh marks a running session with data-state="ongoing" inside the slot; Tracy keys off it. */
  running?: boolean
}) {
  const cls = kind === 'project' ? '_projectRow_dsh' : '_sessionRow_dsh'
  return (
    // Whole class per branch, not a space-prefixed fragment. Biome's `useSortedClasses` reads
    // `' _selected_dsh'` as a Tailwind class list, "sorts" it, and drops the leading space —
    // labelled a safe fix while it silently welds the two class names into one that no stylesheet
    // defines. Measured 04/09: `pnpm lint` applied it, and nothing went red.
    <div className={selected ? `${cls} _selected_dsh` : cls}>
      <span className={kind === 'project' ? '_slot_dsh _folder_dsh' : '_slot_dsh'}>
        {running ? <span data-state="ongoing" /> : null}
        {kind === 'project' ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        ) : null}
      </span>
      <span className="_title_dsh">{title}</span>
      {/* dsh swaps these two on hover: the timestamp hides, the menu appears in its place
          (Rows.module.css:240-250). A blank row gets neither — nothing has happened in it yet,
          so rename/fork/archive would act on content that does not exist. */}
      {time ? <span className="_time_dsh">{time}</span> : null}
      {time ? (
        <span className="_rowActions_dsh">
          <button type="button" className="_iconButton_dsh" aria-label={`Actions for ${title}`}>
            {/* dsh draws this glyph ACROSS (IconEllipsisOutline16) and Tracy rotates it upright in
                styles.ts. The bench drew its own vertical dots and so hid the difference: the
                story showed a symbol production did not have. Three dots across, rotated by the
                same rule, is what the product really renders. */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </span>
      ) : null}
    </div>
  )
}

/** Layout dsh ships in its own CSS modules; Tracy owns none of it, so it lives with the stand-in. */
const DSH_SCAFFOLD = `
[data-slot="sidebar.workspaces"] ._sectionHeader_dsh { display: flex; align-items: center; }
[data-slot="sidebar.workspaces"] ._projectRow_dsh,
[data-slot="sidebar.workspaces"] ._sessionRow_dsh {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  color: var(--dsw-alias-label-primary, inherit);
}
[data-slot="sidebar.workspaces"] ._title_dsh {
  flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
[data-slot="sidebar.workspaces"] ._slot_dsh { display: inline-flex; align-items: center; }
[data-slot="sidebar.workspaces"] ._rowActions_dsh { flex: none; display: none; align-items: center; }
[data-slot="sidebar.workspaces"] ._sessionRow_dsh:hover ._rowActions_dsh { display: inline-flex; }
[data-slot="sidebar.workspaces"] ._sessionRow_dsh:hover ._time_dsh { display: none; }
[data-slot="sidebar.workspaces"] ._sectionLabel_dsh { flex: none; line-height: 20px; }
[data-slot="sidebar.workspaces"] ._searchSlot_dsh { flex: 1; display: flex; justify-content: flex-end; }
[data-slot="sidebar.workspaces"] ._headerActions_dsh { flex: none; display: flex; align-items: center; gap: 4px; }
[data-slot="sidebar.workspaces"] ._iconButton_dsh,
[data-slot="sidebar.workspaces"] ._searchButton_dsh {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent;
  color: inherit; cursor: pointer; padding: 0;
}
`

function WorkspaceTree() {
  return (
    <div>
      <style>{DSH_SCAFFOLD}</style>
      {/* The header dsh actually ships: label on the left, then the search control and the two
          trailing actions (WorkspaceBrowser.tsx:1119-1200). The tools were missing from the first
          version of this story, and their absence flattered the title -- with 28px round buttons
          beside it, a 12px label reads much smaller than it does alone. */}
      <div className="_sectionHeader_dsh">
        <span className="_sectionLabel_dsh">Sitespaces</span>
        <div className="_searchSlot_dsh">
          <button type="button" className="_searchButton_dsh" aria-label="Search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="_headerActions_dsh">
          <button type="button" className="_iconButton_dsh" aria-label="Sort and group">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2 4.5h12M2 8h12M2 11.5h12"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="5" cy="4.5" r="1.6" fill="currentColor" />
              <circle cx="10" cy="8" r="1.6" fill="currentColor" />
              <circle cx="6.5" cy="11.5" r="1.6" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="_iconButton_dsh" aria-label="New workspace">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2 5.5A1.5 1.5 0 0 1 3.5 4h2.2l1.3 1.5H10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M2 5.5V12a1.5 1.5 0 0 0 1.5 1.5h7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path d="M12.5 5v5M10 7.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <Row kind="project" title="kimdesigner@example.com" />
      <Row kind="session" title="New Session" selected />
      <Row kind="session" title="Cowork setup" time="2h" running />
      <Row kind="session" title="FACT-INVENTORY visualization" time="1d" />
    </div>
  )
}

// ── Rail — the outermost left column in the screenshot ──────────────────────────────────────

function railStory(t: (k: string) => string, collapsed: boolean) {
  return (
    <HostPage>
      <Rail
        collapsed={collapsed}
        width={280}
        startSession={() => {}}
        toggleSidebar={() => {}}
        t={t as never}
        renderSlot={(name) => {
          if (name === 'sidebar.brand.mark') return <Slot name="brand.mark" h="h-7" />
          if (name === 'sidebar.brand.name') return <Slot name="brand.name" h="h-5" />
          if (name === 'sidebar.workspaces')
            /*
             * 🔒 `data-slot` IS NOT DECORATION — EVERY TRACY RULE FOR THIS COLUMN HANGS OFF IT.
             *
             * dsh wraps each slot's occupant in `[data-slot="<name>"]`; `rail.tsx` never writes
             * the attribute itself, and `styles.ts` selects through it
             * (`.tsb-root [data-slot="sidebar.workspaces"] [class*="sessionRow"]`). Returning
             * the tree bare — as this story did on the first try, 04/09 — makes every one of
             * those rules miss, and the result is not a broken-looking page but a PLAUSIBLE
             * one: rows render, just unstyled. Nothing on screen says the CSS never applied.
             */
            return (
              <div data-slot="sidebar.workspaces" className="p-2">
                <WorkspaceTree />
              </div>
            )
          if (name === 'sidebar.settings')
            /*
             * The REAL Settings occupant, not a placeholder — this one is Tracy's own code
             * (packages/ui/tracy-settings), so unlike dsh's session tree it imports straight in.
             *
             * `useSections` is the live projection of the `settings.section` ledger, which only
             * exists inside dsh. An empty ledger is the honest stand-in: the trigger renders
             * exactly as it ships, and opening it would show a page with no sections — which is
             * why the story leaves it closed.
             *
             * `settings.trigger` is a child slot Tracy declares and something else fills with the
             * label; passing the string through keeps the button the size it really is.
             */
            return (
              // Same wrapper dsh puts around every slot occupant — without it none of Tracy's
              // [data-slot="sidebar.settings"] rules bite, and the miss is silent.
              <div data-slot="sidebar.settings">
                <TracySettingsRoot
                  wide={!collapsed}
                  t={(key: string) => (settingsEn as Record<string, string>)[key] ?? key}
                  renderSlot={() => settingsEn['trigger.label']}
                  useSections={((select: (rows: readonly never[]) => unknown) => select([])) as never}
                />
              </div>
            )
          return <Slot name="footer.action" />
        }}
      />
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        dsh's conversation area — cannot be mounted here, see the note at the top of this file.
      </div>
    </HostPage>
  )
}

/** Rail expanded, 280px — the default shape. */
export const RailWide: Story = {
  name: 'Nav bar — wide (en)',
  render: () => railStory(lookup(railEn as Record<string, string>), false)
}

/** Rail collapsed to 56px. This is the vertical icon column on the left of the screenshot. */
export const RailCollapsed: Story = {
  name: 'Nav bar — collapsed 56px (en)',
  render: () => railStory(lookup(railEn as Record<string, string>), true)
}

/**
 * Same component, with the SHIPPED `vi` dictionary.
 *
 * This is what the story exists to catch: a translation longer than the original breaks the layout, and
 * `check-dsh-locale` cannot see it — it guards keys and placeholders, not width.
 */
export const RailVietnamese: Story = {
  name: 'Nav bar — wide (vi)',
  render: () => railStory(lookup(viSidebar as Record<string, string>), false)
}

// ── My Sites — the "My sites" tab in the screenshot (Vietnamese UI) ────────────────────────

function tabStory(node: ReactNode) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl p-6">{node}</div>
    </div>
  )
}

/**
 * The seat book `MySitesTab` asks for, answered here instead of by `cowork-web`.
 *
 * The tab is the real component and it fetches `/api/sites`, then `/api/team` and `/auth/me`, on
 * mount; Storybook has no Worker behind it, so without this the story showed only "Could not read
 * the seat book" (measured 04/09) — a real screen drawn in its one state nobody wants to review.
 * The rows below are the shapes `apiSites` / `apiTeam` return, with every state the tab can draw:
 * chatting now, openable, no lane yet, an invitation not yet accepted, and one site whose book
 * holds an admin, a pending invitation, a revoked seat and somebody asking to join.
 *
 * 🔒 THE STUB IS INSTALLED DURING RENDER, NOT IN AN EFFECT. A child's effect runs BEFORE its
 * parent's, so a stub installed in `useEffect` arrives after the tab has already asked and
 * failed. `useState`'s initialiser runs while this wrapper renders, ahead of the child.
 */
const ME = 'patowner@example.com'
const seatBook = [
  {
    siteKey: 'beta.tracy.ai',
    platform: 'wordpress',
    role: 'owner',
    status: 'accepted',
    agent: '/',
    copyUrl: 'https://beta-tracy-ai.tracy.ai/'
  },
  {
    siteKey: 'gymshark.com',
    platform: 'shopify',
    role: 'owner',
    status: 'accepted',
    agent: '/',
    copyUrl: 'https://gymshark-com.tracy.ai/'
  },
  {
    siteKey: 'joomlart.com',
    platform: 'joomla',
    role: 'owner',
    status: 'accepted',
    agent: '/',
    copyUrl: 'https://joomlart-com.tracy.ai/'
  },
  {
    siteKey: 'tracy.ai',
    platform: 'wordpress',
    role: 'owner',
    status: 'accepted',
    agent: '/',
    copyUrl: 'https://tracy-ai.tracy.ai/'
  },
  {
    siteKey: 'demo-tracy.myshopify.com',
    platform: 'shopify',
    role: 'editor',
    status: 'accepted',
    agent: '/',
    copyUrl: 'https://demo-tracy.tracy.ai/'
  },
  {
    siteKey: 'tchjoomla4.tracy.ai',
    platform: 'joomla',
    role: 'owner',
    status: 'accepted',
    agent: null,
    copyUrl: 'https://tchjoomla4.tracy.ai/'
  },
  {
    siteKey: 'shop.acme.com',
    platform: 'shopify',
    role: 'viewer',
    status: 'pending',
    agent: null,
    copyUrl: null
  },
  {
    siteKey: 'fijitrips.example',
    platform: 'wordpress',
    role: 'owner',
    status: 'accepted',
    agent: '/',
    copyUrl: 'https://fijitrips-example.tracy.ai/'
  }
]
const day = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * day).toISOString()
const seat = (id: string, email: string, role: string, extra: Record<string, unknown> = {}) => ({
  id,
  email,
  displayName: null,
  // A provider photo for one address, so the story shows all three faces: photo, Gravatar, initials.
  avatarUrl: email === ME ? 'https://lh3.googleusercontent.com/a/ACg8ocLVmYIrvcV3mmrKpQoJ=s96-c' : null,
  role,
  status: 'active',
  grantedAt: ago(21),
  grantedBy: ME,
  revokedAt: null,
  requestedAt: null,
  scope: 'site',
  ...extra
})
const teamBook = seatBook
  .filter((s) => s.status === 'accepted')
  .map((s) => ({
    siteKey: s.siteKey,
    platform: s.platform,
    myRole: s.role,
    status: s.status,
    seats: [
      seat(`${s.siteKey}-me`, ME, s.role, { grantedBy: ME, grantedAt: ago(30) }),
      ...(s.siteKey === 'tracy.ai'
        ? [
            seat('t-1', 'alexshop@example.com', 'editor', { grantedAt: ago(2) }),
            seat('t-2', 'victorl@example.com', 'viewer', {
              displayName: 'Vincent',
              status: 'revoked',
              revokedAt: ago(5)
            }),
            seat('t-3', 'maibuilds@example.com', 'editor', {
              displayName: 'Mai',
              status: 'invited',
              grantedAt: ago(1)
            })
          ]
        : s.siteKey === 'joomlart.com'
          ? [
              seat('j-1', 'alexshop@example.com', 'editor', { grantedAt: ago(2) }),
              seat('j-2', 'victorl@example.com', 'viewer', {
                displayName: 'Vincent',
                grantedAt: ago(5),
                grantedBy: 'alexshop@example.com'
              })
            ]
          : s.siteKey === 'fijitrips.example'
            ? [
                seat('f-1', 'jordanjoiner@example.com', 'editor', {
                  status: 'invited',
                  requestedAt: ago(0.1),
                  grantedAt: ago(0.1),
                  grantedBy: 'jordanjoiner@example.com'
                })
              ]
            : [])
    ]
  }))

function WithSeatBook({ children }: { children: ReactNode }) {
  const [real] = useState(() => {
    const original = window.fetch
    const answer = (body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('/api/sites')) return answer({ sites: seatBook })
      // The invite door answers per person and per site, the way the registry does; one site is
      // refused so the Sent step shows what a refusal looks like beside the successes.
      if (url.startsWith('/api/team/invite')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { emails?: string[]; siteKeys?: string[] }
        return answer({
          results: (body.emails ?? []).map((email) => ({
            email,
            notified: true,
            sites: (body.siteKeys ?? []).map((siteKey) => ({
              siteKey,
              outcome: siteKey === 'gymshark.com' ? 'refused' : 'invited',
              ...(siteKey === 'gymshark.com' ? { code: 'NOT_SITE_OWNER' } : {})
            }))
          }))
        })
      }
      if (url.startsWith('/api/team')) return answer({ sites: teamBook })
      if (url.startsWith('/auth/me')) return answer({ email: ME })
      return original(input, init)
    }
    // The pointer cookie `cowork-web` plants: this window is talking to fijitrips.
    document.cookie = 'tracy_site=fijitrips.example; path=/'
    return original
  })
  useEffect(
    () => () => {
      window.fetch = real
      document.cookie = 'tracy_site=; max-age=0; path=/'
    },
    [real]
  )
  return children
}

export const MySites: Story = {
  name: 'My Sites tab (en)',
  render: () =>
    tabStory(
      <WithSeatBook>
        <MySitesTab t={lookup(mySitesEn as Record<string, string>) as never} />
      </WithSeatBook>
    )
}

/** Phase B: the `…` menu on a row — every door to one site that is not the row itself. */
export const MySitesMoreMenu: Story = {
  name: 'My Sites · the … menu on a row',
  render: () =>
    tabStory(
      <WithSeatBook>
        <MySitesTab t={lookup(mySitesEn as Record<string, string>) as never} />
      </WithSeatBook>
    ),
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 800))
    const more = canvasElement.querySelector('li button[aria-haspopup="menu"]')
    if (more instanceof HTMLElement) more.click()
  }
}

export const MySitesDelete: Story = {
  name: 'My Sites · Delete site, with the name gate',
  render: () =>
    tabStory(
      <WithSeatBook>
        <MySitesTab t={lookup(mySitesEn as Record<string, string>) as never} />
      </WithSeatBook>
    ),
  play: async ({ canvasElement }) => {
    await new Promise((r) => setTimeout(r, 800))
    const more = canvasElement.querySelector('li button[aria-haspopup="menu"]')
    if (more instanceof HTMLElement) more.click()
    await new Promise((r) => setTimeout(r, 150))
    const del = [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
      (n.textContent ?? '').startsWith('Delete site')
    )
    if (del instanceof HTMLElement) del.click()
  }
}

export const MySitesVietnamese: Story = {
  name: 'My Sites tab (vi)',
  render: () =>
    tabStory(
      <WithSeatBook>
        <MySitesTab t={lookup(viMySites as Record<string, string>) as never} />
      </WithSeatBook>
    )
}

// ── Add site — the "Add site" tab in the screenshot (Vietnamese UI) ────────────────────────

/**
 * `AddSiteWizard` rather than `AddSiteTab`, and that is a choice, not a shortcut.
 *
 * `AddSiteTab` does exactly one thing: read `pluginSettings` out of better-sidebar's store and
 * pass it down to `AddSiteWizard`. That store is a service **that exists only in dsh's client half**; faking
 * it means building something nobody can check, in exchange for one config object that can be
 * passed directly here. So the story mounts the wizard directly and **does not touch plugin code** —
 * `AddSiteWizard` is already exported.
 */
export const AddSite: Story = {
  name: 'Add site wizard (en)',
  render: () => tabStory(<AddSiteWizard t={lookup(addSiteEn) as never} settings={{}} openSite={() => {}} />)
}

export const AddSiteVietnamese: Story = {
  name: 'Add site wizard (vi)',
  render: () =>
    tabStory(
      <AddSiteWizard
        t={lookup(viAddSite as Record<string, string>) as never}
        settings={{}}
        openSite={() => {}}
      />
    )
}
