---
description: The desktop app is a shell around the web — a feature the web can do is built on the web first, and the app renders the same pages so it gets it for free; the app does on its own only what the web cannot (saving files to the machine, scheme, windows, auto-update); users are steered to install the app with words and layout, never by cutting web features; applies to UI/UX and the design system alike
sources:
  - packages/desktop/tracy-desktop/src/main.js
  - apps/tracy-web/src/workspace/route.js
  - apps/tracy-web/src/bar/pages.js
  - apps/tracy-web/src/lib/desktop-surface.js
  - .github/pull_request_template.md
  - scripts/check-pr-description.mjs
  - tasks/todo-quickstart-desktop-only.md
---

# 0030 — Desktop is a shell around the web

**Status:** (binding) · 11/10/2026 · Brian (PO) decided, Claude wrote it. Extends [ADR 0004](0004-dsh-is-the-shell.md)
(dsh is the shell): the desktop app is one more shell around those same server pages.

**Council not consulted**: this is a product rule Brian set after seeing line #1171 drift; the council
had critiqued that very line in `.claude/council-cache/council-1791714502.md` and did not raise parity —
that is the gap this ADR closes.

## Context

The desktop app (`packages/desktop/tracy-desktop`) is Electron wrapping exactly the server pages of
`apps/tracy-web`: `/login`, `/new?template=`, the Site page, the workspace. So a feature built on the web
is **automatically present** in the app without changing the app; the app only adds the shell (title
bar, windows, menus, auto-update, sign-in through the system browser).

Measured on 11/10/2026 in PR #1171: to push the "install Tracy Desktop" KPI, the line had built a
`403 DESKTOP_ONLY` gate at the quickstart download door — the web could not download, the app could.
The council, the agent and the plan author all followed the KPI and nobody asked "do the web and the app
diverge?". Brian removed that gate the same day: feature divergence makes two copies that are hard to
maintain (two code paths, two ways to break) and breaks the experience when a user switches between web
and app — same account, same page, yet one side has the button and the other does not.

## Decision

1. **Web first.** A new feature the web can do is built in `apps/tracy-web` (or a dsh plugin), measured
   on the web, then opened in the app to confirm. No feature is born in the app first.
2. **The app does on its own only what the web cannot:** saving files to the machine (`will-download`),
   the `tracy://` scheme, windows/title bar/menus/tray, auto-update, keeping the session per machine,
   sign-in through the system browser. A PR that changes `packages/desktop/` must say *why the web cannot
   do it*.
3. **Do not cut web features to force an app install.** Steer with words and layout (a bigger button, a
   GIF, opening the right page after install, "Also in Tracy Desktop"), not with `403`, not by hiding a
   button.
4. **UI/UX and the design system too:** same pages, same tokens (`@tracy/ui/tokens.css`,
   `page-shell-tokens.md`), same vocabulary, same interface language. The app draws only the shell.
5. **A handoff is not feature divergence.** A behaviour that runs only in the app because it is *about*
   the app (root `/` following the "pending template" after install, `lib/desktop-surface.js`) is fine,
   as long as the web loses nothing.

## How it is guarded

It cannot be guarded by a machine (a gate does not know what a "feature" is), so it is guarded by people
in two places:

- The PR description has a **`### Web and desktop`** section (template
  `.github/pull_request_template.md`), and the `description` gate (`scripts/check-pr-description.mjs`)
  requires it to have content: one line "Both the same", or "Desktop only — web cannot: …", or
  "N/A — does not touch a user surface".
- `CLAUDE.md` §8 states this rule; briefs for agents working on user surfaces copy that sentence.

## Consequences

- #1171 keeps one shared landing page for web and app (Build + zip), and the web adds a block inviting
  users to install the app; the zip door no longer looks at the user agent.
- The next "download backup" line: the export door is built on the web and the app gets it for free;
  the app only adds saving the file to the machine when it reaches the `will-download` stage.
- From now on an idea of "only the app has X" must first answer: why can't the web do X? If it cannot
  answer, X belongs to the web.
