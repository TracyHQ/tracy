# Provenance — shadcn/ui primitives

Imported once with the shadcn CLI and committed as source. A clean install does NOT contact the
registry: these files are part of the template.

- CLI: `shadcn@4.21.0` (`pnpm dlx shadcn@4.21.0 add <items> --yes`), 2026-09-13
- Registry: default (https://ui.shadcn.com), style `new-york`, base colour `neutral`, Tailwind v4 CSS variables
- Runtime deps pinned in package.json: radix-ui 1.6.7 · lucide-react 1.45.0 · class-variance-authority 0.7.1 · clsx 2.1.1 · tailwind-merge 3.7.0
- License: MIT (shadcn/ui, © shadcn) — https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
- Local edit after import: the CLI wrote `import { cn } from "cn"`; rewritten to `@/lib/utils` (the alias
  components.json declares). No other edits. Re-running `shadcn add` overwrites these files — re-apply the
  import fix and refresh the hashes below (`node tools/provenance.mjs`).

| File | Registry item | sha256 (16) |
|---|---|---|
| `button.tsx` | `button` | `557e27d5d3159c33` |
| `checkbox.tsx` | `checkbox` | `6b11e8c6c0898ab3` |
| `dropdown-menu.tsx` | `dropdown-menu` | `36fa7f5d46f6171a` |
| `input.tsx` | `input` | `7bfd0eff6c53a38c` |
| `label.tsx` | `label` | `db5dfcd98a78c5b7` |
| `popover.tsx` | `popover` | `5c20c50041dd3a0f` |
| `textarea.tsx` | `textarea` | `7c7122fc969c6222` |
