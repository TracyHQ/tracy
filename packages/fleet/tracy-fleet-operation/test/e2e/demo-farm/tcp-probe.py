#!/usr/bin/env python3
"""Independent no-blip probe: N clients, each opens a NEW TCP connection, sends a raw HTTP/1.1 GET for a
static page and reads to EOF. A connection that is refused, reset, times out, closes without a status
line (an "empty reply") or answers anything but 200 is a failure. Not curl, not the e2e's shell loop:
what a visitor's browser/cloudflared would see, counted separately.

  tcp-probe.py PORT HOST PATH CLIENTS STOPFILE OUTFILE
Runs until STOPFILE exists, then writes "<asked> <failed> <seconds from first to last failure>" to OUTFILE and the failures to OUTFILE.fail.
"""
import socket, sys, threading, time, os

port, host, path, clients, stop, out = int(sys.argv[1]), sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5], sys.argv[6]
lock = threading.Lock()
asked = 0
fails = []
fail_times = []

def one():
    req = f"GET {path} HTTP/1.1\r\nHost: {host}\r\nX-Forwarded-Host: {host}\r\nConnection: close\r\n\r\n".encode()
    s = socket.socket()
    s.settimeout(30)
    try:
        s.connect(("127.0.0.1", port))
        s.sendall(req)
        data = b""
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            data += chunk
        if not data:
            return "closed without any reply"
        if not data.startswith(b"HTTP/1.1 200") and not data.startswith(b"HTTP/1.0 200"):
            return "answered " + data.split(b"\r\n", 1)[0].decode("latin1")
        return None
    except Exception as e:  # refused, reset, timeout
        return f"{type(e).__name__}: {e}"
    finally:
        s.close()

def worker():
    global asked
    while not os.path.exists(stop):
        r = one()
        with lock:
            asked += 1
            if r:
                fails.append(f"{time.strftime('%H:%M:%S')}.{int((time.time() % 1) * 1000):03d} {r}")
                fail_times.append(time.time())
        time.sleep(0.01)

ts = [threading.Thread(target=worker) for _ in range(clients)]
[t.start() for t in ts]
[t.join() for t in ts]
with open(out + ".fail", "w") as f:
    f.write("\n".join(fails) + ("\n" if fails else ""))
with open(out, "w") as f:
    window = (max(fail_times) - min(fail_times)) if fail_times else 0.0
    f.write(f"{asked} {len(fails)} {window:.3f}\n")
