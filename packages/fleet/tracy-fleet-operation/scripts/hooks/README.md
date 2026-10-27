# The fleet's webhook listener — TWO versions, and they DIFFER

Brought in on 02/09/2026, after finding that this code **had never been in git**: it lived only on the
servers, next to three `.bak-2026082x` files. That is exactly the trap this repo fights everywhere
else — only worse, because there was no second copy to compare with, and nobody knew where the running
version came from.

The import **changed nothing**: the two files below are copied as they were, so the first edit is a
readable diff rather than an overwrite.

## Two versions, and they are not two drifted copies

| | lines | Paths it serves |
|---|---|---|
| `tracy-hooks.do.py` | 1263 | `/agent-token` `/dsh-versions` `/github` `/jobs/<id>` `/provision` `/repos` `/reskin`=`/site` `/site-attach` `/teardown` |
| `tracy-hooks.contabo.py` | 846 | `/agent-token` `/dsh-versions` `/go-live` `/jobs/<id>` `/provision` `/site` `/site-attach` `/teardown` |

⚠ **This is not one file that drifted — it is TWO different services with the same name.** The table
above is the COMPLETE list, re-measured 06/09; only some paths exist in both. `/github` (the webhook
listener, `FLEET_HOOK_URL` points straight at it), `/repos` and `/reskin` exist only on DigitalOcean;
`/go-live` only on contabo. Merging them by copying one over the other **switches off** half the paths
of one of the two hosts.

🔒 **`/dsh-versions` IS NOT `/lane-versions` COMING BACK.** Added 09/09/2026, and it differs exactly
where the other three doors had to go: it asks **one host**, not each site. One dsh serves the whole
machine, so "which image and which packages does this machine run" is the only question still
answerable — and it is **read only**. Upgrading a dsh host is still the job of `deploy-host-dsh.sh` on
that machine itself, where the upgrade rolls itself back on failure. The script it calls lives at
`provision/dsh-versions.mjs`, **in this repo** — its predecessor lived only in `/opt/tracy-fleet/tools/`
on two machines and no repo kept it, so the two copies drifted with nothing to compare against.

🔒 **THREE DOORS REMOVED 06/09/2026 — `/lane`, `/lane-update`, `/lane-versions`.** They built, upgraded
and listed **per-site lanes**, which one-dsh-per-host no longer has; the scripts they called
(`tools/ensure-lane.sh`, `tools/update-lane.sh`, `tools/lane-versions.mjs`) were deleted in the same
change. The `Site agents` screen on `harness.tracy.ai` — the only caller of the last two doors — went
before them. The `infra-contracts` gate (`scripts/check-infra-contracts.ts`) pins that they do not come
back: a door calling a script that does not exist answers 500, not a readable error.

🔒 **`/site-attach` is a deliberate exception: it is in BOTH, and must stay that way.** Since Plan 3
each host runs exactly one dsh, and this door is how seat-registry tells a host "bind this site's
folder to `/srv/tracy-sites/<label>`". A host without it is a host where newly created sites have no
agent — and the only symptom is an empty chat pane, with no error anywhere.

The fleet splits the work in two — see
[`docs/references/ban-do-fleet.md`](../../../../../docs/references/ban-do-fleet.md) §1: the first-generation
agent lanes lived on DigitalOcean, customer websites on contabo. These two versions are the projection
of that split, not an accident.

## Before changing any line

1. **Which version are you changing?** The three running lanes (`tchwp2`, `dshwp1`, `tchemdash1`) are
   all on contabo, but `FLEET_HOOK_URL` points at DO. A change that is right for a lane can be a change
   in the wrong place.
2. **The copy on the server may be ahead of the one here.** Compare `md5sum` first; never scp over it.
3. **The `infra-contracts` gate pins exactly one short list** — `/site-attach` exists in both,
   `siteKey` reaches `provision.sh`, and the three lane doors do not come back. Nothing else has a test,
   and `check-language` does not scan `.py`
   ([`tasks/todo-quy-uoc-tch.md`](../../../../../tasks/todo-quy-uoc-tch.md) §Handoff). The gates cannot
   catch you here; only careful reading can.

## Outstanding work

These two versions need to be compared and merged — or renamed to match their two roles. Until that is
done, every statement "the hook serves path X" must say "on which host".
