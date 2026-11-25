- **The write step writes an EmDash site: the Apply door answers `content.contract` (inspect, apply) and `info` on EmDash from the release's content map, through a new host door that runs the site's own content tools** — David (WO) · #754 · `feat/wo-emdash-write-door` · 2026-11-25
  **Affects:** the Apply door on EmDash sites, `tracy-host`, the write step.
  - `content.contract` on an EmDash site used to answer `COMPONENT_NOT_REGISTERED`. It now answers:
    - `inspect` and `apply` (`changes`, `empty_slots`), all or nothing, in the Joomla plugin's shape. The menus' items are slots too (`menu.<name>.<position>.label`); an emptied one leaves the menu.
    - `pages.unpublish`, which makes the pages a plan drops drafts.
    - Any other operation is refused `operation_not_on_emdash`.
  - `info` answers `{ok, info: {platform: "emdash", …}}`.
  - Two new Apply actions, EmDash only, with the `site` toolset: `emdash.settings` (read or set `logo` and `favicon`) and `emdash.entryField` (read or set a picture field of one entry). The brand stage writes the logo and favicon through them.
  - New signed host door `POST /_host/emdash-content` `{label, calls: [{tool, args}]}`: at most 200 calls of a fixed list of content tools, run in one `docker exec` in the site's web container. It needs a `tracy-host` deploy.
  - The write step has an EmDash site door (`writes: true`):
    - Main menu labels go with the contract words.
    - A main menu item the plan does not keep leaves the menu without holding its page. On Joomla an unpublished item takes its page with it; that rule is unchanged.
    - A dropped page is made a draft.
    - Calls EmDash has no door for (articles, Joomla menu items, modules, template settings, page meta) are answered in words by the door and never sent.
  - The chain still builds only JA Boxing and JA Diner on Joomla. `STEP_CHAIN_TEMPLATES` is unchanged.
  **Why:** the three CMS plan, step 4: the WO chain build must write EmDash sites before EmDash Diner can run on the chain.
