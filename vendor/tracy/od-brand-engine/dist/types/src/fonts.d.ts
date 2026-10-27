import type { Brand } from "./schema.js";
/**
 * Webfont self-hosting for a brand workspace.
 *
 * `harvestFonts` parses `@font-face` rules out of harvested CSS, downloads the
 * best source per face (woff2 preferred) into `<brandDir>/fonts/`, and keeps a
 * `fonts/manifest.json` + portable `fonts/fonts.css` in sync. The engine then
 * inlines matching `@font-face` rules into every system document (kit,
 * artifacts, index) so previews — and the exported .brandpack — render in the
 * brand's real typefaces instead of fallbacks.
 *
 * Two ingestion moments feed the same manifest:
 *  - prefetch time: faces declared by the site's own CSS (incl. Google Fonts
 *    stylesheets the page links);
 *  - enrichment time: `selfHostGoogleFonts` fetches the Google Fonts CSS the
 *    synthesis agent picked (real face or visual stand-in) so even brands
 *    behind bot walls ship with loadable font files.
 */
export type FontFile = {
    family: string;
    /** Raw CSS font-weight value — "400", "700", or a variable range "100 900". */
    weight: string;
    style: string;
    /** Filename inside the brand dir's fonts/ folder. */
    file: string;
    format: string;
    sourceUrl: string;
    bytes: number;
    unicodeRange?: string;
};
export type FontManifest = {
    format: "brand-fonts/1";
    files: FontFile[];
};
export type FontFaceRef = {
    family: string;
    weight: string;
    style: string;
    url: string;
    format: string;
    unicodeRange?: string;
};
/** Parse every usable @font-face rule out of a CSS blob. Pure. */
export declare function parseFontFaces(css: string, baseUrl: string): FontFaceRef[];
export declare function readFontManifest(brandDir: string): FontFile[];
/** Re-emit @font-face rules for the manifest, urls prefixed by `urlPrefix`. */
export declare function fontFaceCss(files: FontFile[], urlPrefix: string): string;
/** Inline self-hosted @font-face rules into a rendered HTML document. */
export declare function injectFontFaces(html: string, files: FontFile[], urlPrefix: string): string;
/**
 * Download the webfonts declared by `css` into `<brandDir>/fonts/` and merge
 * them into the manifest. Faces whose (family, weight, style) is already
 * self-hosted are skipped; icon fonts are dropped; for subsetted faces only
 * the latin slice is taken. Families in `preferFamilies` (the site's actually
 * *used* stacks) download first so caps cut the long tail, not the brand face.
 */
export declare function harvestFonts(css: string, baseUrl: string, brandDir: string, opts?: {
    preferFamilies?: string[];
    referer?: string;
}): Promise<FontFile[]>;
/**
 * Self-host the Google Fonts faces the synthesized brand declares
 * (`typography.*.googleFontsUrl`) — fetches each stylesheet with a modern-
 * browser UA (so Google serves woff2) and harvests the files into fonts/.
 * Families already in the manifest are skipped by the harvest's dedupe.
 */
export declare function selfHostGoogleFonts(brand: Brand, brandDir: string): Promise<FontFile[]>;
