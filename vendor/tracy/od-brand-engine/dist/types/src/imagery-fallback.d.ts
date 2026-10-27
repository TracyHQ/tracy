import type { BrandImagerySample } from '@open-design/contracts';
/** The mutable imagery shape the fallback fills in (a subset of `BrandImagery`). */
export interface ImagerySlot {
    samples?: BrandImagerySample[];
}
/** Signature of {@link ensureImageryFallback}; injectable so tests avoid network. */
export type ImageryFallbackFn = (siteUrl: string, imageryDir: string, imagery: ImagerySlot) => Promise<{
    changed: boolean;
}>;
/** An image file written into the `imagery/` dir by the fallback. */
export interface FallbackImage {
    /** Path relative to the dir owner, e.g. `imagery/hero-0.jpg`. */
    rel: string;
    /** Bare filename inside `imagery/`. */
    file: string;
    kind: string;
    sourceUrl: string;
    /** Decoded pixel area, used for largest-first ranking. */
    area: number;
}
interface ImageRef {
    url: string;
    /** Lower number = stronger representative candidate. */
    rank: number;
    kind: string;
}
/**
 * Discover representative-image refs from the page HTML, ranked best-first.
 * Pure (no I/O) so it is unit-testable offline. Order: social card images,
 * then large hero `<img>`/`<picture>`/preload sources, then CSS hero
 * backgrounds, then the remaining content images.
 */
export declare function findImageRefs(html: string, baseUrl: string): ImageRef[];
/**
 * Decode the pixel dimensions of a PNG / GIF / JPEG / WebP buffer from its
 * header, or null when the format is unrecognized (AVIF and anything else just
 * fails the size gate gracefully). Header-only — never decodes pixel data.
 */
export declare function imageSize(buf: Buffer): {
    w: number;
    h: number;
} | null;
/**
 * Fetch the site's representative images and save the largest usable ones into
 * `imageryDir`, deduped by content hash. Returns the saved files ranked by
 * candidate strength then decoded area. Best-effort: any failure (offline,
 * blocked, non-image) yields whatever was salvageable, possibly an empty array
 * — never throws.
 */
export declare function harvestSiteImagery(siteUrl: string, imageryDir: string, alreadySaved?: number): Promise<FallbackImage[]>;
/**
 * Wire image files already present in `imageryDir` into `imagery.samples` when
 * they are not referenced yet. Pure filesystem — never touches the network — so
 * an agent that downloaded images but forgot to list them still gets a gallery.
 * Mutates and returns `{ changed }`.
 */
export declare function adoptExistingImagery(imageryDir: string, imagery: ImagerySlot): {
    changed: boolean;
};
/**
 * Ensure `imagery.samples` carries enough representative images for the kit
 * gallery. No-op when the agent already listed at least {@link MIN_SAMPLES}.
 * Otherwise it first adopts any image files already on disk (offline), then —
 * if still short — harvests the site's cover/hero images over the network and
 * appends them. Mutates and returns `imagery`. Best-effort; never throws.
 */
export declare function ensureImageryFallback(siteUrl: string, imageryDir: string, imagery: ImagerySlot): Promise<{
    changed: boolean;
}>;
export {};
