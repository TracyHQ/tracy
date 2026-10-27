/**
 * The account menu's contract with the plugins that add rows to it (Lee, 09/10/2026). The menu is
 * drawn by `@tracy/dsh-settings` (`account-menu.tsx`); AI accounts (`tracy-model-plan`) and
 * Community (`tracy-sidebar`) are rows other plugins register. A plugin cannot import another
 * plugin, so what they share lives here.
 *
 * A row registers `{ name: 'settings.menu.item', id, order, locale }` — the slot name stays a
 * literal at each registration: `check-plugin-contracts` reads it as text — and draws itself with
 * `PopoverItem` / `PopoverSubmenu` from this folder, so the menu's keyboard reaches it.
 */

/** What every row of the account menu receives from the menu (the slot adds `t` for its locale). */
export interface MenuItemProps {
  /** Close the menu and open Settings on `sectionId`; an unknown or hidden section opens its default. */
  openSettings(sectionId: string): void
  /** Close the menu (a row that opens something outside Settings). */
  close(): void
}

/**
 * What every row of Settings › Help & about's `settings.help.item` list receives from the section
 * (`@tracy/dsh-settings` `help-about-section.tsx`; Lee, 12/10/2026): the list sits after the
 * desktop app's update rows and before the release notes. A row registers `{ name:
 * 'settings.help.item', id, order, locale }` (`@tracy/dsh-onboard`'s Getting started is 10) and
 * draws itself with the section's own classes — `.ts-help-row` around `.ts-row-text` (`.ts-row-title`,
 * `.ts-help-status`) and `.ts-help-actions` — so it looks like the section's own rows.
 */
export interface HelpItemProps {
  /** The class of the section's small outline button ("Check for updates"), for the row's buttons. */
  readonly buttonClassName: string
}

/**
 * The attribute on the account menu's button (the signed-in person's face). `tracy-sidebar` finds
 * the face by it to flash it once when the Need help? pill is hidden (Community lives in that
 * menu); tests and regression scripts find the menu by it too.
 */
export const ACCOUNT_TRIGGER_ATTR = 'data-tracy-account-trigger'
