# @tracy/dsh-sandbox-docker

## What it is

The process sandbox of a dsh whose sites run as Docker containers. dsh's shipped sandbox
(`@deepseek-ai/dsh-sandbox-local`) wraps a command in bwrap or seatbelt on the harness host. Here
no command runs on the harness host at all: `@tracy/dsh-subprocess-docker` hands every argv to
`docker exec` inside the site's own web container, and that container IS the confinement — the
kernel keeps site A's shell out of site B's files. What is left for this provider is the
file-effect MODE the seam resolves per session (`read-only` for a guest seat, `workspace-write`
for an editor): `confine()` stamps it onto the argv (see `stamp.mjs`) and the subprocess provider
turns it into the exec user.

The stamp carries a second fact beside the mode: the policy's `workspaceRoot`, the site folder the
seat door granted this session. dsh's `tool-bash` passes a model-supplied `workdir` verbatim as the
spawn cwd, so the subprocess provider needs something the model did not write to check that cwd
against. `workspaceRoot` is that something — the seam resolves it from the session, never from a
tool argument.

## Installing it

The package ships a `cordis.patch.yml` that inserts its own row:

```yaml
- insert:
    - id: tracy-sandbox-docker
      name: '@tracy/dsh-sandbox-docker'
```

The profile or bundle that loads it must ALSO disable dsh-base's `sandbox` row. Two providers
registering `ctx.sandbox` is a throw at boot, not a warning.

When this package enters a bundle, the bundle must NOT also insert the row above itself: two rows
with the id `tracy-sandbox-docker` is a duplicate id, and dsh refuses to boot on it.

This row and `@tracy/dsh-subprocess-docker`'s are replaced together, never one at a time. The
subprocess provider asserts the pairing at boot and throws if `ctx.sandbox` is anything else,
because the alternative is silent: an unstamped argv would run every confined command as
`www-data` with nothing in the logs to say the mode was lost.

## Limits

- The mode becomes an exec user and nothing more. `read-only` runs as a user that cannot write;
  it is not a per-path file policy, so a world-writable path inside the container stays writable.
- There is no bwrap or seatbelt inside the container, and this provider does not add one. The
  boundary that matters is the container itself; pair this with
  `@tracy/dsh-subprocess-docker`, or every confined command runs unrouted.
