#!/usr/bin/env bash
# The two steps that turn a Tracy EmDash quickstart into a running site, written ONCE.
#
# Two callers reach them by different roads, and the difference is only where the bytes come from:
#
#   deploy-quickstart.sh   a release directory (manifest.json + SHA256SUMS + the two assets),
#                          downloaded from ja-products or already on disk — the demo-host road.
#   platform/emdash.sh     the pinned catalog (`quickstarts.json`, fetched and checksummed by
#                          `quickstart.py`) — the road a customer's site takes through provision.
#
# What happens to the bytes afterwards is identical, and it was written twice for one day. These
# functions are that day's correction: a fix to how an image is built, or to who owns the restored
# files, must not be a thing you can apply to one road and forget on the other.
#
# Both are IDEMPOTENT, and deliberately so. A provision that failed halfway is retried by the same
# command: an image that exists is not rebuilt (the tag carries the template's version, so the same
# tag IS the same source), and a site that already holds content is never restored over. Restoring
# twice would overwrite an editor's work with the demo content the site shipped with.

# emdash_json_field <file> <dotted.path> — one string field of a JSON file, empty when absent.
emdash_json_field() {
  node -e '
    const [file, path] = process.argv.slice(1)
    let v
    try { v = JSON.parse(require("fs").readFileSync(file, "utf8")) } catch { v = undefined }
    for (const k of path.split(".")) v = v == null ? undefined : v[k]
    process.stdout.write(typeof v === "string" ? v : "")
  ' "$1" "$2" 2>/dev/null || true
}

# emdash_complete_source <app-dir>
#
# A template cut from the kit ships its source, seed and tools, but the three files only the fleet
# needs — a Dockerfile, its entrypoint, and artifact.json — only when its author added them. Tracy
# Business did; Tracy SaaS 1.0.0 did not, and its provision died at `docker build` with "lstat
# app.new/Dockerfile: no such file" before a line of the template ran (dev, 16/09). What is missing
# is filled from the stock copies beside this script, and artifact.json from the template's OWN
# generator (tools/artifact.mjs, part of every kit cut) so its checksums are the template's, not
# ours. What is present is never touched: a template's own recipe wins.
#
# Sets EMDASH_BUILD_ARGS: the stock Dockerfile takes its three labels as build args read from the
# package (template.config.json, package.json); a template's own Dockerfile gets none, so `docker
# build` does not warn about arguments it never declared — except the Content API switch below,
# which is only passed to a Dockerfile that declares it. (The `${arr[@]+"${arr[@]}"}` spelling is
# for bash 3.2 under `set -u`, where an empty array is an unbound variable.)
emdash_complete_source() {
  local app="$1" here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  EMDASH_BUILD_ARGS=()
  if [ ! -f "$app/Dockerfile" ]; then
    echo "==> the package ships no Dockerfile — building with the fleet's stock one"
    cp "$here/quickstart.Dockerfile" "$app/Dockerfile" || return 1
    # Read with node, not jq: the tracy-host image carries node (this script's neighbours run on
    # it) and no jq — measured 16/09 on dev, where `which jq` answers nothing.
    local id ver cms
    id="$(emdash_json_field "$app/template.config.json" id)"
    ver="$(emdash_json_field "$app/template.config.json" version)"
    cms="$(emdash_json_field "$app/package.json" dependencies.emdash)"
    EMDASH_BUILD_ARGS=(
      --build-arg "TEMPLATE_ID=${id:-unknown}"
      --build-arg "TEMPLATE_VERSION=${ver:-0.0.0}"
      --build-arg "CMS_VERSION=${cms:-unknown}"
    )
  fi
  if [ ! -f "$app/tools/docker-entrypoint.sh" ]; then
    mkdir -p "$app/tools"
    cp "$here/quickstart-entrypoint.sh" "$app/tools/docker-entrypoint.sh" || return 1
  fi
  # 🔒 A PACKAGE THAT CANNOT SAY THE CUSTOMER'S NAME IS COMPLETED HERE TOO. The build's personalize
  # stage runs `node tools/personalize.mjs` inside the site's container with the answers from the
  # questionnaire; a template cut from a kit older than 20/09/2026 ships no such tool, and the stage
  # could only skip — while the customer HAD answered (Tracy falls back to the CMS's own question
  # set when a release carries none), so their business name went nowhere and the site kept the
  # template's demo brand. Measured 19/09 on tracy-saas 1.0.0: zero files matching `personalize`.
  #
  # The tool is generic — what it writes comes from `seed/personalize.json`, the template's own map
  # — so the fleet can carry the tool for every template and a map only for the ones it has one for.
  # A package that brings either of its own keeps it: the template's word about its own content wins
  # over ours, always. Re-releasing a package with all three is what retires this completion; until
  # then a customer's site is personalized instead of apologized to.
  #
  # TWO PLACES TO FIND THE TOOL, AND BOTH ARE THE SAME FILE. In the image it is copied to
  # `personalize/personalize.mjs` beside this script (apps/tracy-host/Dockerfile); in a checkout it
  # is where it is authored and tested, under `packages/cms/tracy-emdash-theme-business/tools/`.
  # One home, no checked-in fourth copy to drift — and a provision run from a developer's tree
  # completes a package the same way the fleet does, instead of quietly skipping the step.
  if [ ! -f "$app/tools/personalize.mjs" ]; then
    local _p_tool=""
    for _p_try in \
      "$here/personalize/personalize.mjs" \
      "$here/../../../../../cms/tracy-emdash-theme-business/tools/personalize.mjs"
    do
      [ -f "$_p_try" ] && { _p_tool="$_p_try"; break; }
    done
    if [ -n "$_p_tool" ]; then
      echo "==> the package ships no personalize tool — completing it from the fleet's own copy"
      mkdir -p "$app/tools"
      cp "$_p_tool" "$app/tools/personalize.mjs" || return 1
    else
      echo "!! the package ships no personalize tool and the fleet has none to complete it with;" >&2
      echo "   this site will keep the template's demo words until an agent writes the customer's" >&2
    fi
  fi
  local _p_id _p_file _p_try
  _p_id="$(emdash_json_field "$app/template.config.json" id)"
  if [ -n "$_p_id" ] && [ -d "$here/personalize/$_p_id" ]; then
    mkdir -p "$app/seed"
    for _p_file in personalize.json questions.json; do
      if [ ! -f "$app/seed/$_p_file" ] && [ -f "$here/personalize/$_p_id/$_p_file" ]; then
        echo "==> the package ships no seed/$_p_file — using the fleet's map for $_p_id"
        cp "$here/personalize/$_p_id/$_p_file" "$app/seed/$_p_file" || return 1
      fi
    done
  fi
  if [ ! -f "$app/artifact.json" ]; then
    if [ ! -f "$app/tools/artifact.mjs" ]; then
      echo "!! the package has neither artifact.json nor tools/artifact.mjs to make one" >&2
      return 1
    fi
    echo "==> the package ships no artifact.json — generating it with its own tools/artifact.mjs"
    (cd "$app" && node tools/artifact.mjs artifact.json >/dev/null) || return 1
  fi
  if emdash_wants_reader "$app"; then
    EMDASH_BUILD_ARGS+=(--build-arg "TRACY_CONTENT_API_SCALARS=1")
  fi
}

# emdash_wants_reader <app-dir>
#
# 🔒 A PACKAGE THAT SHIPS THE CONTENT API READER IS BUILT WITH IT. Tracy Business packages cut
# before 27/09/2026 (up to 1.4.5) ship tools/content-api/ but their own Dockerfile defaults
# `ARG TRACY_CONTENT_API_SCALARS=0` (opt-in), and nothing passed the switch: the image came out
# labelled io.tracy.content-api.scalars=0, platform/emdash.sh skipped the relay token and the
# identity fork, and every Tracy read of the site answered CONTENT_ADAPTER_UNSUPPORTED — so a
# Comment pick arrived `unchecked` and describe said "unsupported". Measured 28/09/2026 on the bench
# stand (benchemdash02/03, Business 1.4.5). Only a Dockerfile that DECLARES the arg gets it, so a
# template with its own recipe that never heard of the reader builds as before, without an
# unknown-argument warning.
emdash_wants_reader() {
  local app="$1"
  [ -f "$app/tools/content-api/integration.mjs" ] &&
    grep -Eq '^[[:space:]]*ARG[[:space:]]+TRACY_CONTENT_API_SCALARS([=[:space:]]|$)' "$app/Dockerfile" 2>/dev/null
}

# emdash_build_image <zip> <image> <app-dir> [expected-artifact-hash]
#
# Unpacks the packed template beside the site and builds its image on THIS host — there is no image
# registry in the fleet (ADR 0014), so the source travels and the build happens where the site runs.
# `app.prev` keeps the previous unpack for one deploy: an image that will not build leaves the site
# serving the old one rather than standing on an empty directory.
emdash_build_image() {
  local zip="$1" image="$2" dir="$3" expected="${4:-}"
  # A unique unpack directory PER RUN, not a fixed shared one: two provisions of the same site can
  # run at once, and a shared unpack dir lets one `rm -rf` the tree out from under the other's
  # `docker build` — measured on a demo redeploy (16/09). The per-label lock in provision.sh does
  # not serialize this build: the platform file that calls this is sourced BEFORE that lock is
  # taken, so the collision is fenced off here with the run's own directory.
  # $$ is the provision run's own pid, so two concurrent runs never name the same one; the RETURN
  # trap removes it on every path out (on success it has already become `app`, so the rm is a no-op).
  local build="$dir/app.build.$$"
  rm -rf "$build"
  mkdir -p "$build"
  # 🔒 A `RETURN` TRAP IS NOT SCOPED TO THE FUNCTION THAT SET IT — it fires AGAIN when the sourced
  # file that called the function returns, and by then `local build` is gone. Under this script's
  # `set -u` that second firing is fatal:
  #     provision.sh: line 324: build: unbound variable
  # Line 324 is `. "$HERE/platform/$PLATFORM.sh"` — the source, not this function, which is why the
  # message names a file that never mentions `build`. Measured 19/09/2026 on the first EmDash
  # provision that got this far: the image was BUILT (1.01 GB, `tracy/tracy-business-emdash:1.0.1`)
  # and the run then died one line later, so every second of that work was thrown away. Reproduced
  # in the container's bash 5.2 in eight lines; macOS bash 3.2 does not show it.
  # Two changes, both needed: the path is expanded NOW so the handler never reads a dead local, and
  # the handler disarms itself so the source-return firing is a no-op instead of a second `rm`.
  trap "trap - RETURN; rm -rf $(printf '%q' "$build")" RETURN
  unzip -q "$zip" -d "$build" || return 1
  local got
  got="$(jq -r '.artifactHash // empty' "$build/distribution.json" 2>/dev/null || true)"
  if [ -n "$expected" ] && [ "$got" != "$expected" ]; then
    echo "!! unzipped distribution.json says ${got:-nothing}, the release says $expected" >&2
    return 1
  fi
  # 🔒 THE UNPACKED SOURCE IS DATED NOW, NOT WHEN THE ZIP SAYS. A release zip is packed with `zip -X`,
  # so each entry keeps only its DOS time: a wall-clock time with no zone, written in the packing
  # machine's zone and read back in this host's. Packed in +07 and unpacked here in UTC, every source file
  # of Tracy Business 1.7.11 came out seven hours in the future — newer than the build the image makes
  # from it a minute later — and `site.rebuild`'s slot-pin check (tracy-site-build-emdash
  # `slot-pins.mjs`), which reads only the files saved since the last build, read the whole template as
  # just written by the agent: the first rebuild of every new site named eight classes nobody wrote
  # (TCH #1134 walkthrough, dswalkem02, 11/10/2026). Touching the tree here puts every source file
  # before the image's own build, for every release already published.
  find "$build" -exec touch -h -c {} + || return 1
  # An image of this tag built WITHOUT the reader its package ships (a host that built Business
  # 1.4.5 before the switch above existed) is rebuilt once, or every later site of that version
  # would reuse it and stay unreadable. Its label is what platform/emdash.sh reads to register the
  # relay token, so the label is the thing checked here too.
  local have=0 stale=0
  docker image inspect "$image" >/dev/null 2>&1 && have=1
  if [ "$have" = 1 ] && emdash_wants_reader "$build" &&
    [ "$(docker image inspect "$image" --format '{{ index .Config.Labels "io.tracy.content-api.scalars" }}' 2>/dev/null)" != 1 ]; then
    stale=1
  fi
  if [ "$have" = 1 ] && [ "$stale" = 0 ]; then
    echo "==> image $image exists — not rebuilding"
    # Not a `stage`: nothing was spent, and a zero-second entry in the ranked summary is noise.
    :
  else
    [ "$stale" = 1 ] && echo "==> image $image was built without the Content API reader its package ships — rebuilding it with the reader"
    emdash_complete_source "$build" || return 1
    # 🔒 `stage`, NOT `echo` — the byte on stdout is identical, the timing log gains the boundary.
    # This is the most expensive single thing an EmDash provision does: a site's own 1.01 GB image,
    # measured at 210s on the first build of a template. Until 21/09 the line above printed a step
    # to the customer and recorded nothing, so all of it was charged to whatever stage was open —
    # on EmDash that was `site network`, a stage whose own work takes milliseconds.
    #
    # Safe when this file is sourced on its own (the tests do that): `stage` is defined by
    # provision.sh, so fall back to the same `echo` when it is not there. A missing timing line is
    # the harmless half; a `command not found` in the middle of a provision is not.
    if command -v stage >/dev/null 2>&1; then stage "docker build $image"; else echo "==> docker build $image"; fi
    # BuildKit, not the deprecated legacy builder: the legacy image store corrupts its own snapshot
    # cache when two builds touch it at once ("parent snapshot ... does not exist", measured on the
    # same redeploy), and it prints a DEPRECATED warning on every run. `-q` still prints just the
    # image id under BuildKit.
    DOCKER_BUILDKIT=1 docker build -q ${EMDASH_BUILD_ARGS[@]+"${EMDASH_BUILD_ARGS[@]}"} -t "$image" "$build" >/dev/null || return 1
  fi
  [ -d "$dir/app" ] && { rm -rf "$dir/app.prev"; mv "$dir/app" "$dir/app.prev"; }
  mv "$build" "$dir/app"
}

# emdash_tools_image <quickstart image>
#
# Sets EMDASH_TOOLS_IMAGE to the image the site should run: the quickstart's own image with the
# agent's tools on top — the layer `web/emdash.Dockerfile` puts on a bare EmDash image (git, ripgrep,
# jq, python3, chromium and fonts, the site-mail shim) — tagged `<image>-tools`. A variable and not
# stdout, because the build narrates on stdout (`stage`), which is how the customer sees the step.
#
# 🔒 WITHOUT IT THE AGENT CANNOT SEE ITS OWN SITE. `page.look` and `page.text` run chromium INSIDE
# the site's web container (#154, `tracy-site-tools/src/host/exec.mjs`), and a quickstart image is
# built from the template's own Dockerfile (`node:24` slim), which ships no browser. The bare-EmDash
# derivation (`tracy_emdash_web_image`) only knows `tracy/emdash:*` tags, so a quickstart skipped it
# and every EmDash Business site on every host answered NOCHROME (measured 24/09/2026 on the local
# stand: node present, chromium absent). The same layer on the Business image was measured the same
# day: built in 155 s, labels, entrypoint and command kept, chromium as www-data screenshots the site
# over loopback in 6 s.
#
# Built here, on first use, because the quickstart image itself is built here — no `web/build.sh`
# run could have made it in advance. Rebuilt when its inputs move: the Dockerfile, every file it
# COPYs from `tracy-web-files`, and the base image's ID (a template rebuilt under the same tag must
# not keep yesterday's layer). Lenient like every new-site answer in `lib/web-image.sh`: no web/
# directory, or a build that fails, leaves the site on the plain image and says so — the site works,
# only its agent is blind.
emdash_tools_image() {
  local base="$1" tools="$1-tools" web base_id inputs want have f
  EMDASH_TOOLS_IMAGE="$base"
  if ! command -v tracy_web_dir >/dev/null 2>&1 || ! web="$(tracy_web_dir)"; then
    echo "!! no web/emdash.Dockerfile beside these scripts — $base keeps no agent tools (no browser for page.look)" >&2
    return 0
  fi
  base_id="$(docker image inspect --format '{{.Id}}' "$base" 2>/dev/null || true)"
  if [ -z "$base_id" ]; then
    echo "!! $base is not on this host — no agent tools layer" >&2
    return 0
  fi
  # The files the Dockerfile takes from the named context, read off the Dockerfile itself, so a new
  # COPY line is an input without anyone remembering to list it here.
  inputs="$(awk '$1 == "COPY" && $2 == "--from=tracy-web-files" { for (i = 3; i <= NF; i++) if ($i !~ /^--/) { print $i; break } }' "$web/emdash.Dockerfile")"
  want="$( { cat "$web/emdash.Dockerfile"; for f in $inputs; do printf '\n--- %s\n' "$f"; cat "$web/$f"; done; printf '\n--- base %s\n' "$base_id"; } | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-64)"
  have="$(docker image inspect --format '{{ index .Config.Labels "tracy.web.inputs" }}' "$tools" 2>/dev/null || true)"
  if [ "$have" = "$want" ]; then
    echo "==> image $tools has this template's agent tools — not rebuilding"
  else
    if command -v stage >/dev/null 2>&1; then stage "docker build $tools (agent tools)"; else echo "==> docker build $tools (agent tools)"; fi
    if ! DOCKER_BUILDKIT=1 docker build -q -f "$web/emdash.Dockerfile" --build-arg BASE="$base" \
           --build-context tracy-web-files="$web" \
           --label tracy.web.inputs="$want" \
           -t "$tools" "$web" >/dev/null; then
      echo "!! could not build $tools — the site runs $base, whose agent has no browser for page.look" >&2
      return 0
    fi
  fi
  EMDASH_TOOLS_IMAGE="$tools"
}

# emdash_restore_state <state.tar.gz> <site-dir>
#
# The demo content, media and scrubbed database the release carries. Restored ONCE: a site that
# already has `data/data.db` is a site somebody has been editing, and the snapshot is older than
# their work by definition. Files end up owned by 33:33 — www-data inside the image, the only user
# that writes to them.
emdash_restore_state() {
  local tarball="$1" dir="$2"
  if [ -f "$dir/data/data.db" ]; then
    echo "==> $dir/data exists — keeping the site's content"
    return 0
  fi
  echo "==> restoring the state snapshot"
  mkdir -p "$dir"
  tar -xzf "$tarball" -C "$dir" || return 1
  [ -f "$dir/data/data.db" ] || { echo "!! snapshot did not produce data/data.db" >&2; return 1; }
  mkdir -p "$dir/uploads"
  chown -R 33:33 "$dir/data" "$dir/uploads"
}
