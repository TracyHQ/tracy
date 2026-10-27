/**
 * IPC channels of `window.tracyDesktop.app` (shell/preload.ts ↔ the bridges in src/). The update
 * bridge (src/update-bridge.js): the page reads the app's version and its update state, asks for a
 * check, Restart, Download, and sets the automatic-check switch; `state` is the one push, main →
 * page. Protocol 3 adds What's new (`whatsNewSeen`, `whatsNewSetNotify`), the changelog link
 * (`openChangelog`) and the push `openHelp`; it drops Later. Since protocol 2: which agent CLIs are on this machine (src/agents-bridge.js), the
 * first-run screen's state (src/onboarding-bridge.js) and system notifications (src/notify-bridge.js).
 * The page side of these is written against tasks/todo-desktop-onboard-agent.md, last section (the bridge contract).
 */
module.exports = {
  /** What the page can rely on: bumped when a channel or a field changes meaning. */
  APP_BRIDGE_VERSION: 3,
  UPDATE_CHANNELS: {
    info: 'tracy-desktop:app-info',
    getState: 'tracy-desktop:update-get-state',
    check: 'tracy-desktop:update-check',
    restart: 'tracy-desktop:update-restart',
    download: 'tracy-desktop:update-download',
    setAutoCheck: 'tracy-desktop:update-set-auto-check',
    state: 'tracy-desktop:update-state',
    // Protocol 3 (tasks/todo-desktop-update-policy.md D4–D6): "What's new" in Help & about, its
    // changelog link, and the push asking the page to open Help & about. "Later" is gone (A1).
    whatsNewSeen: 'tracy-desktop:whats-new-seen',
    whatsNewSetNotify: 'tracy-desktop:whats-new-set-notify',
    openChangelog: 'tracy-desktop:open-changelog',
    openHelp: 'tracy-desktop:open-help'
  },
  AGENT_CHANNELS: {
    detect: 'tracy-desktop:agents-detect',
    refresh: 'tracy-desktop:agents-refresh'
  },
  ONBOARDING_CHANNELS: {
    get: 'tracy-desktop:onboarding-get',
    close: 'tracy-desktop:onboarding-close',
    /** Push, main → page: Help › Getting started asks the page to open the first-run screen. */
    open: 'tracy-desktop:onboarding-open'
  },
  NOTIFY_CHANNELS: {
    status: 'tracy-desktop:notify-status',
    setEnabled: 'tracy-desktop:notify-set-enabled',
    setSound: 'tracy-desktop:notify-set-sound',
    test: 'tracy-desktop:notify-test',
    turnFinished: 'tracy-desktop:notify-turn-finished',
    openSettings: 'tracy-desktop:notify-open-settings',
    /** Push, main → page: the status changed (the permission, read again when a window gains focus). */
    changed: 'tracy-desktop:notify-changed'
  },
  /** Push, main → page: Help › Find Website Opportunities… (src/website-opportunities-menu.js). */
  WEBSITE_OPPORTUNITIES_CHANNELS: {
    open: 'tracy-desktop:website-opportunities-open'
  },
  /** The operating system's languages, for dsh's `__DSH_LOCALE__` (src/locale-bridge.js). */
  LOCALE_CHANNELS: {
    languages: 'tracy-desktop:locale-languages'
  }
}

/**
 * The blocked screen's own channels (src/blocked-bridge.js ↔ src/blocked-preload.js,
 * tasks/todo-desktop-update-policy.md C7): a local page of the shell, not the product page, so its
 * IPC is not part of `tracyDesktop.app`. The sandboxed preload spells these out itself.
 */
module.exports.BLOCKED_CHANNELS = Object.freeze({
  get: 'tracy-desktop:blocked-get',
  act: 'tracy-desktop:blocked-act',
  state: 'tracy-desktop:blocked-state'
})
