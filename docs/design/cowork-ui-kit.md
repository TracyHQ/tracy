> **A record, not a current rule.** Originally copied verbatim from
> `tracy-infra/docs/superpowers/specs/2026-08-28-cowork-ui-kit-design.md` into TCH on
> 2026-08-30. **The body below is an English translation of the 2026-08-28 record, otherwise
> unchanged in substance** — a spec is a record of one moment, and rewriting it rewrites history.
> The `superpowers` path in the old file name was dropped: that skill set was removed on
> 2026-08-29 and is no longer referenced (see `CLAUDE.md`).
>
> Read it together with this mapping table, because the repo layout has changed:
>
> | In the spec | In TCH |
> |---|---|
> | `apps/mockup`, `@tracy-cowork/mockup` | `packages/dev/tracy-design`, `@tracy/design` |
> | `apps/web` | `packages/web/tracy-frontend`, `@tracy/web-frontend` (deleted 05/10/2026) |
> | `packages/ui`, `@tracy-cowork/ui` | `packages/ui/tracy-ui`, `@tracy/ui` |
> | `apps/mockup/VOCABULARY.md` | `docs/references/vocabulary.md` |
>
> Two words in the spec were removed from the vocabulary THE NEXT DAY (29/08) and are deliberately
> left as they are here: read **"Workbench"** as "the screen for working on one site", and **"Frame"**
> as the application frame (`App`). See `docs/references/vocabulary.md`, the section on names that
> are not displayed also being vocabulary.
>
> One decision in the spec was reversed: §Technical constraints says **React 19**, while TCH pins
> **React 18.3.1**, because dsh's client is built and tested on 18 — see
> `packages/web/tracy-frontend/vite.config.ts` (package deleted 05/10/2026; see git history).

# Cowork UI Kit (shadcn-cowork) — design

Date: 2026-08-28. Status: approved (chat).

## Goal

A **UI-only** mockup app in `apps/mockup` — the visual source of truth for every view of
Tracy Cowork (web + desktop). No backend, no logic, no deploy. You and agents look
here to see what a feature looks like before writing the real code; when writing the real code, move the JSX to
`apps/web`, since both share `@tracy-cowork/ui`.

What drives this: the desktop build (dsh sidecar) and the web have drifted apart, the Settings panel has a broken
layout, and there is no complete set of views yet. Target: **one experience, one codebase** on both surfaces.

## Settled decisions

1. **Form**: a separate Vite app `apps/mockup` (`@tracy-cowork/mockup`), react-router,
   one route per view, a Gallery page as the index (view groups + built/placeholder status).
2. **Missing components are ported into `packages/ui`** following the Base UI standard in use — do NOT copy
   Radix components from vendor/shadcn-admin into the app (prevents drift, boundary rule #2).
   vendor/shadcn-admin is only a style/layout reference.
3. **Views don't know where they are**: pure components; a `Frame` wrapper with a
   `web`/`desktop` toggle (desktop also draws traffic lights + tab bar + icon rail). The same JSX
   renders in both frames.
4. **Data = fixtures** in `src/fixtures/` (sites, members, changes, sessions,
   messages…). Interaction only at the level of navigation/open-close.
5. **UI text in English**, following the tracy-desk canonical vocabulary (inventoried from
   `i18n/locales/en-us.json`): Site connection, Team, Permission mode, Live site,
   Proposal, Nightly Sync, Roles & permissions… Do NOT use "Creator mode",
   "Session log", "Workspace Write" (not in the canonical vocabulary). Plus
   `apps/mockup/VOCABULARY.md` for agents to look up.

## View catalogue (routes)

**A. Shell & Workbench** *(wave 2 — build now)*
- Desktop shell: tab bar (site tabs + Launchpad + Your workspace + Settings),
  left icon rail (avatar, entries, site rows, Inbox, Settings).
- Three-pane workspace **Chat | Changes | Preview**: session header + task picker,
  message list, composer + suggestion chips; Changes grouped Core/Design/Add-ons/Content
  with diff stats; Preview toolbar (back/forward/refresh, address bar "doors"
  Preview·Live site·Admin·Proposal, Open in Browser).
- Right tab: Changes · History · Scan · Files (History + Scan built, the rest placeholders).

**B. Home & Launchpad** *(wave 4)*
- Your workspace (site list), Launchpad, Add site flow: URL entry → "This looks like a
  {platform} site" → admin login (WordPress/Joomla/Shopify) → progress steps.

**C. Auth & onboarding** *(wave 4)*
- Sign in (email code + Google), Verify code, Join team / Request to join, Guest banner.

**D. System Settings** *(wave 3)* — 3-column shell, nav groups
Tools/Sites/Preferences/Efficiency/System.
- Build now: Appearance (Theme, Primary color, Language, Zoom, Font), Notifications,
  MCP, Skills. Placeholders: Model Provider, Channels, Scheduled Tasks, Shortcuts,
  System, About.

**E. Site Settings** *(wave 3)* — General, Reskins / Your team: Team, GitHub, MCP,
Skills / Data & scanning: Connection, Data sources, Scans / Advanced.
- Build now: General, Team (member table + Invite + Roles & permissions matrix),
  Connection (per-platform). The rest are placeholders with routes in place.

## Sequence

1. **Wave 1 — foundation**: port components into packages/ui (avatar, scroll-area, textarea,
   popover, alert, radio-group, collapsible…), build the app + Gallery + Frame + fixtures.
2. **Wave 2 — workbench**. 3. **Wave 3 — settings**. 4. **Wave 4 — auth + add site +
   launchpad**. The rest is added gradually as features need it.

## Technical constraints

- Stack in sync with apps/web: Vite 7 + @tailwindcss/vite (v4) + React 19 + TS strict;
  `@source` declares packages/ui + core in style.css.
- packages/ui: Base UI (`@base-ui/react`), `data-slot` + `cn()` pattern like the
  existing components; exported via `src/index.ts`.
- No secrets, no network calls, no worker code — per boundary rule #1.

## Out of scope

- Do not deploy the mockup to any domain (user surface = cowork.tracy.ai, rule #5).
- Do not change the behaviour of apps/web / cowork-web within this scope.
- Do not translate/rename third-party products in fixtures.
