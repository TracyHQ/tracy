# Clone auto-login

The CMS-side half of a coworker signing in to a clone. Cloudflare Access already asked for the
email code and proved the seat; this is what turns that proof into a session in the CMS itself,
so nobody types a second password and no admin login is shared by hand.

| Path | Installed as |
| --- | --- |
| `joomla/` | `plugins/system/tracyaccess` — a system plugin. **Provisioning does not install it:** it ships inside `pkg_claudecowork` from v0.8.18, so the one Tracy package carries both the write component and the auto-login (ADR 0085). What is here is the source and its tests, not the artifact that lands on a clone. |
| `wordpress/tracy-access.php` | `wp-content/mu-plugins/tracy-access.php` — always on, and not switchable off from the admin. |

**Every new site gets the signed verifier.** The package's copy is still the old, header-trusting
0.1.4, so provision replaces its files with `joomla/plg_system_tracyaccess` right after installing the
package (`../strict-site-access.sh`, stage 6c½) and marks the site born strict
(`.site-access/<label>/strict.json`); the resync tools, which every deploy runs, keep it there after a
Cowork update puts 0.1.4 back.

**Only ever on a clone.** WordPress's is installed by `platform_install_access` in
`../platform/wordpress.sh`, which `provision.sh` calls at stage 6b. Joomla has no such function —
that is deliberate, and `platform/joomla.sh` says so where the function would have been.

🔒 This paragraph used to claim `platform_install_access` installed both, and it sent someone to
write the missing Joomla half on 2026-08-29 — a second copy of a plugin `pkg_claudecowork` already
carries, which is the exact "one plugin in two places, already drifting" this directory exists to
have ended. Reverted the same day. The code comment was right and this file was stale; when the two
disagree, believe the one next to the behaviour. They create users and open sessions from a
request header, which is exactly right on a copy behind Cloudflare Access and exactly wrong
anywhere else. A customer's own site gets Claude Cowork
([TracyHQ/claude-cowork](https://github.com/TracyHQ/claude-cowork)) and never this.

The two platforms share no code, on purpose — Joomla fires `onUserLogin`, WordPress sets an auth
cookie, and a verifier small enough to own twice is cheaper than coupling them. What they do share
is the trust model: the `Cf-Access-Jwt-Assertion` header is verified (RS256 against the team's
JWKS, this clone's `aud`, the team issuer, expiry) on every request, the bare
`Cf-Access-Authenticated-User-Email` header is never trusted on its own, and a valid token with no
`email` claim is a service token that must never have a CMS user minted for it.

No build step: what is in these directories is what lands on the clone.

```bash
php provision/access/joomla/tests/run.php    # 15 tests, real RSA keys, real signatures
```
