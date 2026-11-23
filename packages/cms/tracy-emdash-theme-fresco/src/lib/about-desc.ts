import { cleanHtml } from './html.ts'

/**
 * The description of a features-intro "about" block (style-4): editor-owned text that may carry inline markup (a list, a
 * link). It is a text field, never trusted as markup: it goes through the same allowlist as every other editor text
 * (`cleanHtml`), so a pasted `<img src=x onerror=...>` or `<script>` prints as inert text or nothing.
 */
export function aboutDesc(raw: unknown): string {
  const text = String(raw ?? '')
  return text.trim() ? `<p>${cleanHtml(text)}</p>` : ''
}
