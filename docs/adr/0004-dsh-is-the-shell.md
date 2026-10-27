# 0004 — dsh is the shell, and sites follow the user

- Status: accepted (binding)
- Date: 2026-09-01
- Decided by: Lee
- Related: [`0001`](0001-seat-door-and-enforcement-boundary.md) (seat door — the seat ledger says who
  gets what) · [`0003`](0003-one-sign-in-door.md) (one sign-in door) · a DIFFERENT series,
  `tracy-infra`'s: `0003` §4 (member-lane), `0038` (role model), `0088` (add-site flow)
- Enforced in: `workers/cowork-web/src/worker.js` · `packages/bundle/tracy-native/cordis.patch.yml` ·
  `packages/site/tracy-my-sites/` · `vendor/tracy/dsh-passwords/src/gateway.ts` ·
  `packages/fleet/tracy-fleet-operation/scripts/tools/`
- Implementation plan: [`tasks/todo-native-lane.md`](../../tasks/todo-native-lane.md)

## Context

Up to 01/09, `cowork.tracy.ai` was the **Tracy shell**: a React SPA with its own router, and dsh was
a **sidecar in the `/agent` iframe**. The `@tracy/dsh-cowork-bundle` bundle turned off dsh's
`ui-sidebar` because two stacked navigation layers had been measured on 30/08 — two Settings places
on one screen.

Two facts shook that model, both measured rather than felt:

1. **The flows that work live on the dsh side.** The shell's `/add-site` button is `disabled`,
   together with `/launchpad` and `/inbox`. Meanwhile the `tracy-add-site` plugin runs end-to-end in
   the `native` profile.
2. **The shell can connect only one site.** `worker.js` is tied to exactly one `env.SITE_KEY`, and
   every other site of the same person gets `agent: null` — i.e. vanishes from every surface.

## Decision

**dsh is the shell.** `cowork.tracy.ai/` serves the lane, not the SPA. The `native` profile — dsh
keeps the navigation, plus `dsh-better-sidebar` and the Tracy plugin layer — becomes the customer
surface.

**Sites follow the USER, not the Worker.** A person can open every site they have a seat on; a
site's lane is **derived** from the fleet label rather than looked up in a table.

**Work history belongs to the SITE, not to the person.** Several seats working on one site see the
same conversation thread.

## Accepted costs

**dsh has no router.** We lose **shareable links** (`/workspace/<siteKey>` no longer means anything)
and the **Back button** — in dsh it leaves the application rather than going back one screen. No
step fixes these; they are consequences, not bugs. Old paths are redirected to `/` so a link already
sent does not become a 404.

## Four multi-site shapes, and why (a) was chosen

| | isolation boundary | history when switching site | |
|---|---|---|---|
| **(a) one sidecar per site** | kernel, between **sites** | **the site's — shared by the whole team** | ✅ chosen |
| (b) member-lane | kernel | — | ❌ webroot `:ro`, the agent cannot edit the site |
| (c) one container mounting everything | one JS fence | the person's | ❌ one `folderAllowed` bug exposes every webroot |
| (d) one lane per user | kernel, between **people** | the person's | ❌ two teammates on the same site have two separate histories |

(d) was proposed and then dropped: it optimises for **the wrong owner**. The right question is not
"whose line of work gets cut" but **"who does the history belong to"** — and for a customer website,
it belongs to the site.

**Measured limit:** an idle sidecar uses 220–290 MiB. The droplet has 2.3 GB available, so **four**
lanes fit, seven do not. Three sites with a 4 KB webroot are test sites and get no lane.

## Consequences

- `check-lane-tabs` enforces it: a lane with no seat may not seed `tracy:add-site` /
  `tracy:my-sites`. Before that the invariant was held by the **absence** of one configuration line.
- The guest lane does **not** get `dsh-better-sidebar`: it is already dsh-as-the-shell, and that
  sidebar brings Files · Terminal · Browser to an anonymous customer.
- `Appearance` is **not** moved over from the shell: dsh already has theme and language. Only the
  two sections dsh does not know about — account (a seat is granted to an address in the ledger, not
  a subuser) and site — are moved over.
- The tunnel's ingress table is the **Cloudflare API**, not a file on the droplet. The file
  `/etc/cloudflared/config.yml` is a relic and lies.

## Measured

| | |
|---|---|
| `GET https://cowork.tracy.ai/` | 200, dsh's HTML (`__DSH_BOOT__`), no more `cw-assets` |
| Customer lane | 2 sidecars, each mounting exactly one webroot rw |
| Gates | 17/17 |
| Rollback | script, **actually ran in 28 seconds** during a real incident |
