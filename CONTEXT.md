# What Tracy is — read this file before `CLAUDE.md`

Three root files, each answering one question:

- **This file**: what we build, **and for whom**. Every sentence here stays true if the database,
  the hosting or the service split changes.
- [`SYSTEM.md`](SYSTEM.md): how the system **runs**, verifiable from routes, Dockerfiles and config.
- [`CLAUDE.md`](CLAUDE.md): **how to build without breaking things**.

> **Source:** the product owner. Most of this file **cannot be inferred from the code**: no line of
> code says who the customer is, which way of working Tracy replaces, or how it is sold. An agent
> that reasons backwards from mechanism to intent is sometimes right and sometimes wrong, and wrong
> silently. Changes to this file go through the product owner. When code disagrees with a sentence
> here, record the mismatch; do not edit the sentence to match the code.

## 1. What it is

**Tracy helps people change their website by talking to an AI.** The customer types "change the
phone number in the footer", and Tracy's agent makes the change on the real site.

**But customers do not pay to chat with an AI.** ChatGPT, Claude Code or an AI plugin in WordPress
can do that too. Customers pay because they **dare to let an AI touch their real site**, thanks to
three things:

1. **Every change is visible.** The **Site changes** tab lists every change on the site, with who
   made it and from where: Tracy acting on a chat message or a comment, a person editing directly in
   the admin, or a deploy. **Diff** shows what changed where.
2. **Everything can be reversed.** Undo any single change. To keep a known good point, create a
   **Backup**: files **and** database, fully restorable to that point.
3. **The AI only touches the site it was given.** An agent working for a site can only see and change
   that site, and everything it changes shows in Site changes. The mechanism (the four ways an agent
   touches a site, the fence between sites, and how each change is recorded):
   [`SYSTEM.md`](SYSTEM.md) §4–§5.

In short: chat is **how Tracy is used**. Seeing and reversing changes is **what Tracy sells**.

🔒 **There is no approval step before a change.** The agent changes the site right away; a person
reviews afterwards and undoes if needed. Do not design an "Approve" step: that door existed once and
was removed.

## 2. Scope

Tracy serves only **websites running on an existing platform**. It does **not** serve hand-coded
sites, at least in this phase.

**Working today: WordPress · Joomla · EmDash.** Build a new site from a quickstart, or bring a
running site in (**Import existing site**). **Shopify is not supported yet**: tell customers it is
not, and do not promise a date.

⚠ The boundary is **not** "has a CMS or not". It is: **does the site already have an admin page you
sit and click through?** That is where the pain is. EmDash is a web application, not a PHP CMS, yet
it is in scope. Never write "CMS only" on any surface: those words exclude EmDash.

## 3. For whom

| Role | Who | Where it hurts |
|---|---|---|
| **Daily user** | Site owner, content editor | Every task means clicking through the admin by hand |
| **Buyer** | Agency / web studio | Looks after a whole basket of client sites and carries the cost of "small fix requests" |

🔒 **The beta is open to every email and free during the beta.** A JoomlArt plan is no longer
required to get in (decided 26/10/2026).

These two roles explain why Tracy manages many sites at once (an agency arrives with dozens), why it
has an Import flow (bring in a running site, not only create a new one), and why it has **Team**:
invite people, assign roles, revoke access per site.

## 4. What it replaces

Customers today take **two paths**, and Tracy competes with **both**:

1. **Click through the admin themselves**: free, but slow and painful. No platform lets you type one
   sentence and have it changed.
2. **Ask a developer / outsource**: every change costs money and waiting.

Site owners hurt on path 1, agencies on path 2: the same job seen from two ends.

## 5. How it is sold

**Not decided.** Record the current state, do not invent:

- **Exists:** the **seat** mechanism: who may work on which site, in which role, and revocably
  ([ADR 0001](docs/adr/0001-seat-door-and-enforcement-boundary.md)). The beta is open to every email,
  free (§3).
- **Does not exist:** payment. No surface has Billing.

🔒 **Do not infer a pricing model from the seat mechanism or the beta gate.** Seats were built to
**enforce permissions**, not to count money. An agent writing "Tracy is sold per seat" in a document
turns a guess into a rule.

## 6. What customers can do today

Each row is a product capability. The reasons are in the ADRs; the mechanism is in
[`SYSTEM.md`](SYSTEM.md).

| Capability | In one sentence | Why |
|---|---|---|
| **Build a new site** | Pick a quickstart or a **Design inspiration**; Tracy builds a real site with content | [0010](docs/adr/0010-design-inspiration.md), [0017](docs/adr/0017-github-release-is-quickstart-source-of-truth.md), [0023](docs/adr/0023-site-bound-to-a-design-system.md) |
| **Edit by chat** | Type a request; the agent changes the real site | — |
| **Comment on the page** | Pin a comment to the exact spot on the site; Tracy acts on it and closes the comment only with evidence that the change was written | [0025](docs/adr/0025-close-comment-on-write-evidence.md) |
| **Site changes · Diff · Undo · Backup** | The three things in §1 | [0024](docs/adr/0024-backup-is-a-complete-restore-point.md) |
| **Team** | Invite, request access, change role, remove people, per site. Three roles: Viewer (view, comment, ask the agent), Editor (change the whole site), Owner (also manages people, domains, deleting the site) | [0001](docs/adr/0001-seat-door-and-enforcement-boundary.md), [0028](docs/adr/0028-viewer-editor-owner-roles.md) |
| **Inbox + email** | Notifies you when **another person** does something that concerns you. It does not notify about Tracy's own work: the sender is sitting there watching Tracy work | [0026](docs/adr/0026-inbox-and-email-notifications.md) |
| **AI assistant (`/help`)** | Type `/help <question>` in the chat box: ask about Tracy and about your own site, and get pointed to the right screen. The question goes straight to the assistant, **not through the agent**, and does not interrupt a running agent; it **changes nothing**. For a real person, reach out on Discord | — |
| **Brand** | The site's identity kit, built or taken from the community library | [0013](docs/adr/0013-community-brand-store.md) |
| **Eight interface languages** | en, vi, de, it, fr, nl, zh, es. A language that is offered must be complete on every screen | — |

Operators (not customers) switch individual pieces of the interface on and off in `/ops`, without a
code change ([ADR 0015](docs/adr/0015-feature-pack-is-the-toggle-unit.md)).

## 7. What is NOT Tracy

| Thing | What it is | Boundary |
|---|---|---|
| **dsh** (DeepSeek Harness) | Someone else's agent core, "everything is a plugin" architecture. Tracy plugs into it and uses it as the interface shell | Tracy keeps **a recorded fork** (`-tracy.N` versions) of the core and a few plugins; changes go through the fork process, never in-place edits. [ADR 0004](docs/adr/0004-dsh-is-the-shell.md) · [ADR 0006](docs/adr/0006-plugins-as-pinned-subtrees.md) |
| **`tracy-desk`** | **Legacy**: the first version, built on Cherry Studio, since moved to dsh | No further development. `vocabulary.md` still borrows its words: one product does not give one thing two names |
| Anthropic's **Claude Cowork** | A different product | "Claude Cowork" in this repo is the **name of the plugin Tracy installs into the CMS** of a customer site, not Anthropic's product |

## 8. One product, one customer surface

Customers use Tracy on the web: `cowork.tracy.ai`. The repo also has a desktop shell (Electron) that
CI does not build; when it reaches customers it is **a second surface of the same product**, so the
on-screen words and flows must match:
[`docs/references/vocabulary.md`](docs/references/vocabulary.md).

## 9. Design system vocabulary

The six terms settled on 13/10/2026 for every document and every sentence about changing a site's
style. The English word is the one used in identifiers and on screen.

**Design system** (short form in prose: **system**):
A set of colours, type and corner radii taken from a library (Refero, OpenDesign) that the customer
picks to change the style of the whole site. Do not call it a "theme": a theme belongs to the CMS.
_Avoid_: style system, theme, UI kit

**Slot**:
The part of a template's CSS that takes its value from the design system. A template with slots can
wear a design system; one without slots cannot.
_Avoid_: variable, token

**Wear** · **take off**:
Wearing a design system puts it on a site; removing it is taking it off.
_Avoid_: apply, remove

**Auto palette**:
The template's palette read from its own demo page; each colour is assigned a role and mapped to the
design system's colour for that role when worn. The contract only declares justified exceptions
(photos, brand art) and role hints.
_Avoid_: listing blocks, painting each band

**Band**:
A large area the template paints itself (header, hero, CTA, footer). Whether a band follows the
design system or keeps its own colour is a matter for the slot contract.
_Avoid_: block, section

**Mode**:
Light or dark for a page. A design system has a **native** mode and a **derived** mode that Tracy
infers from the system.
_Avoid_: light/dark theme, variant

**Measurement run** · **measurement file**:
A measurement run is one run of the `tdsr` skill by whoever fixes a template, on their own machine,
to measure the built site. The result is a measurement file that travels with the fix: the
`designSystem` block in the release's `VERIFICATION.json`, or `design-system-measurement.json` in the
contract folder; /ops reads the file, no machine pushes results up.
_Avoid_: measuring machine, ingest door, measurement queue, runner, test machine, ingest endpoint
(relics of the design before 13/10)

---

**Read next:** [`SYSTEM.md`](SYSTEM.md) (how the system runs) · [`CLAUDE.md`](CLAUDE.md) (boundary
rules, blast map) · [`DESIGN.md`](DESIGN.md) (design system) · [`docs/adr/`](docs/adr/README.md) (why
each mechanism was chosen)
