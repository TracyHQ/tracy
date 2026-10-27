import { type Brand } from './schema.js';
/**
 * Validate + normalize a brand object. Throws with a precise message on
 * unrecoverable problems (missing name/colors); fills sensible defaults for
 * everything optional so a slightly-sloppy input still renders.
 */
export declare function validateBrand(raw: unknown, sourceUrl: string): Brand;
/** Pull the last ```json fenced block (or bare top-level object) out of text —
 *  the fallback path when a brand object arrives inline instead of as JSON. */
export declare function extractJsonBlock(text: string): unknown | null;
