/**
 * artifacts — the last hop of the pipeline. Where `kit` produces individual
 * themed components, `artifacts` composes them into *products* that follow the
 * real-world playbook for each medium:
 *
 *   landing     nav → hero → social proof → problem (PAS) → value pillars
 *               → how-it-works → features → proof → FAQ → pricing → final CTA
 *               → footer  (the 12-module docs/content-structures order)
 *   deck        11-slide pitch skeleton (Cover · Problem · Solution · Why now ·
 *               Market · Product · Business model · Competition & Moat ·
 *               Traction · Team · Ask) with scroll-snap + keyboard paging
 *   poster      3:4 print-style sheet, container-query type so nothing clips
 *   email       single-column 600px announcement with hero, checklist & CTA
 *   newsletter  masthead + numbered stories digest
 *   form        split-screen contact/signup page
 *
 * Everything visual flows from DesignTokens (inlined as a `:root` block of
 * `--brand-*` custom properties), copy is pulled from the Brand (name /
 * tagline / description / voice) with production-quality fallbacks, and the
 * brand's Google Fonts are loaded when the kit declares them. The output of
 * every function is a complete, standalone HTML document.
 *
 * Each medium lives in its own module; the shared shell + copy helpers live in
 * `_shared`. This barrel re-exports `brandFontAssets` and the public dispatch
 * (`renderArtifact` / `renderArtifactGallery`) so `./artifacts` resolves here.
 */
import type { Brand, AssetKind } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export { brandFontAssets } from "./_shared.js";
/**
 * Render a complete, standalone HTML product for `kind`, themed entirely by
 * `tokens` and written from `brand`'s copy. Every AssetKind has a bespoke,
 * best-practice layout; unknown kinds fall back to a sensible card page.
 */
export declare function renderArtifact(kind: AssetKind, brand: Brand, tokens: DesignTokens): string;
/**
 * A single overview page that shows every artifact product side by side via
 * sandboxed `<iframe srcdoc>` thumbnails — handy for a quick "what does this
 * brand produce?" glance.
 */
export declare function renderArtifactGallery(brand: Brand, tokens: DesignTokens, opts?: {
    /** Applied to each artifact document before it is escaped into srcdoc —
     *  e.g. inlining @font-face rules with gallery-relative urls. */
    decorate?: (html: string) => string;
}): string;
