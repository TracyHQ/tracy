---
description: The canonical vocabulary for every displayed word, with the five banned words the machine enforces.
sources:
  - scripts/check-language.ts
  - packages/locale/tracy-locale-vi/terms.ts
  - packages/ui/tracy-chat-input/src/client/strings.ts
  - packages/dev/tracy-design/src/views.tsx
  - packages/design/tracy-design-skill/skills/tracy-design-inspiration/SKILL.md
---

# Tracy vocabulary — use exactly these words on every surface

> **The authoritative source** for displayed words, across the whole repo. `scripts/check-language.ts` enforces
> what can be enforced; the rest is review's job.
>
> This table is built from the words TCH **actually uses** — the `en` copy in the `strings.ts` of three Tracy
> plugins and the 32 views of [`@tracy/design`](../../packages/dev/tracy-design) — not copied
> across from `tracy-infra`'s table. The two may drift; **this one wins for everything TCH ships.**

Words on the interface are **a contract, not a preference**. Do not invent new words when this table already has one.

## 1. Product nouns

Taken from the view registry of `@tracy/design` — the visual source of truth.

**Places:** Workspace · Launchpad · Inbox · Site · Settings

**Website Opportunities — My opportunities v3** (drawing approved by Lee 19/10/2026): **Research → Demo → Outreach**
are the three stages. **Attention** and **Cancelled** stand apart on the right. **Progress** is the current progress in the list;
**Steps** is the whole path Research → Brief → Build → Fill → Site check of one place. **Send demo** opens the user's
copy/share tools and creates no Sent state. The old names New/Researched/Brief are no longer stages in
My opportunities; Find keeps its existing states.

**The `/ops` sidebar:** the **DevOps** group gathers CI and the Release checklist, at the bottom of the sidebar.
DevOps replaced the name of the Release group on 08/10/2026; the **Release checklist** screen and the `/ops/release` route
keep their names because they are specifically about checks before and after a release.

**One site's screen:** Chat · Changes · Preview (three panes, one shared header row)

**In the user's Settings:** Appearance · Notifications · MCP · Skills · Model Provider ·
Default Model · Web Search · Channels · Scheduled Tasks · Keyboard Shortcuts · System · Account ·
Billing · About & Feedback

**AI accounts** (`@tracy/dsh-model-plan`, 08/10/2026; old name **Model Subscription**, changed 09/10/2026) — a Settings item right below Account, also the second row of the avatar menu (logos of the connected vendors) and the name of the switch in `/ops/ui`. Connections and routing order belong to the Tracy account, used on web and desktop; not shared with other members of the same site. The admin switch applies to both surfaces; turning it off does not delete saved connections. Why the rename: "connector" clashes with the MCP connectors of Claude/ChatGPT; "LLM" is techie jargon; "Subs" is an abbreviation. The internal id and namespace are still `tracy-model-plan`; "subscription" remains only when talking about a vendor's actual paid plan.

Inside AI accounts (decided by Lee 11/10/2026; mock `tasks/evidence/desktop-onboard/mock/settings-ai-accounts.html`; the same card set as the "Pick your AI account" step of Getting started):

| Word (en) | vi | Meaning |
|---|---|---|
| **Default** | Mặc định | the label on the card at the HEAD of the row: new chats use this account; the panel of another connected card has a **Set as default** button (Đặt làm mặc định). The server still keeps one `connection_order` chain — "Default" is only the name of its first element |
| **Fallback** | Dự phòng | the entries after Default, tried in turn when Default cannot answer (quota exhausted, signed out, having an outage). The block "If {Default} can't answer" lists them with Move up / Move down; none yet → "No fallback yet…". The panel reads "Fallback n: used when A and B can't answer." |
| **Tracy AI** (card) | Tracy AI | one entry of the row like any other, always present, no switch; the card sits in the section **Included with your Tracy account** (Có sẵn trong tài khoản Tracy của bạn) above "Found on this computer"/"Popular"; label **Included** (Có sẵn) when it is not first. A product name, kept as is in all 8 languages (the constant `TRACY_AI` in code, no translation key) |

**Do NOT use** here: "routing" (a machine word — `routing.*` survives only as key ids), "backup" (reserved for site restore points, the Backup section above), "Usage limits apply" (dropped by Lee 11/10: no code counts Tracy AI quota yet).

**In a site's Settings:** General · Team · Connection · Reskins · GitHub · MCP · Skills ·
Data sources · Scans · Advanced

**Redesign** (spec [`tasks/spec-huong-thiet-ke.md`](../../tasks/spec-huong-thiet-ke.md),
decided by Lee 05/09/2026 — the mechanism is the deck's wayfinder, but customers do not read the mechanism's words):

| Machine word | Customer sees (en) | Customer sees (vi) |
|---|---|---|
| design system | **Design template** | **Template thiết kế** |
| wayfinder map | **Redesign plan** | **Kế hoạch làm lại giao diện** |
| decision ticket | **Your decision** | **Bước cần anh chọn** |
| triage · issue · ticket · wayfinder | *not shown* | *không hiện ra* |
| text cut from the site (fill `cut`) | **Your words** | **Chữ của anh** |
| text the agent rewrote (`design-copy`) | **Rewritten** | **Đã viết lại** |
| page with `generated: true` | **Generate new page** · chip with a sparkle | **Sinh trang mới** |
| `fit` to the brand | **Closest to your brand** | **Gần brand của anh nhất** |

🔒 **Design template is the canonical name since 12/10/2026** (decided by Akemi, to stand beside the **Design system** tab
consistently). The old name **Design inspiration(s)** / *Cảm hứng thiết kế* is **retired**: not used on
screens, in sentences the agent reads, or in public docs. Capitalised per label: **Design templates** (tab
name, page name, library name, plural), **Design template** (one entry, or as an adjective: "Design
template card"); lowercase mid-sentence (*a design template*). An entry previously called simply
*inspiration* ("Use this inspiration") is now a *design template*. Only displayed words change: the package name
`@tracy/dsh-design-inspiration`, tab type `tracy:design-inspiration`, URL `/design-inspiration`,
file `tracy_design_inspiration.json`, API fields and translation key names stay as they are. Translations: vi *Template
thiết kế* · de *Design-Templates* / *Design-Template* · fr *Templates de design* · it *Template di
design* · nl *Design-templates* · es *Templates de diseño* · zh *设计 template*.

**Brand engine** (spec [`tasks/spec-brand-engine.md`](../../tasks/spec-brand-engine.md) §6, decided by Lee
06/09/2026 — `brand` stays verbatim in both languages, see `terms.ts`):

| Machine word | Customer sees (en) | Customer sees (vi) |
|---|---|---|
| the customer's own site tab | **Brand** | **Brand** |
| the reference site tab | **Brand builder** | **Brand builder** |
| `kind: own` | **Your brand** | **Brand của anh** |
| `kind: reference` | **Reference** | **Tham khảo** |
| running the pipeline | **Extract** / **Extract again** | **Trích** / **Trích lại** |

The side card's tab, the dialog title and the three cards in chat use exactly the three words of the middle column. The four words of the last
row are **not** in `BANNED_VOCABULARY` (§4): they are valid words in code (GitHub API's `issue`, the deck's `triage`
skill) — banning them here bans mentioning them, not using them. Review holds that row.

**The badge on customer sites** (ADR [0019](../adr/0019-badge-served-from-tracy-web.md), decided by Lee 19/09/2026):

| Machine word | Meaning | Where |
|---|---|---|
| **Badge** | the pill floating on a site — `seat` (the customer's working copy) or `advert` (demo) | `apps/tracy-web/src/lib/{seat-badge,tracy-badge}.js` |
| **Widget** | the `/ops/widget` screen, where the team edits those two badges | `packages/web/tracy-harness/src/Widget.tsx` |

One thing, two words, and the boundary is **the screen** versus **the pill**: do not call the pill a widget, do not call
the screen a badge.

**The Quickstarts list at `/ops/cms/quickstarts`** (decided by Akemi 30/09/2026) — column words, not
product names:

| Word | Meaning | Where |
|---|---|---|
| **On Tracy** | the title of the release's **Design templates** card-status column; the product name is still Design templates, this word lives only in the column title | `cms/Quickstarts.tsx` |
| **Active** · **Hidden** · **Disabled** | pills in that column: the card is live on Design templates · has a card but not live · has no card yet; the full sentence is in the tooltip | `DesignInspirationBadge` (`compact`) |
| **Action** | the column of buttons opening the card sheet (Settings / Add card) | `cms/Quickstarts.tsx` |

A quickstart's detail page still uses the full sentences ("On Design templates", "Card, not on Design
templates", "No card") because there is no column title there to say it for them.

**Card and listing on the Templates Management screen `/ops/cms/templates`** (decided by Akemi 10/10/2026) — two
different things, previously both called "card":

| Word | Meaning | Where |
|---|---|---|
| **card** | ONLY the card customers see for a template on Design templates (image, name, category, CMS logo) and its Preview. Kept in: the Preview panel and the **Card** column of the list. A template with no listing yet: a red box in the Card column reading **No card**, one line, fitting the image frame (Akemi 11/10/2026: "No listing yet" tried here overflowed the frame, so only this box keeps "No card"; Road to live and the panels still read **No listing yet**) | `cms/Templates.tsx`, `cms/DemoCardEditor.tsx` |
| **listing** | what is built for ONE CMS release so that CMS is offered on Design templates, with its own page and images (the release's `tracy_design_inspiration.json` file). Section title **Listing**, form **Edit listing**, buttons **Create / Save / Update / Regenerate listing** | `cms/DesignInspiration.tsx` (the `cardOnly` branch), `cms/DemoCardEditor.tsx` |
| **Listed** · **Hidden** · **No listing yet** | listing state of the selected release: live · saved but hidden · none yet (11/10/2026: "Not listed" became **No listing yet**, the same words as the Listing step of Road to live) | `chipStatusOf` (`cms/templates-model.ts`) |
| **Road to live** | the box at the top of a template page: one group per release, seven steps in the server's fixed order (`road`, `apps/tracy-web/src/lib/road-to-live.js`); a step fixed on /ops has **Go there**, a waiting step reads **Waiting for step N**, a step fixed outside /ops has an **Outside /ops** block | `cms/RoadToLive.tsx`, `cms/problem-guides.ts` |
| **Used on Design Templates** | a brand-coloured strip right under the Listing section's status strip, shown only on a release whose listing feeds the card customers see (the server's `cardSource`) | `ListingStatusStrip` (`cms/ListingStatusStrip.tsx`) |

Only displayed words change: data keys, API fields, door names, file names and the old `/ops/cms/quickstarts` screen
keep the word "card".

**Site changes V2** (plan `tasks/todo-site-changes-v2.md` §2.1, §3; mockup `site-changes-v2` approved by Brian
02/10; proposal `tasks/evidence/site-changes-v2/P1/vocabulary-proposal.md`) — one row is **one
recorded event**, the four columns and ten Type values are a **closed list**: UI, API enum
and filters share one table. The column and filter are named **Type** (vi **Loại**; "Type: All") since 03/10 — Brian replaced
the word "Source"; the API enum is still `source` (`origin.source`, `filter=`), unchanged.

| Word (en) | vi | Meaning |
|---|---|---|
| **Description** · **Time** · **Type** · **By** | Mô tả · Thời gian · Loại · Bởi | the four columns; in a narrow pane, the labels of the metadata line (Type was "Source" until 03/10) |
| **Chat** · **Comment** · **Design system** · **Tracy setup** · **API** · **CMS admin** · **Automatic** · **Tracy update** · **Restore** · **Unknown** | Khung chat · Bình luận · Hệ thiết kế · Tracy dựng site · API · Quản trị CMS · Tự động · Tracy cập nhật · Khôi phục · Không rõ | Type = the path that made the change (enum `chat`…`unknown`), not a person; different from the `site_cms_change.source` column (a log name) |
| **N recorded events** / **At least N recorded events** | N sự kiện đã ghi nhận / Ít nhất N… | the server's total; "At least" when `counts.complete=false` |
| **Request** | Yêu cầu | label when the Description is only the request |
| **Detected …** | Phát hiện … | Time of a file known only from when it was sealed |
| **Original request incomplete** · **Full original request unavailable** | Yêu cầu gốc không đầy đủ · Không có yêu cầu gốc đầy đủ | `request.state` `truncated` · `unknown` |
| **Undo file changes…** | Hoàn tác thay đổi tệp… | replaces V1's `Undo this moment…`: the backend only undoes files |
| **Files undone · Content changes not undone by this action** · **File changes undone** | … | the state after undo; the Description is not struck through |
| **Content** · **Settings** · **Files** · **Other recorded actions** | Nội dung · Thiết lập · Tệp · Thao tác khác đã ghi nhận | the four scope groups (plan §2.5) |
| **Not tracked on {cms}** | Không theo dõi trên {cms} | instead of "0 files" in an untracked zone |
| **Open chat** | Mở khung chat | the button in a Chat/Comment row's details and the arrow next to Source in the row, opening RIGHT INSIDE Tracy (switching the main chat to that session, scrolled to the right turn; a new window is only the fallback — W-F3, 03/10); only the person who typed can open it (`Only {name} can open this chat`) — plan `tasks/todo-open-conversation.md` A, (3)(4); replaces the old words "Open conversation" (Brian 02/10) |
| **Tracy replied** | Tracy đã trả lời | the block of what Tracy said at the end of the turn; its own account, not proof of the result — plan C |
| **Ask Tracy to revert** | Nhờ Tracy hoàn nguyên | a button in the details of every row with changes (except the undo/restore turn itself): clicking SENDS AT ONCE into the open chat (Brian 02/10 ~22:5x, chip + auto-send; the "…" was dropped since there is no further step) a human-readable sentence `Revert “{what}” — only this change.` plus a **Revert details** chip (vi **Chi tiết hoàn nguyên**) carrying the machine record for the agent; short state **Sent to Tracy** (vi **Đã gửi cho Tracy**) — best-effort, NOT called Undo (Undo/Hoàn tác is only the server's deterministic file operation) — plan `tasks/todo-ask-tracy-to-revert.md` |

The Source value of a Tracy deploy is shown as **Tracy update** (vi **Tracy cập nhật**; Brian
chose option a, 02/10 — "Deployment" reads like the customer's own work; the API enum keeps `deployment`). Its By is
**Tracy**; the details open with "Your content and settings were not touched." (vi "Nội dung và thiết lập
của bạn không bị đụng."), while tags, files and who launched it are in Technical details. A component of
Tracy itself on the site (`owner: 'tracy'`: the Claude Cowork plugin, the Joomla sign-in plugin) reads as
"Tracy's …" (vi "… của Tracy").

The Type value of a click on the **Design system** button in the site browser bar (apply, switch, undo) is
**Design system** (vi **Hệ thiết kế** — exactly the button's name; API enum `design-system`; walkthrough 11/10/2026). By
reads **Applied by {who clicked}**, never "Applied by Tracy". The descriptions are three different actions, never the machine word
"design-system": **Applied the design system “X”** · **Switched the design system from “A” to “B”** · **Undid
the design system “X”** (vi Đã áp / Đã đổi … từ … sang … / Đã hoàn tác hệ thiết kế “X”). Applying through chat
(when the `chat-design-system` switch is on) is still **Chat**.

The Type value of the writes Tracy makes while building a site from the brief someone sent in the Add site popup is **Tracy setup**
(vi **Tracy dựng site**; enum `setup`; council 11/10/2026, sweep #4): one row per build, By reads
**Requested by {who sent the brief} · Applied by Tracy**. Only when the Apply door recorded that origin at write time
(`site_write.origin = 'setup'`); a sessionless write without that record is still **Unknown**. A write with an
API key (`/v1`) is **API** (enum `api`, By **Applied by {key owner}**); a revert through `/v1` is its own row,
described **Restored the content from before change {apply id}**. Do not use **Automatic** for these two kinds: the default filter
hides Automatic.

The Source value for an Undo/Restore clicked in the tab is shown as **Restore** (vi **Khôi phục**;
Brian 02/10 — the tab is already named "Site changes", so the source does not repeat those words; the API enum keeps `site-changes`).
Three close Vietnamese words, three different actions, never swapped: **Hoàn tác** = the Undo button for one moment (deterministic);
**Khôi phục** = the Type value **Restore** (including Undo of one moment, Brian 03/10: no separate "Undo" value) + the "Restore…" button on a Backup (deterministic, by point); **Hoàn nguyên** = "Nhờ
Tracy hoàn nguyên…" (asking the agent, best-effort — line #728). V1's words (`Changes made
outside Tracy`, `Outside` in the filter, `Undo this moment…`, `Undone` on a whole row) were deleted together with the tab's V1
branch (03/10/2026).

**Backup** (ADR [0024](../adr/0024-backup-is-a-complete-restore-point.md); mockup `site-changes-backup` approved by Brian
02/10; `tasks/todo-backup.md`) — on customer screens, **Backup replaces Release**: a restore point made of
files **and** database. The machine still numbers `vN` and keeps the tag prefix `tracy-release/vN` (data on disk, only
shown in Technical details); every other name has been backup since 03/10 (the `/backups` door, the `webroot-backup` job,
the `webroot-backup.sh` script; ADR 0024 Amendment 2). A Backup is
a milestone in Site changes: **not counted in the total**; its Type cell reads **Backup** (vi **Bản sao lưu**) next to a box icon
(Brian 03/10: not only an icon) — Backup and Restore are two different values; Backup is not in the filter.

| Word (en) | vi | Meaning |
|---|---|---|
| **Create a backup** | Tạo bản sao lưu | replaces "Create release" in the Site changes header; the box no longer has a description line or the line "Files and the site’s database are both kept." (Brian 03/10) |
| **Backup N · <date time>** + **Change** | Bản sao lưu N · <ngày giờ> + Đổi | the suggested title in the Create a backup box, as text rather than an input; **Change** turns it into an input holding exactly that text. Only the part after "Backup N · " is saved (the list puts the number in front itself); an empty box = the date and time of clicking Create backup. N unknown (backups not loaded yet) → **Reading the backups…**, no guessed number |
| **Backup N · <title>** · **Initial backup — site as built** | Bản sao lưu N · … · Bản sao lưu đầu — site lúc bàn giao | point names; v1 is the first (restoring everything to it = back to the original state) |
| **Backup N · Before restore to Backup M** | Bản sao lưu N · Trước khi khôi phục về Bản sao lưu M | the point Tracy takes itself right before a Restore everything |
| **Full backup** · **File backup (no database)** · **Content backup** · **DB ✗** | Sao lưu đầy đủ · Sao lưu file (không có database) · Sao lưu nội dung · DB ✗ (thiếu) | a badge read from the point itself (ADR §1); never "Full" for a point that does not prove it has a database |
| **Restore…** · **Restore content…** | Khôi phục… · Khôi phục nội dung… | ONE button on a backup (Brian 03/10, replacing "Restore files…" + "Restore everything…"); EmDash keeps one "Restore content…", with no choice step |
| **Everything** · **Files only** | Toàn bộ · Chỉ tệp | the restore scope chosen in the Restore… box (ADR §2, two risk levels): Everything preselected — deletes everything saved after the point, requires typing the site name, takes "Before restore" first; Files only comes with the warning **Images uploaded after this backup are removed; posts that use them will show broken images.** Only one scope available (a backup without a database, a role not allowed to restore everything) → no choice, the box still reads **Restore: Files only** and the reason |
| **Jump to backup** | Tới bản sao lưu | the menu jumping to a point in the list |
| **Media & language files** | Tệp media và ngôn ngữ | the NEW label of the `content` zone (id unchanged): that zone is FILES; from now on **Content** only means the database on every customer screen (ADR §4) |

"Backup"/"Restore" do not replace "Undo file changes…": Undo reverts the files of ONE commit; Restore brings the
site back to a point. The **Releases** and **History** tabs were deleted for good (03/10/2026: code, switches, words); the old addresses
`?tab=tracy:releases|tracy:history` and saved layouts open **Site changes**. The **Build** tab names points the same
way: **Initial backup** · **Backup N**, no `vN`.

**Voice in chat** (David 15–16/10/2026; code `tracy-chat-input` `VoiceInput.tsx`, `VoiceMode.tsx`):

| Word (en) | vi | What it is |
|---|---|---|
| **Dictate** | Nhập bằng giọng nói | the microphone next to Send: text goes into the composer, the customer sends it themselves |
| **Voice conversation** | Trò chuyện bằng giọng nói | what happens in Voice mode: the customer speaks, the text is sent automatically on a pause, Tracy says what it is doing and reads the answer aloud. Do not use "voice mode" (ChatGPT's word) or "Voice chat" on customer screens |
| **Chat** · **Voice** | Chat · Giọng nói | the two modes of a chat, chosen in the header menu (#1409): Chat is typing as before, Voice replaces the chat body with an orb and the chat box with a mute button, X. "Chat" stays the same in every language (§6) |
| **Tracy’s voice** | Giọng của Tracy | the reading voice the customer picks in the Voice menu (ElevenLabs voice names kept as is) |

Why new words were needed: "Dictate" is only a microphone that types for you, sending nothing and reading nothing; the conversation is something else (sends by itself, reads aloud) so it needs its own name, and it overlaps no word in this table.

## 2. Actions

Add site · Sign in · Verify code · Join team · Request to join · Send · Attach files ·
Close settings

**The add-site flow — four words, one parent and three children:**

| Word | What it is |
|---|---|
| **Add site** | the name of the whole flow, and of its tab in the sidebar |
| **Create a new site** | the branch for sites born on the fleet (`origin = fleet_born`) |
| **Import existing site** | the branch for sites already running on the open web (`origin = fleet_import`) |
| **Fork a site from any URL, on a CMS you love** | the fleet-born branch taking design inspiration from a public URL (`origin = fleet_born` + `forkUrl`) — decided by Lee 06/09/2026 |

These four words **belong to `tracy-desk` and TCH**. The first three are taken verbatim from `AddSitePopup.tsx`
so that two surfaces of one product do not give one action two names. The fourth is a new TCH word:
the fork branch is born the same way as Create (fleet-born), but carries an extra `forkUrl` so the agent and the brand
engine know where to take design inspiration from.

*Historical note:* Before 06/09/2026 the table had only three rows and the note "There is no fourth word" because
Lee had not yet decided the fourth name. The fourth word was set on 06/09/2026 when Lee confirmed that the Fork card is
a branch of its own, not a variant of Create.

## 3. Agent-side

This is where Tracy **deliberately overrides dsh's labels** — dsh names presets its own way,
Tracy names them by this table. Do not "tidy" this into using dsh's labels
(`packages/ui/tracy-chat-input/src/client/strings.ts`).

| Key | Word |
|---|---|
| group title | **Permission mode** |
| `readOnly` | Default (ask before continuing) |
| `workspaceWrite` | Accept edits automatically |
| `fullAccess` | Full access |
| `plan` | Planning mode (requires plan approval) |

Composer: **Message the agent** · Attach files · Coming soon · Send · Working…

🔒 `composer.placeholder` **repeats** dsh's `conversation.placeholder.default`, and the repetition is
deliberate: `t` can only look up the bound namespace plus `common`. A translation must use **exactly the words** the
language pack already used for dsh's key, otherwise the screen has two sentences for one box.

## 4. Do NOT use

These five words are **enforced by machine** — `BANNED_VOCABULARY` in `scripts/check-language.ts`.
When you edit the table below, edit that array in the same change, otherwise one of the two lies.

| Do not use | Use instead |
|---|---|
| Creator mode | **Permission mode** |
| Session log | **History** / **Session information** |
| Workspace Write | **toolset permissions** |
| Agent preset · Agent presets | **Provider presets** — the gate catches both singular and plural (#807) |
| Design direction | **Design template** (since 12/10/2026; before that **Design inspiration**) — changed 07/09/2026, [ADR 0010](../adr/0010-design-inspiration.md); only the two-word phrase is banned, bare `direction` is a platform word (`flex-direction`) |

**Second class — coined words for things that already have a name.** Banned also in comments, in `docs/` (except `docs/adr/`),
`CLAUDE.md`, `CONTEXT.md`, `DESIGN.md`, `.agents/skills/`, and even inside an identifier
(`receiverFloor`) — because new identifiers are exactly how such a word spreads. The `COINED` table in
`scripts/check-vocabulary.ts` guards it. `tasks/` is not scanned: that is history.

| Do not use | Use instead |
|---|---|
| receiver (every form: `receivers`, `receiverFloor`, `minReceiver`…) | **Claude Cowork plugin**; data keys `cowork*` — §5 |

## 5. Names that are NOT displayed are vocabulary too

This document used to declare its own scope as "**displayed** words". On 29/08/2026 that hole was measured in
`tracy-infra`: two coined i18n namespaces — `workbench` (17 keys) and `frame` (9 keys) — entered the repo
and lived for a whole day. Key names are not displayed, so no rule banned them; but they flowed into the
README, `CLAUDE.md`, `DESIGN.md`, two ADRs and directory names, until **the product owner read their own
documents and did not know what they were about**. Nobody coined the words with bad intent — they just needed a
group name and no rule made them stop and ask.

So the scope is wider than displayed words: **i18n namespace names, page directory names, and nouns in
documents** must also be words from this table, or structural names with a written reason.

**`receiver` is the old name of a KEY, not the name of a thing.** The thing is the **Claude Cowork plugin**
(`com_claudecowork` on Joomla, the `claude-cowork` plugin on WordPress) — the door `tracy_site` and
every Build stage knock on. Since 27/09/2026 (#451) the keys changed to `cowork` too (`install.cowork`,
`coworkMinVersion`, `coworkContractVersion`); the old word survives only in lines that **read** data released
before that date, and each such line carries the `vocabulary-allow` label — meaning *old key, do not copy*.
Everywhere else — `echo` lines, comments, variable names, documents, sentences to people — write **Claude
Cowork plugin**. Guarded by machine: §4, second class.

**The machine guards both where the agent reads and where the agent speaks (27/09/2026).** The word came back a fourth time even though the code was
clean, because the agent reads it in two places the gate did not scan: machine memory and the journal `tasks/nhat-ky/` (`pnpm journal`
prints it at the start of every session — 28/74 entries still had the word). From now on: the coined-word table lives in **one** place,
`scripts/lib/coined-words.mjs`; the `vocabulary` gate reads it and also scans `tasks/nhat-ky/` (old keys in
released data are kept with `vocabulary-allow`); a `Stop` hook in `.claude/settings.json`
(`scripts/hooks/reply-vocabulary.mjs`) reads the agent's final reply and, seeing the word outside backticks, blocks
once with the replacement word.

Lee asked directly on 19/09/2026: *"why suddenly invent this receiver concept, why not just say plainly
that the cowork component is missing so it is easy to understand?"* — and that is exactly where this rule fell short. The price paid:
the template branch of `platform/joomla.sh` wrote a whole paragraph around "the receiver this release carries",
and nobody noticed that the thing under discussion was **Tracy's**, not the publisher's — so when no
release shipped it, the fix was written as "install it if present" instead of "Tracy installs it itself". A name that
sounds like someone else's gets treated as someone else's. A written rule was still not enough: the agent repeated
the word on 23/09 and 27/09, because it reads code more than rules — as long as the word stays in code, it copies it.
So this rule now has a machine guard and the word has left the code.

**`shell` is not used for the application frame — use `app`.** `shell` already has another meaning in the system:
"two shells (web + desktop)". Calling the left rail `shell` stacks a meaning onto an existing word.

## 6. Terms NOT TRANSLATED — every language (decided by Brian 05/10/2026)

The single source: [`packages/locale/tracy-locale-vi/terms.ts`](../../packages/locale/tracy-locale-vi/terms.ts).
When a source string contains a word from the list, its translation in **every** language (vi, de, it, fr, nl, zh, es) must
contain **exactly that word**; the `kept-terms` gate guards it. Full rules and reasons: [`i18n.md`](i18n.md) §5.

`admin` · `agent` · `API` · `backup` · `blog` · `brand` · `chat` · `commit` · `deploy` · `domain` ·
`download` · `email` · `file` · `fleet` · `folder` · `JSON` · `link` · `log` · `MCP` · `model` · `plugin` ·
`preview` · `prompt` · `proposal` · `release` · `restore` · `sandbox` · `session` · `site` · `Sitespace` · `Sitespaces` · `skill` ·
`tab` · `template` · `terminal` · `theme` · `token` · `upload` · `URL` · `webhook` · `workspace`

Deliberately still translated: account · password · page · post · draft · publish · menu · media.

History: on 02/10/2026 Akemi decided the list bound Vietnamese only; on 05/10/2026 Brian opened it to all seven
translations and added 18 words.

Bitten once (still true): the `vi` copy of `tracy-desk` translated `Agent` as
`Đặc vụ` — meaning a spy. Add new words to `terms.ts`, do not patch translations one by one. (Since 05/10 the `zh` copy also
keeps `agent`, no longer using `智能体`.)

→ `scripts/check-kept-terms.ts` guards all seven translations; `scripts/check-dsh-locale.ts` also guards errors specific to `vi`.

## 7. Third-party data is kept verbatim

`Módulo PagSeguro` is a fact, not our prose. Translating it is **a data-corruption bug**,
not an improvement. Product names, platform names and package names all belong in this category.

## 8. Sitespace — display labels follow the source casing (decided 12/10/2026)

Applied in exactly the casing of the source string: `Workspace` → `Sitespace`, `Workspaces` → `Sitespaces`, and
`WorkSpace` → `SiteSpace`. Lowercase `workspace` in descriptive sentences and technical identifiers stays
as is. The names Sitespace/Sitespaces stay the same in every language.

Machine code keeps using workspace in APIs, paths, key names, data types, package names and dsh
services. Do not change technical identifiers just to match a display label.

Decision: ADR 0032 (docs/adr/0032-workspace-rename-keeps-letter-case.md).

## 9. Package names — a closed list

A package is where a concept gets a name, and then every `import`, bundle id and document repeats that name. So
package names are a **closed list**: every `package.json` under `apps/*` and `packages/*/*` must carry a name
from the block below, and the block must not keep dead names. `scripts/check-vocabulary.ts` guards both directions.

```text
@tracy/cms-motion
@tracy/cms-preview
@tracy/cms-sections
@tracy/content-api
@tracy/core
@tracy/design
@tracy/design-page
@tracy/design-skill
@tracy/docs
@tracy/desktop
@tracy/ds-slot
@tracy/dsh-add-site
@tracy/dsh-ask-form
@tracy/dsh-assistant
@tracy/dsh-brand
@tracy/dsh-brand-engine
@tracy/dsh-chat-input
@tracy/dsh-cowork-bundle
@tracy/dsh-design-inspiration
@tracy/dsh-fleet-operation
@tracy/dsh-inbox
@tracy/dsh-mode-picker
@tracy/dsh-model-plan
@tracy/dsh-my-sites
@tracy/dsh-onboard
@tracy/dsh-native-bundle
@tracy/dsh-sandbox-docker
@tracy/dsh-settings
@tracy/dsh-sidebar
@tracy/dsh-site-build-emdash
@tracy/dsh-site-build-joomla
@tracy/dsh-site-build-wordpress
@tracy/dsh-site-tabs
@tracy/dsh-site-tools
@tracy/dsh-subprocess-docker
@tracy/dsh-tab-link
@tracy/dsh-tracy-locale-vi
@tracy/dsh-tracy-locales
@tracy/dsh-webroot-read
@tracy/dsh-website-opportunities
@tracy/emdash-theme-base
@tracy/emdash-theme-business
@tracy/emdash-theme-saas
@tracy/harness-web
@tracy/host
@tracy/i18n
@tracy/joomla-template
@tracy/quickstart-tools
@tracy/seeder
@tracy/site-build-core
@tracy/ui
@tracy/web
@tracy/wo-find-page
@tracy/wo-views
@tracy/wordpress-theme
website-opportunities
```

## 10. Adding or changing a word

This table is a **closed list**, a lesson from Cherry Studio's top-level directory rule. Before giving a thing a new
name, check whether it already has one — in this file, in the code, in `CONTEXT.md`. If it does,
use that name, even if you think yours is better.

If you truly need a new word (a new package, a new product concept, or renaming an old thing):

1. Edit this file **first**, in the same change as the code using the word.
2. Go through a **PR**. The PR description answers two questions: why no existing word works, and that the new word
   overlaps no other word. `pre-push` blocks a direct push to `main`/`develop` that changes this file.
3. A rename renames **everything** at once (§8 "do not rename halfway"), and adds the old name to §4 second
   class so the machine stops it from coming back.
