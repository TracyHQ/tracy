/**
 * English baseline for the `tracy-settings` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives
 * from `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately —
 * `ctx.locale.register` throws on a duplicate pair, so exactly one place may ship each.
 *
 * Changing a string here means the translation is now stale, and `check-dsh-locale` says so
 * because it reads this file as the source of truth rather than a copy of it.
 */

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`, and that placement is load-bearing. Until 2026-08-30 it was a
 * `const NS` inside `index.tsx` instead — the only Tracy plugin that put it there — and the
 * consequence was not cosmetic: `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`, so this namespace was invisible to the gate. It shipped ten English-only
 * strings and nothing said so. Keep declaration and baseline in one file.
 */
export const NS = 'tracy-settings'

export const en = {
  /** Sidebar button that opens the settings surface. */
  'trigger.label': 'Settings',
  /** aria-label of the person's face at the foot of the column while nobody is known yet. */
  'menu.trigger': 'Account and settings',
  /** aria-label of the face once the person is known; {who} is their name, else their email. */
  'menu.triggerFor': '{who}: account and settings',
  /** Account menu row that opens Settings. */
  'menu.settings': 'Settings',
  /** Account menu row that opens the Light / Dark / System choice beside the menu. */
  'menu.appearance': 'Appearance',
  /** Appearance choice: the light theme. */
  'menu.theme.light': 'Light',
  /** Appearance choice: the dark theme. */
  'menu.theme.dark': 'Dark',
  /** Appearance choice: follow the device's light or dark setting. */
  'menu.theme.system': 'System',
  /** Name of the "open Settings" command in the keyboard shortcut list. */
  'shortcut.open': 'Open settings',
  /** Heading of the settings page. */
  'page.title': 'Settings',
  /** Group heading above sections that belong to the person, not the workspace. */
  'group.user': 'User settings',
  /** Group heading above sections contributed by dsh and its plugins. */
  'group.workspace': 'Sitespace',
  /** Nav label of the General section this plugin re-provides. */
  'general.nav': 'General',
  /** Group heading above look-and-feel sections. */
  'group.preferences': 'Preferences',
  /** Leaves the settings surface and returns to the conversation. */
  'action.close': 'Close settings',
  /** Shown in the content column before a section is chosen. */
  'empty.hint': 'Choose a section on the left.',
  /** Shown when no plugin has registered any section at all. */
  'empty.none': 'No settings sections are registered.',
  /** General › Language row title (Tracy's row shadows dsh's). */
  'language.title': 'Language',
  /** General › Language row description. */
  'language.description': 'Language of the Tracy interface',
  /** First item of the Language menu: follow the device's language instead of a picked one. */
  'language.followDevice': 'Follow device',
  /** Language button while following the device; {language} is the language it resolved to. */
  'language.followDeviceCurrent': 'Follow device ({language})',
  /** Nav label and page title of Settings › Notifications (spec #809). */
  'notifications.nav': 'Notifications',
  /** Column header: the switch for notifications in the app's Inbox. */
  'notifications.column.inbox': 'Inbox',
  /** Column header: the switch for notification emails. */
  'notifications.column.email': 'Email',
  /** Heading above the three team rows. */
  'notifications.section.team': 'Team',
  /** Heading above the two comment rows. */
  'notifications.section.comments': 'Comments',
  /** Row: invitations to you, answers to your requests and invitations, your seat and role. */
  'notifications.group.about-you': 'About you and your invitations',
  /** Row: someone asked to join a site you own or administer (locked on). */
  'notifications.group.join-requests': 'Join requests to your sites',
  /** Row: a teammate joined or left one of your sites. */
  'notifications.group.teammates': 'Teammates joining or leaving',
  /** The row for T12 / T14 (Akemi 04/10): a backup restored, the site's address changed. */
  'notifications.group.site-changes': 'Site changes',
  /** The line under the Site changes row. */
  'notifications.groupDesc.site-changes': 'Restores and address changes',
  /** Row: someone mentioned you, or replied to a thread you are in. */
  'notifications.group.mentions-replies': 'Mentions and replies',
  /** Row: your comment was resolved or reopened. */
  'notifications.group.resolved-reopened': 'Resolved and reopened',
  /** Sub-line under the locked join-request row. */
  'notifications.locked': 'Owners always receive this',
  /** Tooltip and accessible description of the two locked switches of that row. */
  'notifications.lockedHint': 'Always on for Owners',
  /** Shown instead of the table when the settings could not be read. */
  'notifications.loadFailed': 'Your notification settings could not be loaded. Close Settings and try again.',
  /** Shown under the table when a switch could not be saved and went back. */
  'notifications.saveFailed': 'That change could not be saved. Try again.',
  /** Desktop app only: the row above the table, its title (the system notification of this computer). */
  'notifications.desktop.title': 'Desktop',
  /** Desktop app only: the muted line under that title, saying when one is shown. */
  'notifications.desktop.desc': 'Shown when the agent finishes and no Tracy window is in front.',
  /** Desktop app only: accessible name of that row's switch. */
  'notifications.desktop.switch': 'Desktop notifications',
  /** Desktop app only: label of the picker of the sound a system notification plays. */
  'notifications.desktop.sound': 'Sound',
  /** Desktop app only: the first choice of that picker, the sound the computer's settings pick. */
  'notifications.desktop.soundSystem': 'System Default',
  /** Desktop app only: the small button that shows a sample system notification at once. */
  'notifications.desktop.test': 'Send a test notification',
  /** Settings nav item: apps connected to the whole account ("Connect Tracy", device flow). */
  'connectedApps.nav': 'Connected apps',
  /** Line under the section heading. */
  'connectedApps.desc':
    'Apps you connected to your Tracy account. Disconnect one to stop its access at once.',
  /** When no app is connected. */
  'connectedApps.empty': 'No apps are connected to your account.',
  /** What an app with the `demos` scope may do. */
  'connectedApps.scope.demos': 'Create demo sites',
  /** When the app was connected; {date} is a formatted day. */
  'connectedApps.connectedOn': 'Connected {date}',
  /** Button that ends one app's access. */
  'connectedApps.disconnect': 'Disconnect',
  'connectedApps.loadFailed': 'Connected apps could not be loaded. Close Settings and try again.',
  'connectedApps.revokeFailed': 'The app could not be disconnected. Try again.',
  /** Desktop app only: shown in that row when this computer has no system notifications. */
  'notifications.desktop.unsupported': 'Notifications are not supported on this computer.',
  /** Body of the system notification when the agent's turn ended with an answer. */
  'turnWatch.body.completed': 'The agent is done.',
  /** Body of the system notification when the agent's turn ended with an error. */
  'turnWatch.body.error': 'The agent stopped with an error.',
  /** Body of the system notification when the agent stopped to ask the person something. */
  'turnWatch.body.needsInput': 'The agent is waiting for you.',
  /** Body of the system notification when the turn was stopped before it finished. */
  'turnWatch.body.cancelled': 'The turn was cancelled.',
  /** Nav label and page title of Settings › Help & about. */
  'help.nav': 'Help & about',
  /** Screen-reader words of the dot beside Help & about when a desktop app version waits. */
  'help.badge': 'Update available',
  /** Screen-reader words of that dot after a move to a new version whose notes are unread. */
  'help.badge.whatsNew': 'What’s new',
  /** Screen-reader words of that dot when this version is no longer, or soon not, supported. */
  'help.badge.required': 'Update required',
  /** One line under the product name, taken from tracy.ai's own title; not a new slogan. */
  'help.tagline': 'Claude Design, but for CMS',
  'help.downloadApp': 'Download Desktop App',
  /** Version chip: the build of the Tracy server answering this page ({date} built, {commit} 7 chars). */
  'help.serverVersion': 'Server {date} · {commit}',
  /** Version chip of the desktop app. */
  'help.appVersion': 'App {version}',
  /** Row title: the desktop app's own updates. */
  'help.updates.title': 'Desktop app updates',
  /** The app updates itself but has not checked yet. */
  'help.updates.idle': 'Updates have not been checked yet.',
  /** Nothing newer; {when} is a relative time ("2 minutes ago"). */
  'help.updates.current': 'You’re up to date. Last checked {when}.',
  'help.updates.checking': 'Checking for updates…',
  'help.updates.downloading': 'Downloading {version} — {percent}%',
  /** Windows, or an app before bridge protocol 3: the version installs when the person presses Restart. */
  'help.updates.downloaded': 'Version {version} is ready to install.',
  /** macOS (signed) or AppImage: the version is prepared and installs by itself when the app quits. */
  'help.updates.installsOnQuit': 'Version {version} installs when you quit.',
  /** macOS: downloaded, but the system is still preparing it to install on quit. */
  'help.updates.preparing': 'Preparing version {version} to install…',
  /** An ad-hoc signed copy: it cannot replace itself. */
  'help.updates.manual':
    'Version {version} is out. This copy can’t update itself — download it and replace the app.',
  'help.updates.error': 'Couldn’t reach the update server.',
  /** {when} is a relative time ("in 10 minutes"). */
  'help.updates.errorRetry': 'Couldn’t reach the update server. Trying again {when}.',
  'help.updates.installing': 'Restarting to install {version}…',
  /** macOS refused the downloaded version after Restart. */
  'help.updates.installError': 'Version {version} could not be installed.',
  /** A copy that never updates itself (not packaged, Preview). */
  'help.updates.off': 'This copy doesn’t update itself.',
  /** An app built before Help & about could manage updates. */
  'help.updates.oldApp': 'Update the app to manage updates here.',
  'help.action.check': 'Check for updates',
  'help.action.restart': 'Restart to update',
  'help.action.download': 'Download',
  'help.action.retry': 'Try again',
  'help.autoCheck.title': 'Check for updates automatically',
  /** Windows, a copy that cannot update itself, or an app before protocol 3: nothing installs on quit. */
  'help.autoCheck.description': 'Every 4 hours. You choose when a new version installs.',
  /** macOS (signed) or AppImage: a downloaded version installs by itself when the app quits. */
  'help.autoCheck.descriptionQuit': 'Every 4 hours. A downloaded version installs the next time you quit.',
  'help.autoCheck.saveFailed': 'That change could not be saved. Try again.',
  /** Heading of a release-notes box: the running version's, or a new one that is not downloaded. */
  'help.notes.title': 'What’s new in {version}',
  /** Heading of the downloaded version's notes, above the running version's box. */
  'help.notes.ready': '{version} — ready to install',
  /** Small label beside the running version's heading, right after a move to a new version. */
  'help.notes.new': 'New',
  /** Button beside that heading: opens the running version's changelog page in the browser. */
  'help.notes.changelog': 'Full changelog',
  /** Switch title: one system notification after the app moves to a new version. */
  'help.whatsNew.notify': 'Notify me what’s new after an update',
  /** The line under that switch. */
  'help.whatsNew.notifyDescription':
    'One notification after Tracy Cowork updates to a new version. What’s new is always here.',
  /** The channel's minimum version, with a deadline; {date} is a day, {version} the minimum. */
  'help.policy.stopsOn': 'This version stops working on {date}. Update to {version} or later.',
  /** The channel's minimum version, past its deadline or with none; {version} is the minimum. */
  'help.policy.unsupported': 'This version is no longer supported. Update to {version} or later.',
  /** Row title on the web. */
  'help.web.title': 'Updates',
  'help.web.line': 'Tracy on the web updates on our side. Reload the page to get the newest version.',
  'help.link.help': 'Help center',
  'help.link.faq': 'FAQ',
  'help.link.pricing': 'Pricing',
  'help.link.website': 'Website',
  'help.link.community': 'Community',
  'help.link.community.sub': 'Questions and feedback on Discord',
  /** Button of each link row. */
  'help.link.open': 'Open',
  /** Accessible name of a row's button; {name} is the row's name. */
  'help.link.openLabel': 'Open {name}',
  'help.legal.privacy': 'Privacy policy',
  'help.legal.terms': 'Terms of use'
}

/** Key set of the namespace, for the locale gate and for typed lookups. */
export type StringKey = keyof typeof en
