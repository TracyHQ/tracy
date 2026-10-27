# Common setup — dev (`https://cowork.tracy.site`)

Replaces the "Common setup (every case)" section of [`README.md`](README.md) when the stand is the **real develop
environment** (the dev machine `<dev-host>`, reached over the team VPN), not the local stand `scv2`. A case's
"Common setup" step means this file. The runner loads it with `--common`:

```
node tests/regression/run.mjs --stand https://cowork.tracy.site --common tests/regression/common-dev.md \
  --cdp http://127.0.0.1:9391 --commit <dev commit> --id REG-057
```

`<dev commit>` = `ssh <dev-user>@<dev-host> 'sudo docker exec tracy-dsh printenv TRACY_SOURCE_COMMIT'` (the label may
be stale — cross-check with `gh run list --branch develop`). That commit must exist in the checkout (`git fetch origin`).

## 🔒 Write scope on dev

Dev is a machine the whole team shares (other people's sites, other people's dsh sessions, one dsh for every site).

- **Write only to the sites `e2e-wp`, `e2e-jo`, `e2e-em`** (`.tracy.site`), and only through Tracy's HTTP doors (with
  a seat cookie), the browser, or — when the case's step says so — `docker exec` into **that site's own containers**
  (`e2e-jo-web-1`, `e2e-jo-db-1`, `e2e-em-web-1`).
- **Never**: INSERT/UPDATE/DELETE Tracy's Postgres (`pq` is SELECT/WITH only; the helper refuses anything else);
  restart, stop or `rm` a container; `docker compose`; edit files in `/etc/tracy`, `/opt/tracy-fleet`, or
  **`/srv/tracy/host-dsh/home`** (the dsh home shared by EVERY site — a case that must write or delete there is
  `BLOCKED` `dsh-home-shared`); touch a site that is not `e2e-*` (`e2e04-*`, `e2ef-*`, `e2econtract*`… belong to other sessions).
- `docker exec` into `tracy-dsh`, `tracy-tracy-web-1`, `tracy-tracy-host-1` only to **read** (`grep`, `test -f`,
  `node -p` reading a file). The one exception: a case that says to `docker cp` a repo script into `tracy-dsh:/tmp/`
  and run it against an `e2e-*` site — allowed; the file name carries `reg<NNN>` so it can be recognised.
- ⚠ **`e2e-wp` is shared** with another agent (journeys J5–J11 chat, comment and invite people there). On `e2e-wp`:
  **no** Restore, **no** change of the site address (Settings › Site URL), **no** Undo all. A case that only runs on
  WordPress and needs one of those three, or needs a "clean" count of changes/badges that other people's work would
  disturb → `VERDICT: BLOCKED` with `shared-site e2e-wp`; **do not** bend the case to pass. A case for `any` CMS or
  with `jo`/`em` → pick `e2e-jo` or `e2e-em`.

## Values

| Name | Dev value |
|---|---|
| `O` (= `ORIGIN`) | `https://cowork.tracy.site` |
| `COOKIE_DOMAIN` | `.tracy.site` (cookie `secure: true`) |
| `PG` `WEB` `HOST` `DSH` | `tracy-postgres-1` `tracy-tracy-web-1` `tracy-tracy-host-1` `tracy-dsh` — on the dev machine, through `ssh` + `sudo docker` |
| `PRIV` | `/srv/tracy-private` on the dev machine (backups in `$PRIV/<label>/backups/`); read with `dev sudo ls …` |
| dsh-home | `/srv/tracy/host-dsh/home` on the machine = `/desk-home` in `tracy-dsh` — **read-only** |
| `A` | `e2e-a@example.test` — owner of `e2e-wp`, `e2e-jo`, `e2e-em` |
| `B` | `e2e-b@example.test` — editor of `e2e-jo`, `e2e-em` (invited 04/10 for lane 1); on `e2e-wp` only if `GET /api/sites` with cookie B shows it |
| `C` | `e2e-c@example.test` — developer on `e2e-jo` (invited 04/10 so `e2e-jo` has two people besides A). `POST /api/team/invite` does not accept a `viewer` role (`TEAM_ROLES` = admin/developer/editor) — a case that needs `seat:viewer` is `BLOCKED` with `no-viewer-role` |
| `tracy_admin` seat | `$ADMIN_EMAIL` (owner of `tracy_admin`), cookie `admin` — only for `/ops`, `/api/ops/*`, `/api/ui` |
| `Q` | `~/TCH-local/e2e-dev` (chmod 700, outside the repo) — cookies `cookie-<a|b|c|admin>.txt` already minted |
| the case's site | site key `<label>.tracy.site`: `e2e-wp.tracy.site` WordPress, `e2e-jo.tracy.site` Joomla, `e2e-em.tracy.site` EmDash; container `<label>-web-1` (WP/Joomla also have `<label>-db-1`, MariaDB) |
| chat door | `$O/<full siteKey>/` (`/e2e-wp.tracy.site/`); a short label (`/e2e-wp`) → 404, `api … /api/sites/e2e-wp/…` → 403 |

## Helpers

On the machine that runs these cases the lines below are ready-made: `source ~/TCH-local/e2e-dev/env-reg.sh` (it
loads lane 2's `env.sh` and adds the rest; its `site()` refuses containers that are not `e2e-*`). Every new shell call
must `source` it again. `DEV_HOST`, `DEV_USER` and `ADMIN_EMAIL` come from that file.

```
Q=$HOME/TCH-local/e2e-dev; O=https://cowork.tracy.site
dev() { ssh -o ConnectTimeout=15 "$DEV_USER@$DEV_HOST" "$@"; }   # the dev machine; every docker call needs sudo
# Cloudflare sits in front of cowork.tracy.site: a curl without a browser UA may be blocked
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
api() { # api <a|b|c|admin|tag> <METHOD> <path> [json]  -> body, then a line "HTTP <code>"
  local C D; C=$(cat $Q/cookie-$1.txt); D=(); [ -n "${4-}" ] && D=(--data-binary "$4")
  curl -s -m 300 -w '\nHTTP %{http_code}\n' -X "$2" -H "Cookie: tracy_sess=$C" -H "Origin: $O" \
    -H 'Content-Type: application/json' -H "User-Agent: $UA" "${D[@]}" "$O$3"; }
pq() { # SELECT/WITH ONLY; tab-separated columns
  case "$1" in [Ss][Ee][Ll][Ee][Cc][Tt]*|[Ww][Ii][Tt][Hh]*) ;; *) echo "REFUSED: not SELECT" >&2; return 2;; esac
  printf '%s\n' "$1" | dev "sudo docker exec -i tracy-postgres-1 psql -U tracy -d tracy -At -F '	'"; }
dsh() { printf '%s' "$1" | dev 'sudo docker exec -i tracy-dsh sh'; }            # read: dsh "grep -c X /desk-home/…"
web() { printf '%s' "$1" | dev 'sudo docker exec -i tracy-tracy-web-1 sh'; }    # read: web "grep -c X /opt/tracy-web/src/…"
host() { printf '%s' "$1" | dev 'sudo docker exec -i tracy-tracy-host-1 sh'; }  # read
site() { printf '%s' "$2" | dev "sudo docker exec -i $1 sh"; }                 # site e2e-jo-web-1 "php …" (e2e-* only)
em() { # EmDash, read-only: em <label> "<SQL>"
  printf '%s' "$2" | dev "sudo docker exec -i -w /app $1-web-1 node -e 'const D=require(\"better-sqlite3\");let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.stringify(new D(\"/app/data/data.db\",{readonly:true}).prepare(s).all())))'"; }
mint() { # mint <tag> <email> — machine seats only; NEVER prints the cookie
  case "$2" in e2e-[abc]@example.test|"$ADMIN_EMAIL"|reg[0-9][0-9][0-9]-*@example.test) ;; *) echo REFUSED >&2; return 2;; esac
  dev "sudo docker exec tracy-tracy-web-1 node --input-type=module -e \"import {mintSession} from '/opt/tracy-web/src/lib/session.js'; process.stdout.write(await mintSession(process.argv[1], process.env.SESSION_SECRET.split(',')[0]))\" $2" > $Q/cookie-$1.txt
  chmod 600 $Q/cookie-$1.txt; }
```

- **Commands inside a container**: a case's `docker exec $DSH <cmd>` → `dsh '<cmd>'`; `docker exec $WEB` → `web`;
  `docker exec $HOST` → `host`; `docker exec <L>-web-1` → `site <L>-web-1 '<cmd>'`. Pass the command over **stdin** as
  above; do not splice it into the `ssh` line (ssh joins the arguments and the remote shell splits them again — quotes get lost).
- **Cookies**: use the ready `cookie-a/b/c/admin.txt`; mint only when a case says to create a new address
  (`reg<NNN>-<seconds>@example.test`). Check: `api a GET /auth/me` → `HTTP 200`.
- A `node --test` a case says to run (a unit seam) runs **in this checkout** — it measures the checkout's code, not dev;
  say so in the observation line. A worktree needs each package's `node_modules` (symlinked from the main checkout);
  without them the seam goes red with `Cannot find package` — an environment fault, `BLOCKED`, not `FAIL`.
- `curl -w '%{redirect_url}'` always prints an **absolute** URL (curl joins the origin itself). What a case says about
  where tracy-web redirects (a "root-relative" location) is read from the `Location` header: `curl -s -D - -o /dev/null …`.

## Browser

- This run's Chrome: `CHROME_WATCH_PORT=9391 chrome-watch` (it stops after 30′ with nobody connected — `--status`,
  then start it again), connect with `chromium.connectOverCDP('http://127.0.0.1:9391')` using the repo's Playwright
  (`node_modules/.pnpm/playwright@*/node_modules/playwright`). **No** `chromium.launch()`, **do not** use ports 9222/9390
  (other sessions'). A case that names its own stand's port (`CHROME_WATCH_PORT=9380`…) → still use **9391**.
- One fresh `browser.newContext({locale:'en-US', colorScheme:'light', viewport})` per seat, then
  `addCookies([{name:'tracy_sess', value, domain:'.tracy.site', path:'/', httpOnly:true, secure:true, sameSite:'Lax'}])`.
  **Do not** close the page/context/browser — just let the script exit.
- Opening a site: `goto($O + '/<siteKey>/')`; the rest (opening Site changes, finding a row, sending a chat with `fill`)
  as in README § Common setup, with `O/<S>` replaced by `O/<siteKey>/`.
- Browser errors of the run: `CHROME_WATCH_PORT=9391 chrome-watch --errors --since 10m` (machine time, no time zone).

## Model

Dev's dsh has a `MODEL_API_KEY` (real DeepSeek, the same model dev users share). A chat turn that returns `QUOTA`/402 →
`BLOCKED` with `model-quota`.
