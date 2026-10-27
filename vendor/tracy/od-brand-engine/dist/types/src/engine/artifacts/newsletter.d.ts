/**
 * newsletter — a restrained multi-story digest, built to email.md.
 *
 * email.md applied to a digest: win the open (subject/preheader), then win the
 * click. Two gates → one job → ONE primary CTA, surfaced above the fold and
 * echoed once at the end (same action). The body is a masthead + an
 * inverted-pyramid lede + three numbered stories, each a benefit headline + a
 * 2-sentence scannable blurb + a "read more" — clearly separated (the doc's
 * newsletter checklist item). Every text slot is pulled from the Brand with
 * production-quality fallbacks, so different brands fill the SAME structure.
 *
 * Email constraints: single column, ~600px, table layout for the CTA button,
 * inline styles, all keyed to `--brand-*` so it re-skins with the tokens. The
 * only ornaments are line/numeral motifs — no emoji-as-icons, no images.
 *
 * Pure & deterministic: `(brand, tokens) -> string`, no network / Date / random.
 */
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export declare function renderNewsletter(brand: Brand, tokens: DesignTokens): string;
