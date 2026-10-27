/**
 * form — a conversion-tuned signup / contact form.
 *
 * Built to the content-structure playbook (docs/content-structures/form.md):
 * optimize for COMPLETION, not collection. A split layout pairs a value-prompt
 * brand panel (why it's worth filling) with a single-column, top-labelled,
 * minimal-field form: easy → hard ordering, always-visible labels, FAB-style
 * field help, action-specific CTA, a trust line directly under the button, and
 * an explicit success state with a clear next step.
 *
 * Pure & deterministic: every text slot is pulled from the brand with tasteful
 * fallbacks, every color/size comes from `--brand-*` tokens (varRef), and there
 * is no network / Date / Math.random. Signature is unchanged.
 */
import type { Brand } from "../../schema.js";
import { type DesignTokens } from "../types.js";
export declare function renderFormPage(brand: Brand, tokens: DesignTokens): string;
