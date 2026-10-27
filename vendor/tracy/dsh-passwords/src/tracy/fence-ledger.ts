// H9 (K1, #561): the write fence's memory across gateway processes, wired at the two entry points.
//
// `serve-gateway` keeps a `FenceLedger` beside its database, written before it takes a request,
// naming the dsh process it serves; the plugin that spawns it passes that process's PID and a boot
// value drawn once per dsh process. A request left unanswered at a dsh that outlives this gateway
// then holds every site folder in place until that dsh is gone (write-fence.ts).
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { FenceLedger } from './write-fence.js';

let boot: string | null = null;

/** One value per dsh process (the plugin's), drawn the first time it is asked for and kept. */
export function tracyDshBoot(): string {
  boot ??= randomUUID();
  return boot;
}

/**
 * The ledger of a `serve-gateway` process: `<database dir>/write-fence`, naming the parent dsh from
 * `DSH_GATEWAY_PARENT_BOOT` / `DSH_GATEWAY_PARENT_PID` (unknown when run apart from dsh). Released
 * when the process exits.
 */
export function tracyFenceLedger(dbPath: string, env: NodeJS.ProcessEnv): FenceLedger {
  const parentBoot = env.DSH_GATEWAY_PARENT_BOOT?.trim() ?? '';
  const parentPid = Number(env.DSH_GATEWAY_PARENT_PID ?? '');
  const ledger = new FenceLedger(path.join(path.dirname(dbPath), 'write-fence'), {
    boot: parentBoot === '' ? null : parentBoot,
    pid: Number.isInteger(parentPid) && parentPid > 0 ? parentPid : null,
  });
  process.once('exit', () => ledger.release());
  return ledger;
}
