import { type FontFile } from "./fonts.js";
export type ColorCandidate = {
    /** Normalized lowercase hex (#rrggbb) when derivable, else raw value. */
    hex: string;
    /** Raw declarations folded into this candidate. */
    count: number;
    /** True for near-white / near-black — listed but de-prioritized. */
    extreme?: boolean;
    /** Compact evidence strings such as css-var:--accent, prop:background, logo-svg:mark.svg. */
    sources?: string[];
};
export type FontCandidate = {
    family: string;
    count: number;
};
export type LogoCandidate = {
    /** Filename inside the brand dir's logos/ folder. */
    file: string;
    sourceUrl: string;
    kind: "favicon" | "apple-touch-icon" | "og-image" | "header-img" | "inline-svg";
    bytes: number;
    contentType?: string;
};
export type PrefetchResult = {
    url: string;
    finalUrl: string;
    siteName: string;
    title: string;
    description: string;
    colors: ColorCandidate[];
    fonts: FontCandidate[];
    fontFaceFamilies: string[];
    googleFontsUrls: string[];
    /** Webfont files downloaded into the brand dir's fonts/ folder. */
    fontFiles: FontFile[];
    logos: LogoCandidate[];
    headings: string[];
    paragraphs: string[];
    navLabels: string[];
    extraPages: Array<{
        url: string;
        title: string;
        text: string;
    }>;
    /** Path (relative to the brand dir) of a page screenshot used as vision
     *  material for the synthesis agent. Always null server-side now that the
     *  headless-Chrome capture was removed (it could not be constrained to public
     *  hosts — SSRF). */
    screenshot: string | null;
    /** True when the harvest looks too thin to synthesize from (likely a
     *  bot-blocked or fully JS-rendered site). The synthesis prompt switches
     *  to "you may WebFetch once" mode. */
    thin: boolean;
    /** True when every fetch path returned an anti-bot challenge page
     *  (Cloudflare "Just a moment…" etc.). The challenge page's own content is
     *  DISCARDED — colors/fonts/copy stay empty rather than polluting the brand
     *  with the interstitial's text and palette. */
    blocked: boolean;
    materialMd: string;
};
export type PrefetchProgress = (step: string, detail?: string) => void;
/** True when the HTML is a bot-protection interstitial (Cloudflare, DataDome,
 *  PerimeterX, …) rather than the real site. Harvesting one of these poisons
 *  every downstream field — "Just a moment…" becomes the brand name.
 *
 *  The check is deliberately asymmetric: a challenge *title* or a challenge-only
 *  body marker blocks unconditionally, but an embeddable widget marker
 *  (Turnstile / DataDome) blocks only when the page is also sparse. That
 *  asymmetry is what lets the in-app browser's post-wall DOM — a real,
 *  content-rich page that still references the widget — survive the harvest
 *  instead of being discarded as if it were the wall itself. */
export declare function isChallengePage(html: string): boolean;
export declare function previewablePrefetchHtml(html: string, cap?: number): string;
/** Normalize a CSS color literal to #rrggbb. Returns null for unsupported
 *  syntaxes (oklch, var() refs, named colors) — those are counted raw. */
export declare function normalizeColor(raw: string): string | null;
export declare function extractColors(css: string): ColorCandidate[];
export declare function extractFonts(css: string): {
    fonts: FontCandidate[];
    fontFaceFamilies: string[];
};
type LogoRef = {
    url: string;
    kind: LogoCandidate["kind"];
};
export declare function findLogoRefs(html: string, baseUrl: string): LogoRef[];
/** First inline <svg> inside <header>/<nav> — very often the wordmark. */
export declare function extractInlineHeaderSvg(html: string): string | null;
export declare function prefetchBrand(url: string, brandDir: string, opts?: {
    onProgress?: PrefetchProgress;
    signal?: AbortSignal;
}): Promise<PrefetchResult | null>;
/** Harvest a brand from HTML the web already rendered (e.g. the in-app browser
 *  tab after the user cleared an anti-bot wall) instead of fetching it. Skips
 *  main-page network fetching; logo/webfont
 *  downloads still run best-effort against `baseUrl`. Returns null on empty
 *  input. The provided `css` (stylesheet text + computed styles collected from
 *  the rendered page) is folded in alongside the inline `<style>` in `html`. */
export declare function prefetchFromHtml(html: string, css: string, baseUrl: string, brandDir: string, onProgress?: PrefetchProgress): Promise<PrefetchResult | null>;
export {};
