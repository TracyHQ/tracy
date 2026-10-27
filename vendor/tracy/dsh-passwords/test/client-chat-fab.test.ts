// 聊天入口 FAB（浮动按钮）退场行为：
//   - 面板打开时入口淡出（命名空间隐藏类 + tabIndex/aria），不可点击/拖动/键盘聚焦
//   - 打开面板把键盘焦点移入面板（优先关闭按钮）；关闭动画完全结束后焦点归还入口；
//     若焦点在动画期间已被用户移到页面其他元素，则不抢回
//   - 关闭动画（closing）期间入口恢复可用：点击即“关闭途中立即重开”，
//     openPanel 会取消 pending 的 close 定时器（不能连 closing 一起隐藏，否则该路径不可达），
//     并把焦点从入口移回面板（关闭按钮），且重开不会误触发焦点归还
//   - 打开面板会取消进行中的拖动（清空 drag ref + 移除 .dragging），避免 transition:none 抑制淡出
//   - 关闭完成后恢复拖动/点击；chat_enabled 偏好关闭时整体卸载、重新开启后恢复
//   - 面板打开期间键盘：Esc 关闭并消费事件（preventDefault + stopPropagation，不泄漏给 DSH 宿主；
//     closing 动画中只消费、不重复关闭）；Tab/Shift+Tab 在面板可聚焦控件内环绕
//     （closing 与关闭后不拦截；无可聚焦/单个可聚焦控件时安全处理）
//   - IME 组合输入期间（isComposing / keyCode 229）：Esc 不关闭、Enter 不发送、事件不被消费；
//     组合结束后恢复原有快捷键语义（组合中的 Esc/Enter 属于输入法取消/上屏）
//
// 渲染真实组件（react-test-renderer，无真实 DOM 依赖），window 定时器改为手动触发，
// 避免 180ms 关闭动画 / 4s 轮询带来真实等待与不稳定；createNodeMock 提供可记录 focus()
// 的假 DOM 节点，用于断言焦点移交。console.error/warn 一律收集（不静默吞掉），
// 每个用例结束（含卸载）都断言为空。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { inspect } from 'node:util';
import { createElement, type ComponentProps, type ReactElement } from 'react';
import * as ReactRuntime from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ChatLauncher } from '../src/client/chat.tsx';
import { CHAT_ENTRY_CHANGED_EVENT } from '../src/client/events.ts';

// chat.tsx 是全仓库唯一使用 JSX 语法的客户端文件（card/token 等手工 createElement）。
// 生产构建用 esbuild jsx:automatic；而 tsx 测试运行器按仓库 tsconfig（未声明 jsx）走
// classic 变换，JSX 会编译成自由变量 React.createElement，源码没有 React 绑定。
// 这里补一个全局 React 供测试渲染（仅影响本测试进程，不改产物）。
(globalThis as { React?: typeof ReactRuntime }).React = ReactRuntime;

type Listener = (event: unknown) => void;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 面板打开时入口使用的命名空间隐藏类（不再用易冲突的通用 .hidden） */
const FAB_HIDDEN_CLASS = 'dshpw-chat-fab-hidden';
/** createNodeMock 生成的假节点标识：按元素类型 + className 计算 */
const FAB_NODE = 'button.dshpw-chat-fab';
const CLOSE_NODE = 'button.dshpw-chat-close';
const PANEL_NODE = 'div.dshpw-chat-panel';

const hasClass = (instance: ReactTestInstance, name: string): boolean =>
  String(instance.props.className ?? '')
    .split(' ')
    .includes(name);

interface MockNode {
  focus(): void;
  click(): void;
  contains(node: unknown): boolean;
  /** 仅面板节点：返回测试注入的可聚焦控件（模拟真实 DOM 的 querySelectorAll） */
  querySelectorAll?(selector: string): MockNode[];
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** 假 DOM 节点标识：无 className 时仅用元素类型（焦点断言只关心 FAB/关闭按钮） */
function mockNodeKey(element: ReactElement): string {
  const props = element.props as { className?: unknown };
  const className = typeof props.className === 'string' ? props.className.split(/\s+/).filter(Boolean).join('.') : '';
  return `${String(element.type)}${className ? '.' + className : ''}`;
}

/** 键盘事件假对象：记录 preventDefault/stopPropagation 次数，便于断言“消费/不拦截”
 *  extra 供 IME 组合标记（isComposing/keyCode 229）使用，默认值保持既有调用不变 */
function keyEvent(key: string, shiftKey = false, extra: { isComposing?: boolean; keyCode?: number } = {}) {
  const calls = { preventDefault: 0, stopPropagation: 0 };
  return {
    key,
    shiftKey,
    ...extra,
    preventDefault: () => {
      calls.preventDefault += 1;
    },
    stopPropagation: () => {
      calls.stopPropagation += 1;
    },
    calls,
  };
}

/** React 合成键盘事件假对象（input onKeyDown）：IME 判定读 nativeEvent.isComposing 与 keyCode */
function reactKeyEvent(
  key: string,
  options: { isComposing?: boolean; keyCode?: number; shiftKey?: boolean } = {},
) {
  const calls = { preventDefault: 0 };
  return {
    key,
    shiftKey: options.shiftKey ?? false,
    keyCode: options.keyCode ?? 13,
    nativeEvent: { isComposing: options.isComposing ?? false },
    preventDefault: () => {
      calls.preventDefault += 1;
    },
    calls,
  };
}

async function mountChat(t: TestContext) {
  const listeners = new Map<string, Set<Listener>>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const timerLog: Array<{ id: number; delay: number }> = [];
  let nextTimer = 0;
  let renderer: ReactTestRenderer | undefined;
  const focusEvents: string[] = [];
  const consoleIssues: string[] = [];

  // 不允许静默吞掉告警：收集 console.error/warn 原文，断言失败时能看到完整信息
  const recordConsole = (level: 'error' | 'warn') => (...args: unknown[]) => {
    consoleIssues.push(
      `${level}: ${args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg))).join(' ')}`,
    );
  };
  t.mock.method(console, 'error', recordConsole('error'));
  t.mock.method(console, 'warn', recordConsole('warn'));

  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      innerWidth: 1024,
      innerHeight: 768,
      setTimeout(callback: () => void, delay: number) {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        timerLog.push({ id, delay });
        return id;
      },
      clearTimeout(id: number) {
        timers.delete(id);
      },
      addEventListener(type: string, listener: Listener) {
        const set = listeners.get(type) ?? new Set<Listener>();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: Listener) {
        listeners.get(type)?.delete(listener);
      },
    },
  });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  t.after(async () => {
    try {
      await act(async () => {
        renderer?.unmount();
      });
    } finally {
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else Reflect.deleteProperty(globalThis, 'window');
      if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
    // 卸载（含 React act 告警）也必须零告警；放在最后统一断言，避免卸载路径漏检
    assert.deepEqual(consoleIssues, [], `渲染/交互/卸载不应产生 console 错误或警告：\n${consoleIssues.join('\n')}`);
  });

  const requests: string[] = [];
  // 记录请求方法：IME 测试需要区分轮询 GET 与发送 POST（断言组合中 Enter 未发送）
  const requestLog: Array<{ url: string; method: string }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    requestLog.push({ url, method: init?.method ?? 'GET' });
    if (url.startsWith('/api/dsh-passwords/state')) {
      return Response.json({ chatEnabled: true, mediaEnabled: false, users: [] });
    }
    if (url.startsWith('/gateway/api/messages')) {
      return Response.json({ ok: true, messages: [], me: { id: 1, username: 'tester', role: 'admin' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  // 面板内可聚焦元素由测试注入（react-test-renderer 无真实 DOM）：面板假节点的
  // querySelectorAll 返回注入列表，contains 仅对列表内节点为真，用于验证 Tab 环绕。
  const panelFocusables: MockNode[] = [];
  const focusState: { active: MockNode | null } = { active: null };

  // 假 DOM 节点：默认 createNodeMock 缺失时 ref 为 null，无法断言焦点；
  // 按“创建时的元素身份”记录 focus() 调用（host 实例只在挂载时创建一次）。
  const createNodeMock = (element: ReactElement): MockNode => {
    const key = mockNodeKey(element);
    if (key === PANEL_NODE) {
      return {
        focus() {},
        click() {},
        contains: (node: unknown) => panelFocusables.includes(node as MockNode),
        querySelectorAll: () => panelFocusables.slice(),
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
      };
    }
    return {
      focus() {
        focusEvents.push(key);
      },
      click() {},
      contains: () => false,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
    };
  };

  const translate = ((key: string) => key) as ComponentProps<typeof ChatLauncher>['t'];
  await act(async () => {
    renderer = create(createElement(ChatLauncher, { t: translate }), { createNodeMock });
  });

  const fab = () => renderer!.root.findByProps({ 'aria-label': 'chat.open' });
  const dialog = () => renderer!.root.findAllByProps({ role: 'dialog' })[0] as ReactTestInstance | undefined;
  const closeButton = () => renderer!.root.findByProps({ className: 'dshpw-chat-close' });
  const stateRequests = () => requests.filter((url) => url.startsWith('/api/dsh-passwords/state')).length;

  /** 手动触发指定 delay 的定时器（180=关闭动画，4000=轮询）；不存在时返回 false */
  async function runTimer(delay: number): Promise<boolean> {
    const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    if (!entry) return false;
    timers.delete(entry[0]);
    await act(async () => {
      entry[1].callback();
    });
    return true;
  }

  async function fireWindow(type: string, event: unknown) {
    await act(async () => {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    });
  }

  const middleDown = () => ({
    button: 1,
    clientX: 50,
    clientY: 50,
    preventDefault() {},
  });

  /** 显式断言：当前用例至今没有任何 console 错误/警告（卸载路径由 after 钩子兜底） */
  const expectNoConsoleIssues = () => {
    assert.deepEqual(consoleIssues, [], `不应产生 console 错误或警告：\n${consoleIssues.join('\n')}`);
  };

  const focusLog = () => [...focusEvents];

  return {
    renderer: renderer!,
    fab,
    dialog,
    closeButton,
    stateRequests,
    runTimer,
    fireWindow,
    middleDown,
    focusLog,
    panelFocusables,
    focusState,
    sendPosts: () =>
      requestLog.filter((r) => r.url.startsWith('/gateway/api/messages') && r.method === 'POST').length,
    timerCreates: (delay: number) => timerLog.filter((timer) => timer.delay === delay).length,
    expectNoConsoleIssues,
    hasTimer: (delay: number) => [...timers.values()].some((timer) => timer.delay === delay),
  };
}

test('面板打开时入口退场：命名空间隐藏类 + 不可键盘聚焦 + aria-hidden', async (t) => {
  const chat = await mountChat(t);
  const before = chat.fab();
  assert.equal(hasClass(before, FAB_HIDDEN_CLASS), false);
  assert.equal(hasClass(before, 'hidden'), false, '不应使用通用 .hidden 类');
  assert.equal(before.props.tabIndex, 0);
  assert.equal(before.props['aria-hidden'], undefined);

  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.ok(chat.dialog(), '面板应已渲染');

  const opened = chat.fab();
  assert.equal(hasClass(opened, FAB_HIDDEN_CLASS), true, '打开后入口应带隐藏类（淡出退场）');
  assert.equal(hasClass(opened, 'hidden'), false, '不应使用通用 .hidden 类');
  assert.equal(opened.props.tabIndex, -1, '打开后入口不应可键盘聚焦');
  assert.equal(opened.props['aria-hidden'], true, '打开后入口应从无障碍树移除');
  chat.expectNoConsoleIssues();
});

test('焦点移交：打开聚焦关闭按钮，关闭动画结束后归还入口', async (t) => {
  const chat = await mountChat(t);
  assert.deepEqual(chat.focusLog(), [], '初始挂载不应抢焦点');

  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.equal(chat.focusLog().at(-1), CLOSE_NODE, '打开后应把键盘焦点移入面板（关闭按钮）');

  await act(async () => {
    chat.closeButton().props.onClick();
  });
  assert.equal(hasClass(chat.dialog()!, 'closing'), true);
  assert.equal(chat.focusLog().includes(FAB_NODE), false, '关闭动画期间不应立即归还焦点');

  assert.equal(await chat.runTimer(180), true, '关闭定时器应触发');
  assert.equal(chat.dialog(), undefined, '关闭动画结束后面板应卸载');
  assert.equal(chat.focusLog().at(-1), FAB_NODE, '关闭动画结束后焦点应归还入口');
  chat.expectNoConsoleIssues();
});

test('关闭动画期间用户把焦点移出面板：不抢回焦点', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });

  // 模拟真实浏览器：关闭发起瞬间焦点在 body（视为面板持有，应负责归还）；
  // 关闭动画期间用户把焦点移到页面其他元素后，归还逻辑必须放弃。
  const external = { tag: 'external' };
  const body = { tag: 'body' };
  const doc = {
    body,
    activeElement: body as unknown,
    contains: (node: unknown) => node === body || node === external,
  };
  const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => {
    if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  await act(async () => {
    chat.closeButton().props.onClick();
  });
  const fabFocusCount = chat.focusLog().filter((node) => node === FAB_NODE).length;
  doc.activeElement = external; // 关闭动画期间焦点被用户移到面板外

  assert.equal(await chat.runTimer(180), true, '关闭定时器应触发');
  assert.equal(chat.dialog(), undefined, '关闭动画结束后面板应卸载');
  assert.equal(
    chat.focusLog().filter((node) => node === FAB_NODE).length,
    fabFocusCount,
    '焦点已被用户移走时不应抢回入口',
  );
  chat.expectNoConsoleIssues();
});

test('关闭途中立即重开：入口可点、close 定时器取消、焦点不归还', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });

  await act(async () => {
    chat.closeButton().props.onClick();
  });
  const backdrop = chat.dialog();
  assert.ok(backdrop && hasClass(backdrop, 'closing'), '应进入关闭动画');
  assert.equal(hasClass(chat.fab(), FAB_HIDDEN_CLASS), false, '关闭动画期间入口应淡入恢复');
  assert.equal(chat.fab().props.tabIndex, 0);
  assert.equal(chat.fab().props['aria-hidden'], undefined);
  assert.equal(chat.hasTimer(180), true, '应存在 180ms 关闭定时器');

  // 关闭途中立即重开：入口此时可见可点，openPanel 取消 pending 定时器
  const fabFocusCount = chat.focusLog().filter((node) => node === FAB_NODE).length;
  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.equal(chat.hasTimer(180), false, '重开应取消 pending 的关闭定时器');
  const reopened = chat.dialog();
  assert.ok(reopened && !hasClass(reopened, 'closing'), '重开后不应残留 closing 状态');
  assert.equal(hasClass(chat.fab(), FAB_HIDDEN_CLASS), true, '重开后入口应重新退场');
  assert.equal(
    chat.focusLog().filter((node) => node === FAB_NODE).length,
    fabFocusCount,
    '关闭途中重开不应触发焦点归还（open 未变化）',
  );

  assert.equal(await chat.runTimer(180), false, '关闭定时器已取消，不应再触发');
  assert.ok(chat.dialog(), '面板应保持打开，未被强制关闭');
  chat.expectNoConsoleIssues();
});

test('关闭途中立即重开：焦点从入口移回面板，不停留在隐藏入口上', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.equal(chat.focusLog().at(-1), CLOSE_NODE, '打开后焦点应在关闭按钮上');

  await act(async () => {
    chat.closeButton().props.onClick();
  });
  assert.ok(chat.dialog() && hasClass(chat.dialog()!, 'closing'), '应进入关闭动画');

  // 模拟真实浏览器：动画期间入口仍可见，点击入口的默认行为是先把焦点落在入口上
  // （react-test-renderer 不会模拟原生焦点，这里直接调用 host 节点 mock 的 focus）。
  chat.fab().instance.focus();
  assert.equal(chat.focusLog().at(-1), FAB_NODE, '前置条件：焦点已落在入口上（模拟浏览器默认行为）');

  await act(async () => {
    chat.fab().props.onClick();
  });

  // 重开后入口重新退场；焦点必须已移回面板，而不是留在 aria-hidden 的入口上
  assert.equal(hasClass(chat.fab(), FAB_HIDDEN_CLASS), true, '重开后入口应重新隐藏');
  assert.equal(chat.fab().props['aria-hidden'], true, '隐藏入口应从无障碍树移除');
  assert.equal(chat.fab().props.tabIndex, -1, '隐藏入口不应可键盘聚焦');
  assert.equal(chat.focusLog().at(-1), CLOSE_NODE, '重开应把焦点移回面板（关闭按钮）');
  assert.equal(chat.hasTimer(180), false, '关闭定时器应已取消');
  chat.expectNoConsoleIssues();
});

test('关闭动画结束后面板卸载，入口恢复淡入与拖动', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });
  await act(async () => {
    chat.closeButton().props.onClick();
  });
  assert.equal(await chat.runTimer(180), true, '关闭定时器应触发');
  assert.equal(chat.dialog(), undefined, '关闭动画结束后面板应卸载');

  const closed = chat.fab();
  assert.equal(hasClass(closed, FAB_HIDDEN_CLASS), false);
  assert.equal(closed.props.tabIndex, 0);
  assert.equal(closed.props['aria-hidden'], undefined);

  // 拖动恢复：中键按住 + 移动（+40/+30）
  const base = closed.props.style;
  await act(async () => {
    chat.fab().props.onMouseDown(chat.middleDown());
  });
  await chat.fireWindow('mousemove', { clientX: 90, clientY: 80 });
  await chat.fireWindow('mouseup', {});
  const moved = chat.fab().props.style;
  assert.equal(moved.left, base.left + 40, '关闭后入口应恢复拖动');
  assert.equal(moved.top, base.top + 30, '关闭后入口应恢复拖动');
  chat.expectNoConsoleIssues();
});

test('打开面板取消进行中的拖动：dragging 类移除且后续 mousemove 不再生效', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onMouseDown(chat.middleDown());
  });
  await chat.fireWindow('mousemove', { clientX: 70, clientY: 60 });
  assert.equal(hasClass(chat.fab(), 'dragging'), true, '中键拖动应进入 dragging 状态');

  // 拖动中触发打开（防御性路径：真实浏览器里中键按住时左键 click 可到达）
  await act(async () => {
    chat.fab().props.onClick();
  });
  const opened = chat.fab();
  assert.equal(hasClass(opened, 'dragging'), false, '打开应清除拖动状态（否则 transition:none 抑制淡出）');
  assert.equal(hasClass(opened, FAB_HIDDEN_CLASS), true, '打开后入口应退场');

  const frozen = { ...opened.props.style };
  await chat.fireWindow('mousemove', { clientX: 400, clientY: 400 });
  await chat.fireWindow('mouseup', {});
  assert.deepEqual({ ...chat.fab().props.style }, frozen, '拖动 ref 已取消，后续移动不应再改写位置');
  chat.expectNoConsoleIssues();
});

test('面板打开时入口不响应拖动，重复点击不重复刷新联系人', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });
  const settled = chat.stateRequests();

  const base = chat.fab().props.style;
  await act(async () => {
    chat.fab().props.onMouseDown(chat.middleDown());
  });
  await chat.fireWindow('mousemove', { clientX: 250, clientY: 250 });
  await chat.fireWindow('mouseup', {});
  assert.deepEqual(chat.fab().props.style, base, '打开状态下中键拖动应被忽略');

  // 防御性幂等：即使绕过 pointer-events 直接触发 onClick，也不重复刷新
  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.equal(chat.stateRequests(), settled, '已打开时重复触发 openPanel 不应重复拉联系人');
  chat.expectNoConsoleIssues();
});

test('chat_enabled 偏好关闭后入口卸载，重新开启后恢复可见', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick(); // 面板打开状态下关闭偏好
  });

  await chat.fireWindow(CHAT_ENTRY_CHANGED_EVENT, { detail: { enabled: false } });
  assert.equal(chat.renderer.toJSON(), null, '偏好关闭时不应渲染入口/面板');

  await chat.fireWindow(CHAT_ENTRY_CHANGED_EVENT, { detail: { enabled: true } });
  const fab = chat.fab();
  assert.equal(hasClass(fab, FAB_HIDDEN_CLASS), false, '重新开启后入口应可见可用');
  assert.equal(fab.props.tabIndex, 0);
  assert.equal(chat.dialog(), undefined, '重新开启不应恢复旧面板');
  chat.expectNoConsoleIssues();
});

test('Escape 关闭面板并消费事件：不泄漏给宿主、closing 期间不重复关闭、关闭后不再监听', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.ok(chat.dialog(), '面板应已打开');
  assert.equal(chat.focusLog().at(-1), CLOSE_NODE, '打开后焦点应在关闭按钮');

  // Esc：关闭 + preventDefault/stopPropagation（面板是顶层 modal，事件不再冒泡给 DSH 宿主）
  const esc = keyEvent('Escape');
  await chat.fireWindow('keydown', esc);
  assert.equal(hasClass(chat.dialog()!, 'closing'), true, 'Escape 应触发关闭动画');
  assert.deepEqual(esc.calls, { preventDefault: 1, stopPropagation: 1 }, 'Escape 应被面板完整消费');
  assert.equal(chat.timerCreates(180), 1, 'Escape 应只安装一个关闭定时器');

  // closing 动画期间再次 Esc：仍被消费，但不重复触发 close（避免重启 180ms 定时器）
  const duringClose = keyEvent('Escape');
  await chat.fireWindow('keydown', duringClose);
  assert.deepEqual(duringClose.calls, { preventDefault: 1, stopPropagation: 1 }, 'closing 期间 Esc 仍不得泄漏');
  assert.equal(chat.timerCreates(180), 1, 'closing 期间 Esc 不应重启关闭定时器');

  assert.equal(await chat.runTimer(180), true, '关闭定时器应正常触发');
  assert.equal(chat.dialog(), undefined, '关闭动画结束后面板应卸载');
  assert.equal(chat.focusLog().at(-1), FAB_NODE, '关闭动画结束后焦点应归还入口');

  // 面板卸载后：keydown 监听应已移除，Esc 不再被面板消费
  const after = keyEvent('Escape');
  await chat.fireWindow('keydown', after);
  assert.deepEqual(after.calls, { preventDefault: 0, stopPropagation: 0 }, '面板关闭后不应再消费 Escape');
  chat.expectNoConsoleIssues();
});

test('IME 组合输入：Escape 不关闭、不消费事件；组合结束后恢复关闭', async (t) => {
  const chat = await mountChat(t);
  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.ok(chat.dialog(), '面板应已打开');

  // 组合输入中按 Esc（取消候选）：面板不得关闭，事件也不得 preventDefault/stopPropagation，
  // 否则输入法的取消行为被截走。
  const composingEsc = keyEvent('Escape', false, { isComposing: true });
  await chat.fireWindow('keydown', composingEsc);
  assert.deepEqual(composingEsc.calls, { preventDefault: 0, stopPropagation: 0 }, '组合中的 Esc 不应被消费');
  assert.equal(chat.timerCreates(180), 0, '组合中的 Esc 不应启动关闭动画');
  assert.ok(chat.dialog() && !hasClass(chat.dialog()!, 'closing'), '组合中的 Esc 不应关闭面板');

  // 旧浏览器兜底：keydown 未标记 isComposing，但 keyCode 229 仍是组合期间的传统标记
  const legacyEsc = keyEvent('Escape', false, { keyCode: 229 });
  await chat.fireWindow('keydown', legacyEsc);
  assert.deepEqual(legacyEsc.calls, { preventDefault: 0, stopPropagation: 0 }, 'keyCode 229 的 Esc 不应被消费');
  assert.equal(chat.timerCreates(180), 0, 'keyCode 229 的 Esc 不应启动关闭动画');
  assert.ok(chat.dialog() && !hasClass(chat.dialog()!, 'closing'), 'keyCode 229 的 Esc 不应关闭面板');

  // 组合结束后 Esc 恢复原有语义：关闭 + 完整消费
  const esc = keyEvent('Escape');
  await chat.fireWindow('keydown', esc);
  assert.deepEqual(esc.calls, { preventDefault: 1, stopPropagation: 1 }, '组合结束后 Esc 应恢复关闭并消费');
  assert.equal(hasClass(chat.dialog()!, 'closing'), true, '组合结束后 Esc 应触发关闭动画');
  chat.expectNoConsoleIssues();
});

test('IME 组合输入：Enter 不发送、不阻止默认；组合结束后 Enter 恢复发送', async (t) => {
  const chat = await mountChat(t);
  // 等待首轮 messages 拉取完成（send() 需要 me 就绪）；另确保面板打开后的联系人刷新不受影响
  await act(async () => {});
  await act(async () => {
    chat.fab().props.onClick();
  });

  const input = () => chat.renderer.root.findByProps({ className: 'dshpw-chat-input' });
  const sendButton = () => chat.renderer.root.findByProps({ className: 'dshpw-chat-send' });
  await act(async () => {
    input().props.onChange({ target: { value: '你好' } });
  });
  assert.equal(sendButton().props.disabled, false, '前置条件：发送按钮可用（me 已就绪）');

  // 组合输入中按 Enter（确认候选词）：不得发送，也不得阻止默认上屏
  const composingEnter = reactKeyEvent('Enter', { isComposing: true });
  await act(async () => {
    input().props.onKeyDown(composingEnter);
  });
  assert.equal(chat.sendPosts(), 0, '组合中的 Enter 不应发送消息');
  assert.deepEqual(composingEnter.calls, { preventDefault: 0 }, '组合中的 Enter 不应被拦截');
  assert.equal(input().props.value, '你好', '组合中的 Enter 不应清空草稿');

  // 旧浏览器兜底：isComposing 缺失但 keyCode 229
  const legacyEnter = reactKeyEvent('Enter', { keyCode: 229 });
  await act(async () => {
    input().props.onKeyDown(legacyEnter);
  });
  assert.equal(chat.sendPosts(), 0, 'keyCode 229 的 Enter 不应发送消息');
  assert.deepEqual(legacyEnter.calls, { preventDefault: 0 }, 'keyCode 229 的 Enter 不应被拦截');
  assert.equal(input().props.value, '你好', 'keyCode 229 的 Enter 不应清空草稿');

  // 组合结束后 Enter 恢复发送：POST 一次 + preventDefault
  const enter = reactKeyEvent('Enter');
  await act(async () => {
    input().props.onKeyDown(enter);
  });
  assert.equal(chat.sendPosts(), 1, '组合结束后 Enter 应发送消息');
  assert.deepEqual(enter.calls, { preventDefault: 1 }, 'Enter 发送应阻止默认换行/提交');
  chat.expectNoConsoleIssues();
});

test('Tab/Shift+Tab 焦点环绕：面板内循环；外侧/单个/零个安全；closing 与关闭后不拦截', async (t) => {
  const chat = await mountChat(t);
  // 模拟浏览器焦点状态：component 读取 document.activeElement，面板假节点 contains 判定“在内”
  const doc = {
    body: { tag: 'body' },
    get activeElement(): MockNode | null {
      return chat.focusState.active;
    },
    contains: () => true,
  };
  const docDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => {
    if (docDescriptor) Object.defineProperty(globalThis, 'document', docDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  await act(async () => {
    chat.fab().props.onClick();
  });
  assert.ok(chat.dialog(), '面板应已打开');
  assert.equal(chat.focusLog().at(-1), CLOSE_NODE, '初始焦点应在关闭按钮');

  // 注入面板内可聚焦控件（真实 DOM 由 panel.querySelectorAll 返回）
  const focused: string[] = [];
  const makeFocusable = (label: string) => {
    const node: MockNode = {
      focus() {
        focused.push(label);
        chat.focusState.active = node;
      },
      click() {},
      contains: () => false,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
    };
    return node;
  };
  const first = makeFocusable('first');
  const middle = makeFocusable('middle');
  const last = makeFocusable('last');
  chat.panelFocusables.push(first, middle, last);

  // 面板内非边缘：不拦截，交给浏览器默认 Tab 行为
  chat.focusState.active = middle;
  const midTab = keyEvent('Tab');
  await chat.fireWindow('keydown', midTab);
  assert.deepEqual(midTab.calls, { preventDefault: 0, stopPropagation: 0 }, '中间位置不应拦截 Tab');
  assert.deepEqual(focused, [], '中间位置不应手动改焦点');

  // 正向：末尾 → 首个
  chat.focusState.active = last;
  const forward = keyEvent('Tab');
  await chat.fireWindow('keydown', forward);
  assert.deepEqual(forward.calls, { preventDefault: 1, stopPropagation: 0 }, '末尾 Tab 应环绕并阻止默认行为');
  assert.deepEqual(focused, ['first'], '末尾 Tab 应聚焦第一个可聚焦控件');

  // 反向：首个 → 末尾
  focused.length = 0;
  chat.focusState.active = first;
  const backward = keyEvent('Tab', true);
  await chat.fireWindow('keydown', backward);
  assert.deepEqual(backward.calls, { preventDefault: 1, stopPropagation: 0 }, '首个 Shift+Tab 应环绕');
  assert.deepEqual(focused, ['last'], '首个 Shift+Tab 应聚焦最后一个可聚焦控件');

  // 焦点已不在面板内（如落到 body）：Tab 拉回面板
  focused.length = 0;
  chat.focusState.active = doc.body as unknown as MockNode;
  const outside = keyEvent('Tab');
  await chat.fireWindow('keydown', outside);
  assert.deepEqual(outside.calls, { preventDefault: 1, stopPropagation: 0 }, '焦点在面板外时 Tab 应拉回面板');
  assert.deepEqual(focused, ['first'], '焦点在面板外时 Tab 应回到面板首个控件');
  focused.length = 0;
  chat.focusState.active = doc.body as unknown as MockNode;
  const outsideBack = keyEvent('Tab', true);
  await chat.fireWindow('keydown', outsideBack);
  assert.deepEqual(outsideBack.calls, { preventDefault: 1, stopPropagation: 0 }, '焦点在面板外时 Shift+Tab 应拉回面板');
  assert.deepEqual(focused, ['last'], '焦点在面板外时 Shift+Tab 应回到面板最后控件');

  // 单个可聚焦控件：两个方向都环绕到它
  chat.panelFocusables.length = 0;
  chat.panelFocusables.push(first);
  focused.length = 0;
  chat.focusState.active = chat.closeButton().instance as MockNode; // 不在注入列表 → 视为面板外
  const single = keyEvent('Tab');
  await chat.fireWindow('keydown', single);
  assert.deepEqual(single.calls, { preventDefault: 1, stopPropagation: 0 }, '单个控件时 Tab 应环绕');
  assert.deepEqual(focused, ['first'], '单个控件时 Tab 应聚焦它');
  focused.length = 0;
  const singleBack = keyEvent('Tab', true);
  await chat.fireWindow('keydown', singleBack);
  assert.deepEqual(singleBack.calls, { preventDefault: 1, stopPropagation: 0 }, '单个控件时 Shift+Tab 应环绕');
  assert.deepEqual(focused, ['first'], '单个控件时 Shift+Tab 应聚焦它');

  // 零个可聚焦控件：不崩溃、不放行（preventDefault 但无处可聚焦）
  chat.panelFocusables.length = 0;
  focused.length = 0;
  const none = keyEvent('Tab');
  await chat.fireWindow('keydown', none);
  assert.deepEqual(none.calls, { preventDefault: 1, stopPropagation: 0 }, '无可聚焦控件时应阻止焦点逃逸');
  assert.deepEqual(focused, [], '无可聚焦控件时不应调用 focus');

  // closing：面板正在退场，不拦截 Tab（与“关闭动画期间焦点可移出/入口可重开”语义一致）
  chat.panelFocusables.push(first, middle, last);
  await act(async () => {
    chat.closeButton().props.onClick();
  });
  assert.equal(hasClass(chat.dialog()!, 'closing'), true, '应进入关闭动画');
  const closingTab = keyEvent('Tab');
  await chat.fireWindow('keydown', closingTab);
  assert.deepEqual(closingTab.calls, { preventDefault: 0, stopPropagation: 0 }, 'closing 期间不应拦截 Tab');
  assert.deepEqual(focused, [], 'closing 期间不应手动移动焦点');

  // 关闭完成：面板卸载、监听移除，Tab 不再被消费
  assert.equal(await chat.runTimer(180), true, '关闭定时器应触发');
  assert.equal(chat.dialog(), undefined, '关闭动画结束后面板应卸载');
  const closedTab = keyEvent('Tab');
  await chat.fireWindow('keydown', closedTab);
  assert.deepEqual(closedTab.calls, { preventDefault: 0, stopPropagation: 0 }, '面板关闭后不应再消费 Tab');
  chat.expectNoConsoleIssues();
});

test('CSS：隐藏类命名空间化、拖动状态不抑制淡出、reduced-motion 保持禁用过渡', () => {
  // Node 侧无法执行 CSS 引擎，这里对源码做静态断言，防止隐藏语义或降级动画被误删。
  const source = readFileSync(new URL('../src/client/chat.tsx', import.meta.url), 'utf8');

  const hidden = /\.dshpw-chat-fab\.dshpw-chat-fab-hidden\{([^}]*)\}/.exec(source);
  assert.ok(hidden, '应存在 .dshpw-chat-fab.dshpw-chat-fab-hidden 规则');
  for (const declaration of ['opacity:0', 'pointer-events:none', 'visibility:hidden']) {
    assert.ok(hidden[1].includes(declaration), `隐藏类应包含 ${declaration}`);
  }
  assert.ok(
    hidden[1].includes('transition:opacity .18s,visibility .18s'),
    '隐藏类应显式保留淡出过渡（防 .dragging 的 transition:none 抑制）',
  );

  // 通用 .hidden 易与宿主/其他样式冲突：源码与组件都不应再使用
  assert.equal(/\.dshpw-chat-fab\.hidden\{/.test(source), false, '不应再声明通用 .hidden 隐藏规则');
  assert.equal(source.includes("' hidden'"), false, '组件不应再输出通用 hidden 类');

  const dragging = /\.dshpw-chat-fab\.dragging([^{]*)\{([^}]*)\}/.exec(source);
  assert.ok(dragging, '应存在 .dshpw-chat-fab.dragging 规则');
  assert.ok(dragging[1].includes(':not(.dshpw-chat-fab-hidden)'), '拖动规则应排除隐藏态，避免压掉淡出');
  assert.ok(dragging[2].includes('transition:none'), '拖动时应禁用过渡（位置跟手）');
  assert.ok(
    source.indexOf('.dshpw-chat-fab.dshpw-chat-fab-hidden{') > source.indexOf('.dshpw-chat-fab.dragging'),
    '隐藏规则应在拖动规则之后声明（同特异性后置胜出，双保险）',
  );

  const base = /\.dshpw-chat-fab\{([^}]*)\}/.exec(source);
  assert.ok(base, '应存在 .dshpw-chat-fab 基础规则');
  for (const declaration of ['opacity .18s', 'visibility .18s']) {
    assert.ok(base[1].includes(declaration), `基础规则过渡应包含 ${declaration}（淡出淡入）`);
  }

  const reducedStart = source.indexOf('@media (prefers-reduced-motion:reduce){');
  assert.ok(reducedStart > 0, '应存在 prefers-reduced-motion 媒体查询');
  const reducedBlock = source.slice(reducedStart, source.indexOf('`', reducedStart));
  assert.ok(reducedBlock.includes('.dshpw-chat-fab,'), 'reduced-motion 下入口不应有过渡/动画');
});
