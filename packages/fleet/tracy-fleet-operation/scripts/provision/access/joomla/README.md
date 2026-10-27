# Tracy Access for Joomla

A Joomla system plugin that signs a coworker in to a **fleet clone** as themselves, from the
Cloudflare Access token that already proved they hold a seat. One authentication — the email code
Access asks for — and no second password, no shared admin login.

**This is not the cowork extension.** Claude Cowork
([TracyHQ/claude-cowork](https://github.com/TracyHQ/claude-cowork)) works on a customer's own
site, under a token they can revoke. This plugin does something else entirely: it creates users
and opens sessions, from a Cloudflare Access identity. It belongs on a clone and nowhere else,
which is why it lives here — beside the provisioning that is the only thing installing it — and
not in the repository a customer downloads an extension from.

```
Cloudflare Access (email code, seat book) ─► tunnel ─► clone origin
                                                          │
                                          plg_system_tracyaccess verifies the
                                          Cf-Access-Jwt-Assertion and logs the
                                          coworker in as their own Joomla user
```

## Why this exists

Before it, a coworker on `<label>.tracy.ai` passed Access with their seat email and then logged
into `/administrator` with the customer's admin password, shared by hand. The seat book governed
the outer door; inside was one password nobody could revoke. Now the seat book is the single
source of truth for both doors: pass Access, and you are logged in to Joomla as you.

## How it decides who you are

- The `Cf-Access-Jwt-Assertion` header is verified on **every** request — RS256 signature against
  the team's JWKS, this clone's `aud`, the team issuer, and expiry.
- The bare `Cf-Access-Authenticated-User-Email` header is **never** trusted on its own. A header
  is only as good as what signed it, and that one is signed by nothing.
- A valid token with **no `email` claim** is stood down, not honoured. That is what a service
  token looks like — Tracy's own reads authenticate that way, and a program must not have a
  Joomla user minted for it.
- Fail-closed throughout: anything unproven becomes the normal Joomla login screen, never a way
  in.

## What group people land in

`Manager` by default — the narrowest core Joomla group that can edit content in the backend. Not
Administrator: a clone is a full copy of the customer's site, password hashes and all, and
Administrator can install extensions and manage users, which is the power to walk off with the
lot. A seat is the right to do the work (ADR 0023), not the keys to the box. `Super Users` is
kept for Tracy's provisioning account and given to nobody through the door. The group is a param
for a site that genuinely needs more.

## Layout

| Path | What |
| --- | --- |
| `plg_system_tracyaccess/` | The system plugin, exactly as it lands on a clone: read the header, verify, log the coworker in. |
| `plg_system_tracyaccess/lib/AccessJwt.php` | RS256 + JWKS verification, pure PHP, **no library** — tested on its own. |
| `tests/run.php` | The verifier's tests. |

**Provisioning installs it over the package's copy.** The package below still carries the old,
header-trusting 0.1.4, so on every new site provision replaces those files with this directory right
after the package is installed (`../../strict-site-access.sh`), and every deploy does it again on
sites born that way (`tools/resync-joomla-access-plugin.sh`). From cowork v0.8.18 the plugin ships inside
`pkg_claudecowork` (`packages/plg_system_tracyaccess.zip`), which the Desk installs on a clone for
Apply and which a fleet-born site pulls in through `JOOMLA_EXTENSIONS_URLS`. So the artifact that
runs on a clone comes from `claude-cowork`, not from here — check a release before assuming this
directory is current; on 2026-08-29 it was two weeks and one file behind.
It lived in the claude-cowork repository until 2026-08-17, where a `build.sh` assembled it and
this repository kept a second copy under `provision/assets/` — one plugin in two places, already
drifting. Provisioning is the only thing that installs it, so provisioning owns it.

RS256 by hand rather than a JWT library because *which* library Joomla ships changes between
generations, and this plugin runs on whatever a clone happens to be.

## Test

```bash
php provision/access/joomla/tests/run.php
```

The tests mint real RSA keys and sign real tokens: a plugin that trusts the wrong token lets a
stranger into a copy of the customer's whole site, so the crypto is the one thing never mocked.

## Provisioning writes two params

Set at provision time, per clone:

- `team_domain` — e.g. `tracy-ai.cloudflareaccess.com`, used for the issuer and the JWKS URL.
- `aud` — this clone's own Access application tag. Per clone, so a token minted for one clone
  cannot be replayed against another's origin.
