// The settings card's strings Tracy rebrands (invariant I2), over upstream's
// `src/client/locales.ts`. Kept here, not in the client folder, because upstream's card is not
// edited; a four-line hook at the end of that file lays this table over it (TRACY-FORK.md §3).
// The fork's ninth string, `subHint`, is gone: upstream 2.7.7 dropped the key.
export const CLIENT_BRAND: { readonly zh: Readonly<Record<string, string>>; readonly en: Readonly<Record<string, string>> } = {
  zh: {
    sectionDesc: 'Tracy 登录网关的设置与账号管理。',
    permsAgentPresetsUnavailable: 'Agent 模式暂不可用，请检查 Tracy preset registry。',
    sandboxNone: '不限制（跟随 Tracy 默认）',
    'err.NOT_CONFIGURED': '未配置：请先完成 dsh-passwords 部署（.env 中 SETUP_KEY 等），再重启 Tracy',
  },
  en: {
    sectionDesc: 'Tracy login gateway settings and account management.',
    permsAgentPresetsUnavailable: 'Agent modes are temporarily unavailable; check the Tracy preset registry.',
    sandboxNone: 'No restriction (Tracy default)',
    'err.NOT_CONFIGURED': 'Not configured: finish the dsh-passwords deployment first (SETUP_KEY etc. in .env), then restart Tracy',
  },
};

// Upstream's Chinese card text with the terms Tracy keeps in English in every language
// (docs/references/i18n.md §5, Brian 05/10/2026). zh only: upstream's English already keeps them.
export const CLIENT_KEPT_TERMS: { readonly zh: Readonly<Record<string, string>> } = {
  zh: {
    purgeWarning: '此操作会停止 DSH，并永久删除 DSH、dsh-passwords、配置、session、workspace 数据、媒体和证书，无法恢复。',
    chatToggle: 'Chat 入口',
    chatToggleDesc: '显示可拖动的 chat 气泡',
    chatToggleSaved: 'Chat 入口已更新',
    updateAutoDownloading: '自动 download 中（<= 1 MiB/s）',
    updateDownloadPrepare: 'Download 并准备安装',
    updateDownloadStarted: 'Download 已开始，完成后请再次点击立即安装',
    updateDownloadReadyConfirm: 'Download 完成，请再次点击立即安装',
    pwChanged: '密码已修改（若改的是自己，其他设备上的 session 已全部失效）',
    pickerDelAria: '删除 folder',
    dlFile: 'Download 到本地',
    dlDenied: '未开启 file download 或 folder 越权',
    dlFailed: 'Download 失败',
    dlStarted: '已开始 download',
    'chat.open': '打开 chat',
    'chat.attachDisabled': '当前账号未开启 chat 媒体权限',
    'chat.mediaPick': '选择 file',
    'chat.mediaHint': '可拖拽 file 到输入框，或直接粘贴图片',
    'chat.uploadQueued': '等待 upload',
    'chat.uploadCancel': '取消 upload',
    'chat.uploadRetry': '重试 upload',
    'chat.mediaFailed': 'Upload 失败',
    'chat.mediaCanceled': '已取消 upload',
    'chat.mediaUnsupported': '不支持的 file 类型（仅表情包 / 图片 / 视频）',
    'chat.mediaTooLarge': 'File 过大（{name}）',
    'chat.mediaPreviewAlt': '附件 preview',
    permsModels: '可用 model',
    permsModelsUnrestricted: '不限制 model',
    permsModelsHint: '勾选允许的 model；取消“不限制 model”才能逐项选择。',
    permsModelsDenyAll: '未勾选任何 model：该子用户不可使用任何 model。',
    permsModelsUnavailable: 'Model 目录暂不可用，请检查 dsh LLM registry。',
    permsModelsStale: '该 model 已不在当前目录中，仍保留为禁用项（不会静默放宽）。',
    permsChatMedia: 'Chat 媒体权限',
    permsHint: '为每个子用户设置 workspace、session 和使用限制。',
    permsFolders: 'Workspace 与 session',
    permsWorkspaceCreate: '新建 workspace 权限',
    permsNoWorkspaces: '暂无 workspace；每次打开此页面会重新查询。',
    permsNoSessions: '此 workspace 暂无活动 session',
    permsUpload: '大 file upload.',
    permsGit: '允许 git download',
    permsSandboxRevoked: '权限已保存；{count} 个 session 因 sandbox 策略未能同步，授权已撤销',
    permsSessionConflict: 'Session 授权已被其他操作更新，已同步最新状态，请确认后再保存',
    permsDisabledConflict: '禁用 session 列表已被其他操作更新，已同步最新状态，请确认后再保存',
    permsSandbox: 'Sandbox 权限',
    sandboxWorkspace: '可写 workspace',
    'err.INVALID_TOKEN': 'Session 无效或已过期',
    'err.NOT_AUTHENTICATED': '未登录或 session 已失效',
    'err.SESSION_GRANTS_CONFLICT': 'Session 授权已被其他操作更新，请刷新后重试',
    'err.DISABLED_SESSIONS_CONFLICT': '禁用 session 列表已被其他操作更新，请刷新后重试',
    'err.FORBIDDEN_CSRF': '请求被拒绝（cross-site 伪造防护）',
    'err.FORBIDDEN_MEDIA': '未开启 chat 媒体权限',
    'err.INVALID_NAME': 'File 名非法',
    'err.TOO_LARGE': '媒体 file 超过大小上限',
    'err.MEDIA_QUOTA': '未发送的媒体 file 过多，请先发送或等待过期',
    'err.MEDIA_BUSY': '并发 upload 过多，请稍后再试',
    'err.MEDIA_CONFLICT': 'Upload 标识冲突，请重试',
    'err.MEDIA_STATE': 'Upload 状态已失效，请重新 upload',
  },
};

/** What the card reads over upstream's tables: the kept terms, then the Tracy names on top. */
export const CLIENT_STRINGS: { readonly zh: Readonly<Record<string, string>>; readonly en: Readonly<Record<string, string>> } = {
  zh: { ...CLIENT_KEPT_TERMS.zh, ...CLIENT_BRAND.zh },
  en: { ...CLIENT_BRAND.en },
};
