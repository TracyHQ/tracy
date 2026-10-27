#!/usr/bin/env python3
"""The fleet's ear: the only way in that is not a person with a key.

Two callers, one door. GitHub pushes here (the branch rules of ADR 0045), and the relay asks
for work here (ADR 0049) — each with its own secret, each answered before the work starts.

Why an ear at all: nothing outside can run a command on this machine, and nothing should be
able to. But something running INSIDE it needs no key to reach it — this process is already
root on its own host. So the shape is: hear an instruction over HTTPS, check who sent it, run
the script locally. No SSH anywhere in the chain, and no credential on anybody's laptop.

One small, boring process: verify the signature, read the branch, decide which of three
things a push means, answer 202, and do the work after answering (GitHub times a hook out
at 10s; a rebuild takes minutes).

  push to proposal/<slug>   -> rebuild exactly that preview; never touches the site
  push to main + code paths -> deploy: bring the site's webroot up to main (ADR 0050 §3)
  anything else             -> acknowledged, nothing to do

Config: /etc/tracy/hooks.env sets WEBHOOK_SECRET; /etc/tracy/repos.json maps
"Org/repo" -> {"label": "...", "siteKey": "...", "codePaths": ["webroot/"]}. Adding a site is
one JSON row. `siteKey` is what the relay checks the repo against when it mints the deploy
token — a row without one is a site that cannot deploy, and says so rather than half-trying.
"""

import hashlib
import hmac
import json
import os
import subprocess
import threading
import time
import uuid
from collections import deque
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8091
REPOS_MAP = "/etc/tracy/repos.json"
REBUILD = "/opt/tracy-fleet/reskin/rebuild-proposal.sh"
PROVISION = "/opt/tracy-fleet/provision/provision.sh"
TEARDOWN = "/opt/tracy-fleet/provision/teardown.sh"
ATTACH_SITE = "/opt/tracy-fleet/provision/attach-site.sh"
DSH_VERSIONS = "/opt/tracy-fleet/provision/dsh-versions.mjs"
# This host's name in seat-registry's `FLEET_HOSTS`. It rides along with every answer of
# `/dsh-versions`, so the two sides cannot drift apart while the screen still looks plausible.
HOST_NAME = "do"
DEPLOY = "/opt/tracy-fleet/deploy/deploy-site.sh"
LOG_DIR = "/var/log/tracy-hooks"
JOB_DIR = "/var/lib/tracy-jobs"
# A diagnostic run prints one JSON envelope whose size follows the site's own database, so it
# has no fixed ceiling. The desk refuses an envelope that lost its head, and the thing that
# finally reads it is an agent's context — so the cap sits where the envelope stops being
# useful to read, not where the disk starts to hurt.
DIAG_OUTPUT_MAX = 1_000_000

# A job's whole life on disk: one JSON file per job. Not a database, because the only reader is
# the relay asking "how far along", and the only writer is the thread doing the work — and a
# file survives this process being restarted mid-provision, which is exactly when someone asks.
def job_path(job_id):
    return f"{JOB_DIR}/{job_id}.json"


def write_job(job_id, **fields):
    os.makedirs(JOB_DIR, exist_ok=True)
    current = read_job(job_id) or {"id": job_id, "createdAt": time.time()}
    current.update(fields)
    current["updatedAt"] = time.time()
    tmp = job_path(job_id) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(current, f)
    os.replace(tmp, job_path(job_id))  # atomic: a reader never sees half a file
    return current


def read_job(job_id):
    try:
        with open(job_path(job_id)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def log(msg: str) -> None:
    print(msg, flush=True)


def upsert_repo_row(rows: dict, payload: dict) -> tuple[dict, str | None]:
    """The repo→site map after taking a new row, or the reason for refusing it.

    Split out of the HTTP part so the rule worth testing can be tested: **an empty `codePaths` KEEPS the
    old value**. An unusual site may have had that row edited by hand by the on-call person, and a
    re-registration — same repo, same label — must not wipe it out.
    """
    repo = str(payload.get("repo") or "")
    label = str(payload.get("label") or "")
    site_key = str(payload.get("siteKey") or "")
    # All three go into a config file and then become command-line arguments on the next deploy;
    # anything that does not match the pattern is refused, not "cleaned" — cleaning is guessing what the caller meant.
    if not (SAFE_ARG.match(repo) and SAFE_ARG.match(label) and SAFE_ARG.match(site_key)):
        return rows, "need repo, label and siteKey"
    if "/" not in repo:
        return rows, "repo must be Org/name"

    code_paths = payload.get("codePaths")
    if not isinstance(code_paths, list) or not code_paths:
        code_paths = rows.get(repo, {}).get("codePaths", ["webroot/"])
    return {**rows, repo: {"codePaths": code_paths, "label": label, "siteKey": site_key}}, None


def site_for(full_name: str) -> dict | None:
    try:
        with open(REPOS_MAP) as f:
            return json.load(f).get(full_name)
    except FileNotFoundError:
        return None


def deploy(full_name: str, label: str, site_key: str) -> None:
    """Bring the site's webroot up to `main`.

    Its own log file per site, not the shared one: "why is my site still on yesterday's code" is
    a question asked about ONE site, and answering it should not mean reading everyone else's
    deploys. The script asks the relay for its own token and holds nothing afterwards.
    """
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/{label}--deploy.log"
    with open(log_path, "a") as out:
        out.write(f"\n=== deploy {full_name} → {label} ===\n")
        out.flush()
        subprocess.run(
            ["bash", DEPLOY, "--label", label, "--repo", full_name, "--site-key", site_key],
            stdout=out, stderr=subprocess.STDOUT,
        )


def rebuild(full_name: str, label: str, slug: str, site_key: str) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/{label}--{slug}.log"
    with open(log_path, "a") as out:
        out.write(f"\n=== rebuild {slug} triggered by push ===\n")
        out.flush()
        subprocess.run(
            ["bash", REBUILD, "--label", label, "--slug", slug,
             "--repo", full_name, "--site-key", site_key],
            stdout=out, stderr=subprocess.STDOUT,
        )


# Only the flags provision.sh really understands, and only values that cannot carry quotes.
# The caller is the relay, not a user — but an endpoint that trusts its caller is an endpoint
# broken the first time its caller is fooled.
SAFE_ARG = __import__("re").compile(r"^[A-Za-z0-9._:/@-]+$")
PROVISION_FLAGS = {
    "site": "--site",
    "label": "--label",
    "platform": "--platform",
    # The name the seat book knows the site by. Without it provision falls back to
    # `<label>.tracy.ai`, and the site folder then tells that site's agent, at the start of every
    # session, that it is working on an address the team has never used.
    "siteKey": "--site-key",
    "webrootKey": "--webroot-key",
    "dbKey": "--db-key",
    "liveSite": "--live-site",
    "accessAud": "--access-aud",
    "accessTeamDomain": "--access-team-domain",
    # emdash only: the authenticated seat's email, seeded as the site's owner-admin.
    "ownerEmail": "--owner-email",
    # The image the harness bound to the chosen design system. A REFERENCE, not a decision made
    # here: provision refuses anything outside Tracy's own repository namespace, because a value
    # that reaches `docker compose up` is a value that can run someone else's code on this host.
    "image": "--image",
}


# The reskin jobs the fleet accepts: one script per kind, one known set of flags per kind. A closed
# list — the caller cannot name a script, and cannot add any flag beyond these.
RESKIN_JOBS = {
    "scan-client": ("scan-client-site.sh", ["out"]),
    "fill-block": ("fill-block.sh", []),          # the job comes over stdin, see run_reskin
    "visual-qa": ("visual-qa.sh", ["pages", "variant"]),
    "design-qa": ("design-qa.sh", ["pages", "variant"]),
    "make-variant": ("make-variant.sh", ["slug", "replace"]),
    # The reverse of make-variant. The caller must take the address down FIRST (ingress, route, DNS) and
    # only then call this: dropping the schema while the hostname is still live is a 500 page on the customer's domain.
    "drop-variant": ("drop-variant.sh", ["slug"]),
    "rebuild-proposal": ("rebuild-proposal.sh", ["slug", "repo", "ref"]),
    # One Joomla-6 launch-point hop on a full clone (own container + webroot + database — NOT a
    # reskin variant, which shares the webroot: an upgrade rewrites the core, so it needs a copy
    # of its own). The script reads the port, password and component token from the stack; the
    # caller names only the clone and the launch point.
    "upgrade-hop": ("../tools/upgrade-hop.sh", ["to"]),
}


# demo-try-on jobs: dress a copy of a DEMO site in the customer's content. A closed list like
# RESKIN_JOBS, and each job touches TWO copies instead of one.
TRY_ON_JOBS = {
    "try-on-inventory-client": "inventory-client.sh",
    "try-on-inventory-demo": "inventory-demo.sh",
    "try-on-images": "build-image-set.sh",
    "try-on-apply": "apply-map.sh",
    "try-on-verify": "verify-try-on.sh",
    "try-on-take-off": "take-off.sh",
    "try-on-load-sql": None,  # not a script: loads the generated SQL into the demo copy
    # A schema of its own for one try-on (ADR 0044). Reuses reskin's exact script: one demo can wear
    # many try-ons at once because the files sit on disk once, and the database decides what it wears.
    "try-on-make-variant": "../reskin/make-variant.sh",
}

# The target of a try-on may only be a copy of a DEMO site.
#
# 🔒 The relay only checks that the seat has rights on the CALLER's site, then fills `label` from that
# site key. `demo` is set by the caller. Without this pattern a seat valid on its own site could write
# into any other customer's copy — rights checked on one side, writes on the other. The pattern only
# matches JoomlArt demo sites, and writing there is the intended purpose: there is a take-off, and it
# is nobody's live business.
DEMO_LABEL = __import__("re").compile(r"^[a-z0-9][a-z0-9-]*-demo-joomlart-com-[0-9a-f]{8}$")


# Diagnostic jobs: find the cause of an error on a copy, entirely read-only except error-surface
# (toggling error display) and cache-clear. A closed list, not merged into reskin or try-on
# (D-36). The scripts live on the host at /opt/tracy-fleet/diagnostics/.
DIAG_JOBS = {
    "diag-version-audit": ("diag-version-audit.sh", {}),
    "diag-error-surface": ("diag-error-surface.sh", {"state": "--state", "page": "--page"}),
    "diag-override-diff": ("diag-override-diff.sh", {"packageDir": "--package-dir"}),
    "diag-isolation-step": ("diag-isolation-step.sh", {
        "disable": "--disable",
        "enable": "--enable",
        "setTemplate": "--set-template",
        "page": "--page",
    }),
    "diag-server-audit": ("diag-server-audit.sh", {"page": "--page"}),
    "diag-db-schema-check": ("diag-db-schema-check.sh", {}),
    "diag-cache-clear": ("diag-cache-clear.sh", {}),
    # Passive observation, not diagnosis (ADR 0089 §1): reads the PHP errors the site raised while
    # nobody was asking. Read-only and does not touch the site, so it can run while the customer is
    # looking — unlike diag-error-surface, which turns error display on and must turn it off again.
    "diag-log-tail": ("diag-log-tail.sh", {"since": "--since", "limit": "--limit"}),
}

SAFE_PAGE = __import__("re").compile(r"^[\w,./-]+$")

# ---------------------------------------------------------------- webroot (ADR 0073) --
#
# The webroot's git lives on this machine; the desk reads diffs and writes files through the jobs
# below, through the same /reskin door and the same job envelope as diagnostics. The only write door
# is webroot-write/delete, and the Core-zone gate (ADR 0070) sits in the script itself — the last layer still holding write rights.

WEBROOT_JOBS = {
    "webroot-ensure": ("webroot-git.sh", {"op": "ensure"}),
    "webroot-changes": ("webroot-git.sh", {"op": "changes"}),
    "webroot-commit": ("webroot-git.sh", {"op": "commit"}),
    "webroot-file-diff": ("webroot-git.sh", {"op": "file-diff"}),
    "webroot-file-show": ("webroot-git.sh", {"op": "file-show"}),
    "webroot-pack": ("webroot-pack.sh", {"op": "pack"}),
    "webroot-push": ("webroot-push.sh", {"op": "push"}),
    "webroot-write": ("webroot-edit.sh", {"op": "write"}),
    "webroot-delete": ("webroot-edit.sh", {"op": "delete"}),
    "webroot-restore-undo": ("webroot-git.sh", {"op": "restore-undo"}),
    "webroot-restore-reset": ("webroot-git.sh", {"op": "restore-reset"}),
    # ADR 0091 §4–§5. `release` is a LONG job (rsync of the whole webroot, a clone, a push), so the desk
    # asks for it with a wide deadline like webroot-ensure; `releases` only reads tags so it is as cheap as changes.
    # 04/09: a moment is what the lane records when an agent turn ends; history is the
    # Releases tab (releases and the moments between them). Both live in webroot-git.sh.
    "webroot-moment": ("webroot-git.sh", {"op": "moment"}),
    "webroot-history": ("webroot-git.sh", {"op": "history"}),
    "webroot-release-seal": ("webroot-release.sh", {"op": "seal"}),
    "webroot-release": ("webroot-release.sh", {"op": "create"}),
    "webroot-releases": ("webroot-release.sh", {"op": "list"}),
}

# A GitHub repo name, in the `Owner/name` shape. It goes into a URL and into an API path, so it is
# guarded here rather than in the script — the gate is the only place that sees what the caller sent.
SAFE_REPO = __import__("re").compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")

# A path inside the webroot: relative, no climbing out. Spaces are allowed — the customer's file names
# are not ours to choose — because every command runs as an argument list, never through a shell.
SAFE_WEBROOT_PATH = __import__("re").compile(r"^[^\0\n]{1,512}$")
SAFE_SHA = __import__("re").compile(r"^[0-9a-f]{7,64}$")
MAX_WEBROOT_CONTENT = 8 * 1024 * 1024  # the same 8 MiB ceiling as the component's media.upload


MAX_WEBROOT_BATCH = 32 * 1024 * 1024  # 32 MiB uncompressed — one template edit, not a whole site copy


def validate_webroot_push(body):
    """Gate for a batch (webroot-push): tarball, delete list, message."""
    tarball = body.get("tarballBase64")
    deletes = body.get("deletes")
    if tarball is None and not deletes:
        return "need tarballBase64 or deletes"
    if tarball is not None:
        if not isinstance(tarball, str) or not tarball:
            return "refused tarballBase64"
        if len(tarball) > MAX_WEBROOT_BATCH * 4 // 3 + 4:
            return "refused tarballBase64: too large"
    if deletes is not None:
        if not isinstance(deletes, list):
            return "refused deletes"
        for rel in deletes:
            if not isinstance(rel, str) or not SAFE_WEBROOT_PATH.match(rel):
                return "refused deletes"
            if rel.startswith("/") or ".." in rel.split("/"):
                return "refused deletes"
    message = body.get("message")
    if message is not None and (not isinstance(message, str) or len(message) > 200):
        return "refused message"
    for key in body:
        if key not in ("kind", "label", "tarballBase64", "deletes", "message"):
            return f"refused {key}"
    return None


MAX_RELEASE_NOTES = 256 * 1024  # a changelog a person reads, not a dump


def validate_webroot_release(body):
    """Gate for a Release: repo, siteKey, title, notes."""
    # `repo` is optional since 04/09: a site without a GitHub repo still releases on the
    # artefact. When present it must look like Owner/name, and it needs the siteKey for the token.
    repo = body.get("repo")
    if repo is not None and (not isinstance(repo, str) or not SAFE_REPO.match(repo)):
        return "refused repo"
    site_key = body.get("siteKey")
    if site_key is not None and (not isinstance(site_key, str) or not site_key or len(site_key) > 200):
        return "refused siteKey"
    if repo is not None and site_key is None:
        return "need siteKey with repo"
    # Who pressed Create release: becomes the tag's tagger. Plain strings, one line each.
    for key, cap in (("byName", 120), ("byEmail", 200)):
        value = body.get(key)
        if value is not None and (not isinstance(value, str) or not value.strip() or len(value) > cap or "\n" in value):
            return f"refused {key}"
    title = body.get("title")
    # The title is set by the user, so it may carry their language — only newlines are blocked, the one
    # thing that breaks both a CHANGELOG line and a Release name.
    if not isinstance(title, str) or not title.strip() or len(title) > 120 or "\n" in title:
        return "refused title"
    notes = body.get("notesBase64")
    if notes is not None:
        if not isinstance(notes, str) or len(notes) > MAX_RELEASE_NOTES * 4 // 3 + 4:
            return "refused notesBase64"
    for key in body:
        if key not in ("kind", "label", "repo", "siteKey", "title", "notesBase64", "byName", "byEmail"):
            return f"refused {key}"
    return None


def validate_webroot_moment(body):
    """One agent turn, sealed under the request the person typed."""
    title = body.get("title")
    if not isinstance(title, str) or not title.strip() or len(title) > 200 or "\n" in title:
        return "refused title"
    for key in body:
        if key not in ("kind", "label", "title"):
            return f"refused {key}"
    return None


def validate_webroot_payload(kind, body):
    """None if valid, otherwise the reason for refusing."""
    if kind == "webroot-push":
        return validate_webroot_push(body)
    if kind == "webroot-release":
        return validate_webroot_release(body)
    if kind == "webroot-moment":
        return validate_webroot_moment(body)
    path = body.get("path")
    needs_path = kind in ("webroot-file-diff", "webroot-file-show", "webroot-write", "webroot-delete")
    if needs_path:
        if not isinstance(path, str) or not SAFE_WEBROOT_PATH.match(path):
            return "refused path"
        if path.startswith("/") or ".." in path.split("/"):
            return "refused path"
    if kind == "webroot-file-show":
        if body.get("ref") not in ("baseline", "worktree"):
            return "need ref: baseline or worktree"
    if kind in ("webroot-commit", "webroot-restore-undo", "webroot-restore-reset"):
        sha = body.get("sha")
        if not isinstance(sha, str) or not SAFE_SHA.match(sha):
            return "refused sha"
    if kind == "webroot-write":
        content = body.get("contentBase64")
        if not isinstance(content, str) or not content:
            return "need contentBase64"
        if len(content) > MAX_WEBROOT_CONTENT * 4 // 3 + 4:
            return "refused contentBase64: too large"
    for key in body:
        if key not in ("kind", "label", "path", "contentBase64", "ref", "sha"):
            return f"refused {key}"
    return None


def run_webroot_job(job_id: str, body: dict) -> None:
    """A webroot job, run locally — the same envelope as run_diagnostics."""
    label = body["label"]
    kind = body["kind"]
    script, fixed = WEBROOT_JOBS[kind]
    args = ["bash", f"/opt/tracy-fleet/tools/{script}", "--label", label]
    # webroot-pack.sh does one thing and takes no --op; every other script routes on it.
    if kind not in ("webroot-pack", "webroot-push"):
        args += ["--op", fixed["op"]]
    if body.get("path"):
        args += ["--path", body["path"]]
    if body.get("ref"):
        args += ["--ref", body["ref"]]
    if body.get("sha"):
        args += ["--sha", body["sha"]]

    temp_files = []
    if kind == "webroot-release":
        import base64
        args += ["--title", body["title"]]
        if body.get("repo"):
            args += ["--repo", body["repo"], "--site-key", body["siteKey"]]
        if body.get("byEmail"):
            args += ["--by-email", body["byEmail"], "--by-name", body.get("byName") or body["byEmail"]]
        if body.get("notesBase64"):
            notes_path = f"/tmp/webroot-release-{job_id}.md"
            try:
                raw = base64.b64decode(body["notesBase64"], validate=True)
            except Exception:
                write_job(job_id, state="failed", step=kind, detail="notesBase64 is not base64")
                return
            if len(raw) > MAX_RELEASE_NOTES:
                write_job(job_id, state="failed", step=kind, detail="notes too large")
                return
            with open(notes_path, "wb") as f:
                f.write(raw)
            temp_files.append(notes_path)
            args += ["--notes-file", notes_path]

    if kind == "webroot-moment":
        args += ["--title", body["title"]]

    if kind == "webroot-push":
        import base64
        if body.get("tarballBase64"):
            tar_path = f"/tmp/webroot-push-{job_id}.tar.gz"
            try:
                raw = base64.b64decode(body["tarballBase64"], validate=True)
            except Exception:
                write_job(job_id, state="failed", step=kind, detail="tarballBase64 is not base64")
                return
            with open(tar_path, "wb") as f:
                f.write(raw)
            temp_files.append(tar_path)
            args += ["--tarball", tar_path]
        if body.get("deletes"):
            del_path = f"/tmp/webroot-push-{job_id}.deletes"
            with open(del_path, "w") as f:
                # A trailing newline, because the reader is bash `while read`, which drops a
                # final line that lacks one — a single-entry list read as empty, measured.
                f.write("\n".join(body["deletes"]) + "\n")
            temp_files.append(del_path)
            args += ["--deletes-file", del_path]
        if body.get("message"):
            args += ["--message", body["message"]]

    temp_path = None
    if kind == "webroot-write":
        import base64
        temp_path = f"/tmp/webroot-write-{job_id}"
        try:
            raw = base64.b64decode(body["contentBase64"], validate=True)
        except Exception:
            write_job(job_id, state="failed", step=kind, detail="contentBase64 is not base64")
            return
        if len(raw) > MAX_WEBROOT_CONTENT:
            write_job(job_id, state="failed", step=kind, detail="content too large")
            return
        with open(temp_path, "wb") as f:
            f.write(raw)
        args += ["--content-file", temp_path]

    write_job(job_id, state="running", step=kind, label=label)
    try:
        proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        write_job(job_id, state="done" if proc.returncode == 0 else "failed",
                  step=kind, exitCode=proc.returncode, output=proc.stdout[-16000:])
    except Exception as error:  # noqa: BLE001
        write_job(job_id, state="failed", step=kind, detail=str(error)[:200])
    finally:
        for path in ([temp_path] if temp_path else []) + temp_files:
            try:
                os.unlink(path)
            except OSError:
                pass



def validate_diag_payload(kind, body):
    """None if valid, otherwise the reason for refusing."""
    if kind not in DIAG_JOBS:
        return "unknown kind"
    _script, flags = DIAG_JOBS[kind]
    for key in body:
        if key not in ("kind", "label") and key not in flags:
            return f"refused {key}"
    for key in flags:
        value = body.get(key)
        if value is None:
            continue
        # Only diag-isolation-step's two on/off flags travel as a batch, and that batch goes through a
        # JSON file, not a shell. Even so, each element must match the pattern right here —
        # the gate is the only place that sees the data the caller sent.
        if isinstance(value, list):
            if kind != "diag-isolation-step" or key not in ("disable", "enable") or not value:
                return f"refused {key}"
            for item in value:
                if not isinstance(item, str) or not SAFE_ARG.match(item):
                    return f"refused {key}"
            continue
        if isinstance(value, dict):
            return f"refused {key}"
        if key == "page":
            if ".." in str(value) or not SAFE_PAGE.match(str(value)):
                return "refused page"
        elif not SAFE_ARG.match(str(value)):
            return f"refused {key}"

    # Per-job constraints: a job missing a part makes the script run into nothing,
    # so block it at the gate instead of letting it fail halfway on the customer's copy.
    if kind == "diag-error-surface":
        state = body.get("state")
        if state is not None and state not in ("on", "off"):
            return "refused state"
        if state == "on" and not body.get("page"):
            return "need page"
    elif kind == "diag-isolation-step":
        toggles = [k for k in ("disable", "enable", "setTemplate") if body.get(k) is not None]
        if len(toggles) != 1:
            return "need exactly one of disable/enable/setTemplate"
        if not body.get("page"):
            return "need page"
    return None


def build_diag_args(kind, body, job_id=None):
    """The command line for a diagnostic job. Returns (args, temp_files).

    temp_files: a list of (path, data) to write to disk before running.
    """
    script, flags = DIAG_JOBS[kind]
    args = ["bash", f"/opt/tracy-fleet/diagnostics/{script}"]
    temp_files = []

    for key, flag in flags.items():
        value = body.get(key)
        if not value:
            continue
        # An on/off batch does not go on the command line: it goes through a JSON file the script reads itself.
        if isinstance(value, list):
            path = f"/tmp/diag-toggle-{job_id}.json"
            temp_files.append((path, {key: value}))
            args += ["--toggle-file", path]
        else:
            args += [flag, value]

    return args, temp_files


def run_try_on(job_id: str, body: dict) -> None:
    """One demo-try-on step. The client is only read; every write lands in the demo copy."""
    kind = body["kind"]
    client = body["label"]
    demo = body["demo"]
    script = TRY_ON_JOBS[kind]

    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/try-on-{demo}.log"
    write_job(job_id, state="running", step=kind, label=demo)

    # The map and the SQL go through files, not the command line: they are the caller's data and can
    # be tens of thousands of characters long.
    map_path = None
    if body.get("map"):
        map_path = f"/tmp/try-on-map-{job_id}.json"
        with open(map_path, "w") as f:
            json.dump(body["map"], f)

    try:
        if kind == "try-on-load-sql":
            sql_path = f"/tmp/try-on-{job_id}.sql"
            with open(sql_path, "w") as f:
                f.write(body.get("sql") or "")
            stack = stack_env(demo)
            schema = "joomla"
            if body.get("variant"):
                schema = f"joomla_{body['variant'].replace('-', '_')}"
            # mariadb stops at the first error by default, and that is what we want: half a try-on
            # is worse than no try-on.
            proc = subprocess.run(
                ["docker", "exec", "-i", f"{demo}-db-1", "mariadb", "-uroot",
                 f"-p{stack['DB_PASSWORD']}", schema],
                stdin=open(sql_path), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            subprocess.run(["docker", "exec", f"{demo}-web-1", "sh", "-c",
                            "rm -rf /var/www/html/cache/*"], capture_output=True)
        else:
            args = ["bash", f"/opt/tracy-fleet/demo-try-on/{script}"]
            if kind == "try-on-make-variant":
                # Reskin's script takes the database container, not the label.
                args = ["bash", "/opt/tracy-fleet/reskin/make-variant.sh",
                        "--db", f"{demo}-db-1", "--slug", body.get("variant", ""), "--replace"]
            elif kind in ("try-on-inventory-client",):
                args += ["--client", client]
            elif kind in ("try-on-inventory-demo", "try-on-verify", "try-on-take-off"):
                args += ["--demo", demo]
            else:
                args += ["--client", client, "--demo", demo]
            if map_path:
                args += ["--map", map_path]
            if body.get("dry"):
                args += ["--dry-run"]
            if body.get("apply"):
                args += ["--apply"]
            # `--variant` goes with every step that touches the demo copy's database. make-variant takes it via
            # `--slug` above, so it is excluded to avoid passing it twice under two names.
            # Only the steps that TOUCH THE TRY-ON'S DATA carry the variant. `inventory-demo` reads the TEMPLATE's
            # slots and image ratios, `images` measures the demo copy's images, `inventory-client` reads the
            # customer site — all three read the original, and passing them the variant only makes them read the wrong place.
            # make-variant takes the same value via `--slug`.
            if body.get("variant") and kind not in (
                "try-on-make-variant",
                "try-on-inventory-client",
                "try-on-inventory-demo",
                "try-on-images",
            ):
                args += ["--variant", body["variant"]]
            proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

        with open(log_path, "a") as out:
            out.write(f"\n=== {kind} {demo} (job {job_id}) ===\n")
            out.write(proc.stdout or "")
        write_job(job_id, state="done" if proc.returncode == 0 else "failed",
                  step=kind, label=demo, output=(proc.stdout or "")[-60000:])
    except Exception as exc:  # noqa: BLE001
        log(f"try-on {kind} {demo} blew up: {exc}")
        write_job(job_id, state="failed", step=kind, label=demo, output=str(exc)[:2000])


def stack_env(label: str) -> dict:
    """The port, password and table prefix of a copy — read from the very stack it runs in.

    Asking the machine beats remembering: a freshly rebuilt copy has new credentials, and a remembered
    answer is wrong with confidence.
    """
    env = {}
    with open(f"/srv/tracy/{label}/.env") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    prefix = subprocess.run(
        ["docker", "exec", f"{label}-web-1", "grep", "-m1", "dbprefix", "/var/www/html/configuration.php"],
        capture_output=True, text=True,
    ).stdout
    env["DB_PREFIX"] = prefix.split("'")[1] if "'" in prefix else ""
    return env


def run_reskin(job_id: str, body: dict) -> None:
    """A reskin job, run locally as this machine's root.

    Credentials never travel over the wire: the caller says *what to do*, and the port/password/prefix are
    read from the stack right here. That is the whole reason this job moved to the fleet instead of staying in the app.
    """
    label = body["label"]
    kind = body["kind"]
    script, allowed = RESKIN_JOBS[kind]
    stack = stack_env(label)
    host = f"{label}.tracy.ai"

    args = ["bash", f"/opt/tracy-fleet/reskin/{script}"]
    if kind == "make-variant":
        # `--replace` only when the caller ASKS. It used to be added here always, so calling
        # `make_proposal` again on an already-built proposal re-cloned the schema from the site and lost every
        # `fill_block` applied — silently, since both runs answered "is live at". Without that flag
        # make-variant.sh refuses an existing schema, and the refusal goes straight back to the agent.
        args += ["--db", f"{label}-db-1", "--slug", body.get("slug", "")]
        if body.get("replace"):
            args += ["--replace"]
    elif kind == "drop-variant":
        args += ["--db", f"{label}-db-1", "--slug", body.get("slug", "")]
    elif kind == "rebuild-proposal":
        args += ["--label", label, "--slug", body.get("slug", ""), "--repo", body.get("repo", "")]
        if body.get("ref"):
            args += ["--ref", body["ref"]]
    elif kind == "upgrade-hop":
        # Everything else the hop needs — port, password, prefix, component token — the script
        # reads from the clone's own stack, so only the label and the launch point cross.
        args += ["--label", label, "--to", body.get("to", "")]
    elif kind in ("visual-qa", "design-qa"):
        args += ["--host", host, "--port", stack["HOST_PORT"], "--pages", body.get("pages", "/")]
        if body.get("variant"):
            args += ["--variant", body["variant"]]
    elif kind == "scan-client":
        args += ["--db", f"{label}-db-1", "--web", f"{label}-web-1", "--prefix", stack["DB_PREFIX"],
                 "--pass", stack["DB_PASSWORD"], "--host", host, "--port", stack["HOST_PORT"],
                 "--out", f"/opt/tracy-fleet/reskin/out/{body.get('out') or label + '-inventory.json'}"]
    elif kind == "fill-block":
        # The job is the caller's JSON; the `client` block is filled on THIS side, so the password never
        # leaves this machine.
        job = dict(body.get("job") or {})
        job["client"] = {
            "db": f"{label}-db-1", "web": f"{label}-web-1", "prefix": stack["DB_PREFIX"],
            "pass": stack["DB_PASSWORD"], "host": host, "port": stack["HOST_PORT"],
            **({"variant": body["variant"]} if body.get("variant") else {}),
        }
        path = f"/tmp/job-{job_id}.json"
        with open(path, "w") as f:
            json.dump(job, f)
        args += [path]

    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/reskin-{label}.log"
    write_job(job_id, state="running", step=kind, label=label)
    try:
        with open(log_path, "a") as out:
            out.write(f"\n=== {kind} {label} (job {job_id}) ===\n")
            out.flush()
            proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                  env={**os.environ, **stack})
            out.write(proc.stdout)
        # A failed QA gate is a REPORT, not a crash — it exits non-zero by design.
        write_job(job_id, state="done" if proc.returncode == 0 else "failed",
                  step=kind, exitCode=proc.returncode, output=proc.stdout[-4000:])
    except Exception as error:  # noqa: BLE001
        write_job(job_id, state="failed", step=kind, detail=str(error)[:200])


def run_diagnostics(job_id: str, body: dict) -> None:
    """A diagnostic job, run locally as this machine's root.

    Credentials are read from the stack — the caller only says what to do on their own copy.
    """
    label = body["label"]
    kind = body["kind"]
    stack = stack_env(label)
    args, temp_files = build_diag_args(kind, body, job_id)
    args += ["--label", label]

    for path, data in temp_files:
        with open(path, "w") as f:
            json.dump(data, f)

    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/diagnostics-{label}.log"
    write_job(job_id, state="running", step=kind, label=label)
    try:
        with open(log_path, "a") as out:
            out.write(f"\n=== {kind} {label} (job {job_id}) ===\n")
            out.flush()
            proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                  env={**os.environ, **stack})
            out.write(proc.stdout)
        write_job(job_id, state="done" if proc.returncode == 0 else "failed",
                  step=kind, exitCode=proc.returncode, output=proc.stdout[-DIAG_OUTPUT_MAX:])
    except Exception as error:  # noqa: BLE001
        write_job(job_id, state="failed", step=kind, detail=str(error)[:200])


def provision(job_id: str, body: dict) -> None:
    """Builds a copy, locally, as this machine's own root — no SSH anywhere.

    Progress is written to a file after every line the script prints: the one asking is the relay, and what
    it asks is "how far along", so the answer must exist even while the job is still running.
    """
    label = body["label"]
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/provision-{label}.log"

    # stdbuf -oL, so a line reaches the log the instant it is printed rather than sitting in a 4 KB
    # block buffer that a sudden death throws away. bash and the coreutils it calls line-buffer
    # their stdout only when it is a terminal; here it is a pipe, so without this the last thing a
    # dying provision said — the step it failed on — is lost with the buffer. That is exactly how a
    # real failure read as nothing but "provision_failed" for a whole evening (juneflower.vn,
    # 2026-08-14): the log stopped at "rewriting wp-config.php" while the truth was a line further on.
    args = ["stdbuf", "-oL", "bash", PROVISION]
    for key, flag in PROVISION_FLAGS.items():
        value = body.get(key)
        if value:
            args += [flag, str(value)]
    # A flag without a value, so it sits outside PROVISION_FLAGS (that table maps key→value).
    if body.get("fresh"):
        args += ["--fresh"]
    # The address is issued later by the relay, once it knows a door stands in front of the site (ADR 0033).
    args += ["--no-publish", "--root", "/srv/tracy"]

    env = dict(os.environ)
    if body.get("port"):
        env["HOST_PORT"] = str(int(body["port"]))
    # Git push token for the webroot publish (ADR 0050 B): the relay mints a contents-only,
    # one-repo token and puts it in this signed instruction. Passed through the environment, not
    # the command line, so it never shows in `ps`. Absent = the webroot publish is skipped.
    if body.get("gitToken"):
        env["GIT_PUSH_TOKEN"] = str(body["gitToken"])
    if body.get("gitRepo"):
        env["GIT_REPO"] = str(body["gitRepo"])

    write_job(job_id, state="running", step="starting", label=label)
    try:
        with open(log_path, "a") as out:
            out.write(f"\n=== provision {label} (job {job_id}) ===\n")
            out.flush()
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, env=env, bufsize=1)
            port = None
            # Kept alongside the file, so a failure can send its last words back the way reskin
            # already does. The log_path detail points at a host nobody on the desk can read, so
            # without this the caller learns only "provision failed" and has to guess which of the
            # script's own refusals it hit ("database never became ready", "no free port", …).
            tail = deque(maxlen=200)
            for line in proc.stdout:
                out.write(line)
                out.flush()
                tail.append(line)
                # The script narrates what it is doing; this is what the Migrate screen shows the customer.
                if line.startswith("=="):
                    write_job(job_id, step=line.strip("= \n")[:80])
                if line.startswith("TRACY_RESULT port="):
                    port = int(line.split("port=")[1].split()[0])
            code = proc.wait()
        if code == 0 and port:
            write_job(job_id, state="done", step="ready", port=port)
        else:
            write_job(job_id, state="failed", step="provision", exitCode=code,
                      detail=f"see {log_path}", output="".join(tail)[-4000:])
    except Exception as error:  # noqa: BLE001 - one broken job must not drag the whole process down
        write_job(job_id, state="failed", step="provision", detail=str(error)[:200])


def run_teardown(job_id: str, payload: dict) -> None:
    """Removes a site's whole footprint, in the background like provision — never keeps the relay connection waiting.

    Done synchronously, the 200 response races the relay's fleetCall timeout and loses (BrokenPipe), even though
    the work is done. In the background: return the jobId at once, teardown carries on, and an on-call person can read `/jobs/<id>`.
    """
    label = payload["label"]
    args = ["bash", TEARDOWN, "--label", str(label)]
    if payload.get("site") and SAFE_ARG.match(str(payload["site"])):
        args += ["--site", str(payload["site"])]
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/teardown-{label}.log"
    write_job(job_id, state="running", step="teardown", label=label)
    try:
        with open(log_path, "a") as out:
            out.write(f"\n=== teardown {label} (job {job_id}) ===\n")
            out.flush()
            proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  text=True, timeout=180, env={**os.environ})
            out.write(proc.stdout)
        write_job(job_id, state="done" if proc.returncode == 0 else "failed",
                  step="teardown", exitCode=proc.returncode, output=proc.stdout[-4000:])
    except Exception as error:  # noqa: BLE001
        write_job(job_id, state="failed", step="teardown", detail=str(error)[:200])




class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        """A job's progress. Signed like every other call: a job id with a site label is not
        something for anyone to read."""
        if not self.path.startswith("/jobs/"):
            return self._answer(404, "not here")
        job_id = self.path.removeprefix("/jobs/").split("?")[0]
        if not self._relay_signed(b"", self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        job = read_job(job_id)
        if not job:
            return self._answer(404, "no such job")
        return self._answer(200, json.dumps(job), "application/json")

    def do_POST(self) -> None:  # noqa: N802 - stdlib naming
        if self.path == "/provision":
            return self._provision()
        # `/site` is the job door's name on both ears since 04/09; `/reskin` stays as an alias.
        if self.path in ("/site", "/reskin"):
            return self._reskin()
        if self.path == "/repos":
            return self._repos()
        if self.path == "/agent-token":
            return self._agent_token()
        if self.path == "/teardown":
            return self._teardown()
        if self.path == "/site-attach":
            return self._site_attach()
        if self.path == "/dsh-versions":
            return self._dsh_versions()
        if self.path != "/github":
            return self._answer(404, "not here")

        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        secret = os.environ.get("WEBHOOK_SECRET", "")
        sent = self.headers.get("x-hub-signature-256", "")
        want = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        # Reject before parsing: an unsigned payload gets no code path at all.
        if not secret or not hmac.compare_digest(sent, want):
            return self._answer(403, "bad signature")

        if self.headers.get("x-github-event") != "push":
            return self._answer(202, "not a push; nothing to do")

        payload = json.loads(body)
        full_name = payload.get("repository", {}).get("full_name", "")
        ref = payload.get("ref", "")
        site = site_for(full_name)
        if not site:
            return self._answer(202, f"{full_name} is not a fleet site; nothing to do")
        label = site["label"]
        # Both lanes need it now: each asks the relay for a one-repo token, and the relay checks
        # the repo against the site's own record. A row without it can serve neither.
        site_key = site.get("siteKey")
        if not site_key:
            log(f"{full_name} has no siteKey in its repos.json row; nothing can be minted for it")
            return self._answer(202, "no siteKey configured for this repo")

        if ref.startswith("refs/heads/proposal/"):
            slug = ref.removeprefix("refs/heads/proposal/")
            # Answer first, build after: GitHub hangs up at 10s and a rebuild takes minutes.
            threading.Thread(target=rebuild, args=(full_name, label, slug, site_key), daemon=True).start()
            return self._answer(202, f"rebuilding preview {slug} for {label}")

        if ref == "refs/heads/main":
            code_paths = tuple(site.get("codePaths", ["webroot/"]))
            touched = {
                path
                for commit in payload.get("commits", [])
                for path in commit.get("added", []) + commit.get("modified", []) + commit.get("removed", [])
            }
            if any(path.startswith(code_paths) for path in touched):
                # Answer first, deploy after — same reason as the rebuild lane: GitHub hangs up
                # at 10s, and a webroot checkout over thousands of files takes longer than that.
                threading.Thread(target=deploy, args=(full_name, label, site_key), daemon=True).start()
                return self._answer(202, f"deploying {label} from main")
            return self._answer(202, "main change outside code paths; nothing to deploy")

        return self._answer(202, "branch carries no rule; nothing to do")

    def _site_attach(self) -> None:
        """Show one site's folder to the dsh this host runs. Relay door — FLEET_RELAY_SECRET.

        Since Plan 3 each host has only ONE dsh, and it sees a site correctly when that site's folder
        is bound to `/srv/tracy-sites/<label>`. This door is the on-host half of that: the caller
        (seat-registry) has no shell on this machine, and must not have one.

        SYNCHRONOUS, not a background job: binding a folder takes a millisecond, not
        minutes, so a job id for the caller to come back with costs more than the answer itself.

        Idempotent on the script side, so calling again for an already bound site is a no-op — the caller does not
        have to remember which sites are bound, and that is intended: this door runs on every site creation.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")

        label = str(payload.get("label", ""))
        if not label or not SAFE_ARG.match(label) or "/" in label:
            return self._answer(400, "bad label")
        for key in payload:
            if key != "label":
                return self._answer(400, f"refused {key}")

        try:
            done = subprocess.run(
                [ATTACH_SITE, label],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return self._answer(504, "attach-site timed out")
        if done.returncode != 0:
            return self._answer(500, json.dumps({"error": done.stderr[-400:]}), "application/json")
        return self._answer(
            200,
            json.dumps({"ok": True, "label": label, "path": f"/site/{label}"}),
            "application/json",
        )

    def _dsh_versions(self) -> None:
        """The dsh this host is running — image tag, container state, the version of every `@tracy/*` package.

        A READ door of harness.tracy.ai, signed with `FLEET_RELAY_SECRET` like every relay door; the body is empty so the
        signature is the HMAC of the empty string.

        SYNCHRONOUS, not a background job: the script only reads one env file and asks docker twice. A job id
        for the caller to come back with costs more than the answer itself.

        🔒 NOT A WRITE DOOR, and that is a deliberate difference from the `/lane-update` it replaces. A dsh host
        is upgraded with `deploy-host-dsh.sh` ON THAT MACHINE ITSELF, where the upgrade preflights three files, runs
        two measurements and rolls the tag back on failure. A write door here would be a second road to the same
        change, dumber than the first and maintained by nobody.

        The host declares its own name (`HOST_NAME`) instead of taking one from the caller: a screen grouped
        by a name the caller handed down would be self-consistent while pointing at the wrong machine.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            done = subprocess.run(
                ["node", DSH_VERSIONS, "--host", HOST_NAME],
                capture_output=True,
                text=True,
                timeout=90,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return self._answer(504, "dsh-versions timed out")
        if done.returncode != 0:
            return self._answer(500, json.dumps({"error": done.stderr[-400:]}), "application/json")
        return self._answer(200, done.stdout.strip(), "application/json")

    def _relay_signed(self, body: bytes, signature: str) -> bool:
        """The same HMAC shape as the webhook, a different secret: two callers, two keys."""
        secret = os.environ.get("FLEET_RELAY_SECRET", "")
        if not secret or not signature:
            return False
        want = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, want)

    def _agent_token(self) -> None:
        """Returns the EmDash agent's PAT for a label, for the relay to pass on to the desk (ADR 0049).

        The token is minted by provision and written to `/srv/tracy/<label>/tracy-agent.token` (0600). The desk needs it
        as the local key `${EMDASH_PAT}` for the site's MCP server — the secret stops at the client machine's keychain,
        exactly the ADR 0026 §3 boundary. This door is signed with FLEET_RELAY_SECRET like every other relay door; the label
        must match the pattern so no file outside /srv/tracy can be read.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")
        label = payload.get("label", "")
        if not label or not SAFE_ARG.match(str(label)):
            return self._answer(400, "bad label")
        token_path = f"/srv/tracy/{label}/tracy-agent.token"
        try:
            with open(token_path, encoding="utf-8") as fh:
                token = fh.read().strip()
        except FileNotFoundError:
            return self._answer(404, "no token")
        return self._answer(200, json.dumps({"token": token}), "application/json")

    def _teardown(self) -> None:
        """Removes a site's whole footprint from this machine — the fleet half of a teardown (ADR 0049).

        The relay has already forgotten the seat/repo/Access before calling here, so this is the last thing holding the label, and it
        DESTROYS DATA (`docker compose down --volumes`). Signed with FLEET_RELAY_SECRET like every relay door;
        the label must match the pattern so nothing outside /srv/tracy/<label> can be touched.

        Answer first, work after — like provision: the relay calls once and is done (fire-and-forget,
        no polling), and a synchronous teardown makes the response race the relay's timeout and lose with
        BrokenPipe even though the work is done. Backgrounding removes that race; `/jobs/<id>` lets on-call see the result.
        Idempotent: teardown.sh treats an already vanished site as success, so a second call does not fail.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")
        label = payload.get("label", "")
        if not label or not SAFE_ARG.match(str(label)):
            return self._answer(400, "bad label")

        job_id = uuid.uuid4().hex[:12]
        write_job(job_id, state="queued", step="queued", label=label)
        threading.Thread(target=run_teardown, args=(job_id, payload), daemon=True).start()
        return self._answer(202, json.dumps({"jobId": job_id}), "application/json")

    def _repos(self) -> None:
        """One row in `/etc/tracy/repos.json` — which repo belongs to which site.

        This row used to be written by hand, and the webhook was attached by hand too, so two jobs that must go
        together were done by two people at two times: a repo with a webhook but no row here got only
        `not a fleet site` on every push, and a row here without a webhook got no push at all.
        The relay registers the webhook (it holds the App's token) and then calls this path, so both halves
        either exist together or not at all.

        Overwriting on purpose: when a repo changes label or siteKey, the new row is the right row. An empty `codePaths`
        keeps the old value — on-call may have edited it for an unusual site,
        and a re-registration must not wipe it out.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")

        try:
            with open(REPOS_MAP) as f:
                rows = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            rows = {}

        updated, error = upsert_repo_row(rows, payload)
        if error:
            return self._answer(400, error)

        # Write through a temp file and rename: this path runs while another push may be READING
        # the map, and a truncated file means every site loses its deploy path until someone notices.
        tmp = f"{REPOS_MAP}.tmp"
        with open(tmp, "w") as f:
            json.dump(updated, f, indent=2, sort_keys=True)
        os.replace(tmp, REPOS_MAP)
        repo = payload["repo"]
        log(f"repos.json: {repo} -> {updated[repo]['label']} ({updated[repo]['siteKey']})")
        return self._answer(200, json.dumps({"repo": repo, "label": updated[repo]["label"]}), "application/json")

    def _provision(self) -> None:
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")

        # The label and artifact key go straight onto the command line: anything that does not match the pattern is refused,
        # not "cleaned" — cleaning is guessing what the caller meant.
        if not payload.get("label") or not payload.get("site"):
            return self._answer(400, "need site and label")
        # A FRESH install has no archive to demand: emdash always, every other platform when
        # `fresh` (ADR 0086 — fleet-born site). The restore path still requires webrootKey as before.
        fresh = bool(payload.get("fresh"))
        if not fresh and payload.get("platform") != "emdash" and not payload.get("webrootKey"):
            return self._answer(400, "need webrootKey for this platform")
        for key in PROVISION_FLAGS:
            value = payload.get(key)
            if value and not SAFE_ARG.match(str(value)):
                return self._answer(400, f"refused {key}")

        job_id = uuid.uuid4().hex[:12]
        write_job(job_id, state="queued", step="queued", label=payload["label"])
        # Answer first, work after: building a site takes minutes, and the caller needs the job id now.
        threading.Thread(target=provision, args=(job_id, payload), daemon=True).start()
        return self._answer(202, json.dumps({"jobId": job_id}), "application/json")

    def _reskin(self) -> None:
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")

        kind = payload.get("kind")
        if (
            kind not in RESKIN_JOBS
            and kind not in TRY_ON_JOBS
            and kind not in DIAG_JOBS
            and kind not in WEBROOT_JOBS
            and kind != "core-manifest-write"
        ):
            return self._answer(400, "unknown kind")
        if not payload.get("label"):
            return self._answer(400, "need label")

        # A try-on touches two copies, so it has a gate of its own: the target must be a demo site.
        # See the note at DEMO_LABEL — the relay cannot check this on our behalf.
        if kind in TRY_ON_JOBS:
            demo = str(payload.get("demo") or "")
            if not DEMO_LABEL.match(demo):
                return self._answer(400, "refused demo: a try-on may only write to a demo copy")
            if not os.path.isdir(f"/srv/tracy/{demo}"):
                return self._answer(404, "no such demo copy")
            job_id = uuid.uuid4().hex[:12]
            write_job(job_id, state="queued", step=kind, label=demo)
            threading.Thread(target=run_try_on, args=(job_id, payload), daemon=True).start()
            return self._answer(202, json.dumps({"jobId": job_id}), "application/json")
        if kind == "core-manifest-write":
            # Per-site core source (ADR 0070 appendix): the desk fetches the manifest from the site itself via the relay
            # and sends it down here; the Core-zone gate reads this file instead of a static list. Writes one
            # JSON file next to the webroot — no script, no shell.
            if not SAFE_ARG.match(str(payload.get("label", ""))):
                return self._answer(400, "refused label")
            site_dir = f"/srv/tracy/{payload['label']}"
            if not os.path.isdir(site_dir):
                return self._answer(404, "no such site")
            raw = payload.get("contentBase64")
            if not isinstance(raw, str) or not raw or len(raw) > 2 * 1024 * 1024:
                return self._answer(400, "need contentBase64 (max ~1.5MB)")
            try:
                import base64 as _b64
                decoded = _b64.b64decode(raw, validate=True)
                manifest = json.loads(decoded)
                if not isinstance(manifest.get("platform"), str) or not isinstance(
                    manifest.get("extensions"), list
                ):
                    raise ValueError("not a core manifest")
            except Exception:
                return self._answer(400, "refused contentBase64: not a core manifest")
            tmp = f"{site_dir}/core-manifest.json.tmp"
            with open(tmp, "wb") as f:
                f.write(decoded)
            os.replace(tmp, f"{site_dir}/core-manifest.json")
            job_id = uuid.uuid4().hex[:12]
            write_job(job_id, state="done", step=kind, label=payload["label"],
                      output=json.dumps({"ok": True, "extensions": len(manifest["extensions"])}))
            return self._answer(202, json.dumps({"jobId": job_id}), "application/json")
        if kind in WEBROOT_JOBS:
            if not SAFE_ARG.match(str(payload.get("label", ""))):
                return self._answer(400, "refused label")
            error = validate_webroot_payload(kind, payload)
            if error:
                return self._answer(400, error)
            job_id = uuid.uuid4().hex[:12]
            write_job(job_id, state="queued", step=kind, label=payload["label"])
            threading.Thread(target=run_webroot_job, args=(job_id, payload), daemon=True).start()
            return self._answer(202, json.dumps({"jobId": job_id}), "application/json")
        if kind in DIAG_JOBS:
            if not SAFE_ARG.match(str(payload.get("label", ""))):
                return self._answer(400, "refused label")
            error = validate_diag_payload(kind, payload)
            if error:
                return self._answer(400, error)
            job_id = uuid.uuid4().hex[:12]
            write_job(job_id, state="queued", step=kind, label=payload["label"])
            threading.Thread(target=run_diagnostics, args=(job_id, payload), daemon=True).start()
            return self._answer(202, json.dumps({"jobId": job_id}), "application/json")
        # Everything that goes onto the command line must match the pattern. `job` does not — it goes through a JSON file, not
        # through a shell.
        for key in ("label", "slug", "variant", "out", "ref"):
            value = payload.get(key)
            if value and not SAFE_ARG.match(str(value)):
                return self._answer(400, f"refused {key}")
        if payload.get("pages") and not SAFE_PAGE.match(str(payload["pages"])):
            return self._answer(400, "refused pages")

        job_id = uuid.uuid4().hex[:12]
        write_job(job_id, state="queued", step=kind, label=payload["label"])
        threading.Thread(target=run_reskin, args=(job_id, payload), daemon=True).start()
        return self._answer(202, json.dumps({"jobId": job_id}), "application/json")

    def _answer(self, status: int, text: str, content_type: str = "text/plain; charset=utf-8") -> None:
        log(f"{self.address_string()} {self.command} {self.path} -> {status} {text[:80]}")
        body = text.encode()
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:  # quiet the default per-request line
        pass


if __name__ == "__main__":
    log(f"tracy-hooks listening on 127.0.0.1:{PORT}")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
