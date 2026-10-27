// 目录选择器（"选择工作区目录"模态）的行内删除按钮。
//
// 为什么是 DOM 注入而不是组件扩展：
//   目录选择器由 dsh 官方包 @deepseek-ai/dsh-client-ui-directory-picker-browse
//   提供（本插件不拥有该槽位），服务端也没有插件化的删除原语。后端删除端点
//   POST /gateway/api/fs/delete-directory 是本仓库已有的（仅主用户）。因此这里
//   在官方对话框上叠加一层：把已有的行结构当作只读锚点，注入一个删除按钮，
//   路径从官方自己的 /api/directoryPicker/list RPC 响应里取（该响应每个 entry
//   都带绝对 path，而 DOM 里没有路径）。
//
// 稳定性契约（0.1.6-alpha.1 实测 + 源码确认）：
//   - 模态容器 [role="dialog"]，内部每一列 div[role="list"]，
//     行 span[role="listitem"] > button[type=button]
//   - 行名 = button.textContent.trim()（文件夹/chevron 图标是 svg，无文本）
//   - 选中行 button[aria-current="true"]（官方自己也用这个锚点）
//   只依赖这些 role 属性：CSS 类名带构建哈希（ZuhsRW_*），跨版本必然变化。
//
// 语言：直接读本插件的词典（locales.ts），按 navigator.language 粗略选 zh/en。
//   注入的按钮活在 dsh 的 React 树之外，拿不到 locale 服务的 t seat，这是
//   最不打扰官方渲染的取文案方式（设置里的语言与浏览器语言不一致时可能不同）。
//
// 授权：按钮只是界面便利，后端 requireAdmin 才是授权边界（子用户 403）。
//   这里连观测都不启动——非主用户页面上零副作用。
import { zh, en } from './locales';

/** 列表 RPC 路径：响应信封里同时含 parent/child 两个 entries 数组（双列）。 */
const LIST_ENDPOINT_SUFFIX = '/api/directoryPicker/list';
/** 删除端点（网关注册，见 gateway.ts）。 */
const DELETE_ENDPOINT = '/gateway/api/fs/delete-directory';
/** 路径速查表条目上限：一次删除只需相邻两列，超出丢弃最旧。 */
const MAX_LISTINGS = 64;
/** MutationObserver → scan 的去抖窗口。 */
const SCAN_DEBOUNCE_MS = 60;
/** 二次点击确认窗口：超时自动解除武装。 */
const ARM_TIMEOUT_MS = 2500;
/** toast 停留时长。 */
const TOAST_MS = 2800;
/** 行标记：存绝对路径，用于幂等判断 + 清除（React 重渲染不会保留 dataset）。 */
const PATH_ATTR = 'data-dshpwPickerDelPath';
/** 注入按钮当前绑定目录的显示名：行复用时必须同步更新无障碍名称与 tooltip。 */
const NAME_ATTR = 'data-dshpwPickerDelName';
/** 请求中的删除/清理按钮禁止二次触发，避免双击并发提交同一路径。行重绑（React
 *  复用同一 DOM 行）时由注入侧同步解除；旧请求的迟到结果按「路径 + 请求代次」丢弃。 */
const REQUEST_PENDING_ATTR = 'data-dshpwPickerDelRequestPending';

/** 注入按钮与 toast 的样式（<style> 只注入一次；类名固定，不进官方 CSS 命名空间）。
 *  设计令牌与 index.tsx 的 .dshpw-card 同源：--dshpw-ease 柔和标准曲线、
 *  --dshpw-spring 轻过冲弹簧；注入 DOM 不在卡片内，这里在自身作用域重声明。 */
const PICKER_DEL_CSS = `
.dshpw-picker-del{--dshpw-ease:cubic-bezier(.22,1,.36,1);--dshpw-spring:cubic-bezier(.34,1.4,.64,1);position:absolute;right:26px;top:50%;transform:translateY(-50%) scale(.9);display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;color:var(--dsw-alias-state-error-primary,#ef4444);background:transparent;border:0;padding:0;font:inherit;-webkit-appearance:none;appearance:none;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .16s var(--dshpw-ease),transform .28s var(--dshpw-spring),background-color .16s var(--dshpw-ease),color .16s var(--dshpw-ease);-webkit-user-select:none;user-select:none;z-index:1}
[role="listitem"]:hover>.dshpw-picker-del,.dshpw-picker-del:focus-visible{opacity:1;pointer-events:auto;transform:translateY(-50%) scale(1)}
.dshpw-picker-del:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 14%,transparent)}
.dshpw-picker-del:active{transform:translateY(-50%) scale(.86);transition-duration:.08s}
.dshpw-picker-del-arm{opacity:1;pointer-events:auto;color:var(--dsw-alias-label-primary-inverted,#fff);background:var(--dsw-alias-state-error-primary,#ef4444);transform:translateY(-50%) scale(1.05)}
.dshpw-picker-del-arm:hover{background:var(--dsw-alias-state-error-primary,#ef4444)}
.dshpw-picker-del.dshpw-picker-del-retry{opacity:1;pointer-events:auto;transform:translateY(-50%) scale(1);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 12%,transparent)}
.dshpw-picker-del.dshpw-picker-del-retry:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 22%,transparent)}
[role="listitem"].dshpw-picker-del-tombstone{opacity:.6}
[role="listitem"].dshpw-picker-del-tombstone>button:not(.dshpw-picker-del){text-decoration:line-through;pointer-events:none}
.dshpw-picker-toast{--dshpw-ease:cubic-bezier(.22,1,.36,1);--dshpw-spring:cubic-bezier(.34,1.4,.64,1);position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:320px;padding:9px 13px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#1f2933) 86%,transparent);color:var(--dsw-alias-label-primary,#172026);font-size:12px;line-height:1.5;white-space:pre-line;box-shadow:0 10px 28px rgb(0 0 0 / 26%),0 2px 8px rgb(0 0 0 / 12%);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);animation:dshpwPickerToastIn .38s var(--dshpw-spring) both}
.dshpw-picker-toast-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 92%,transparent);color:#fff}
@keyframes dshpwPickerToastIn{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dshpw-picker-toast{animation:none}.dshpw-picker-del{transition:none}}
`;

/** 垃圾桶线条图标（14×14，stroke=currentColor，跟随按钮文字色）。 */
const TRASH_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
  '<path d="M2.5 4h11M6.5 4V2.8A.8.8 0 0 1 7.3 2h1.4a.8.8 0 0 1 .8.8V4M5 4l.7 9.2a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8L12 4M6.8 6.6v5M9.2 6.6v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ── 语言 ───────────────────────────────────────────────────────

/** 注入层用到的文案（从词典按当前语言取出一份固定映射，便于纯函数测试）。 */
export interface PickerText {
  del: string;
  confirm: string;
  aria: string;
  done: string;
  failed: string;
  /** 墓碑行的重试动作 / 状态文案（locales 未收录，由本文件按当前语言给值）。 */
  retry: string;
  pending: string;
}

/** 当前语言的文案；navigator 缺失（SSR/测试）时回退英文。 */
export const pickerText: PickerText = (() => {
  const zhLang =
    typeof navigator !== 'undefined' &&
    typeof navigator.language === 'string' &&
    navigator.language.toLowerCase().startsWith('zh');
  const dict = zhLang ? zh : en;
  return {
    del: dict.pickerDel,
    confirm: dict.pickerDelConfirm,
    aria: dict.pickerDelAria,
    done: dict.pickerDelDone,
    failed: dict.pickerDelFailed,
    retry: zhLang ? '重试清理' : 'Retry cleanup',
    pending: zhLang ? '目录已删除，工作区授权清理未完成' : 'Directory deleted; workspace authorization cleanup incomplete',
  };
})();

// ── 列表捕获：把 RPC 响应里的 name → 绝对 path 映射留下来 ─────────

/** 一行（目录选择器里每行必是目录：后端只返回目录）。 */
export interface PickerEntry {
  path: string;
  name: string;
  hidden: boolean;
}

export function isPickerEntry(value: unknown): value is PickerEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    record.path !== '' &&
    typeof record.name === 'string' &&
    record.name !== ''
  );
}

/**
 * 递归收集响应信封里所有「目录条目数组」。
 *
 * dsh 的 RPC 回包形状是 { type, rpcId, result: { ok, value } }，value 是
 * { path, home, crumbs, entries, truncated }；目录选择器会先把选中的父目录
 * 列表放进来、再补一次子目录列表，因此一个响应可能含两个 entries 数组
 * （双列），全部收集。判据是形状而不是固定的 JSON 路径：上游加包装层也不会漏。
 *
 * @param envelope - 任意已解析的 JSON（响应体）。
 * @returns 每个条目的 path/name/hidden（深度上限防止环/深树）。
 */
export function extractPickerListings(envelope: unknown): PickerEntry[][] {
  const found: PickerEntry[][] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth: number, blocked = false): void => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      // 只遍历包装对象；裸数组不是列表信号，避免把 crumbs 或其他数组误认成 entries。
      for (const item of value) walk(item, depth + 1, blocked);
      return;
    }
    const record = value as Record<string, unknown>;
    const truncated = blocked || record.truncated === true;
    const entries = record.entries;
    if (!truncated && Array.isArray(entries)) {
      if (entries.length > 0 && entries.every(isPickerEntry)) {
        found.push(
          entries.map((entry) => {
            const entryRecord = entry as unknown as Record<string, unknown>;
            return {
              path: entry.path,
              name: entry.name,
              hidden: typeof entryRecord.hidden === 'boolean' ? entryRecord.hidden : false,
            };
          }),
        );
      }
    }
    for (const [key, item] of Object.entries(record)) {
      // entries 已在当前对象处理；crumbs 是祖先路径链，永远不是可删除的当前列。
      if (key === 'entries' || key === 'crumbs') continue;
      walk(item, depth + 1, truncated);
    }
  };
  walk(envelope, 0);
  return found;
}

/** 一份已被抓到的列列表（按列名序列索引行 → 绝对路径）。 */
interface CapturedListing {
  names: string[];
  /** 与 names 同序的绝对路径：用于区分不同目录下恰好同名的列。 */
  paths: string[];
  byName: Map<string, PickerEntry>;
}

/** 内存态：最新抓到的列列表在前，上限 MAX_LISTINGS。 */
const capturedListings: CapturedListing[] = [];

function rememberListings(entries: PickerEntry[]): void {
  if (entries.length === 0) return;
  const listing: CapturedListing = { names: [], paths: [], byName: new Map() };
  for (const entry of entries) {
    listing.names.push(entry.name);
    listing.paths.push(entry.path);
    // 同名目录在同一列内不可能出现（同目录下的子项名唯一），直接覆盖即可
    listing.byName.set(entry.name, entry);
  }
  // 去重必须同时比较绝对路径：不同父目录都可能有相同名称序列（例如 a/x 与
  // b/x）。只按名称把后者覆盖为“最新列”会把旧列的垃圾桶绑定到错误路径。
  const existing = capturedListings.findIndex(
    (item) =>
      item.names.length === listing.names.length &&
      item.names.every((name, i) => name === listing.names[i]) &&
      item.paths.length === listing.paths.length &&
      item.paths.every((entryPath, i) => entryPath === listing.paths[i]),
  );
  if (existing >= 0) capturedListings.splice(existing, 1);
  capturedListings.unshift(listing);
  if (capturedListings.length > MAX_LISTINGS) capturedListings.length = MAX_LISTINGS;
}

// ── 列 ↔ 列表匹配 ──────────────────────────────────────────────

/**
 * 在已抓到的列表里找与某一列的可见行名序列对应的那份。
 *
 * 为什么不是精确相等就够：列会按官方前端的显示过滤（隐藏文件开关、路径
 * 输入框的前缀过滤）少显示若干行。因此先精确命中（DOM 刚渲染完的常见情形），
 * 否则退化为「有序子序列」匹配，取 listing 最长者（最具体的候选）。
 *
 * 注：因为「过滤」只会隐藏行，子序列匹配天然安全——错配最多是给某行注入了
 * 指向其目录列表里同名条目的路径，而同名即同目录下的同一项。
 *
 * @param names - 该列当前可见行的名字序列（textContent.trim()）。
 * @param listings - 候选列表（scan 侧直接传入 capturedListings 快照）。
 * @returns 命中下标；无候选/无命中为 null。
 */
export function matchPickerListing(
  names: readonly string[],
  listings: readonly { names: readonly string[] }[],
): number | null {
  if (names.length === 0) return null;
  // 1) 精确序列相等。若多列恰好同名，DOM 没有父目录/路径锚点可区分，宁可
  // 不注入也不能把垃圾桶绑到另一列的同名路径。
  let exact: number | null = null;
  for (let i = 0; i < listings.length; i++) {
    const candidate = listings[i].names;
    if (candidate.length !== names.length) continue;
    let same = true;
    for (let k = 0; k < names.length; k++) {
      if (candidate[k] !== names[k]) {
        same = false;
        break;
      }
    }
    if (!same) continue;
    if (exact !== null) return null;
    exact = i;
  }
  if (exact !== null) return exact;
  // 2) 有序子序列（显示被过滤）：取 listing 最长者
  let best: number | null = null;
  let bestLength = 0;
  let bestCount = 0;
  for (let i = 0; i < listings.length; i++) {
    const candidate = listings[i].names;
    if (candidate.length < names.length || candidate.length < bestLength) continue;
    let cursor = 0;
    let matched = true;
    for (const name of names) {
      while (cursor < candidate.length && candidate[cursor] !== name) cursor++;
      if (cursor >= candidate.length) {
        matched = false;
        break;
      }
      cursor++;
    }
    if (!matched) continue;
    if (candidate.length > bestLength) {
      best = i;
      bestLength = candidate.length;
      bestCount = 1;
    } else if (candidate.length === bestLength) {
      bestCount++;
    }
  }
  return bestCount === 1 ? best : null;
}

// ── 幂等注入 ───────────────────────────────────────────────────

function findStyleHost(): ParentNode | null {
  if (typeof document === 'undefined') return null;
  return document.head ?? document.documentElement;
}

function injectStyleOnce(): void {
  const host = findStyleHost();
  if (host === null || typeof document.querySelector !== 'function') return;
  if (document.querySelector('style[data-dshpw-picker-style="1"]') !== null) return;
  const style = document.createElement('style');
  style.dataset.dshpwPickerStyle = '1';
  style.textContent = PICKER_DEL_CSS;
  host.appendChild(style);
}

/** 单例 toast（右下角小条，同页复用）。 */
let toastEl: HTMLElement | null = null;
let toastTimer = 0;

function showToast(message: string, error: boolean): void {
  if (typeof document === 'undefined') return;
  if (toastEl === null || !toastEl.isConnected) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.className = 'dshpw-picker-toast';
    (document.body ?? document.documentElement).appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = error ? 'dshpw-picker-toast dshpw-picker-toast-error' : 'dshpw-picker-toast';
  if (toastTimer !== 0) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastTimer = 0;
    toastEl?.remove();
    toastEl = null;
  }, TOAST_MS);
}

/** 删除端点的一次调用结果（目录删除与 workspace 同步/DB 清理可能部分失败）。 */
export interface DeleteOutcome {
  /** 目录是否已被物理删除：HTTP 非 2xx 时也可能为 true（联动部分失败）。 */
  deleted: boolean;
  /** 面向用户的失败/警告文案（成功且无警告时为 null）；可含换行。 */
  message: string | null;
  /** toast 是否用错误样式（部分失败也要醒目）。 */
  error: boolean;
  /**
   * 目录已删但服务端仍留有可重试的授权清理（DB_CLEANUP_FAILED / retryable）：
   * 调用方必须保留墓碑行与重试入口，不能把行移除（否则唯一的重试通道就没了）。
   */
  retry: boolean;
  /**
   * 服务端 409 CLEANUP_RETRY_CONFLICT：清理重试的目标已被重新创建。此时没有可重试的
   * 清理任务，调用方必须撤销墓碑/重试状态、让该行回到常规删除（不能卡在仅重试状态）。
   * 仅在为 true 时出现：未冲突的结果保持既有四字段形状，兼容既有调用方与断言。
   */
  conflict?: boolean;
}

/**
 * 把删除端点响应归一化为选择器行为所需结果（纯函数）。
 *
 * 关键契约：服务端在「目录已删但 workspace 同步/DB 清理失败」时返回非 2xx
 * 但携带 `deleted` 路径与 `warnings`/`error`。此时行必须被移除（本地已确认
 * 删除），同时把警告展示给用户——不能因为整体 `ok=false` 就当作未删除。
 * 例外：DB 清理失败（retryable）时保留墓碑行 + 重试动作（见 applyRetryState）。
 */
export function interpretDeleteResponse(responseOk: boolean, data: unknown): DeleteOutcome {
  const record = data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((item): item is string => typeof item === 'string' && item !== '')
    : [];
  const deleted = typeof record.deleted === 'string' && record.deleted !== '';
  // 409 CLEANUP_RETRY_CONFLICT：目录已被重新创建，服务端为保护新内容取消了清理重试。
  // 它与 retry 互斥：必须撤销墓碑/重试状态回到常规删除，不能继续当作「可重试失败」。
  const conflict = !responseOk && record.code === 'CLEANUP_RETRY_CONFLICT';
  const retry = !conflict && !responseOk && deleted && (record.retryable === true || record.code === 'DB_CLEANUP_FAILED');
  if (responseOk && record.ok === true) {
    return { deleted: true, message: warnings.length > 0 ? warnings.join('\n') : null, error: warnings.length > 0, retry: false };
  }
  const failure = typeof record.error === 'string' && record.error !== '' ? record.error : pickerText.failed;
  const outcome: DeleteOutcome = {
    // 冲突时目录已被重新创建，绝不能被当作已删除（否则会误移除仍存在的行）。
    deleted: conflict ? false : deleted,
    message: warnings.length > 0 ? `${failure}\n${warnings.join('\n')}` : failure,
    error: true,
    retry,
  };
  if (conflict) outcome.conflict = true;
  return outcome;
}

/** 调用删除端点并归一化服务端结果（导出供单测直接覆盖网络异常路径）。 */
export async function requestDelete(path: string, cleanupOnly = false): Promise<DeleteOutcome> {
  try {
    const response = await fetch(DELETE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(cleanupOnly ? { path, cleanupOnly: true } : { path }),
    });
    const data = (await response.json().catch(() => null)) as unknown;
    return interpretDeleteResponse(response.ok, data);
  } catch {
    return { deleted: false, message: pickerText.failed, error: true, retry: false };
  }
}

/** 删除后从界面移除该行；若删的正是选中行，其后的（子目录）列已无意义，一并移除。 */
function dropRowAfterDelete(node: HTMLElement): void {
  // 以注入节点（而非注入时捕获的官方按钮引用）为锚点：React 复用行时可能替换行内元素。
  const rowHost = node.closest('[role="listitem"]');
  if (rowHost === null) return;
  const column = rowHost.closest('[role="list"]');
  const selected = rowHost.querySelector(':scope > button:not(.dshpw-picker-del)')?.getAttribute('aria-current') === 'true';
  if (selected && column !== null) {
    // 该列之后的所有兄弟列 = 选中目录的子列（父目录已删，子列表随即失效）
    let sibling = column.nextElementSibling;
    while (sibling !== null) {
      const next = sibling.nextElementSibling;
      if (sibling.getAttribute('role') === 'list') sibling.remove();
      sibling = next;
    }
  }
  rowHost.remove();
}

// ── DB 清理失败的墓碑行（保留重试入口） ─────────────────────────

/**
 * 目录已物理删除、但服务端 DB 清理失败（DB_CLEANUP_FAILED）时，行不能直接移除：
 * 那会丢掉唯一的重试入口（服务端已确认删除，重试只会做幂等授权清理）。因此把行
 * 标为墓碑：置灰 + 划线 + 禁止进入（官方行按钮同时退出指针与键盘可达），删除按钮
 * 转为始终可见的「重试清理」，单击/Enter/Space 直接重发同一路径（不再有数据可删，
 * 无需二次确认）。状态按路径记在模块 Set 里：React 重建行后重新注入时能恢复。
 */
const cleanupsPending = new Set<string>();

/** 官方行按钮原始 tabindex 的暂存标记：墓碑态移出 Tab 序列，恢复时还原。 */
const ROW_TAB_ATTR = 'data-dshpw-picker-del-row-tab';

/**
 * 墓碑行的官方按钮必须既不能用指针也不能用键盘进入：指针禁用由 CSS 完成（选择器
 * 用 :not(.dshpw-picker-del) 只命中官方按钮），键盘可达性在这里关掉——tabindex=-1
 * 移出 Tab 序列，aria-disabled 向辅助技术说明状态；退出墓碑时还原原始 tabindex
 * （官方按钮默认没有该属性）。
 */
function setRowKeyboardInert(rowHost: Element, inert: boolean): void {
  const rowButton = rowHost.querySelector(':scope > button:not(.dshpw-picker-del)');
  if (rowButton === null) return;
  if (inert) {
    if (!rowButton.hasAttribute(ROW_TAB_ATTR)) {
      rowButton.setAttribute(ROW_TAB_ATTR, rowButton.getAttribute('tabindex') ?? '');
    }
    rowButton.setAttribute('tabindex', '-1');
    rowButton.setAttribute('aria-disabled', 'true');
    return;
  }
  if (!rowButton.hasAttribute(ROW_TAB_ATTR)) return;
  const previous = rowButton.getAttribute(ROW_TAB_ATTR);
  if (previous === null || previous === '') rowButton.removeAttribute('tabindex');
  else rowButton.setAttribute('tabindex', previous);
  rowButton.removeAttribute(ROW_TAB_ATTR);
  rowButton.removeAttribute('aria-disabled');
}

function applyRetryState(node: HTMLElement, rowHost: Element, path: string, name: string): void {
  cleanupsPending.add(path);
  node.setAttribute(NAME_ATTR, name);
  node.setAttribute('data-dshpw-picker-del-retry', '1');
  node.classList.add('dshpw-picker-del-retry');
  // 重试是墓碑行唯一的操作入口：必须进入 Tab 序列，由原生 button 响应 Enter/Space。
  node.setAttribute('tabindex', '0');
  rowHost.classList.add('dshpw-picker-del-tombstone');
  setRowKeyboardInert(rowHost, true);
  const label = `${pickerText.retry}: ${name}`;
  node.setAttribute('aria-label', label);
  node.setAttribute('title', label);
}

function clearRetryState(node: HTMLElement, rowHost: Element, path: string): void {
  cleanupsPending.delete(path);
  node.removeAttribute('data-dshpw-picker-del-retry');
  node.classList.remove('dshpw-picker-del-retry');
  // 退出墓碑后仍是可键盘操作的常规删除入口：保持在 Tab 序列内。
  node.setAttribute('tabindex', '0');
  rowHost.classList.remove('dshpw-picker-del-tombstone');
  setRowKeyboardInert(rowHost, false);
}

function setDeleteButtonLabel(node: HTMLElement, name: string): void {
  node.setAttribute(NAME_ATTR, name);
  const label = `${pickerText.aria}: ${name}`;
  node.setAttribute('aria-label', label);
  node.setAttribute('title', label);
}

/** 给一行注入删除按钮（幂等：React 重建行后旧按钮消失，会重新注入）。 */
function injectRowButton(rowHost: Element, entry: PickerEntry): void {
  const path = entry.path;
  const existing = rowHost.querySelector(':scope > .dshpw-picker-del') as HTMLButtonElement | null;
  if (existing !== null) {
    const previousPath = existing.getAttribute(PATH_ATTR);
    if (previousPath !== path) {
      // 行被 React 复用绑定到新路径：在途请求属于旧路径，必须在这里同步解除它对本节点的
      // 占用。否则旧请求的 finally 会因路径不匹配而跳过，新路径的按钮就永久 disabled
      //（重绑死锁）。旧请求的迟到结果由 click 侧的「路径 + 请求代次」双检丢弃。
      existing.removeAttribute(REQUEST_PENDING_ATTR);
      existing.disabled = false;
      // 二次确认武装随旧绑定作废：新路径必须重新走两步确认。
      existing.classList.remove('dshpw-picker-del-arm');
      if (previousPath !== null) cleanupsPending.delete(previousPath);
      existing.setAttribute(PATH_ATTR, path);
    }
    // 按当前绑定恢复/清除墓碑重试状态；路径未变时不会动在途 pending。
    if (cleanupsPending.has(path)) applyRetryState(existing, rowHost, path, entry.name);
    else {
      clearRetryState(existing, rowHost, path);
      setDeleteButtonLabel(existing, entry.name);
    }
    return;
  }
  // 行容器不是定位上下文时给一个（绝对定位的按钮以此行为定位基准）
  const host = rowHost as HTMLElement;
  if (
    host.style !== undefined &&
    typeof getComputedStyle === 'function' &&
    getComputedStyle(rowHost).position === 'static'
  ) {
    host.style.position = 'relative';
  }
  // 原生 button：Enter/Space 原生可操作（与鼠标共用同一 click handler，不绕过
  // 二次确认与授权/请求语义），aria-label 直接是辅助技术的可读名称。
  // tabindex=0：键盘可达，聚焦时由 :focus-visible 规则显形（与悬停同款）。
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'dshpw-picker-del';
  node.setAttribute('data-dshpw-picker-del', '1');
  node.setAttribute(PATH_ATTR, path);
  node.setAttribute('tabindex', '0');
  setDeleteButtonLabel(node, entry.name);
  node.innerHTML = TRASH_ICON;

  let armTimer = 0;
  /** 本节点的请求代次：每次真正发出请求时自增，用于丢弃重绑前的迟到结果。 */
  let requestSerial = 0;
  node.addEventListener('click', (event) => {
    // 行 button 自己带 onClick（进入该目录）：绝不能让它收到这次点击
    event.preventDefault();
    event.stopPropagation();
    const current = node.getAttribute(PATH_ATTR);
    if (current === null || current === '') return;
    // 墓碑行的按钮 = 重试授权清理：单击直达（没有数据可再删，不需要二次确认）。
    const retryPending = node.getAttribute('data-dshpw-picker-del-retry') === '1';
    if (node.getAttribute(REQUEST_PENDING_ATTR) === '1') return;
    if (!retryPending && !node.classList.contains('dshpw-picker-del-arm')) {
      node.classList.add('dshpw-picker-del-arm');
      node.setAttribute('title', pickerText.confirm);
      const armedPath = current;
      armTimer = window.setTimeout(() => {
        armTimer = 0;
        // 行已被重绑（React 复用）：武装态已在 rebind 时撤销，别碰新绑定的样式。
        if (node.getAttribute(PATH_ATTR) !== armedPath) return;
        node.classList.remove('dshpw-picker-del-arm');
        node.setAttribute('title', `${pickerText.aria}: ${node.getAttribute(NAME_ATTR) ?? entry.name}`);
      }, ARM_TIMEOUT_MS);
      return;
    }
    // 已武装（或重试）：执行删除/清理
    if (armTimer !== 0) window.clearTimeout(armTimer);
    armTimer = 0;
    node.classList.remove('dshpw-picker-del-arm');
    if (!retryPending) node.setAttribute('title', `${pickerText.aria}: ${node.getAttribute(NAME_ATTR) ?? entry.name}`);
    const serial = ++requestSerial;
    node.setAttribute(REQUEST_PENDING_ATTR, '1');
    node.disabled = true;
    // 复用保护：只有「仍绑定同一路径」且「仍是本次请求」的结果才能作用于该节点。重绑
    // 由 scan 侧解除 pending；代次校验确保旧请求的迟到结果不会清掉新请求的状态。
    const stale = (): boolean => node.getAttribute(PATH_ATTR) !== current || requestSerial !== serial;
    void requestDelete(current, retryPending).then((outcome) => {
      if (stale()) return;
      if (outcome.conflict) {
        // 409 CLEANUP_RETRY_CONFLICT：目录已被重新创建，清理重试已无对象。撤销墓碑/
        // 重试状态恢复常规删除（否则会卡在仅重试，官方行按钮也不可达）。
        clearRetryState(node, rowHost, current);
        setDeleteButtonLabel(node, node.getAttribute(NAME_ATTR) ?? entry.name);
        showToast(outcome.message ?? pickerText.failed, true);
        return;
      }
      // 目录已被服务端确认删除（即使 workspace 同步/DB 清理部分失败）→ 移除该行，
      // 并把 warnings/actionable 信息展示出来；未删除则保留行以便重试。
      if (!outcome.deleted) {
        showToast(outcome.message ?? pickerText.failed, true);
        return;
      }
      if (outcome.retry) {
        // DB 清理失败：保留墓碑行 + 重试按钮（服务端 DB 事务已回滚，重试可收敛）。
        applyRetryState(node, rowHost, current, entry.name);
        showToast(`${pickerText.pending}\n${outcome.message ?? ''}`.trim(), true);
        return;
      }
      clearRetryState(node, rowHost, current);
      dropRowAfterDelete(node);
      const done = `${pickerText.done}: ${node.getAttribute(NAME_ATTR) ?? entry.name}`;
      showToast(outcome.message === null ? done : `${done}\n${outcome.message}`, outcome.error);
    }).finally(() => {
      // 复用保护：只复位仍属于本次请求的节点（重绑后的新绑定有自己的 pending 生命周期）。
      if (stale()) return;
      node.removeAttribute(REQUEST_PENDING_ATTR);
      node.disabled = false;
    });
  });

  rowHost.appendChild(node);
  if (cleanupsPending.has(path)) applyRetryState(node, rowHost, path, entry.name);
}

// ── 扫描（幂等） ───────────────────────────────────────────────

/** 扫一遍所有已挂载的目录选择器模态，为其行注入/更新删除按钮。 */
export function scanPickerDialogs(): void {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  const dialogs = document.querySelectorAll('[role="dialog"]');
  for (const dialog of dialogs) {
    const columns = dialog.querySelectorAll('[role="list"]');
    for (const column of columns) {
      // 排除注入的控件：原生 button 也是 listitem 的直接子按钮，不能被当作目录行
      const rows = column.querySelectorAll(':scope > [role="listitem"] > button:not(.dshpw-picker-del)');
      if (rows.length === 0) continue;
      const names: string[] = [];
      for (const row of rows) names.push((row.textContent ?? '').trim());
      const hit = matchPickerListing(names, capturedListings);
      if (hit === null) continue; // 没有路径就绝不注入（安全侧）
      const listing = capturedListings[hit];
      for (let i = 0; i < rows.length; i++) {
        const button = rows[i] as HTMLButtonElement;
        const entry = listing.byName.get(names[i]);
        if (entry === undefined) continue;
        const rowHost = button.parentElement;
        if (rowHost === null) continue;
        injectRowButton(rowHost, entry);
      }
    }
  }
}

// ── 启动 ───────────────────────────────────────────────────────

let observer: MutationObserver | null = null;
let scanTimer = 0;

function scheduleScan(): void {
  // land() 里 200ms 双帧重建会连打多轮 MutationRecord，去抖后只扫最后一次
  if (scanTimer !== 0) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    scanPickerDialogs();
  }, SCAN_DEBOUNCE_MS);
}

function startObserver(): void {
  if (observer !== null || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleScan();
}

/**
 * 包装 window.fetch，捕获官方列表 RPC 的响应（不改变响应本身）。
 *
 * 只有在确认主用户之后才会调用；解析始终用 clone()，任何异常都被吞掉，
 * 原响应照常返回——最坏情况只是拿不到路径（于是不注入按钮），不影响官方功能。
 */
function isListingRequest(rawUrl: string, method: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  try {
    const parsed = new URL(rawUrl, window.location.href);
    return parsed.pathname === LIST_ENDPOINT_SUFFIX;
  } catch {
    return rawUrl.split('?', 1)[0].split('#', 1)[0].endsWith(LIST_ENDPOINT_SUFFIX);
  }
}

function captureListingEnvelope(envelope: unknown): void {
  try {
    for (const entries of extractPickerListings(envelope)) rememberListings(entries);
  } catch {
    /* 形状不符：忽略 */
  }
}

function wrapFetchForListings(): void {
  const original = window.fetch;
  if (typeof original !== 'function') return;
  const wrapped: typeof window.fetch = (input, init) => {
    const response = original.call(window, input as RequestInfo, init as RequestInit);
    void response
      .then((res) => {
        try {
          const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
          const method = (
            init?.method ??
            (input instanceof Request ? input.method : 'GET')
          ).toUpperCase();
          if (!isListingRequest(url, method)) return;
          void res.clone().json().then(captureListingEnvelope).catch(() => {});
        } catch {
          /* 非标准 input：忽略 */
        }
        return res;
      })
      .catch(() => {});
    return response;
  };
  window.fetch = wrapped;
}

/**
 * rc.2 的 client-connection 在部分浏览器路径使用 XMLHttpRequest，而不是 window.fetch。
 * 两条捕获路径只读取响应副本，不修改请求或响应，拿不到明确路径时仍保持 fail-closed。
 */
function wrapXhrForListings(): void {
  const Xhr = window.XMLHttpRequest;
  if (typeof Xhr !== 'function') return;
  const originalOpen = Xhr.prototype.open;
  const originalSend = Xhr.prototype.send;
  Xhr.prototype.open = function open(method: string, url: string | URL, ...rest: unknown[]): void {
    Object.defineProperty(this, '__dshpwListingRequest', {
      configurable: true,
      value: { method, url: String(url) },
    });
    originalOpen.call(this, method, String(url), rest[0] === undefined ? true : Boolean(rest[0]), rest[1] as string | undefined, rest[2] as string | undefined);
  };
  Xhr.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null): void {
    const request = (this as XMLHttpRequest & { __dshpwListingRequest?: { method: string; url: string } }).__dshpwListingRequest;
    if (request !== undefined && isListingRequest(request.url, request.method)) {
      this.addEventListener('load', () => {
        if (this.status < 200 || this.status >= 300) return;
        try {
          const envelope = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          captureListingEnvelope(envelope);
        } catch {
          /* 非 JSON 或响应仍在流式处理中：忽略 */
        }
      }, { once: true });
    }
    originalSend.call(this, body);
  };
}

/** 启动幂等：插件重载/多次 apply 时不会叠加 observer 或包装层。 */
let started = false;

/**
 * 主用户才启用的目录选择器删除按钮。
 *
 * 先向本插件自己的 /api/dsh-passwords/state 确认角色：非主用户（或探测失败、
 * 未登录）直接返回，连 MutationObserver 都不装——子用户页面零行为变化。
 * 授权由服务端 /gateway/api/fs/delete-directory（requireAdmin）兜底，这里
 * 只是不把用不上的界面递过去。
 */
export function startPickerDelete(): void {
  if (started || typeof document === 'undefined' || typeof window === 'undefined') return;
  started = true;
  void fetch('/api/dsh-passwords/state', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((data: unknown) => {
      const me = (data as { me?: { role?: unknown } } | null)?.me;
      if (me?.role !== 'admin') return;
      injectStyleOnce();
      wrapFetchForListings();
      wrapXhrForListings();
      startObserver();
    })
    .catch(() => {
      /* 探测失败 = 不启用（fail-closed） */
    });
}
