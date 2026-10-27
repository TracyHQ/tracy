---
name: joomla-upgrade-run
description: >-
  Use when the job is updating Joomla or its template, installing an extension, or any upgrade on a
  live Joomla site: which copy a call writes to, what to snapshot, how to prove each step.
version: 1.0.0
platforms: joomla
provenOn: fijitrips.example
---

# Upgrading a Joomla site, without discovering afterwards that you did it to the wrong one

Every step below was paid for on fijitrips.example on 2026-09-07. The expensive lessons are the
first two.

## 1. Decide WHICH COPY before you decide anything else

`tracy_site` writes to the endpoint the seat book has registered for the site. For a site
**imported from a customer's own hosting, that endpoint is their LIVE site** — the one their
visitors are on right now. There is usually also a working copy on the fleet at
`https://<label>.tracy.ai/`, and it is a genuinely separate database.

So the first call of any upgrade job carries `target`:

```
tracy_site {"action":"info","target":"https://<label>.tracy.ai/"}
```

Omit it and you are editing production. On fijitrips an `extension.install` and an 80-table
`db.snapshot` went to the live site before anyone noticed.

**Say out loud which copy you are on, in your first message to the person**, and keep `target` on
every call for the rest of the session. Half a job on staging and half on live is worse than
either.

## 2. Prove which copy answered. `info` cannot tell you

Two copies of one site report the same Joomla version, the same component version, often the same
PHP. `info` coming back identical proves nothing.

Use a **fingerprint**: something that exists on exactly one copy.

- `db.tables` and count the tables. A copy that has been snapshotted carries
  `_tracy_snap_<tag>__*` tables; the other does not.
- Row counts differ where a live site has traffic: `session` with 15,000 rows against 10 is not
  two copies of one moment, it is the live one and the quiet one.

Do this once at the start, and again after the first write. It costs two read calls.

## 3. Order of operations

```
1  component     bring com_claudecowork up to date first — db.snapshot may not exist on the old one
2  db.snapshot   no `tables` parameter, so it covers everything; keep the tag
3  extensions    framework/plugin first, then the template that renders through it
4  core          core.upgrade, two calls
5  files         sitemap.xml, robots.txt, configuration.php
```

Step 1 has a **chicken-and-egg**: upgrading the component itself is the one write you cannot
snapshot first, because the verb that takes snapshots ships *in* the version you are installing.
That is survivable for a component upgrade (it adds files and a few `#__extensions` rows, and it
is in the undo log), and it is NOT survivable for anything that touches schema. If a future
component version changes schema, get a snapshot by another road first.

## 4. `core.upgrade` is two calls, not one argument

```
tracy_site {"action":"core.upgrade","to":"6.1","step":"prepare","target":…}
tracy_site {"action":"core.upgrade","to":"6.1","step":"finalise","target":…}
```

`prepare` downloads and extracts; the process that did it is still running the OLD code and
cannot finalise against class signatures it never loaded. `finalise` runs on the code the NEXT
call loads. `to` is a launch point (`4.4`, `5.4`, `6.1`), not a patch version — a site on 6.0.3
goes `to: "6.1"` and lands on 6.1.3.

## 5. `extension.install` refuses most real download URLs

It takes an `https` URL whose **path ends in `.zip`**, and nothing else. That rules out almost
every vendor's updater endpoint, because those look like
`https://update.example.com/download.php?element=…&version=…` — https, but the path has no
extension. Joomla names the downloaded file after the URL and then cannot detect a manifest.

The way through, and it is legitimate for commercial software the customer has licensed:

```
1  curl -L -o .webroot/tmp-<name>.zip '<vendor URL with its query string>'
2  check it really is a zip of the size you expect
3  extension.install url https://<label>.tracy.ai/tmp-<name>.zip
4  DELETE the temporary zip
```

Step 4 is not tidiness. While that file sits in the webroot, anyone who guesses the URL can
download the customer's paid software.

⚠ Some vendors gate downloads by subscription. JoomlArt serves `plg_system_t4` to anyone but
answers a template request with `{"error":"Your account does not have enough permission…"}`. Read
the body before assuming a 200 is a package: that error arrives as HTTP 200 with
`content-type: application/json`.

## 6. A 200 on the front page proves almost nothing

A coming-soon plugin, an offline switch, or a maintenance page all short-circuit output long
before the template renders. On fijitrips the front page answered 200 with a complete HTML
document after the core hop, and it was the coming-soon splash — the template had not run at all.

Measure the render, not the status:

- **byte size** — 8 KB against 61 KB is the difference between a splash and a site
- **template markers** — `t4-*` classes, `templates/<name>/` asset paths
- **absence of the gate** — zero matches for the plugin's own name

If a gate is in the way and you need the real answer, `extension.enable` turns it off, and the
same `apply_id` turns it back on. That pair is one reversible apply. Do it on the working copy,
never to find out something on live.

## 7. What the platform serves is not always what is on disk

On `*.tracy.ai` the edge serves its own `robots.txt` — `Disallow: /`, plus AI-crawler blocks —
and ignores the file in the webroot. That is deliberate and correct: a working copy must not be
indexed. But it means **a `Sitemap:` line you add on a working copy cannot be verified there**.
Write it, say plainly that it is unverified until the site is live, and check it after go-live.

The live host is different again: it serves the disk file with a Cloudflare-managed block
prepended. Both are true at once; name which one you measured.

## 8. A generated sitemap needs filtering, or it teaches Google the wrong pages

Reading `content.list` for `menuItem` and `article` gives you everything, including things no
search engine should land on:

- account and system routes — `login-form`, `registration-form`, `profile`, reset, remind
- search views — `smart-search`, any `*-search` route
- **the template's demo pages** — JA templates ship `typography`, `error-page`, `offline-pages`,
  `featured-articles`, and they install as real published menu items

On fijitrips that was 9 of 120 URLs. Drop them, keep the tours and the articles, and say how
many you removed.

## 9. Prove it landed, from outside

The agent's own report is a claim. A manifest fetched over HTTP is evidence, and most Joomla
manifests are publicly readable:

```
curl -s https://<host>/plugins/system/t4/t4.xml         | grep -m1 '<version>'
curl -s https://<host>/templates/<name>/templateDetails.xml | grep -m1 '<version>'
curl -s https://<host>/administrator/manifests/files/joomla.xml | grep -m1 '<version>'
```

Do this after every install. It is one call and it has caught a to-do list that said "in
progress" for work that was actually finished, and it would equally catch the reverse.

## 10. Leave the site the way the customer expects it

- Temporary zips deleted
- Gates back in the state you found them, unless the customer asked otherwise
- Snapshot tags written down, and told to the person: a snapshot nobody knows about is not a way
  back
- Snapshot tables roughly double the database size. Fine for a day, not forever — say when they
  should be cleaned up with `db.cleanup` then `db.purge`
