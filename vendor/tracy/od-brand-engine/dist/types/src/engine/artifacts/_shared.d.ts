/**
 * artifacts/_shared — the bits every artifact (or 2+ of them) needs: the HTML
 * document shell, the brand-font resolver, the derived-copy helpers (tagline /
 * blurb / pillars / feature & FAQ & pricing copy) and a couple of small markup
 * helpers (wordmark / inverse button / section head). Kept pure: every export
 * is a deterministic `(brand, …) -> string` with no network / Date / random.
 */
import { pricingCard } from "../kit.js";
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
/** Minimal HTML-escape for text injected into markup / attributes. */
export declare function esc(value: string): string;
/** Build the inlined `:root { --brand-*: … }` style block from the tokens. */
export declare function rootVars(tokens: DesignTokens): string;
/**
 * Resolve the brand's web fonts into ready-to-inline `<link>` tags plus a
 * display-face font stack. Used by every artifact document and (via build.ts)
 * by the kit showcase, so headings actually render in the brand's typeface.
 */
export declare function brandFontAssets(brand: Brand): {
    links: string;
    displayFamily: string;
};
/**
 * Wrap a body in a complete HTML document. The base page styles only reference
 * `--brand-*` vars so the whole artifact restyles when the tokens change.
 * Headings pick up the brand's display face via `--display-family`.
 */
export declare function document(opts: {
    title: string;
    tokens: DesignTokens;
    brand: Brand;
    body: string;
    css?: string;
    script?: string;
}): string;
export declare const fallbackTagline = "Built from your brand, in one command.";
export declare function cap(s: string): string;
export declare function brandTagline(brand: Brand): string;
export declare function brandBlurb(brand: Brand): string;
export declare function sourceHost(brand: Brand): string;
/**
 * Tracy: the credit at the foot of every artifact — "Designed by Tracy · Inspired by <name>",
 * the name linking to where that design can be opened (`brand.sourceUrl`).
 *
 * It is marked `data-tracy-credit` because the page these artifacts become is filled with a
 * customer's own words afterwards, and that fill swaps the brand name everywhere it reads it.
 * Without the marker the credit would end up crediting the customer for their own inspiration.
 */
export declare function creditHtml(brand: Brand): string;
export declare function pillarList(brand: Brand): string[];
/**
 * Pillars are often written as "Title — longer explanation" (or with ":" / "·").
 * Split on the first such separator so cards get a short title and a real body
 * instead of a truncated sentence as the title.
 */
export declare function splitPillar(pillar: string): {
    title: string;
    body?: string;
};
/** Short pillar labels (title part only) for checklists and tag rows. */
export declare function pillarTitles(brand: Brand): string[];
export declare const FEATURE_FALLBACKS: Array<{
    title: string;
    body: string;
}>;
/** Six feature blurbs: brand pillars first, quality fallbacks filling the rest. */
export declare function featureCards(brand: Brand): Array<{
    title: string;
    body: string;
}>;
export declare function howSteps(brand: Brand): Array<{
    title: string;
    body: string;
}>;
export declare function faqItems(brand: Brand): Array<{
    title: string;
    body: string;
}>;
export declare function pricingTiers(brand: Brand): Array<Parameters<typeof pricingCard>[0]>;
export declare function quoteCards(brand: Brand): Array<{
    quote: string;
    name: string;
    role: string;
}>;
export declare function partnerNames(brand: Brand): string[];
export declare function statItems(): Array<{
    value: string;
    label: string;
}>;
/** A short logo wordmark — uses the brand name (the engine works text-only). */
export declare function wordmark(brand: Brand, opts?: {
    color?: string;
}): string;
/** Inverse (white) button for use on solid-primary surfaces. */
export declare function inverseButton(label: string): string;
export declare function sectionHead(kicker: string, title: string, lede?: string): string;
export declare function emailFooter(brand: Brand): string;
