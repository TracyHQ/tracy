/**
 * build.ts — the integration seam that turns one input (a Brand kit or a raw
 * URL) into a complete, writable BrandSystem.
 *
 * It wires the six engine modules into the single pipeline the framework
 * promises:
 *
 *   Brand / URL ──seed──▶ SeedToken
 *   SeedToken   ──derive(default|dark|compact)──▶ DesignTokens × 3
 *   DesignTokens ──export──▶ tokens.json / variables.css / theme.json
 *   DesignTokens ──kit──▶ kit.html (themed component showcase)
 *   DesignTokens + Brand ──artifacts──▶ landing / email / poster HTML
 *
 * Everything is assembled in memory as a `files: { relPath → content }` map so
 * the same bundle can be returned over HTTP, written to disk by the CLI, or
 * inspected in a test — without any of those paths re-implementing the wiring.
 *
 * `buildBrandSystem` is fully deterministic and offline. `buildFromUrl` adds a
 * single network hop (prefetchBrand) and then re-uses the exact same assembly,
 * so the URL path stays LLM-free.
 */
import type { Brand } from "../schema.js";
import { type FontFile } from "../fonts.js";
import type { BrandSystem, SeedToken } from "./types.js";
/** Turn a brand name (or any label) into a filesystem-safe slug. */
export declare function slugify(input: string): string;
/**
 * Build a complete BrandSystem from an already-synthesized Brand kit. Fully
 * deterministic and offline.
 */
export declare function buildBrandSystem(brand: Brand, opts?: {
    slug?: string;
    fontFiles?: FontFile[];
    seed?: Partial<SeedToken>;
}): BrandSystem;
/**
 * Build a BrandSystem straight from a site URL — the deterministic, no-LLM
 * path. `prefetchBrand` must write to a brand dir, so we hand it a throwaway
 * temp dir, read back any downloaded logos into the bundle, then assemble.
 */
export declare function buildFromUrl(url: string, opts?: {
    slug?: string;
}): Promise<BrandSystem>;
/**
 * Write a BrandSystem's files to disk under `outDir`. Binary logo files stored
 * as `*.b64` are decoded back to their real bytes. Returns the absolute paths
 * written, sorted.
 */
export declare function writeBrandSystem(system: BrandSystem, outDir: string): string[];
