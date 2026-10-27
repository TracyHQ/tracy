/**
 * email — a single-column, 600px, bulletproof-table promotional/announcement
 * email built to its content-structure playbook (docs/content-structures/
 * email.md):
 *
 *   From identity → Subject → hidden Preheader (complements, never repeats) →
 *   minimal logo Header → inverted-pyramid Hero (conclusion first) → ONE
 *   primary bulletproof CTA above the fold → scannable Body (3 benefit points
 *   + one named proof point) → compliant Footer (working unsubscribe + physical
 *   address placeholder).
 *
 * Inbox-grade constraints honored here:
 *  - One job, one CTA. The single primary action appears above the fold and is
 *    repeated once (same action) near the end of a longer message.
 *  - Bulletproof button: a `bgcolor` <td> with inline radius + a fully-styled
 *    <a>, never a background-image button (which vanishes if images are off).
 *  - Key message + CTA never live only in an image; the layout is image-free,
 *    so it renders identically with images blocked.
 *  - 600px single column, web-safe fallback stack, ≥16px body, ≥44px tap target.
 *  - A hidden preheader (+ whitespace eater) earns the open without leaking
 *    "View in browser…" into the inbox preview.
 *
 * Every text slot is pulled from the brand (name / tagline / description /
 * voice.adjectives / tone / messagingPillars / vocabulary) with production-
 * quality fallbacks, so any brand fills the SAME premium structure with its own
 * words. Pure & deterministic: (brand, tokens) -> string, no network / Date /
 * random. Themed entirely through the --brand-* custom properties.
 */
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export declare function renderEmail(brand: Brand, tokens: DesignTokens): string;
