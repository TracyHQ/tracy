// 目录选择器删除按钮：纯函数单测 + 源码契约断言（无 DOM 依赖）。
//
// 覆盖：
//   - extractPickerListings：从真实形状的 directoryPicker/list 响应信封里
//     收集目录条目数组（含 parent/child 双列与 hidden 字段）
//   - matchPickerListing：列名序列 → 已抓列表的匹配（精确优先、子序列回退）
//   - pickerText / locales：zh/en 键一致且非空
//   - interpretDeleteResponse / requestDelete：删除结果归一化与网络异常兜底，
//     所有路径都显式携带 retry；409 CLEANUP_RETRY_CONFLICT 归一化为 conflict
//     （撤销墓碑/重试状态，恢复常规删除）
//   - 源码契约（Node 侧无真实 DOM，参照 client-chat-fab 的静态断言方式）：
//     注入控件是原生 button 且键盘可达（普通行与重试态 tabindex=0，Enter/Space
//     原生触发同一 click handler，不绕过二次确认/授权语义）、
//     墓碑行同时退出指针与键盘可达、墓碑 CSS 不误伤重试按钮、扫描排除注入按钮、
//     React 复用行时重绑路径并解除在途 pending（防永久 disabled）、迟到结果按
//     路径+请求代次丢弃、conflict 分支不卡在仅重试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractPickerListings,
  interpretDeleteResponse,
  isPickerEntry,
  matchPickerListing,
  pickerText,
  requestDelete,
} from '../src/client/picker-delete';
import { zh, en } from '../src/client/locales';

/** 官方 directoryPicker/list 响应信封（server-response → result.value）。
 *  实测形状：value 内含 parent 与 child 两个 entries 数组（双列）。 */
function listEnvelope(entries: Array<Array<Record<string, unknown>>>, extra: Record<string, unknown> = {}): unknown {
  return {
    type: 'server-response',
    rpcId: 'rpc-1',
    result: {
      ok: true,
      value: {
        path: '/root',
        home: '/root',
        truncated: false,
        ...extra,
        ...Object.fromEntries(entries.map((list, i) => [`key${i}`, { entries: list }])),
      },
    },
  };
}

test('extractPickerListings：收集响应内全部目录条目数组（双列）并保留 hidden', () => {
  const parent = [
    { path: '/root/22', name: '22', hidden: false },
    { path: '/root/.cache', name: '.cache', hidden: true },
  ];
  const child = [{ path: '/root/22/sub', name: 'sub', hidden: false }];
  const found = extractPickerListings(listEnvelope([parent, child]));
  assert.equal(found.length, 2);
  assert.deepEqual(found[0], [
    { path: '/root/22', name: '22', hidden: false },
    { path: '/root/.cache', name: '.cache', hidden: true },
  ]);
  assert.deepEqual(found[1], [{ path: '/root/22/sub', name: 'sub', hidden: false }]);
});

test('extractPickerListings：真实信封只采集 entries，不把 crumbs 当目录列表', () => {
  const entries = [{ path: '/root/22', name: '22', hidden: false }];
  const crumbs = [
    { path: '/', name: 'root', hidden: false },
    { path: '/root', name: 'root', hidden: false },
  ];
  const found = extractPickerListings({
    type: 'server-response',
    rpcId: 'rpc-real-envelope',
    result: {
      ok: true,
      value: {
        path: '/root',
        home: '/root',
        crumbs,
        entries,
        truncated: false,
      },
    },
  });
  assert.deepEqual(found, [[{ path: '/root/22', name: '22', hidden: false }]]);
});

test('extractPickerListings：排除 truncated=true 的不完整 entries 列表', () => {
  const found = extractPickerListings({
    result: {
      ok: true,
      value: {
        path: '/root',
        home: '/root',
        crumbs: [],
        entries: [{ path: '/root/partial', name: 'partial', hidden: false }],
        truncated: true,
      },
    },
  });
  assert.deepEqual(found, []);
});

test('extractPickerListings：hidden 缺省为 false；空/畸形信封返回空数组', () => {
  const found = extractPickerListings(listEnvelope([[{ path: '/a', name: 'a' }]]));
  assert.deepEqual(found, [[{ path: '/a', name: 'a', hidden: false }]]);
  assert.deepEqual(extractPickerListings(null), []);
  assert.deepEqual(extractPickerListings({}), []);
  assert.deepEqual(extractPickerListings({ result: { ok: false, error: {} } }), []);
  // 混入非条目对象的数组不算目录列表
  assert.deepEqual(extractPickerListings({ value: { entries: [{ path: '/a', name: 'a' }, 'x'] } }), []);
});

test('isPickerEntry：path/name 必须是非空字符串', () => {
  assert.equal(isPickerEntry({ path: '/a', name: 'a' }), true);
  assert.equal(isPickerEntry({ path: '', name: 'a' }), false);
  assert.equal(isPickerEntry({ path: '/a', name: 1 }), false);
  assert.equal(isPickerEntry(null), false);
  assert.equal(isPickerEntry([1]), false);
});

test('matchPickerListing：精确序列相等优先命中（最新在前）', () => {
  const listings = [
    { names: ['a', 'b', 'c'] }, // 最新
    { names: ['a', 'b'] },
    { names: ['x'] },
  ];
  assert.equal(matchPickerListing(['a', 'b', 'c'], listings), 0);
  assert.equal(matchPickerListing(['a', 'b'], listings), 1);
  assert.equal(matchPickerListing(['x'], listings), 2);
});

test('matchPickerListing：显示被过滤时按有序子序列回退，取最长候选', () => {
  const listings = [
    { names: ['a', 'x'] }, // 短但也是子序列宿主
    { names: ['a', 'b', 'c', 'd'] }, // 最长宿主 → 应命中
  ];
  // 列上只显示了 a、c（b/d 被隐藏开关或前缀过滤掉了）
  assert.equal(matchPickerListing(['a', 'c'], listings), 1);
  // 顺序不匹配（c 在 a 前）不算子序列
  assert.equal(matchPickerListing(['c', 'a'], listings), null);
  // 两个同长度候选都能解释过滤后的列时不能猜路径，避免误删父目录。
  assert.equal(
    matchPickerListing(['a', 'c'], [
      { names: ['a', 'b', 'c', 'd'] },
      { names: ['a', 'x', 'c', 'y'] },
    ]),
    null,
  );
});

test('matchPickerListing：空名序列或无候选/无命中返回 null', () => {
  assert.equal(matchPickerListing([], [{ names: ['a'] }]), null);
  assert.equal(matchPickerListing(['a'], []), null);
  assert.equal(matchPickerListing(['zzz'], [{ names: ['a'] }]), null);
});

test('pickerText/locales：zh 与 en 键完全一致且删除文案非空', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of ['pickerDel', 'pickerDelConfirm', 'pickerDelAria', 'pickerDelDone', 'pickerDelFailed'] as const) {
    assert.equal(typeof zh[key], 'string');
    assert.ok((zh[key] as string).length > 0);
    assert.ok((en[key] as string).length > 0);
  }
  for (const value of Object.values(pickerText)) assert.ok(value.length > 0);
});

// ── 删除结果归一化 ───────────────────────────────────────────────

test('interpretDeleteResponse：2xx 成功 → 移除行、无警告、不重试', () => {
  assert.deepEqual(interpretDeleteResponse(true, { ok: true, path: '/root/22' }), {
    deleted: true,
    message: null,
    error: false,
    retry: false,
  });
});

test('interpretDeleteResponse：目录已删但联动部分失败 → 仍算删除、只警告不重试', () => {
  const softWarning = interpretDeleteResponse(true, { ok: true, warnings: ['workspace: sync failed'] });
  assert.equal(softWarning.deleted, true);
  assert.equal(softWarning.error, true);
  assert.equal(softWarning.retry, false);
  assert.equal(softWarning.message, 'workspace: sync failed');

  // 非 2xx 但携带 deleted：行必须移除（本地已确认删除），不得当作未删除
  const partial = interpretDeleteResponse(false, {
    deleted: '/root/22',
    error: 'workspace sync failed',
    warnings: ['db: skipped'],
  });
  assert.equal(partial.deleted, true);
  assert.equal(partial.error, true);
  assert.equal(partial.retry, false);
  assert.equal(partial.message, 'workspace sync failed\ndb: skipped');
});

test('interpretDeleteResponse：DB 或 sidebar 清理失败（retryable）进入重试', () => {
  assert.equal(interpretDeleteResponse(false, { deleted: '/root/22', retryable: true, error: 'e' }).retry, true);
  assert.equal(interpretDeleteResponse(false, { deleted: '/root/22', code: 'DB_CLEANUP_FAILED', error: 'e' }).retry, true);
  assert.equal(interpretDeleteResponse(false, { deleted: '/root/22', code: 'WORKSPACE_SYNC_FAILED', retryable: true, error: 'e' }).retry, true);
  assert.equal(interpretDeleteResponse(false, { deleted: '/root/22', code: 'WORKSPACE_SYNC_UNAVAILABLE', retryable: true, error: 'e' }).retry, true);
  // 其他失败、未带 deleted、2xx 都不能走重试（重试只做幂等授权清理，不重新物理删除）
  assert.equal(interpretDeleteResponse(false, { deleted: '/root/22', code: 'OTHER', error: 'e' }).retry, false);
  assert.equal(interpretDeleteResponse(false, { retryable: true, error: 'e' }).retry, false);
  assert.equal(interpretDeleteResponse(true, { ok: true, retryable: true }).retry, false);
});

test('interpretDeleteResponse：409 CLEANUP_RETRY_CONFLICT → conflict（撤销重试、恢复常规删除）', () => {
  const conflict = interpretDeleteResponse(false, {
    ok: false,
    code: 'CLEANUP_RETRY_CONFLICT',
    error: '目录已被重新创建；为避免删除新内容，授权清理重试已取消。请刷新后按常规删除流程操作',
  });
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.deleted, false);
  assert.equal(conflict.retry, false);
  assert.equal(conflict.error, true);
  assert.match(conflict.message!, /已被重新创建/);

  // 防御：即使响应同时带 deleted/retryable，冲突也必须压过重试（否则会回到仅重试状态）
  const defensive = interpretDeleteResponse(false, {
    ok: false,
    code: 'CLEANUP_RETRY_CONFLICT',
    retryable: true,
    deleted: '/root/recreated',
    error: '冲突',
  });
  assert.equal(defensive.conflict, true);
  assert.equal(defensive.deleted, false);
  assert.equal(defensive.retry, false);

  // 非冲突结果不带 conflict 字段（保持既有四字段形状，兼容外部断言）
  assert.equal(interpretDeleteResponse(true, { ok: true, code: 'CLEANUP_RETRY_CONFLICT' }).conflict, undefined);
  assert.equal(interpretDeleteResponse(false, { ok: false, code: 'OTHER', error: 'e' }).conflict, undefined);
  assert.equal(Object.hasOwn(interpretDeleteResponse(false, { error: 'nope' }), 'conflict'), false);
});

test('interpretDeleteResponse：未删除/畸形响应保留行；所有路径都显式给 retry', () => {
  assert.deepEqual(interpretDeleteResponse(false, { error: 'nope' }), {
    deleted: false,
    message: 'nope',
    error: true,
    retry: false,
  });
  const malformed = interpretDeleteResponse(false, null);
  assert.equal(malformed.deleted, false);
  assert.equal(malformed.message, pickerText.failed);
  assert.equal(malformed.error, true);
  assert.equal(typeof malformed.retry, 'boolean');
});

test('requestDelete：POST 删除端点；2xx ok 归一化为已删除且不进入重试', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  }) as unknown as typeof fetch;
  try {
    const outcome = await requestDelete('/root/gone');
    assert.deepEqual(outcome, { deleted: true, message: null, error: false, retry: false });
    assert.equal(calls[0]?.url, '/gateway/api/fs/delete-directory');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.equal(calls[0]?.init?.credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestDelete：网络异常返回未删除兜底，显式携带 retry=false（客户端类型检查强制）', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
  try {
    const outcome = await requestDelete('/root/gone');
    assert.deepEqual(outcome, { deleted: false, message: pickerText.failed, error: true, retry: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestDelete：409 CLEANUP_RETRY_CONFLICT 归一化为 conflict（cleanupOnly 重试被服务端取消）', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: false,
      json: () =>
        Promise.resolve({
          ok: false,
          code: 'CLEANUP_RETRY_CONFLICT',
          error: '目录已被重新创建；为避免删除新内容，授权清理重试已取消',
        }),
    });
  }) as unknown as typeof fetch;
  try {
    const outcome = await requestDelete('/root/recreated', true);
    assert.equal(outcome.conflict, true);
    assert.equal(outcome.deleted, false);
    assert.equal(outcome.retry, false);
    assert.equal(outcome.error, true);
    assert.equal(JSON.parse(String(calls[0]?.init?.body)).cleanupOnly, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── 源码契约：键盘可达性 / 墓碑行为（Node 侧无真实 DOM，做静态断言） ──

function pickerSource(): string {
  return readFileSync(new URL('../src/client/picker-delete.ts', import.meta.url), 'utf8');
}

test('源码契约：注入控件是原生 button 且键盘可达；普通行与重试态都 tabindex=0（Enter/Space 原生可操作）', () => {
  const source = pickerSource();
  assert.match(source, /document\.createElement\('button'\)/, '注入控件必须是原生 <button>');
  assert.match(source, /node\.type = 'button'/, '原生按钮需显式 type=button（不参与表单提交）');
  assert.match(source, /node\.setAttribute\('tabindex', '0'\)/, '普通行按钮必须进入 Tab 序列，键盘可达');
  assert.doesNotMatch(source, /node\.setAttribute\('tabindex', '-1'\)/, '注入按钮不得移出 Tab 序列');
  assert.match(source, /node\.setAttribute\('aria-label', label\)/, '重试按钮需设置可读名称');
  assert.match(source, /\$\{pickerText\.retry\}: \$\{name\}/, '重试名称来自 pickerText.retry + 目录名');
});

test('源码契约：键盘激活与鼠标共用同一 click handler（不新增 keydown 旁路，授权/请求语义一致）', () => {
  const source = pickerSource();
  assert.match(source, /node\.addEventListener\('click'/, '原生 button 的 Enter/Space 会 native 触发 click');
  assert.doesNotMatch(source, /addEventListener\('keydown'/, '不得用自定义 keydown 另开一条激活路径');
});

test('源码契约：重试单击直达，不进入二次确认武装（不会再次物理删除）', () => {
  const source = pickerSource();
  assert.match(source, /const retryPending = node\.getAttribute\('data-dshpw-picker-del-retry'\) === '1'/);
  assert.match(source, /if \(!retryPending && !node\.classList\.contains\('dshpw-picker-del-arm'\)\)/);
});

test('源码契约：墓碑行退出指针与键盘可达；重试按钮不被墓碑选择器误伤', () => {
  const source = pickerSource();
  // CSS：墓碑规则用 :not 只命中官方行按钮，避免特异度覆盖 .dshpw-picker-del-retry 的 pointer-events
  const tombstone = /\[role="listitem"\]\.dshpw-picker-del-tombstone>button([^{]*)\{([^}]*)\}/.exec(source);
  assert.ok(tombstone, '应存在墓碑行按钮规则');
  assert.ok(tombstone[1].includes(':not(.dshpw-picker-del)'), '墓碑规则必须排除注入的重试按钮');
  assert.match(tombstone[2], /pointer-events:\s*none/, '官方行按钮必须指针不可达');
  const retryRule = /\.dshpw-picker-del\.dshpw-picker-del-retry\{([^}]*)\}/.exec(source);
  assert.ok(retryRule, '重试按钮应有独立样式规则');
  assert.match(retryRule[1], /pointer-events:\s*auto/, '重试按钮必须保持可点击');
  // 键盘：官方行按钮 tabindex=-1 + aria-disabled，退出墓碑时还原
  assert.match(source, /setRowKeyboardInert\(rowHost, true\)/);
  assert.match(source, /setRowKeyboardInert\(rowHost, false\)/);
  assert.match(source, /rowButton\.setAttribute\('tabindex', '-1'\)/);
  assert.match(source, /rowButton\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(source, /rowButton\.removeAttribute\('aria-disabled'\)/);
});

test('源码契约：原生 button 复位 UA 样式（边框/内边距/外观）', () => {
  const base = /\.dshpw-picker-del\{([^}]*)\}/.exec(pickerSource());
  assert.ok(base, '应存在 .dshpw-picker-del 基础规则');
  for (const declaration of ['border:0', 'padding:0', 'appearance:none']) {
    assert.ok(base[1].includes(declaration), `基础规则应包含 ${declaration}`);
  }
});

test('源码契约：扫描行时排除注入按钮（原生 button 不会被当作目录行）', () => {
  assert.match(
    pickerSource(),
    /:scope > \[role="listitem"\] > button:not\(\.dshpw-picker-del\)/,
    '行枚举选择器必须排除注入的 .dshpw-picker-del',
  );
});

test('源码契约：兼容 rc.2 XMLHttpRequest 目录列表，并保留绝对路径安全边界', () => {
  const source = pickerSource();
  assert.match(source, /function wrapXhrForListings\(\)/);
  assert.match(source, /Xhr\.prototype\.open/);
  assert.match(source, /Xhr\.prototype\.send/);
  assert.match(source, /captureListingEnvelope/);
  assert.match(source, /parsed\.pathname === LIST_ENDPOINT_SUFFIX/);
  assert.match(source, /wrapXhrForListings\(\);/);
});

test('源码契约：行复用重绑路径时同步解除在途 pending（修复永久 disabled 死锁）', () => {
  const source = pickerSource();
  // 旧实现因 pending 直接跳过整次注入：重绑后的新路径会带着旧请求的锁；该早退必须消失
  assert.doesNotMatch(source, /if \(existing\.getAttribute\(REQUEST_PENDING_ATTR\) === '1'\) return;/);
  // 重绑分支：解除 pending + 恢复可用 + 撤销旧绑定的二次确认武装，最后写入新路径
  const start = source.indexOf('if (previousPath !== path) {');
  const end = source.indexOf('if (cleanupsPending.has(path))', start);
  assert.ok(start >= 0 && end > start, '应存在路径变化时的重绑分支');
  const rebind = source.slice(start, end);
  assert.ok(rebind.includes('existing.removeAttribute(REQUEST_PENDING_ATTR)'), '重绑必须解除 pending 标记');
  assert.ok(rebind.includes('existing.disabled = false'), '重绑必须恢复按钮可用');
  assert.ok(rebind.includes("existing.classList.remove('dshpw-picker-del-arm')"), '重绑必须撤销旧路径的二次确认武装');
  assert.ok(rebind.includes('existing.setAttribute(PATH_ATTR, path)'), '重绑必须写入新路径');
  // 行移除以注入节点为锚点（注入时捕获的官方按钮引用可能已被 React 替换）
  assert.match(source, /dropRowAfterDelete\(node\)/);
  assert.match(source, /node\.closest\('\[role="listitem"\]'\)/);
});

test('源码契约：迟到请求按路径 + 请求代次丢弃（不覆盖重绑后的新绑定）', () => {
  const source = pickerSource();
  assert.match(source, /let requestSerial = 0;/);
  assert.match(source, /const serial = \+\+requestSerial;/);
  assert.match(
    source,
    /const stale = \(\): boolean => node\.getAttribute\(PATH_ATTR\) !== current \|\| requestSerial !== serial;/,
  );
  // then 与 finally 都以 stale() 收口：旧请求既不能应用结果，也不能清掉新请求的 pending
  assert.equal((source.match(/if \(stale\(\)\) return;/g) ?? []).length, 2);
});

test('源码契约：conflict 分支撤销墓碑/重试并恢复常规删除（不卡在仅重试）', () => {
  const source = pickerSource();
  const start = source.indexOf('if (outcome.conflict) {');
  const end = source.indexOf('if (!outcome.deleted) {', start);
  assert.ok(start >= 0 && end > start, 'conflict 分支应位于 deleted 判断之前');
  const branch = source.slice(start, end);
  assert.match(branch, /clearRetryState\(node, rowHost, current\)/, '必须退出墓碑/重试态');
  assert.match(branch, /setDeleteButtonLabel\(/, '必须恢复常规删除标签');
  assert.match(branch, /showToast\(outcome\.message \?\? pickerText\.failed, true\)/, '必须向用户展示服务端原因');
  assert.doesNotMatch(branch, /dropRowAfterDelete/, '目录已被重新创建，不能移除该行');
});
