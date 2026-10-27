// dsh-passwords 全局聊天入口：注入 dsh 主界面 `shell.overlay` 槽（root 作用域，
// 帧级悬浮层，叠加在所有列之上）。
//   - 左下角圆形聊天按钮 + 右上角红色未读角标
//   - 点击弹出居中面板（四周等距留白），外层黑色雾化 + 淡入淡出动画
//   - 右上角 X 关闭；面板配色跟随 dsh 设计令牌（--dsw-alias-*）
// 数据面：/gateway/api/messages（列表/发送）。实时采用轮询（4 秒），不依赖 SSE。
import { useEffect, useRef, useState } from 'react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { CHAT_ENTRY_CHANGED_EVENT, type ChatEntryChangeDetail } from './events';

export interface ChatMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  recipient_id: number | null;
  content: string;
  tags: string[];
  created_at: string;
  /** 服务端投影：消息附件（旧服务端不返回时为 undefined） */
  media?: ChatMedia[] | null;
  /** 本地乐观发送的临时消息（服务器未确认）：渲染发送中状态 */
  pending?: boolean;
}

/** 服务端媒体类型（与网关 media_assets.media_kind 一致） */
type ChatMediaKind = 'sticker' | 'image' | 'video';

/**
 * 消息附件投影。字段全部按白名单读取：服务端可能返回额外内部字段，
 * 但渲染层只使用下列值，且不把任何服务端字符串当 HTML 使用。
 */
interface ChatMedia {
  id: string;
  kind: ChatMediaKind;
  /** 由服务端确定，仅用于缩略图尺寸提示，不参与拼接 URL */
  mime_type?: string;
  byte_size?: number;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  original_name?: string;
}

/** 客户端上传任务状态机 */
type MediaUploadState = 'queued' | 'uploading' | 'ready' | 'failed' | 'canceled';

interface MediaUpload {
  /** 本地 ID（仅用于 key 与查找；永远不发给服务端） */
  localId: string;
  file: File;
  kind: ChatMediaKind;
  state: MediaUploadState;
  /** 0-100；服务端未提供进度信息时为 null（不假装知道） */
  percent: number | null;
  /** 服务端返回的不透明媒体 ID（ready 后才有） */
  mediaId: string | null;
  /** 本地 object URL，供上传前预览；移除时 revoke */
  previewUrl: string | null;
  /** 失败原因（已本地化） */
  error: string;
  /** 取消/重试用的控制器，同时用于中止 XHR 与网关 PUT */
  controller: AbortController | null;
}

/**
 * 单条消息附件上限（与网关 MAX_MEDIA_PER_MESSAGE 一致；最终由服务端决定）
 */
const MAX_MEDIA_PER_MESSAGE = 10;

/**
 * 允许的 MIME → kind 映射。必须与服务端 MEDIA_POLICY 一致的白名单，
 * 不能用 `image/*` 前缀匹配：SVG 属于 image/*，但设计明确禁止 SVG
 * （可携带脚本与外部引用，是存储型 XSS 载体），必须先在此拦住。
 */
const MEDIA_MIME_KIND: Record<string, ChatMediaKind> = {
  'image/png': 'sticker',
  'image/jpeg': 'sticker',
  'image/webp': 'sticker',
  'image/gif': 'sticker',
  'video/mp4': 'video',
  'video/webm': 'video',
};

/** 并发上传上限：避免一次性把几十个大文件同时推向网关 */
const MAX_PARALLEL_UPLOADS = 3;

/**
 * accept 与服务端策略一致的白名单（网关仍会重校验魔数与 MIME）。
 * 默认媒体权限关闭时不会读取文件内容，也不会发起上传。
 */
const MEDIA_ACCEPT = Object.keys(MEDIA_MIME_KIND).join(',');

/**
 * 面板内 Tab 环绕用的保守可聚焦选择器：覆盖常见原生可聚焦元素与显式 tabindex≥0，
 * 排除 disabled 控件与 tabindex="-1"（如 aria-hidden 的隐藏 file input）。
 * 不做可见性判断（宁多勿漏）：漏掉控件会让 Tab 把焦点带出面板、落到 DSH 页面上。
 */
const CHAT_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  'audio[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const mediaFileKey = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`;

/**
 * 由浏览器提供的 MIME 判定草稿类型；空/不支持的类型返回 null。
 * 仅接受与服务端一致的白名单（排除 SVG 等 image/* 下的危险格式）。
 */
function mediaKindOf(file: { type: string }): ChatMediaKind | null {
  // 去掉 charset 等参数："image/png;charset=utf-8" 也应识别为 image/png
  const mime = (file.type || '').split(';')[0].trim().toLowerCase();
  return MEDIA_MIME_KIND[mime] ?? null;
}

/**
 * 从任意 JSON 值里安全读取附件数组。
 * 只接受已知 kind 与字符串 id；其余条目直接丢弃（不渲染未知结构，
 * 也不把服务端字段拼进 URL 或 HTML）。
 */
function readMessageMedia(raw: unknown): ChatMedia[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const media: ChatMedia[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    const kind = row.kind;
    if (typeof id !== 'string' || id === '') continue;
    if (kind !== 'sticker' && kind !== 'image' && kind !== 'video') continue;
    media.push({
      id,
      kind,
      ...(typeof row.mime_type === 'string' ? { mime_type: row.mime_type } : {}),
      ...(typeof row.byte_size === 'number' ? { byte_size: row.byte_size } : {}),
      ...(typeof row.width === 'number' || row.width === null ? { width: row.width as number | null } : {}),
      ...(typeof row.height === 'number' || row.height === null ? { height: row.height as number | null } : {}),
      ...(typeof row.duration_ms === 'number' || row.duration_ms === null
        ? { duration_ms: row.duration_ms as number | null }
        : {}),
      ...(typeof row.original_name === 'string' ? { original_name: row.original_name } : {}),
    });
  }
  return media;
}

/** 媒体访问路径：不透明 ID 经 encodeURIComponent 后拼入服务端约定路由。
 *  服务端每次按消息可见性重新鉴权，这里不发永久公开 URL。 */
function mediaSrc(media: Pick<ChatMedia, 'id'>): string {
  return `/gateway/api/message-media/${encodeURIComponent(media.id)}`;
}

interface Me {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

const PRESET_TAGS = ['issue', 'pr', 'discussion', 'announcement', 'question'] as const;
const POLL_MS = 4000;

// ── 聊天入口悬浮钮：中键拖动可移动（left/top 定位，localStorage 持久化）──
const FAB_SIZE = 36;
const FAB_DEFAULT_BOTTOM = 116; // 原 CSS 默认 bottom
const FAB_STORAGE_KEY = 'dshpw_fab_pos';

function defaultFabPos(): { left: number; top: number } {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return { left: 14, top: Math.max(0, vh - FAB_SIZE - FAB_DEFAULT_BOTTOM) };
}

/** 标签显示：canonical key 走 i18n，旧标签兼容映射，未知标签原样回退 */
function tagDisplay(tag: string, tr: (key: string) => string): string {
  const legacy: Record<string, string> = { 讨论: 'discussion', 公告: 'announcement', 问题: 'question', PR: 'pr' };
  const key = legacy[tag] ?? tag;
  const localized = tr(`tag.${key}`);
  return localized === `tag.${key}` ? tag : localized;
}

/** 聊天错误文案：按服务端稳定 code 本地化（跟随 dsh 语言），未知 code 回退服务端文案 */
function chatErrText(
  d: { error?: string; code?: string },
  fallback: string,
  tr: (key: string) => string,
  /** 媒体上下文：把“媒体专用”的复用的通用 code 映射到准确文案。
   *  网关发送路由在媒体未授权时回 FORBIDDEN、纯媒体为空时回 INVALID，
   *  这两个 code 在聊天里另有含义，直接复用会给出误导文案。 */
  mediaContext = false,
): string {
  if (d.code) {
    const code = mediaContext && d.code === 'FORBIDDEN' ? 'FORBIDDEN_MEDIA' : d.code;
    const key = `err.${code}`;
    const localized = tr(key);
    if (localized !== key && !localized.includes('{')) return localized;
  }
  return d.error ?? fallback;
}

/** 把服务端消息归一化：白名单读取 media，供 mergeById 去重后统一渲染 */
function normalizeMessage(raw: unknown): ChatMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'number') return null;
  return {
    id: m.id,
    sender_id: typeof m.sender_id === 'number' ? m.sender_id : 0,
    sender_name: typeof m.sender_name === 'string' ? m.sender_name : '',
    recipient_id: typeof m.recipient_id === 'number' ? m.recipient_id : null,
    content: typeof m.content === 'string' ? m.content : '',
    tags: Array.isArray(m.tags) ? m.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    created_at: typeof m.created_at === 'string' ? m.created_at : new Date().toISOString(),
    media: readMessageMedia(m.media),
  };
}

/** XHR 响应体安全解析：非 JSON（如反代登录页）时不抛错，交给调用方走通用文案 */
function parseJson(raw: string): { error?: string; code?: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const row = parsed as Record<string, unknown>;
    return {
      ...(typeof row.error === 'string' ? { error: row.error } : {}),
      ...(typeof row.code === 'string' ? { code: row.code } : {}),
    };
  } catch {
    return {};
  }
}

/** 头像色板：按用户名哈希取固定色（同一个人颜色稳定） */
const AVATAR_COLORS = ['#5b8ff9', '#5ad8a6', '#f6bd16', '#e8684a', '#6dc8ec', '#9270ca', '#ff9d4d', '#269a99'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 力反馈：移动端真实振动（能力检测，桌面/不支持环境静默忽略）。
 *  dsh 客户端是标准浏览器壳（Chromium），navigator.vibrate 在支持的环境下可用。 */
function haptic(ms = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* 无振动能力：静默 */
  }
}

/** 游标倒退判定：返回消息中存在 id ≤ 上次游标 = 服务端数据库被重建（自增从头开始）。
 *  纯函数导出供单测；轮询循环里用它决定是否重建基线。 */
export function isCursorReset(since: number, incoming: ChatMessage[]): boolean {
  return since > 0 && incoming.some((m) => m.id <= since);
}

/** 合并新消息：去重、按 id 升序、保留最近 200 条。
 *  无新 id 时返回原引用——每 4 秒轮询返回空时若重建数组，
 *  会触发 [messages] 滚动 effect 把用户硬拽回底部（必现缺陷）。 */
export function mergeById(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const known = new Set(prev.map((m) => m.id));
  let hasNew = false;
  for (const m of incoming) {
    if (!known.has(m.id)) {
      hasNew = true;
      break;
    }
  }
  if (!hasNew) return prev; // 无新消息：保持原引用，滚动 effect 不触发
  const map = new Map<number, ChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id).slice(-200);
}

/** 聊天入口 + 面板（挂在 shell.overlay 槽） */
export function ChatLauncher(props: PropsLocale<'dshpw'>) {
  const t = props.t;
  // tagDisplay 需要 (key: string) => string，而 dshpw 词典 t 是受限 key 联合类型：
  // 包一层宽松签名适配器（运行时不变）
  const tr = (key: string) => t(key as never);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(0);
  const [shaking, setShaking] = useState(false);
  // 聊天媒体权限：服务端 phase 返回 mediaEnabled；未返回时按关闭处理（fail-closed，
  // 与服务端默认值 allow_chat_media=false 一致）。授权仍由网关强制执行。
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [uploads, setUploads] = useState<MediaUpload[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 上传状态在异步回调里需要读最新值；用 ref 避免把陈旧闭包写回 state
  const uploadsRef = useRef<MediaUpload[]>([]);
  const uploadSeq = useRef(0);
  const dragDepth = useRef(0);
  // 账号级偏好异步读取：加载期间不闪现 FAB；请求失败时默认显示，避免 API 暂时异常把聊天永久隐藏。
  const [chatEntry, setChatEntry] = useState<'loading' | 'on' | 'off'>('loading');
  // 主用户收件人选择（Discussion #6）：'broadcast' | 用户 id；子用户无需选择（服务端默认私信主用户）
  const [to, setTo] = useState<'broadcast' | number>('broadcast');
  const [contacts, setContacts] = useState<Array<{ id: number; username: string; role: string }>>([]);
  // 设置卡片事件若先于初始 fetch 返回，记录最新本页偏好，避免旧响应把刚关闭的
  // 气泡重新打开（两个 slot 组件独立挂载，存在这类微小竞态）。
  const chatEntryOverrideRef = useRef<boolean | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastSeenId = useRef(0);
  const openRef = useRef(false);
  const initializedRef = useRef(false);
  // 用户是否停留在列表底部（只有贴着底部时才自动滚动，向上翻历史时不被 4s 轮询拽回）
  const atBottomRef = useRef(true);
  // 关闭动画的 180ms 定时器：重开面板时取消，避免“开了又被强制关”
  const closeTimerRef = useRef<number | null>(null);
  // 发送请求期间用户可能继续编辑；失败回滚只允许覆盖未发生新编辑的草稿
  const draftRevisionRef = useRef(0);

  // ── 中键拖动 FAB：位置 state + ref（拖动用 ref 避免重挂监听器）──
  const fabPosRef = useRef(defaultFabPos());
  const [fabPos, setFabPosState] = useState(fabPosRef.current);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
    moved: boolean;
    lastPos: { left: number; top: number } | null;
  } | null>(null);

  // ── 焦点移交（可访问性）──
  // 打开面板 → 焦点进入关闭按钮；关闭动画完全结束 → 焦点归还入口。
  const fabButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // 关闭发起瞬间焦点是否由面板持有：只有面板持有焦点才在关闭结束后归还入口，
  // 避免把用户在关闭动画期间主动移到别处的焦点抢回来。
  const focusWasInPanelRef = useRef(false);
  // 上一次渲染的 open：用于区分“真正打开/完全关闭”与“关闭动画中重开”（后者 open 不变）
  const wasOpenRef = useRef(false);

  // 读取按用户存储的聊天入口偏好（服务端默认开启，跨设备同步），
  // 同时取子用户列表供主用户选择私信收件人（state 仅对主用户返回全量用户）。
  useEffect(() => {
    let disposed = false;
    fetch('/api/dsh-passwords/state')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          chatEnabled?: unknown;
          mediaEnabled?: unknown;
          users?: Array<{ id: number; username: string; role: string }>;
        };
        if (disposed) return;
        const nextContacts = Array.isArray(data.users) ? data.users.filter((u) => u.role === 'user') : [];
        setContacts(nextContacts);
        setTo((prev) =>
          prev !== 'broadcast' && !nextContacts.some((contact) => contact.id === prev) ? 'broadcast' : prev,
        );
        if (chatEntryOverrideRef.current === null) {
          setChatEntry(res.ok && data.chatEnabled === false ? 'off' : 'on');
        }
        // 媒体开关是权限字段（允许媒体 = true 才打开）；未知/失败一律按关闭。
        setMediaEnabled(res.ok && data.mediaEnabled === true);
      })
      .catch(() => {
        if (!disposed && chatEntryOverrideRef.current === null) setChatEntry('on');
      });
    return () => {
      disposed = true;
    };
  }, []);

  /** 收件人列表刷新：面板打开时同步（其他端删/建子用户后下拉及时更新） */
  const refreshContacts = () => {
    fetch('/api/dsh-passwords/state')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          users?: Array<{ id: number; username: string; role: string }>;
        };
        const nextContacts = Array.isArray(data.users) ? data.users.filter((u) => u.role === 'user') : [];
        setContacts(nextContacts);
        setTo((prev) =>
          prev !== 'broadcast' && !nextContacts.some((contact) => contact.id === prev) ? 'broadcast' : prev,
        );
      })
      .catch(() => {});
  };

  // 卸载时清理关闭动画定时器（组件在 180ms 动画窗口内被卸载时避免泄漏）
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // 设置卡片与 ChatLauncher 处在不同 slot / React 树，不能靠 props 直传。
  // 偏好保存成功后立即同步当前页面：关闭时收起面板、清未读并让轮询 effect 清理，
  // 开启时重新拉取增量消息；无需刷新整个 dsh 页面。
  useEffect(() => {
    const onEntryChanged = (event: Event) => {
      const detail = (event as CustomEvent<ChatEntryChangeDetail>).detail;
      if (!detail || typeof detail.enabled !== 'boolean') return;
      chatEntryOverrideRef.current = detail.enabled;
      setChatEntry(detail.enabled ? 'on' : 'off');
      if (!detail.enabled) {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        setOpen(false);
        setClosing(false);
        setUnread(0);
        setError('');
      }
    };
    window.addEventListener(CHAT_ENTRY_CHANGED_EVENT, onEntryChanged);
    return () => window.removeEventListener(CHAT_ENTRY_CHANGED_EVENT, onEntryChanged);
  }, []);

  // 挂载时恢复持久化位置
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAB_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { left?: unknown; top?: unknown };
        if (typeof p.left === 'number' && typeof p.top === 'number') {
          const pos = { left: p.left, top: p.top };
          fabPosRef.current = pos;
          setFabPosState(pos);
        }
      }
    } catch {
      // 损坏数据忽略，用默认位置
    }
  }, []);

  // 中键按下开始拖动（window 级监听一次挂载，拖动状态走 ref）
  useEffect(() => {
    if (chatEntry !== 'on') return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const next = {
        left: Math.min(Math.max(0, d.baseLeft + dx), Math.max(0, vw - FAB_SIZE)),
        top: Math.min(Math.max(0, d.baseTop + dy), Math.max(0, vh - FAB_SIZE)),
      };
      d.lastPos = next;
      fabPosRef.current = next;
      setFabPosState(next);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      // 触发一次 re-render：dragging 由 dragRef.current !== null 在渲染时派生，
      // 不 setState 的话 mouseup 后组件停留在最后一次 mousemove 的 dragging=true，
      // FAB 的 hover 过渡动画不会恢复（直到下一次任意 state 变化，如 4 秒轮询）
      setFabPosState((p) => ({ ...p }));
      // 实际拖动过才持久化（纯点击不落盘）；未拖动视为中键点击，无副作用
      if (d.moved && d.lastPos) {
        try {
          localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(d.lastPos));
        } catch {
          // 存储不可用（隐私模式等）：位置本次会话有效即可
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [chatEntry]);

  // 面板打开时浮动入口退场：CSS 隐藏类（opacity/pointer-events/visibility）+ tabIndex/aria。
  // 关闭动画（closing=true，180ms）期间保持可见可用：此时点入口属于“关闭途中立即重开”，
  // openPanel 会取消 pending 的 close 定时器；若连 closing 也隐藏，该重开路径将无法触发。
  const fabHidden = open && !closing;

  const onFabMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (fabHidden) return; // 面板打开中：不响应拖动（键盘/程序化触发的兜底防御）
    if (e.button !== 1) return; // 仅中键
    // 阻止中键默认行为（浏览器 autoscroll 滚动模式）
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: fabPosRef.current.left,
      baseTop: fabPosRef.current.top,
      moved: false,
      lastPos: null,
    };
  };

  // 拖动进行中：禁用 hover 放大等过渡动画，避免位置跟随抖动
  const dragging = dragRef.current !== null;

  useEffect(() => {
    openRef.current = open;
    if (open) {
      setUnread(0);
      atBottomRef.current = true; // 打开面板：跳到最新（滚动由下方 effect 执行）
    }
  }, [open]);

  // 焦点移交：真正打开（false→true）时把键盘焦点移入面板（优先关闭按钮）；
  // 完全关闭（true→false，180ms 关闭动画结束）后归还入口。
  // 关闭途中立即重开不会改变 open，因此不会误触发归还（close 定时器已被 openPanel 取消；
  // 该路径的焦点由 openPanel 显式移回面板）。
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) {
      closeButtonRef.current?.focus();
      return;
    }
    if (!open && wasOpen) {
      let returnFocus = focusWasInPanelRef.current;
      if (returnFocus && typeof document !== 'undefined') {
        const active = document.activeElement;
        // 关闭动画期间用户若把焦点主动移到页面其他元素，则不抢回；
        // 焦点落到 body（面板卸载后浏览器默认落点）或已脱离文档（面板内元素被卸载）时才归还。
        returnFocus = !(active && active !== document.body && document.contains(active));
      }
      focusWasInPanelRef.current = false;
      if (returnFocus) fabButtonRef.current?.focus();
    }
  }, [open]);

  // 有未读时让按钮震动一下
  useEffect(() => {
    if (unread > 0) {
      setShaking(true);
      const timer = window.setTimeout(() => setShaking(false), 520);
      return () => window.clearTimeout(timer);
    }
  }, [unread]);

  // 轮询加载 + 未读统计（不依赖 SSE，消息无需刷新页面）
  // 超时链调度（非 setInterval）：支持失败退避与 in-flight 守卫，
  // 响应超过 4s 时不再重叠堆积请求。
  useEffect(() => {
    if (chatEntry !== 'on') return;
    let disposed = false;
    let inFlight = false;
    let failStreak = 0; // 连续失败次数 → 指数退避（4s → 30s 封顶）
    let timer: number | null = null;

    const load = () => {
      if (disposed || inFlight) return; // 上一轮未返回：跳过本轮，避免请求堆积
      inFlight = true;
      // 增量拉取：服务端只返回 id > since 的新消息（第一次全量拿基线），
      // 避免每 4 秒轮询都全量下载最近 300 条留言（长期挂机 = 长期无谓带宽/CPU）。
      const since = lastSeenId.current;
      const url = '/gateway/api/messages' + (since > 0 ? '?since=' + since : '');
      fetch(url)
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (disposed) return;
          if (res.ok && d.ok) {
            failStreak = 0;
            const incoming = (Array.isArray(d.messages) ? d.messages : [])
              .map(normalizeMessage)
              .filter((m: ChatMessage | null): m is ChatMessage => m !== null);
            // 服务端返回 id DESC（新在前），这里统一成旧在前、新在后
            incoming.sort((a: ChatMessage, b: ChatMessage) => a.id - b.id);
            const nextMe = (d.me ?? null) as Me | null;
            setMe(nextMe);
            const maxId = incoming.length > 0 ? incoming[incoming.length - 1].id : 0;
            const sinceBefore = lastSeenId.current;
            // 游标倒退（服务端 reset 信号，或返回的 id ≤ 上次游标）= 服务端数据库
            // 被重建、自增从头开始。视为新基线：替换列表、重建游标，不把整批历史
            // 算成未读（角标 99+ 的根因）。旧“连续 3 轮空响应”启发式已删除：
            // 无法与正常无消息态区分，且空响应下 isCursorReset 永远不可达。
            const cursorReset = d.reset === true || isCursorReset(sinceBefore, incoming);
            if (!cursorReset && nextMe && initializedRef.current && maxId > sinceBefore) {
              const fresh = incoming.filter(
                (m: ChatMessage) => m.sender_id !== nextMe.id && m.id > sinceBefore,
              ).length;
              if (fresh > 0 && !openRef.current) setUnread((u) => u + fresh);
            }
            // reset 时游标直接落到新基线的 maxId（不能用 Math.max 保留旧高游标，
            // 否则 DB 重建后永远收不到新消息，直到 id 追上旧游标）
            lastSeenId.current = cursorReset ? maxId : Math.max(sinceBefore, maxId);
            initializedRef.current = true;
            setMessages((prev) => (cursorReset ? incoming : mergeById(prev, incoming)));
            setError('');
          } else {
            // 反向代理可能把登录页/其他 HTML 以 200 返回；只看状态码会让轮询
            // 静默空转，必须把协议层 ok=false/缺失也纳入退避。
            failStreak++;
            setError(chatErrText(d, t('chat.loadFailed'), tr));
          }
        })
        .catch(() => {
          if (disposed) return;
          failStreak++;
          setError(t('chat.loadFailed'));
        })
        .finally(() => {
          inFlight = false;
          if (disposed) return;
          // 失败退避：4s、8s、16s、30s 封顶；成功恢复 4s
          const delay = failStreak > 0 ? Math.min(POLL_MS * 2 ** failStreak, 30_000) : POLL_MS;
          timer = window.setTimeout(load, delay);
        });
    };

    load();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [chatEntry]);

  // 新消息 / 打开面板时滚动到底部（仅在用户贴着底部时自动跟随）
  useEffect(() => {
    if (open && listRef.current && atBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  /** 关闭发起瞬间焦点是否在面板内：无 document（测试/SSR）按 true，保证归还逻辑可测 */
  const focusIsInsidePanel = () => {
    if (typeof document === 'undefined') return true;
    const active = document.activeElement;
    if (!active || active === document.body) return true; // 焦点在 body：仍视为应由面板归还
    const panel = panelRef.current;
    return !!panel && panel.contains(active);
  };

  const close = () => {
    haptic();
    // 记录焦点归属：关闭动画结束后据此决定是否把焦点归还入口
    focusWasInPanelRef.current = focusIsInsidePanel();
    setClosing(true);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
      setClosing(false);
      setError('');
    }, 180);
  };

  const openPanel = () => {
    // 已完全打开：幂等保护，避免 pointer-events:none 之外的路径（键盘/程序化触发）重复刷新
    if (fabHidden) return;
    haptic();
    // 关闭定时器 pending = 关闭动画进行中（入口此刻仍可见可点）。open 不会变化，
    // 因此 [open] 焦点 effect 不会重跑；记录该状态供下方把焦点移回面板。
    const reopeningDuringClose = closeTimerRef.current !== null;
    // 取消 pending 的 close 定时器，否则面板开了又被强制关
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // 打开面板时终止进行中的拖动：清空 drag ref 并触发一次渲染移除 .dragging。
    // 否则 .dragging 的 transition:none 会让入口的淡出退场失效，且 mousemove 仍会继续改写位置。
    if (dragRef.current !== null) {
      dragRef.current = null;
      setFabPosState((p) => ({ ...p }));
    }
    setClosing(false);
    setOpen(true);
    setUnread(0);
    refreshContacts();
    // 关闭途中重开：这次点击已按浏览器默认行为把焦点落在入口上，而入口随后会重新
    // 隐藏；显式把焦点移回面板（关闭按钮），避免焦点停留在 aria-hidden 的入口上。
    if (reopeningDuringClose) closeButtonRef.current?.focus();
  };

  // ── 面板键盘行为：Esc 关闭 + Tab 焦点环绕（与 aria-modal 对话框语义一致）──
  // 监听挂在 window 捕获阶段：面板打开时不论焦点落在哪个控件（甚至 body）都先收到事件。
  //   - Esc：关闭面板并消费事件（preventDefault + stopPropagation），同一次按键不再传给
  //     DSH 宿主（宿主也可能用 Esc 关自己的浮层）；closing 期间只消费、不重复 close()，
  //     否则会重启 180ms 定时器、把关闭无限推迟。
  //   - Tab：焦点限制在面板可聚焦控件内环绕。closing 期间不拦截：面板正在退场，入口已恢复
  //     可聚焦（关闭途中可重开），锁焦点会与“关闭动画期间焦点可移出、关闭结束后不抢回”的
  //     既有语义冲突；面板卸载后监听器随 effect 清理移除，不残留全局键盘拦截。
  //   - IME 组合输入期间整体放行（isComposing / 旧式 keyCode 229）：Esc 取消候选、Enter 确认
  //     候选都必须留给输入法，既不能触发面板快捷键，也不能 preventDefault/stopPropagation。
  useEffect(() => {
    if (chatEntry !== 'on' || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // keyCode 229 是组合期间 keydown 的传统标记，兜底 isComposing 缺失/为 false 的旧浏览器
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!closing) close();
        return;
      }
      if (event.key !== 'Tab' || closing) return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(CHAT_FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        // 无可聚焦控件（正常不会出现：关闭按钮恒在）：不放行，避免焦点逃到 DSH 页面
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const inside = !!active && panel.contains(active);
      if (event.shiftKey) {
        // 首个控件（或焦点已不在面板内）反向环绕到末尾
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        // 末尾控件（或焦点已不在面板内）正向环绕到开头
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, closing, chatEntry]);

  const updateUpload = (localId: string, patch: Partial<MediaUpload>) => {
    const next = uploadsRef.current.map((u) => (u.localId === localId ? { ...u, ...patch } : u));
    uploadsRef.current = next;
    setUploads(next);
  };

  /**
   * 单文件上传：init（取 uploadId/mediaId/token）→ PUT（流式传文件本体）。
   * 全程使用 File/XHR 直传：不把文件读入内存，也不 base64。
   * 用 XHR 而非 fetch：需要真实上传进度（fetch 无上传进度事件）。
   */
  const uploadOne = async (localId: string, file: File, kind: ChatMediaKind) => {
    const controller = new AbortController();
    updateUpload(localId, { state: 'uploading', percent: null, error: '', controller });
    try {
      const res = await fetch('/gateway/api/message-media/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          kind,
          mimeType: file.type,
          byteSize: file.size,
          // 服务端字段名是 fileName（仅作展示元数据，不参与落盘路径）
          fileName: file.name,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        uploadId?: unknown;
        mediaId?: unknown;
        token?: unknown;
        error?: string;
        code?: string;
      };
      if (!res.ok || d.ok !== true) throw new Error(chatErrText(d, t('chat.mediaFailed'), tr, true));
      const mediaId = typeof d.mediaId === 'string' && d.mediaId !== '' ? d.mediaId : null;
      if (mediaId === null) throw new Error(t('chat.mediaFailed'));
      const uploadId = typeof d.uploadId === 'string' && d.uploadId !== '' ? d.uploadId : mediaId;
      const token = typeof d.token === 'string' ? d.token : '';
      // PUT 路径与服务端约定一致：/gateway/api/message-media/:id
      const putUrl = `/gateway/api/message-media/${encodeURIComponent(uploadId)}`;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', putUrl, true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
        if (token !== '') xhr.setRequestHeader('x-dshpw-media-token', token);
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable || event.total <= 0) return;
          // 100% 留给“服务端校验通过”那一刻：传输完成不等于 ready
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          updateUpload(localId, { percent });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(chatErrText(parseJson(xhr.responseText), t('chat.mediaFailed'), tr, true)));
        };
        xhr.onerror = () => reject(new Error(t('chat.mediaFailed')));
        xhr.onabort = () => reject(Object.assign(new Error(t('chat.mediaCanceled')), { aborted: true }));
        controller.signal.addEventListener('abort', () => xhr.abort(), { once: true });
        xhr.send(file);
      });
      updateUpload(localId, { state: 'ready', percent: 100, mediaId, controller: null });
    } catch (e) {
      const err = e as Error & { aborted?: boolean };
      // 取消不当作错误：不弹红字，只标记状态让用户可移除/重试
      if (err?.aborted) {
        updateUpload(localId, { state: 'canceled', percent: null, controller: null, error: '' });
      } else {
        updateUpload(localId, { state: 'failed', percent: null, controller: null, error: err.message });
      }
    } finally {
      // 任一上传结束都会释放并发槽位；立即补位，防止第 4 个及之后的附件永久停在 queued。
      promoteQueued();
    }
  };

  /** 选中/拖拽/粘贴入口：先本地校验，再排队上传（并发上限由 MAX_PARALLEL_UPLOADS 控制） */
  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    if (!mediaEnabled) {
      setError(t('chat.attachDisabled'));
      return;
    }
    const accepted: MediaUpload[] = [];
    for (const file of Array.from(files)) {
      // 重复选择同一文件时直接忽略，避免占用配额与上传名额
      if (uploadsRef.current.some((u) => mediaFileKey(u.file) === mediaFileKey(file))) continue;
      const kind = mediaKindOf(file);
      if (kind === null) {
        // 未知/不支持的类型：交给服务端拒绝不现实（不会上传），这里直接提示
        setError(t('chat.mediaUnsupported'));
        continue;
      }
      const previewUrl = kind === 'video' ? null : URL.createObjectURL(file);
      accepted.push({
        localId: `m${++uploadSeq.current}`,
        file,
        kind,
        state: 'queued',
        percent: null,
        mediaId: null,
        previewUrl,
        error: '',
        controller: null,
      });
    }
    if (accepted.length === 0) return;
    const total = uploadsRef.current.length + accepted.length;
    if (total > MAX_MEDIA_PER_MESSAGE) {
      // 超出上限的部分不入队：避免发送时才发现“附件过多”
      for (const item of accepted) revokePreview(item);
      setError(t('chat.mediaTooMany', { count: MAX_MEDIA_PER_MESSAGE }));
      return;
    }
    const next = [...uploadsRef.current, ...accepted];
    uploadsRef.current = next;
    setUploads(next);
    setError('');
    // 排队启动：只保留 MAX_PARALLEL_UPLOADS 个 in-flight
    const running = next.filter((u) => u.state === 'uploading').length;
    let slots = MAX_PARALLEL_UPLOADS - running;
    for (const item of accepted) {
      if (slots <= 0) break;
      slots--;
      uploadOne(item.localId, item.file, item.kind);
    }
  };

  const revokePreview = (item: MediaUpload) => {
    if (item.previewUrl !== null) URL.revokeObjectURL(item.previewUrl);
  };

  const promoteQueued = () => {
    let slots = MAX_PARALLEL_UPLOADS - uploadsRef.current.filter((u) => u.state === 'uploading').length;
    for (const item of uploadsRef.current) {
      if (slots <= 0) break;
      if (item.state !== 'queued') continue;
      slots--;
      uploadOne(item.localId, item.file, item.kind);
    }
  };

  /** 移除附件：中止上传、释放 object URL，不影响其他附件 */
  const removeUpload = (localId: string) => {
    const item = uploadsRef.current.find((u) => u.localId === localId);
    if (!item) return;
    item.controller?.abort();
    revokePreview(item);
    const next = uploadsRef.current.filter((u) => u.localId !== localId);
    uploadsRef.current = next;
    setUploads(next);
    // 有名额空出：把排在后面的 queued 文件推上去
    promoteQueued();
  };

  /** 取消正在上传的附件（保留在列表里，可重试） */
  const cancelUpload = (localId: string) => {
    haptic();
    uploadsRef.current.find((u) => u.localId === localId)?.controller?.abort();
  };

  /** 重试失败/取消的附件 */
  const retryUpload = (localId: string) => {
    const item = uploadsRef.current.find((u) => u.localId === localId);
    if (!item) return;
    haptic();
    // 先回到队列，由统一调度器决定是否有并发槽位，避免重试绕过上限。
    updateUpload(item.localId, { state: 'queued', percent: null, error: '' });
    promoteQueued();
  };

  // 卸载时中止在途上传并释放 object URL：避免离开页面后仍占着网络与内存
  useEffect(() => {
    return () => {
      for (const item of uploadsRef.current) {
        item.controller?.abort();
        if (item.previewUrl !== null) URL.revokeObjectURL(item.previewUrl);
      }
      uploadsRef.current = [];
    };
  }, []);

  const send = () => {
    const content = draft.trim();
    // 已就绪的附件才能随消息提交；在途/失败/取消的附件不进 payload。
    const readyMedia = uploads.filter((u) => u.state === 'ready' && u.mediaId !== null);
    const mediaIds = readyMedia.map((u) => u.mediaId as string);
    const inFlight = uploads.some((u) => u.state === 'uploading' || u.state === 'queued');
    // 纯媒体消息允许发送（服务端接受空正文 + 至少一个附件）；
    // 文本为空且没有就绪附件时才无意义。
    if ((!content && mediaIds.length === 0) || busy || me === null) return;
    // 还有附件在传输中：直接拦住（而不是先发文本再把在途附件默默丢掉）。
    // 文本能力本身不回归：“没有任何附件时的纯文本发送”永远是直发路径。
    if (inFlight) {
      setError(t('chat.uploading', { percent: 0 }));
      return;
    }
    haptic();
    // 乐观更新：立即把临时消息放进列表（微信式即时发送手感），
    // 服务器确认后用真实消息替换；失败回滚（移除临时 + 恢复草稿 + 报错）。
    // 临时 id 用 Date.now()（远大于自增 id，不会被 mergeById 的 200 条截断丢出列表）。
    const sendRevision = draftRevisionRef.current;
    const tempId = Date.now();
    const tempMedia: ChatMedia[] = readyMedia.map((u) => ({
      id: u.mediaId as string,
      kind: u.kind,
      ...(u.file.type ? { mime_type: u.file.type } : {}),
      byte_size: u.file.size,
      original_name: u.file.name,
    }));
    const temp: ChatMessage = {
      id: tempId,
      sender_id: me?.id ?? 0,
      sender_name: me?.username ?? '',
      recipient_id: null,
      content,
      tags,
      created_at: new Date().toISOString(),
      media: tempMedia,
      pending: true,
    };
    setDraft('');
    setTags([]);
    setBusy(true);
    setError('');
    setMessages((prev) => mergeById(prev, [temp]));
    atBottomRef.current = true; // 发送后强制滚到底部
    // 投递口径（Discussion #6）：主用户显式选择广播或收件人；
    // 子用户不携带收件人字段，服务端默认私信主用户。
    const payload: Record<string, unknown> = { content, tags };
    if (mediaIds.length > 0) payload.mediaIds = mediaIds;
    if (me?.role === 'admin') {
      if (to === 'broadcast') payload.broadcast = true;
      else payload.recipientId = to;
    }
    fetch('/gateway/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.ok) {
          const m = normalizeMessage(d.message ?? null);
          setMessages((prev) => {
            const base = prev.filter((p) => p.id !== tempId);
            return m ? mergeById(base, [m]) : base;
          });
          // 附件已随消息提交：清空本地列表并释放预览 URL
          for (const item of readyMedia) revokePreview(item);
          const next = uploadsRef.current.filter((u) => u.state !== 'ready');
          uploadsRef.current = next;
          setUploads(next);
        } else {
          setMessages((prev) => prev.filter((p) => p.id !== tempId));
          if (draftRevisionRef.current === sendRevision) {
            setDraft(content);
            setTags(tags);
          }
          // 发送失败：媒体未授权时网关回 FORBIDDEN（媒体上下文口径）
          setError(chatErrText(d, t('chat.sendFailed'), tr, mediaIds.length > 0));
        }
      })
      .catch(() => {
        setMessages((prev) => prev.filter((p) => p.id !== tempId));
        if (draftRevisionRef.current === sendRevision) {
          setDraft(content);
          setTags(tags);
        }
        setError(t('chat.sendFailed'));
      })
      .finally(() => setBusy(false));
  };

  const toggleTag = (tag: string) => {
    haptic();
    draftRevisionRef.current += 1;
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  // 偏好关闭时不渲染 FAB/面板；轮询 effect 同步停用（不留后台请求或未读计数）。
  if (chatEntry !== 'on') return null;

  return (
    <>
      <button
        ref={fabButtonRef}
        type="button"
        className={'dshpw-chat-fab' + (shaking ? ' shaking' : '') + (dragging ? ' dragging' : '') + (fabHidden ? ' dshpw-chat-fab-hidden' : '')}
        style={{ left: fabPos.left, top: fabPos.top, bottom: 'auto' }}
        aria-label={t('chat.open')}
        aria-hidden={fabHidden || undefined}
        tabIndex={fabHidden ? -1 : 0}
        title={`${t('chat.open')} · ${t('chat.dragHint')}`}
        onClick={openPanel}
        onMouseDown={onFabMouseDown}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      >
        <span className="dshpw-chat-fab-inner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-4 4v-4H7a3 3 0 0 1-3-3V6z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          {unread > 0 && (
            <span className="dshpw-chat-badge" key={unread}>
              {unread > 99 ? '99+' : String(unread)}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          className={'dshpw-chat-backdrop' + (closing ? ' closing' : '')}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={t('chat.title')}
        >
          <div ref={panelRef} className={'dshpw-chat-panel' + (closing ? ' closing' : '')} onClick={(e) => e.stopPropagation()}>
            <div className="dshpw-chat-header">
              <span className="dshpw-chat-title">{t('chat.title')}</span>
              <button ref={closeButtonRef} type="button" className="dshpw-chat-close" aria-label={t('chat.close')} onClick={close}>
                ×
              </button>
            </div>

            <div className="dshpw-chat-list" ref={listRef} onScroll={onListScroll}>
              {messages.length === 0 && <div className="dshpw-chat-empty">{t('chat.empty')}</div>}
              {messages.map((m) => {
                const mine = me ? m.sender_id === me.id : false;
                const name = mine ? t('chat.you') : m.sender_name;
                // 头像首字母：自己用登录用户名，对方用 sender_name
                const avatarName = mine ? me?.username || name : m.sender_name;
                const initial = (avatarName || '?').trim().slice(0, 1).toUpperCase();
                return (
                  <div
                    key={m.id}
                    className={'dshpw-chat-msg' + (mine ? ' mine' : '') + (m.pending ? ' pending' : '')}
                  >
                    {/* 微信式头像：对方按名字哈希取色，自己用品牌色（CSS 默认，不写内联） */}
                    <div
                      className="dshpw-chat-avatar"
                      style={mine ? undefined : { background: avatarColor(m.sender_name) }}
                    >
                      {initial}
                    </div>
                    {/* 昵称+时间在气泡外（微信式）：自己消息只显示时间、不显示昵称 */}
                    <div className="dshpw-chat-main">
                      <div className="dshpw-chat-meta">
                        {!mine && <span className="dshpw-chat-author">{name}</span>}
                        <span className="dshpw-chat-time">{fmtTime(m.created_at)}</span>
                      </div>
                      <div className="dshpw-chat-bubble">
                        {/* 附件渲染：仅 img/video，src 一律由不透明媒体 ID 拼成；
                            绝不用 dangerouslySetInnerHTML，也不渲染 SVG/HTML。 */}
                        {(m.media ?? []).length > 0 && (
                          <div className="dshpw-chat-media">
                            {(m.media ?? []).map((media) => (
                              <a
                                key={media.id}
                                className={'dshpw-chat-media-item ' + media.kind}
                                href={mediaSrc(media)}
                                target="_blank"
                                rel="noreferrer noopener"
                                title={media.original_name || t('chat.mediaPreviewAlt')}
                              >
                                {media.kind === 'video' ? (
                                  <video
                                    className="dshpw-chat-media-el"
                                    src={mediaSrc(media)}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    aria-label={media.original_name || t('chat.mediaVideo')}
                                  />
                                ) : (
                                  <img
                                    className="dshpw-chat-media-el"
                                    src={mediaSrc(media)}
                                    alt={media.original_name || t('chat.mediaPreviewAlt')}
                                    loading="lazy"
                                    decoding="async"
                                    {...(media.width && media.height
                                      ? { width: media.width, height: media.height }
                                      : {})}
                                  />
                                )}
                              </a>
                            ))}
                          </div>
                        )}
                        {/* 纯媒体消息：content 为空时不渲染空文本行 */}
                        {m.content !== '' && <div className="dshpw-chat-content">{m.content}</div>}
                        {m.tags.length > 0 && (
                          <div className="dshpw-chat-tags">
                            {m.tags.map((tag) => (
                              <span className="dshpw-chat-tag" key={tag}>
                                {tagDisplay(tag, tr)}
                              </span>
                            ))}
                          </div>
                        )}
                        {m.pending && (
                          <span className="dshpw-chat-pending" aria-label={t('chat.sending')}>
                            <i />
                            <i />
                            <i />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className={'dshpw-chat-composer' + (dragActive ? ' drag-active' : '')}
              onDragEnter={(e) => {
                if (!mediaEnabled || !e.dataTransfer?.types?.includes('Files')) return;
                e.preventDefault();
                dragDepth.current += 1;
                setDragActive(true);
              }}
              onDragOver={(e) => {
                // 必须 preventDefault 才能在 onDrop 里拿到文件（浏览器默认行为是打开文件）
                if (!mediaEnabled || !e.dataTransfer?.types?.includes('Files')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={() => {
                if (!dragActive) return;
                // 子元素之间移动也会触发 dragleave：用计数避免闪烁
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragActive(false);
              }}
              onDrop={(e) => {
                dragDepth.current = 0;
                setDragActive(false);
                if (!mediaEnabled) return;
                const files = Array.from(e.dataTransfer?.files ?? []);
                if (files.length === 0) return;
                e.preventDefault();
                addFiles(files);
              }}
            >
              {/* 待发送附件：预览 + 进度 + 取消/重试/移除 */}
              {uploads.length > 0 && (
                <div className="dshpw-chat-attachments">
                  {uploads.map((u) => (
                    <div className={'dshpw-chat-attachment ' + u.state} key={u.localId}>
                      <div className="dshpw-chat-thumb">
                        {u.previewUrl !== null ? (
                          <img src={u.previewUrl} alt={u.file.name} />
                        ) : (
                          <span className="dshpw-chat-thumb-video" aria-hidden="true">▶</span>
                        )}
                        {u.state === 'uploading' && u.percent !== null && (
                          <span className="dshpw-chat-thumb-progress" style={{ width: `${u.percent}%` }} />
                        )}
                      </div>
                      <div className="dshpw-chat-attachment-main">
                        <span className="dshpw-chat-attachment-name" title={u.file.name}>
                          {u.file.name}
                        </span>
                        <span className="dshpw-chat-attachment-state">
                          {u.state === 'queued'
                            ? t('chat.uploadQueued')
                            : u.state === 'uploading'
                              ? t('chat.uploading', { percent: u.percent ?? 0 })
                              : u.state === 'ready'
                                ? t('chat.uploadDone')
                                : u.state === 'canceled'
                                  ? t('chat.mediaCanceled')
                                  : u.error || t('chat.mediaFailed')}
                        </span>
                      </div>
                      <div className="dshpw-chat-attachment-actions">
                        {u.state === 'uploading' && (
                          <button
                            type="button"
                            className="dshpw-chat-attachment-btn"
                            onClick={() => cancelUpload(u.localId)}
                            aria-label={t('chat.uploadCancel')}
                            title={t('chat.uploadCancel')}
                          >
                            ×
                          </button>
                        )}
                        {(u.state === 'failed' || u.state === 'canceled') && (
                          <button
                            type="button"
                            className="dshpw-chat-attachment-btn"
                            onClick={() => retryUpload(u.localId)}
                            aria-label={t('chat.uploadRetry')}
                            title={t('chat.uploadRetry')}
                          >
                            ↻
                          </button>
                        )}
                        <button
                          type="button"
                          className="dshpw-chat-attachment-btn"
                          onClick={() => removeUpload(u.localId)}
                          aria-label={t('chat.uploadRemove')}
                          title={t('chat.uploadRemove')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="dshpw-chat-tags">
                {PRESET_TAGS.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className={'dshpw-chat-tagbtn' + (tags.includes(tag) ? ' active' : '')}
                    onClick={() => toggleTag(tag)}
                  >
                    {tagDisplay(tag, tr)}
                  </button>
                ))}
              </div>
              {me?.role === 'admin' && (
                <div className="dshpw-chat-to">
                  <span className="dshpw-chat-to-label">{t('chat.to')}</span>
                  <select
                    className="dshpw-chat-to-select"
                    value={to === 'broadcast' ? 'broadcast' : String(to)}
                    aria-label={t('chat.to')}
                    onChange={(e) =>
                      setTo(e.target.value === 'broadcast' ? 'broadcast' : Number(e.target.value))
                    }
                  >
                    <option value="broadcast">{t('chat.toBroadcast')}</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.username}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="dshpw-chat-inputrow">
                <input
                  className="dshpw-chat-input"
                  value={draft}
                  placeholder={t('chat.placeholder')}
                  autoComplete="off"
                  name="dshpw-chat-draft"
                  onChange={(e) => {
                    draftRevisionRef.current += 1;
                    setDraft(e.target.value);
                  }}
                  onPaste={(e) => {
                    // 粘贴图片/视频（最多见的表情包入口）：仅当媒体权限开启时才接手，
                    // 权限关闭时保留默认文本粘贴行为。
                    if (!mediaEnabled) return;
                    const files = Array.from(e.clipboardData?.files ?? []);
                    if (files.length === 0) return;
                    e.preventDefault();
                    addFiles(files);
                  }}
                  onKeyDown={(e) => {
                    // IME 组合输入中 Enter 用于确认候选词：不发送、也不阻止默认上屏
                    // （keyCode 229 兜底 isComposing 缺失/为 false 的旧浏览器）
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                {/* 媒体入口：权限关闭时保持可见但禁用，并给出原因 */}
                <button
                  type="button"
                  className="dshpw-chat-attach"
                  disabled={!mediaEnabled || busy}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={mediaEnabled ? t('chat.attach') : t('chat.attachDisabled')}
                  title={mediaEnabled ? t('chat.attach') : t('chat.attachDisabled')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  className="dshpw-chat-file"
                  type="file"
                  accept={MEDIA_ACCEPT}
                  multiple
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    // 清空 value：同一文件再次选择也能触发 change
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="dshpw-chat-send"
                  disabled={busy || (!draft.trim() && uploads.every((u) => u.state !== 'ready')) || me === null}
                  onClick={send}
                  aria-label={t('chat.send')}
                  title={
                    !draft.trim() && uploads.every((u) => u.state !== 'ready')
                      ? t('chat.mediaOnlySend')
                      : t('chat.send')
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
                  </svg>
                </button>
              </div>
              {error && <div className="dshpw-chat-error">{error}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── 聊天面板样式：跟随 dsh 设计令牌，主题自动适配 ───────────────
const CHAT_CSS = `
.dshpw-chat-fab{position:fixed;z-index:2147483000;width:36px;height:36px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:transform .18s,box-shadow .18s,background .18s,opacity .18s,visibility .18s;pointer-events:auto;animation:dshpwFabIn .4s cubic-bezier(.34,1.56,.64,1)}
/* 拖动中禁用过渡（位置跟手）；:not(隐藏) 保证同时命中隐藏类时不会用 transition:none 压掉淡出 */
.dshpw-chat-fab.dragging:not(.dshpw-chat-fab-hidden){transition:none;cursor:grabbing;opacity:.85}
/* 面板打开：入口淡出退场，不可点击（pointer-events）/不可键盘聚焦（visibility + tabIndex/aria）。
   visibility 参与过渡：淡出期间仍可见（可见性在 (0,1) 按 visible 插值），动画结束才真正隐藏。
   类名带 dshpw-chat-fab- 前缀，避免与宿主/其他样式的通用 .hidden 冲突；规则置于 .dragging
   之后并显式声明 transition，即使拖动状态残留也能正常淡出。 */
.dshpw-chat-fab.dshpw-chat-fab-hidden{opacity:0;pointer-events:none;visibility:hidden;transition:opacity .18s,visibility .18s}
.dshpw-chat-fab:hover{transform:scale(1.05);background:var(--dsw-alias-interactive-bg-hover);box-shadow:0 4px 12px rgba(0,0,0,.25)}
.dshpw-chat-fab:active{transform:scale(.88)}
.dshpw-chat-fab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshpw-chat-fab.shaking{animation:dshpwShake .5s ease}
.dshpw-chat-fab-inner{position:relative;display:flex}
.dshpw-chat-badge{position:absolute;top:-12px;right:-9px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;line-height:16px;text-align:center;font-weight:600;box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2);animation:dshpwBadgePop .3s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-backdrop{position:fixed;inset:0;z-index:2147482990;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(10px) saturate(.9);-webkit-backdrop-filter:blur(10px) saturate(.9);animation:dshpwChatFadeIn .2s ease;transition:opacity .18s ease}
.dshpw-chat-backdrop.closing{opacity:0;pointer-events:none}
.dshpw-chat-panel{display:flex;flex-direction:column;width:min(680px,calc(100vw - 48px));height:min(640px,calc(100vh - 96px));border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden;animation:dshpwChatPanelIn .28s cubic-bezier(.34,1.56,.64,1);transition:opacity .18s ease,transform .18s ease}
.dshpw-chat-panel.closing{opacity:0;transform:translateY(10px) scale(.98)}
.dshpw-chat-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dshpw-chat-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshpw-chat-close{width:28px;height:28px;border:0;border-radius:8px;background:none;color:var(--dsw-alias-label-tertiary);font-size:20px;line-height:1;cursor:pointer;transition:background .15s,color .15s,transform .15s}
.dshpw-chat-close:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);transform:rotate(90deg)}
.dshpw-chat-close:active{transform:scale(.85) rotate(45deg)}
/* 微信式消息列表：浅灰底、头像+气泡两列 */
.dshpw-chat-list{flex:1;overflow-y:auto;padding:14px 14px 16px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-layer-1);scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent;scroll-behavior:smooth;overscroll-behavior:contain}
.dshpw-chat-list::-webkit-scrollbar{width:8px}
.dshpw-chat-list::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:999px}
.dshpw-chat-list::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-tertiary)}
.dshpw-chat-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center;margin:auto;display:flex;flex-direction:column;align-items:center;gap:8px}
.dshpw-chat-empty::before{content:'';width:40px;height:40px;border-radius:50%;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);background-image:radial-gradient(circle at 30% 38%,var(--dsw-alias-label-tertiary) 1.5px,transparent 1.6px),radial-gradient(circle at 50% 38%,var(--dsw-alias-label-tertiary) 1.5px,transparent 1.6px),radial-gradient(circle at 70% 38%,var(--dsw-alias-label-tertiary) 1.5px,transparent 1.6px);opacity:.6}
.dshpw-chat-msg{display:flex;gap:8px;align-items:flex-start;max-width:100%;animation:dshpwMsgIn .32s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-msg.mine{flex-direction:row-reverse;animation:dshpwMsgMineIn .32s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-avatar{flex-shrink:0;width:32px;height:32px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted,#fff);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.15);transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-msg:hover .dshpw-chat-avatar{transform:scale(1.08)}
/* 昵称+时间在气泡外（微信式）：内容列 = meta + 气泡 */
.dshpw-chat-main{display:flex;flex-direction:column;gap:4px;align-items:flex-start;max-width:min(78%,calc(100% - 44px));min-width:0}
.dshpw-chat-msg.mine .dshpw-chat-main{align-items:flex-end}
.dshpw-chat-bubble{position:relative;max-width:100%;padding:8px 12px;border-radius:12px;border-top-left-radius:4px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.dshpw-chat-msg.mine .dshpw-chat-bubble{border-radius:12px;border-top-right-radius:4px;background:var(--dsw-alias-brand-primary);border-color:transparent;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.dshpw-chat-msg.pending .dshpw-chat-bubble{opacity:.92}
/* 微信式小尾巴：旋转 45° 的小方块，颜色随气泡 */
.dshpw-chat-bubble::before{content:'';position:absolute;top:9px;left:-5px;width:9px;height:9px;transform:rotate(45deg);background:inherit;border-left:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2);border-top:0;border-right:0}
.dshpw-chat-msg.mine .dshpw-chat-bubble::before{left:auto;right:-5px;border-left:0;border-bottom:0;border-top:0;border-right:0}
.dshpw-chat-meta{display:flex;align-items:baseline;gap:6px;padding:0 2px}
.dshpw-chat-author{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dshpw-chat-time{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dshpw-chat-content{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.dshpw-chat-msg.mine .dshpw-chat-content{color:var(--dsw-alias-label-primary-inverted,#fff)}
.dshpw-chat-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.dshpw-chat-tag{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dshpw-chat-msg.mine .dshpw-chat-tag{border-color:color-mix(in srgb,var(--dsw-alias-label-primary-inverted,#fff) 45%,transparent);color:var(--dsw-alias-label-primary-inverted,#fff)}
/* 发送中三点跳动 */
.dshpw-chat-pending{display:inline-flex;gap:3px;align-items:center;margin-top:6px;height:6px}
.dshpw-chat-pending i{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary);animation:dshpwPendingBounce .9s ease-in-out infinite}
.dshpw-chat-msg.mine .dshpw-chat-pending i{background:color-mix(in srgb,var(--dsw-alias-label-primary-inverted,#fff) 70%,transparent)}
.dshpw-chat-pending i:nth-child(2){animation-delay:.15s}
.dshpw-chat-pending i:nth-child(3){animation-delay:.3s}
.dshpw-chat-composer{border-top:1px solid var(--dsw-alias-border-l2);padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-2)}
.dshpw-chat-tagbtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 10px;font-size:11px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:border-color .15s,color .15s,background .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-tagbtn:hover{transform:translateY(-1px)}
.dshpw-chat-tagbtn:active{transform:scale(.85)}
.dshpw-chat-tagbtn.active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);animation:dshpwTagPop .3s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-inputrow{display:flex;gap:8px;align-items:center}
.dshpw-chat-input{flex:1;box-sizing:border-box;min-width:0;padding:9px 14px;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:18px;outline:none;transition:border-color .15s,box-shadow .15s}
.dshpw-chat-input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dshpw-chat-to{display:flex;align-items:center;gap:8px}
.dshpw-chat-to-label{font-size:12px;color:var(--dsw-alias-label-tertiary);flex-shrink:0}
.dshpw-chat-to-select{flex:1;min-width:0;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;cursor:pointer;transition:border-color .15s}
.dshpw-chat-to-select:focus{border-color:var(--dsw-alias-brand-primary)}
/* 消息附件：表情包/图片/视频。纯媒体消息不渲染空文本行。 */
.dshpw-chat-media{display:flex;flex-direction:column;gap:6px;margin-bottom:4px}
.dshpw-chat-media:last-child{margin-bottom:0}
.dshpw-chat-media-item{display:block;line-height:0;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.04);text-decoration:none}
.dshpw-chat-media-el{display:block;max-width:220px;max-height:260px;width:auto;height:auto;border-radius:10px;object-fit:contain}
/* 表情包按内联尺寸渲染，避免小图被拉大变形 */
.dshpw-chat-media-item.sticker .dshpw-chat-media-el{max-width:120px;max-height:120px}
.dshpw-chat-media-item.video .dshpw-chat-media-el{max-width:260px;background:#000}
.dshpw-chat-media-item:hover .dshpw-chat-media-el{filter:brightness(1.04)}
/* 待发送附件栏 */
.dshpw-chat-attachments{display:flex;flex-direction:column;gap:6px;max-height:168px;overflow-y:auto;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);scrollbar-width:thin;animation:dshpwErrIn .22s ease}
.dshpw-chat-attachment{display:flex;align-items:center;gap:8px;min-width:0}
.dshpw-chat-thumb{position:relative;flex-shrink:0;width:34px;height:34px;border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;align-items:center;justify-content:center}
.dshpw-chat-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.dshpw-chat-thumb-video{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dshpw-chat-thumb-progress{position:absolute;left:0;bottom:0;height:3px;background:var(--dsw-alias-brand-primary);transition:width .18s ease}
.dshpw-chat-attachment-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dshpw-chat-attachment-name{font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshpw-chat-attachment-state{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dshpw-chat-attachment.failed .dshpw-chat-attachment-state{color:var(--dsw-alias-state-error-primary,#ef4444)}
.dshpw-chat-attachment-actions{display:flex;gap:2px;flex-shrink:0}
.dshpw-chat-attachment-btn{appearance:none;border:0;width:22px;height:22px;border-radius:6px;background:none;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1;cursor:pointer;transition:background .15s,color .15s}
.dshpw-chat-attachment-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
/* 拖拽落区提示 */
.dshpw-chat-composer.drag-active{outline:2px dashed var(--dsw-alias-brand-primary);outline-offset:-4px}
.dshpw-chat-attach{appearance:none;border:1px solid var(--dsw-alias-border-l2);width:34px;height:34px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .15s,color .15s,opacity .15s}
.dshpw-chat-attach:hover:not(:disabled){transform:scale(1.08);color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dshpw-chat-attach:active:not(:disabled){transform:scale(.85)}
.dshpw-chat-attach:disabled{opacity:.35;cursor:not-allowed}
/* 原生 file input 只作为触发器（无样式、不可聚焦、屏幕阅读器隐藏——由按钮代理） */
.dshpw-chat-file{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
/* 圆形纸飞机发送按钮 */
.dshpw-chat-send{appearance:none;border:0;width:34px;height:34px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted,#fff);cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15);transition:transform .2s cubic-bezier(.34,1.56,.64,1),filter .15s,opacity .15s,box-shadow .15s}
.dshpw-chat-send svg{display:block;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.dshpw-chat-send:hover:not(:disabled){transform:scale(1.08) rotate(-8deg);filter:brightness(1.06);box-shadow:0 4px 10px rgba(0,0,0,.2)}
.dshpw-chat-send:active:not(:disabled){transform:scale(.8)}
.dshpw-chat-send:active:not(:disabled) svg{transform:translateX(1px) scale(.9)}
.dshpw-chat-send:disabled{opacity:.35;cursor:default;box-shadow:none}
.dshpw-chat-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#ef4444);animation:dshpwErrIn .22s ease}
@keyframes dshpwFabIn{from{opacity:0;transform:scale(0) rotate(-90deg)}to{opacity:1;transform:none}}
@keyframes dshpwChatFadeIn{from{opacity:0}to{opacity:1}}
@keyframes dshpwChatPanelIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes dshpwMsgIn{from{opacity:0;transform:translateX(-14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes dshpwMsgMineIn{from{opacity:0;transform:translateX(14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes dshpwPendingBounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-3px);opacity:1}}
@keyframes dshpwBadgePop{from{transform:scale(.3);opacity:0}60%{transform:scale(1.25)}to{transform:scale(1);opacity:1}}
@keyframes dshpwTagPop{0%{transform:scale(1)}50%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes dshpwErrIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@keyframes dshpwShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@media (prefers-reduced-motion:reduce){.dshpw-chat-fab,.dshpw-chat-panel,.dshpw-chat-backdrop,.dshpw-chat-msg,.dshpw-chat-badge,.dshpw-chat-pending i,.dshpw-chat-send,.dshpw-chat-attach,.dshpw-chat-attachments,.dshpw-chat-thumb-progress,.dshpw-chat-tagbtn,.dshpw-chat-avatar,.dshpw-chat-close,.dshpw-chat-error{animation:none!important;transition:none!important}}
`;

if (typeof document !== 'undefined') {
  const el = document.createElement('style');
  el.textContent = CHAT_CSS;
  document.head.appendChild(el);
}
