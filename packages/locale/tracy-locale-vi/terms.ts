/**
 * Terms EVERY translation keeps verbatim: the one list.
 *
 * Scope (Brian, 05/10/2026): this list binds all seven translated languages — vi, de, it, fr, nl,
 * zh, es — reversing the Vietnamese-only rule of 02/10/2026. Eighteen terms were added the same
 * day (admin, backup, chat, domain, download, email, folder, link, log, preview, prompt, restore,
 * sandbox, tab, template, terminal, theme, upload). Still translated on purpose: account,
 * password, page, post, draft, publish, menu, media — the words the CMS admin screens use in each
 * language. dsh's own language packs (third-party) may still say "Datei" next to a Tracy screen
 * that says "File"; Tracy does not patch them.
 *
 * Why: technical users of Tracy say these words in English, so translating them makes the screen
 * disagree with the docs, the logs and the API it shows. Burned once: the `vi` catalogue of
 * `tracy-desk` rendered "Agent" as "Đặc vụ" (a spy).
 *
 * Matching is case-insensitive on ASCII word boundaries: German "File" passes, but a compound
 * such as "Templatevorschau" does not — write "Template-Vorschau".
 *
 * Rule: when an English source contains a word on this list, every translation contains that
 * same word: every listed word of the source, not any one of them. Add new words here, never
 * patch single translations.
 *
 * A file of its own beside the dictionary, not inside the gate: the list is knowledge about the
 * language, not about a check. Two gates read it: `dsh-locale` (scripts/check-dsh-locale.ts, for
 * `vi`) and `kept-terms` (scripts/check-kept-terms.ts, for all seven languages). The second copy that lived in
 * packages/locale/tracy-i18n/src/terms.ts had no reader and was removed (#797).
 * Copied from tracy-infra/packages/i18n/src/terms.ts rather than imported across repos (TCH is
 * self-contained); when the two drift, this copy wins for everything TCH ships.
 */
export const KEEP_VERBATIM_TERMS = [
  'agent',
  'API',
  // A blog is "blog" in Vietnamese — "nhật ký" means a diary and names the wrong thing on a menu.
  'blog',
  // Lee, 06/09/2026: the tabs are "Brand" and "Brand builder" in Vietnamese too ("Brand của anh").
  'brand',
  'commit',
  'deploy',
  'file',
  'fleet',
  'JSON',
  'MCP',
  'model',
  'plugin',
  'proposal',
  'release',
  'session',
  'site',
  'Sitespace',
  'Sitespaces',
  'skill',
  'token',
  'URL',
  'webhook',
  'workspace',
  // Brian, 05/10/2026: added with the rule's scope widened to all seven translated languages.
  'admin',
  'backup',
  'chat',
  'domain',
  'download',
  'email',
  'folder',
  'link',
  'log',
  'preview',
  'prompt',
  'restore',
  'sandbox',
  'tab',
  'template',
  'terminal',
  'theme',
  'upload'
]

/**
 * Chuỗi có chứa thuật ngữ này không.
 *
 * Đuôi chỉ mở cho **số nhiều tiếng Anh** (`files`, `Releases`), không mở cho một từ khác dài
 * hơn. Bản đầu dùng `\bdeploy` trần và nó khớp cả `deployment` — một danh từ nghĩa "bản triển
 * khai", chẳng liên quan tới động từ `deploy`. Hậu quả không phải một cảnh báo thừa mà là sức
 * ép dịch sai: cách duy nhất để làm cổng xanh là nhét chữ `deploy` vào một câu tiếng Việt
 * không cần nó. Sáu chuỗi của dsh đã dính đúng bẫy này.
 *
 * Hàm ở cạnh danh sách, không phải trong từng nơi gọi: luật và dữ liệu của luật tách ra hai
 * chỗ là cách hai người dùng cùng một danh sách lại kiểm theo hai kiểu.
 */
export function hasTerm(text: string, term: string): boolean {
  return new RegExp(`\\b${term}(?:s|es)?\\b`, 'i').test(text)
}
