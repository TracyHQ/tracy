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
| `button.tsx` | `button` | `9232355ca09c68a5` |
| `checkbox.tsx` | `checkbox` | `ac40d971d91ef83f` |
| `dialog.tsx` | `dialog` | `0ee6e4ef31a1bb72` |
| `dropdown-menu.tsx` | `dropdown-menu` | `937dd8359582876f` |
| `input.tsx` | `input` | `40d2a22e34d14162` |
| `label.tsx` | `label` | `5428d0bddf31ce3d` |
| `popover.tsx` | `popover` | `0ce3c989d73aa644` |
| `sheet.tsx` | `sheet` | `52baa1065f924958` |
| `textarea.tsx` | `textarea` | `ba4c6005b2ac686a` |
