/**
 * English baseline for the `tracy-model-plan` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Other interface languages
 * arrive from `@tracy/dsh-tracy-locale-vi` and `@tracy/dsh-tracy-locales`. `NS` lives beside `en`
 * so `check-dsh-locale` can find the owner. Vendor names are not here: they are the vendors' own
 * (`{vendor}`), as dsh-subscriptions spells them.
 */
export const NS = 'tracy-model-plan'

export const en = {
  /**
   * The Settings nav entry and page title, and the account menu's row. "AI accounts" since
   * 09/10/2026 (was "Model Subscription"): "connector" is Claude's and ChatGPT's word for MCP.
   */
  nav: 'AI accounts',
  'account.scope':
    'Your AI accounts, default and fallbacks follow your Tracy account across sites, on web and desktop. Other team members use their own AI accounts.',
  'account.disabled': 'AI accounts are disabled by your administrator. Your connections and order are saved.',
  /**
   * The cards (Lee, 11/10/2026: the same parts as step 1 of the Getting started screen). Three
   * sections: Tracy AI (the product name, `TRACY_AI` in AccountsPane.tsx, not a string to translate)
   * under `included.title`; the vendors whose program the desktop app found on
   * this computer (`found.computer`, with a count and Refresh — finding a program says nothing about
   * an account) or, on the web, the first few vendors under `popular`; the rest behind `more.show`.
   */
  'included.title': 'Included with your Tracy account',
  'found.computer': 'Found on this computer',
  'found.refresh': 'Refresh',
  popular: 'Popular',
  'more.show': 'Show {n} more →',
  'more.less': 'Show fewer',
  /** On a card: first in the order; connected but not first; Tracy AI when not first. */
  'badge.default': 'Default',
  'badge.connected': 'Connected',
  'badge.included': 'Included',
  /** Accessible name of the check mark on the picked card. */
  'card.picked': 'Selected',
  /**
   * A browser sign-in on the web (ChatGPT Codex, Claude, Grok): the vendor sends the browser back to
   * a localhost address nothing answers, so the browser shows an error page. The three steps say so
   * BEFORE the person opens the page; step 1 carries the `account.open` link.
   */
  'account.step.open': 'Open the sign-in page and sign in.',
  'account.step.refused':
    'Your browser will then show a page that cannot be reached (localhost refused to connect). That is expected.',
  /**
   * Under step 2: claude.ai can open its sign-in in a small window with no address bar (Chrome's app
   * window), so there is nothing to copy until it is opened as a normal tab. "Chrome" is the product
   * name, kept verbatim.
   */
  'account.step.popup':
    'Opened in a small window with no address bar? Use its menu (⋮) and choose Open in Chrome, then copy the address.',
  'account.step.copy': 'Copy the whole address from the address bar and paste it below.',
  'account.callbackPlaceholder': 'Paste the callback URL',
  'account.open': 'Open sign-in page',
  /**
   * A vendor that signs in by a code (GitHub Copilot): the code shows in the vendor's row, the person
   * types it on the vendor's page, and the section waits for the vendor to confirm.
   */
  'device.enter': 'Enter this code on {vendor} to connect',
  'device.copy': 'Copy code',
  /** On the Copy button for two seconds after the code was copied. */
  'device.copied': 'Copied',
  'device.open': 'Open {vendor}',
  'device.waiting': 'Waiting for {vendor} to confirm…',
  /** The broker keeps a sign-in ten minutes (`broker.js` `start`). */
  'device.timeout': 'The sign-in was not finished within 10 minutes.',
  /**
   * Under a ChatGPT Codex code: OpenAI refuses the code while the account's "Device code sign-in"
   * switch (ChatGPT Settings › Security, off by default) is off. `{settings}` is
   * `device.codexSecurity.link`, a link to that page. "ChatGPT" is the product name, kept verbatim;
   * "Device code sign-in" is the switch's own name on ChatGPT's page.
   */
  'device.codexSecurity': 'ChatGPT accepts the code only when Device code sign-in is on in {settings}.',
  'device.codexSecurity.link': 'ChatGPT Settings › Security',

  /**
   * The panel under the cards: where the picked card stands. Tracy AI is part of the Tracy account
   * (`panel.tracy`, with the account the page is signed in as; `panel.tracyPlain` while that is
   * not known). Every panel of an entry in the order ends with its place: `panel.default` first,
   * else `panel.fallback` with the entries before it (`{list}`, joined by `Intl.ListFormat`).
   */
  'panel.tracy': 'Part of your Tracy account, signed in as {account}.',
  'panel.tracyPlain': 'Part of your Tracy account.',
  'panel.default': 'Your default: new chats use it.',
  'panel.fallback': "Fallback {n}: used when {list} can't answer.",
  'panel.idle.title': 'Connect {vendor}',
  'panel.idle.line': 'Tracy works on your {vendor} plan. Sign in once in your browser.',
  'panel.connectNow': 'Connect now',
  'panel.pending.title': 'Waiting for {vendor}…',
  'panel.connected.title': '{vendor} connected',
  'panel.connected.line': 'Signed in as {account}.',
  /** A connection made with a pasted API key (Kimi, GLM, Qwen): the key is not shown. */
  'panel.connected.key': 'Connected with an API key.',
  'panel.error.title': 'Could not connect {vendor}',
  /** A key vendor not connected yet: the box to paste the key in sits under this line. */
  'panel.key.title': '{vendor} connects with an API key',
  'panel.key.line': 'Paste your {vendor} API key. Tracy keeps it with your Tracy account.',
  /** On a connected card's panel when it is not first: puts it first in the order. */
  'action.setDefault': 'Set as default',

  /**
   * The fallbacks: the entries after the first (`{vendor}` is the first one's name, "Tracy AI"
   * included), each with Move up / Move down. Tracy AI is one entry like any other; nothing is
   * "routing" or a "backup" on screen (Lee, 11/10/2026: backup is a site's restore point).
   */
  'fallback.title': "If {vendor} can't answer",
  'fallback.rule':
    "Try these next, in order. An account can't answer when its limit is reached, it's signed out, or it's down.",
  'fallback.none': "No fallback yet. Connect another account and it takes over when {vendor} can't answer.",
  'routing.up': 'Move up',
  'routing.down': 'Move down',
  'state.loading': 'Loading…',

  /** One row per allowed vendor. */
  'status.connected': 'Connected',
  /** Under "Connected" when the plan knows the account. */
  'status.account': 'Signed in as {account}',
  'status.notConnected': 'Not connected',
  /** A vendor whose way of signing in this page does not know: no Connect here. */
  'status.unavailable': 'Not available in the app yet',
  /** Under a connection made with a pasted API key (Kimi, GLM, Qwen). */
  'status.key': 'Connected with an API key',

  /**
   * A vendor that connects with an API key: a password box in its row, the shared Submit
   * (`action.submit`), and a link to the vendor's page where a key is made. "API key" and "key" stay
   * in English in every language.
   */
  'key.placeholder': 'Paste your {vendor} API key',
  'key.where': 'Where to get a key',
  /** The vendor rejected the key (401). */
  'key.failed.key': '{vendor} did not accept this API key. Check it and paste it again.',
  /** The vendor refused the key for this use (403): no plan, no balance, or no access for Tracy. */
  'key.failed.plan':
    '{vendor} refused this API key for this use: its account has no plan, balance or access for it.',
  /** The vendor could not be reached to check the key (502, or no answer). */
  'key.failed.vendor': 'Could not reach {vendor} to check the key. Try again in a moment.',
  /** The server could not read what was sent (400): an empty or malformed key. */
  'key.failed.invalid': 'That does not look like an API key. Paste the whole key and try again.',
  /** A Disconnect or another paste landed while the key was being checked (409). */
  'key.failed.conflict':
    'Something changed while the key was being checked. Reload the page and paste the key again.',
  /** The operator turned this vendor, or connecting one's own account, off (403/503). */
  'key.failed.disabled': 'Connecting {vendor} is turned off by your administrator.',
  /** The person's Tracy session is gone (401 `notSignedIn`). */
  'key.failed.signedOut': 'You are signed out of Tracy. Reload the page, sign in, then paste the key again.',

  'action.connect': 'Connect',
  'action.disconnect': 'Disconnect',
  'action.cancel': 'Cancel',
  /** Sends the pasted code. */
  'action.submit': 'Submit',
  'action.retry': 'Try again',

  /** While a sign-in waits on the person's browser. */
  'pending.browser': 'Finish signing in to {vendor} in your browser.',
  'pending.code': 'Sign in to {vendor} in your browser, then paste the code it shows here.',
  'pending.device': 'Enter this code on the {vendor} page that opened in your browser.',
  /** Placeholder and accessible name of the paste box. */
  'code.placeholder': 'Paste the code',

  /** The line under the list: what a new chat will run on. */
  'newChat.plan': 'New chats use your {vendor} plan.',
  'newChat.tracy': 'New chats use the Tracy model.',

  /**
   * The chip at the head of each chat: what the chat runs on, when it is not one of the plans.
   * `chip.switched` follows the chip (a plan's, or Tracy AI's) after a failover; a chat on Tracy AI
   * because Tracy AI is the default says nothing more. Which of the three lines is the reason the
   * broker stored (`switched_from.reason`, `seat-plan/broker.js`): a usage limit, a sign-out, or
   * anything else ("unavailable").
   */
  'chip.switched': 'Switched from {vendor} because it was unavailable.',
  'chip.switchedLimit': 'Switched from {vendor} because it reached its usage limit.',
  'chip.switchedSignedOut': 'Switched from {vendor} because it was signed out.',
  'chip.tracy': 'Tracy model',
  /** The chip of a chat whose plan is no longer connected, after the vendor's name. */
  'chip.reconnect': 'Reconnect',
  /** Tooltip and accessible name of that chip; `{section}` is `nav`. */
  'chip.reconnectHint':
    'The {vendor} plan this chat runs on is not connected. Reconnect it in Settings › {section}.',

  'error.load': 'Could not read your AI accounts.',
  'error.notAllowed': '{vendor} is not allowed in this app.',
  'error.expired': 'The sign-in to {vendor} expired. Try again.',
  'error.code': 'That code did not work. Copy it again from your browser.',
  'error.unreachable': 'The app could not reach your AI accounts. Restart the app and try again.',
  'error.connect': 'Could not connect {vendor}. Try again.',
  /**
   * Under "Waiting for {vendor} to confirm…" while the code's polls get no answer from Tracy's
   * server (it restarts for an update, or the network is down); the page keeps asking.
   */
  'error.transient': 'The server is restarting or unreachable. Trying again…',
  /** A single request (starting a sign-in, a reorder) got no answer from Tracy's server. */
  'error.transientRetry': 'The server did not answer. Try again.',
  'error.disconnect': 'Could not disconnect {vendor}. Try again.'
} as const

export type ModelPlanKey = keyof typeof en

export type Translate = (key: string, params?: Record<string, string | number>) => string
