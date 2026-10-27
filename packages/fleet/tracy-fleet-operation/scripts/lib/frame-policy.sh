#!/usr/bin/env bash
# One managed frame policy for Apache and EmDash. Ports are part of the public origin.
# The zone's apex (https://tracy.ai on production) is listed beside its subdomains: the landing site
# serves the public Templates pages there (its Worker forwards /templates* to tracy-web), and a
# template page frames the template's demo. `https://*.<zone>` never matches the apex itself.
tracy_frame_ancestors() {
  local origin="${TRACY_ORIGIN:-}" zone="${FLEET_ZONE:-${SITE_DOMAIN:-tracy.ai}}" port=""
  origin="${origin%/}"
  if ! [[ "$zone" =~ ^[a-zA-Z0-9.-]+$ ]]; then
    printf 'Invalid fleet zone for site preview\n' >&2
    return 1
  fi
  if [ -n "$origin" ]; then
    if ! [[ "$origin" =~ ^https?://([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(:([0-9]{1,5}))?$ ]]; then
      printf 'Invalid public origin for site preview\n' >&2
      return 1
    fi
    port="${BASH_REMATCH[3]}"
    if [ -n "$port" ] && [ "$((10#$port))" -gt 65535 ]; then
      printf 'Invalid public origin port for site preview\n' >&2
      return 1
    fi
  fi
  printf "'self' https://*.%s https://%s http://127.0.0.1:* http://localhost:*%s" "$zone" "$zone" "${origin:+ $origin}"
}

# The receipt distinguishes a managed EmDash override from a custom operator policy.
tracy_record_frame_policy() {
  python3 - "$1" "$2" "${TRACY_ORIGIN:-}" <<'PY'
import json, os, sys, tempfile
root, policy, origin = sys.argv[1:]
fd, temporary = tempfile.mkstemp(prefix='.frame-policy-', dir=root)
try:
    with os.fdopen(fd, 'w') as output:
        json.dump({'schema': 'tracy-frame-policy/v1', 'policy': policy, 'publicOrigin': origin.rstrip('/')}, output)
        output.write('\n')
    os.replace(temporary, os.path.join(root, '.frame-policy.json'))
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}
