/**
 * Tracy: the native surface outliving the host's tab registry.
 *
 * DSH's `sidebarRightTabs` registry owns every contributed type as an effect on
 * ITS OWN fiber (`ui-sidebar-right`), and the service provision is the last
 * thing that fiber tears down. So while the host unloads (a reload of the
 * client graph, a restart of dsh behind the desktop app) the plugin still sees
 * the registry, and any re-sync landing in that window — a host tab policy
 * being reset, the `/api/ui` switches arriving late — calls `register` on a
 * registry whose fiber can no longer take effects. Cordis then throws
 * `cannot create effect on inactive context`, and the surface used to report
 * that through the client's red diagnostic strip (measured 08/10/2026 in the
 * desktop app: "native relist files error: cannot create effect on inactive
 * context"). A registry that is going away is not a failure to show anyone.
 *
 * These cases drive the REAL cordis fiber and the REAL DSH registry, so the
 * refusal is the one the app hit, not an imitation of it. The registry is read
 * from the DSH fork next to this package (TCH's `vendor/tracy/deepseek-harness`;
 * the npm copy ships no source), so outside TCH the suite is skipped, as
 * `vitest.config.ts` does for the fork's primitives.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerNativeSurface } from '../src/client/native/index.ts'
import { createNativeTabRecords } from '../src/client/native/tab-adapter.tsx'
import { createBetterSidebarService } from '../src/client/service.ts'
import { createSidebarStore } from '../src/client/state.ts'

const REGISTRY = fileURLToPath(new URL('../../deepseek-harness/packages/client/ui-sidebar-right/src/client/tab-registry.ts', import.meta.url))
const fork = existsSync(REGISTRY)
  ? await import(/* @vite-ignore */ REGISTRY) as typeof import('../../deepseek-harness/packages/client/ui-sidebar-right/src/client/tab-registry.ts')
  : undefined
type SidebarRightTabRegistry = InstanceType<NonNullable<typeof fork>['SidebarRightTabRegistry']>

/** A host fiber carrying a real DSH tab registry, and a way to unload it. */
async function hostRegistry() {
  const root = new Context()
  let registry: SidebarRightTabRegistry | undefined
  const fiber = root.plugin({
    name: 'ui-sidebar-right',
    apply: (ctx: Context) => { registry = new fork!.SidebarRightTabRegistry(ctx as never) },
  })
  await fiber
  if (registry === undefined) throw new Error('the host fiber did not apply')
  return { registry, unload: () => fiber.dispose() }
}

async function mount() {
  const host = await hostRegistry()
  const store = createSidebarStore()
  const service = createBetterSidebarService(store)
  const ctx = {
    inject: (_deps: readonly string[], callback: (injected: { get: () => unknown }) => void) => {
      callback({ get: () => host.registry })
      return { dispose: () => {} }
    },
    get: () => undefined,
    sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } },
    slots: { inject: (_key: string, callback: () => () => void) => callback(), register: () => () => {} },
  }
  const reportFailure = vi.fn()
  const dispose = registerNativeSurface({ ctx: ctx as never, store, service, records: createNativeTabRecords(), reportFailure })
  return { host, service, reportFailure, dispose }
}

describe.runIf(fork !== undefined)('native surface while the host registry unloads', () => {
  it('a Files relist after the host unloaded is dropped silently', async () => {
    const { host, service, reportFailure } = await mount()
    service.registerTab({ id: 'editor', title: 'Files', component: () => null })
    // Tracy's switches leave the editor out of the guide (a `launch-*` switch off).
    const resetPolicy = service.setTabPolicy({ isAllowed: () => true, isListed: id => id !== 'editor' })
    expect(reportFailure).not.toHaveBeenCalled()

    await host.unload()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The policy owner tears down after the host: the default policy lists
    // Files again, which re-registers its type.
    resetPolicy()
    expect(reportFailure).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('a new type registered after the host unloaded is dropped silently', async () => {
    const { host, service, reportFailure } = await mount()
    await host.unload()
    service.registerTab({ id: 'git', title: 'Git', component: () => null })
    expect(reportFailure).not.toHaveBeenCalled()
  })

  it('a live registry that refuses is still reported', async () => {
    const { host, service, reportFailure } = await mount()
    // Another provider already holds the id: a wiring mistake, not teardown.
    host.registry.register({ id: 'dsh-better-sidebar:git', kind: 'other' } as never)
    service.registerTab({ id: 'git', title: 'Git', component: () => null })
    expect(reportFailure).toHaveBeenCalledWith('register git', expect.any(Error))
  })
})
