/**
 * The translation function every shared screen takes as a prop.
 *
 * The screens in `@tracy/core` own no locale namespace — a namespace has exactly one owner, the
 * plugin whose `src/client/strings.ts` exports it, and `check-dsh-locale` reads owners from
 * there. So a shared screen receives `t` from the plugin that mounts it, and the keys it asks
 * for must exist in THAT plugin's `en` (the gate then demands the `vi` half).
 */
export type Translate = (key: string, params?: Record<string, string | number>) => string
