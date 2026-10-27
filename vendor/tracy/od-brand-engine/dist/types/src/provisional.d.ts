import type { Brand } from '@open-design/contracts';
import type { PrefetchResult } from './prefetch.js';
/**
 * Deterministically build a provisional Brand from prefetch material. The
 * shape is intentionally minimal — voice/imagery/layout stay near-empty.
 * Passing through `validateBrand` normalizes the object (and enforces the
 * background/foreground/accent color roles).
 */
export declare function brandFromMaterial(material: PrefetchResult, sourceUrl: string): Brand;
