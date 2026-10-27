# dsh-passwords

[简体中文](README.md) | English

<p align="center">
  <img src="docs/banner.jpg" alt="dsh-passwords" width="100%">
</p>

<p align="center">
  <a href="https://github.com/slywalker2006/dsh-passwords/releases/latest"><img src="https://img.shields.io/github/v/release/slywalker2006/dsh-passwords?style=flat-square" alt="Version"></a>
  &nbsp;
  <a href="https://github.com/slywalker2006/dsh-passwords/stargazers"><img src="https://img.shields.io/github/stars/slywalker2006/dsh-passwords?style=flat-square" alt="Stars"></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/dsh-passwords"><img src="https://img.shields.io/npm/v/dsh-passwords?style=flat-square" alt="npm"></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/dsh-passwords"><img src="https://img.shields.io/npm/dm/dsh-passwords?style=flat-square" alt="Downloads"></a>
  &nbsp;
  <a href="https://github.com/slywalker2006/dsh-passwords/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/slywalker2006/dsh-passwords/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  &nbsp;
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DSH-0.2.1--alpha.1-4c6ef5?style=flat-square&labelColor=454a54" alt="DSH"></a>
  &nbsp;
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License">
  &nbsp;
  <a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin"><img src="https://img.shields.io/badge/Awesome-DSH%20Plugin-9370db?style=flat-square" alt="Awesome DSH Plugin"></a>
  &nbsp;
  <a href="https://github.com/0xsline/awesome-deepseek-harness"><img src="https://img.shields.io/badge/Awesome-DeepSeek%20Harness-4c6ef5?style=flat-square" alt="Awesome DeepSeek Harness"></a>
  &nbsp;
  <a href="https://github.com/Zhiyuan-Fan/Awesome-DeepSeek-Harness-Plugins"><img src="https://img.shields.io/badge/Featured-Awesome%20Plugins-15aabf?style=flat-square" alt="Featured on Awesome DeepSeek Harness Plugins"></a>
  &nbsp;
  <a href="https://github.com/bruc3van/awesome-dsh-plugin"><img src="https://img.shields.io/badge/Featured-DSH%20Catalog-1c7ed6?style=flat-square" alt="Featured on DSH Catalog"></a>
  &nbsp;
  <a href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"><img src="https://img.shields.io/badge/Featured-1024%20Store-0ca678?style=flat-square" alt="Featured on 1024 Plugin Store"></a>
</p>

<p align="center">
  <strong>A server-grade authentication gateway that turns DeepSeek Harness into a multi-tenant platform</strong><br>
  <em>Login · Auto HTTPS · Multi-tenant permissions · Session grants · Audit & encryption · Bilingual UI</em>
</p>

<div align="center">

[Features](#features) · [Quick start](#quick-start) · [First-run setup](#first-run-setup) · [Uninstall](#uninstall) · [Automatic HTTPS](#automatic-https) · [Deployment topologies](#deployment-topologies) · [Configuration](#configuration-reference) · [FAQ](#faq) · [Security](#security-and-privacy) · [Contributing](#contributing)

</div>

---

## Features

- **Login**: first-run setup creates the owner account; every later visit goes through the login page; sessions last 12 hours
- **Automatic HTTPS**: issues and renews Let's Encrypt certificates, redirects port 80 to 443, zero configuration
- **Multi-tenant**: one owner plus any number of subusers; account management lives in the dsh settings page
- **Permissions and quotas**: workspace allowlists, per-session toggles, hourly token caps, daily time caps, three sandbox tiers, upload/download switches, ban
- **Session grants**: workspace permission no longer implies access to every session; the owner grants sessions individually; archive state stays consistent between workspace and session lists
- **Operator view**: the owner sees all workspaces and sessions and can download non-sensitive regular files
- **Auditing and security**: login rate limiting and lockout, audit log, SQLite encryption at rest, logout revokes sessions
- **Settings card**: patch reload, software updates, account and permission management, in-app messaging, bilingual zh/en UI

## Screenshots

| Login · Light | Login · Dark | Login · English |
|:---:|:---:|:---:|
| <img src="docs/screenshots/white-login.png" width="360"> | <img src="docs/screenshots/black-login.png" width="360"> | <img src="docs/screenshots/white-login-en.png" width="360"> |

| dsh main UI · signed in | Chat / Messaging | Settings card · Accounts |
|:---:|:---:|:---:|
| <img src="docs/screenshots/main-ui.png" width="360"> | <img src="docs/screenshots/chat.png" width="360"> | <img src="docs/screenshots/card-front.png" width="360"> |

| | Settings card · Permissions and quotas | |
|:---:|:---:|:---:|
| | <img src="docs/screenshots/card-back.png" width="360"> | |

## Quick start

### Prerequisites

Host installs need Node.js 22.19+ or 24+, a working dsh installation, git, and pnpm (required by the manual `node scripts/register-plugin.mjs` registration step; the one-liner installer installs pnpm automatically). The compatibility gate accepts only the DSH `0.2.1` patch line, `>=0.2.1-alpha.1 <0.2.2-0` (prereleases from alpha.1 up plus stable 0.2.1); the current working tree pins development and bundled Docker to `0.2.1-alpha.1`. The retired `0.1.x` / `0.2.0` lines, `0.2.1-alpha.0`, and every `0.2.2+` identity are rejected. Docker installs only need Docker Engine or Docker Desktop and a DeepSeek API key.

### Install

Five install methods, pick one. Host installs automatically install dependencies, build, generate a SETUP_KEY, register the dsh plugin and apply the remote-settings patch; an existing `.env` is never overwritten, so re-running is safe.

```bash
# 1. Linux / macOS one-liner
curl -fsSL https://raw.githubusercontent.com/slywalker2006/dsh-passwords/main/install.sh | sudo bash

# 2. Clone first, then install
git clone https://github.com/slywalker2006/dsh-passwords && cd dsh-passwords
sudo bash install.sh

# 3. npm global install, works on any platform
npm install -g dsh-passwords
dsh-passwords install
```

On Windows download `install.bat` from the repository and run it. The default install directory is `%USERPROFILE%\dsh-passwords`.

```bash
# 4. Docker: one command completes install and initialization
docker run -d \
  --name dsh-passwords \
  --restart unless-stopped \
  -e DEEPSEEK_API_KEY=sk-your-key \
  -e SETUP_KEY=your-own-strong-random-string \
  -p 127.0.0.1:3088:3088 \
  -v dsh-home:/data/dsh \
  -v dsh-passwords-state:/data/dsh-passwords \
  skywalker237234/dsh-passwords:2.7.7
```

Open `http://127.0.0.1:3088` in a browser and finish first-run setup with the `SETUP_KEY` you set. If you omit `-e SETUP_KEY`, the container generates a random key and writes it to `setup-key.txt` in the volume; read it with `docker exec dsh-passwords cat /data/dsh-passwords/setup-key.txt` before completing setup (the file is deleted automatically after setup succeeds). `-e SETUP_KEY` is written into the volume's `.env` as the initial SETUP_KEY on first initialization, so it never diverges from a random value and restarting without that env will not lock you out (after setup succeeds the SETUP_KEY in `.env` is rotated by the existing hardening flow; from then on you sign in with the account you created and no longer need it).

For advanced configuration such as custom ports, domains, SSH endpoints or third-party endpoint registration, copy `docker/.env.example` to `docker/.env` and add `--env-file docker/.env` (for Docker Compose, `docker compose --env-file docker/.env -f docker/docker-compose.yml up -d`); it is optional advanced configuration, no longer an install prerequisite. Do not reuse the host template at the repository root (`.env.example`): it injects a placeholder `SETUP_KEY` (`change-me-…`), `MCP_GATEWAY_PORT=443`, and an empty `MCP_GATEWAY_AUTO_TLS=`, overriding the image's built-in port `3088` and `MCP_GATEWAY_AUTO_TLS=0` — the container then never listens on `3088` and the gateway refuses to start; its relative `MCP_DB_PATH=./data/platform.db` also drifts away from the container default `/data/dsh-passwords/platform.db`.

A Docker deployment needs `DEEPSEEK_API_KEY` at minimum. Set `MCP_GATEWAY_PUBLIC_HOST` to the domain you actually use. The host publishes port `127.0.0.1:3088` only while the container listens on `0.0.0.0:3088`; terminate TLS on nginx or Caddy for public access. The image bundles DSH `0.2.1-alpha.1` (the pinned release of the DSH 0.2.1 patch line; image runtime acceptance has not been performed for this pin); initialization is complete when healthz and readyz both return `ok:true`.

Notes:

- Host installs default to `/opt/dsh-passwords`; override with `DSH_PASSWORDS_DIR`. A recognized existing dsh-passwords directory resumes the idempotent installer in place; another existing target aborts
- SETUP_KEY: a host install prints it when the install finishes and writes it to `setup-key.txt` in the install directory; Docker users set it with `-e SETUP_KEY`, or let it be generated and written to `setup-key.txt` in the volume when omitted
- The two Docker volumes hold the dsh profile and the `.env`, database and certificates; deleting them deletes your data
- Emergency cleanup does not self-delete from inside Docker. For Compose deployments run `docker compose down -v`; for the documented `docker run` deployment, run `docker rm -f dsh-passwords` followed by `docker volume rm dsh-home dsh-passwords-state` (both permanently remove volume data)
- For split-container deployments set `MCP_DSH_PATCH_ALLOW_BIND_ALL=1` on the dsh container so the gateway container can reach dsh web; `dsh-web-app` in `0.2.1-alpha.1` still rejects `--host 0.0.0.0` at startup, so this sub-patch is still required
- npm global install (method 3): the first Unix install needs `sudo` (automatic HTTPS must bind 80/443); Node managed by `nvm` / Homebrew is often missing from root's or the system PATH, so the `dsh-passwords` command may not be found; the npm global directory is replaced on package updates and is a poor home for long-lived `.env` and `data/` — prefer a clone install, or point `DSH_PASSWORDS_ENV_FILE` at a stable directory

### First-run setup

1. Start dsh: `dsh web`. Docker users skip this; the container starts it automatically.
2. Open `https://<server address>` in a browser; the first visit enters the setup page.
3. Enter the SETUP_KEY to create the owner account. Every later visit to this address goes through the login page.

After setup completes, `setup-key.txt` is deleted automatically and the keys in `.env` are consolidated and rotated.

Docker users open `http://127.0.0.1:3088` directly after the single command to complete first-run setup; for public access, proxy 80/443 to `http://127.0.0.1:3088` with nginx or Caddy yourself. The SETUP_KEY for setup is the value you passed to `-e SETUP_KEY`; when omitted, read it with `docker exec dsh-passwords cat /data/dsh-passwords/setup-key.txt`.

## Uninstall

For a host installation, run this from the dsh-passwords installation directory:

```bash
node dist/cli.js uninstall
# A global npm installation can also use:
dsh-passwords uninstall
```

The command removes only the `dsh-passwords` link and bundle from the DSH web profile, then rolls back dsh patches managed by this plugin. Other plugins and bundles remain in place. Restart `dsh-web` when prompted.

It does not delete the installation directory, `.env`, database, TLS/ACME certificates, or other plugins. If profile dependency reconciliation or patch rollback fails, the original profile is restored to avoid a partial uninstall. For Docker, stop and remove the deployment using its Compose or container configuration; do not remove named volumes unless you also intend to permanently erase data.

## Automatic HTTPS

By default the gateway detects the public IP and issues a 90-day Let's Encrypt certificate for `<IP>.sslip.io`, renewing automatically 30 days before expiry with hot reload. For your own domain set `MCP_GATEWAY_DOMAIN`. Issuance failure refuses to start and never falls back to plaintext; renewal failure keeps the still-valid old certificate and retries in the background.

| Code | Meaning | Action |
|---|---|---|
| 30 | Certificate issuance failed | Check 80/443 availability and that Let's Encrypt is reachable |
| 31 | No public IP or domain | Set `MCP_GATEWAY_DOMAIN`, or use HTTP mode |
| 32 | Port occupied | Change `MCP_GATEWAY_PORT` or free the port |

The `<IP>.sslip.io` name exists because Let's Encrypt does not issue certificates for bare IPs. Visiting the bare-IP https address warns about a hostname mismatch; entering through port 80 redirects to the correct address.

## Deployment topologies

| Scenario | Approach |
|---|---|
| Public server with 80/443 open | Default configuration, automatic HTTPS |
| Existing domain certificate | Set `MCP_GATEWAY_TLS_CERT` / `MCP_GATEWAY_TLS_KEY`; port 80 not needed |
| Existing nginx / Caddy reverse proxy | Terminate TLS at the proxy, set `MCP_GATEWAY_AUTO_TLS=0` and a high port, gateway listens on loopback only |
| Cloudflare | CF terminates TLS and forwards to origin, same approach as a reverse proxy |
| Internal network / bare IP without port 80 | Use HTTP mode |

http-01 validation only touches port 80 during issuance and renewal, about once every 60 days.

## HTTP mode

Plaintext HTTP is refused by default. When an internal-only deployment truly needs it:

```bash
node scripts/start-http.mjs [port]    # default 8080, asks for confirmation
```

Alternatively, set `MCP_GATEWAY_AUTO_TLS=0` and `MCP_GATEWAY_PORT=8080` in `.env`; the plugin starts the gateway in HTTP mode. This mode needs no public IP, DNS, ACME, or external CDN and is suitable for an internal network. The initial installation still needs npm/GitHub access, or a prepared project tarball, dependency cache, and local DSH installation. Model replies still require an upstream provider such as `DEEPSEEK_API_KEY`; without a model service, login, permissions, files, and administration remain available but model generation does not.

## The gate card in dsh settings

After signing in, open Settings to find the "dsh-passwords" card.

| Feature | Who | Notes |
|---|---|---|
| Patch reload | Owner only | Re-applies the patch and restarts the web service when a dsh upgrade breaks the settings page |
| Software updates | Status visible to all, actions owner only | Auto check, throttled download, idle-window install and restart, see below |
| Change password / username | Self; owner can act on anyone | Password change revokes all old sessions |
| Subuser management | Owner only | Create and delete subusers |
| Subuser permissions | Owner only | Workspace allowlist, per-session grants, token and time caps, sandbox tier, upload/download switches, WebSocket path grants, ban |
| Chat / messaging | All signed-in users | Tagged messages; subuser messages default to DMs to the owner, only the owner can broadcast |
| Sign out | All signed-in users | Ends the current session |

Passwords require at least 12 characters with upper, lower, digit and symbol.

## Software updates

- Version discovery uses GitHub Releases; packages always come from the npm registry, verified against the release's `dist.integrity` sha512
- Automatic mode: checks every 24 hours, downloads throttled after finding a new version, installs and restarts after the platform has been idle for one hour; the owner can install immediately
- Manual mode: check only discovers versions; the first click downloads, the second click installs and restarts
- Installs preserve `.env`, `data/`, the database, TLS material and the dsh profile; failures roll back
- Docker updates require explicit `MCP_DSH_DOCKER_SELF_UPDATE=1` plus the Compose variables; without them only host-side manual commands are shown. A Docker socket grants the container control of the host; enable only in trusted deployments

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `SETUP_KEY` | Generated by the install script (Docker can set it with `-e SETUP_KEY`) | First-run setup key; rotated automatically after setup succeeds |
| `MCP_JWT_SECRET` | Derived from SETUP_KEY | Session signing key; set independently with `openssl rand -hex 32` in production |
| `MCP_INTERNAL_SECRET` | Derived from SETUP_KEY | Gateway internal admin-API secret (used by the dsh plugin to notify the gateway), derived in a separate domain from the JWT; do not rotate it casually once set |
| `MCP_DB_PATH` | Host `./data/platform.db`; Docker `/data/dsh-passwords/platform.db` | SQLite database path; a relative path is anchored to the directory of the `.env` (the `DSH_PASSWORDS_ENV_FILE` directory), not the process working directory |
| `MCP_DB_ENC_KEY` | empty | Field encryption key; cannot be changed once set. Back up the database together with `.env` |
| `MCP_GATEWAY_HOST` / `MCP_GATEWAY_PORT` | `0.0.0.0` / host automatic HTTPS `443`, HTTP mode `8080`, Docker `3088` | Gateway listen address and port; the Docker image fixes `0.0.0.0:3088`, which the host maps to `127.0.0.1:3088` |
| `MCP_GATEWAY_UPSTREAM` | `http://127.0.0.1:3080` | dsh web address, pointed automatically |
| `MCP_GATEWAY_UPSTREAM_TLS_VERIFY` | on | Verify the upstream dsh certificate when it is HTTPS/WSS; `0` disables it (debugging only, never in production) |
| `MCP_GATEWAY_SSH_ENDPOINTS` | empty | Registry for legacy HTTP/WS host endpoints that are not observable through the DSH runtime. Rules use `[owner:][ws:\|http:]path`; both `owner:` and ordinary SSH/host entries are owner-only; a legacy `allowSsh` value cannot grant subuser SSH access. Normal DSH extension surfaces registered by the host are synchronized through a generic runtime manifest and are available without endpoint registration or `allow_ssh`; workspace/session authorization and terminal, host-execution, and plugin-management boundaries remain enforced. When `DSH_PASSWORDS_ENV_FILE` is set, the registry is hot-reloaded every 5 seconds; otherwise restart the gateway after editing. |
| `MCP_GATEWAY_REDIRECT_PORT` | `80` with automatic HTTPS; not listening when it is off | ACME validation and 301 redirect port; an explicit `0` disables it |
| `MCP_GATEWAY_DOMAIN` | empty | Custom domain; empty uses `<public IP>.sslip.io` |
| `MCP_GATEWAY_AUTO_TLS` | on for host installs; the Docker image fixes `0` | `0` disables automatic HTTPS (the container is plaintext by default, with an outer reverse proxy terminating TLS) |
| `MCP_GATEWAY_TLS_CERT` / `MCP_GATEWAY_TLS_KEY` | empty | Your own certificate, takes precedence over automatic HTTPS |
| `MCP_GATEWAY_PUBLIC_HOST` | empty | Fixed redirect target, guards against Host spoofing |
| `MCP_GATEWAY_ACME_EMAIL` / `MCP_GATEWAY_ACME_STAGING` | empty / off | Renewal contact email / LE staging |
| `MCP_DSH_ROOT` | auto-detected | dsh installation directory |
| `MCP_DSH_SETTINGS_FILE` | auto-detected | Path to the dsh `settings.yaml`; set it explicitly when the gateway and dsh are not on the same machine. Empty probes candidates such as `DSH_HOME/settings.yaml` |
| `MCP_DSH_RESTART_SERVICE` | Linux `dsh-web`; Windows empty | systemd service restarted after patch reload; on Windows, restart DeepSeek Harness manually after an update |
| `MCP_DSH_AUTO_UPDATE` | on | Deployment-level auto-update master switch |
| `MCP_DSH_UPDATE_MAX_BPS` | 1MiB/s | Automatic download throttle; can only be lowered |
| `MCP_DSH_DOCKER_SELF_UPDATE` / `_COMPOSE_DIR` / `_COMPOSE_FILE` / `_IMAGE` / `_SOCKET` | off / empty | Docker in-app update switch and Compose settings |
| `MCP_DSH_PATCH_ALLOW_BIND_ALL` | off | Allows dsh web to bind 0.0.0.0 for split-container topologies (`dsh-web-app` in `0.2.1-alpha.1` still needs the sub-patch) |
| `DSH_PASSWORDS_ENV_FILE` | empty | Explicit `.env` path |

Environment-variable vs `.env` precedence differs by install method: in Docker the container environment (`--env-file docker/.env`) overrides the `.env` inside the volume; on a host install it is the opposite — managed keys in the deployment `.env` override same-named variables inherited by the process.

## Common commands

```bash
node dist/cli.js audit --limit 20        # last 20 audit entries
node dist/cli.js patch status            # remote-settings patch status
node dist/cli.js patch                   # reload patch and restart dsh-web
node dist/cli.js serve-gateway --port 9000   # start the gateway manually
DSH_PASSWORDS_NO_AUTOSTART=1 dsh web     # keep the gateway from auto-starting
curl -s https://address/gateway/healthz      # liveness check
curl -s https://address/gateway/readyz       # readiness check, includes database
```

## FAQ

<details>
<summary><strong>The login page keeps showing first-run setup</strong></summary>

The users table is empty; enter the SETUP_KEY to recreate the owner account.

</details>

<details>
<summary><strong>Forgot the owner password</strong></summary>

Stop the service, clear the users table and restart:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/platform.db');db.exec('DELETE FROM users;')"
```

</details>

<details>
<summary><strong>Exit codes 30 / 31 / 32</strong></summary>

See the table under "Automatic HTTPS".

</details>

<details>
<summary><strong>Binding 443 fails as non-root</strong></summary>

Ports below 1024 require root on Linux; switch to a high `MCP_GATEWAY_PORT` and forward as needed.

</details>

<details>
<summary><strong>dsh reports duplicate loader entry id</strong></summary>

`dsh plugin add` adds every bundle-declaring dependency to the bundles layer and conflicts. Uninstall and register precisely with `node scripts/register-plugin.mjs`.

</details>

<details>
<summary><strong>npm install of dsh fails on node-pty builds</strong></summary>

Allow install scripts and reinstall:

```bash
npm config set allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs --location=user
```

</details>

<details>
<summary><strong>Is a stolen database file a problem</strong></summary>

No. Sensitive fields are encrypted or hashed, passwords exist only as bcrypt hashes, and decryption requires the `.env` keys.

</details>

<details>
<summary><strong>Can MCP_DB_ENC_KEY be rotated</strong></summary>

No; changing it makes all existing data undecryptable.

</details>

<details>
<summary><strong>Plugin loading is slow / access feels slow</strong></summary>

The gateway force-caches content-hashed static assets for one year; the first visit after an upgrade downloads fully once, later loads are instant. The gateway adds about 1-2ms per request; check the TLS handshake first:

```bash
curl -so /dev/null -w "TLS:%{time_appconnect}s\n" https://address/gateway/login
```

The bottleneck is usually the network path to the server.

</details>

## Manual install

> Release 2.7.7 supports only the DSH `0.2.1` patch line (`>=0.2.1-alpha.1 <0.2.2-0`), with development and bundled Docker pinned to `0.2.1-alpha.1`. The retired `0.1.x` / `0.2.0` lines, `0.2.1-alpha.0`, and every `0.2.2+` identity are rejected by the version gate. The installer requires Node.js `22.19+` or `24+`, registers the plugin, detects dsh, and applies the compatibility patch.

1. `git clone https://github.com/slywalker2006/dsh-passwords && cd dsh-passwords`
2. `npm install && npm run build`
3. `cp .env.example .env` and set SETUP_KEY to `openssl rand -hex 24`
4. `node scripts/register-plugin.mjs` to register the plugin
5. `node dist/cli.js patch` to apply the patch; set `MCP_DSH_ROOT` if the dsh directory is not found

Then start dsh, the gateway comes up automatically, and "First-run setup" finishes initialization.

## Security and privacy

Passwords are stored only as bcrypt hashes; usernames, IPs and audit records are encrypted at rest; certificate issuance failure refuses to start the gateway.

- Failed-login lockout backs off per round from 1 to 60 minutes; the owner account cannot be globally locked out by rotating IPs
- 30 failures from one IP within 15 minutes trigger a 30-minute IP-level throttle, countering cross-username password spraying
- Logout revokes the token server-side; password and username changes invalidate all old sessions
- Third-party plugin operator endpoints are owner-only; uploads and downloads are permission-gated and new subusers start with downloads disabled
- Request timeouts and connection limits mitigate slowloris; path normalization blocks `%2f` and double-encoding variants
- After first-run setup the system deletes `setup-key.txt` and consolidates independent secret variables automatically

## Language

The UI is bilingual zh/en and follows the dsh language setting. The login page has a manual switch that persists; the CLI follows `LANG` / `LC_ALL`.

## Version compatibility

Current release: 2.7.7. Development and bundled Docker default to the resolved runtime DSH `0.2.1-alpha.1` — the latest identity published on the npm `0.2.1` patch line (the `alpha` dist-tag), and the exact version the nine `@deepseek-ai/dsh*` dev dependencies resolve and lock to. The declared dev range is `>=0.2.1-alpha.1 <0.2.2-0`, which accepts `0.2.1-alpha.1` and later alpha/beta/rc prereleases plus stable `0.2.1`, and rejects the retired `0.1.x` / `0.2.0` lines, `0.2.1-alpha.0`, and every `0.2.2+` identity; because npm has published only `0.2.1-alpha.1` on that line, accepting the later prereleases and the stable release is only a SemVer-range and version-identity claim — no `0.2.1` build has been run or passed full gateway acceptance. The npm package ships prebuilt dist, TypeScript sources, and all scripts; Docker and npm are built from the same source revision.

## Contributing

- Before opening an issue, read the [community checklist](docs/community-checklist.md) and use the [bug](.github/ISSUE_TEMPLATE/bug_report.md) or [feature](.github/ISSUE_TEMPLATE/feature_request.md) template
- For code contributions, read [CONTRIBUTING.md](CONTRIBUTING.md) and use the [PR template](.github/PULL_REQUEST_TEMPLATE.md); keep changes focused and include test evidence
- Run `npm ci && npm run build && npm test` before submitting; CI runs automatically on Node 22/24

## Contributors

<a href="https://github.com/slywalker2006/dsh-passwords/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=slywalker2006/dsh-passwords" />
</a>

<div align="center">

**If you find this useful, give it a star.**

[Report an issue](https://github.com/slywalker2006/dsh-passwords/issues) · [Releases](https://github.com/slywalker2006/dsh-passwords/releases) · [npm package](https://www.npmjs.com/package/dsh-passwords) · [Awesome listings](https://github.com/0xsline/awesome-deepseek-harness#security--governance)

</div>

## License

[GNU GPL v3.0 only](https://www.gnu.org/licenses/gpl-3.0.html), full text in [LICENSE](LICENSE).

This project is an independent extension of dsh and is not affiliated with DeepSeek.
