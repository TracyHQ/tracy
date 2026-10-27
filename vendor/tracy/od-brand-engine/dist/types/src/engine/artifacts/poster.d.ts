/**
 * poster — a 3:4 print-style sheet (~900×1200) built to the content-structure
 * playbook in docs/content-structures/poster.md: 3 秒拦住人,传达一件事.
 *
 * Two variants share one beautiful slot template:
 *   • Statement (default) — a single brand-voice 金句 IS the focal. Huge headline
 *     on the upper rule-of-thirds line, generous whitespace, logo as a small
 *     confident signature at the bottom. Accent shows up exactly once, on the
 *     focal. This is the default because every brand has a voice to fill it.
 *   • Event — kept for brands whose copy implies a gathering/launch/release.
 *     Adds the 5W key-facts grid (What / When / Where / Who / How), each its own
 *     aligned block, plus one clear CTA (scan / short link) with a line-drawn
 *     code motif. Still one focal, still a signature logo.
 *
 * Type is sized in container-query units (cqi) against the fixed poster frame,
 * so the focal never overflows the canvas whether exported full-size or scaled
 * down inside a preview iframe. ≤3 type-size roles. Everything is themed via the
 * derived --brand-* custom properties, so it restyles with the tokens. Pure &
 * deterministic: (brand, tokens) -> string, no network / Date / random.
 */
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export declare function renderPoster(brand: Brand, tokens: DesignTokens): string;
