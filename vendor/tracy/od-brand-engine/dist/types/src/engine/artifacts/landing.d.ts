/**
 * landing — a long, single-goal marketing page that follows the project's
 * content-structure playbook (docs/content-structures/landing-page.md) to the
 * letter. The 12-module order, top to bottom:
 *
 *   1  Nav            logo + minimal anchors + one accent CTA
 *   2  Hero           the 5-piece value prop (formula headline, subhead,
 *                     primary + ghost CTA, product mock, micro-trust)
 *   3  Social proof   logo wall / rating / specific numbers, hugging the hero
 *   4  Problem (PAS)  name the pain in the reader's words, then agitate it
 *   5  Value pillars  exactly 3, written FAB so the card shows the BENEFIT
 *   6  How it works   3 steps, drawn with div/SVG (no screenshots)
 *   7  Features       zig-zag deep-dive, title = benefit, body = how
 *   8  Proof          stat band + named testimonials with results
 *   9  Objection      FAQ that pre-answers the buying worries
 *  10  Pricing        3 tiers, middle highlighted (anchoring)
 *  11  Final CTA      the page's strongest accent — one last, big ask
 *  12  Footer         grey, small, restrained — never competes with the CTA
 *
 * Page skeleton = AIDA; the Problem block = PAS (P+A) handing off to the Value
 * block (S); every feature = FAB landing on B. Backgrounds alternate between
 * `--brand-color-bg-layout` and `--brand-color-bg-container`; the accent budget
 * keeps the loudest accent for module 11, with a calmer inline CTA recurring
 * about every 1.5 screens so the reader never has to scroll back for a button.
 *
 * It is a SLOT TEMPLATE: every text slot is pulled from brand fields (name /
 * tagline / description / voice.adjectives / voice.tone / voice.messagingPillars
 * / voice.vocabulary) with production-quality fallbacks, so different brands
 * fill the SAME premium structure with their own words. Pure & deterministic:
 * `(brand, tokens) -> string`, no network / Date / random.
 */
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export declare function renderLanding(brand: Brand, tokens: DesignTokens): string;
