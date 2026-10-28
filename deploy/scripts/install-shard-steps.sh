#!/usr/bin/env bash
#
# install-shard-steps - steps 1-17 of install-shard.sh, sourced by it from the same directory.
#
# Not an entry point: every function here reads the globals, helpers and inputs install-shard.sh
# defines (say, note, warn, die, run, run_sh, run_secret, write_file, write_secret_file, mask_env,
# source_root, NAME, ZONE, ORIGIN, PHASE, SOURCE, FROM_DIR, WORK, ETC, S_<KEY>, ...), and
# install-shard.sh `source`s this file right before main. Two files because the repository keeps
# every code file under 800 lines (CLAUDE.md section 7) and docs/sre/hop-dong-cua-shard.md section
# 10 names this split: the entry file keeps inputs, validation, preflight and printing; this one
# keeps what each step does. They travel together, flat in /opt/tracy-fleet/stack (sync-fleet-files.sh
# --list, apps/tracy-host/Dockerfile).
#
# The order of the steps is the order of the functions below; main() in install-shard.sh calls them
# by name, so the step list at the top of install-shard.sh is the index of this file.

step_host_base() {
  local had_docker=0 wrote=0
  say "1. docker engine, /etc/docker/daemon.json, packages"
  if command -v docker >/dev/null 2>&1; then had_docker=1; fi
  if [ -f /etc/docker/daemon.json ] && [ "$DRY_RUN" = 0 ]; then
    note "/etc/docker/daemon.json exists - kept; it must carry the pools of $DOCKER_POOLS_CIDR that step 6 lets reach tracy-host"
  else
    # Written BEFORE docker's first start, so the daemon starts with the pools. Every site is a
    # compose project with its own network; without explicit pools dockerd hands out 172.17-172.31
    # and then 192.168.x, and runs out at a few hundred (deploy/compose.yml:376-389).
    write_file /etc/docker/daemon.json 0644 <<'DAEMON'
{
  "default-address-pools": [
    { "base": "10.200.0.0/16", "size": 24 },
    { "base": "10.201.0.0/16", "size": 24 }
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
DAEMON
    wrote=1
  fi
  if [ "$had_docker" = 1 ] && [ "$DRY_RUN" = 0 ]; then
    note "docker present: $(docker --version)"
    if [ "$wrote" = 1 ]; then run systemctl restart docker; fi
  else
    # The same apt lines as bootstrap.sh:18-28: bootstrap.sh itself is inside the image this step
    # needs docker to pull.
    run apt-get update -qq
    run apt-get install -y -qq ca-certificates curl gnupg
    run install -m 0755 -d /etc/apt/keyrings
    run_sh 'curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc'
    # curl -o keeps the mode of a file a failed run left behind; apt reads the key as _apt.
    run chmod a+r /etc/apt/keyrings/docker.asc
    run_sh 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list'
    run apt-get update -qq
    run apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  fi
  # jq, openssl: the heartbeat, the updater and this script. age, rclone: the R2 backup push.
  # chrony: the HMAC window is 120 s and three clouds keep three clocks (spec 3.1, item 45).
  run apt-get install -y -qq jq openssl age rclone chrony
}

gen_secret() {
  if [ "$DRY_RUN" = 1 ]; then echo dry-run-placeholder; return 0; fi
  case "$1" in
    base64) openssl rand -base64 32 ;;
    pg) openssl rand -hex 24 ;;
    *) openssl rand -hex 32 ;;
  esac
}

# Generated ONCE and kept in /etc/tracy/shard-secrets.env: a re-run after a failure, or with
# --force, reads them back instead of minting new ones (Review Focus 4 of the plan). A key LINE
# MISSING from a file an earlier run filled is never minted either (contract section 9): a deleted
# line is a question for the person, not a reason to sign every customer out; the run stops and
# names the key. GITHUB_WEBHOOK_SECRET is generated here, not an input (contract section 9):
# createSiteRepo sets it on each site repo's hook. It is the one key --force --rotate-webhook-secret
# mints again (and adds back when its line is missing).
SECRET_SPECS="SHARD_SECRET:hex HOST_SECRET:hex SESSION_SECRET:hex API_KEY_PEPPER:hex MCP_TRACY_ACTOR_SECRET:hex POSTGRES_PASSWORD:pg SEAT_PLAN_KEK:base64 GITHUB_WEBHOOK_SECRET:hex"
step_secrets() {
  local file="$ETC/shard-secrets.env" spec key kind value kept=0 made="" filled=0
  say "2. this shard's own secrets ($file: generated once, reused on every re-run, never printed)"
  # Non-empty before this run touches it: an earlier run generated keys, so every key must be there.
  if [ -s "$file" ]; then filled=1; fi
  if [ "$DRY_RUN" = 0 ]; then
    install -d -m 0755 "$ETC"
    [ -f "$file" ] || ( umask 077; : > "$file" )
  fi
  for spec in $SECRET_SPECS; do
    key="${spec%%:*}"
    kind="${spec#*:}"
    value="$(grep -m1 "^$key=" "$file" 2>/dev/null | cut -d= -f2- || true)"
    if [ -n "$value" ] && [ "$ROTATE_WEBHOOK" = 1 ] && [ "$key" = GITHUB_WEBHOOK_SECRET ]; then
      # Asked for by name. Hooks keep the old secret until each site's next job PATCHes them
      # (ensureRepoWebhook), so pushes in between are refused as badly signed.
      value="$(gen_secret "$kind")"
      made="$made $key"
      if [ "$DRY_RUN" = 1 ]; then
        note "would replace $key in $file (--rotate-webhook-secret)"
      else
        ( umask 077; { grep -v "^$key=" "$file" || true; printf '%s=%s\n' "$key" "$value"; } > "$file.tmp.$$" )
        mv -f "$file.tmp.$$" "$file"
      fi
    elif [ -n "$value" ]; then
      kept=$((kept + 1))
    elif [ "$filled" = 1 ] && ! { [ "$ROTATE_WEBHOOK" = 1 ] && [ "$key" = GITHUB_WEBHOOK_SECRET ]; }; then
      die "$file has no $key line, and a key this script generated is never minted again (a new SESSION_SECRET signs every customer out; a new HOST, actor or SHARD secret breaks a channel). Restore the line from 1Password; for GITHUB_WEBHOOK_SECRET only, --force --rotate-webhook-secret mints a new one. A first run cut off inside step 2: delete the file and run again, nothing has read it yet"
    else
      value="$(gen_secret "$kind")"
      made="$made $key"
      if [ "$DRY_RUN" = 1 ]; then note "would add $key to $file"; else ( umask 077; printf '%s=%s\n' "$key" "$value" >> "$file" ); fi
    fi
    printf -v "S_$key" '%s' "$value"
  done
  note "keeping $kept, generated:${made:- none}"
  write_secret_file "$ACTOR_FILE" "$S_MCP_TRACY_ACTOR_SECRET"
}

registry_login() {
  if [ "$REGISTRY_AUTH" = ecr ]; then ecr_login; return; fi
  if [ "$DRY_RUN" = 1 ]; then note "\$ docker login $REGISTRY -u $GHCR_USER --password-stdin   (the token on stdin)"; return 0; fi
  # printf is a builtin: the token reaches docker on stdin, never as an argv `ps` can show.
  printf '%s' "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin >/dev/null
  LOGGED_IN=1
}

# The pull key never enters an argv: printf (a builtin) writes it to a 0600 file in $WORK (0700) that
# only the aws-cli container reads (--env-file), removed before this returns; the token comes back
# on a pipe into `docker login`'s stdin. No AWS CLI on the VM: the pinned aws-cli image does it.
ecr_login() {
  local keyfile="$WORK/ecr-key.env"
  if [ "$DRY_RUN" = 1 ]; then
    note "\$ docker run --rm --env-file <0600 temp file: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION> $AWS_CLI_IMAGE ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY"
    return 0
  fi
  trap 'rm -f "${keyfile:-}"; trap - RETURN' RETURN
  ( umask 077; printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_REGION=%s\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$AWS_REGION" > "$keyfile" )
  docker run --rm --env-file "$keyfile" "$AWS_CLI_IMAGE" ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
  LOGGED_IN=1
}

# /etc/tracy/registry.env, read by tracy-updater.sh (contract section 9). A ghcr file is the two
# lines it always was, so an updater that predates REGISTRY_AUTH still reads it.
registry_env() {
  if [ "$REGISTRY_AUTH" = ecr ]; then
    printf '%s\n' \
      "# install-shard.sh: this shard's own ECR pull key (pull-only IAM user); tracy-updater.sh logs in with it and out again." \
      "REGISTRY_AUTH=ecr" \
      "TRACY_IMAGE_PREFIX=$TRACY_IMAGE_PREFIX" \
      "ECR_REGISTRY=$ECR_REGISTRY" \
      "AWS_REGION=$AWS_REGION" \
      "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" \
      "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
    return 0
  fi
  printf '%s\n' \
    "# install-shard.sh: this shard's own ghcr.io PAT (read:packages only, spec 8); tracy-updater.sh logs in with it and out again." \
    "GHCR_USER=$GHCR_USER" \
    "GHCR_TOKEN=$GHCR_TOKEN"
  [ "$TRACY_IMAGE_PREFIX" = ghcr.io/tracyhq ] || printf 'TRACY_IMAGE_PREFIX=%s\n' "$TRACY_IMAGE_PREFIX"
}

fetch_checkout() {
  local ref="${REPO_REF:-develop}"
  local paths="deploy packages/fleet/tracy-fleet-operation/dsh packages/fleet/tracy-fleet-operation/scripts packages/fleet/tracy-fleet-operation/web vendor/joomla/joomlart-t4-skill apps/tracy-web/scripts"
  if [ "$DRY_RUN" = 1 ]; then
    note "\$ GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraheader GIT_CONFIG_VALUE_0='AUTHORIZATION: bearer <REPO_TOKEN>' git clone --quiet --depth 1 --filter=blob:none --sparse --branch $ref https://github.com/$TRACY_SOURCE_REPO $WORK/tch"
    note "\$ git -C $WORK/tch sparse-checkout set $paths"
    return 0
  fi
  # The token rides in git's environment-borne config for these two commands only: not in a file,
  # not in the remote URL, not in an argv (GIT_CONFIG_COUNT, git >= 2.31; Ubuntu 24.04 ships 2.43).
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraheader GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer $REPO_TOKEN" \
    git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$ref" "https://github.com/$TRACY_SOURCE_REPO" "$WORK/tch"
  # shellcheck disable=SC2086
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraheader GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer $REPO_TOKEN" \
    git -C "$WORK/tch" sparse-checkout set $paths
}

step_fleet_files() {
  local cid
  say "3. $REGISTRY_AUTH login and the fleet files of $TRACY_APP_TAG ($SOURCE)"
  registry_env | write_file "$ETC/registry.env" 0600 env
  registry_login
  # sync-fleet-files.sh requires --dest to exist already and creates nothing above its own subdirectories.
  run install -d -m 0755 "$FLEET_DIR"
  if [ "$SOURCE" = git ]; then
    fetch_checkout
    run bash "$WORK/tch/deploy/scripts/sync-fleet-files.sh" --from-dir "$WORK/tch" --dest "$FLEET_DIR"
    return 0
  fi
  if [ "$SOURCE" = dir ]; then
    # A checkout-shaped directory rsynced onto this VM off a worktree (--from-dir, contract section
    # 10): the shard files before any image carries them (G1). The sync script inside it reads the
    # repo-path names and lays the flat layout down, exactly as from the image.
    run bash "$FROM_DIR/deploy/scripts/sync-fleet-files.sh" --from-dir "$FROM_DIR" --dest "$FLEET_DIR"
    return 0
  fi
  run docker pull -q "$HOST_IMAGE_REPO:$TRACY_APP_TAG"
  # /opt/tracy-fleet/stack is flat in the image as on this machine (contract section 10).
  if [ "$DRY_RUN" = 1 ]; then
    note "\$ docker create --pull never $HOST_IMAGE_REPO:$TRACY_APP_TAG; docker cp <id>:/opt/tracy-fleet/stack/sync-fleet-files.sh $WORK/"
  else
    cid="$(docker create --pull never "$HOST_IMAGE_REPO:$TRACY_APP_TAG")"
    if ! docker cp "$cid:/opt/tracy-fleet/stack/sync-fleet-files.sh" "$WORK/sync-fleet-files.sh" >/dev/null 2>&1; then
      docker rm -f "$cid" >/dev/null 2>&1 || true
      die "$HOST_IMAGE_REPO:$TRACY_APP_TAG carries no /opt/tracy-fleet/stack/sync-fleet-files.sh (built before W5 P4, or before the shard line); pass --from-dir <rsynced worktree>, or REPO_TOKEN and REPO_REF for a checkout"
    fi
    docker rm -f "$cid" >/dev/null
  fi
  run bash "$WORK/sync-fleet-files.sh" --from-image "$HOST_IMAGE_REPO:$TRACY_APP_TAG" --dest "$FLEET_DIR"
}

# bootstrap.sh makes tracy_tracy with a plain `docker network create` (bootstrap.sh:77-82); compose
# refuses a network of its own name it did not label ("has incorrect label com.docker.compose.network",
# compose >= 2.24; UNVERIFIED on d1). Nothing uses it yet on a fresh shard, so it is left to compose.
fix_network_owner() {
  local label users
  if [ "$DRY_RUN" = 1 ]; then note "\$ docker network rm tracy_tracy   (only when compose did not label it and nothing uses it)"; return 0; fi
  docker network inspect tracy_tracy >/dev/null 2>&1 || return 0
  label="$(docker network inspect tracy_tracy --format '{{index .Labels "com.docker.compose.network"}}' 2>/dev/null || true)"
  [ "$label" != tracy ] || return 0
  users="$(docker network inspect tracy_tracy --format '{{len .Containers}}' 2>/dev/null || echo 1)"
  if [ "$users" = 0 ]; then
    docker network rm tracy_tracy >/dev/null
    note "tracy_tracy (made by bootstrap.sh, unlabelled) removed; deploy-tracy-stack.sh makes its own"
  else
    warn "tracy_tracy is unlabelled and in use: left alone; if compose refuses it, stop what uses it and remove it"
  fi
}

step_bootstrap() {
  say "4. bootstrap.sh: node, git, python3, egress chain, iptables-persistent"
  # TRACY_NETWORK_PREFIX from the environment: otherwise bootstrap.sh reads it from tracy-web.env
  # (bootstrap.sh:75), which step 9 writes.
  run env TRACY_NETWORK_PREFIX="$NET_PREFIX" bash "$FLEET_DIR/provision/bootstrap.sh"
  fix_network_owner
}

step_kernel() {
  say "5. sysctl: keep the kernel's ephemeral ports off Tracy's ranges"
  write_file /etc/sysctl.d/90-tracy.conf 0644 <<'SYSCTL'
# install-shard.sh: 51700-51749 are Tracy's own loopback ports, 52000-52999 the pool provision.sh
# hands sites. Both sit inside Linux's ephemeral range (32768-60999), so an outgoing connection
# could take one first and race the allocator.
net.ipv4.ip_local_reserved_ports = 51700-51749,52000-52999
SYSCTL
  run sysctl -q --system
}

step_firewall() {
  say "6. inbound firewall (FIREWALL_MODE=$FIREWALL_MODE)"
  if [ "$FIREWALL_MODE" = cloud ]; then
    note "no host rules: the provider's firewall must open ONLY tcp/22 from $SSH_ALLOW_FROM;"
    note "  tracy-host listens on 0.0.0.0:51720 in the VM's namespace (deploy/compose.yml:163,181)"
    return 0
  fi
  # NOT ufw (it conflicts with bootstrap.sh's iptables-persistent): one chain of ours, saved by
  # netfilter-persistent. tcp/51720 from the docker networks: tracy-web dials tracy-host at
  # host.docker.internal across INPUT; dropped, every site creation is 502 FLEET_REFUSED with every
  # healthcheck green (docs/references/may-dev.md #1). udp 67->68: DHCP renewals. ESTABLISHED comes
  # before the DROP, so the ssh session running this survives. UNVERIFIED on a live VM (d1, G1 1.8).
  run_sh "iptables -N TRACY-INPUT 2>/dev/null || iptables -F TRACY-INPUT"
  run iptables -A TRACY-INPUT -i lo -j ACCEPT
  run iptables -A TRACY-INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  run iptables -A TRACY-INPUT -p icmp -j ACCEPT
  run iptables -A TRACY-INPUT -p udp --sport 67 --dport 68 -j ACCEPT
  run iptables -A TRACY-INPUT -p tcp --dport 22 -s "$SSH_ALLOW_FROM" -j ACCEPT
  run iptables -A TRACY-INPUT -p tcp --dport 51720 -s "$DOCKER_POOLS_CIDR" -j ACCEPT
  run iptables -A TRACY-INPUT -p tcp --dport 51720 -s "$NET_PREFIX.0/24" -j ACCEPT
  run iptables -A TRACY-INPUT -j DROP
  run_sh "iptables -C INPUT -j TRACY-INPUT 2>/dev/null || iptables -I INPUT 1 -j TRACY-INPUT"
  run_sh "ip6tables -N TRACY-INPUT 2>/dev/null || ip6tables -F TRACY-INPUT"
  run ip6tables -A TRACY-INPUT -i lo -j ACCEPT
  run ip6tables -A TRACY-INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  run ip6tables -A TRACY-INPUT -p ipv6-icmp -j ACCEPT
  run ip6tables -A TRACY-INPUT -p udp --dport 546 -j ACCEPT
  run ip6tables -A TRACY-INPUT -j DROP
  run_sh "ip6tables -C INPUT -j TRACY-INPUT 2>/dev/null || ip6tables -I INPUT 1 -j TRACY-INPUT"
  run netfilter-persistent save
}

step_time() {
  say "7. chrony"
  run systemctl enable --now chrony
  run_sh 'chronyc -a makestep >/dev/null || true'
}

step_dsh() {
  local cpus mem_gb dsh_mem status
  say "8. dsh: $ETC/host-dsh.env, then host-dsh-init.sh $NAME (W5 P1)"
  cpus="$(nproc 2>/dev/null || echo 8)"
  cpus=$((cpus / 2))
  [ "$cpus" -ge 2 ] || cpus=2
  [ "$cpus" -le 4 ] || cpus=4
  mem_gb=32
  if [ -r /proc/meminfo ]; then mem_gb=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1024 / 1024 )); fi
  if [ "$mem_gb" -ge 24 ]; then dsh_mem=8g; else dsh_mem=4g; fi
  if [ -f "$ETC/host-dsh.env" ] && [ "$FORCE" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    note "$ETC/host-dsh.env exists - kept (--force rewrites it)"
  else
    # Written BEFORE host-dsh-init.sh, which keeps an existing file (host-dsh-init.sh:400-401): dsh
    # then starts once, already holding its model key and site domain, instead of starting without
    # them. HOST_PRIVATE_ROOT is this layout's /srv/tracy-private: deploy-host-dsh.sh's default
    # /srv/tracy (deploy-host-dsh.sh:210-211) would make every tracy-access.php resync commit-less.
    {
      cat <<EOF
# /etc/tracy/host-dsh.env of shard $NAME - written by install-shard.sh. Names: dsh/host-dsh.env.example.
# Read twice: compose interpolates host-dsh.yml from it AND gives it to tracy-dsh as env_file, so
# every name here is inside the container too (docker inspect shows MODEL_API_KEY).
DSH_IMAGE_TAG=$TRACY_DSH_TAG
HOST_AGENT_HOSTNAME=$NAME-agent.$ZONE
HOST_SITES_ROOT=$SITES_ROOT
HOST_DSH_HOME=$DSH_HOME
HOST_PRIVATE_ROOT=$PRIVATE_ROOT
TRACY_SITE_DOMAIN=$ZONE
MODEL_API_KEY=$MODEL_API_KEY
TRACY_RELEASES_GITHUB_TOKEN=$TRACY_RELEASES_GITHUB_TOKEN
TRACY_DSH_CPUS=$cpus
TRACY_DSH_MEMORY=$dsh_mem
EOF
      if [ -n "$OPENROUTER_API_KEY" ]; then printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY"; fi
    } | write_file "$ETC/host-dsh.env" 0600 env
  fi
  if [ "$DRY_RUN" = 0 ] && ! grep -q -- '--seat-secret-out' "$FLEET_DIR/dsh/host-dsh-init.sh"; then
    die "host-dsh-init.sh has no --seat-secret-out: W5 P1 (Tasks 1-3) is not in $TRACY_APP_TAG (that build would also refuse the name $NAME and --tracy-origin)"
  fi
  if [ "$DRY_RUN" = 1 ]; then
    note "\$ DSH_IMAGE=$DSH_IMAGE_REPO bash $FLEET_DIR/dsh/host-dsh-init.sh $NAME --image-tag $TRACY_DSH_TAG --hostname $NAME-agent.$ZONE --actor-secret-file $ACTOR_FILE --tracy-origin $ORIGIN --seat-secret-out $WORK/seat.secret 2>&1 | sed -E 's/[0-9a-f]{64}/<redacted>/g'"
    return 0
  fi
  # With --seat-secret-out the seat secret goes to a 0600 file for step 9 and the banner carries
  # none (W5 Task 3). The 64-hex mask stays as a second fence over whatever else init prints.
  set +e
  DSH_IMAGE="$DSH_IMAGE_REPO" bash "$FLEET_DIR/dsh/host-dsh-init.sh" "$NAME" --image-tag "$TRACY_DSH_TAG" \
    --hostname "$NAME-agent.$ZONE" --actor-secret-file "$ACTOR_FILE" --tracy-origin "$ORIGIN" \
    --seat-secret-out "$WORK/seat.secret" 2>&1 \
    | sed -E 's/[0-9a-f]{64}/<redacted>/g'
  status="${PIPESTATUS[0]}"
  set -e
  [ "$status" = 0 ] || die "host-dsh-init.sh failed (exit $status); read the lines above - nothing after this step ran"
}

github_key_one_line() {
  if [ "$DRY_RUN" = 1 ]; then echo dry-run-placeholder; return 0; fi
  # readGithub restores \n when the value holds no real newline (deploy/.env.example:339-340).
  awk 'NF {printf "%s\\n", $0}' "$GITHUB_APP_PRIVATE_KEY_FILE"
}

# render_web_env <seat secret>: the whole of /etc/tracy/tracy-web.env, on stdout.
render_web_env() {
  cat <<EOF
# /etc/tracy/tracy-web.env of shard $NAME - written by install-shard.sh ($(date -u +%Y-%m-%dT%H:%MZ), phase $PHASE).
# Every name, its class and why: deploy/shard.env.example. Root, 0600: it holds this shard's secrets.
# deploy-tracy-stack.sh appends APP_IMAGE_TAG and APP_IMAGE_TAG_PREVIOUS after each deploy.
TRACY_ORIGIN=$ORIGIN
SITE_DOMAIN=$ZONE
DOCS_ORIGIN=$DOCS_ORIGIN
TRACY_ENVIRONMENT=$TRACY_ENVIRONMENT
TRACY_DEPLOYMENT_ROLE=shard
MASTER_ORIGIN=$MASTER
SHARD_SECRET=$S_SHARD_SECRET
SESSION_COOKIE_NAME=tracy_sess_$NAME
TRACY_TUNNEL=catch-all
BETA_GATE=off
SESSION_SECRET=$S_SESSION_SECRET
MCP_TRACY_ACTOR_SECRET=$S_MCP_TRACY_ACTOR_SECRET
API_KEY_PEPPER=$S_API_KEY_PEPPER
SEAT_PLAN_KEK=$S_SEAT_PLAN_KEK
GITHUB_APP_ID=$GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY=$(github_key_one_line)
GITHUB_WEBHOOK_SECRET=$S_GITHUB_WEBHOOK_SECRET
GITHUB_ORG=$GITHUB_ORG
HOST_NAME=$NAME
HOSTS=$NAME
HOST_${NAME}_ORIGIN=http://host.docker.internal:51720
HOST_${NAME}_DSH_ORIGIN=http://tracy-dsh:8080
HOST_${NAME}_SECRET=$S_HOST_SECRET
SEAT_${NAME}_SECRET=$1
TRACY_SITES_ROOT=$SITES_ROOT
TRACY_PRIVATE_ROOT=$PRIVATE_ROOT
TRACY_DSH_HOME=$DSH_HOME
POSTGRES_PASSWORD=$S_POSTGRES_PASSWORD
DATABASE_URL=postgres://tracy:$S_POSTGRES_PASSWORD@postgres:5432/tracy
# compose interpolates the local-only MinIO services on a server too and has no default for this
# name: without it every docker compose call dies. No MinIO runs on a shard, so any value does;
# a fixed non-secret literal, not one of the generated secrets.
MINIO_PASSWORD=no-minio-runs-on-a-shard
WEB_PORT=51710
TRACY_HOST_PORT=51720
TRACY_NETWORK_PREFIX=$NET_PREFIX
TRACY_EGRESS_FENCE=on
MAIL=resend:$RESEND_KEY
MAIL_FROM=$MAIL_FROM
SITE_MAIL=$SITE_MAIL
ARTIFACT_S3_ENDPOINT=$R2_ENDPOINT
ARTIFACT_S3_BUCKET=$R2_ARTIFACT_BUCKET
ARTIFACT_S3_ACCESS_KEY=$R2_ARTIFACT_ACCESS_KEY
ARTIFACT_S3_SECRET_KEY=$R2_ARTIFACT_SECRET_KEY
TRACY_MIGRATE_S3_ENDPOINT=$R2_ENDPOINT
TRACY_MIGRATE_S3_BUCKET=$R2_ARTIFACT_BUCKET
TRACY_MIGRATE_S3_ACCESS_KEY=$R2_ARTIFACT_ACCESS_KEY
TRACY_MIGRATE_S3_SECRET_KEY=$R2_ARTIFACT_SECRET_KEY
TRACY_RELEASES_GITHUB_TOKEN=$TRACY_RELEASES_GITHUB_TOKEN
EOF
  if [ "$PHASE" = g1 ]; then printf 'SITE_ADDRESS_PREFIX=%st-\n' "$NAME"; else printf 'SESSION_DOMAIN=%s\n' "$ZONE"; fi
  if [ "$SITE_MAIL" != off ]; then printf 'SITE_MAIL_DOMAIN=%s\nSITE_MAIL_GLOBAL_DAILY=%s\n' "$SITE_MAIL_DOMAIN" "$SITE_MAIL_GLOBAL_DAILY"; fi
  if [ -n "$BACKUP_EXPORT" ]; then printf 'BACKUP_EXPORT=%s\n' "$BACKUP_EXPORT"; fi
  if [ -n "$TRACY_COMMENT_PICKER" ]; then printf 'TRACY_COMMENT_PICKER=%s\n' "$TRACY_COMMENT_PICKER"; fi
  # A --force rewrite keeps the deploy record, so --rollback still knows where to go.
  if [ -f "$ETC/tracy-web.env" ]; then grep -E '^APP_IMAGE_TAG(_PREVIOUS)?=' "$ETC/tracy-web.env" || true; fi
}

step_web_env() {
  local seat
  say "9. MCP_SEAT_SECRET from $WORK/seat.secret, $ETC/tracy-web.env, shard-env-check.sh"
  if [ "$DRY_RUN" = 1 ]; then
    seat=dry-run-placeholder
  else
    # The one line host-dsh-init.sh --seat-secret-out wrote (W5 Task 3); read once, then gone with
    # $WORK. Empty would be a seat door that checks nothing (check-server.sh step 9): never written.
    seat="$(head -n 1 "$WORK/seat.secret" 2>/dev/null | tr -d '\r' || true)"
    [ -n "$seat" ] || die "host-dsh-init.sh left no MCP_SEAT_SECRET in $WORK/seat.secret (--seat-secret-out, W5 Task 3)"
    rm -f "$WORK/seat.secret"
  fi
  if [ -f "$ETC/tracy-web.env" ] && [ "$FORCE" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    note "$ETC/tracy-web.env exists - kept (--force rewrites it, keeping its APP_IMAGE_TAG lines)"
  else
    render_web_env "$seat" | write_file "$ETC/tracy-web.env" 0600 env
  fi
  note "DOCS_ORIGIN=$DOCS_ORIGIN: UNVERIFIED until G0 confirms the master's docs origin (contract section 9)"
  run bash "$FLEET_DIR/stack/shard-env-check.sh" "$ETC/tracy-web.env"
}

step_deploys() {
  say "10. deploy-host-dsh.sh --tag $TRACY_DSH_TAG, then deploy-tracy-stack.sh --tag $TRACY_APP_TAG"
  # dsh first: compose.server.yml joins tracy-web to dsh's network, declared external
  # (compose.server.yml:107-110), and deploy-tracy-stack.sh demands tracy-host in --services (:152).
  run env DSH_IMAGE="$DSH_IMAGE_REPO" "$FLEET_DIR/dsh/deploy-host-dsh.sh" --tag "$TRACY_DSH_TAG"
  # deploy-tracy-stack.sh derives its repositories from TRACY_IMAGE_PREFIX; on the GHCR default the
  # command is the one it always was.
  local -a prefix_env=()
  [ "$TRACY_IMAGE_PREFIX" = ghcr.io/tracyhq ] || prefix_env=(env "TRACY_IMAGE_PREFIX=$TRACY_IMAGE_PREFIX")
  run ${prefix_env[@]+"${prefix_env[@]}"} "$FLEET_DIR/stack/deploy-tracy-stack.sh" --tag "$TRACY_APP_TAG" --services postgres,tracy-web,tracy-host
}

# The seed script ships in the tracy-web image once Task 6 has merged (apps/tracy-web/Dockerfile). Before
# that: a checkout-shaped source (REPO_TOKEN, --from-dir) may carry it, and --phase g1 (d1 before the
# line exists, roadmap 7.6) goes on without staff seats when nothing does. Absence is checked with
# `docker exec <tracy-web> test -f scripts/seed-admin-seats.mjs` against the running container.
step_seed() {
  local web src=""
  say "11. staff seats for $OPERATOR_EMAILS (seed-admin-seats.mjs, after the stack: migrations run at boot)"
  if [ -n "$(source_root)" ]; then src="$(source_root)/apps/tracy-web/scripts/seed-admin-seats.mjs"; fi
  if [ "$DRY_RUN" = 1 ]; then
    note "\$ docker exec <tracy-web> test -f scripts/seed-admin-seats.mjs"
    if [ -n "$src" ]; then note "  absent in the image: docker cp $src into the container"; fi
    if [ "$PHASE" = g1 ]; then
      note "  absent everywhere: --phase g1 skips the seed (no staff seats until the line's tracy-web image, Task 6)"
    else
      note "  absent everywhere: stop (install a newer tag, or pass --from-dir / REPO_TOKEN)"
    fi
    note "\$ docker exec <tracy-web> node scripts/seed-admin-seats.mjs $OPERATOR_EMAILS"
    return 0
  fi
  web="$(docker ps -q --filter label=com.docker.compose.project=tracy --filter label=com.docker.compose.service=tracy-web | sed -n 1p)"
  [ -n "$web" ] || die "no tracy-web container: deploy-tracy-stack.sh did not leave one running"
  if ! docker exec "$web" test -f scripts/seed-admin-seats.mjs; then
    if [ -n "$src" ] && [ -f "$src" ]; then
      docker cp "$src" "$web:/opt/tracy-web/scripts/seed-admin-seats.mjs"
    elif [ "$PHASE" = g1 ]; then
      warn "$TRACY_APP_TAG has no scripts/seed-admin-seats.mjs and no source carries it: --phase g1 goes on without staff seats (seed them after the line's image, Task 6)"
      return 0
    else
      die "$TRACY_APP_TAG has no scripts/seed-admin-seats.mjs (built before the shard line): install a newer tag, or pass --from-dir / REPO_TOKEN"
    fi
  fi
  docker exec "$web" node scripts/seed-admin-seats.mjs "$OPERATOR_EMAILS"
}

# compose with the shard override, exporting what deploy-tracy-stack.sh exports (deploy-tracy-stack.sh:268-271)
# and the HOST secret compose.server.yml:100 needs to load the project at all.
shard_compose() {
  HOST_SECRET="$(grep -m1 "^HOST_${NAME}_SECRET=" "$ETC/tracy-web.env" | cut -d= -f2-)" \
  WEB_IMAGE="$WEB_IMAGE_REPO" HOST_IMAGE="$HOST_IMAGE_REPO" \
    docker compose --env-file "$ETC/tracy-web.env" -f "$FLEET_DIR/stack/compose.yml" \
      -f "$FLEET_DIR/stack/compose.server.yml" -f "$FLEET_DIR/stack/compose.shard.yml" "$@"
}

step_nginx() {
  local code=000 i
  say "12. nginx on 127.0.0.1:80 (compose.shard.yml): the shard's front door"
  if [ "$DRY_RUN" = 1 ]; then
    note "\$ docker compose --env-file $ETC/tracy-web.env -f compose.yml -f compose.server.yml -f compose.shard.yml run --rm --no-deps -T nginx nginx -t"
    note "\$ docker compose --env-file $ETC/tracy-web.env -f compose.yml -f compose.server.yml -f compose.shard.yml up -d --no-deps nginx"
    note "\$ curl -H 'Host: $FQDN' http://127.0.0.1/api/config   (must name $ORIGIN)"
    return 0
  fi
  shard_compose run --rm --no-deps -T nginx nginx -t
  shard_compose up -d --no-deps nginx
  for i in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "Host: $FQDN" http://127.0.0.1/api/config || true)"
    [ "$code" != 200 ] || break
    sleep 2
  done
  [ "$code" = 200 ] || die "nginx on 127.0.0.1:80 did not answer /api/config with 200 (last: $code): docker logs tracy-nginx-1"
  curl -s --max-time 5 -H "Host: $FQDN" http://127.0.0.1/api/config | grep -F "\"origin\":\"$ORIGIN\"" >/dev/null \
    || die "nginx answers, but /api/config does not name $ORIGIN: the request did not reach this shard's tracy-web"
  note "nginx -> tracy-web: 200, origin $ORIGIN"
}

step_web_images() {
  say "13. site web images (web/build.sh, DEFAULTS_ONLY: the images a new site gets)"
  if [ "$SKIP_WEB_IMAGES" = 1 ]; then
    note "--skip-web-images: skipped; new sites get upstream images (no agent tools) until tracy-updater.sh builds them"
    return 0
  fi
  if [ "$SOURCE" = git ]; then
    # From the checkout: Joomla's build needs vendor/joomla/joomlart-t4-skill beside packages/ (web/build.sh set_context).
    run env DEFAULTS_ONLY=1 bash "$WORK/tch/packages/fleet/tracy-fleet-operation/web/build.sh" \
      || warn "web/build.sh reported failures; site creation still works, on upstream images for those bases"
  else
    # From the image: WordPress and EmDash build from /opt/tracy-fleet/web alone; Joomla also needs the
    # skill tree, which the tracy-host image carries (sync-fleet-files.sh put it under
    # $FLEET_DIR/vendor/joomla/). An image built before 28/10/2026 has none: its Joomla line fails here, said out loud.
    run env DEFAULTS_ONLY=1 bash "$FLEET_DIR/web/build.sh" \
      || warn "web/build.sh reported failures (a tracy-host image built before 28/10/2026 carries no Joomla skill tree; use REPO_TOKEN or a newer image); site creation still works on upstream images"
  fi
}

step_cloudflared() {
  say "14. cloudflared for tunnel $CF_TUNNEL_ID"
  if [ "$DRY_RUN" = 1 ] || ! command -v cloudflared >/dev/null 2>&1; then
    # Cloudflare's own apt lines (pkg.cloudflare.com). The key file was renamed when Cloudflare
    # rotated it (cloudflare-main.gpg -> cloudflare-public-v2.gpg): UNVERIFIED on the day of d1,
    # read pkg.cloudflare.com first and correct both lines if they differ.
    run_sh 'curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg -o /usr/share/keyrings/cloudflare-public-v2.gpg'
    run chmod a+r /usr/share/keyrings/cloudflare-public-v2.gpg
    run_sh 'echo "deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list'
    run apt-get update -qq
    run apt-get install -y -qq cloudflared
  fi
  if [ -f /etc/systemd/system/cloudflared.service ] && [ "$FORCE" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    note "cloudflared.service exists - kept (--force reinstalls it with this token)"
  else
    if [ -f /etc/systemd/system/cloudflared.service ] && [ "$DRY_RUN" = 0 ]; then cloudflared service uninstall; fi
    # The token ends up in the unit's ExecStart (cloudflared's own design), readable by root through
    # `systemctl cat`: the posture fleet01 and prod1 already have.
    run_secret "cloudflared service install <CF_TUNNEL_TOKEN>" cloudflared service install "$CF_TUNNEL_TOKEN"
  fi
  note "Cloudflare side (W6, not this script): the tunnel's ONE ingress rule is the catch-all -> http://127.0.0.1:80;"
  note "  DNS $FQDN CNAME $CF_TUNNEL_ID.cfargotunnel.com, proxied; site names are written by the master (spec 3.2)"
}

step_timers() {
  say "15. timers: tracy-heartbeat (60 s), tracy-updater (5 min), tracy-backup-postgres (daily, then the R2 push)"
  run install -d -m 0700 "$STATE_DIR" "$LOG_DIR"
  write_file "$ETC/backup-r2.env" 0600 env <<EOF
# /etc/tracy/backup-r2.env - tracy-pgdump-r2.sh. This shard's OWN bucket and key (spec 6.1).
R2_BACKUP_ENDPOINT=$R2_ENDPOINT
R2_BACKUP_BUCKET=$R2_BACKUP_BUCKET
R2_BACKUP_ACCESS_KEY=$R2_BACKUP_ACCESS_KEY
R2_BACKUP_SECRET_KEY=$R2_BACKUP_SECRET_KEY
BACKUP_AGE_RECIPIENT=$BACKUP_AGE_RECIPIENT
TRACY_SHARD_NAME=$NAME
R2_BACKUP_KEEP_DAYS=14
EOF
  write_file "$ETC/shard-install.env" 0644 <<EOF
# install-shard.sh's record of this install (no secret); check-shard.sh reads it.
SHARD_NAME=$NAME
SHARD_FQDN=$FQDN
PHASE=$PHASE
FIREWALL_MODE=$FIREWALL_MODE
SOURCE=$SOURCE
INSTALLED_APP_TAG=$TRACY_APP_TAG
INSTALLED_DSH_TAG=$TRACY_DSH_TAG
EOF
  # The six units sit flat in /opt/tracy-fleet/stack (contract section 10), named one by one.
  local unit
  for unit in tracy-heartbeat.service tracy-heartbeat.timer tracy-updater.service tracy-updater.timer \
    tracy-backup-postgres.service tracy-backup-postgres.timer; do
    run install -m 0644 "$FLEET_DIR/stack/$unit" /etc/systemd/system/
  done
  run systemctl daemon-reload
  run systemctl enable --now tracy-heartbeat.timer tracy-updater.timer tracy-backup-postgres.timer
}

step_checks() {
  say "16. check-server.sh, then check-shard.sh --before-registration"
  note "check-server.sh step 11 says the route reaches this cluster whenever a cloudflared runs here; on a"
  note "shard *.$ZONE is s0's, so that line proves nothing about this VM - check-shard.sh step 3 does"
  run bash "$FLEET_DIR/stack/check-server.sh" || { warn "check-server.sh is red: read it above"; CHECKS_FAILED=1; }
  run bash "$FLEET_DIR/stack/check-shard.sh" --before-registration || { warn "check-shard.sh is red: read it above"; CHECKS_FAILED=1; }
}

# registration_text: both ways the master learns this shard (contract section 8), the same values.
registration_text() {
  cat <<EOF
# Shard $NAME, for the master at $MASTER. It holds SHARD_SECRET: copy it into the master and
# 1Password, then shred -u this file. Two ways in, the same values (docs/sre/hop-dong-cua-shard.md section 8).
#
# (b) /ops > Shards > Add on the master - one form field per line, no deploy needed (the secret is
#     kept in the shard table's secret_box):
FORM_NAME=$NAME
FORM_ORIGIN=$ORIGIN
FORM_SECRET=$S_SHARD_SECRET
FORM_TUNNEL_ID=$CF_TUNNEL_ID
FORM_PROVIDER=$SHARD_PROVIDER
FORM_REGION=$SHARD_REGION
#
# (a) or the master's env, seeded into the shard table at every boot (the env wins for these
#     columns) - add $NAME to the master's existing SHARDS list, comma-separated, then deploy the master:
SHARDS=$NAME
SHARD_${NAME}_ORIGIN=$ORIGIN
SHARD_${NAME}_SECRET=$S_SHARD_SECRET
SHARD_${NAME}_TUNNEL_ID=$CF_TUNNEL_ID
SHARD_${NAME}_PROVIDER=$SHARD_PROVIDER
SHARD_${NAME}_REGION=$SHARD_REGION
#
# The tags this shard was installed with; the master's answers move it from here.
APP_TAG=$TRACY_APP_TAG
DSH_TAG=$TRACY_DSH_TAG
EOF
}

step_registration() {
  local file="/root/tracy-shard-$NAME-registration.txt"
  say "17. registration for the master: /ops > Shards > Add, or the master's env (accepting stays off)"
  registration_text | write_file "$file" 0600 env
  if [ "$DRY_RUN" = 0 ]; then
    # Both blocks on the terminal too, the secret masked: it is only in the root-only file.
    registration_text | mask_env | grep -v '^#$' | sed 's/^/    /'
  fi
  note "written to $file (root, 0600); the SHARD secret is in it and is not printed here."
  note "Next: block (b) into /ops > Shards > Add on $MASTER, or block (a) into the master's env and deploy it;"
  note "  then shred -u $file. check-shard.sh turns step 4 green within a minute of the master knowing this shard."
}
