/**
 * Tracy's seventh sample product: `typography.html` — the direction's own type specimen, colour
 * roles, spacing ladder, and its DESIGN.md, drawn in the direction's own tokens (Lee, 06/09 17:4x:
 * "About this direction" was a typography page drawn outside the iframe; make it an artifact and
 * drop the reading block). Same shell and `--brand-*` vocabulary as upstream's six renderers
 * (`src/engine/artifacts/`), so it is a sibling of theirs and runs for a customer's brand and for
 * a library direction alike. Pure and deterministic: (brand, tokens, designMd) → string.
 *
 * The specimen sentences are plain text nodes on their own elements, so `slotsOf` finds them and
 * the dialog's "Your words" / "More version" can rewrite them like any other product's copy. Every
 * other section — faces, colour roles, spacing, the notes — is marked `data-slots="skip"`: hex codes,
 * size labels and DESIGN.md are facts, not copy, and a model must not be offered them.
 *
 * Tracy-owned file (like `tracy-tokens.ts`); upstream has no typography kind.
 */
import type { Brand } from './contracts/api/brands.js';
import { type DesignTokens } from './src/engine/types.js';
/**
 * @param designMd The direction's DESIGN.md (front matter included; it is stripped here). Empty → no notes section.
 */
export declare function renderTypography(brand: Brand, tokens: DesignTokens, opts?: {
    designMd?: string;
}): string;
export declare function markdownToHtml(md: string): string;
