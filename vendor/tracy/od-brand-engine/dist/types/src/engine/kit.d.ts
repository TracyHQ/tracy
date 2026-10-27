/**
 * The themed component kit. Every component is a pure function returning an
 * HTML string whose colors/spacing/typography come *only* from the derived
 * design-token CSS custom properties (`var(--brand-*)`, via `varRef`). Nothing
 * here is hand-tuned per brand: the same markup re-skins itself the moment the
 * `:root` token block changes — that is what makes a single Seed yield a whole
 * coherent component set across light / dark / compact variants.
 *
 * Fragment functions (button / card / input / tag / alert / swatches /
 * typeScale) return *fragments* (no <html> shell) with inline `style`. Only
 * `renderKitPage` returns a full standalone document: it inlines the
 * `:root{ --brand-…: … }` block itself (built from `flattenTokens`, so it does
 * not depend on export.ts) and lays out a showcase of every component.
 */
import { type DesignTokens } from "./types.js";
type ButtonType = "primary" | "default" | "dashed" | "text" | "link";
type Size = "sm" | "md" | "lg";
export declare function button(opts: {
    label: string;
    type?: ButtonType;
    size?: "sm" | "md" | "lg";
}): string;
export declare function card(opts: {
    title?: string;
    body: string;
    footer?: string;
}): string;
export declare function input(opts: {
    placeholder?: string;
    label?: string;
    value?: string;
}): string;
export declare function tag(opts: {
    label: string;
    color?: string;
}): string;
export declare function alert(opts: {
    type?: "success" | "info" | "warning" | "error";
    message: string;
    description?: string;
}): string;
/**
 * States that inline styles cannot express (hover, focus, details[open]).
 * `renderKitPage` and every artifact document inline this once; fragments
 * still render acceptably without it.
 */
export declare const KIT_CSS: string;
/** Initials avatar — up to two initials on a primary-tinted disc. */
export declare function avatar(opts: {
    name: string;
    size?: Size;
}): string;
/** A big-number metric with a small label underneath. */
export declare function stat(opts: {
    value: string;
    label: string;
}): string;
/** Horizontal rule, optionally with a centered label. */
export declare function divider(opts?: {
    label?: string;
}): string;
export declare function textarea(opts: {
    label?: string;
    placeholder?: string;
    rows?: number;
}): string;
export declare function select(opts: {
    label?: string;
    options: string[];
    value?: string;
}): string;
export declare function checkbox(opts: {
    label: string;
    checked?: boolean;
}): string;
export declare function switchToggle(opts?: {
    on?: boolean;
    label?: string;
}): string;
export declare function tabs(opts: {
    items: string[];
    active?: number;
}): string;
export declare function breadcrumb(opts: {
    items: string[];
}): string;
export declare function pagination(opts: {
    total: number;
    current: number;
}): string;
export declare function progress(opts: {
    percent: number;
}): string;
export declare function steps(opts: {
    items: Array<{
        title: string;
        description?: string;
    }>;
    current?: number;
}): string;
export declare function table(opts: {
    columns: string[];
    rows: string[][];
}): string;
/** Native `<details>` accordion — works with no JavaScript (FAQ-ready). */
export declare function accordion(opts: {
    items: Array<{
        title: string;
        body: string;
    }>;
    open?: number;
}): string;
export declare function testimonial(opts: {
    quote: string;
    name: string;
    role: string;
}): string;
export declare function pricingCard(opts: {
    plan: string;
    price: string;
    period?: string;
    blurb?: string;
    features: string[];
    cta: string;
    highlighted?: boolean;
}): string;
export declare function swatches(tokens: DesignTokens): string;
export declare function typeScale(tokens: DesignTokens): string;
export declare function renderKitPage(tokens: DesignTokens, opts?: {
    title?: string;
    brandName?: string;
    fontLinks?: string;
    displayFamily?: string;
}): string;
export {};
