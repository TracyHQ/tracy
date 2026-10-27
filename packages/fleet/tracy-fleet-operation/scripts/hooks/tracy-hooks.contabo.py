#!/usr/bin/env python3
"""The fleet's ear: the only way in that is not a person with a key.

One caller, one secret. The relay (`seats.tracy.ai`) asks for work here and signs every
request with `FLEET_RELAY_SECRET` (ADR 0049).

Why an ear at all: nothing outside can run a command on this machine, and nothing should be
able to. But something running INSIDE it needs no key to reach it — this process is already
root on its own host. So the shape is: hear an instruction over HTTPS, check who sent it, run
the script locally. No SSH anywhere in the chain, and no credential on anybody's laptop.

Answer first, work after: a caller that waits for a provision to finish is a caller that
times out, so every long job gets a job id and `/jobs/<id>` tells the rest of the story.

  POST /provision     builds a copy — migrate/import or new-born
  POST /teardown      removes a copy's whole footprint from this machine
  POST /site          every job on the webroot (WEBROOT_JOBS) + core-manifest-write
  POST /agent-token   returns the agent's PAT for a label
  GET  /jobs/<id>     how far a job has got

There is NO `/github`, `/repos` or `repos.json`. This is the Tracy Cowork fleet: the site copy IS the
source of truth, every change is a commit into the bare repo next to the webroot (ADR 0073). No GitHub
repo pushes code down here, so there is nothing to listen to. The push→deploy lane (ADR 0045/0050) belongs to
Tracy Desk and stays on the old fleet host — see `docs/adr/0005`.

Config: `/etc/tracy/hooks.env` sets `FLEET_RELAY_SECRET` (shared with seat-registry).
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
PROVISION = "/opt/tracy-fleet/provision/provision.sh"
TEARDOWN = "/opt/tracy-fleet/provision/teardown.sh"
GO_LIVE = "/opt/tracy-fleet/provision/go-live.sh"
ATTACH_SITE = "/opt/tracy-fleet/provision/attach-site.sh"
DSH_VERSIONS = "/opt/tracy-fleet/provision/dsh-versions.mjs"
# This host's name in seat-registry's `FLEET_HOSTS`. It rides along with every answer of
# `/dsh-versions`, so the two sides cannot drift apart while the screen still looks plausible.
HOST_NAME = "contabo"
LOG_DIR = "/var/log/tracy-hooks"
JOB_DIR = "/var/lib/tracy-jobs"

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
# The customer's domain. It goes onto the command line AND into the tunnel's ingress, so it is guarded at the gate,
# not in the script: the gate is the only place that sees what the caller really sent.
SAFE_DOMAIN = __import__("re").compile(r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-)){1,10}$")
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
    """A webroot job, run locally: answer first, run after, the result goes into the job record."""
    label = body["label"]
    kind = body["kind"]
    script, fixed = WEBROOT_JOBS[kind]
    args = ["bash", f"/opt/tracy-fleet/webroot/{script}", "--label", label]
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


def go_live(job_id: str, body: dict) -> None:
    """Flips a copy between draft and live — mail, noindex, domain (ADR 0086 §3).

    The fleet does NOT decide whether a site is published; it only makes the copy fit to receive real
    traffic. The `publish_state` flag belongs to the relay, and the relay flips it AFTER this job finishes (towards
    live) or BEFORE calling (towards draft) — see the note at `handleGoLive`.
    """
    label = body["label"]
    op = body["op"]
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = f"{LOG_DIR}/go-live-{label}.log"

    args = ["stdbuf", "-oL", "bash", GO_LIVE, "--label", label, "--op", op]
    for d in body.get("domains") or []:
        args += ["--domain", d]

    write_job(job_id, state="running", step=f"go-live:{op}", label=label)
    tail = deque(maxlen=200)
    try:
        with open(log_path, "a") as fh:
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in proc.stdout:
                fh.write(line); fh.flush()
                tail.append(line)
            code = proc.wait()
        write_job(job_id, state="done" if code == 0 else "failed", exitCode=code,
                  output="".join(tail))
    except Exception as exc:  # noqa: BLE001 - the job record is the only reader
        write_job(job_id, state="failed", error=str(exc)[:500])


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
        """Seven doors, all signed with FLEET_RELAY_SECRET. There is no door for GitHub.

        This is the Cowork fleet: the site copy IS the source of truth (ADR 0073), no repo
        pushes code down, so there is no `/github`, `/repos` or `repos.json`. That lane belongs to Tracy
        Desk and stays on the old fleet host — see docs/adr/0005.
        """
        if self.path == "/provision":
            return self._provision()
        if self.path == "/site":
            return self._site()
        if self.path == "/agent-token":
            return self._agent_token()
        if self.path == "/teardown":
            return self._teardown()
        if self.path == "/go-live":
            return self._go_live()
        if self.path == "/site-attach":
            return self._site_attach()
        if self.path == "/dsh-versions":
            return self._dsh_versions()
        return self._answer(404, "not here")

    def _site_attach(self) -> None:
        """Show one site's folder to the dsh this host runs. Relay door — FLEET_RELAY_SECRET.

        Since Plan 3 each host has only ONE dsh, and it sees a site correctly when that site's folder
        is bound to `/srv/tracy-sites/<label>`. This door is the on-host half of that: the caller
        (seat-registry) has no shell on this machine, and must not have one.

        SYNCHRONOUS, not a background job: binding a folder takes a millisecond,
        not minutes, so a job id for the caller to come back with costs more than the answer.

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

    def _go_live(self) -> None:
        """Flips draft↔live. A relay door, not a user door — signed with FLEET_RELAY_SECRET.

        `op` is one of two words and has no default: a door that flips state by guessing what the caller
        meant is a door that flips the wrong way on exactly the day the caller mistypes.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")

        # PATTERN first, EXISTENCE after. The other way round every malformed request answers "no such site",
        # and the caller goes looking for a correctly typed label while the real error is in `op`. Measured 29/08: an
        # unknown `op`, an unknown key and a bad domain all got that same 404.
        label = str(payload.get("label", ""))
        if not label or not SAFE_ARG.match(label):
            return self._answer(400, "refused label")
        if payload.get("op") not in ("live", "draft"):
            return self._answer(400, "need op: live or draft")

        domains = payload.get("domains") or []
        if not isinstance(domains, list) or len(domains) > 10:
            return self._answer(400, "refused domains")
        for d in domains:
            if not isinstance(d, str) or not SAFE_DOMAIN.match(d):
                return self._answer(400, f"refused domain: {d!r}"[:120])
        for key in payload:
            if key not in ("label", "op", "domains"):
                return self._answer(400, f"refused {key}")

        if not os.path.isdir(f"/srv/tracy/{label}"):
            return self._answer(404, "no such site")

        job_id = uuid.uuid4().hex[:12]
        write_job(job_id, state="queued", step=f"go-live:{payload['op']}", label=label)
        threading.Thread(target=go_live, args=(job_id, payload), daemon=True).start()
        return self._answer(202, json.dumps({"jobId": job_id}), "application/json")

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

    def _site(self) -> None:
        """Every job on a copy's webroot — the only door the agent and the user go through.

        This door used to be called `/reskin` and dispatched three families of jobs (reskin, try-on, diagnostics) that
        Cowork does not have. Now it keeps exactly what it really does: read/write/record the webroot
        (`WEBROOT_JOBS`) and write the core-zone manifest.

        `core-manifest-write` is NOT in `WEBROOT_JOBS` because it runs no script — it writes
        a JSON file directly. But it belongs to this same door, and dropping it throws the core zone wide open: the gate
        in `webroot-edit.sh` reads exactly the file it writes (ADR 0070); without the file the gate falls back to the
        default list and a CMS core file becomes writable without anyone knowing.
        """
        body = self.rfile.read(int(self.headers.get("content-length", "0")))
        if not self._relay_signed(body, self.headers.get("x-tracy-signature", "")):
            return self._answer(403, "bad signature")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return self._answer(400, "not json")

        kind = payload.get("kind")
        if kind not in WEBROOT_JOBS and kind != "core-manifest-write":
            return self._answer(400, "unknown kind")
        if not payload.get("label"):
            return self._answer(400, "need label")

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
        return self._answer(400, "unknown kind")

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
