// 会话右侧栏文件列表的下载按钮（悬停出现在文件行最右侧）。
//
// 背景：官方右侧栏（dsh-client-ui-sidebar-files）的文件行只提供"点击打开预览"，
// 没有任何下载入口；官方也不再把远程文件下载作为功能提供。我们复用网关已有的
// GET /gateway/api/download?path=<绝对路径>（Content-Disposition: attachment，
// 浏览器自动落盘；子用户需 allow_git_download + 目录白名单，主用户不受限）。
//
// 稳定性契约（0.1.6-alpha.1 源码确认）：
//   - 文件行：li[data-files-entry="file"][data-files-path="<绝对路径>"]
//     （路径由官方前端从会话 cwd 逐级拼接，逐字就在 DOM 上——不需要 wrap fetch）
//   - 目录行 data-files-entry="directory"、其他 "other"：不注入（下载端点只收文件）
//   - 面板可有多个并发实例（dock / split / float 浮窗）：以
//     [data-files-state="tree"] 全量扫描，不用 role 属性（本面板没有 role）
//   - 折叠再展开复用已加载数据、不发请求但 DOM 全新；reload 整列重建
//     → 必须由 MutationObserver 驱动幂等注入，dataset 标记容忍节点被替换
//
// 交互：行 hover 时按钮浮现（与官方行 hover 同步）；点击先 HEAD 探测（403/404
// 时 toast 提示而不是让浏览器导航到 JSON 错误页），通过后用隐藏 <a> 触发下载，
// 不打断 SPA。
//
// 授权：按钮只是入口，真正的授权边界在网关下载端点（子用户无权限 → 403）。
import { zh, en } from './locales';

/** 下载端点（网关注册，见 gateway.ts）。 */
const DOWNLOAD_ENDPOINT = '/gateway/api/download';
/** MutationObserver → scan 的去抖窗口。 */
const SCAN_DEBOUNCE_MS = 60;
/** toast 停留时长。 */
const TOAST_MS = 2800;
/** 幂等标记：存绝对路径（React 重渲染不保留 dataset，节点被替换后重新注入）。 */
const PATH_ATTR = 'data-dshpwDlPath';

/** 注入按钮与 toast 的样式（<style> 只注入一次；类名固定，不进官方 CSS 命名空间）。
 *  文案/图标颜色用 label-primary（黑白主题自适应），不用 *-inverted。 */
const FILE_DL_CSS = `
.dshpw-dl{--dshpw-ease:cubic-bezier(.22,1,.36,1);--dshpw-spring:cubic-bezier(.34,1.4,.64,1);position:absolute;right:6px;top:50%;transform:translateY(-50%) scale(.9);display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;color:var(--dsw-alias-label-primary,#172026);background:transparent;border:0;padding:0;font:inherit;-webkit-appearance:none;appearance:none;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .16s var(--dshpw-ease),transform .28s var(--dshpw-spring),background-color .16s var(--dshpw-ease),color .16s var(--dshpw-ease);-webkit-user-select:none;user-select:none;z-index:1}
li[data-files-entry="file"]:hover>.dshpw-dl,.dshpw-dl:focus-visible{opacity:1;pointer-events:auto;transform:translateY(-50%) scale(1)}
.dshpw-dl:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#14b8a6) 16%,transparent);color:var(--dsw-alias-brand-primary,#14b8a6)}
.dshpw-dl:active{transform:translateY(-50%) scale(.86);transition-duration:.08s}
.dshpw-dl-busy{opacity:1;pointer-events:auto;transform:translateY(-50%) scale(1);color:var(--dsw-alias-brand-primary,#14b8a6)}
.dshpw-dl-tap{animation:dshpwDlTap .24s cubic-bezier(.34,1.56,.64,1)}
@keyframes dshpwDlTap{0%{transform:translateY(-50%) scale(1)}35%{transform:translateY(-50%) translateX(-2px) scale(.9)}65%{transform:translateY(-50%) translateX(2px) scale(1.04)}100%{transform:translateY(-50%) scale(1)}}
.dshpw-dl-toast{--dshpw-ease:cubic-bezier(.22,1,.36,1);--dshpw-spring:cubic-bezier(.34,1.4,.64,1);position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:320px;padding:9px 13px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#1f2933) 86%,transparent);color:var(--dsw-alias-label-primary,#172026);font-size:12px;line-height:1.5;box-shadow:0 10px 28px rgb(0 0 0 / 26%),0 2px 8px rgb(0 0 0 / 12%);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);animation:dshpwDlToastIn .38s var(--dshpw-spring) both}
.dshpw-dl-toast-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 92%,transparent);color:#fff}
@keyframes dshpwDlToastIn{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dshpw-dl-toast{animation:none}.dshpw-dl{transition:none}.dshpw-dl-busy,.dshpw-dl-tap{animation:none}}
`;

/** 下载图标（14×14，线条风格，跟随按钮文字色）。 */
const DOWNLOAD_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
  '<path d="M8 2.5v7M8 9.5 5 6.7M8 9.5l3-2.8M3 11.5v1A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ── 语言 ───────────────────────────────────────────────────────

/** 注入层用到的文案（从词典按当前语言取出一份固定映射，便于纯函数测试）。 */
export interface DownloadText {
  aria: string;
  denied: string;
  failed: string;
  started: string;
}

/** 当前语言的文案；navigator 缺失（SSR/测试）时回退英文。 */
export const downloadText: DownloadText = (() => {
  const dict =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string' &&
    navigator.language.toLowerCase().startsWith('zh')
      ? zh
      : en;
  return {
    aria: dict.dlFile,
    denied: dict.dlDenied,
    failed: dict.dlFailed,
    started: dict.dlStarted,
  };
})();

// ── 纯工具（供单测） ──────────────────────────────────────────

/** 由绝对路径构造下载 URL（query 参数必须整体编码，防 %/#/& 注入）。 */
export function downloadUrlFor(absPath: string): string {
  return `${DOWNLOAD_ENDPOINT}?path=${encodeURIComponent(absPath)}`;
}

// ── 幂等注入 ───────────────────────────────────────────────────

function injectStyleOnce(): void {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  if (document.querySelector('style[data-dshpw-dl-style="1"]') !== null) return;
  const style = document.createElement('style');
  style.dataset.dshpwDlStyle = '1';
  style.textContent = FILE_DL_CSS;
  (document.head ?? document.documentElement).appendChild(style);
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
    toastEl.className = 'dshpw-dl-toast';
    (document.body ?? document.documentElement).appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = error ? 'dshpw-dl-toast dshpw-dl-toast-error' : 'dshpw-dl-toast';
  if (toastTimer !== 0) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastTimer = 0;
    toastEl?.remove();
    toastEl = null;
  }, TOAST_MS);
}

/** HEAD 探测：下载端点支持 HEAD（权限/存在性判定与 GET 完全一致）。 */
async function probeDownload(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, { method: 'HEAD', credentials: 'same-origin' });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** 通过后用隐藏 <a> 触发浏览器下载（attachment 响应不会离开当前页面）。 */
function triggerBrowserDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 给一个文件行注入下载按钮（幂等：路径不变只更新标记）。 */
function injectRowButton(rowHost: HTMLLIElement, absPath: string): void {
  const existing = rowHost.querySelector(':scope > .dshpw-dl');
  if (existing !== null) {
    existing.setAttribute(PATH_ATTR, absPath);
    return;
  }
  // li 默认无定位：绝对定位按钮以行为基准
  if (rowHost.style !== undefined && typeof getComputedStyle === 'function' &&
    getComputedStyle(rowHost).position === 'static') {
    rowHost.style.position = 'relative';
  }
  // 原生 button：默认进入 Tab 序列（键盘可达），Enter/Space 原生触发 click，
  // 与鼠标点击走同一 handler（同一 HEAD 探测 + 下载语义）。无需 role=button。
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'dshpw-dl';
  node.setAttribute('data-dshpw-dl', '1');
  node.setAttribute(PATH_ATTR, absPath);
  const label = `${downloadText.aria}`;
  node.setAttribute('aria-label', label);
  node.setAttribute('title', label);
  node.innerHTML = DOWNLOAD_ICON;

  node.addEventListener('click', (event) => {
    // 行内官方 button 的 onClick 会打开预览 tab：绝不能让它收到这次点击
    event.preventDefault();
    event.stopPropagation();
    const current = node.getAttribute(PATH_ATTR);
    if (current === null || current === '' || node.classList.contains('dshpw-dl-busy')) return;
    const url = downloadUrlFor(current);
    node.classList.remove('dshpw-dl-tap');
    // 强制重新触发短反馈，即使用户快速点击了不同的文件行。
    void node.offsetWidth;
    node.classList.add('dshpw-dl-tap');
    window.setTimeout(() => node.classList.remove('dshpw-dl-tap'), 280);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(18);
      } catch {
        // 触感反馈是渐进增强；浏览器拒绝时不能影响文件下载。
      }
    }
    node.classList.add('dshpw-dl-busy');
    void probeDownload(url).then((probe) => {
      node.classList.remove('dshpw-dl-busy');
      if (probe.ok) {
        triggerBrowserDownload(url);
        showToast(`${downloadText.started}: ${current.split('/').pop() ?? ''}`, false);
        return;
      }
      // 403 = 未开启文件下载/目录越权；404 = 文件已不存在；0 = 网络失败
      showToast(probe.status === 403 ? downloadText.denied : downloadText.failed, true);
    });
  });

  rowHost.appendChild(node);
}

// ── 扫描（幂等） ───────────────────────────────────────────────

/** 扫一遍全部文件面板实例（dock/split/float），为文件行注入下载按钮。 */
export function scanFileRows(): void {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  // 只认文件行：目录/other 不注入（下载端点只收普通文件）
  const rows = document.querySelectorAll('li[data-files-entry="file"][data-files-path]');
  for (const row of rows) {
    const absPath = row.getAttribute('data-files-path') ?? '';
    if (absPath === '') continue;
    injectRowButton(row as HTMLLIElement, absPath);
  }
}

// ── 启动 ───────────────────────────────────────────────────────

let observer: MutationObserver | null = null;
let scanTimer = 0;

function scheduleScan(): void {
  if (scanTimer !== 0) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    scanFileRows();
  }, SCAN_DEBOUNCE_MS);
}

/**
 * 文件下载按钮（主用户始终启用；子用户按 allow_git_download）。
 *
 * 先向本插件自己的 /api/dsh-passwords/state 确认下载权限：未授权（或探测失败、
 * 未登录）直接返回，连 MutationObserver 都不装——无权限页面零行为变化。
 * 授权边界在网关下载端点（403），这里只是不把用不上的按钮递过去。
 */
export function startFileDownload(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  void fetch('/api/dsh-passwords/state', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((data: unknown) => {
      if ((data as { fileDownload?: unknown } | null)?.fileDownload !== true) return;
      injectStyleOnce();
      if (observer === null && typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => scheduleScan());
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
      scheduleScan();
    })
    .catch(() => {
      /* 探测失败 = 不启用（fail-closed） */
    });
}
