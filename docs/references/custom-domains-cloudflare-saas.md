---
description: Customer custom domains through Cloudflare for SaaS — the four steps to set up the zone for an environment (prod1 tracy.ai), the per-zone environment variables and token, the two labels banned as site labels, and how to check on the dev machine after merging.
sources:
  - apps/tracy-web/src/sites/site-domain-provider.js
  - apps/tracy-web/src/sites/address.js
  - apps/tracy-web/src/sites/label.js
  - apps/tracy-web/src/config.js
  - apps/tracy-web/src/cron.js
  - apps/tracy-web/src/db/migrations/083-site-custom-hostname.sql
  - deploy/.env.example
---

# Custom domains through Cloudflare for SaaS

The customer connects `www.<their name>` on the Connect domain card, adds **exactly two records** at their DNS provider
(any provider), and the site opens on that name over HTTPS with a valid certificate. No manual Tracy step
per name. How it works inside: [`SYSTEM.md`](../../SYSTEM.md), section "Cloudflare for SaaS".

| Record the customer adds | Value | What for |
|---|---|---|
| `CNAME www.<name>` | `<CONNECT_LABEL>.<SITE_DOMAIN>` (prod: `connect.tracy.ai`) | Brings the name into Tracy's zone; Cloudflare validates the name and issues the certificate itself (DCV `http`). If the customer's DNS is on Cloudflare, this record must stay **DNS only** (grey cloud): with the proxy on (orange cloud) the hostname stays `Pending Validation (HTTP)` / `Pending (Error)` (measured on the dev machine 10/10/2026: `www.genieos.ai` became `active/active` within minutes after the proxy was turned off). The Connect domain card says this at its foot (the `dns-only` line), right after the last-checked line |
| `TXT _tracy.www.<name>` | the token on the card | Proves the customer controls the name's DNS; Tracy only registers the hostname after seeing this record |

If Cloudflare asks for extra certificate-validation records (rare, when DCV `http` cannot run), the card shows
those records verbatim below the two lines above.

## 1. Before you start: two labels must not belong to any site

The CNAME target record (`connect`) and the fallback origin (`origin`) live in **the same zone** as customers' sites
(`<label>.tracy.ai`). Site labels are 6–30 characters long, so `origin`, `connect`, `origin-dev` are all valid labels.
This version bans the two labels in use (per `CLOUDFLARE_SAAS_CONNECT_LABEL` / `CLOUDFLARE_SAAS_ORIGIN_LABEL`,
default `connect` / `origin`, judged on the full label including `SITE_ADDRESS_PREFIX`) at the doors for creating sites, claiming and changing
a Tracy address — but it does **not** remove a site that already held them. Check first, read-only:

```sql
-- prod1: sudo docker exec -it tracy-postgres-1 psql -U tracy tracy   (container name depends on the machine)
select site_key, label from site where label in ('connect', 'origin');
select name, site_key, kind, state from site_name
 where name in ('connect.tracy.ai', 'origin.tracy.ai');
```

Any row → **stop** and tell the person in charge; change the label through the environment variable (and the name on the dashboard to
match) rather than taking a customer's name.

## 2. Four steps on the Cloudflare dashboard (zone `tracy.ai`, prod1)

Facts read on prod1 (09/10/2026): `SITE_DOMAIN=tracy.ai`, `TRACY_ORIGIN=https://cowork.tracy.ai`,
cloudflared runs under systemd with `tunnel run --token-file` (a dashboard-managed tunnel, no
`config.yml`), `tracy-web` listens on `127.0.0.1:51710`.

1. **Turn on Cloudflare for SaaS** for the `tracy.ai` zone: SSL/TLS › Custom Hostnames › Enable.
2. **A public hostname on prod1's tunnel**: Zero Trust › Networks › Tunnels › prod1's tunnel › Public
   Hostname › Add: `origin.tracy.ai` → `HTTP` `127.0.0.1:51710`. (The tunnel is dashboard-managed: add it on the
   dashboard, do not edit files on the machine.)
3. **Fallback Origin**: SSL/TLS › Custom Hostnames › Fallback Origin = `origin.tracy.ai`; wait for the
   **Active** status.
4. **CNAME `connect`**: DNS › Add record `CNAME connect → origin.tracy.ai`, **Proxied** (orange cloud).

Check: `dig +short connect.tracy.ai` returns Cloudflare addresses (a proxied record, the tunnel not exposed).

## 3. `tracy-web`'s environment variables (`deploy/.env` on the host)

| Variable | Value | Notes |
|---|---|---|
| `CLOUDFLARE_SAAS_ZONE_ID` | the `tracy.ai` zone id (32 hex characters) | the zone's Overview |
| `CLOUDFLARE_SAAS_TOKEN` | an API token **for that zone only**, permission `Zone › SSL and Certificates › Edit` | Its own token; do not reuse the tunnel's `CLOUDFLARE_TOKEN`. Never print it, never paste it into chat |
| `CLOUDFLARE_SAAS_CONNECT_LABEL` | leave empty (= `connect`) | Must match step 4 |
| `CLOUDFLARE_SAAS_ORIGIN_LABEL` | leave empty (= `origin`) | Must match steps 2–3; dev machine: `origin-dev` |
| `CLOUDFLARE_SAAS_API` | **leave empty** | Only for local stands; production refuses to start if it is set |

Both the zone and the token are needed. Neither set, or only one → Connect domain answers "not available on this server"
(`503 OWN_DOMAIN_UNAVAILABLE`), `tracy-web` still starts, and the checklist line names the missing variable; names connected
before keep working as in slice 1. The Release checklist (`/ops`) has two lines: `env-golive-cloudflare-saas`
(self-checking, only saying which names are missing) and `env-other-cloudflare-saas-zone` (the four steps above, checked by hand).

## 4. Known limits

- Apex names (`example.com`) are still refused in this slice.
- A hostname creation sent without an answer received (`HOSTNAME_UNCONFIRMED`): the next run asks by
  name; if a hostname with the same name exists Tracy does **not** adopt it (Cloudflare does not say who created it) — the
  operator looks on the dashboard and deletes it if it really came from that run (`select * from site_custom_hostname where
  state = 'posting'`); the sweep will create it again.
- A Cloudflare hostname already existing for that name that Tracy did not create for this reservation → `HOSTNAME_CONFLICT`,
  never taken over.
- Changing the zone (`CLOUDFLARE_SAAS_ZONE_ID`) while rows of the old zone remain: those rows stay put with
  `reason = 'ZONE_CHANGED'`, and the new zone's API is not called for them.
- The latest hostname read failed (Cloudflare did not answer, or answered something unreadable — including a list of
  validation records too long to show in full while the hostname still needs them) → `HOSTNAME_UNREAD`: the previously
  read state is not trusted until a read succeeds again; the connected name shows `pending` on the card (with the
  reason) but is still served.
- An assumption **not yet checked on real Cloudflare**: `GET …/custom_hostnames?hostname=<name>` only returns hostnames
  with exactly that name. If Cloudflare returns other names too, Tracy treats the answer as unreadable (the row stays
  put with `HOSTNAME_UNCONFIRMED`, not deleted, not recreated) — check it in the dev-machine run (section 5).
- Hostnames Tracy created that no row can carry any more (a creation answering late after another run had already
  taken the row) sit in `site_custom_hostname_orphan` and are deleted by id on each sweep; to follow:
  `select provider_id, name, reason, tries from site_custom_hostname_orphan;` (read-only).
- Page bodies through Cloudflare: slice 1's full-body digest measurement **has not been measured on a real zone** — see section 5.

## 5. Checking on the dev machine after merging into `develop` (done by the coordinator)

Dev: zone `tracy.site`, fallback origin `origin-dev.tracy.site` → set `CLOUDFLARE_SAAS_ORIGIN_LABEL=origin-dev`.

1. `dig +short connect.tracy.site` returns Cloudflare addresses (a record added by the operator — check it, do not trust it).
2. Connect `www.genieos.ai` to a published site; in the name's DNS add only the two records the card shows.
3. Nobody clicks anything: within minutes the card goes `Checking the domain` → `Live`. To follow:
   `select name, state, hostname_status, ssl_status, reason from site_custom_hostname;`
4. From outside the fleet: the home page, an inner page, an asset through `https://www.genieos.ai/…` — a valid
   certificate (`curl -sv`), no redirect to the Tracy address. Admin sign-in still works (at the Tracy address).
5. **Digest through Cloudflare**: the name's `probe_reading` must be `{"status":"ok"}`; if it is stuck at
   `PAGE_NOT_SITE` while both hostname and certificate are active, the zone is modifying page bodies (Email Obfuscation,
   Rocket Loader, minify) — record it in the journal.
6. Remove the name on the card: after the host removes the rule, the sweep deletes the hostname (`site_custom_hostname` back to empty) and the name
   stops answering.
7. Negatives: a name without DNS set stays `pending`; a name belonging to another site is refused with `NAME_TAKEN`; reclaiming
   a just-removed name while the old hostname is not yet deleted → `DOMAIN_RELEASING`.
