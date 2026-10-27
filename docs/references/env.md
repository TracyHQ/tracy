---
description: Every environment variable TCH needs — which file for which profile, which values are generated, which must be requested, and what fails silently when missing.
sources:
  - .env.example
  - .env.native.example
  - deploy/.env.example
  - vendor/tracy/dsh-passwords/src/config.ts
  - .npmrc
---

# Environment variables — newcomers start here

> 🔒 **This document describes `workers/` — a system ABOUT TO RETIRE, not the system running on your machine.**
> The `feat/tracy-web` branch replaces the seven Cloudflare Workers with `apps/tracy-web` + `apps/tracy-host`
> running in Docker. Production still runs exactly as this document says until Plan 5 cuts over, so
> it is not wrong yet — but setting up a dev machine by it takes the wrong road. To run the whole system on one machine:
> [`running-tracy-locally.md`](running-tracy-locally.md), and its environment variables are in `deploy/.env.example`.



This repo **keeps no secrets**. What is committed is **empty templates** (`*.example`); the
real copies live outside git and stay on the machine that created them.

The most commonly misunderstood point: **most keys are generated**. A newcomer only has to type exactly **one**
value per profile (`SETUP_KEY`), and then `dsh-passwords` writes the other three keys back into the file itself.
The "must request" list in §3 is much shorter than the env files make it look.

## 1. Setting up a new machine — four steps

```bash
cp .env.example .env                       # the web profile
cp .env.desktop.example .env.desktop       # only when running the desktop profile
cp .env.native.example  .env.native        # only when running the native profile

# a SEPARATE SETUP_KEY for each file just copied
openssl rand -hex 24

# DB path: replace /ABSOLUTE/PATH/TO/TCH with your own checkout
```

The private registry retired on 06/09, so **there is no longer any token to add to `~/.npmrc`**. The repo's
`.npmrc` only has npmjs; what npmjs lacks — `@deepseek-ai/*@0.1.3-alpha.1-tracy.1` and the four
forked plugins — are **workspace members** of this repo. The hard condition moved rather than
disappeared:

```
git submodule update --init   # vendor/tracy/deepseek-harness IS the source of @deepseek-ai/*
pnpm dsh:build                # builds lib/ — MUST come before `pnpm install`, see CLAUDE.md §5
pnpm install                  # npmjs, no token
```

## 2. One env file PER profile — and this is why

`dsh-passwords` declares the gateway port **in the env file**, not through a flag. Two profiles sharing one
file means two password gates claiming one port: the second dies with `EADDRINUSE` and shuts itself down,
while its dsh keeps serving normally — the browser gets 401 and it **looks exactly like it is working**.

| File | Profile | Password port | dsh behind it |
|---|---|---|---|
| `.env` | `web` | 51711 | 51710 |
| `.env.desktop` | `desktop` | 51721 | 51720 |
| `.env.native` | `native` | 51731 | 51730 |

The full map (which surface is where, which bundle):
[`profile-map.md`](profile-map.md).

## 3. What is generated, what must be requested

**Generated — leave EMPTY on a clean checkout.** `MCP_JWT_SECRET`, `MCP_INTERNAL_SECRET`,
`MCP_DB_ENC_KEY` are derived from `SETUP_KEY`, and after the first successful setup
`dsh-passwords` **pins them into the env file itself** and rotates `SETUP_KEY` to a new value
(F-07, `vendor/tracy/dsh-passwords/src/config.ts`). Fill them by hand only when restoring an existing
database: changing `MCP_DB_ENC_KEY` makes the old data undecryptable.

**Must be requested from Lee — no guessing, no inventing:**

| Key | Where | Why it cannot be generated |
|---|---|---|
| `TRACY_VENDOR_TOKEN` | a GitHub repo secret (`gh secret set TRACY_VENDOR_TOKEN --repo TracyHQ/tch`) | ONLY CI needs it. `vendor/tracy/deepseek-harness` is a DIFFERENT private repo and since 06/09 it is the SOURCE of `@deepseek-ai/*`; the default `GITHUB_TOKEN` cannot read it, so without this key CI dies at the checkout step |
| `FLEET_ACTOR_SECRET` | `.dev.vars` of `cowork`, `fleet-bar`, `seat-registry` | signs identity attestations for **every** person on **every** site; both ends must match |
| `SHOPIFY_CLIENT_ID/SECRET` | `.dev.vars` of `seat-registry` | Tracy's Shopify app, shared by every customer store |
| `MCP_TRACY_ACTOR_SECRET`, `MCP_SEAT_SECRET` | `.env.native` | only needed when connecting a local `native` profile to real Tracy seats |
| `APPLE_*` | `.env.apple-notary` | only whoever signs the macOS build needs it |
| `GITHUB_HOST_APP_*` | `.env.github-app` + a `.pem` in `.secrets/` | writing to customer repos goes through the GitHub App, not a `gh` login |

A wrong key in this table does **not** produce a named error: the symptom is a 401, or a door that silently
does not open. Do not fill in random values "to try it".

## 4. Workers: `.dev.vars` is only for `wrangler dev`

Production loads secrets with `wrangler secret put` and **does not read** `.dev.vars`. Three Workers need
that file — `cowork`, `fleet-bar`, `seat-registry` — and each has a `.dev.vars.example` next
to it. Secrets shared between the fleet and a Worker (`FLEET_BUILD_SECRET`, `FLEET_RELAY_SECRET`,
`WEBHOOK_SECRET`, `FLEET_ACTOR_SECRET`) must be set **at both ends in one go**: `wrangler
secret put` plus the matching line in `/etc/tracy/hooks.env` on the fleet.

Without `.dev.vars`, `wrangler dev` still runs — it only returns 401 exactly where a signature is needed. That is
why the empty templates are committed: to know what a Worker **wants** before losing an afternoon measuring.

## 5. What works without any env

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:workers`, `pnpm docs:check-links` read no
env file — they only need the three steps of §1 to work, and none of those steps needs a secret. The
`boot-graph` gate is the only gate booting real dsh, and it needs a materialised profile
(`tch/profiles/<profile>/node_modules`, gitignored) — `node scripts/materialize-profile.mjs`,
or `./run.sh`/`./dev.sh` runs it itself — not secrets.
