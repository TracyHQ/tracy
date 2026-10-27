/** The mutable logo shape the fallback fills in (matches `Brand['logo']`). */
export interface LogoSlot {
    primary: string | null;
    alternates: string[];
    notes: string;
}
/** Signature of {@link ensureLogoFallback}; injectable so tests avoid network. */
export type LogoFallbackFn = (siteUrl: string, logosDir: string, logo: LogoSlot) => Promise<{
    changed: boolean;
}>;
/** A logo file written into the project/brand `logos/` dir by the fallback. */
export interface FallbackLogo {
    /** Path relative to the dir owner, e.g. `logos/apple-touch-icon.png`. */
    rel: string;
    /** Bare filename inside `logos/`. */
    file: string;
    kind: string;
    sourceUrl: string;
}
interface LogoRef {
    url: string;
    /** Lower number = stronger primary candidate. */
    rank: number;
    kind: string;
}
/** Discover icon/og refs from the page HTML, ranked best-primary-first. */
export declare function findLogoRefs(html: string, baseUrl: string): LogoRef[];
/**
 * Fetch the site's icon/og assets and save any usable ones into `logosDir`.
 * Returns the saved files ranked best-primary-first. Best-effort: any failure
 * (offline, blocked, non-image) yields whatever was salvageable, possibly an
 * empty array — never throws.
 */
export declare function harvestFallbackLogos(siteUrl: string, logosDir: string): Promise<FallbackLogo[]>;
/**
 * Ensure `logosDir` has at least one logo and `logo` carries a primary. When
 * `logo.primary` is already set this is a no-op. When logo files already sit on
 * disk (agent-saved or seed-harvested) but `logo.primary` is empty, those files
 * are adopted into `logo.primary`/`logo.alternates` — otherwise the kit page
 * would report "No logo found" despite real marks living in `logos/`. Only when
 * the dir is genuinely empty does it harvest fallback marks over the network.
 * Mutates and returns `logo`. Best-effort.
 */
export declare function ensureLogoFallback(siteUrl: string, logosDir: string, logo: LogoSlot): Promise<{
    changed: boolean;
}>;
/**
 * Wire the image files already present in `logosDir` into an empty `logo` slot:
 * the best mark (by extension priority, then name) becomes `logo.primary` and
 * the rest become `logo.alternates`, each as a `logos/<file>` path relative to
 * the dir owner. No-op when `logo.primary` is set or the dir holds no image
 * files. Mutates and returns the slot. Pure filesystem — never touches the
 * network.
 */
export declare function adoptExistingLogos(logosDir: string, logo: LogoSlot): {
    changed: boolean;
};
export {};
