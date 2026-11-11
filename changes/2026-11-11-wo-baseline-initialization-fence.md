- **Serialize first history reads with provision before webroot mutation** — Website opportunity pipeline maintainers · #541 · `fix/wo-artifact-integration` · 2026-11-11

**Affects:** Fleet host provisioning and webroot history/changes reads. A stable per-site initialization fence prevents a first read from racing a retry's Git baseline, bounds provision waiting to 120 seconds, and returns building metadata to contending readers. Reprovision preserves an existing historical v1 and creates a new normal backup of the rebuilt files and database. Fresh builds retain their full initial v1; a failed dump remains file-only and cannot satisfy WO write preflight.

Established readers share initialization admission and wait under the existing repo writer lock. Concurrent ordinary reads retain their backup rows; only exclusive initialization or provisioning excludes admission. Provision waits for every admitted reader before mutation, without a lock upgrade.
