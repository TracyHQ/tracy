---
description: Rename the Workspace label following the original letter case; keep lowercase workspace and technical identifiers.
sources:
  - docs/references/vocabulary.md
  - docs/references/i18n.md
  - packages/locale/tracy-locale-vi/terms.ts
  - packages/ui/tracy-settings/src/client/strings.ts
  - packages/ui/tracy-sidebar/src/client/strings.ts
  - packages/dev/tracy-design/src/views.tsx
---

# 0032 — Rename the Workspace label following the original letter case

**Status:** (binding) · 12/10/2026 · Lee decided, Codex recorded.

## Context

Some Tracy labels use Workspace/Workspaces as a display name; other sentences use workspace as a common noun, and code uses workspace in APIs and identifiers. Only the labels with product letter case need to change.

## Decision

1. Rename `Workspace` to `Sitespace`, `Workspaces` to `Sitespaces`, and `WorkSpace` to `SiteSpace`, keeping the letter case of the original form.
2. Add `Sitespace` and `Sitespaces` to the keep-as-is list of every translation. Keep `workspace` in the list because lowercase sentences still use this word.
3. Keep lowercase `workspace` unchanged in descriptive sentences and technical code, as well as APIs, URLs, keys, data types, packages and dsh identifiers.

## Consequences

Settings labels, screen titles and list labels reflect the new spelling; descriptive sentences still use lowercase workspace. No change to data or protocols.
