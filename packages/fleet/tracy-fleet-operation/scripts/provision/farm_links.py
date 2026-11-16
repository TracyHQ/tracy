#!/usr/bin/env python3
"""The symlinks of a demo's webroot that lead out of it, as the demo farm would follow them.

    farm_links.py <webroot on this host> <label>

Prints one `path -> target` line per bad link (relative to the webroot) and exits 0; exits 1 when the
webroot cannot be read. Used by provision/fold.sh before anything is changed.

In the farm (lib/demo-farm.sh) Apache follows symlinks and reads as the same www-data as every other
demo, so a link is judged by where it ENDS, followed link by link through every component the way the
kernel resolves it — never by its text: `parent -> base/..` with `base -> /site/<label>/.webroot`
is the site folder, and `leak.txt -> parent/../<other>/.webroot/x` is another demo's file, though no
single target names one. The paths a link may name are the demo's own, in the container's namespace:
`/site/<label>/.webroot` (and `/var/www/html`, its per-site docroot) is the webroot on this host, and
`/site/<label>` its site folder; any other absolute path is outside. A link is bad when it ends
outside the webroot (path components, not a string prefix), ends nowhere (dangling), or loops.
"""
import os
import sys

MAX_HOPS = 40


def judge(webroot, label):
    webroot = os.path.realpath(webroot)
    site_dir = os.path.dirname(webroot)
    docroot = f"/site/{label}/.webroot"
    roots = [(docroot, webroot), ("/var/www/html", webroot), (f"/site/{label}", site_dir)]

    def to_host(cpath):
        """The host path of a container path, or None when the farm would not show it to this demo."""
        for prefix, host in roots:
            if cpath == prefix or cpath.startswith(prefix + "/"):
                return host + cpath[len(prefix):]
        return None

    def resolve(cpath):
        """The container path `cpath` ends at once every link is followed; None = outside, dangling or a loop."""
        parts = [p for p in cpath.split("/") if p]
        done = []
        hops = 0
        while parts:
            part = parts.pop(0)
            if part == ".":
                continue
            if part == "..":
                if done:
                    done.pop()
                continue
            here = "/" + "/".join(done + [part])
            host = to_host(here)
            if host is None:
                # `/site`, `/var`, `/var/www`: directories on the way to the demo's own folders, no link.
                if any(prefix.startswith(here + "/") for prefix, _ in roots):
                    done.append(part)
                    continue
                return None
            if os.path.islink(host):
                hops += 1
                if hops > MAX_HOPS:
                    return None
                target = os.readlink(host)
                if target.startswith("/"):
                    done = []
                parts = [p for p in target.split("/") if p] + parts
                continue
            if not os.path.lexists(host):
                return None
            done.append(part)
        return "/" + "/".join(done)

    def inside(cpath):
        return cpath is not None and any(
            cpath == p or cpath.startswith(p + "/") for p in (docroot, "/var/www/html")
        )

    bad = []
    for d, dirs, files in os.walk(webroot):
        for name in dirs + files:
            link = os.path.join(d, name)
            if not os.path.islink(link):
                continue
            rel = os.path.relpath(link, webroot)
            if not inside(resolve(f"{docroot}/{rel}")):
                bad.append(f"{rel} -> {os.readlink(link)}")
    return bad


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    webroot, label = sys.argv[1], sys.argv[2]
    if not os.path.isdir(webroot):
        print(f"no webroot at {webroot}", file=sys.stderr)
        return 1
    for line in judge(webroot, label):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
