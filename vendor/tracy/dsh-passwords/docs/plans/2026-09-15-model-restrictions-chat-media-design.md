# dsh-passwords 模型限制与聊天媒体设计

日期：2026-09-15
状态：已批准，进入本轮实现与测试

## 目标

本轮实现两个彼此独立的能力：

1. 主用户按子用户限制 DSH 可用模型。
2. 全局消息/留言支持微信式表情包、图片和视频，同时保留既有文本消息、广播和私信行为。

两项能力都必须后端强制执行。前端隐藏控件不能作为授权边界。

## 模型限制

在 `user_permissions` 增加 `allowed_models` JSON 字段，语义与 Agent preset 一致：

- `NULL`：不限制，兼容全部现有用户。
- `[]`：禁止所有模型。
- 非空数组：只允许稳定 ID `provider/model`。

模型目录来自 DSH 官方 `session/modelCatalog` RPC；网关不硬编码厂商显示名称。主用户权限界面显示模型 ID/名称并保存 allowlist，失效模型保留为不可用项而不是静默放宽。

子用户请求必须在以下边界校验：

- `session/modelCatalog`：返回结果按 allowlist 过滤，避免前端看到不可用模型。
- `session/selectModel`：provider/model 不在 allowlist 时 403。
- `session/create`：请求中有模型时校验；无模型时保持 DSH 默认选择，但受限用户在模型未知时不得借此绕过后续校验。
- `session/fork`：继承模型时校验父会话当前模型。
- `session/prompt` 及模型实际调用相关请求：使用网关登记的会话模型状态再次校验，权限收紧后旧会话不能继续使用被撤销模型。

主用户不受模型 allowlist 限制。旧用户与新用户默认 `NULL`，不改变当前行为。每次权限变更写入审计详情，但不记录密钥或完整请求内容。

## 聊天媒体

新增独立 `allow_chat_media` 权限，不能复用 `allow_upload`。原因是 `allow_upload` 当前表示 DSH 大请求体/官方文件上传档位；复用会让 DSH 文件权限意外授予聊天视频上传权限。默认关闭，主用户不受限制；文本消息不受影响。

新增媒体对象与消息关系：

- `media_assets`：所有者、随机存储键、原始名、类型、MIME、大小、哈希、尺寸/时长、状态、时间和过期时间。
- `message_media`：消息 ID、媒体 ID、顺序和可选说明。
- `messages` 保持现有文本字段；纯媒体消息使用空文本并至少关联一个媒体。

文件写入 `data/message-media/` 私有目录，文件名使用随机对象 ID，不使用用户路径或原始文件名。媒体访问使用不透明媒体 ID，每次按关联消息的可见性重新鉴权，不发永久公开 URL。

上传采用三步协议：

1. `POST /gateway/api/message-media/init`：校验登录、媒体权限、类型、大小、并发和配额，返回短期 upload ID/token。
2. `PUT /gateway/api/message-media/:id`：流式写临时文件，限制 Content-Length/实际字节、校验魔数和 MIME、计算 SHA-256，成功后转 ready。
3. `POST /gateway/api/messages`：接收 `mediaIds`，确认媒体属于当前用户、ready、未过期且未被占用，在消息与关系表中完成事务提交。

首轮允许：

- sticker：PNG/JPEG/WebP，必要时 GIF；单个 2 MiB。
- image：JPEG/PNG/WebP/GIF；单个 10 MiB。
- video：MP4/WebM；单个 100 MiB；不做服务器转码、不依赖 ffmpeg。

拒绝 SVG、HTML、XML、压缩包和可执行内容。视频读取支持 Range；图片/视频使用 `inline`、`nosniff`、`private/no-store`。未提交上传定时清理，用户删除时清理其媒体元数据和文件。

前端 composer 增加表情、图片、视频、上传进度、取消/重试和预览；消息气泡按 sticker/image/video 渲染。旧文本消息 JSON 形状继续可读。

## 非目标

本轮不做：公共表情包商城、第三方对象存储、服务器视频转码、自动抽帧、复杂断点续传、内容审核服务、改变 DSH 官方附件链路。

## 测试与部署

本地测试覆盖：旧文本兼容、模型 allow/deny、目录/会话/fork/prompt 绕过、媒体类型/魔数/大小/IDOR/消息可见性/Range/清理。完成本地 build 和全量测试后部署测试服务器，保留 `.env`、数据库、用户、会话和扩展，执行真实子用户 E2E，再由用户人工 review。
