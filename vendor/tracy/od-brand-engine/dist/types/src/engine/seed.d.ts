/**
 * SEED synthesis — the narrow front door of the brand engine.
 *
 * The whole point of an Ant-Design-style engine is that a brand collapses into
 * a tiny ~20-field `SeedToken`; everything downstream (the full token system,
 * the themed kit, the artifacts) is DERIVED from it. This module is the only
 * place that *produces* a seed, by three routes:
 *
 *   defaultSeed         — the frozen Ant baseline (light theme).
 *   seedFromBrand       — map an already-synthesized Brand kit onto a seed.
 *   seedFromMaterial    — deterministically infer a seed from raw prefetch
 *                         material (the URL → seed path, no LLM in the loop).
 *
 * Functional colors (success/warning/error) stay at their stable Ant defaults
 * unless the brand clearly carries a semantic color; neutral text/bg are the
 * two base colors that the derive step expands into the full neutral ladder.
 *
 * Color parsing helpers are inlined on purpose: this module imports ONLY the
 * frozen `SeedToken` type from ./types and the adjacent Brand / PrefetchResult
 * contracts. It never reaches into palette/derive — keeping the seed surface
 * independent of how tokens are later computed.
 */
import { type SeedToken } from "./types.js";
import type { Brand } from "../schema.js";
import type { PrefetchResult } from "../prefetch.js";
/** The frozen Ant light-theme seed — also the source of every untouched field. */
export declare const defaultSeed: SeedToken;
/**
 * Map an already-synthesized Brand kit onto a SeedToken.
 *  - colorPrimary  ← role "accent" (else the first non-neutral color, else default)
 *  - colorInfo     ← same as primary
 *  - colorLink     ← role "accent-secondary" (else "")
 *  - colorSuccess  ← accent-secondary if it reads green, else default
 *  - colorTextBase / colorBgBase ← neutralBases(): dark-first brands (dark
 *                    background + light foreground) keep their true canvas;
 *                    otherwise light foregrounds fall back to black and dark
 *                    canvases fall back to white as before
 *  - fontFamily    ← body face + fallbacks + system tail
 *  - borderRadius  ← parseInt(layout.radius) || 6
 *  - everything else ← defaultSeed
 */
export declare function seedFromBrand(brand: Brand): SeedToken;
/**
 * Deterministically infer a SeedToken from raw prefetch material (no LLM).
 *  - colorPrimary  ← highest-scoring chromatic color (skip extremes + greys),
 *                    weighted by frequency. Falls back to defaultSeed.
 *  - colorInfo     ← same as primary.
 *  - colorTextBase / colorBgBase ← the light-theme neutral baseline. A dark
 *                    source site still gets a light default kit; the dark
 *                    algorithm owns the black canvas.
 *  - colorSuccess/Warning/Error/Link ← stable defaults (semantic colors aren't
 *                    reliably inferable from frequency alone).
 *  - fontFamily    ← fonts[0] / first @font-face family + system tail.
 *  - everything else ← defaultSeed.
 */
export declare function seedFromMaterial(material: PrefetchResult): SeedToken;
