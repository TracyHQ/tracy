/**
 * FROZEN CONTRACT for the brand engine. Every engine module imports its types
 * and the css-var helpers from here, so the independently-built modules
 * (palette / seed / derive / export / kit / artifacts) stay coherent.
 *
 * Pipeline:  URL ──prefetch──▶ material ──synthesize──▶ SeedToken
 *            SeedToken ──derive(algorithm)──▶ DesignTokens   (the "style system")
 *            DesignTokens ──export──▶ tokens.json / variables.css / theme.json
 *            DesignTokens ──kit──▶ themed components (HTML)
 *            kit + Brand ──artifacts──▶ products (landing / email / poster …)
 *
 * Design choices that make this a *minimal* Ant-Design-style engine:
 *  - The brand is reduced to a tiny SeedToken (~20 fields); everything else is
 *    deterministically DERIVED. This is why one URL yields a whole system.
 *  - Variants (light / dark / compact) are the SAME seed run through a
 *    different algorithm — never hand-authored.
 */
export interface SeedToken {
    /** The single brand seed color. Becomes palette index 5 (the 6th step). */
    colorPrimary: string;
    /**
     * Tracy: text on the primary colour when the brand SAYS it (a library system's `--accent-on`);
     * left out, derive picks white or black by contrast. See DesignTokens.colorPrimaryContrast.
     */
    colorPrimaryContrast?: string;
    colorSuccess: string;
    colorWarning: string;
    colorError: string;
    colorInfo: string;
    /** Empty string => falls back to colorInfo at derive time. */
    colorLink: string;
    /** "#000000" on light themes, "#ffffff" on dark — neutral text is derived from this via alpha. */
    colorTextBase: string;
    /** "#ffffff" on light themes, "#000000" on dark. */
    colorBgBase: string;
    fontFamily: string;
    fontFamilyCode: string;
    /** Base body font size in px (14). The whole modular scale derives from this. */
    fontSize: number;
    /** Base corner radius in px (6). */
    borderRadius: number;
    /** Spacing base unit / step in px (4 / 4). The 8px grid is sizeUnit*2. */
    sizeUnit: number;
    sizeStep: number;
    /** Default control height in px (32). */
    controlHeight: number;
    lineWidth: number;
    /** Motion duration unit in seconds (0.1) and base offset (0). */
    motionUnit: number;
    motionBase: number;
    /** Outline-only (wireframe) mode and global motion on/off. */
    wireframe: boolean;
    motion: boolean;
}
export type ThemeAlgorithm = "default" | "dark" | "compact";
/** Full color ladder for one semantic color (primary or a functional color). */
export interface ColorTokenSet {
    /** The 10-step palette, index 0 = lightest, 5 = base, 9 = darkest. */
    palette: string[];
    base: string;
    bg: string;
    bgHover: string;
    border: string;
    borderHover: string;
    hover: string;
    active: string;
    text: string;
}
/**
 * The complete, ready-to-consume token set. Flat antd-style names so it maps
 * 1:1 onto CSS custom properties (see flattenTokens / cssVar). Lengths are px
 * numbers, line-heights & font-weights are unitless numbers, durations are
 * second-strings ("0.2s"), colors & families are strings.
 */
export interface DesignTokens {
    algorithm: ThemeAlgorithm;
    colorPrimary: string;
    colorPrimaryBg: string;
    colorPrimaryBgHover: string;
    colorPrimaryBorder: string;
    colorPrimaryBorderHover: string;
    colorPrimaryHover: string;
    colorPrimaryActive: string;
    colorPrimaryText: string;
    /**
     * Tracy: text and icons ON a primary surface — white or black, whichever reads against
     * `colorPrimary` (WCAG contrast; white kept from 3:1 up). The artifacts used to write `#fff`
     * here, which vanished on the 47 of 152 library systems with a light accent (yellow, cream,
     * pale blue). A system's own `--accent-on` says the same thing; this is derived so a brand
     * pulled from a URL gets it too.
     */
    colorPrimaryContrast: string;
    /**
     * Tracy: the primary used AS TEXT on the page background — the accent itself when it reads
     * (4.5:1 against `colorBgBase`), else `colorPrimaryText`, the darker step of its ladder.
     */
    colorPrimaryInk: string;
    colorSuccess: string;
    colorSuccessBg: string;
    colorSuccessBorder: string;
    colorSuccessHover: string;
    colorSuccessActive: string;
    colorWarning: string;
    colorWarningBg: string;
    colorWarningBorder: string;
    colorWarningHover: string;
    colorWarningActive: string;
    colorError: string;
    colorErrorBg: string;
    colorErrorBorder: string;
    colorErrorHover: string;
    colorErrorActive: string;
    colorInfo: string;
    colorInfoBg: string;
    colorInfoBorder: string;
    colorLink: string;
    colorLinkHover: string;
    colorLinkActive: string;
    colorText: string;
    colorTextSecondary: string;
    colorTextTertiary: string;
    colorTextQuaternary: string;
    colorFill: string;
    colorFillSecondary: string;
    colorFillTertiary: string;
    colorFillQuaternary: string;
    colorBgLayout: string;
    colorBgContainer: string;
    colorBgElevated: string;
    colorBorder: string;
    colorBorderSecondary: string;
    fontFamily: string;
    fontFamilyCode: string;
    fontSize: number;
    fontSizeSM: number;
    fontSizeLG: number;
    fontSizeXL: number;
    fontSizeHeading1: number;
    fontSizeHeading2: number;
    fontSizeHeading3: number;
    fontSizeHeading4: number;
    fontSizeHeading5: number;
    lineHeight: number;
    lineHeightHeading: number;
    fontWeightStrong: number;
    sizeXXS: number;
    sizeXS: number;
    sizeSM: number;
    size: number;
    sizeMD: number;
    sizeLG: number;
    sizeXL: number;
    sizeXXL: number;
    borderRadiusXS: number;
    borderRadiusSM: number;
    borderRadius: number;
    borderRadiusLG: number;
    lineWidth: number;
    controlHeightXS: number;
    controlHeightSM: number;
    controlHeight: number;
    controlHeightLG: number;
    motionDurationFast: string;
    motionDurationMid: string;
    motionDurationSlow: string;
    motionEaseInOut: string;
    motionEaseOut: string;
    primaryPalette: string[];
    presets: Record<string, string[]>;
}
/** Everything the engine produces for one brand, as in-memory files. */
export interface BrandSystem {
    slug: string;
    seed: SeedToken;
    themes: Record<ThemeAlgorithm, DesignTokens>;
    /** relative path → file contents, ready to write to disk. */
    files: Record<string, string>;
}
export declare const CSS_VAR_PREFIX = "brand";
/** "colorPrimaryBg" → "--brand-color-primary-bg"; "fontSizeHeading1" → "--brand-font-size-heading-1". */
export declare function cssVar(tokenKey: string): string;
/** Convenience for kit/artifacts: `varRef("colorPrimary")` → "var(--brand-color-primary)". */
export declare function varRef(tokenKey: string, fallback?: string): string;
/**
 * True when a scraped font family name is safe to embed in a CSS font stack.
 *
 * Extractors sometimes capture CSS *source text* instead of a real family —
 * e.g. Tailwind v4's `--theme(--default-font-family` — and one unbalanced
 * parenthesis inside the emitted `--brand-font-family` value swallows every
 * later `:root` declaration, unstyling the whole kit. A real family name
 * (including CJK names) never needs CSS syntax characters, so reject any
 * candidate that carries them or reads as a custom property reference.
 */
export declare function isRenderableFontFamily(raw: string): boolean;
/** Format a single token value into a CSS-ready string (adds px / leaves unitless / passes strings through). */
export declare function formatTokenValue(key: string, value: string | number): string;
/**
 * Flatten DesignTokens into ordered { cssVarName → css-ready value } pairs.
 * Arrays (palettes) expand to `<name>-<1-based-index>`. Objects (presets)
 * expand to `<name>-<key>-<1-based-index>`. `algorithm` is skipped.
 */
export declare function flattenTokens(tokens: DesignTokens): Array<{
    name: string;
    value: string;
}>;
