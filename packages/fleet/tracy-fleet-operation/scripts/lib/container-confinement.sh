#!/usr/bin/env bash
#
# Is a site's web container still wearing the confinement the host boundary now rests on?
#
# ## Why this exists, and why it is load-bearing rather than tidy
#
# From Plan 3 the agent's shell is `docker exec` into `<label>-web-1`, routed through the socket
# proxy in `dsh/docker-proxy.haproxy.cfg`. That proxy bounds WHICH container may be exec'd into.
# It cannot bound the exec's REQUEST BODY — a path rule has no opinion about JSON — so measured
# 06/09/2026 through the committed config:
#
#   POST /v1.51/containers/<label>-web-1/exec  {"Privileged":true,"User":"0",…}   -> 201
#   POST /v1.51/exec/<64hex>/start                                                -> 200
#   inside: uid 0, CapEff 000001ffffffffff (every capability)
#
# versus a normal exec, which came back uid 33 with CapEff 0000000000000000.
#
# 🔒 SO THE SECOND BOUNDARY IS THE WEB CONTAINER'S OWN CONFINEMENT, and nothing used to pin it.
# In the same measurement the escape attempt failed — `mount` denied, no block device in /dev —
# but it failed because that container happened to run Docker's DEFAULT seccomp/AppArmor profile.
# A site started once with `--privileged` or `--security-opt seccomp=unconfined` (a debugging
# session someone never undid is the realistic way) turns "the agent can run commands in the site's
# web container" into "the agent can be root on the host", and NOTHING about the running system
# looks different: the site serves, the agent works, the proxy still refuses everything it always
# refused.
#
# This file is the parsing half of the check, split out for the same reason `mounts.sh` was:
# `attach-site.sh` refuses to run without root on Linux, so every branch inside it is unreachable
# from a test on the machine anyone writes it on.

# container_confinement_problem <HostConfig.Privileged> <HostConfig.SecurityOpt>
#
# Both arguments are `docker inspect --format` output, verbatim. Prints ONE line naming the
# problem, or an empty line when the container is confined. It never decides what to do about it;
# the caller does.
#
# The shapes docker actually prints (measured 06/09/2026, Docker 29.4.1) — the Go template renders
# a nil slice as `[]` and a populated one space-separated inside brackets, which is neither JSON
# nor a shell list:
#
#   false []                                     a normal container
#   false [no-new-privileges:true]               a normal container, hardened
#   false [seccomp=unconfined apparmor=unconfined]
#   true  [label=disable]                        --privileged (docker adds label=disable itself)
#
# ⚠ SUBSTRING MATCHING, ON PURPOSE. The field is a list with no separator this shell can rely on,
# and the two strings being looked for cannot occur in a legitimate value: a custom profile is
# `seccomp=/path/to.json`, not `seccomp=unconfined`. Trying to split the list properly would be a
# second parser of a format docker does not promise, for no gain.
container_confinement_problem() {
  local privileged="${1:-}" security_opt="${2:-}" lowered

  # `True` is what a JSON-ish source would print; the Go template prints `true`. Both are accepted
  # because the cost of accepting one spelling too many is nothing, and the cost of missing one is
  # a privileged container that reads as confined.
  case "$privileged" in
    true|True|TRUE)
      printf 'the container runs --privileged (every capability, and docker turns SELinux off with it)\n'
      return 0
      ;;
  esac

  lowered="$(printf '%s' "$security_opt" | tr '[:upper:]' '[:lower:]')"
  case "$lowered" in
    *seccomp=unconfined*)
      printf 'the container runs with seccomp=unconfined — the syscall filter that stopped the escape in the 06/09 measurement\n'
      return 0
      ;;
    *apparmor=unconfined*)
      printf 'the container runs with apparmor=unconfined — the LSM profile the host boundary now rests on\n'
      return 0
      ;;
  esac

  # Confined as far as this check can tell. It is deliberately a SHORT list: these three are the
  # settings that remove the default profile wholesale. A container narrowed in other ways (a
  # custom seccomp json, added capabilities) is a judgement call, and a check that guessed at it
  # would refuse sites for reasons an operator cannot act on.
  printf '\n'
}
