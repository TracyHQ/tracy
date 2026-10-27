/**
 * The deploy lease an import holds (issue #83). The helper moved to `@tracy/core/lease` on 24/09
 * (#295) so builds and chat turns hold the same kind of lease; this file keeps the import's old
 * path working. The on-disk contract `deploy-host-dsh.sh` reads is unchanged.
 */

export { draining, holdLease } from '@tracy/core/lease'
export type { Lease, LeaseInfo } from '@tracy/core/lease'
