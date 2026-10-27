# @tracy-cowork/mockup — Cowork UI Kit

**UI-only** mockup of every Tracy Cowork view (web + desktop). No backend, no
logic, no deploy. This is the visual source of truth: look here before coding a feature,
and once the feature is coded, carry the JSX over to `apps/web` — both import `@tracy-cowork/ui`.

Spec: `docs/superpowers/specs/2026-08-28-cowork-ui-kit-design.md`.

```
pnpm install          # at the workspace root
cd apps/mockup
npx vite              # http://localhost:5199 — opens the Gallery
```

## Rules for adding/changing a view

1. **One view = one entry in `src/views.tsx`** (router + Gallery read the same registry).
   A new view starts as `status: 'planned'` with a `Placeholder` describing its content; once built
   it becomes `'built'`.
2. **Components come from `@tracy-cowork/ui`.** Missing component → port it into `packages/ui`
   following the Base UI standard in use (see `dropdown-menu.tsx` as the model); do NOT copy Radix
   from `vendor/shadcn-admin` into here. That template is only a style/layout reference.
3. **A view does not know whether it is on web or desktop.** The shell (tab bar, icon rail, header) is
   drawn by `src/app/AppFrame.tsx`; toggle it with the floating bar at the bottom centre of the screen. Auth views use
   `shell: 'bare'`.
4. **Data from `src/fixtures/`** — add a fixture rather than hardcoding here and there; no network calls.
5. **UI text in English, with the right vocabulary** [`docs/references/vocabulary.md`](../../../docs/references/vocabulary.md)
   — the vocabulary table moved there on 28/08 because it is a rule for the whole repo, not just the mockup.
