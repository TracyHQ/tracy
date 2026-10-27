# The web container of an EmDash site, plus what the agent's shell needs inside it.
#
# WHY THIS FILE EXISTS AT ALL, when the other two platforms could have been the whole story:
# EmDash's runtime image is `node:22-slim` (upstream Dockerfile, read 2026-09-06). Debian, so
# `bash`, `www-data` and `nobody` are already there — but `git`, `ripgrep`, `less` and `jq` are
# not, and dsh's grep tool shells out to `rg`. An EmDash site left on the bare image gives its
# agent a shell whose search tool fails with ENOENT, which reads as "the site has nothing in it".
#
# BASE is the tracy/emdash image already on this host, version and all — `emdash/build-image.sh`
# builds those, this only layers on top. The tag keeps the same version so the question "which
# EmDash is this site running" still has one answer:
#
#   docker build -f packages/fleet/tracy-fleet-operation/web/emdash.Dockerfile \
#     --build-context tracy-web-files=packages/fleet/tracy-fleet-operation/web \
#     --build-arg BASE=tracy/emdash:0.34.0 -t tracy/web-emdash:0.34.0 .
#
# No line in web/IMAGE_TAGS: unlike the PHP platforms, the EmDash version is not a constant this
# repo picks — platform/emdash.sh reads the newest image present on the host and prefers the
# tracy/web-emdash of the same version when it is there.
ARG BASE
FROM ${BASE}

# Same four as the PHP images, same reasons — see web/wordpress.Dockerfile.
#
# python3, python3-pip — no Node install here: BASE already IS `node:22-slim` (see above), and
# unlike Debian trixie's `nodejs` apt package, `node:22-slim`'s Node 22 has `WebSocket` as a
# global with no flag — confirmed independently in fix round 1 (`docker run node:22-slim node -e
# "console.log(typeof WebSocket)"` → `function`), so this base was never affected by the bug that
# made web-clone's CDP path (`new WebSocket(url)` in `scripts/lib/system-browser.mjs`) crash on
# the other three images — see web/wordpress.Dockerfile. python3 is not on this base — the other
# skill, pptx-html-fidelity-audit, runs `scripts/extract_pptx.py` / `scripts/verify_layout.py`,
# both a hard `import pptx` (python-pptx from PyPI, hence pip below, pinned to an exact version
# for the same reason as the other three Dockerfiles).
#
# chromium, fonts-liberation, fonts-noto-color-emoji — see web/wordpress.Dockerfile for the full
# reasoning: web-clone drives a browser over CDP and its loader only reuses a system browser
# already on PATH (`chromium` is the exact name it searches, matching Debian's package — no
# symlink needed), never installs one itself. `node:22-slim` is Debian too (bookworm), so the
# same apt package applies here.
#
# fonts-dejavu-core — the fallback that carries Vietnamese. With only Liberation and Noto Color
# Emoji, a site whose own font subset stops at Latin-1 rendered "NỘI THẬT" as "N□I TH□T" in the
# agent's screenshots (measured 24/09/2026 on an EmDash Business site): the customer's page was
# fine, and the agent would have read broken text on it. Tracy's customers write Vietnamese.
# (This file is also the tools layer on a quickstart image — provision/emdash/quickstart-restore.sh.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ripgrep less jq curl ca-certificates python3 python3-pip \
      chromium fonts-liberation fonts-noto-color-emoji fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --break-system-packages python-pptx==1.0.2

# No Chromium sandbox is usable as `docker exec -u www-data` in an unprivileged container — see
# web/wordpress.Dockerfile for the full reasoning. This is the drop-in Debian's own
# `/usr/bin/chromium` wrapper documents for adding a flag without touching the command that calls
# it, which is what makes web-clone's launcher work unmodified.
RUN printf '%s\n' \
      '# Tracy: this container has no Chromium sandbox available (see web/wordpress.Dockerfile).' \
      'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox"' \
      > /etc/chromium.d/no-sandbox

# The two users `docker exec -u` names. Debian ships both; the check is here so an upstream base
# change that drops one is a failed build rather than a session that cannot open a shell.
RUN id www-data && id nobody

# Mail: no PHP here, but emdash-smtp's "PHP Mail / local sendmail" provider spawns `sendmail` from
# PATH (nodemailer's sendmail transport: `sendmail -i -f <from> <to...>`, message on stdin). So the
# shim is installed as /usr/sbin/sendmail as well, and choosing that provider is what routes an
# EmDash site's mail to tracy-web. A provision chooses it (#803): `platform_post_up` in
# provision/platform/emdash.sh proves this shim in the running container, then runs
# provision/emdash/configure-mail.mjs. A site provisioned before that keeps whatever its admin holds.
# `--from=tracy-web-files` is the named build context web/build.sh passes (see joomla.Dockerfile).
COPY --from=tracy-web-files --chmod=0755 tracy-sendmail /usr/local/bin/tracy-sendmail
RUN ln -sf /usr/local/bin/tracy-sendmail /usr/sbin/sendmail \
 && test -x /usr/sbin/sendmail
LABEL tracy.site-mail="v1"

# The native quickstart writer requires mutation receipts from the actual conditional write.
# Apply to a compatible CMS version regardless of the template; verify the bundled artifact first.
COPY --from=tracy-web-files emdash-conditional-core.tar.gz /tracy-conditional-receiver/core.tar.gz
COPY --from=tracy-web-files emdash-conditional-core.json /tracy-conditional-receiver/manifest.json
COPY --from=tracy-web-files emdash-conditional-core.LICENSE /tracy-conditional-receiver/LICENSE
COPY --from=tracy-web-files install-emdash-receiver.mjs /tracy-conditional-receiver/install.mjs
RUN node /tracy-conditional-receiver/install.mjs && rm -rf /tracy-conditional-receiver
