#!/usr/bin/env bash
# Per-site network isolation (P0, tasks/todo-tch-opensource.md). Sourced, never run.
#
# An isolated site's web container is only on its own `<label>_default` network (render-compose.sh,
# marker `<private dir>/network-isolated`). tracy-web joins that network with the alias `tracy-web`,
# which is how it dials the site (`<label>-web-1`) and how the site posts its mail back
# (`http://tracy-web:8080/_site-mail`). Nothing else on the host shares the network: site A can no
# longer reach site B's container, by name or by address.
#
# 🔒 A `docker network connect` does not survive a recreate of tracy-web: deploy-tracy-stack.sh §6b
# re-joins every site network on each deploy, and `tracy_join_site_network` is idempotent so every
# path (provision, restore, the migration tool) can call it again.

# The tracy-web container of THIS stack: the one with service label tracy-web on the stack's shared
# network (`TRACY_SITE_NETWORK`, default tracy_tracy) — several stacks can share one Docker daemon.
tracy_stack_container() {
  local service="$1" net="${TRACY_SITE_NETWORK:-tracy_tracy}" id
  for id in $(docker network inspect "$net" --format '{{range $k, $v := .Containers}}{{$k}} {{end}}' 2>/dev/null); do
    if [ "$(docker inspect "$id" --format '{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null)" = "$service" ]; then
      printf '%s' "$id"
      return 0
    fi
  done
  return 1
}
tracy_web_container() { tracy_stack_container tracy-web; }
# tracy-host is on the shared network only on a macOS stand (compose.macos.yml takes it off the host
# network); there it dials the site by name while provisioning, so it must join the site network too.
tracy_host_container() { tracy_stack_container tracy-host; }

# Joins tracy-web to `<label>_default` with the alias `tracy-web`, and tracy-host when it is on the
# shared network. Already joined: nothing changes.
tracy_join_site_network() {
  local label="$1" net="${1}_default" web joined
  web="$(tracy_web_container)" || { echo "site-network: no tracy-web container on ${TRACY_SITE_NETWORK:-tracy_tracy}" >&2; return 1; }
  docker network inspect "$net" >/dev/null 2>&1 || { echo "site-network: no network $net" >&2; return 1; }
  joined="$(docker inspect "$web" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  case " $joined " in *" $net "*) : ;; *) docker network connect --alias tracy-web "$net" "$web" || return 1 ;; esac
  local host
  host="$(tracy_host_container)" || return 0
  joined="$(docker inspect "$host" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  case " $joined " in *" $net "*) return 0 ;; esac
  docker network connect "$net" "$host"
}

# True when the site's web container sits on the shared network (not isolated, or not yet recreated).
tracy_site_on_shared_network() {
  local nets
  nets="$(docker inspect "${1}-web-1" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  case " $nets " in *" ${TRACY_SITE_NETWORK:-tracy_tracy} "*) return 0 ;; esac
  return 1
}
