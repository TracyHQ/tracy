// Tracy H19: recheck live seat authority at the native tool body's monotonic dispatch boundary.
import { t } from '../i18n.js';

type Agent = { id: string; session: { header: { parentSession?: string } } };
type Message = { source?: { kind?: string; prompter?: { user?: string }; [key: string]: unknown } };
type Execution = { name: string; agent?: Agent };
interface GuardContext {
  on(name: 'agent/pre-step', listener: (event: { agent: Agent; messages: readonly Message[] }, next: () => Promise<{ kind: string }>) => Promise<{ kind: string }>): unknown;
  on(name: 'agent/created', listener: (event: { agent: Agent; source: string }) => void): unknown;
  get(name: 'agents'): { get(id: string): Agent | undefined; isOwnedBy(id: string, owner: Agent): boolean } | undefined;
  tools: { guard(check: (execution: Readonly<Execution>) => string | undefined): () => void };
}
interface Authority {
  getUserByUsername(name: string): { id: number; role: string } | null;
  getPermissions(id: number): { banned: boolean; sandbox_mode: string | null } | null;
}
const CODE_TOOLS = new Set(['write', 'edit', 'bash', 'pwsh']);

/** Bind consumed input, never queued input; a real child retains its creator's admitted actor. */
export function installTracySeatToolGuard(ctx: GuardContext, database: Authority): void {
  const actors = new WeakMap<Agent, string>();
  const initialChildren = new WeakSet<Agent>();
  const creators = new WeakMap<Agent, Agent>();
  ctx.on('agent/created', ({ agent, source }) => {
    const parentId = agent.session.header.parentSession;
    if (parentId === undefined) return;
    const registry = ctx.get('agents');
    const parent = registry?.get(parentId);
    if (parent === undefined || !registry?.isOwnedBy(agent.id, parent)) return;
    if (source === 'startup') initialChildren.add(agent);
    creators.set(agent, parent);
    const actor = actors.get(parent);
    if (actor !== undefined) actors.set(agent, actor);
  });
  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const users = messages.filter((message) => message.source?.kind === 'user');
    const candidate = users.at(-1)?.source;
    const initialTask = initialChildren.has(agent) && users.length === 1 &&
      candidate !== undefined && Object.keys(candidate).length === 1;
    const decision = await next();
    if (decision.kind === 'enter') {
      initialChildren.delete(agent);
      const creator = creators.get(agent);
      for (const message of messages) {
        if (creator === undefined || message.source?.kind !== 'agent-message') continue;
        const registry = ctx.get('agents');
        const senderId = message.source.senderSessionId;
        const sender = typeof senderId === 'string' ? registry?.get(senderId) : undefined;
        if (sender !== creator || !registry?.isOwnedBy(agent.id, creator) ||
            actors.get(creator) === undefined || actors.get(creator) !== actors.get(agent)) actors.delete(agent);
      }
      if (candidate !== undefined) {
        const actor = candidate.prompter?.user;
        if (typeof actor === 'string' && actor !== '') actors.set(agent, actor);
        else if (!initialTask) actors.delete(agent);
      }
    }
    return decision;
  });
  ctx.tools.guard(({ agent, name }) => {
    if (!CODE_TOOLS.has(name)) return undefined;
    const deny = () => t('en', 'gw.sandboxDenied');
    const actor = agent === undefined ? undefined : actors.get(agent);
    if (actor === undefined) return deny();
    try {
      const user = database.getUserByUsername(actor);
      if (user === null) return deny();
      const permission = database.getPermissions(user.id);
      if (user.role === 'admin' && permission === null) return undefined;
      if (permission !== null && !permission.banned &&
          [null, 'workspace-write', 'danger-full-access'].includes(permission.sandbox_mode)) return undefined;
    } catch {
      // A missing or unreadable authority never preserves a previous permission.
    }
    return deny();
  });
}
