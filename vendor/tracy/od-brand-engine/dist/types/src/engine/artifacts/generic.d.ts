/**
 * generic — a reasonable card+button page for kinds without a bespoke layout.
 */
import type { Brand, AssetKind } from "../../schema.js";
import { type DesignTokens } from "../types.js";
/** A reasonable card+button page for kinds without a bespoke layout. */
export declare function renderGeneric(kind: AssetKind, brand: Brand, tokens: DesignTokens): string;
