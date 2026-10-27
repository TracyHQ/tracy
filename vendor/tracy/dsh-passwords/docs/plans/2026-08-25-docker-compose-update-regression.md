# Docker Compose 更新回归修复实施计划

> **给 Claude:** 生成 `task-builder` 代理逐任务实施此计划。

**目标:** 修复 2.6.3 中 Docker 应用内更新路径不可达的问题，恢复配置 `MCP_DSH_DOCKER_COMPOSE_DIR` 后的 Compose 更新能力，同时保证 npm/native 两阶段下载与安装工作流、用户数据和安全边界不被改变。

**架构:** Docker 运行时使用独立的 Compose 更新通道，不下载 npm tarball、不写入容器临时层。检查仍只从 GitHub Release 发现版本；确认更新后由宿主 Compose 执行 `docker compose pull`，再异步启动 `docker compose up -d`。由于更新的容器可能会杀掉当前更新进程，更新前持久化待重启版本，新的容器启动后依据运行版本清除待重启标记；当前进程仍存活时再执行限定服务名的 `docker compose ps` 校验。Docker 安装状态复用现有 `installing`/`restarting`/`error` 状态和设置页轮询，按钮立即返回 202/进行中反馈；npm/global/prefix/git 的 npm tarball 状态机保持现状。

**技术栈:** TypeScript、Node `node:test`、Express 插件路由、React/Preact 风格 `h()` 客户端、Docker Compose、Markdown 文档。

---

## 问题边界与不变约束

- `src/update.ts` 当前 `checkNowInternal()` 在 Docker 上故意跳过 npm 下载，这是正确行为，不能改成 Docker 下载 npm tarball。
- `performDockerInstall()` 已有 Compose pull/up/ps 实现，但当前 `applyNow()` 在 Docker 分支提前返回 `MANUAL_ONLY`，`tick()` 也只识别 `pendingVersion`，导致该函数不可达。
- native/npm/git 的现有流程必须保持：自动更新限速不超过 1 MiB/s；关闭自动更新时第一次下载、第二次安装；完整性校验和固定部署目录数据保留不回退。
- Docker 只有同时满足 `runtime === 'docker'` 且 `MCP_DSH_DOCKER_COMPOSE_DIR` 非空才允许应用内自动更新；未配置时继续 fail-closed，并给出明确手动 Compose 命令。
- Docker Compose 命令必须使用参数数组、`shell: false`、解析后的 compose 目录作为 cwd；不能把用户可控字符串拼接进 shell 命令。
- 每次代码修改完成后必须先在本地执行 `npm test` 和 `npm run build`，然后部署到原生 systemd 测试服务器；本次测试服务器仍保持 2.6.2 版本标识作为更新验收基线，不部署 Docker 并行服务。

## 任务 1: 增加 Docker 更新状态测试夹具

**并行:** no
**被阻塞:** 无
**拥有的文件:** `test/update.test.ts`

**文件:**
- 修改: `test/update.test.ts`

**步骤 1: 编写失败测试**

在现有 `setup()` 之后增加可注入 Docker 环境的测试夹具，至少覆盖：

```ts
function setupDocker(
  root: string,
  autoEnabled: boolean,
  nowRef: { value: number },
  composeResults?: { pull?: boolean; up?: boolean; ps?: boolean },
) {
  // 使用 DSH_PASSWORDS_RUNTIME=docker、MCP_DSH_DOCKER_COMPOSE_DIR=root/compose。
  // runCommand 记录 command/args/cwd，分别模拟 docker compose pull/up/ps。
  // restartWebService 不应被调用，Docker compose up 本身负责重启容器。
}
```

增加以下失败测试，测试必须检查命令参数和状态，而不只断言最终 `ok`：

1. **Docker 手动应用更新**
   - Docker 环境关闭自动更新，先 `checkNow()`。
   - `status().updateAvailable === true` 且 `phase === 'idle'`。
   - 第一次 `applyNow()` 应立即返回 `ok: true, code: 'INSTALL_STARTED', phase: 'installing'`，不应返回 `DOWNLOAD_STARTED`、`MANUAL_ONLY` 或调用 `fetchNpmMetadata`。
   - 后台任务记录的调用顺序必须是：
     - `docker compose pull`
     - `docker compose up -d`（或带 `--wait`）
     - `docker compose ps --status running --services dsh-passwords`
   - `runCommand` 的 cwd 必须等于解析后的 `MCP_DSH_DOCKER_COMPOSE_DIR`。
   - 成功后 `update_applied` 审计记录存在，`latestVersion` 更新，`restartWebService` 不被调用；测试夹具要模拟“up 后当前进程仍存活”和“up 后进程退出、由新实例恢复 pending”两种路径。

2. **Docker 自动安装路径**
   - Docker 环境开启自动更新，`checkNow({ downloadIfAllowed: true })` 只发现版本，不调用 npm metadata/download。
   - 时间推进到 `UPDATE_IDLE_MS`，调用 `tick()`。
   - tick 触发 Compose 更新，命令顺序和手动路径一致。
   - 页面可见状态至少经历 `installing`，成功后回到可查询的稳定状态，不产生 npm artifact。

3. **Docker pull/up/health 失败**
   - 分别让 pull、up、ps 返回失败。
   - 断言 `phase === 'error'`、`lastError` 包含对应的 Docker 错误；不写 `update_applied` 成功审计，不清除/伪造 npm 下载状态。
   - pull 失败不能执行 up；up 失败不能执行 ps。

4. **Docker 未配置 Compose 目录**
   - `autoInstallSupported === false`，`manualCommand` 返回 `docker compose pull && docker compose up -d`。
   - `applyNow()` 返回 `MANUAL_ONLY`，消息明确包含 Docker/Compose 手动操作提示。
   - 不调用任何 npm metadata/download 或 Docker 命令。

**步骤 2: 运行测试验证失败**

运行：

```bash
npm test -- --test-name-pattern="Docker"
```

预期：新增测试失败，原因应是 Docker `applyNow()` 仍在 `MANUAL_ONLY` 提前返回，或 Docker tick 未触发 `performDockerInstall()`。

**步骤 3: 检查失败测试的隔离性**

确认失败只来自 Docker 更新入口，不因 npm/native 既有测试、临时目录、环境变量或真实 Docker daemon 造成。测试不能依赖 Docker CLI、网络或服务器。

---

## 任务 2: 恢复 Docker Compose 状态机入口

**并行:** no
**被阻塞:** 任务 1
**拥有的文件:** `src/update.ts`

**文件:**
- 修改: `src/update.ts:500-620, 702-785, 1049-1119`

**步骤 1: 设计并实现 Docker 分支判定**

增加一个小型私有判定/辅助方法，保持单一入口，例如：

```ts
private dockerUpdateSupported(): boolean {
  return this.runtime === 'docker' && this.dockerComposeDir() !== null;
}
```

不要把 Docker 伪装成 npm runtime，也不要让 Docker 进入 `parseNpmPackageInfo()`、`startDownload()` 或 artifact 完整性流程。

**步骤 2: 修复 `applyNow()` 的分支顺序**

在 `applyNow()` 中，保留以下顺序：

1. 下载/安装互斥检查。
2. `restartPendingVersion` 恢复逻辑。
3. 安装冷却检查。
4. 如果存在 npm tarball `pendingVersion && phase === 'ready'`，继续现有 npm/native 安装。
5. 如果 runtime 是 Docker：
   - 必要时执行只发现版本的 `checkNow()`。
   - 比较 `latestVersion` 与当前版本。
   - 没有更新返回 `NO_UPDATE`。
   - 没有 compose 目录返回 `MANUAL_ONLY`，消息明确指向 `MCP_DSH_DOCKER_COMPOSE_DIR` 和手动 `docker compose pull && docker compose up -d`。
   - 已配置 compose 目录时启动独立的 Docker Compose 更新任务，不等待容器重建完成；立即返回 `INSTALL_STARTED` + `phase: installing`，由设置页轮询状态。任务由 `performInstallInternal()` 分派到 `performDockerInstall()`。
6. 其余 npm/global/prefix/git 继续当前手动下载/二次确认流程。

核心行为应等价于：

```ts
if (this.runtime === 'docker') {
  if (this.latestVersion === null) await this.checkNow();
  const cmp = this.latestVersion === null ? null : compareVersions(this.latestVersion, this.version);
  if (cmp === null || cmp <= 0) return { ok: false, code: 'NO_UPDATE', message: '当前已经是最新版本' };
  if (!this.dockerUpdateSupported()) {
    return { ok: false, code: 'MANUAL_ONLY', message: '未配置 Docker Compose 更新目录，请手动执行 docker compose pull && docker compose up -d' };
  }
  // performInstall() must be invoked without await: compose up may recreate this
  // very container and terminate the process that is serving this HTTP request.
  void this.performInstall().catch((error) => this.setError(error instanceof Error ? error.message : String(error)));
  return { ok: true, code: 'INSTALL_STARTED', message: 'Docker 更新已开始，容器将自动重启', phase: 'installing' };
}
```

`INSTALL_STARTED` 必须加入 `src/plugin.ts` 的进行中状态映射，返回 HTTP 202。

具体返回字段要沿用当前 `applyNow()` 类型和插件 202/422 映射，不引入新的 HTTP 状态码。

**步骤 3: 修复 `tick()` 的 Docker 自动更新入口**

当前 tick 只以 `pendingVersion !== null && phase === 'ready'` 作为安装条件。改为形成明确的 `dockerUpdateReady` 条件：

```ts
const dockerUpdateReady =
  this.runtime === 'docker' &&
  this.dockerComposeDir() !== null &&
  this.latestVersion !== null &&
  compareVersions(this.latestVersion, this.version) !== null &&
  compareVersions(this.latestVersion, this.version)! > 0;
```

自动安装条件改为：

```ts
const packageReady = this.pendingVersion !== null && this.phase === 'ready';
if (
  this.autoUpdateEnabled() &&
  !this.installRunning &&
  (packageReady || dockerUpdateReady) &&
  this.activityAgeMs() >= UPDATE_IDLE_MS &&
  now - this.lastApplyAt >= UPDATE_APPLY_COOLDOWN_MS
) {
  void this.performInstall().catch(...);
}
```

未配置 compose 目录时不能自动执行 Docker 更新；应保持发现版本但不执行命令。这样 `autoInstallSupported` 与实际自动安装能力一致。

**步骤 4: 修复 Docker 成功/失败状态收口**

确认 `performDockerInstall()`：

- 进入函数立即设置 `phase = 'installing'`，设置安装互斥；`applyNow()` 在第一个 await 前返回 `INSTALL_STARTED`，因此前端能立即显示 indeterminate 进度条。
- 成功顺序必须固定为 pull → up -d（优先使用 Compose `--wait`，若目标 Compose 版本不支持则保留后续启动状态由新容器恢复）→ ps。
- `pull` 失败立即返回，不执行后续命令。
- `up` 失败立即返回，不执行 ps；如果 `up` 已经成功启动新容器但旧进程随后退出，不依赖旧进程继续执行清理逻辑。
- `ps` 输出必须按换行拆分，并精确匹配服务名 `dsh-passwords`，不能用 `includes('dsh-passwords')` 放宽匹配。
- 在可能杀掉当前容器的 `up -d` 之前持久化 `update_restart_pending_version = latestVersion`、`update_latest_version` 和必要的安装开始时间；新容器启动时构造器发现 `restartPendingVersion === currentVersion` 后清除待重启标记、清理错误并进入稳定状态。这样 Docker 重建不会依赖旧进程完成 HTTP 响应或内存清理。
- 当前进程仍存活且 `ps` 健康检查成功时，写入 `update_applied` 审计、更新 `update_latest_version`、清除待重启标记、设置 `lastApplyAt`，将 phase 收口为 `idle`。
- 不调用 `restartWebService`，避免 Compose 已经重启容器后再次触发 systemd 重启。
- 不清理 npm artifact 目录，不修改 `.env`、`data`、profile link 或 `MCP_DB_PATH`。
- 失败时保留 `latestVersion`，写入可读错误；若已写入待重启标记但确认 Compose 未启动成功，必须清除或保留到新容器恢复，不能留下无法解释的永久 pending 状态。

如果需要前端知道 Docker 更新完成版本，沿用 `latestVersion` 与新进程读取的 `currentVersion` 语义；不要把 Docker 镜像版本误写入旧容器或本地 `package.json`。

**步骤 5: 运行定向测试**

运行：

```bash
npm test -- --test-name-pattern="Docker"
```

预期：新增 Docker 手动/自动/失败/未配置用例全部通过。

**步骤 6: 运行完整更新测试**

运行：

```bash
npm test -- --test-name-pattern="update|restart|integrity|source archives|package flow"
```

预期：现有 npm/native 流程与新增 Docker 流程全部通过。

---

## 任务 3: 补齐 Docker 前端状态与手动提示

**并行:** no
**被阻塞:** 任务 2
**拥有的文件:** `src/client/card.tsx`, `src/client/index.tsx`, `src/client/locales.ts`

**文件:**
- 修改: `src/client/card.tsx:39-56, 643-816`
- 修改: `src/client/index.tsx:27-48`
- 修改: `src/client/locales.ts:37-220`

**步骤 1: 定义 Docker 状态显示规则**

在 card.tsx 中区分：

- npm/native 下载状态：使用现有两阶段下载进度条。
- Docker 更新状态：`phase === 'installing'` 时显示不定进度条，并显示“正在更新 Docker”；`phase === 'error'` 时显示错误；完成后显示短暂成功提示或依靠 30 秒 refresh 读取新容器版本。
- Docker 未配置 Compose 目录：显示可执行的手动命令或明确配置提示，不再让用户只看到“当前环境不支持下载后自动安装”。

优先使用已有 `manualCommand` 字段；如果 UI 需要区分原因，扩展 `UpdateInfo` 增加 `dockerComposeConfigured`，但只有在确有必要时增加字段，避免重复表达 `autoInstallSupported`。

**步骤 2: 修正更新按钮标签/禁用条件**

规则：

- Docker + compose 已配置 + 有新版本 + 空闲前：按钮仍显示“立即安装”，点击触发 Compose 更新。
- Docker + compose 已配置 + 自动更新开启：空闲满 1 小时由后台触发，手动点击跳过空闲等待。
- Docker + compose 未配置：按钮动作返回 `MANUAL_ONLY`，界面显示手动命令/配置提示。
- Docker `installing`/`restarting` 期间禁用按钮并保持进度条轮询；`INSTALL_STARTED` 响应必须被视为正常进行中状态，不显示错误。
- npm/native 的“下载并准备安装”与“立即安装”标签规则不变。

**步骤 3: 补中英文词条**

至少补充：

```ts
updateDockerUpdating: '正在更新 Docker 容器',
updateDockerManual: '请配置 MCP_DSH_DOCKER_COMPOSE_DIR，或手动执行：docker compose pull && docker compose up -d',
updateDockerUpdated: 'Docker 容器已更新并通过运行检查',
```

英文提供等义文案。不得把命令放进现有普通错误词条，避免无法复制/识别；文本可放在 `dshpw-hint` 或错误提示区域。

**步骤 4: 增加 Docker 进度样式**

沿用现有 `dshpw-update-inline-progress` 和 indeterminate track，不另造第二套 progress bar。必要时给 Docker 状态增加 `data-runtime="docker"` 或 class，但不改变进度条在操作行最左侧的位置。

**步骤 5: 运行客户端构建**

运行：

```bash
npm run build
```

预期：`tsc -p tsconfig.json` 和 `node scripts/build-client.mjs` 均成功，输出 `dist/client.js 构建完成`。

---

## 任务 4: 补充 Docker 文档与配置语义

**并行:** yes
**被阻塞:** 任务 2
**拥有的文件:** `README.md`, `README_en.md`, `docker/.env.example`

**文件:**
- 修改: `README.md:238-275`
- 修改: `README_en.md:237-274`
- 检查/必要时修改: `docker/.env.example`

**步骤 1: 更新中文说明**

明确写出两种 Docker 行为：

- Docker 容器内网关检测到新版本时只负责发现版本。
- 配置 `MCP_DSH_DOCKER_COMPOSE_DIR` 后，主用户可以在设置页点击“立即安装”，或等待空闲窗口自动执行 `docker compose pull`、`docker compose up -d`、服务健康检查。
- 未配置时不会自动执行，设置页给出手动命令。
- Docker Compose 更新不下载/安装 npm tarball，不修改容器内用户数据卷。

同步配置表，将“Docker 自动更新”改为“Docker Compose 应用内更新/自动更新”，并说明目录必须是宿主机可访问的 Compose 文件目录。

**步骤 2: 更新英文说明**

与中文逐项对齐，避免 README 仍使用含糊的 “Docker auto-update” 表述。

**步骤 3: 检查示例配置**

确认 `docker/.env.example` 的说明与实际变量一致；如果文件已通过注释表达 `MCP_DSH_DOCKER_COMPOSE_DIR`，只做最小修改；不要把真实密钥或固定宿主机路径写入示例。

**步骤 4: 文档检查**

运行：

```bash
rg "Docker|MCP_DSH_DOCKER_COMPOSE_DIR|docker compose pull" README.md README_en.md docker
```

预期：所有文档对“已配置目录=应用内 Compose 更新；未配置=手动命令”的描述一致。

---

## 任务 5: 增加边界测试并完成全量验证

**并行:** no
**被阻塞:** 任务 2, 任务 3, 任务 4
**拥有的文件:** `test/update.test.ts`, `test/plugin-update.test.ts`（如现有测试布局适合则新建）

**文件:**
- 修改: `test/update.test.ts`
- 检查/必要时创建: `test/plugin-update.test.ts`

**步骤 1: 补插件 HTTP 状态映射测试**

如果现有测试工具可以无服务器地调用插件路由，增加：

- Docker Compose 更新成功不返回 409/422。
- Docker Compose 更新进行中返回 202（若实现采用异步任务；若保持同步执行，确认响应体 `ok: true` 且前端不会把它当下载任务）。
- 未配置 Compose 返回 422 + `MANUAL_ONLY`，且正文包含手动命令/配置提示。

如果插件路由测试需要过多启动依赖，则不新建复杂集成测试，保留引擎级测试并在人工验证中用实际 HTTP 请求验证；不要为了覆盖率引入新的测试基础设施。

**步骤 2: 补并发/重复点击测试**

验证 Docker 更新与 `installRunning` 互斥：第一次执行期间第二次 `applyNow()` 返回 `INSTALL_IN_PROGRESS`，不会执行第二次 pull/up。插件层应映射为 202，前端保持轮询。

**步骤 3: 补自动更新时间边界测试**

验证：

- 空闲时间不足 1 小时不执行 Compose。
- 正好达到 `UPDATE_IDLE_MS` 执行一次。
- `lastApplyAt` 未过冷却时不重复执行。
- 未配置 compose 目录不执行 Compose，即使发现新版本。

**步骤 4: 全量验证**

运行：

```bash
npm test
npm run build
```

预期：测试全部通过，build 输出 `dist/client.js 构建完成`。

随后检查：

```bash
git --no-pager diff --check
git --no-pager diff --stat
```

预期：无空白错误；变更仅限更新引擎、客户端、文档、测试和必要的 Memory 记录。

---

## 任务 6: 部署到测试服务器并做人工验收

**并行:** no
**被阻塞:** 任务 5
**拥有的文件:** `Memory/PROCESS.md`

**文件:**
- 修改: `Memory/PROCESS.md`

**步骤 1: 打包部署前检查**

在 `D:\ais\server\local preview version` 运行：

```bash
npm run build
npm test
npm pack --pack-destination .
```

确认生成的是本地 2.6.3 测试包；部署完成后删除本地临时 tgz，不能把测试包留在清理后的根目录。

**步骤 2: 使用原生 systemd 部署流程**

使用已有经过验证的临时 Paramiko 部署流程：

- 上传本地构建包/源码到 `/opt/dsh-passwords`。
- 停止 `dsh-web.service`。
- 备份现有 `/opt/dsh-passwords`。
- 覆盖程序代码。
- 迁回 `.env`、`data/`、`node_modules/`、`setup-key.txt`、TLS 配置和 profile 链接。
- 保持服务器 `package.json` 版本标识为 `2.6.2`，以维持 2.6.2 → 2.6.3 验收基线。
- 禁止启动或保留并行 Docker 服务；本次只更新原生 systemd 服务。

**步骤 3: 健康检查**

只能使用真实 HTTPS 端口验证，不得把 SSH 端口 `16961` 当 HTTP 端口：

```bash
curl -k https://127.0.0.1/gateway/healthz
curl -k https://127.0.0.1/gateway/readyz
systemctl is-active dsh-web.service
```

预期：服务 active，healthz/readyz 返回 200，readyz 中 `database=true`，现有数据库文件和记录不变。

**步骤 4: Docker 路径人工验收**

测试服务器是原生 systemd，不能在其上直接模拟 Docker runtime。Docker 逻辑由测试夹具验证；如需真实 Docker Compose 验收，应使用隔离的 Docker 测试环境，不得覆盖当前原生测试服务。

**步骤 5: 设置页验收清单**

使用管理员账号验证：

- 2.6.2 基线显示 2.6.3 可用。
- 原生/npm 更新流程仍显示进度条在“立即检查”左侧。
- Docker 专属逻辑虽不在原生服务器运行，但源码路径中的 Compose 状态/手动提示已构建进远程 `dist/client.js`。
- 自动更新关闭时 native/npm 的两次点击流程不变。
- 更新操作结束后 `.env`、`data/platform.db`、用户账号和 profile link 保持不变。

**步骤 6: 记录部署结果**

在 `Memory/PROCESS.md` 追加新步骤，记录：

- Docker 回归修复的文件和行为。
- `npm test`/`npm run build` 结果。
- 测试服务器部署结果、服务状态、healthz/readyz、数据库保留结果。
- Docker 实际 Compose CLI 未在原生测试机执行这一限制。
- 如有用户人工验收反馈，追加到下一步骤，不覆盖历史记录。

---

## 验收标准

- Docker + `MCP_DSH_DOCKER_COMPOSE_DIR`：手动点击和空闲自动更新都执行 pull → up → ps，且不进入 npm 下载路径。
- Docker 未配置目录：不执行 Docker/npm 命令，返回明确 `MANUAL_ONLY` 和可执行命令。
- Docker Compose 更新中第二次点击返回可轮询的 202 语义，不重复执行 Compose；第一次启动也返回 `INSTALL_STARTED`/202，避免等待当前容器被重建后才显示进度。
- pull/up/ps 任一步失败都 fail-closed，设置页显示错误，可再次重试，不写成功审计。
- native/npm/git 的 2.6.3 两阶段更新、限速、完整性校验、数据保护、重启恢复测试全部保持通过。
- 进度条仍在操作行最左侧；Docker installing 也显示不定进度条。
- README 中英文与实际 Docker 更新行为一致。
- 本地 `npm test`、`npm run build` 通过；修改后已部署原生测试服务器并完成 HTTPS 健康检查。
