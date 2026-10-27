/**
 * deck — a pitch deck that follows docs/content-structures/slides-deck.md.
 *
 * It adopts the §1-A pitch skeleton (Sequoia / Kawasaki lineage) verbatim:
 *   Cover · Problem · Solution · Why now · Market · Product ·
 *   Business model · Competition & Moat · Traction · Team · Ask
 * — one idea per slide, big type, minimal words.
 *
 * Every slide title is an *assertion headline* (§3 「标题即论点」): a full
 * conclusion sentence, never a section label, so reading only the titles tells
 * the whole story (the §4 checklist test). Traction is the strongest slide and
 * the deck ends on an unambiguous Ask (§2 诉求页).
 *
 * Every text slot is pulled from brand fields (name / tagline / description /
 * voice.{adjectives,tone,messagingPillars,vocabulary} / imagery / layout) with
 * production-quality fallbacks, so different brands fill the SAME structure with
 * their own words. Never lorem ipsum.
 *
 * Mechanism preserved exactly: >=10 `.slide` sections, scroll-snap, the literal
 * 16 / 9 aspect frame, a keyboard pager (ArrowRight/ArrowLeft +
 * Space/PageUp/PageDown/Home/End), and a `.deck-counter` page indicator. Pure &
 * deterministic: (brand, tokens) -> string.
 *
 * No-clip guarantee (robust by construction). The frame is a *size* container
 * so type can scale against both axes, and every slide body is wrapped in a
 * `.f-fit` layer that the runtime shrinks-to-fit: after layout it measures the
 * body and, if the content is taller/wider than the fixed 16:9 frame, applies a
 * single downward `transform: scale()` about the centre so NO brand copy — of
 * any length, at any viewport — can ever be clipped, truncated, or spill the
 * frame. The deterministic output is audited at build time by
 * `auditDeckLayout` (apps/daemon/src/brands/engine/deck-layout-guard.ts).
 */
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export declare function renderDeck(brand: Brand, tokens: DesignTokens): string;
