// F-25 回归测试：会话归属（sessionId 提取 / 枚举源清理 / 会话列表过滤）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_SCOPED_RE,
  SUBUSER_BLOCKED_API_ENDPOINTS,
  isSubuserBlockedApiPath,
  extractSessionId,
  collectSessionIds,
  stripArchivedSessionIds,
  filterArchivedSessionIds,
  replaceArchivedSessionSnapshot,
  MAX_ARCHIVED_SESSION_IDS,
  filterOwnedSessionIds,
  filterSessionItems,
  collectSessionCwd,
  collectSessionCwdFromWorkspaces,
  collectAuthorizedSessionIds,
} from '../src/permissions.js';

test('F-25：SESSION_SCOPED_RE 命中会读取/写入会话的 RPC，但不命中 create/list', () => {
  for (const m of ['history', 'prompt', 'respond', 'archive', 'delete', 'rename', 'retitle', 'title', 'resume', 'fork', 'truncate', 'export', 'attachment', 'updateQueue', 'cancel', 'page', 'selectModel']) {
    assert.equal(SESSION_SCOPED_RE.test(`/api/session.${m}`), true, `session.${m} 应归属校验`);
    assert.equal(SESSION_SCOPED_RE.test(`/api/session/${m}`), true, `session/${m} 应归属校验`);
  }
  assert.equal(SESSION_SCOPED_RE.test('/api/workspace.archiveSession'), true, 'workspace.archiveSession 应归属校验');
  assert.equal(SESSION_SCOPED_RE.test('/api/workspace/archiveSession'), true, 'workspace/archiveSession 应归属校验');
  assert.equal(SESSION_SCOPED_RE.test('/api/session.create'), false, 'create 无源会话');
  assert.equal(SESSION_SCOPED_RE.test('/api/session.list'), false, 'list 单独过滤');
  assert.equal(SESSION_SCOPED_RE.test('/api/workspace.create'), false, '创建工作区不属于会话作用域');
  for (const endpoint of [
    'commands/execute', 'commands/list', 'subagents/list', 'subagents/prompt', 'subagents/interruptByParent',
    'fileUploads/upload', 'fileReferences/list', 'sessionReferenceResolver/candidates',
    'skills/list', 'messageFeedback/list', 'messageFeedback/put', 'messageFeedback/delete',
    'goals/clear', 'goals/complete', 'goals/create', 'goals/edit', 'goals/get', 'goals/pause', 'goals/resume',
    'sessionFeedback/record',
  ]) {
    assert.equal(SESSION_SCOPED_RE.test(`/api/${endpoint}`), true, `${endpoint} 应归属校验`);
  }
});

test('0.1.7：宿主桌面动作改为硬拒，新增会话作用域 RPC 纳入归属校验（点号/斜杠同口径）', () => {
  // session-controller：projections 带 request.sessionId，仍做归属校验。
  for (const m of ['projections']) {
    assert.equal(SESSION_SCOPED_RE.test(`/api/session.${m}`), true, `session.${m} 应归属校验`);
    assert.equal(SESSION_SCOPED_RE.test(`/api/session/${m}`), true, `session/${m} 应归属校验`);
  }
  // workspace-controller：三个会话导航状态写与 archiveSession 同类。
  for (const m of ['pinSession', 'unpinSession', 'unarchiveSession']) {
    assert.equal(SESSION_SCOPED_RE.test(`/api/workspace.${m}`), true, `workspace.${m} 应归属校验`);
    assert.equal(SESSION_SCOPED_RE.test(`/api/workspace/${m}`), true, `workspace/${m} 应归属校验`);
  }
  // 0.1.7：三个宿主桌面动作的 wire 里没有会话身份（取不到身份，归属校验无意义），
  // 改为 SUBUSER_BLOCKED_API_ENDPOINTS 硬拒。
  for (const endpoint of ['session/openWorkspacePath', 'session/canOpenWorkspacePath', 'session/workspacePathApplications']) {
    assert.equal(SUBUSER_BLOCKED_API_ENDPOINTS.has(endpoint), true, `${endpoint} 应硬拒`);
    assert.equal(isSubuserBlockedApiPath(`/api/${endpoint}`), true, endpoint);
    assert.equal(SESSION_SCOPED_RE.test(`/api/${endpoint}`), false, `${endpoint} 不再走归属校验`);
  }
  // 前缀相近的方法/命名空间不得被顺带纳入
  assert.equal(SESSION_SCOPED_RE.test('/api/session/projectionsExtra'), false);
  assert.equal(SESSION_SCOPED_RE.test('/api/session/openWorkspacePathExtra'), false);
  assert.equal(SESSION_SCOPED_RE.test('/api/session/canOpenWorkspacePathExtra'), false);
  assert.equal(SESSION_SCOPED_RE.test('/api/workspace/pinSessions'), false);
  assert.equal(SESSION_SCOPED_RE.test('/api/workspace/unpinSessionExtra'), false);
  assert.equal(SESSION_SCOPED_RE.test('/api/session/pinSession'), false, '不可跨命名空间误命中');
  assert.equal(SESSION_SCOPED_RE.test('/api/pinSession/list'), false);
  // 硬拒按方法精确匹配：前缀相近不扩散
  assert.equal(isSubuserBlockedApiPath('/api/session/openWorkspacePathExtra'), false);
  assert.equal(isSubuserBlockedApiPath('/api/session/workspacePathApplicationsX'), false);
});

test('0.1.7：新增 RPC 的请求体会话身份可被收集（用于逐会话授权）', () => {
  const envelope = (method: string, args: Record<string, unknown>): unknown => ({
    type: 'client-request',
    rpcId: 'rpc-1',
    method,
    payload: { args },
  });
  // session/projections、workspace/{pin,unpin,unarchive}Session 的 wire 是 request.sessionId
  const cases: Array<{ method: string; args: Record<string, unknown>; id: string }> = [
    { method: 'session/projections', args: { request: { sessionId: 's-proj' } }, id: 's-proj' },
    { method: 'workspace/pinSession', args: { request: { sessionId: 's-pin' } }, id: 's-pin' },
    { method: 'workspace/unpinSession', args: { request: { sessionId: 's-unpin' } }, id: 's-unpin' },
    { method: 'workspace/unarchiveSession', args: { request: { sessionId: 's-unarchive' } }, id: 's-unarchive' },
  ];
  for (const item of cases) {
    assert.deepEqual(
      [...(collectAuthorizedSessionIds(envelope(item.method, item.args)) ?? [])],
      [item.id],
      `${item.method} 必须收集到请求体会话身份`,
    );
  }
  // 形状不符（sessionId 非字符串）→ 整体 null，调用方必须 403
  assert.equal(
    collectAuthorizedSessionIds(envelope('workspace/pinSession', { request: { sessionId: 7 } })),
    null,
  );
  // wire 里没有会话身份的两个方法：网关取不到身份就只能硬拒（0.1.7 已改为
  // SUBUSER_BLOCKED_API_ENDPOINTS），收集结果仍为空、不会凭空造出授权。
  assert.deepEqual(
    [...(collectAuthorizedSessionIds(envelope('session/canOpenWorkspacePath', {})) ?? [])],
    [],
  );
  assert.deepEqual(
    [...(collectAuthorizedSessionIds(envelope('session/workspacePathApplications', { path: '/w/a.txt' })) ?? [])],
    [],
  );
  assert.equal(isSubuserBlockedApiPath('/api/session/canOpenWorkspacePath'), true);
  assert.equal(isSubuserBlockedApiPath('/api/session/workspacePathApplications'), true);
});

test('F-25：extractSessionId 提取顶层与嵌套 sessionId', () => {
  assert.equal(extractSessionId({ sessionId: 'session-1', prompt: {} }), 'session-1');
  assert.equal(extractSessionId({ args: { request: { sessionId: 's-2' } } }), 's-2');
  assert.equal(extractSessionId({ id: 'x' }), null, '无 sessionId 返回 null');
});

test('Issue #16：collectSessionIds 不忽略空或超长 sessionId', () => {
  const ids = collectSessionIds({
    sessionId: 's-valid',
    agentId: 'agent-valid',
    nested: [{ sessionId: '' }, { sessionId: 'x'.repeat(201) }],
  });
  assert.equal(ids.has('s-valid'), true);
  assert.equal(ids.has('agent-valid'), true, 'alpha.3 commands 使用 agentId');
  assert.equal(ids.has(''), true, '空 sessionId 也必须触发 fail-closed 校验');
  assert.equal(ids.has('x'.repeat(201)), true, '超长 sessionId 也必须触发 fail-closed 校验');
});

test('F-25：stripArchivedSessionIds 清空 archivedSessionIds 数组', () => {
  const obj = {
    workspaces: [{ id: 'w1', archivedSessionIds: ['s1', 's2'] }],
    keep: 'x',
  };
  const changed = stripArchivedSessionIds(obj);
  assert.equal(changed, true);
  assert.deepEqual(obj.workspaces[0].archivedSessionIds, []);
  assert.equal(obj.keep, 'x');
});

test('F-25：子用户保留可见归档槽，归档会话不掉入未分组', () => {
  const obj = {
    result: {
      value: {
        items: [
          {
            workspaceId: 'w1',
            path: '/root/11',
            // DSH 归档契约：s-archived 归档后仍保留在 sessionIds 中。
            sessionIds: ['s-active', 's-archived', 's-disabled'],
          },
        ],
        archivedSessionIds: ['s-archived', 's-other-user', 's-disabled'],
      },
    },
  };
  const disabled = new Set(['s-disabled']);
  const archived = new Set(obj.result.value.archivedSessionIds);
  const visibleSessionIds = new Set(collectSessionCwdFromWorkspaces(obj).keys());

  filterArchivedSessionIds(
    obj,
    (id) => archived.has(id) && visibleSessionIds.has(id) && !disabled.has(id),
  );
  filterOwnedSessionIds(obj, (id) => !disabled.has(id));

  assert.deepEqual(
    obj.result.value.items[0].sessionIds,
    ['s-active', 's-archived'],
    '归档会话必须保留工作区计数槽，仅移除被禁用会话',
  );
  assert.deepEqual(
    obj.result.value.archivedSessionIds,
    ['s-archived'],
    '归档列表只暴露当前用户可见的归档 ID',
  );
});

test('Issue #16：filterArchivedSessionIds 只保留可见且允许枚举的归档槽位', () => {
  const obj = {
    result: {
      value: {
        archivedSessionIds: ['s-visible', 's-disabled', 's-other', 7],
        items: [{
          id: 'w1',
          sessionIds: ['s-visible', 's-disabled'],
          archivedSessionIds: ['s-visible', 's-disabled', 's-other'],
        }],
      },
    },
  };
  filterArchivedSessionIds(obj, (id) => id === 's-visible');
  assert.deepEqual(obj.result.value.archivedSessionIds, ['s-visible']);
  assert.deepEqual(obj.result.value.items[0].archivedSessionIds, ['s-visible']);
  assert.deepEqual(obj.result.value.items[0].sessionIds, ['s-visible', 's-disabled'], '归档不应从工作区会话槽位移除');
});

test('Issue #16：归档快照只接受明确数组，并支持空数组替换旧状态', () => {
  const snapshot = new Set(['old-archived']);
  assert.equal(replaceArchivedSessionSnapshot(snapshot, {
    result: { value: { archivedSessionIds: ['s-archived', 17] } },
  }), true);
  assert.deepEqual([...snapshot], ['s-archived']);
  assert.equal(replaceArchivedSessionSnapshot(snapshot, {
    result: { value: { archivedSessionIds: [] } },
  }), true);
  assert.equal(snapshot.size, 0, '明确空数组必须清除旧归档状态');
  assert.equal(replaceArchivedSessionSnapshot(snapshot, { result: { value: {} } }), false);
  assert.equal(snapshot.size, 0, '字段缺失不得改变已有状态');
});

test('Issue #16：归档快照超量时拒绝更新且保留旧集合', () => {
  const snapshot = new Set(['keep-me']);
  const ids = Array.from({ length: MAX_ARCHIVED_SESSION_IDS + 1 }, (_, i) => `s-${i}`);
  assert.equal(replaceArchivedSessionSnapshot(snapshot, { archivedSessionIds: ids }), false);
  assert.deepEqual([...snapshot], ['keep-me']);
});

test('Issue #16：归档快照缺失时 session.list 过滤仍隐藏已归档会话', () => {
  const snapshot = new Set(['s-archived']);
  const tree = {
    result: { value: [
      { sessionId: 's-active', cwd: '/root/work' },
      { sessionId: 's-archived', cwd: '/root/work' },
    ] },
  };
  const out = filterSessionItems(tree, (id) => !snapshot.has(id)) as typeof tree;
  assert.deepEqual((out.result.value as Array<{ sessionId: string }>).map((item) => item.sessionId), ['s-active']);
});

test('F-25：filterSessionItems 只保留自己拥有的会话（sessionId+cwd 条目）', () => {
  const owned = new Set(['s-own']);
  const tree = {
    result: {
      value: [
        { sessionId: 's-own', cwd: '/root/11', title: 'mine' },
        { sessionId: 's-other', cwd: '/root/21', title: 'theirs' },
        { sessionId: 's-admin', cwd: '/root/21', title: 'admin' },
      ],
    },
  };
  const out = filterSessionItems(tree, (id) => owned.has(id)) as typeof tree;
  const items = out.result.value as Array<{ sessionId: string }>;
  assert.deepEqual(items.map((i) => i.sessionId), ['s-own'], '只留下自己拥有的会话');
});

test('F-25：受限子用户按 cwd 白名单过滤会话（去未分组+新会话孤儿）', () => {
  const owned = (id: string) => id.startsWith('s-');
  const allowed = (cwd: string) => cwd.startsWith('/root/21') || cwd === '/root/21';
  const tree = {
    result: {
      value: [
        // 权限撤销前在 /root/11 创建的旧会话：工作区已被隐藏 → 应丢弃
        { sessionId: 's-old11', cwd: '/root/11', blank: true },
        // 当前授权目录 /root/21 内的会话 → 保留
        { sessionId: 's-new21', cwd: '/root/21', blank: true },
        // cwd 字段缺失：无法确认在白名单内 → fail-closed 丢弃
        { sessionId: 's-nocwd', blank: true },
      ],
    },
  };
  const out = filterSessionItems(tree, owned, allowed) as typeof tree;
  const items = out.result.value as Array<{ sessionId: string }>;
  assert.deepEqual(items.map((i) => i.sessionId), ['s-new21'], '只保留白名单内会话，未分组孤儿被剔除');
});

test('F-25：cwdAllowed 为 null 时不按目录过滤（不限目录子用户保持归属语义）', () => {
  const owned = new Set(['s-a']);
  const tree = {
    result: {
      value: [
        { sessionId: 's-a', cwd: '/anywhere', blank: true },
        { sessionId: 's-b', cwd: '/elsewhere', blank: true },
      ],
    },
  };
  const out = filterSessionItems(tree, (id) => owned.has(id), null) as typeof tree;
  const items = out.result.value as Array<{ sessionId: string }>;
  assert.deepEqual(items.map((i) => i.sessionId), ['s-a'], '不限目录只按归属');
});

test('F-25：collectSessionCwd 收集 sessionId→cwd（供会话作用域 RPC 校验）', () => {
  const tree = {
    result: {
      value: {
        items: [
          { sessionId: 's-1', cwd: '/root/11' },
          { sessionId: 's-2', cwd: '/root/21' },
          { sessionId: 's-3' }, // 无 cwd → 不收集
        ],
      },
    },
  };
  const m = collectSessionCwd(tree);
  assert.equal(m.get('s-1'), '/root/11');
  assert.equal(m.get('s-2'), '/root/21');
  assert.equal(m.has('s-3'), false, '无 cwd 不收集');
});

test('F-25：collectSessionCwdFromWorkspaces 用工作区 path 反推会话 cwd', () => {
  const tree = {
    result: {
      value: {
        items: [
          { workspaceId: 'w1', path: '/root/11', sessionIds: ['s-1', 's-2'] },
          { workspaceId: 'w2', path: '/root/21', sessionIds: ['s-3'] },
        ],
        archivedSessionIds: ['s-4'],
      },
    },
  };
  const m = collectSessionCwdFromWorkspaces(tree);
  assert.equal(m.get('s-1'), '/root/11');
  assert.equal(m.get('s-2'), '/root/11');
  assert.equal(m.get('s-3'), '/root/21');
  assert.equal(m.has('s-4'), false, 'archived 不在工作区 items 里 → 不映射（fail-closed）');
});
