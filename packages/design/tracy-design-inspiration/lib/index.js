// src/host/index.ts
import crypto from "node:crypto";
import { createReadStream, promises as fs3, readFileSync, realpathSync } from "node:fs";
import path5 from "node:path";

// ../../core/tracy-core/src/site-dir/index.mjs
import path from "node:path";
var ALLOWED_FOLDERS_HEADER = "x-dsh-allowed-folders";
function firstGrantedFolder(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value === "") return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const first = parsed[0];
  return typeof first === "string" && path.isAbsolute(first) ? first : null;
}
function siteDirFor(config, req) {
  if (config.siteDir) return config.siteDir;
  return firstGrantedFolder(req.headers?.[ALLOWED_FOLDERS_HEADER]) ?? path.resolve(".");
}

// ../../core/tracy-core/src/ui-switches/catalogue.json
var catalogue_default = {
  $comment: "Customer UI switches: the ONE list of pieces an operator can hide on the dsh page. Read by @tracy/core/ui-switches (plugins), apps/tracy-web (the /api/ui and /api/ops/ui doors, COPY in its Dockerfile) \u2014 never copied. defaultOn is the code default (Lee, 28/09/2026); the database stores only an operator's differences from it. tabs = the Better Sidebar tab types a right-column switch governs: tab-* decides whether the type exists for customers, launch-* whether it is listed in the + menu and the Start guide.",
  areas: [
    {
      id: "settings",
      label: "Settings dialog",
      blurb: "What the gear opens.",
      groups: ["settings-nav", "settings-general", "settings-help"]
    },
    {
      id: "sidebar",
      label: "Left column",
      blurb: "The column beside the chat.",
      groups: ["sidebar"]
    },
    {
      id: "right-column",
      label: "Right column",
      blurb: "The side card and its tabs.",
      groups: ["right-chrome", "right-launcher", "right-tabs", "browser-toolbar"]
    },
    {
      id: "new-session",
      label: "New session",
      blurb: "A blank conversation before the first message.",
      groups: ["new-session"]
    },
    {
      id: "composer",
      label: "Composer",
      blurb: "Controls around the message box.",
      groups: ["composer"]
    },
    {
      id: "dsh",
      label: "DSH",
      blurb: "Pieces dsh draws in the conversation that are not Tracy's: view tabs and the session header's tools.",
      groups: ["dsh-tabs", "dsh-header"]
    },
    {
      id: "assistant",
      label: "Help",
      blurb: "The /help command in the agent's chat.",
      groups: ["assistant"]
    },
    {
      id: "onboarding",
      label: "Getting started",
      blurb: "The welcome screen after sign-in.",
      groups: ["onboarding"]
    }
  ],
  groups: [
    {
      id: "settings-help",
      title: "Settings dialog \xB7 Help & about",
      blurb: "Links inside Help & about."
    },
    {
      id: "settings-nav",
      title: "Settings dialog \xB7 navigation",
      blurb: "Rows in the left column of the Settings dialog a customer opens from the gear."
    },
    {
      id: "settings-general",
      title: "Settings dialog \xB7 General",
      blurb: "Rows inside the General section."
    },
    {
      id: "sidebar",
      title: "Left column of the page",
      blurb: "Pieces beside the chat. Off keeps the customer on the conversation."
    },
    {
      id: "new-session",
      title: "New session screen",
      blurb: "What a blank conversation shows before the first message."
    },
    {
      id: "composer",
      title: "Composer",
      blurb: "Controls around the message box."
    },
    {
      id: "right-chrome",
      title: "Right column \xB7 frame",
      blurb: "The side card itself: what surrounds the tabs. Whether a customer may switch tabs off themselves is the \u201CSide card\u201D row of the Settings dialog."
    },
    {
      id: "right-launcher",
      title: "Right column \xB7 + menu",
      blurb: "Entries the + button and the Start guide list. One switch per entry; a tab type left out of the menu stays openable from its own entry points. Today the code lists every enabled tab \u2014 the two-entry menu is a mockup decision of 27/09, not shipped."
    },
    {
      id: "right-tabs",
      title: "Right column \xB7 tabs",
      blurb: "Tab types the + launcher and deep links can open. Off removes the type for customers: not in the menu, not by link, and the customer cannot switch it back on."
    },
    {
      id: "browser-toolbar",
      title: "Right column \xB7 Browser toolbar",
      blurb: "Buttons on the site browser's toolbar, beside the address bar (Undo, Edit and Comments have no switch), and the site's Design system row (the Design system button left the toolbar on 12/10/2026) and whether the chat may do what that row does."
    },
    {
      id: "dsh-tabs",
      title: "Conversation view tabs",
      blurb: "The tab strip above a conversation (Chat, Trajectory). Hiding Trajectory while a customer is on it brings them back to Chat."
    },
    {
      id: "dsh-header",
      title: "Session header tools",
      blurb: "The buttons at the right of a conversation's header."
    },
    {
      id: "assistant",
      title: "Help",
      blurb: "Typing /help and a question in the agent's chat asks Tracy Help about Tracy and the customer's own sites. It answers and points at screens; it changes nothing, and the agent never sees the question."
    },
    {
      id: "onboarding",
      title: "Getting started",
      blurb: "The welcome screen: sign in, pick your AI account, appearance & language, and in the desktop app notifications."
    }
  ],
  switches: [
    {
      id: "help-desktop-download",
      group: "settings-help",
      label: "Download desktop app",
      hint: "The download button in Help & about on the web.",
      drawnBy: "Tracy",
      defaultOn: true,
      parent: "tracy-help-about"
    },
    {
      id: "general",
      group: "settings-nav",
      label: "General",
      hint: "Language, appearance, font size.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "plugins",
      group: "settings-nav",
      label: "Built-in plugins",
      hint: "Inspect the plugins this deployment ships.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "tracy-account",
      group: "settings-nav",
      label: "Account",
      hint: "Who is signed in, and Sign out. Off, the account menu's header still shows who is signed in but no longer opens Settings \u203A Account.",
      drawnBy: "Tracy",
      defaultOn: true,
      warning: "Off leaves the customer no way to sign out: Sign out lives only in Settings \u203A Account."
    },
    {
      id: "tracy-model-plan",
      group: "settings-nav",
      label: "AI accounts",
      hint: "The person's own AI accounts (Claude, ChatGPT Codex, \u2026) and their routing, on web and desktop: the Settings section and its row in the account menu. Off hides both; saved connections are kept.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "dsh-subscriptions",
      group: "settings-nav",
      label: "Host subscriptions",
      hint: "The shared host must not store customer subscriptions.",
      drawnBy: "dsh",
      defaultOn: false,
      locked: "Use account-scoped AI accounts on web and desktop."
    },
    {
      id: "tracy-notifications",
      group: "settings-nav",
      label: "Notifications",
      hint: "Inbox and Email switches per kind of notification.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "tracy-site",
      group: "settings-nav",
      label: "This site",
      hint: "The open site: address, platform, seat.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "better-sidebar",
      group: "settings-nav",
      label: "Side card",
      hint: "Which side-card tabs are enabled.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "tracy-help-about",
      group: "settings-nav",
      label: "Help & about",
      hint: "Server build, desktop app updates, links to help and community.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "website-opportunities",
      group: "settings-nav",
      label: "Website Opportunities",
      hint: "Find restaurants, collect their website and social content, and build demo sites; also the desktop Help menu item and the Default CMS setting.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "website-opportunities-public-find",
      group: "settings-nav",
      label: "Website Opportunities: public Find",
      hint: "The sign-in-free /find page where anyone can search restaurants near a place (Google, capped per day in /ops/settings/wo). Answers only while Website Opportunities is on too.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "language",
      group: "settings-general",
      label: "Language",
      hint: "The UI language of the page.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "appearance",
      group: "settings-general",
      label: "Appearance",
      hint: "Light, dark, or system.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "font-size",
      group: "settings-general",
      label: "Font size",
      hint: "Conversation text size.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "transcript-view",
      group: "settings-general",
      label: "Work details",
      hint: "How much detail to show for tool calls.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "performance-usage",
      group: "settings-general",
      label: "Performance & usage",
      hint: "Performance and usage information.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "composer-enter",
      group: "settings-general",
      label: "Send behavior while busy",
      hint: "What Enter does while the agent runs.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "other-sites",
      group: "sidebar",
      label: "Site folders",
      hint: "The list of the customer\u2019s other sites. Switching sites lives in the Browser tab instead.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "settings-button",
      group: "sidebar",
      label: "Account menu",
      hint: "The person's avatar at the bottom of the column, which opens the account menu (Account, AI accounts, Settings, Appearance, Community). Settings opens from that menu. Off hides the menu and the whole dialog above.",
      drawnBy: "Tracy",
      defaultOn: true,
      warning: "Off leaves the customer no way to sign out: Sign out lives only in Settings \u203A Account."
    },
    {
      id: "community-link",
      group: "sidebar",
      label: "Community link",
      hint: "The Community row of the account menu (Discord mark), where customers ask questions, report bugs and share feedback.",
      drawnBy: "Tracy",
      defaultOn: true,
      warning: "It is where the Need help? button sends a customer who hid it. Off with that button hidden leaves no way to the community."
    },
    {
      id: "shortcuts",
      group: "settings-general",
      label: "Keyboard shortcuts",
      hint: "The shortcuts row and its page.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "workspace-tree",
      group: "sidebar",
      label: "Sitespace tree and session list",
      hint: "The open site\u2019s folder with its conversations.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "session-status-dot",
      group: "sidebar",
      label: "Status dot on conversations",
      hint: "Waiting, errored, finished \u2014 beside each conversation row.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "session-timestamp",
      group: "sidebar",
      label: "Timestamp on conversations",
      hint: "When each conversation last moved.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "hero-headline",
      group: "new-session",
      label: "Hero headline and Preview badge",
      hint: "\u201CInto the Unknown\u201D above a blank conversation.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "guide-picture",
      group: "right-chrome",
      label: "Compass picture on the Start guide",
      hint: "The illustration above the right column\u2019s Start list.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "start-cards",
      group: "new-session",
      label: "Start block on /new/",
      hint: "New user: Create a new site, Start from a template, Import your existing site. A site: Edit, Comments, Site changes, Team.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "mode-platform-row",
      group: "new-session",
      label: "Mode / Platform row on a blank session",
      hint: "Sitespace, mode and platform pickers above the composer before the first message.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "access-mode",
      group: "composer",
      label: "Access mode chip",
      hint: "Read-only / workspace-write picker. The level itself is still decided by the host.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "model-picker",
      group: "composer",
      label: "Model picker and Effort menu",
      hint: "Tracy picks the model for the customer.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "preset-picker",
      group: "composer",
      label: "Role picker (Designer, Developer, Writer, SEO/GEO)",
      hint: "Where a customer picks the role Tracy works in: the role chip in the message box before a site's first message, and the Mode / Platform pills on a blank session. Off: every session starts with the default preset (Designer for the site's platform).",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "composer-voice-input",
      group: "composer",
      label: "Voice input (microphone beside Send)",
      hint: "The microphone in the message box: the customer speaks and the words appear in the message as they are recognised, in the language spoken (ElevenLabs). Shows only on a deployment with a speech key (SPEECH_TO_TEXT_API_KEY).",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "voice-plan-approval",
      group: "composer",
      label: "Approve a plan by voice",
      hint: "In a voice conversation, a plan waiting for review is read out (its title and scope) and the customer may approve it by saying the whole phrase, such as \u201Capprove this plan\u201D, or ask for a change with \u201Cchange the plan \u2026\u201D. Only one plan waiting and no other question; a plan that changed is read again. Off: the customer is sent to the chat to review the plan, as before. Needs Voice input on.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "help-button",
      group: "composer",
      label: "Need help? button",
      hint: "The floating pill above the message box that opens the Discord community. A customer can hide it in their own browser. Off by default: people reach Help by typing /help in the chat.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "split-button",
      group: "right-chrome",
      label: "Split button",
      hint: "Opens a second pane. Cmd+\\ still works.",
      drawnBy: "dsh",
      defaultOn: false
    },
    {
      id: "launch-add-site",
      group: "right-launcher",
      label: "Add site",
      hint: "Create a site on the fleet, or import a running one. Signed-in viewers only.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:add-site"]
    },
    {
      id: "launch-my-sites",
      group: "right-launcher",
      label: "My sites",
      hint: "Sites the viewer holds a seat on. Signed-in viewers only. Added by Lee 28/09.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:my-sites"]
    },
    {
      id: "launch-inspirations",
      group: "right-launcher",
      label: "Design templates",
      hint: "154 design templates and the brand tab.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:design-inspiration"]
    },
    {
      id: "launch-design-system",
      group: "right-launcher",
      label: "Design system",
      hint: "In the + menu and the Start guide: the design system the open site wears, and another from the design templates library to apply to it. Needs an open site, and Design system on. Off, it still opens from the Design system row on the site's start screen.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:design-system"]
    },
    {
      id: "launch-team",
      group: "right-launcher",
      label: "Team",
      hint: "In the + menu and the Start guide.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:team"]
    },
    {
      id: "launch-changes",
      group: "right-launcher",
      label: "Site changes",
      hint: "In the + menu and the Start guide. Off, it still opens from My sites, the Browser tab's site menu, the Start cards and links.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:changes"]
    },
    {
      id: "launch-brand",
      group: "right-launcher",
      label: "Brand",
      hint: "In the + menu and the Start guide.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:brand"]
    },
    {
      id: "launch-brand-builder",
      group: "right-launcher",
      label: "Brand builder",
      hint: "In the + menu and the Start guide.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:brand-builder"]
    },
    {
      id: "launch-files",
      group: "right-launcher",
      label: "Files",
      hint: "In the + menu and the Start guide.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["editor", "files"]
    },
    {
      id: "launch-git",
      group: "right-launcher",
      label: "Git",
      hint: "Git, shown as \u201CChanges\u201D in the menu.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["git"]
    },
    {
      id: "launch-subagent",
      group: "right-launcher",
      label: "Subagent",
      hint: "Subagent runs, shown as \u201CTasks\u201D in the menu.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["subagent"]
    },
    {
      id: "launch-side-chat",
      group: "right-launcher",
      label: "Side chat",
      hint: "In the + menu and the Start guide.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["sidechat"]
    },
    {
      id: "launch-browser",
      group: "right-launcher",
      label: "Browser",
      hint: "In the + menu and the Start guide.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:browser"]
    },
    {
      id: "launch-build",
      group: "right-launcher",
      label: "Build",
      hint: "The Build tab of each CMS. It still opens from the site flow.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:build:wordpress", "tracy:build:joomla", "tracy:build:emdash"]
    },
    {
      id: "launch-live-site",
      group: "right-launcher",
      label: "Live site",
      hint: "The live site tab of each CMS. It still opens from the site flow.",
      drawnBy: "Tracy",
      defaultOn: false,
      tabs: ["tracy:live-wordpress", "tracy:live-joomla", "tracy:live-emdash"]
    },
    {
      id: "tab-team",
      group: "right-tabs",
      label: "Team tab",
      hint: "Seats on the open site.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:team"]
    },
    {
      id: "tab-changes",
      group: "right-tabs",
      label: "Site changes tab",
      hint: "What changed on the site, by whom and from where, with its backups: create one, restore files or everything.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:changes"]
    },
    {
      id: "tab-inspirations",
      group: "right-tabs",
      label: "Design templates tab",
      hint: "154 design templates and the brand tab.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:design-inspiration"]
    },
    {
      id: "tab-brand",
      group: "right-tabs",
      label: "Brand tab",
      hint: "The site\u2019s brand inspiration.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:brand"]
    },
    {
      id: "tab-brand-builder",
      group: "right-tabs",
      label: "Brand builder tab",
      hint: "Build a brand from a URL.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:brand-builder"]
    },
    {
      id: "tab-files",
      group: "right-tabs",
      label: "Files tab",
      hint: "The site\u2019s files, opened in the editor.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["editor"]
    },
    {
      id: "tab-git",
      group: "right-tabs",
      label: "Git tab",
      hint: "Developer view; a site is not a git repo.",
      drawnBy: "dsh",
      defaultOn: true,
      tabs: ["git"]
    },
    {
      id: "tab-subagent",
      group: "right-tabs",
      label: "Subagent tab",
      hint: "Developer view of subagent runs.",
      drawnBy: "dsh",
      defaultOn: true,
      tabs: ["subagent"]
    },
    {
      id: "tab-side-chat",
      group: "right-tabs",
      label: "Side chat tab",
      hint: "A second conversation beside the main one.",
      drawnBy: "dsh",
      defaultOn: true,
      tabs: ["sidechat"]
    },
    {
      id: "tab-inbox",
      group: "right-tabs",
      label: "Inbox",
      hint: "Team and comment notifications from every site, and its row with the unread count below New session in the left column. Signed-in viewers only. Spec #809.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:inbox"]
    },
    {
      id: "tab-questions",
      group: "right-tabs",
      label: "Questions",
      hint: "The agent's questions as one form in the right pane; off, the chat card alone asks them.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:ask-user"]
    },
    {
      id: "site-connect-domain",
      group: "right-tabs",
      label: "Connect domain",
      hint: "The button on a site\u2019s Publish tab (My Sites \u203A \u22EF \u203A Publish) that lets an Owner add a domain of their own. Turned off, the server also refuses to add a domain or check one's DNS. A domain a site already has stays shown, keeps working and can still be removed.",
      drawnBy: "Tracy",
      defaultOn: true,
      warning: "A customer who is part-way through connecting a domain keeps seeing it but can no longer check its DNS. It can still be removed, and the next publish still connects it once its records are right."
    },
    {
      id: "site-brand-uploads",
      group: "right-tabs",
      label: "Logo and favicon questions",
      hint: "The Logo and Favicon questions in Add site \u203A Customize your site, and the upload of their PNG files. Off: the sheet does not ask them and the server ignores any file sent with a new site.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "site-from-business",
      group: "right-tabs",
      label: "Build from my business",
      hint: "The Build from my business start in Add site: the customer finds their business by name and city or pastes its website or Google Maps link, Tracy researches it, picks a template and the site's agent builds the whole site in one chat. Off: Add site shows only its other starts and the server refuses these doors.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "toolbar-design-system",
      group: "browser-toolbar",
      label: "Design system",
      hint: "The Design system row on the site's start screen and the tab it opens: shows the design system the site wears, applies another from the design templates library to the running site, and undoes it.",
      drawnBy: "Tracy",
      defaultOn: true,
      tabs: ["tracy:design-system"]
    },
    {
      id: "chat-design-system",
      group: "browser-toolbar",
      label: "Design system through the chat",
      hint: "The chat route to a whole design system, beside the Design system row on the site's start screen: the agent proposing design templates for the site and applying one (a Refero library id, from a pasted DESIGN.md, or as a whole new look) through the Design system tab's own door, the \u201CUse this design template\u201D button of the preview dialog, and the WordPress style variation the agent could switch. Off (the default since 11/10/2026, David): the agent changes nothing of the kind and points the customer to the Design system row in one sentence; Help says the same. Element edits written relative to the system the site wears, and picking a design when a new site is created, are not governed by this switch.",
      drawnBy: "Tracy",
      defaultOn: false,
      warning: "On lets the agent replace a site's whole look from the chat. Turn it on only once the chat route has been measured again."
    },
    {
      id: "site-sync-from-live",
      group: "browser-toolbar",
      label: "Sync from live",
      hint: "An imported Joomla or WordPress site\u2019s \u201CSync from live\u201D row in the site\u2019s \u2022\u2022\u2022 menu, and the Sync step of its Publish tab (right before the last step of each flow): Tracy reads the customer\u2019s live site, merges what changed there into the copy (Tracy\u2019s own changes stay) and puts the result in place behind a backup. Off: the row and the step go, and Export packs the copy as it is.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "site-sync-to-live",
      group: "browser-toolbar",
      label: "Sync to live",
      hint: "An imported Joomla or WordPress site\u2019s \u201CSync to live\u201D row in the site\u2019s \u2022\u2022\u2022 menu and the \u201CSend changes to your live site\u201D choice of its Publish tab (Owners only): Tracy previews the content changes it made on the copy, and after the Owner confirms, writes them to the customer\u2019s live site through its Claude Cowork plugin, skipping anything the live site changed since the last sync, with an Undo. Off: the row and the choice go; nothing is written to a live site.",
      drawnBy: "Tracy",
      defaultOn: false
    },
    {
      id: "dsh-trajectory-tab",
      group: "dsh-tabs",
      label: "Trajectory tab",
      hint: "The step-by-step record of what the agent did in this conversation.",
      drawnBy: "dsh",
      defaultOn: true
    },
    {
      id: "dsh-open-in-app",
      group: "dsh-header",
      label: "Open in app",
      hint: "The \u2197 button with its list of editors (Cursor, VS Code, Zed\u2026) that opens the workspace on the viewer's own machine.",
      drawnBy: "dsh",
      defaultOn: false,
      locked: "Locked off: dsh launches the editor on the server, not on the customer's machine, so the button can only fail. Its plugin is off in every Tracy bundle; unlock when an upstream dsh release opens editors on the viewer's side."
    },
    {
      id: "dsh-session-menu",
      group: "dsh-header",
      label: "\u201C\u2026\u201D menu (Feedback, Download)",
      hint: "The whole \u201CMore actions\u201D menu. Off hides every item in it, whatever the switches below say.",
      drawnBy: "dsh",
      defaultOn: true,
      warning: "Off hides the progress of a download started with /export: the command still runs, silently."
    },
    {
      id: "dsh-session-menu-feedback",
      group: "dsh-header",
      label: "Feedback",
      hint: "Send feedback about this conversation.",
      drawnBy: "dsh",
      defaultOn: true,
      parent: "dsh-session-menu"
    },
    {
      id: "dsh-session-menu-download",
      group: "dsh-header",
      label: "Download conversation file",
      hint: "Download this conversation as a file.",
      drawnBy: "dsh",
      defaultOn: true,
      parent: "dsh-session-menu"
    },
    {
      id: "ai-assistant",
      group: "assistant",
      label: "Help command (/help)",
      hint: "Typing /help followed by a question in the agent's chat asks Tracy Help about Tracy and the person's own sites. Off: /help is an ordinary message for the agent.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "onboarding",
      group: "onboarding",
      label: "Getting started screen",
      hint: "Shown once to each account after sign-in on the web (once per computer in the desktop app), and reopened from Getting started in the account menu. Off hides the screen and that menu row.",
      drawnBy: "Tracy",
      defaultOn: true
    },
    {
      id: "website-voice-widget",
      group: "new-session",
      label: "Embeddable website assistant",
      hint: "The voice-first website discovery widget at /widget and its embeddable script. Uses the real template, design-system, sign-in and site creation doors.",
      drawnBy: "Tracy",
      defaultOn: false
    }
  ]
};

// ../../core/tracy-core/src/ui-switches/index.mjs
var UI_SWITCHES = Object.freeze(catalogue_default.switches.map((s) => Object.freeze({ ...s })));
var DEFAULTS = new Map(UI_SWITCHES.map((s) => [s.id, s.defaultOn]));
var LOCKED = new Set(UI_SWITCHES.filter((s) => s.locked !== void 0).map((s) => s.id));
var LAUNCHER_TABS = Object.freeze([
  ...new Set(UI_SWITCHES.filter((s) => s.id.startsWith("launch-")).flatMap((s) => s.tabs ?? []))
]);
var TAB_SWITCHES = { allowed: /* @__PURE__ */ new Map(), listed: /* @__PURE__ */ new Map() };
for (const s of UI_SWITCHES) {
  const kind = s.id.startsWith("tab-") ? "allowed" : s.id.startsWith("launch-") ? "listed" : null;
  if (kind === null) continue;
  for (const tab of s.tabs ?? []) TAB_SWITCHES[kind].set(tab, s.id);
}
var UI_DOOR = "/api/ui";
var PAGE_READ = Symbol.for("@tracy/core/ui-switches#page-read");
async function switchesAtTracy(origin, options = {}) {
  if (typeof origin !== "string" || origin.trim() === "") return null;
  const base = origin.trim().replace(/\/+$/, "");
  const call = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 3e3;
  const hidden = await readHidden(
    (url, init) => call(`${base}${url}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  );
  if (hidden === null) return null;
  return (id) => {
    const fallback = DEFAULTS.get(id);
    if (fallback === void 0) throw new Error(`ui-switches: "${id}" is not in catalogue.json`);
    return LOCKED.has(id) ? fallback : !hidden.has(id);
  };
}
async function readHidden(call) {
  try {
    const res = await call(UI_DOOR, { headers: { accept: "application/json" }, credentials: "same-origin" });
    if (!res.ok) return null;
    const body = await res.json();
    if (body === null || typeof body !== "object" || !Array.isArray(body.hidden)) return null;
    return new Set(body.hidden.filter((id) => typeof id === "string"));
  } catch {
    return null;
  }
}

// src/host/index.ts
import { buildBrandSystem, renderTypography } from "@tracy/od-brand-engine";

// ../../../scripts/lib/od-slots-dom.mjs
import { parseHTML } from "linkedom";

// ../../../scripts/lib/od-slot-rules.mjs
var SLOT_TAGS = /* @__PURE__ */ new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "button",
  "a",
  "label",
  "span",
  "strong",
  "em",
  "small",
  "li",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "blockquote",
  "summary",
  "legend",
  "option"
]);
var SKIP_TAGS = /* @__PURE__ */ new Set(["script", "style", "svg", "template", "noscript", "head", "title"]);
function isNumberish(text) {
  const t = text.trim();
  return /\d/.test(t) && /^[~<>≤≥+\-–—]?\s?[$€£¥]?[\d.,]+(\s?[a-zA-Z%×x/]{1,5})?$/.test(t);
}
function isEyebrow(text) {
  const t = text.trim();
  if (t.length < 3 || t.length > 60) return false;
  const letters = t.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-ZÀ-Ỹ]/g, "").length;
  return upper / letters.length >= 0.8;
}
function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function roleOf(el) {
  const t = el.text.trim();
  const cls = el.classes.join(" ");
  if (/\b(logo|brand|wordmark|nav-logo)\b/.test(cls) && words(t) <= 3) return "brand";
  if (el.tag === "h1") return "headline";
  if (el.tag === "h2") return "title";
  if (el.tag === "h3" || el.tag === "h4") return "subtitle";
  if (el.tag === "blockquote") return "quote";
  if (el.tag === "button" || el.role === "button" || /\b(btn|button|cta|pill-button)\b/.test(cls)) {
    return "button";
  }
  if (el.tag === "a") return el.ancestors.includes("nav") || el.ancestors.includes("header") ? "nav" : "link";
  if (isNumberish(t)) return "number";
  if (el.tag === "label" || el.tag === "dt" || el.tag === "th" || el.tag === "legend" || el.tag === "option")
    return "label";
  if (isEyebrow(t) || /\b(eyebrow|kicker|overline|section-label)\b/.test(cls)) return "eyebrow";
  if (el.beforeHeading && words(t) <= 6 && (el.tag === "p" || el.tag === "span" || el.tag === "small"))
    return "eyebrow";
  if (el.tag === "p") return words(t) <= 4 ? "label" : "paragraph";
  return words(t) <= 5 ? "label" : "paragraph";
}
var GENERIC_GROUPS = /* @__PURE__ */ new Set(["layout", "typography"]);
function groupOf(groups, matches) {
  const ordered = [
    ...groups.filter((g) => !GENERIC_GROUPS.has(g.id)),
    ...groups.filter((g) => GENERIC_GROUPS.has(g.id))
  ];
  for (const g of ordered) {
    for (const sel of g.selectors ?? []) {
      if (sel.includes(":")) continue;
      try {
        if (matches(sel)) return g.id;
      } catch {
      }
    }
  }
  return null;
}
function slotRecord({ tag, n, text, role, group, inNav = false }) {
  const t = text.trim().replace(/\s+/g, " ");
  return { id: `${tag}.${String(n)}`, tag, n, role, group, inNav, text: t, chars: t.length, words: words(t) };
}

// ../../../scripts/lib/od-slots-dom.mjs
function ownText(el) {
  let out = "";
  for (const node of el.childNodes) if (node.nodeType === 3) out += node.textContent;
  return out.replace(/\s+/g, " ").trim();
}
function ancestorsOf(el) {
  const names = [];
  for (let p = el.parentElement; p; p = p.parentElement) names.push(p.tagName.toLowerCase());
  return names;
}
function insideSkipped(el) {
  for (let p = el; p; p = p.parentElement) {
    const tag = p.tagName?.toLowerCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (p.getAttribute?.("aria-hidden") === "true") return true;
    if (p.getAttribute?.("data-slots") === "skip") return true;
  }
  return false;
}
function slotsOf(html, groups) {
  const { document: document2 } = parseHTML(html);
  const body = document2.body;
  if (!body) return [];
  const counters = /* @__PURE__ */ new Map();
  const slots = [];
  for (const el of body.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (!SLOT_TAGS.has(tag)) continue;
    const n = counters.get(tag) ?? 0;
    counters.set(tag, n + 1);
    if (insideSkipped(el)) continue;
    const text = ownText(el);
    if (text.length === 0) continue;
    const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    const ancestors = ancestorsOf(el);
    const nextTag = el.nextElementSibling?.tagName?.toLowerCase();
    const role = roleOf({
      tag,
      classes,
      text,
      ancestors,
      role: el.getAttribute("role"),
      beforeHeading: nextTag === "h1" || nextTag === "h2"
    });
    const group = groupOf(groups, (sel) => el.closest(sel) !== null);
    const inNav = ancestors.includes("nav") || ancestors.includes("header");
    slots.push(slotRecord({ tag, n, text, role, group, inNav }));
  }
  return slots;
}

// src/host/artifact-slots.json
var artifact_slots_default = {
  schemaVersion: "tracy-od-slots/v1",
  note: "Generated by scripts/build-od-slots.mjs from systems/default/system/artifacts/*.html \u2014 one template per kind for all systems; do not edit.",
  artifacts: {
    landing: [
      {
        id: "p.0",
        tag: "p",
        n: 0,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Landing module",
        chars: 14,
        words: 2
      },
      {
        id: "h1.0",
        tag: "h1",
        n: 0,
        role: "headline",
        group: null,
        inNav: false,
        text: "Neutral Modern Launch narrative",
        chars: 31,
        words: 4
      },
      {
        id: "p.1",
        tag: "p",
        n: 1,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Hero, proof points, and conversion actions composed from the design system tokens.",
        chars: 82,
        words: 12
      },
      {
        id: "a.0",
        tag: "a",
        n: 0,
        role: "button",
        group: null,
        inNav: false,
        text: "Continue",
        chars: 8,
        words: 1
      },
      {
        id: "a.1",
        tag: "a",
        n: 1,
        role: "button",
        group: null,
        inNav: false,
        text: "View details",
        chars: 12,
        words: 2
      },
      {
        id: "p.2",
        tag: "p",
        n: 2,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Preview",
        chars: 7,
        words: 1
      },
      {
        id: "h3.0",
        tag: "h3",
        n: 0,
        role: "subtitle",
        group: null,
        inNav: false,
        text: "Landing page",
        chars: 12,
        words: 2
      },
      {
        id: "p.3",
        tag: "p",
        n: 3,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Bundled OpenDesign package for Neutral Modern, derived from curated DESIGN.md, tokens.css, and components.html fixtures.",
        chars: 120,
        words: 14
      },
      {
        id: "label.0",
        tag: "label",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Primary input",
        chars: 13,
        words: 2
      },
      {
        id: "label.1",
        tag: "label",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Status",
        chars: 6,
        words: 1
      },
      {
        id: "option.0",
        tag: "option",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Ready",
        chars: 5,
        words: 1
      },
      {
        id: "option.1",
        tag: "option",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Draft",
        chars: 5,
        words: 1
      }
    ],
    deck: [
      {
        id: "p.0",
        tag: "p",
        n: 0,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Deck module",
        chars: 11,
        words: 2
      },
      {
        id: "h1.0",
        tag: "h1",
        n: 0,
        role: "headline",
        group: null,
        inNav: false,
        text: "Neutral Modern Executive deck",
        chars: 29,
        words: 4
      },
      {
        id: "p.1",
        tag: "p",
        n: 1,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Slide-scale title, metric, and section patterns for presentation work.",
        chars: 70,
        words: 9
      },
      {
        id: "a.0",
        tag: "a",
        n: 0,
        role: "button",
        group: null,
        inNav: false,
        text: "Continue",
        chars: 8,
        words: 1
      },
      {
        id: "a.1",
        tag: "a",
        n: 1,
        role: "button",
        group: null,
        inNav: false,
        text: "View details",
        chars: 12,
        words: 2
      },
      {
        id: "p.2",
        tag: "p",
        n: 2,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Preview",
        chars: 7,
        words: 1
      },
      {
        id: "h3.0",
        tag: "h3",
        n: 0,
        role: "subtitle",
        group: null,
        inNav: false,
        text: "Pitch deck",
        chars: 10,
        words: 2
      },
      {
        id: "p.3",
        tag: "p",
        n: 3,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Bundled OpenDesign package for Neutral Modern, derived from curated DESIGN.md, tokens.css, and components.html fixtures.",
        chars: 120,
        words: 14
      },
      {
        id: "label.0",
        tag: "label",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Primary input",
        chars: 13,
        words: 2
      },
      {
        id: "label.1",
        tag: "label",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Status",
        chars: 6,
        words: 1
      },
      {
        id: "option.0",
        tag: "option",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Ready",
        chars: 5,
        words: 1
      },
      {
        id: "option.1",
        tag: "option",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Draft",
        chars: 5,
        words: 1
      }
    ],
    poster: [
      {
        id: "p.0",
        tag: "p",
        n: 0,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Poster module",
        chars: 13,
        words: 2
      },
      {
        id: "h1.0",
        tag: "h1",
        n: 0,
        role: "headline",
        group: null,
        inNav: false,
        text: "Neutral Modern Campaign poster",
        chars: 30,
        words: 4
      },
      {
        id: "p.1",
        tag: "p",
        n: 1,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "High-impact display composition using the system color, type, and spacing rhythm.",
        chars: 81,
        words: 11
      },
      {
        id: "a.0",
        tag: "a",
        n: 0,
        role: "button",
        group: null,
        inNav: false,
        text: "Continue",
        chars: 8,
        words: 1
      },
      {
        id: "a.1",
        tag: "a",
        n: 1,
        role: "button",
        group: null,
        inNav: false,
        text: "View details",
        chars: 12,
        words: 2
      },
      {
        id: "p.2",
        tag: "p",
        n: 2,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Preview",
        chars: 7,
        words: 1
      },
      {
        id: "h3.0",
        tag: "h3",
        n: 0,
        role: "subtitle",
        group: null,
        inNav: false,
        text: "Poster",
        chars: 6,
        words: 1
      },
      {
        id: "p.3",
        tag: "p",
        n: 3,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Bundled OpenDesign package for Neutral Modern, derived from curated DESIGN.md, tokens.css, and components.html fixtures.",
        chars: 120,
        words: 14
      },
      {
        id: "label.0",
        tag: "label",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Primary input",
        chars: 13,
        words: 2
      },
      {
        id: "label.1",
        tag: "label",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Status",
        chars: 6,
        words: 1
      },
      {
        id: "option.0",
        tag: "option",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Ready",
        chars: 5,
        words: 1
      },
      {
        id: "option.1",
        tag: "option",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Draft",
        chars: 5,
        words: 1
      }
    ],
    email: [
      {
        id: "p.0",
        tag: "p",
        n: 0,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Email module",
        chars: 12,
        words: 2
      },
      {
        id: "h1.0",
        tag: "h1",
        n: 0,
        role: "headline",
        group: null,
        inNav: false,
        text: "Neutral Modern Email module",
        chars: 27,
        words: 4
      },
      {
        id: "p.1",
        tag: "p",
        n: 1,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Transactional header, body copy, and primary call-to-action treatment.",
        chars: 70,
        words: 8
      },
      {
        id: "a.0",
        tag: "a",
        n: 0,
        role: "button",
        group: null,
        inNav: false,
        text: "Continue",
        chars: 8,
        words: 1
      },
      {
        id: "a.1",
        tag: "a",
        n: 1,
        role: "button",
        group: null,
        inNav: false,
        text: "View details",
        chars: 12,
        words: 2
      },
      {
        id: "p.2",
        tag: "p",
        n: 2,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Preview",
        chars: 7,
        words: 1
      },
      {
        id: "h3.0",
        tag: "h3",
        n: 0,
        role: "subtitle",
        group: null,
        inNav: false,
        text: "Email",
        chars: 5,
        words: 1
      },
      {
        id: "p.3",
        tag: "p",
        n: 3,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Bundled OpenDesign package for Neutral Modern, derived from curated DESIGN.md, tokens.css, and components.html fixtures.",
        chars: 120,
        words: 14
      },
      {
        id: "label.0",
        tag: "label",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Primary input",
        chars: 13,
        words: 2
      },
      {
        id: "label.1",
        tag: "label",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Status",
        chars: 6,
        words: 1
      },
      {
        id: "option.0",
        tag: "option",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Ready",
        chars: 5,
        words: 1
      },
      {
        id: "option.1",
        tag: "option",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Draft",
        chars: 5,
        words: 1
      }
    ],
    newsletter: [
      {
        id: "p.0",
        tag: "p",
        n: 0,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Newsletter module",
        chars: 17,
        words: 2
      },
      {
        id: "h1.0",
        tag: "h1",
        n: 0,
        role: "headline",
        group: null,
        inNav: false,
        text: "Neutral Modern Editorial issue",
        chars: 30,
        words: 4
      },
      {
        id: "p.1",
        tag: "p",
        n: 1,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Readable long-form layout with heading hierarchy and compact story modules.",
        chars: 75,
        words: 10
      },
      {
        id: "a.0",
        tag: "a",
        n: 0,
        role: "button",
        group: null,
        inNav: false,
        text: "Continue",
        chars: 8,
        words: 1
      },
      {
        id: "a.1",
        tag: "a",
        n: 1,
        role: "button",
        group: null,
        inNav: false,
        text: "View details",
        chars: 12,
        words: 2
      },
      {
        id: "p.2",
        tag: "p",
        n: 2,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Preview",
        chars: 7,
        words: 1
      },
      {
        id: "h3.0",
        tag: "h3",
        n: 0,
        role: "subtitle",
        group: null,
        inNav: false,
        text: "Newsletter",
        chars: 10,
        words: 1
      },
      {
        id: "p.3",
        tag: "p",
        n: 3,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Bundled OpenDesign package for Neutral Modern, derived from curated DESIGN.md, tokens.css, and components.html fixtures.",
        chars: 120,
        words: 14
      },
      {
        id: "label.0",
        tag: "label",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Primary input",
        chars: 13,
        words: 2
      },
      {
        id: "label.1",
        tag: "label",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Status",
        chars: 6,
        words: 1
      },
      {
        id: "option.0",
        tag: "option",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Ready",
        chars: 5,
        words: 1
      },
      {
        id: "option.1",
        tag: "option",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Draft",
        chars: 5,
        words: 1
      }
    ],
    form: [
      {
        id: "p.0",
        tag: "p",
        n: 0,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Form module",
        chars: 11,
        words: 2
      },
      {
        id: "h1.0",
        tag: "h1",
        n: 0,
        role: "headline",
        group: null,
        inNav: false,
        text: "Neutral Modern Capture form",
        chars: 27,
        words: 4
      },
      {
        id: "p.1",
        tag: "p",
        n: 1,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Input, selection, helper text, and submission states in one focused page.",
        chars: 73,
        words: 11
      },
      {
        id: "a.0",
        tag: "a",
        n: 0,
        role: "button",
        group: null,
        inNav: false,
        text: "Continue",
        chars: 8,
        words: 1
      },
      {
        id: "a.1",
        tag: "a",
        n: 1,
        role: "button",
        group: null,
        inNav: false,
        text: "View details",
        chars: 12,
        words: 2
      },
      {
        id: "p.2",
        tag: "p",
        n: 2,
        role: "eyebrow",
        group: null,
        inNav: false,
        text: "Preview",
        chars: 7,
        words: 1
      },
      {
        id: "h3.0",
        tag: "h3",
        n: 0,
        role: "subtitle",
        group: null,
        inNav: false,
        text: "Form page",
        chars: 9,
        words: 2
      },
      {
        id: "p.3",
        tag: "p",
        n: 3,
        role: "paragraph",
        group: null,
        inNav: false,
        text: "Bundled OpenDesign package for Neutral Modern, derived from curated DESIGN.md, tokens.css, and components.html fixtures.",
        chars: 120,
        words: 14
      },
      {
        id: "label.0",
        tag: "label",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Primary input",
        chars: 13,
        words: 2
      },
      {
        id: "label.1",
        tag: "label",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Status",
        chars: 6,
        words: 1
      },
      {
        id: "option.0",
        tag: "option",
        n: 0,
        role: "label",
        group: null,
        inNav: false,
        text: "Ready",
        chars: 5,
        words: 1
      },
      {
        id: "option.1",
        tag: "option",
        n: 1,
        role: "label",
        group: null,
        inNav: false,
        text: "Draft",
        chars: 5,
        words: 1
      }
    ]
  }
};

// src/host/gallery.mjs
import path2 from "node:path";
var SYSTEM_FILES = Object.freeze({
  "tokens.css": "text/css; charset=utf-8",
  "components.html": "text/html; charset=utf-8",
  "DESIGN.md": "text/markdown; charset=utf-8",
  "preview/colors.html": "text/html; charset=utf-8",
  "preview/typography.html": "text/html; charset=utf-8",
  "preview/spacing.html": "text/html; charset=utf-8",
  "system/kit.html": "text/html; charset=utf-8",
  "system/kit.dark.html": "text/html; charset=utf-8",
  "system/artifacts/landing.html": "text/html; charset=utf-8",
  "system/artifacts/deck.html": "text/html; charset=utf-8",
  "system/artifacts/poster.html": "text/html; charset=utf-8",
  "system/artifacts/email.html": "text/html; charset=utf-8",
  "system/artifacts/newsletter.html": "text/html; charset=utf-8",
  "system/artifacts/form.html": "text/html; charset=utf-8",
  "system/artifacts/typography.html": "text/html; charset=utf-8"
});
var SITE_FILE = path2.join("docs", "agents", "design-preview.json");
var BRAND_PREFIX = "brand:";
var BRAND_DIR = "Brand";
var SAFE_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
function brandHostOf(id) {
  if (typeof id !== "string" || !id.startsWith(BRAND_PREFIX)) return null;
  const host = id.slice(BRAND_PREFIX.length);
  return SAFE_HOST.test(host) && !/^[0-9.]+$/.test(host) ? host : null;
}
function resolveBrandFile(siteDir, host, file) {
  if (!Object.hasOwn(SYSTEM_FILES, file)) return null;
  const type = (
    /** @type {Record<string, string>} */
    SYSTEM_FILES[file]
  );
  return { path: path2.join(siteDir, BRAND_DIR, host, file), type };
}
var FONT_URL = /url\((["']?)((?:\.\.\/)+)fonts\/([a-z0-9][a-z0-9._-]*\.(woff2?|ttf|otf))\1\)/gi;
var FONT_MIME = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
function inlineBrandFonts(html, readFont) {
  return html.replace(FONT_URL, (whole, _q, _up, file, ext) => {
    const bytes = readFont(file);
    if (!bytes) return whole;
    const mime = (
      /** @type {Record<string, string>} */
      FONT_MIME[ext.toLowerCase()] ?? "application/octet-stream"
    );
    return `url(data:${mime};base64,${bytes.toString("base64")})`;
  });
}
function brandRows(found) {
  const rows = [];
  for (const { dir, manifest } of found) {
    const m = (
      /** @type {Record<string, unknown> | null} */
      manifest && typeof manifest === "object" ? manifest : null
    );
    if (!m || m.id !== `${BRAND_PREFIX}${dir}` || brandHostOf(String(m.id)) === null) continue;
    rows.push(m);
  }
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "own" ? -1 : 1;
    const at = (x) => String(
      /** @type {{ extractedAt?: unknown } | undefined} */
      x.source?.extractedAt ?? ""
    );
    return at(b).localeCompare(at(a));
  });
  return slimCatalog({ systems: rows });
}
function chipOfToken(segment) {
  try {
    return decodeURIComponent(segment).replace(/~/g, "/");
  } catch {
    return "";
  }
}
function parseRoute(prefix, method, url) {
  const pathname = (url ?? "").split("?")[0] ?? "";
  if (!pathname.startsWith(prefix)) return null;
  const query = (url ?? "").split("?")[1] ?? "";
  const lang = new URLSearchParams(query).get("lang") ?? "";
  const rest = pathname.slice(prefix.length).replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = rest.split("/");
  if (method === "GET" && rest === "catalog")
    return new URLSearchParams(query).get("systems") === "all" ? { kind: "catalog", systems: "all" } : { kind: "catalog" };
  if (method === "GET" && parts.length === 3 && parts[0] === "template")
    return { kind: "template", id: parts[1] ?? "", file: parts[2] ?? "" };
  if (method === "GET" && rest === "site") return { kind: "site" };
  if (method === "POST" && rest === "choose") return { kind: "choose" };
  if (method === "GET" && parts.length === 2 && parts[0] === "copy") {
    return { kind: "copy", id: decodeURIComponent(parts[1] ?? ""), lang };
  }
  if (method === "GET" && parts.length === 4 && parts[0] === "copy" && parts[2] === "jobs") {
    return {
      kind: "copyJob",
      id: decodeURIComponent(parts[1] ?? ""),
      job: decodeURIComponent(parts[3] ?? ""),
      lang
    };
  }
  if (parts.length >= 5 && parts[0] === "copy" && parts[2] === "pages") {
    const id = decodeURIComponent(parts[1] ?? "");
    const chip = chipOfToken(parts[3] ?? "");
    if (method === "POST" && parts.length === 5 && parts[4] === "versions") {
      return { kind: "copyVersionCreate", id, chip, lang };
    }
    if (method === "DELETE" && parts.length === 6 && parts[4] === "versions") {
      return { kind: "copyVersionDelete", id, chip, vid: decodeURIComponent(parts[5] ?? ""), lang };
    }
    if (method === "PUT" && parts.length === 5 && parts[4] === "selected") {
      return { kind: "copySelect", id, chip, lang };
    }
  }
  if (method === "GET" && parts.length === 4 && parts[0] === "systems" && parts[2] === "artifact-slots") {
    return {
      kind: "artifactSlots",
      id: decodeURIComponent(parts[1] ?? ""),
      type: decodeURIComponent(parts[3] ?? "")
    };
  }
  if (method === "GET" && parts.length >= 3 && parts[0] === "systems") {
    return {
      kind: "system",
      id: decodeURIComponent(parts[1] ?? ""),
      file: parts.slice(2).map((p) => decodeURIComponent(p)).join("/")
    };
  }
  return null;
}
function resolveSystemFile(systemsDir, ids, id, file) {
  if (!ids.has(id)) return null;
  if (!Object.hasOwn(SYSTEM_FILES, file)) return null;
  const type = (
    /** @type {Record<string, string>} */
    SYSTEM_FILES[file]
  );
  return { path: path2.join(systemsDir, id, file), type };
}
function slimCatalog(catalog, dark = null) {
  const raw = (
    /** @type {{ systems?: unknown } | null} */
    catalog && typeof catalog === "object" ? catalog : null
  );
  const systems = raw && Array.isArray(raw.systems) ? raw.systems : [];
  const out = [];
  for (const entry of systems) {
    const s = (
      /** @type {Record<string, unknown> | null} */
      entry && typeof entry === "object" ? entry : null
    );
    if (!s || typeof s.id !== "string") continue;
    out.push({
      id: s.id,
      name: typeof s.name === "string" ? s.name : s.id,
      category: typeof s.category === "string" ? s.category : "Uncategorised",
      // 🔒 NO `docLanguages` HERE. The catalog carries which languages a system's DESIGN.md was
      // translated into; that is the agent's business when it picks a document to read, and no
      // filter on this grid asks it. Its predecessor `vi` rode out to the browser for exactly as
      // long as it took someone to read the switch it drew and ask what it meant.
      // A catalog written before the classification pass has no shape fields: the band's own
      // defaults, spelled out so the client never sees `undefined`.
      nav: typeof s.nav === "string" ? s.nav : "top-left",
      hero: typeof s.hero === "string" ? s.hero : "split",
      // A brand row (no entry in dark.json) has the engine's own dark tokens: always true.
      dark: dark === null || !(s.id in dark) ? true : dark[s.id]?.safe !== false,
      // Published by Tracy — a design system, the style a site would be dressed in.
      provider: "Tracy",
      /**
       * 🔒 NO ROW HERE IS BUILDABLE TODAY, AND SAYING SO IS THE WHOLE POINT OF THIS FIELD.
       *
       * Every row this function makes is a DESIGN SYSTEM: a look, not a site. Turning one into a
       * site is the agent's dressing run — provision a site, then write its theme, pages, words
       * and pictures from the system's DESIGN.md — and that run is not a way in any more (since
       * 24/09/2026: one creation flow, the Add site wizard). What a customer can make today is a
       * QUICKSTART: a finished site installed as seen, and those rows come from `templates.mjs`
       * with their own real `platforms`, not from here.
       *
       * So the honest answer for these rows is "nowhere", and the gallery shows them as Coming
       * soon rather than hiding them: 151 looks that are being prepared are worth seeing, and a
       * customer who cannot tell what is ready from what is not will find out by pressing.
       *
       * ⚠ THIS LINE HAS BEEN WRONG BEFORE, THE SAME WAY. It stamped `['joomla', 'wordpress']` onto
       * every row including `brand:` ones, so both Create-with buttons lit up on a card whose
       * build fails at stage 1 of 6 — `checkStage` refuses a `brand:` inspiration outright
       * (`tracy-site-build-core/src/host/stages-shared.mjs`: "A brand has no theme style yet").
       * The customer paid for that lie in the expensive order: press, wait through a whole
       * provision, then be asked whether to retry a step that cannot succeed. Brand rows were
       * given `[]` on 15/09; the rest kept the stamp until now. Since 29/09 the catalog door
       * replaces a brand row's `[]` with the CMSes a published quickstart can wear it on
       * (`withBrandPlatforms`, `templates.mjs`) — WordPress builds a brand now (ADR 0023).
       *
       * An empty list, not `undefined`: `undefined` means "names no platforms", which the dialog
       * reads as buildable everywhere.
       */
      platforms: []
    });
  }
  return out;
}
function systemsDirFor(catalogRealPath) {
  return path2.join(path2.dirname(catalogRealPath), "systems");
}
function chosenId(body, ids) {
  if (!body || typeof body !== "object") return null;
  const id = (
    /** @type {Record<string, unknown>} */
    body.id
  );
  return typeof id === "string" && ids.has(id) ? id : null;
}
function validPicks(args, ids) {
  const list = (
    /** @type {{ picks?: unknown } | null} */
    (args && typeof args === "object" ? args : null)?.picks
  );
  if (!Array.isArray(list) || list.length === 0) return null;
  const out = [];
  for (const entry of list) {
    const p = (
      /** @type {Record<string, unknown> | null} */
      entry && typeof entry === "object" ? entry : null
    );
    if (!p || typeof p.id !== "string" || !ids.has(p.id)) return null;
    if (out.some((x) => x.id === p.id)) continue;
    out.push({ id: p.id, why: typeof p.why === "string" ? p.why.trim().slice(0, 200) : "" });
    if (out.length === 3) break;
  }
  return out;
}
var PAGE_TYPES = Object.freeze(["home", "listing", "article", "pricing"]);
var ARTIFACT_TYPES = Object.freeze([
  "landing",
  "deck",
  "poster",
  "email",
  "newsletter",
  "form",
  "typography"
]);
var COPY_DIR = path2.join("docs", "agents", "design-copy");
function copyFileName(id, lang) {
  const base = id.replace(/:/g, "--");
  return lang === void 0 || lang === "" ? `${base}.json` : `${base}.${lang}.json`;
}
function slotLimits(slot) {
  if (slot.role === "paragraph" || slot.role === "quote") {
    return { unit: "chars", min: Math.floor(slot.chars * 0.75), max: Math.ceil(slot.chars * 1.25) };
  }
  const tol = slot.role === "button" ? 0.15 : 0.25;
  return {
    unit: "words",
    min: Math.max(1, Math.floor(slot.words * (1 - tol))),
    max: Math.max(1, Math.ceil(slot.words * (1 + tol)))
  };
}
function measure(text, unit) {
  const t = text.trim();
  return unit === "chars" ? t.length : t.split(/\s+/).filter(Boolean).length;
}
function validCopy(args, slots) {
  const a = (
    /** @type {Record<string, unknown> | null} */
    args && typeof args === "object" ? args : null
  );
  const raw = a?.slots;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: 'slots must be an object of { "<slot id>": "<text>" } \u2014 get the ids from action "form".'
    };
  }
  const known = new Map(slots.map((s) => [s.id, s]));
  const unknown = Object.keys(raw).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Not slots of this inspiration: ${unknown.join(", ")}. Use the ids from action "form".`
    };
  }
  const out = {};
  const over = [];
  const warnings = [];
  for (const [id, value] of Object.entries(
    /** @type {Record<string, unknown>} */
    raw
  )) {
    if (typeof value !== "string" || value.trim() === "") continue;
    const slot = known.get(id);
    if (!slot) continue;
    const lim = slotLimits(slot);
    const got = measure(value, lim.unit);
    if (got > lim.max) over.push({ id, unit: lim.unit, got, min: lim.min, max: lim.max });
    else if (got < lim.min)
      warnings.push(`${id}: ${got} ${lim.unit}, below ${lim.min} \u2014 fine, but the slot will look short`);
    out[id] = value.trim().replace(/\s+/g, " ");
  }
  if (over.length > 0) {
    return {
      ok: false,
      error: `Too long for the slot (the layout would overflow): ${over.map((o) => `${o.id} ${o.got}/${o.max} ${o.unit}`).join(", ")}. Shorten those and write again.`,
      offending: over
    };
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "No slot text given." };
  const brief = a?.brief && typeof a.brief === "object" ? (
    /** @type {Record<string, unknown>} */
    a.brief
  ) : null;
  return {
    ok: true,
    slots: out,
    lang: typeof a?.lang === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(a.lang) ? a.lang : "en",
    brief: brief ? { goal: String(brief.goal ?? ""), voice: String(brief.voice ?? "") } : null,
    warnings
  };
}
function fitScore(brandTokens, systemTokens) {
  const b = tokenFacts(brandTokens);
  const s = tokenFacts(systemTokens);
  let score = 0;
  if (b.accent && s.accent) {
    const dh = Math.abs(b.accent.h - s.accent.h);
    const hue = 1 - Math.min(dh, 360 - dh) / 180;
    score += (b.accent.s < 0.12 || s.accent.s < 0.12 ? 0.5 : hue) * 0.55;
  }
  if (b.bg !== null && s.bg !== null) score += (1 - Math.abs(b.bg - s.bg)) * 0.3;
  if (b.font && s.font) score += (b.font === s.font ? 1 : 0) * 0.15;
  return Math.round(score * 1e3) / 1e3;
}
function tokenFacts(css) {
  const grab = (name2) => {
    const m = new RegExp(`${name2}\\s*:\\s*([^;]+);`).exec(css);
    return m ? m[1].trim() : null;
  };
  const accentHex = grab("--accent");
  const bgHex = grab("--bg");
  const font = grab("--font-display");
  return {
    accent: accentHex ? hsl(accentHex) : null,
    bg: bgHex ? hsl(bgHex)?.l ?? null : null,
    font: font ? font.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase() : null
  };
}
function hsl(hex2) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex2.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16 & 255) / 255;
  const g = (n >> 8 & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = (g - b) / d % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: sat, l };
}

// src/host/prompts.mjs
var DEFAULT_PROMPTS = Object.freeze({
  home: "Keep the headline. Make the rest shorter and more concrete: say what the visitor gets in the first screen, one clear call to action, no marketing adjectives.",
  listing: "One line per item, same length, verb first. The intro says who this list is for; keep the item names as they are.",
  article: "Keep the title. Open with the one fact the reader came for, then the story in plain sentences; no summary at the end.",
  pricing: 'Keep the prices and plan names. Say who each plan is for in one line, and what happens after signing up; no "best value" labels.',
  landing: "A landing page for one thing we sell: headline states the result, the first paragraph names who it is for, three benefits with a real detail each, one call to action repeated at the end.",
  form: 'A contact page: say in two lines what happens after sending and how soon we answer. Field labels short and plain; the button says what it does, not "Submit".',
  newsletter: "This month's issue: one lead story in our own voice, two short updates, one thing readers can do this week. Warm, first person plural, no exclamation marks.",
  email: "A transactional email: the subject line says what happened, the first sentence says what to do next, one button. Plain and short \u2014 it is read on a phone.",
  poster: "A poster for an event or launch: one line that stops a passer-by, the date and place large, one sentence of why to come. Nothing else.",
  typography: "Specimen lines for a type sample: each heading a full sentence in our own voice about what we make, the lead and body paragraphs about how we work \u2014 real, specific, no filler; keep each line close to its current length.",
  deck: "An executive deck: title slide with the one-sentence pitch, then problem, what we do, proof with real numbers, the ask. Short lines, no paragraphs."
});

// src/host/copy.mjs
var COPY_SCHEMA = "tracy-design-copy/v2";
var COPY_SCHEMA_V1 = "tracy-design-copy/v1";
var REWRITTEN_TITLE = "Rewritten";
var BRAND_LANDING = /^[a-z0-9][a-z0-9.-]*_landing$/i;
function chipLayout(chip, sitePages) {
  if (typeof chip !== "string" || chip === "") return null;
  if (ARTIFACT_TYPES.includes(chip)) return { artifact: chip, kind: chip };
  if (BRAND_LANDING.test(chip)) return { artifact: "landing", kind: "landing" };
  if (!chip.startsWith("/")) return null;
  const page = sitePages.find((p) => typeof p.path === "string" && samePath(p.path, chip));
  if (!page) return null;
  const kind = typeof page.type === "string" && PAGE_TYPES.includes(page.type) ? page.type : "home";
  return { fixture: true, kind };
}
function samePath(a, b) {
  const norm = (p) => p.length > 1 ? p.replace(/\/+$/, "") : p;
  return norm(a) === norm(b);
}
function canonicalChip(chip, sitePages) {
  if (!chip.startsWith("/")) return chip;
  const page = sitePages.find((p) => typeof p.path === "string" && samePath(p.path, chip));
  return page ? (
    /** @type {string} */
    page.path
  ) : chip;
}
function promptFor(kind) {
  return DEFAULT_PROMPTS[
    /** @type {keyof typeof DEFAULT_PROMPTS} */
    kind
  ] ?? DEFAULT_PROMPTS.home;
}
function emptyCopy(id, lang = "en") {
  return (
    /** @type {CopyFile} */
    {
      schemaVersion: COPY_SCHEMA,
      system: id,
      writtenAt: "",
      lang,
      brief: null,
      pages: {}
    }
  );
}
function isSlotMap(v) {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((t) => typeof t === "string");
}
function normalizeCopy(parsed, id) {
  const p = (
    /** @type {Record<string, unknown> | null} */
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  );
  if (!p || p.system !== id) return null;
  const lang = typeof p.lang === "string" ? p.lang : "en";
  const brief = p.brief && typeof p.brief === "object" ? {
    goal: String(
      /** @type {any} */
      p.brief.goal ?? ""
    ),
    voice: String(
      /** @type {any} */
      p.brief.voice ?? ""
    )
  } : null;
  const writtenAt = typeof p.writtenAt === "string" ? p.writtenAt : "";
  const file = { ...emptyCopy(id, lang), writtenAt, brief };
  if (p.schemaVersion === COPY_SCHEMA) {
    const pages = (
      /** @type {Record<string, unknown>} */
      p.pages && typeof p.pages === "object" && !Array.isArray(p.pages) ? p.pages : {}
    );
    for (const [chip, raw] of Object.entries(pages)) {
      const c = (
        /** @type {Record<string, unknown> | null} */
        raw && typeof raw === "object" ? raw : null
      );
      if (!c) continue;
      const versions = (Array.isArray(c.versions) ? c.versions : []).filter(isVersion);
      const selected = typeof c.selected === "string" ? c.selected : null;
      file.pages[chip] = {
        versions,
        selected: selected !== null && (BUILTIN_VERSIONS.includes(selected) || versions.some((v) => v.id === selected)) ? selected : null,
        nextPrompt: typeof c.nextPrompt === "string" && c.nextPrompt.trim() !== "" ? c.nextPrompt : null
      };
    }
    return file;
  }
  if (p.schemaVersion !== COPY_SCHEMA_V1) return null;
  const at = writtenAt || (/* @__PURE__ */ new Date(0)).toISOString();
  if (isSlotMap(p.slots) && Object.keys(p.slots).length > 0) {
    chipOf(file, "/").versions.push({
      id: "v1-direction",
      title: REWRITTEN_TITLE,
      kind: "rewritten",
      prompt: brief ? briefText(brief) : null,
      slots: p.slots,
      at,
      model: null
    });
  }
  for (const raw of Array.isArray(p.pages) ? p.pages : []) {
    const g = (
      /** @type {Record<string, unknown> | null} */
      raw && typeof raw === "object" ? raw : null
    );
    if (!g || !isSlotMap(g.slots) || typeof g.type !== "string") continue;
    const chip = ARTIFACT_TYPES.includes(g.type) ? g.type : "/";
    const gb = g.brief && typeof g.brief === "object" ? (
      /** @type {any} */
      g.brief
    ) : null;
    chipOf(file, chip).versions.push({
      id: typeof g.id === "string" && g.id !== "" ? `v1-${g.id}` : `v1-${chipOf(file, chip).versions.length}`,
      title: typeof g.label === "string" && g.label.trim() !== "" ? g.label.trim() : REWRITTEN_TITLE,
      kind: "rewritten",
      prompt: gb ? briefText({ goal: String(gb.goal ?? ""), voice: String(gb.voice ?? "") }) : null,
      slots: g.slots,
      at,
      model: null
    });
  }
  return file;
}
function briefText(b) {
  return [b.goal, b.voice].filter((s) => s.trim() !== "").join(" \u2014 ") || null;
}
function isVersion(v) {
  const x = (
    /** @type {Record<string, unknown> | null} */
    v && typeof v === "object" ? v : null
  );
  return !!x && typeof x.id === "string" && x.id !== "" && typeof x.title === "string" && (x.kind === "rewritten" || x.kind === "llm") && isSlotMap(x.slots);
}
function chipOf(file, chip) {
  file.pages[chip] ??= { versions: [], selected: null, nextPrompt: null };
  return file.pages[chip];
}
function versionId() {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function addVersion(file, chip, version, nextPrompt = void 0) {
  const c = chipOf(file, chip);
  c.versions = [...c.versions.filter((v) => v.id !== version.id), version];
  c.selected = version.id;
  if (nextPrompt !== void 0) c.nextPrompt = nextPrompt;
  file.writtenAt = version.at;
  return c;
}
function removeVersion(file, chip, vid) {
  const c = file.pages[chip];
  if (!c) return false;
  const before = c.versions.length;
  c.versions = c.versions.filter((v) => v.id !== vid);
  if (c.versions.length === before) return false;
  if (c.selected === vid) c.selected = null;
  file.writtenAt = (/* @__PURE__ */ new Date()).toISOString();
  return true;
}
var BUILTIN_VERSIONS = Object.freeze(["yours", "default"]);
function selectVersion(file, chip, selected) {
  if (typeof selected !== "string") return false;
  const c = chipOf(file, chip);
  if (!BUILTIN_VERSIONS.includes(selected) && !c.versions.some((v) => v.id === selected)) return false;
  c.selected = selected;
  return true;
}
var MAX_PROMPT = 1200;
function promptOf(body, chip, kind) {
  const b = (
    /** @type {Record<string, unknown> | null} */
    body && typeof body === "object" ? body : null
  );
  const given = typeof b?.prompt === "string" ? b.prompt.trim() : "";
  if (given.length > MAX_PROMPT) return { ok: false, error: `prompt is over ${MAX_PROMPT} characters` };
  return { ok: true, prompt: given !== "" ? given : chip?.nextPrompt ?? promptFor(kind) };
}
var SYSTEM_PROMPT = [
  "You write website copy that must fit a fixed layout. You are given the kind of page, facts about the site,",
  "the current text of every slot, and for each slot a maximum length in words or characters.",
  "Reply with ONE JSON object and nothing else, no prose, no code fence:",
  '{"title": "...", "nextPrompt": "...", "slots": {"<slot id>": "<text>", ...}}',
  '- title: two to four words naming this take, in the language of the site (e.g. "Bolder claims").',
  "- nextPrompt: two or three sentences, in the language of the site, suggesting a DIFFERENT take for the next",
  "  version of this same page. Speak as the customer would ask; never mention slots, ids, JSON or lengths;",
  "  do not repeat the direction you just took.",
  "- slots: one text per slot id, in the language of the site, NEVER over the maximum. Keep the role of each",
  "  slot (a button stays a button, a number stays a number). Invent freely from the facts of the site \u2014",
  "  numbers, names, quotes, claims; the only hard rule is length. A slot you leave out keeps its current text."
].join("\n");
var MAX_FACTS = 6e3;
function buildCopyPrompt(o) {
  const lines = [];
  lines.push(
    `Page kind: ${o.kind}${o.chip.startsWith("/") ? ` (the site's page at ${o.chip})` : " (a sample product of the design template)"}.`
  );
  lines.push(`Language of the site: ${o.lang}.`);
  const facts = siteFacts(o.site, o.chip);
  if (facts !== null) {
    lines.push("", "Facts about the site (JSON):", facts);
  }
  lines.push("", "Slots, with the maximum each allows and its current text:");
  for (const s of o.slots) {
    if (s.inNav) continue;
    const lim = slotLimits(s);
    const current = o.current[s.id] ?? s.text;
    lines.push(`- ${s.id} [${s.role}, max ${lim.max} ${lim.unit}]: ${JSON.stringify(current)}`);
  }
  lines.push("", "What the customer asked for this take:", o.prompt);
  const system = o.factsOnly ? SYSTEM_PROMPT.replace(
    "Invent freely from the facts of the site \u2014\n  numbers, names, quotes, claims; the only hard rule is length. A slot you leave out keeps its current text.",
    "Use only facts supplied in the customer brief. Existing slot text is sample layout content, not facts.\nRewrite every slot. Do not invent or retain sample names, reviews, ratings, prices, statistics, opening hours, addresses or email.\nThe latest brief replaces all earlier facts. Keep only contact details explicitly supplied in this brief.\nFor unsupported proof or numeric slots use a neutral label without a factual claim; never fabricate a customer quote."
  ) : SYSTEM_PROMPT;
  return { system, user: lines.join("\n") };
}
function siteFacts(site, chip) {
  if (!site) return null;
  const pages = Array.isArray(site.pages) ? (
    /** @type {Record<string, unknown>[]} */
    site.pages
  ) : [];
  const page = pages.find((p) => p.path === chip) ?? null;
  const out = {
    site: site.site ?? null,
    pages: pages.map((p) => ({ path: p.path, type: p.type, label: p.label })),
    page: page ? { path: page.path, type: page.type, label: page.label, data: page.data ?? null } : null
  };
  let json = JSON.stringify(out, null, 1);
  if (json.length > MAX_FACTS) json = `${json.slice(0, MAX_FACTS)}
\u2026(cut)`;
  return json;
}
function clampToSlot(text, slot) {
  const lim = slotLimits(slot);
  const clean = text.trim().replace(/\s+/g, " ");
  if (measure(clean, lim.unit) <= lim.max) return clean;
  const words2 = clean.split(" ");
  if (lim.unit === "words") return words2.slice(0, lim.max).join(" ");
  let out = "";
  for (const w of words2) {
    const next = out === "" ? w : `${out} ${w}`;
    if (next.length > lim.max) break;
    out = next;
  }
  return out === "" ? clean.slice(0, lim.max) : out;
}
var MAX_TITLE = 40;
var MAX_NEXT = 600;
function buildShortenPrompt(over, slots, lang) {
  const known = new Map(slots.map((s) => [s.id, s]));
  const lines = [
    `Some of your texts are over the maximum their slot allows. Rewrite ONLY these, in ${lang}, keeping the meaning and the voice, each within its maximum. Reply with ONE JSON object and nothing else: {"slots": {"<slot id>": "<text>", ...}}.`,
    ""
  ];
  for (const [id, text] of Object.entries(over)) {
    const slot = known.get(id);
    if (!slot) continue;
    const lim = slotLimits(slot);
    lines.push(
      `- ${id} [${slot.role}, max ${lim.max} ${lim.unit}, you wrote ${measure(text, lim.unit)}]: ${JSON.stringify(text)}`
    );
  }
  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
function parseModelCopy(text, slots) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "The model answered without a JSON object." };
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {
      ok: false,
      error: "The model answered with JSON that does not parse (it may have run out of room)."
    };
  }
  const raw = obj.slots;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "The model answered without slots." };
  const known = new Map(slots.map((s) => [s.id, s]));
  const out = {};
  const trimmed = [];
  const over = {};
  for (const [id, value] of Object.entries(
    /** @type {Record<string, unknown>} */
    raw
  )) {
    const slot = known.get(id);
    if (!slot || typeof value !== "string" || value.trim() === "") continue;
    const clean = value.trim().replace(/\s+/g, " ");
    const clamped = clampToSlot(clean, slot);
    if (clamped !== clean) {
      trimmed.push(id);
      over[id] = clean;
    }
    out[id] = clamped;
  }
  if (Object.keys(out).length === 0)
    return { ok: false, error: "The model wrote nothing for the slots of this page." };
  const title = typeof obj.title === "string" && obj.title.trim() !== "" ? obj.title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE) : "New take";
  const nextPrompt = typeof obj.nextPrompt === "string" && obj.nextPrompt.trim() !== "" ? obj.nextPrompt.trim().replace(/\s+/g, " ").slice(0, MAX_NEXT) : null;
  return { ok: true, title, nextPrompt, slots: out, trimmed, over };
}
function agentVersion(args, slots) {
  const v = validCopy(args, slots);
  if (!v.ok) return v;
  const a = (
    /** @type {Record<string, unknown>} */
    args
  );
  const title = typeof a.title === "string" && a.title.trim() !== "" ? a.title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE) : REWRITTEN_TITLE;
  return {
    ok: true,
    version: {
      id: versionId(),
      title,
      kind: "rewritten",
      prompt: v.brief ? briefText(v.brief) : null,
      slots: v.slots,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      model: null
    },
    lang: v.lang,
    brief: v.brief,
    warnings: v.warnings
  };
}

// src/host/templates.mjs
import { promises as fs } from "node:fs";
import path3 from "node:path";

// src/client/templates.mjs
var PICTURE = /^[a-z0-9][a-z0-9._-]*\.(?:png|jpg|jpeg|webp)$/;
var ADDRESS = /^(?:[a-z]+:|\/)/i;
function servedPicture(value) {
  if (typeof value !== "string" || !/^https?:\/\/[^/\\?#]/i.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "" ? value : null;
  } catch {
    return null;
  }
}
function templateRows(body) {
  const served = (
    /** @type {any} */
    body?.templates
  );
  if (!Array.isArray(served)) return null;
  const rows = [];
  for (const t of served) {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || t.id === "") continue;
    const card = t.card && typeof t.card === "object" ? t.card : {};
    const platforms = (Array.isArray(t.platforms) ? t.platforms : []).filter(
      (p) => p && typeof p.platform === "string"
    );
    const pic = servedPicture;
    const demo = card.demo && typeof card.demo === "object" ? card.demo : null;
    rows.push({
      id: t.id,
      name: typeof t.label === "string" && t.label !== "" ? t.label : t.id,
      category: typeof card.category === "string" ? card.category : "Uncategorised",
      // The filter traits a template card wears until an administrator sets them (W3 of the card
      // work). Defaults, and they are read as such: a filter on them is filtering on a guess.
      nav: "top-left",
      hero: "split",
      // Whether the demo itself switches to dark on ?theme=dark: the card's own flag, measured by
      // /ops (Draft from demo) or set there by hand. A card that has never said stays true, as
      // every card read before the flag was honoured (30/09: no Light/Dark switch on a
      // template whose theme has no dark mode).
      dark: typeof card.dark === "boolean" ? card.dark : true,
      provider: typeof card.provider === "string" ? card.provider : "JoomlArt",
      // The design system the card wears, joined by tracy-web from the sealing profile — the
      // only place it is named (29/09). Null when the profile names none; never a guess.
      design: t.design && typeof t.design === "object" && typeof t.design.id === "string" && typeof t.design.source === "string" ? { id: t.design.id, source: t.design.source } : null,
      platforms: platforms.map((p) => p.platform),
      template: {
        quickstarts: Object.fromEntries(
          platforms.map((p) => [p.platform, String(p.tag ?? "")])
        ),
        version: String(platforms.find((p) => p.version)?.version ?? ""),
        image: pic(card.image),
        /** One sentence about the site, shown in the preview. */
        blurb: typeof card.blurb === "string" ? card.blurb : null,
        demo: {
          url: String(demo?.url ?? ""),
          version: String(demo?.version ?? ""),
          // The `demo-frame` door, only as the address tracy-web wrote: a card fetches it as one.
          ...typeof demo?.probe === "string" && ADDRESS.test(demo.probe) ? { probe: demo.probe } : {}
        },
        // The side the demo opens on when no mode is asked (a dark-first template such as JA Boxing).
        // Read only when the card has both sides; a one-sided card is always its own light.
        defaultTheme: (typeof card.dark === "boolean" ? card.dark : true) && card.defaultTheme === "dark" ? "dark" : "light",
        languages: Array.isArray(card.languages) ? card.languages.map(String) : [],
        layouts: (Array.isArray(card.layouts) ? card.layouts : []).map((l) => ({
          key: String(l?.key ?? ""),
          label: String(l?.label ?? l?.key ?? ""),
          path: String(l?.path ?? "/"),
          // Where the page answers, when the card says that is not its path. Carried through
          // rather than recomputed: this side has no way to know a demo's URL rules, and guessing
          // is how the preview came to show a customer an Apache 404 (17/09).
          ...typeof l?.address === "string" && l.address.startsWith("/") ? { address: l.address } : {},
          ...typeof l?.count === "number" ? { count: l.count } : {},
          ...l?.shots && typeof l.shots === "object" ? {
            shots: {
              desktop: pic(l.shots.desktop),
              ...l.shots.mobile ? { mobile: pic(l.shots.mobile) } : {}
            }
          } : {}
        }))
      }
    });
  }
  return rows;
}

// src/host/templates.mjs
function quickstartCandidates(configured) {
  const out = [];
  if (configured) out.push(configured);
  out.push("/opt/tracy/quickstarts.json");
  const home = process.env.DSH_HOME;
  if (home) out.push(path3.join(home, "quickstarts.json"));
  return out;
}
async function readQuickstarts(candidates) {
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      return { catalogue: JSON.parse(raw), dir: path3.join(path3.dirname(candidate), "templates") };
    } catch {
    }
  }
  return null;
}
async function templatesFromTracy(origin, fetchImpl = fetch) {
  if (!origin) return null;
  try {
    const response = await fetchImpl(`${origin.replace(/\/+$/, "")}/api/templates`, {
      headers: { accept: "application/json" }
    });
    if (!response.ok) return null;
    return templateRows(await response.json());
  } catch {
    return null;
  }
}
function wearDesignTraits(templates, systems) {
  if (templates.length === 0 || systems.length === 0) return templates;
  const byId = new Map(systems.map((s) => [s.id, s]));
  return templates.map((t) => {
    const worn = t.design?.id ? byId.get(t.design.id) : void 0;
    return worn ? { ...t, nav: worn.nav, hero: worn.hero } : t;
  });
}
var BRAND_BUILDS = Object.freeze(["wordpress"]);
function brandPlatforms(templates) {
  const worn = /* @__PURE__ */ new Set();
  for (const t of templates) {
    if (t?.design?.source !== "catalog" || !Array.isArray(t.platforms)) continue;
    for (const p of t.platforms) if (typeof p === "string") worn.add(p);
  }
  return BRAND_BUILDS.filter((p) => worn.has(p));
}
function withBrandPlatforms(brands, templates) {
  if (brands.length === 0) return [];
  const platforms = brandPlatforms(templates);
  return brands.map((b) => ({ ...b, platforms: [...platforms] }));
}
async function designSystemsShownFromTracy(origin, fetchImpl = fetch) {
  if (!origin) return false;
  try {
    const response = await fetchImpl(`${origin.replace(/\/+$/, "")}/api/design-systems`, {
      headers: { accept: "application/json" }
    });
    if (!response.ok) return false;
    return (await response.json())?.shown === true;
  } catch {
    return false;
  }
}
async function readPicture(dir, templateId, file) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(templateId) || !PICTURE.test(file)) return null;
  try {
    return await fs.readFile(path3.join(dir, templateId, file));
  } catch {
    return null;
  }
}
function pictureType(file) {
  return file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
}

// src/host/library-brand.mjs
var SANS_FALLBACK = ["ui-sans-serif", "system-ui", "sans-serif"];
var MONO_FALLBACK = ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"];
function tokenValue(css, name2) {
  const m = new RegExp(`${name2.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
function hex(css, name2) {
  const v = tokenValue(css, name2);
  if (!v) return null;
  const m = /^#([0-9a-f]{6})\b/i.exec(v);
  if (m) return `#${m[1].toLowerCase()}`;
  const short = /^#([0-9a-f]{3})\b/i.exec(v);
  return short ? `#${short[1].split("").map((c) => c + c).join("").toLowerCase()}` : null;
}
function firstFamily(stack) {
  const first = (stack ?? "").split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "");
}
function taglineOf(designMd) {
  for (const line of (designMd ?? "").split("\n")) {
    const m = /^>\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const text = m[1].trim();
    if (/^(Category|Surface)\s*:/i.test(text)) continue;
    return text;
  }
  return "";
}
function radiusOf(css) {
  const v = tokenValue(css, "--radius-md") ?? tokenValue(css, "--radius-sm");
  return v && /^\d+(\.\d+)?(px|rem)$/.test(v) ? v : "8px";
}
function seedOverridesFromSystem(system) {
  const on = hex(system.tokensCss, "--accent-on");
  return on ? { colorPrimaryContrast: on } : {};
}
function brandFromSystem(system) {
  const css = system.tokensCss;
  const bg = hex(css, "--bg") ?? "#ffffff";
  const fg = hex(css, "--fg") ?? "#111111";
  const accent = hex(css, "--accent") ?? fg;
  const colors = [
    { role: "background", hex: bg, oklch: "", name: "Background", usage: "page canvas" },
    {
      role: "surface",
      hex: hex(css, "--surface") ?? bg,
      oklch: "",
      name: "Surface",
      usage: "cards / raised surfaces"
    },
    { role: "foreground", hex: fg, oklch: "", name: "Foreground", usage: "body text" },
    { role: "muted", hex: hex(css, "--muted") ?? fg, oklch: "", name: "Muted", usage: "secondary text" },
    {
      role: "border",
      hex: hex(css, "--border") ?? fg,
      oklch: "",
      name: "Border",
      usage: "hairlines / dividers"
    },
    { role: "accent", hex: accent, oklch: "", name: "Accent", usage: "primary brand color" }
  ];
  const secondary = hex(css, "--accent-hover");
  if (secondary && secondary !== accent) {
    colors.push({
      role: "accent-secondary",
      hex: secondary,
      oklch: "",
      name: "Accent secondary",
      usage: "hover / links"
    });
  }
  const display = firstFamily(tokenValue(css, "--font-display")) || "Inter";
  const body = firstFamily(tokenValue(css, "--font-body")) || display;
  const mono = firstFamily(tokenValue(css, "--font-mono"));
  return {
    name: system.name,
    tagline: taglineOf(system.designMd) || system.category || "",
    description: system.description ?? "",
    // Where this design can be opened: the public design inspirations page. The artifact footers
    // link their "Inspired by" credit here, so a site built on a design says where it came from.
    sourceUrl: `https://cowork.tracy.ai/design-inspiration/${system.id}`,
    logo: { primary: null, alternates: [], notes: "library inspiration: no logo" },
    colors,
    typography: {
      display: { family: display, fallbacks: SANS_FALLBACK, weights: [400, 700] },
      body: { family: body, fallbacks: SANS_FALLBACK, weights: [400, 700] },
      ...mono ? { mono: { family: mono, fallbacks: MONO_FALLBACK, weights: [400] } } : {}
    },
    voice: { adjectives: [], tone: "", messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: "", subjects: [], treatment: "", avoid: [] },
    layout: { radius: radiusOf(css), borderWeight: "1px", spacing: "8px baseline grid", postureRules: [] }
  };
}

// src/host/library-remote.mjs
import { randomBytes } from "node:crypto";
import { promises as fs2 } from "node:fs";
import os from "node:os";
import path4 from "node:path";
var LIBRARY_FILES = Object.freeze([
  ...Object.keys(SYSTEM_FILES),
  "slots.json",
  ...ARTIFACT_TYPES.map((kind) => `artifact-slots/${kind}.json`)
]);
function defaultLibraryCacheDir() {
  return path4.join(process.env.DSH_HOME ?? os.homedir(), "design-library");
}
var ID_RE = /^[a-z0-9][a-z0-9.-]*$/;
var COMMIT_RE = /^[0-9a-f]{6,40}$/;
var FETCH_TIMEOUT_MS = 15e3;
async function get(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "*/*" }
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
async function cachedFile(lib, rel, query = "") {
  const target = path4.join(lib.dir, rel);
  try {
    return await fs2.readFile(target);
  } catch {
  }
  const body = await get(`${lib.url}/${rel}${query}`, lib.fetch);
  if (body === null) return null;
  await fs2.mkdir(path4.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs2.writeFile(tmp, body);
    await fs2.rename(tmp, target);
  } catch (error) {
    await fs2.rm(tmp, { force: true });
    throw error;
  }
  return body;
}
function manifestOf(body) {
  if (body === null) return null;
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
async function openRemoteLibrary({ url, cacheDir, fetch: fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, "");
  const manifest = manifestOf(await get(`${base}/data/manifest.json`, fetchImpl));
  let commit = typeof manifest?.vendorCommit === "string" ? manifest.vendorCommit : null;
  let offline = false;
  if (commit === null || !COMMIT_RE.test(commit)) {
    try {
      const last = (await fs2.readFile(path4.join(cacheDir, "current"), "utf8")).trim();
      if (!COMMIT_RE.test(last)) return null;
      commit = last;
      offline = true;
    } catch {
      return null;
    }
  }
  const dir = path4.join(cacheDir, commit);
  const lib = { url: base, dir, fetch: fetchImpl };
  const query = `?v=${commit}`;
  const catalogBody = await cachedFile(lib, path4.join("data", "catalog.json"), query);
  if (catalogBody === null) return null;
  let catalog;
  try {
    catalog = JSON.parse(catalogBody.toString("utf8"));
  } catch {
    return null;
  }
  const systems = slimCatalog(catalog).map((row, i) => {
    const raw = catalog.systems?.[i];
    return raw && typeof raw.dark === "boolean" ? { ...row, dark: raw.dark } : row;
  });
  if (!offline) {
    await fs2.mkdir(cacheDir, { recursive: true });
    await fs2.writeFile(path4.join(cacheDir, "current"), `${commit}
`);
  }
  const ids = new Set(systems.map((s) => s.id));
  return {
    url: base,
    commit,
    offline,
    systems,
    ids,
    async read(id, file) {
      if (!ids.has(id) || !ID_RE.test(id) || !LIBRARY_FILES.includes(file)) return null;
      return cachedFile(lib, path4.join("systems", id, file), query);
    },
    async artifactSlots(type) {
      if (!ARTIFACT_TYPES.includes(type)) return [];
      const body = await cachedFile(lib, path4.join("data", "artifact-slots", `${type}.json`), query);
      if (body === null) return [];
      try {
        const parsed = JSON.parse(body.toString("utf8"));
        return Array.isArray(parsed?.slots) ? parsed.slots : [];
      } catch {
        return [];
      }
    }
  };
}

// ../../tools/tracy-subprocess-docker/src/route.mjs
var LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/;
var EXEC_USER = Object.freeze({
  "danger-full-access": "www-data",
  "workspace-write": "www-data",
  "read-only": "nobody"
});
function trimRoot(root) {
  const trimmed = root.replace(/\/+$/, "");
  if (trimmed === "") throw new Error("subprocess-docker: sitesRoot must not be the filesystem root");
  return trimmed;
}
function resolveSitesRoot(config, env = process.env) {
  const root = config?.sitesRoot ?? env.TRACY_SITES_ROOT ?? "/site";
  if (typeof root !== "string" || root.trim() === "" || !root.startsWith("/")) {
    throw new Error(`subprocess-docker: sitesRoot must be an absolute path, got ${JSON.stringify(root)}`);
  }
  return root;
}
function siteOf(cwd, sitesRoot) {
  const root = trimRoot(sitesRoot);
  if (!cwd.startsWith(`${root}/`)) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is outside ${root} \u2014 nothing runs on the harness host`
    );
  }
  const rest = cwd.slice(root.length + 1);
  const segments = rest.split("/");
  const label = segments[0];
  if (!LABEL.test(label)) throw new Error(`subprocess-docker: ${JSON.stringify(label)} is not a site label`);
  if (segments.includes("..")) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is not a site path \u2014 a ".." segment leaves the site folder`
    );
  }
  return { label, relative: rest.slice(label.length).replace(/^\/+/, "") };
}
var RG_HARNESS_FLAGS = Object.freeze([
  "--no-config",
  "--json",
  "--files",
  "--hidden",
  "--no-ignore",
  "--sort=modified"
]);
var RG_HARNESS_VALUE_FLAGS = Object.freeze(["--regexp=", "--glob="]);
var BLANKED_SECRET_ENV = Object.freeze([
  "JOOMLA_ADMIN_PASSWORD",
  "JOOMLA_DB_PASSWORD",
  "EMDASH_ENCRYPTION_KEY",
  "TRACY_MAIL_TOKEN"
]);
var READ_ONLY_BLANKED_ENV = Object.freeze(["WORDPRESS_DB_PASSWORD"]);
var FS_TOOL_ARGS = Object.freeze({
  read: { paths: ["file_path"], content: [] },
  read_image: { paths: ["file_path"], content: [] },
  // `sandbox_permissions` and `justification` are the escalation fields `FsSandboxController`
  // spreads into both mutations — a mode name and a sentence for the user, never a path.
  write: { paths: ["file_path"], content: ["content", "sandbox_permissions", "justification"] },
  edit: {
    paths: ["file_path"],
    content: ["old_string", "new_string", "sandbox_permissions", "justification"]
  },
  str_replace_editor: {
    paths: ["path"],
    // `insert_line` and `view_range` are numbers whose DESCRIPTIONS talk about paths; naming them
    // here is what keeps `test/fs-tool-schemas.test.mjs` from reading them as unfenced paths.
    content: ["file_text", "new_str", "old_str", "insert_line", "view_range"]
  },
  // `pattern` IS a path pattern for glob (`src/**/*.ts`), and a REGEX for grep (`/etc/` is a
  // legitimate expression, not a directory) — so it is a path in one and content in the other.
  glob: { paths: ["path", "pattern"], content: [] },
  grep: { paths: ["path"], content: ["pattern", "include"] },
  // Also covered by `workdirDecision`, deliberately. That one compares site LABELS with no I/O;
  // this one resolves symlinks. A `/site/wpdemo/link-to-elsewhere` passes the first and fails here.
  bash: { paths: ["workdir"], content: ["command", "description"] },
  // `pwsh` was in NEITHER table until the schema test found it (06/09). It is a composed row in the
  // fleet profile, it takes the same model-chosen `workdir` as `bash`, and whether its shell exists
  // in the container is not a boundary — the fence must not depend on a binary being missing.
  pwsh: { paths: ["workdir"], content: ["command", "description"] },
  terminal_open: { paths: ["cwd"], content: [] }
});
var URL_PATH_ARGS = Object.freeze({
  tracy_design_check: Object.freeze(["path"])
});
function siteRootOf(sessionCwd, sitesRoot) {
  const { label } = siteOf(sessionCwd, sitesRoot);
  return `${trimRoot(sitesRoot)}/${label}`;
}
var WORKDIR_ARG = Object.freeze({ bash: "workdir", pwsh: "workdir", terminal_open: "cwd" });

// src/host/index.ts
var name = "tracy-design-inspiration";
var inject = ["webServer", "tools", "llm", "agentDefaultModel"];
var PREFIX = "/api/tracy-design-inspiration";
var MAX_BODY = 4 * 1024;
function catalogCandidates(config) {
  const out = [];
  if (config.catalog) out.push(config.catalog);
  out.push("/opt/tracy/design-catalog.json");
  const home = process.env.DSH_HOME;
  if (home) out.push(path5.join(home, "design-catalog.json"));
  return out;
}
var DEFAULT_LIBRARY_URL = "https://cowork.tracy.ai/design-inspiration";
function dshSetting(name2) {
  const value = process.env[name2]?.trim();
  if (value) return value;
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim();
  if (!file) return null;
  try {
    const m = new RegExp(`^${name2}=(.+)$`, "m").exec(readFileSync(file, "utf8"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}
function tracyOrigin(config) {
  if (config.tracyOrigin) return config.tracyOrigin;
  const own = dshSetting("MCP_TRACY_ORIGIN");
  if (own) return own.replace(/\/+$/, "");
  const url = config.libraryUrl === false ? null : config.libraryUrl ?? DEFAULT_LIBRARY_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
var CHAT_DS_SWITCH = "chat-design-system";
var CHAT_ROUTE_OFF = {
  ok: false,
  code: "CHAT_DESIGN_SYSTEM_OFF",
  error: "Proposing or applying a design system through the chat is turned off. Change nothing; tell the customer in one plain sentence, in their language, to use the Design system row on the site's start screen. A new site gets its design when it is created (Add site)."
};
async function chatRouteOff(config) {
  const on = await switchesAtTracy(tracyOrigin(config));
  return on?.(CHAT_DS_SWITCH) === true ? null : CHAT_ROUTE_OFF;
}
async function designSystemsOff(config) {
  const origin = tracyOrigin(config);
  if (await designSystemsShownFromTracy(origin)) return null;
  const rows = await templatesFromTracy(origin);
  return {
    ok: false,
    code: "DESIGN_SYSTEMS_OFF",
    error: "Design systems are off: do not propose, read or preview one. Introduce the finished templates in `templates` (published right now) in a line or two each, and invite the customer to open Design templates to see them and create a site from one. brand:<host> design templates still work. " + (rows === null ? "templates is null: Tracy could not be asked \u2014 say so, and name no template." : "Name no template that is not in this list."),
    templates: rows?.map(
      (r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        platforms: r.platforms,
        blurb: r.template?.blurb ?? null
      })
    ) ?? null
  };
}
var LIBRARY_RECHECK_MS = 6e4;
async function loadLibrary(config) {
  if (config.libraryUrl !== false) {
    const url = config.libraryUrl ?? DEFAULT_LIBRARY_URL;
    const remote = await openRemoteLibrary({ url, cacheDir: config.libraryCache ?? defaultLibraryCacheDir() });
    if (remote !== null) {
      const slotsCache = /* @__PURE__ */ new Map();
      return {
        systems: remote.systems,
        ids: remote.ids,
        source: { kind: "remote", url: remote.url, commit: remote.commit, offline: remote.offline },
        readFile: (id, file) => remote.read(id, file),
        slotsOf: (id) => {
          let p = slotsCache.get(id);
          if (!p) {
            p = remote.read(id, "slots.json").then((body) => {
              if (body === null) return [];
              try {
                const parsed = JSON.parse(body.toString("utf8"));
                return parsed.slots ?? [];
              } catch {
                return [];
              }
            });
            slotsCache.set(id, p);
          }
          return p;
        },
        tokens: /* @__PURE__ */ new Map()
      };
    }
    console.warn(
      `[tracy-design-inspiration] library at ${url} is unreachable and nothing is cached \u2014 falling back to the image copy`
    );
  }
  return loadImageLibrary(config);
}
async function loadImageLibrary(config) {
  for (const candidate of catalogCandidates(config)) {
    let real;
    try {
      real = realpathSync(candidate);
    } catch {
      continue;
    }
    try {
      let dark = null;
      try {
        const parsed = JSON.parse(await fs3.readFile(path5.join(path5.dirname(real), "dark.json"), "utf8"));
        dark = parsed.systems ?? null;
      } catch {
        dark = null;
      }
      const systems = slimCatalog(JSON.parse(await fs3.readFile(real, "utf8")), dark);
      let slots = null;
      try {
        const parsed = JSON.parse(await fs3.readFile(path5.join(path5.dirname(real), "slots.json"), "utf8"));
        slots = parsed.systems ?? null;
      } catch {
        slots = null;
      }
      const systemsDir = systemsDirFor(real);
      const ids = new Set(systems.map((s) => s.id));
      return {
        systems,
        ids,
        source: { kind: "image", systemsDir },
        readFile: async (id, file) => {
          if (!ids.has(id)) return null;
          if (file !== "slots.json" && !Object.hasOwn(SYSTEM_FILES, file)) return null;
          try {
            return await fs3.readFile(path5.join(systemsDir, id, file));
          } catch {
            return null;
          }
        },
        slotsOf: async (id) => slots?.[id]?.slots ?? [],
        tokens: /* @__PURE__ */ new Map()
      };
    } catch (error) {
      console.warn(`[tracy-design-inspiration] catalog at ${real} is not readable: ${String(error)}`);
    }
  }
  return null;
}
function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}
var siteKey;
function laneSiteKey() {
  if (siteKey !== void 0) return siteKey;
  siteKey = process.env.MCP_TRACY_SITE_KEY?.trim() || null;
  if (siteKey === null) {
    const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim();
    if (file) {
      try {
        const m = /^MCP_TRACY_SITE_KEY=(.+)$/m.exec(readFileSync(file, "utf8"));
        siteKey = m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
      } catch {
        siteKey = null;
      }
    }
  }
  return siteKey;
}
var siteDirOf = (config) => config.siteDir ?? path5.resolve(".");
function scopedTo(config, place) {
  if (config.siteDir !== void 0 || typeof place !== "string" || place === "") return config;
  const root = resolveSitesRoot(void 0);
  if (place !== root && !place.startsWith(`${root}/`)) return { ...config, siteDir: place };
  try {
    return { ...config, siteDir: siteRootOf(place, root) };
  } catch {
    return null;
  }
}
function siteFile(config) {
  return path5.join(siteDirOf(config), SITE_FILE);
}
async function readBrands(config) {
  const root = path5.join(siteDirOf(config), BRAND_DIR);
  let entries;
  try {
    entries = await fs3.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      found.push({
        dir: e.name,
        manifest: JSON.parse(await fs3.readFile(path5.join(root, e.name, "manifest.json"), "utf8"))
      });
    } catch {
    }
  }
  return brandRows(found);
}
function allIds(l, brands) {
  return brands.length === 0 ? l.ids : /* @__PURE__ */ new Set([...l.ids, ...brands.map((b) => b.id)]);
}
async function slotsFor(l, config, id) {
  const host = brandHostOf(id);
  if (host !== null) {
    try {
      const parsed = JSON.parse(
        await fs3.readFile(path5.join(siteDirOf(config), BRAND_DIR, host, "slots.json"), "utf8")
      );
      return parsed.slots ?? [];
    } catch {
      return [];
    }
  }
  return l.slotsOf(id);
}
var builtArtifacts = /* @__PURE__ */ new Map();
function libraryArtifacts(l, config, id) {
  if (brandHostOf(id) !== null || !l.ids.has(id)) return Promise.resolve(null);
  let p = builtArtifacts.get(id);
  if (!p) {
    p = (async () => {
      const row = l.systems.find((s) => s.id === id);
      const tokensCss = await tokensFor(l, config, id);
      if (!row || tokensCss === null) return null;
      const designMd = (await l.readFile(id, "DESIGN.md"))?.toString("utf8") ?? "";
      const system = buildBrandSystem(
        brandFromSystem({ id, name: row.name, category: row.category, tokensCss, designMd }),
        {
          slug: id,
          // The inspiration's own text-on-accent; the engine derives one by contrast otherwise.
          seed: seedOverridesFromSystem({ tokensCss })
        }
      );
      system.files["artifacts/typography.html"] = renderTypography(
        brandFromSystem({ id, name: row.name, category: row.category, tokensCss, designMd }),
        system.themes.default,
        { designMd }
      );
      const html = {};
      const slots = {};
      for (const kind of ARTIFACT_TYPES) {
        const file = system.files[`artifacts/${kind}.html`];
        if (typeof file !== "string") continue;
        html[kind] = file;
        slots[kind] = slotsOf(file, []);
      }
      return { html, slots };
    })().catch((error) => {
      console.warn(
        `[tracy-design-inspiration] could not build the sample products of ${id}: ${String(error)}`
      );
      builtArtifacts.delete(id);
      return null;
    });
    builtArtifacts.set(id, p);
  }
  return p;
}
async function artifactSlotsFor(config, id, type, l = null) {
  if (!ARTIFACT_TYPES.includes(type)) return null;
  const host = brandHostOf(id);
  if (host !== null) {
    try {
      const parsed = JSON.parse(
        await fs3.readFile(path5.join(siteDirOf(config), BRAND_DIR, host, "artifact-slots.json"), "utf8")
      );
      return parsed.artifacts?.[type] ?? [];
    } catch {
      return [];
    }
  }
  if (l && l.source.kind === "remote") {
    const measured = await remoteArtifactSlots(l, id, type);
    if (measured !== null) return measured;
  }
  const built = l ? await libraryArtifacts(l, config, id) : null;
  if (built?.slots[type]) return built.slots[type];
  return artifact_slots_default.artifacts[type] ?? [];
}
var remoteSlots = /* @__PURE__ */ new WeakMap();
function remoteArtifactSlots(l, id, type) {
  let map = remoteSlots.get(l);
  if (!map) {
    map = /* @__PURE__ */ new Map();
    remoteSlots.set(l, map);
  }
  const key = `${id}/${type}`;
  let p = map.get(key);
  if (!p) {
    p = l.readFile(id, `artifact-slots/${type}.json`).then(async (measured) => {
      if (measured !== null) {
        try {
          const parsed = JSON.parse(measured.toString("utf8"));
          if (Array.isArray(parsed.slots)) return parsed.slots;
        } catch {
        }
      }
      const body = await l.readFile(id, `system/artifacts/${type}.html`);
      return body === null ? null : slotsOf(body.toString("utf8"), []);
    });
    map.set(key, p);
  }
  return p;
}
async function tokensFor(l, config, id) {
  const host = brandHostOf(id);
  if (host !== null) {
    try {
      return await fs3.readFile(path5.join(siteDirOf(config), BRAND_DIR, host, "tokens.css"), "utf8");
    } catch {
      return null;
    }
  }
  const hit = l.tokens.get(id);
  if (hit !== void 0) return hit;
  const body = await l.readFile(id, "tokens.css");
  if (body === null) return null;
  const css = body.toString("utf8");
  l.tokens.set(id, css);
  return css;
}
async function withFit(l, config, brands, rows) {
  const own = brands.find((b) => b.category === "Your brand");
  if (!own) return rows;
  const brandTokens = await tokensFor(l, config, own.id);
  if (brandTokens === null) return rows;
  const out = [];
  for (const row of rows) {
    const css = row.id === own.id ? brandTokens : await tokensFor(l, config, row.id);
    out.push(css === null ? row : { ...row, fit: fitScore(brandTokens, css) });
  }
  return out;
}
function copyPath(config, id, lang = "") {
  return path5.join(siteDirOf(config), COPY_DIR, copyFileName(id, lang));
}
async function readCopy(config, id, lang = "") {
  try {
    return normalizeCopy(JSON.parse(await fs3.readFile(copyPath(config, id, lang), "utf8")), id);
  } catch {
    return null;
  }
}
var queues = /* @__PURE__ */ new Map();
function withCopy(config, id, lang, fn) {
  const key = `${id}\0${lang}`;
  const prev = queues.get(key) ?? Promise.resolve();
  const read = async () => await readCopy(config, id, lang) ?? emptyCopy(id, lang || "en");
  const next = prev.then(
    async () => fn(await read()),
    async () => fn(await read())
  );
  queues.set(key, next);
  return next;
}
async function writeCopy(config, file, lang = "") {
  try {
    await fs3.mkdir(path5.join(siteDirOf(config), COPY_DIR), { recursive: true });
    await fs3.writeFile(copyPath(config, file.system, lang), `${JSON.stringify(file, null, 2)}
`);
    return true;
  } catch {
    return false;
  }
}
async function readSite(config) {
  try {
    const parsed = JSON.parse(await fs3.readFile(siteFile(config), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
async function callModel(ctx, prompt) {
  let selection;
  try {
    selection = ctx.agentDefaultModel.currentSelection();
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "NO_MODEL",
      message: `No default model on this lane: ${String(error)}`
    };
  }
  const model = `${selection.provider}/${selection.model}`;
  const effort = "off";
  const first = await streamOnce(ctx, selection, effort, prompt);
  if (!first.ok && first.code === "MODEL_FAILED" && /UNSUPPORTED_REASONING_EFFORT/.test(first.detail)) {
    const again = await streamOnce(ctx, selection, void 0, prompt);
    return again.ok ? { ...again, model } : again;
  }
  return first.ok ? { ...first, model } : first;
}
async function streamOnce(ctx, selection, reasoningEffort, prompt) {
  let text = "";
  let blockText = "";
  let finish = "none";
  let usage = null;
  try {
    const stream = ctx.llm.stream({
      provider: selection.provider,
      model: selection.model,
      ...reasoningEffort === void 0 ? {} : { reasoningEffort },
      system: prompt.system,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: [{ type: "text", text: prompt.user }],
          source: { kind: "user" }
        }
      ],
      temperature: 0.8,
      maxTokens: MODEL_MAX_TOKENS
    });
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") text += chunk.text;
      else if (chunk.type === "block-end") {
        const block = chunk.block;
        if (block?.type === "text" && typeof block.text === "string") blockText += block.text;
      } else if (chunk.type === "usage")
        usage = { inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens };
      else if (chunk.type === "finish") {
        finish = chunk.reason.kind;
        if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted") {
          const failure = chunk.reason.failure;
          return {
            ok: false,
            status: 502,
            code: "MODEL_FAILED",
            message: failure?.message ?? chunk.reason.kind,
            detail: `${failure?.code ?? ""} ${failure?.message ?? ""}`
          };
        }
      }
    }
  } catch (error) {
    return { ok: false, status: 502, code: "MODEL_FAILED", message: String(error), detail: String(error) };
  }
  return { ok: true, text: text !== "" ? text : blockText, usage, finish };
}
var MODEL_MAX_TOKENS = 16e3;
var JOB_TTL_MS = 10 * 60 * 1e3;
var jobs = /* @__PURE__ */ new Map();
function sweepJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.state !== "working" && job.at < cutoff) jobs.delete(id);
}
function apply(ctx, bundleConfig = {}) {
  let library = null;
  let checkedAt = 0;
  const lib = () => {
    library ??= loadLibrary(bundleConfig).then((l) => {
      checkedAt = Date.now();
      return l;
    });
    return library;
  };
  const libFresh = async () => {
    const current = await lib();
    if (current === null || current.source.kind !== "remote" || Date.now() - checkedAt < LIBRARY_RECHECK_MS)
      return current;
    checkedAt = Date.now();
    const next = await loadLibrary(bundleConfig);
    if (next === null) return current;
    if (next.source.kind === "remote" && !next.source.offline && next.source.commit !== current.source.commit) {
      console.log(
        `[tracy-design-inspiration] library moved ${current.source.commit} \u2192 ${next.source.commit} (${next.systems.length} systems)`
      );
      builtArtifacts.clear();
      library = Promise.resolve(next);
      return next;
    }
    return current;
  };
  const route = {
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => {
      const scoped = { ...bundleConfig, siteDir: siteDirFor(bundleConfig, req) };
      const parsed = parseRoute(PREFIX, req.method ?? "GET", req.url ?? "");
      if (parsed === null) {
        writeJson(res, 404, { code: "UNKNOWN_ROUTE" });
        return;
      }
      void (parsed.kind === "catalog" ? libFresh() : lib()).then(async (l) => {
        if (l === null) {
          writeJson(res, 503, { code: "NO_LIBRARY" });
          return;
        }
        switch (parsed.kind) {
          case "catalog": {
            const brands = await readBrands(scoped);
            const origin = tracyOrigin(bundleConfig);
            const panel = "systems" in parsed && parsed.systems === "all";
            const [templates, systemsShown] = await Promise.all([
              // A card wearing a catalogue system filters by that system's traits (Lee, 29/09).
              templatesFromTracy(origin).then((rows) => wearDesignTraits(rows ?? [], l.systems)),
              panel ? Promise.resolve(true) : designSystemsShownFromTracy(origin)
            ]);
            const brandCards = withBrandPlatforms(brands, templates);
            const systems = await withFit(l, scoped, brandCards, [
              ...brandCards,
              ...templates,
              ...systemsShown ? l.systems : []
            ]);
            const library2 = l.source.kind === "remote" ? { url: l.source.url, commit: l.source.commit } : null;
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            });
            res.end(JSON.stringify({ count: systems.length, systems, library: library2 }));
            return;
          }
          case "template": {
            const quickstarts = await readQuickstarts(quickstartCandidates(bundleConfig.quickstarts));
            const bytes = quickstarts ? await readPicture(quickstarts.dir, parsed.id, parsed.file) : null;
            if (bytes === null) {
              writeJson(res, 404, { code: "NO_PICTURE" });
              return;
            }
            res.writeHead(200, {
              "content-type": pictureType(parsed.file),
              "cache-control": "public, max-age=3600"
            });
            res.end(bytes);
            return;
          }
          case "system": {
            const host = brandHostOf(parsed.id);
            if (host !== null) {
              const file2 = parsed.file === "slots" ? {
                path: path5.join(siteDirOf(scoped), BRAND_DIR, host, "slots.json"),
                type: "application/json; charset=utf-8"
              } : resolveBrandFile(siteDirOf(scoped), host, parsed.file);
              if (file2 === null) {
                writeJson(res, 404, { code: "NO_SUCH_FILE" });
                return;
              }
              try {
                if (file2.type.startsWith("text/html")) {
                  const fontsDir = path5.join(siteDirOf(scoped), BRAND_DIR, host, "fonts");
                  const html = inlineBrandFonts(await fs3.readFile(file2.path, "utf8"), (name2) => {
                    try {
                      return readFileSync(path5.join(fontsDir, name2));
                    } catch {
                      return null;
                    }
                  });
                  res.writeHead(200, { "content-type": file2.type, "cache-control": "no-store" });
                  res.end(html);
                  return;
                }
                const stat = await fs3.stat(file2.path);
                res.writeHead(200, {
                  "content-type": file2.type,
                  "content-length": String(stat.size),
                  "cache-control": "no-store"
                });
                createReadStream(file2.path).pipe(res);
              } catch {
                writeJson(res, 404, { code: "NO_SUCH_FILE" });
              }
              return;
            }
            if (parsed.file === "slots") {
              if (!l.ids.has(parsed.id)) {
                writeJson(res, 404, { code: "NO_SUCH_FILE" });
                return;
              }
              res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "private, max-age=86400, immutable"
              });
              res.end(JSON.stringify({ slots: await l.slotsOf(parsed.id) }));
              return;
            }
            const artifact = /^system\/artifacts\/([a-z]+)\.html$/.exec(parsed.file)?.[1];
            if (artifact && l.ids.has(parsed.id) && l.source.kind === "image") {
              const built = await libraryArtifacts(l, scoped, parsed.id);
              const html = built?.html[artifact];
              if (typeof html === "string") {
                res.writeHead(200, {
                  "content-type": "text/html; charset=utf-8",
                  "cache-control": "private, max-age=86400, immutable"
                });
                res.end(html);
                return;
              }
            }
            const file = resolveSystemFile("", l.ids, parsed.id, parsed.file);
            const body = file === null ? null : await l.readFile(parsed.id, parsed.file);
            if (file === null || body === null) {
              writeJson(res, 404, { code: "NO_SUCH_FILE" });
              return;
            }
            res.writeHead(200, {
              "content-type": file.type,
              "content-length": String(body.length),
              "cache-control": "private, max-age=86400, immutable"
            });
            res.end(body);
            return;
          }
          case "site": {
            const site = await readSite(scoped);
            writeJson(
              res,
              200,
              site === null ? { present: false } : { present: true, site, siteKey: laneSiteKey() }
            );
            return;
          }
          case "artifactSlots": {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: "UNKNOWN_ID" });
              return;
            }
            const slots = await artifactSlotsFor(scoped, parsed.id, parsed.type, l);
            if (slots === null) {
              writeJson(res, 404, { code: "NO_SUCH_FILE" });
              return;
            }
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            });
            res.end(JSON.stringify({ slots }));
            return;
          }
          case "copy": {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: "UNKNOWN_ID" });
              return;
            }
            const copy = await readCopy(scoped, parsed.id, parsed.lang) ?? emptyCopy(parsed.id, parsed.lang || "en");
            writeJson(res, 200, { ...copy, defaultPrompts: DEFAULT_PROMPTS });
            return;
          }
          case "copyVersionCreate": {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: "UNKNOWN_ID" });
              return;
            }
            const body = await readBody(req);
            const freshBrief = Boolean(
              body && typeof body === "object" && "freshBrief" in body && body.freshBrief === true
            );
            const site = freshBrief ? null : await readSite(scoped);
            const sitePages = site?.pages ?? [];
            parsed.chip = canonicalChip(parsed.chip, sitePages);
            const layout = chipLayout(parsed.chip, sitePages);
            if (layout === null) {
              writeJson(res, 404, { code: "NO_SUCH_CHIP" });
              return;
            }
            const slots = "artifact" in layout ? await artifactSlotsFor(scoped, parsed.id, layout.artifact, l) : await slotsFor(l, scoped, parsed.id);
            if (!slots || slots.length === 0) {
              writeJson(res, 404, { code: "NO_SLOTS" });
              return;
            }
            const before = await readCopy(scoped, parsed.id, parsed.lang) ?? emptyCopy(parsed.id, parsed.lang || "en");
            const chip = before.pages[parsed.chip];
            const ask = promptOf(body, chip, layout.kind);
            if (!ask.ok) {
              writeJson(res, 400, { code: "BAD_PROMPT", message: ask.error });
              return;
            }
            const current = freshBrief ? {} : chip?.versions.find((v) => v.id === chip.selected)?.slots ?? {};
            const lang = parsed.lang !== "" ? parsed.lang : typeof site?.lang === "string" ? site.lang : before.lang;
            const prompt = buildCopyPrompt({
              kind: layout.kind,
              chip: parsed.chip,
              prompt: ask.prompt,
              slots,
              current,
              site,
              lang,
              factsOnly: freshBrief
            });
            sweepJobs();
            const jobId = versionId();
            const job = { state: "working", at: Date.now() };
            jobs.set(jobId, job);
            writeJson(res, 202, { ok: true, job: jobId });
            void (async () => {
              const answer = await callModel(ctx, prompt);
              if (!answer.ok) {
                Object.assign(job, { state: "failed", code: answer.code, message: answer.message });
                return;
              }
              const read = parseModelCopy(answer.text, slots);
              if (!read.ok) {
                const sample = answer.text.replace(/\s+/g, " ").slice(0, 300);
                console.warn(
                  `[tracy-design-inspiration] model answer unusable (${answer.model}, finish ${answer.finish}, ${answer.text.length} chars): ${sample}`
                );
                Object.assign(job, {
                  state: "failed",
                  code: "MODEL_ANSWER_UNUSABLE",
                  message: `${read.error} (${answer.model}, ${answer.finish}, ${answer.text.length} chars)`,
                  sample
                });
                return;
              }
              let slotsOut = read.slots;
              let trimmed = read.trimmed;
              let usage = answer.usage;
              if (read.trimmed.length > 0) {
                const again = await callModel(ctx, buildShortenPrompt(read.over, slots, lang));
                if (again.ok) {
                  const short = parseModelCopy(again.text, slots);
                  if (short.ok) {
                    slotsOut = { ...slotsOut, ...short.slots };
                    trimmed = read.trimmed.filter((id) => !(id in short.slots) || short.trimmed.includes(id));
                  }
                  if (usage && again.usage)
                    usage = {
                      inputTokens: usage.inputTokens + again.usage.inputTokens,
                      outputTokens: usage.outputTokens + again.usage.outputTokens
                    };
                }
              }
              const version = {
                id: versionId(),
                title: read.title,
                kind: "llm",
                prompt: ask.prompt,
                slots: slotsOut,
                at: (/* @__PURE__ */ new Date()).toISOString(),
                model: answer.model,
                ...trimmed.length > 0 ? { trimmed } : {},
                ...usage ? { usage } : {}
              };
              const ok = await withCopy(scoped, parsed.id, parsed.lang, async (file) => {
                addVersion(file, parsed.chip, version, read.nextPrompt);
                return writeCopy(scoped, file, parsed.lang);
              });
              if (ok) Object.assign(job, { state: "done", version, nextPrompt: read.nextPrompt });
              else
                Object.assign(job, {
                  state: "failed",
                  code: "NOT_WRITTEN",
                  message: "Could not write design-copy/<id>.json."
                });
            })();
            return;
          }
          case "copyJob": {
            const job = jobs.get(parsed.job);
            if (!job) {
              writeJson(res, 404, { code: "NO_SUCH_JOB" });
              return;
            }
            writeJson(res, 200, job.state === "working" ? { state: "working" } : job);
            return;
          }
          case "copyVersionDelete": {
            const result = await withCopy(scoped, parsed.id, parsed.lang, async (file) => {
              if (!removeVersion(file, parsed.chip, parsed.vid)) return 404;
              return await writeCopy(scoped, file, parsed.lang) ? 200 : 500;
            });
            writeJson(
              res,
              result,
              result === 200 ? { ok: true } : { code: result === 404 ? "NO_SUCH_VERSION" : "NOT_WRITTEN" }
            );
            return;
          }
          case "copySelect": {
            if (!allIds(l, await readBrands(scoped)).has(parsed.id)) {
              writeJson(res, 404, { code: "UNKNOWN_ID" });
              return;
            }
            const body = await readBody(req);
            const result = await withCopy(scoped, parsed.id, parsed.lang, async (file) => {
              if (!selectVersion(file, parsed.chip, body?.selected)) return 404;
              return await writeCopy(scoped, file, parsed.lang) ? 200 : 500;
            });
            writeJson(
              res,
              result,
              result === 200 ? { ok: true } : { code: result === 404 ? "NO_SUCH_VERSION" : "NOT_WRITTEN" }
            );
            return;
          }
          case "choose": {
            if (await chatRouteOff(bundleConfig) !== null) {
              writeJson(res, 403, { code: CHAT_ROUTE_OFF.code });
              return;
            }
            const id = chosenId(await readBody(req), allIds(l, await readBrands(scoped)));
            if (id === null) {
              writeJson(res, 400, { code: "UNKNOWN_ID" });
              return;
            }
            const site = await readSite(scoped);
            if (site === null) {
              writeJson(res, 409, { code: "SITE_NOT_READ" });
              return;
            }
            site.chosen = { id, at: (/* @__PURE__ */ new Date()).toISOString() };
            try {
              await fs3.writeFile(siteFile(scoped), `${JSON.stringify(site, null, 2)}
`);
              writeJson(res, 200, { ok: true, chosen: site.chosen });
            } catch {
              writeJson(res, 500, { code: "NOT_WRITTEN" });
            }
            return;
          }
        }
      });
    }
  };
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route);
    return () => dispose();
  }, "tracy-design-inspiration: host routes");
  ctx.effect(
    () => ctx.tools.register({
      name: "tracy_design_library",
      description: "The design template catalog (no id), or one design template's DESIGN.md and tokens.css (id); read at most three. Files live in Tracy, not in the shell. While design systems are off it answers with the published templates instead. Workflow: the tracy-design-inspiration skill.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Catalog id, e.g. apple." }
        },
        additionalProperties: false
      },
      output: {
        schema: {},
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
      },
      async execute(args) {
        const l = await lib();
        if (!l) return { ok: false, error: "This host has no design library." };
        const id = args?.id;
        if (typeof id !== "string" || brandHostOf(id) === null) {
          const off = await designSystemsOff(bundleConfig);
          if (off) return off;
        }
        if (id === void 0) return { ok: true, systems: l.systems };
        if (typeof id !== "string" || !l.ids.has(id))
          return {
            ok: false,
            error: "Unknown design template id. Read the catalog first. For customer brands use tracy_brand."
          };
        const [design, tokens] = await Promise.all([
          l.readFile(id, "DESIGN.md"),
          l.readFile(id, "tokens.css")
        ]);
        return {
          ok: true,
          system: l.systems.find((s) => s.id === id),
          design: design?.toString("utf8") ?? null,
          tokens: tokens?.toString("utf8") ?? null
        };
      }
    }),
    "tracy-design-inspiration: library tool"
  );
  ctx.effect(
    () => ctx.tools.register({
      name: "tracy_design_copy",
      description: `Write the customer's words into a design template's layout: a PREVIEW version in the Design templates dialog, never a change to the live site ("the pricing page in Stripe" is one). action="form" {id, chip} \u2192 that chip's slots and the length each allows; action="write" {id, chip, lang, slots, title?} stores one version, in the site's language; a text over its slot's length is refused by name. Workflow: the tracy-design-inspiration skill.`,
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["form", "write"] },
          id: { type: "string", description: "Catalog id or brand:<host>." },
          chip: {
            type: "string",
            description: 'A page path ("/", "/pricing/") or an artifact: landing, deck, poster, email, newsletter, form, typography. Default "/".'
          },
          lang: { type: "string", description: 'BCP-47, e.g. "vi".' },
          slots: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "slot id \u2192 text, ids from form with the same chip."
          },
          title: { type: "string", description: "write: 2\u20134 words naming the take." },
          brief: {
            type: "object",
            properties: { goal: { type: "string" }, voice: { type: "string" } },
            description: "What the customer asked for, when they gave a brief."
          }
        },
        required: ["action", "id"]
      },
      output: {
        schema: {},
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
      },
      async execute(args, exec) {
        const config = scopedTo(bundleConfig, exec?.agent?.session?.header?.cwd);
        if (config === null)
          return { ok: false, code: "NO_SITE", error: "This conversation is not in a site's workspace." };
        const l = await lib();
        if (l === null) return { ok: false, error: "This lane has no design library." };
        const a = args && typeof args === "object" ? args : {};
        const id = typeof a.id === "string" ? a.id : "";
        if (brandHostOf(id) === null) {
          const off = await designSystemsOff(bundleConfig);
          if (off) return off;
        }
        const brands = await readBrands(config);
        if (!allIds(l, brands).has(id)) {
          return {
            ok: false,
            error: `Not in the catalog: ${id || "(empty)"}. Use a catalog id or brand:<host>.`
          };
        }
        const site = await readSite(config);
        const sitePages = site?.pages ?? [];
        const chip = canonicalChip(typeof a.chip === "string" && a.chip !== "" ? a.chip : "/", sitePages);
        const layout = chipLayout(chip, sitePages) ?? (chip === "/" ? { fixture: true, kind: "home" } : null);
        if (layout === null) {
          const paths = sitePages.map((p) => p.path).filter((p) => typeof p === "string");
          return {
            ok: false,
            error: `No such chip: ${chip}. The chips of this site are ${[...paths, ...ARTIFACT_TYPES].map((c) => `"${c}"`).join(", ")}. This tool writes a PREVIEW version only \u2014 never edit the live site for a design template.`
          };
        }
        const slots = "artifact" in layout ? await artifactSlotsFor(config, id, layout.artifact, l) : await slotsFor(l, config, id);
        if (!slots || slots.length === 0) {
          return {
            ok: false,
            error: "artifact" in layout ? `${id} has no ${layout.artifact} artifact on this lane.` : `No slot map for ${id} on this lane.`
          };
        }
        const copy = await readCopy(config, id) ?? emptyCopy(id);
        const page = copy.pages[chip];
        if (a.action === "form") {
          return {
            ok: true,
            id,
            chip,
            layout: "artifact" in layout ? { artifact: layout.artifact } : { fixture: "components.html", kind: layout.kind },
            slots: slots.filter((s) => !s.inNav).map((s) => ({ id: s.id, role: s.role, text: s.text, ...slotLimits(s) })),
            navSlots: slots.filter((s) => s.inNav).map((s) => s.id),
            site: site ? { site: site.site, pages: site.pages, log: site.log } : null,
            written: page ? {
              selected: page.selected,
              versions: page.versions.map((v2) => ({
                id: v2.id,
                title: v2.title,
                kind: v2.kind,
                at: v2.at,
                slots: v2.slots
              }))
            } : null,
            rule: "Write one text per slot that matters; stay within min..max (a text over max is refused). Invent from the site's data; write in the site's language."
          };
        }
        if (a.action !== "write") return { ok: false, error: 'action must be "form" or "write".' };
        const v = agentVersion(args, slots);
        if (!v.ok) return { ok: false, error: v.error, offending: v.offending ?? [] };
        const ok = await withCopy(config, id, "", async (file) => {
          file.lang = v.lang;
          if (v.brief) file.brief = v.brief;
          addVersion(file, chip, v.version);
          return writeCopy(config, file);
        });
        if (!ok) return { ok: false, error: "Could not write design-copy/<id>.json." };
        return {
          ok: true,
          id,
          chip,
          version: { id: v.version.id, title: v.version.title },
          written: Object.keys(v.version.slots).length,
          warnings: v.warnings,
          note: "The dialog shows the new version on its own; one line to the customer is enough."
        };
      }
    }),
    "tracy-design-inspiration: copy tool"
  );
  ctx.effect(
    () => ctx.tools.register({
      name: "tracy_design_propose",
      description: "Show one to three design templates for THIS site, drawn live on its own content: the chat renders the cards, never describe or paste them. Each pick is a catalog id (tracy_design_library) or brand:<host> (tracy_brand) with one line of why in the customer's words \u2014 one keeps the current spirit, one upgrades it, one is bold; a named one alone. Workflow: the tracy-design-inspiration skill.",
      parameters: {
        type: "object",
        properties: {
          picks: {
            type: "array",
            description: "In the order to show them.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Catalog id or brand:<host>." },
                why: { type: "string", description: "One line for the customer, \u2264200 characters." }
              },
              required: ["id"],
              additionalProperties: false
            }
          }
        },
        required: ["picks"]
      },
      output: {
        schema: {},
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
      },
      async execute(args, exec) {
        const config = scopedTo(bundleConfig, exec?.agent?.session?.header?.cwd);
        if (config === null)
          return { ok: false, code: "NO_SITE", error: "This conversation is not in a site's workspace." };
        const l = await lib();
        if (l === null) return { ok: false, error: "This lane has no design library." };
        const brands = await readBrands(config);
        const off = await designSystemsOff(bundleConfig);
        const ids = off ? new Set(brands.map((b) => b.id)) : allIds(l, brands);
        const picks = validPicks(args, ids);
        if (picks === null) {
          const raw = args?.picks;
          if (!Array.isArray(raw) || raw.length === 0) {
            return {
              ok: false,
              error: "picks must be a non-empty array of { id, why }; one to three entries."
            };
          }
          if (off) return off;
          const bad = raw.map(
            (p) => p && typeof p === "object" && typeof p.id === "string" ? p.id : JSON.stringify(p)
          ).filter((id) => !ids.has(id));
          return {
            ok: false,
            error: `Not in the catalog: ${bad.join(", ")}. Every pick must be an id from tracy_design_library or a brand:<host> the customer extracted; give one to three.`
          };
        }
        const closed = await chatRouteOff(bundleConfig);
        if (closed) return closed;
        const names = new Map([...brands, ...l.systems].map((s) => [s.id, s.name]));
        const site = await readSite(config);
        let recorded = false;
        if (site !== null) {
          site.picks = picks;
          try {
            await fs3.writeFile(siteFile(config), `${JSON.stringify(site, null, 2)}
`);
            recorded = true;
          } catch {
            recorded = false;
          }
        }
        return {
          ok: true,
          picks: picks.map((p) => ({ ...p, name: names.get(p.id) ?? p.id })),
          recorded,
          note: recorded ? "Shown to the customer as three live cards." : "Shown to the customer as three live cards; design-preview.json is absent, so the cards carry no site content yet \u2014 read the site first."
        };
      }
    }),
    "tracy-design-inspiration: propose tool"
  );
}
export {
  apply,
  inject,
  name
};
