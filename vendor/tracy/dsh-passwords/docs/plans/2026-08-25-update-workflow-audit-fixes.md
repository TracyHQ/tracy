# 2.6.3 更新工作流审计修复实施计划

> **给 Claude:** 生成 `task-builder` 代理逐任务实施此计划。

**目标:** 修复 2.6.3 相对 2.6.2 的原生/npm 与 Docker 更新工作流，使自动更新、手动两阶段安装、进度反馈、版本验证、服务重启和用户数据保护形成可验证的完整闭环。

**架构:** 原生/npm 环境继续使用 GitHub Release 发现版本、npm registry 下载已校验 tarball；自动更新开启时限速下载，空闲窗或主用户手动触发安装，关闭时采用“第一次下载、第二次安装”。原生安装改为后台任务并立即返回 202，避免插件 8 秒请求超时。Docker 采用宿主机 Compose 管理版本化已发布镜像的架构：应用内只在明确配置了可执行的 Compose 目录、Docker CLI 和宿主 Docker 访问能力时执行 `pull → up → readiness`，不下载 npm 包；否则只展示准确的手动命令。所有安装成功必须验证运行版本和服务 ready，不能只依据进程存活或数据库标记。

**技术栈:** TypeScript、Node `node:test`、Express 内部/插件路由、React/`h()` 客户端、npm registry、GitHub Releases、Docker Compose、systemd、SQLite 持久化设置。

---

## 审计结论与不变约束

当前实现不能直接批准，原因不是测试数量不足，而是存在真实行为缺口：

- Docker 镜像目前没有可靠的应用内 Compose 执行契约。`docker/docker-compose.bundled.yml` 使用 `build:`，`docker/Dockerfile.bundled` 没有 Docker CLI，容器也没有 Docker socket；因此不能把当前 `docker compose pull` 代码当成已可用的生产更新路径。
- Docker 安装成功只检查 `dsh-passwords` 服务名是否运行，然后把目标版本写入数据库，可能把旧镜像误记成新版本。
- 设置页每 700ms 请求一次 update status，而网关把所有非 internal 请求算作用户活动，会持续重置一小时空闲计时，自动安装可能永远不会触发。
- 原生安装在插件调用内同步等待 npm 安装、profile 注册和重启，插件内部请求 8 秒超时后可能返回 502，但后台安装仍继续，用户会看到错误状态。
- Docker 恢复在 Compose 目录暂时不存在时直接返回，却保留 pending 标记，后续可能永久返回 `INSTALL_IN_PROGRESS`；恢复健康检查只有一次，不验证 gateway ready。
- Docker 安装期间 `status()` 把 `downloadPercent` 直接报成 100，前端会显示静态满格，不能代表真实进度。

实施期间必须遵守：

- 本地源码版本保持 `2.6.3`，测试服务器 `package.json`/lockfile 版本标识保持 `2.6.2`，用于模拟 2.6.2 → 2.6.3；不得发布 GitHub、npm 或 Docker Hub。
- 测试服务器只使用已有原生 systemd 服务，不部署并行 Docker；部署目录为 `/opt/dsh-passwords`。
- 不覆盖服务器 `.env`、`data/`、`node_modules/`、TLS、profile link 或数据库；不删除用户数据。
- 每个代码修改批次都必须先本地 `npm test`、`npm run build`、`git diff --check`，再同步到测试服务器并验证 `dsh-web.service`、`healthz`、`readyz` 和数据路径。
- 不使用脚本或子代理完成人工审查；测试只能作为证据，最终还要逐行检查状态转移、失败回滚和部署结果。
- Docker socket 允许容器控制宿主 Docker，风险等同宿主 root；若采用该拓扑，必须在 README 中明确说明。若环境不能满足该拓扑，产品行为必须是手动更新，而不是伪造成功。

## 支持的 Docker 架构契约

正式实现只支持以下一种自动更新拓扑：

1. 宿主机存在 Compose 项目目录，目录内使用带版本标签的 `image:`，例如 `skywalker237234/dsh-passwords:2.6.3`，或由部署方维护的等价版本化镜像引用；不能只依赖 `latest`。
2. `MCP_DSH_DOCKER_COMPOSE_DIR` 指向该宿主机 Compose 目录。应用进程必须能在该目录执行 `docker compose`，并且有访问宿主 Docker daemon 的权限。
3. Compose 更新命令必须使用参数数组和固定 cwd：先拉取目标镜像，再按目标版本启动服务；禁止 shell 拼接用户输入。
4. 更新前持久化目标版本和状态；更新后从实际运行容器的标签、镜像 digest 或容器内 `package.json`/版本命令中读取并校验目标版本，再检查 `dsh-passwords` 服务和 `/gateway/readyz`。
5. 若当前 bundled 容器没有 Docker CLI/socket，或 Compose 文件仍是 build-only 且没有明确构建上下文与版本证明，则 `autoInstallSupported=false`，页面显示手动命令，不执行 npm 下载、不返回已安装。

---

## 任务 1: 建立更新状态机和版本契约的失败测试

**并行:** no  
**被阻塞:** 无  
**拥有的文件:** `test/update.test.ts`

**文件:**
- 修改: `test/update.test.ts`

**步骤 1: 编写失败测试**

在现有 `setup()` 和 Docker 夹具基础上补充测试替身，使每个命令都能记录参数、cwd、返回值和调用时序。增加以下测试：

- 自动模式发现新版后，只触发 npm metadata/tarball 下载，不会因 update status 轮询刷新活动时间而跳过 idle 安装。
- 手动模式第一次 `applyNow()` 返回 `DOWNLOAD_STARTED`，下载完成为 `ready + installConfirmationRequired`，第二次 `applyNow()` 立即返回 `INSTALL_STARTED`，不会等待完整 npm 安装。
- 模拟 `runInstall` 超过 8 秒，插件/引擎状态仍为 `installing`，最终成功或可重试，不能产生“请求超时但更新已悄悄完成”的矛盾状态。
- 第二次安装期间重复点击返回 `INSTALL_IN_PROGRESS`，只启动一个后台任务。
- Docker 自动/手动路径禁止 `fetchNpmMetadata`、`download`、`runInstall`；未配置 Compose 目录、无 Docker CLI、build-only Compose 分别返回 `MANUAL_ONLY` 并给出明确手动命令。
- Docker 成功只有在 `ps`、运行版本/digest 和 ready 检查都通过时才写 `update_applied`；版本不匹配、服务不在运行、readyz 失败均进入可重试 error。
- Docker readiness 采用有限重试和退避；前几次未 ready、最终 ready 应成功，超时应失败并保留可解释状态。
- Docker 恢复找不到 Compose 目录时不得永久卡在 pending/installing；应进入 retryable error，目录恢复后允许重新 apply。
- Docker 安装状态的 `downloadPercent` 在没有真实 Docker 下载百分比时保持 `null`，不能报 100。

测试中的 Docker CLI/socket 探测必须通过 `UpdateEngineOps` 注入模拟，不依赖本机 Docker daemon。

**步骤 2: 运行测试验证失败**

运行：

```bash
npm test -- --test-name-pattern="update|Docker|idle|timeout|readiness"
```

预期：新增测试至少因当前同步安装、弱 Docker 版本验证、单次 readiness 或 idle 计时行为失败；记录首个失败断言，不修改测试使其迎合旧行为。

**步骤 3: 检查测试隔离性**

确认测试使用临时目录和内存 store，不读取本地 `.env`、真实 npm registry、GitHub、服务器或 Docker socket；所有时间由 `nowRef` 注入。

---

## 任务 2: 修复自动更新空闲计时和轮询活动边界

**并行:** no  
**被阻塞:** 任务 1  
**拥有的文件:** `src/gateway.ts`, `src/update.ts`, `src/client/card.tsx`, `test/update.test.ts`

**文件:**
- 修改: `src/gateway.ts:1744-1748`
- 修改: `src/update.ts:459-465`
- 修改: `src/client/card.tsx:305-322, 394-405, 434-442`
- 测试: `test/update.test.ts`

**步骤 1: 定义自动更新请求判定**

增加小型、可测试的请求判定逻辑，例如 `isUpdateStatusRequest(gatePath)`，至少排除：

- `/api/dsh-passwords/update/status`
- `/gateway/internal/update`

`check` 请求是用户点击时发出的，是否刷新活动时间要与产品语义一致；建议只排除状态轮询和内部引擎请求，保留用户主动 check/apply 作为活动。不能通过排除所有 update 路由让用户点击安装被当成空闲。

**步骤 2: 让网关只对真实用户活动调用 `bumpActivity()`**

保留登录、业务 API、页面和 SSE 的活动刷新；状态轮询不得刷新 `lastActivityAt`。内部 update 调用继续不计活动。

**步骤 3: 调整前端轮询策略**

保留自动下载、下载中、安装中、重启中的进度轮询。对“已发现新版本但自动安装正在等待一小时空闲”的状态，可以降低轮询频率或继续轮询但依赖网关排除，不得让页面可见性影响后台计时。安装完成/error 后停止高频轮询。

**步骤 4: 运行定向测试**

运行：

```bash
npm test -- --test-name-pattern="idle|activity|status polling|automatic"
```

预期：状态轮询不会改变活动时间；人为推进 `UPDATE_IDLE_MS` 后 `tick()` 会启动自动安装；真实业务请求仍会延长空闲窗。

---

## 任务 3: 将原生/npm 安装改为后台受理和可恢复任务

**并行:** no  
**被阻塞:** 任务 1  
**拥有的文件:** `src/update.ts`, `src/plugin.ts`, `test/update.test.ts`

**文件:**
- 修改: `src/update.ts:388-390, 1040-1124, 1210-1230`
- 修改: `src/plugin.ts:142-180, 690-760`
- 测试: `test/update.test.ts`，必要时新增 `test/plugin-update.test.ts`

**步骤 1: 设计任务状态**

区分：

- `downloading`: npm tarball 下载中，带真实字节进度。
- `ready`: 包已完整校验，等待安装确认或空闲窗。
- `installing`: 后台执行 staging、npm install、profile 注册和目录切换。
- `restarting`: 已切换包，等待 dsh-web/gateway 恢复。
- `error`: 错误可重试，不能把旧包状态误清除。

增加持久化任务版本/开始时间/错误（沿用现有 settings 命名风格），确保进程重启后能判断“已安装待重启”“下载完成待确认”和“安装失败待重试”。不引入第二套并行状态来源。

**步骤 2: 修改 `applyNow()`**

当 `pendingVersion && phase === 'ready'` 时：

- 原子设置安装状态和互斥标记。
- 启动 `void this.performInstall().catch(...)` 后立即返回 `ok:true, code:'INSTALL_STARTED', phase:'installing'`。
- 不在插件请求内 `await` npm 安装、profile 注册或 systemd 重启。
- 若已有安装任务，稳定返回 `INSTALL_IN_PROGRESS`，不重复切换目录。

第一次手动点击仍只负责启动不限速下载；自动模式的手动点击是“跳过空闲等待并安装”，不能重新下载已就绪包。

**步骤 3: 保留并强化数据保护目录交换**

安装前把当前绝对 `MCP_DB_PATH` 固化到稳定 `.env`；使用 staging 目录安装新包并校验包名、目标版本、`dist/` 和注册脚本；切换时保留 `.env`、`data/`、`node_modules/`、TLS、setup key 和 profile 所需路径。成功后只删除旧程序文件、旧 backup 和 update staging 内无用文件；严禁递归删除数据目录。失败时按已有回滚策略恢复旧程序和数据路径，保留可重试错误。

注意目录交换的 SIGKILL 窗口：用同一父目录下的临时目录、明确的 backup/current 标记和启动恢复逻辑减少短暂无 current 的时间；至少保证新进程能从 backup 恢复，且人工错误消息包含恢复路径。

**步骤 4: 调整插件响应映射**

`INSTALL_STARTED`、`INSTALL_IN_PROGRESS`、`DOWNLOAD_STARTED`、`DOWNLOAD_IN_PROGRESS` 统一返回 202；业务拒绝、未就绪、无更新、不可用才使用对应 409/422/502。8 秒内部请求超时不再承担安装时长，若仍保留 timeout，只负责后台任务受理阶段。

**步骤 5: 运行定向测试**

运行：

```bash
npm test -- --test-name-pattern="package flow|install|restart|timeout|profile|database|data"
```

预期：模拟超过 8 秒的安装仍先收到 202，随后 status 能观察到成功/error；数据库文件、`.env` 和 profile link 在成功/失败/重启失败路径都保持正确。

---

## 任务 4: 实现可证明的 Docker Compose 更新

**并行:** no  
**被阻塞:** 任务 1  
**拥有的文件:** `src/update.ts`, `docker/docker-compose.bundled.yml`, `docker/Dockerfile.bundled`, `docker/docker-entrypoint.bundled.sh`, `README.md`, `README_en.md`, `test/update.test.ts`

**文件:**
- 修改: `src/update.ts:404-410, 1126-1205, 1210-1220`
- 修改: `docker/docker-compose.bundled.yml`
- 修改: `docker/Dockerfile.bundled`
- 修改: `docker/docker-entrypoint.bundled.sh`
- 修改: `README.md`, `README_en.md`
- 测试: `test/update.test.ts`

**步骤 1: 先落实拓扑，不隐藏能力缺失**

选择并记录一种实际可部署方式：

- 推荐：Compose 文件使用版本化 `image: skywalker237234/dsh-passwords:${DSH_PASSWORDS_VERSION}`，更新前由宿主/运维把目标版本写入受控 env 或生成配置，应用仅调用宿主 Compose；或
- 若必须 build：明确要求宿主 Compose 在受控源码上下文执行 `docker compose build --pull`，并额外验证构建产物版本；不能使用当前没有 CLI/socket 的 bundled 容器自调用。

若无法在应用进程内安全、可验证地访问宿主 Docker，保留 `MANUAL_ONLY`，界面显示准确命令和所需宿主权限。不要为了让测试通过盲目把 `/var/run/docker.sock` 挂进容器。

**步骤 2: 增加 Docker 能力探测和命令封装**

增加可注入的 `dockerUpdateSupported()`/`dockerComposeDir()` 检查：目录存在且是目录、Compose 配置可解析、Docker CLI 可执行、目标 Compose 文件包含受支持的版本化 image/build contract。所有命令使用数组和 cwd，不使用 shell。

**步骤 3: 修复手动和自动入口**

- Docker 只做 GitHub release 版本发现，不请求 npm metadata，不创建 tarball。
- 配置完整时，手动点击和空闲自动安装都启动后台 Compose 任务并返回 `INSTALL_STARTED`。
- 未配置或能力不足时返回 `MANUAL_ONLY`，不进入 `NOT_READY`，不伪造“等待自动下载”。
- Compose 更新期间重复点击返回 `INSTALL_IN_PROGRESS`。

命令顺序按实际架构固定为：

```text
docker compose pull <target-service>
docker compose up -d <target-service>
readiness polling
```

如果需要变更镜像版本，必须在 `up` 前以安全、可审计方式传入目标版本；不能只 pull `latest` 后把 GitHub 版本写成已应用。

**步骤 4: 实现版本证明和 ready 检查**

在 `ps` 之外至少完成两项：

- 读取实际容器 image tag/digest，并与目标版本映射；或执行受限的容器内版本命令/读取 package.json 并严格比较；
- 对新容器的 `/gateway/readyz` 做有限重试，要求 HTTP 成功且 JSON 中 `ok:true`、`database:true`；必要时从宿主 Compose 网络访问服务，不能把旧应用自身的响应当成新容器证明。

健康检查失败不写 `update_docker_applied_version`，不写成功审计；把 pending 转换为可重试 error，并保留目标版本和可读错误。

**步骤 5: 修复恢复逻辑**

`recoverDockerInstall()` 找不到 Compose 目录或 Docker 暂时不可用时：

- 不返回一个会永久阻断后续 apply 的状态。
- 清晰区分 `retryable error` 与“更新已经成功但旧进程未清理”。
- 新进程启动后使用同一套版本证明和 readiness polling；通过后才清 pending、写 applied marker 和审计。
- 恢复检查必须有超时、退避和最大尝试次数，避免构造器启动被无限等待阻塞。

**步骤 6: 保持 Docker 进度诚实**

Docker pull/up 没有可用字节进度时，状态中的 `downloadPercent` 为 `null`，前端显示不定进度条；不能把安装中映射为 100%。若后续接入 Docker JSON progress，再将真实百分比映射到统一字段。

**步骤 7: 运行定向测试**

运行：

```bash
npm test -- --test-name-pattern="Docker|Compose|readiness|image|digest|recovery"
```

预期：测试覆盖命令顺序、无 npm 调用、能力不足 fail-closed、版本 mismatch、readyz 重试、恢复和重复点击；不依赖真实 Docker daemon。

---

## 任务 5: 修复前端更新行和状态文案

**并行:** no  
**被阻塞:** 任务 3、任务 4  
**拥有的文件:** `src/client/card.tsx`, `src/client/index.tsx`, `src/client/locales.ts`, `test/update-ui.test.ts`（如现有测试体系允许）

**文件:**
- 修改: `src/client/card.tsx:34-56, 305-322, 387-448, 644-825`
- 修改: `src/client/index.tsx:27-40`
- 修改: `src/client/locales.ts` 更新相关词条
- 创建或修改: `test/update-ui.test.ts`

**步骤 1: 固定操作行布局**

保持同一行从左到右严格为：

```text
[下载/安装进度] [立即检查] [立即安装]
```

进度容器必须是 grid 第一列，具有稳定最小宽度；窄屏时允许内容换行或缩小，但不能把进度条移到按钮下方，也不能让按钮文字溢出。继续使用现有 semantic token 和 indeterminate 动画，不增加装饰性卡片。

**步骤 2: 覆盖自动和手动下载状态**

- 自动下载：左侧显示真实百分比和 `automatic` 文案。
- 手动第一次点击：立即显示不定进度，下载完成后明确通知“下载完成，请再次点击立即安装”。
- 安装/重启：显示不定进度和安装文案，不显示伪造 100%。
- error：停止高频轮询，显示后端错误和可重试操作。
- Docker 手动 only：显示要求的 Compose 命令/配置提示，安装按钮不可点击。
- 状态未知或页面刷新：从 status 恢复，不因前端本地 state 丢失而重复启动任务。

**步骤 3: 修复按钮反馈和 HTTP 状态处理**

前端把 202 的 body 当作正常受理；只对真实错误显示 error。`409` 仅用于冷却/冲突且文案准确，`422` 用于未就绪/不支持并展示原因，不能把 `DOWNLOAD_STARTED` 或 `INSTALL_STARTED` 显示为失败。

**步骤 4: 编写 UI 行为测试或可重复的静态断言**

覆盖：进度元素在 check button 前、automatic/manual/installing 三种状态、安装中按钮 disabled、Docker manual only 文案、错误状态可重试。若仓库当前无 DOM 测试依赖，则增加纯函数状态映射测试，并在部署后人工浏览器检查浅色/深色和窄屏布局。

**步骤 5: 运行验证**

```bash
npm test -- --test-name-pattern="update UI|progress|manual only|installing"
npm run build
```

---

## 任务 6: 同步文档和错误语义

**并行:** no  
**被阻塞:** 任务 4、任务 5  
**拥有的文件:** `README.md`, `README_en.md`, `src/update.ts`, `src/client/locales.ts`, `Memory/PROCESS.md`

**文件:**
- 修改: `README.md` 软件更新和 Docker 部署章节
- 修改: `README_en.md` Software updates 和 Docker deployment 章节
- 修改: `src/update.ts` 过时注释和错误信息
- 修改: `src/client/locales.ts` 更新状态词条
- 修改: `Memory/PROCESS.md` 增加本轮计划/实施/审计结果

**步骤 1: 明确原生/npm 文档**

写清楚：

- GitHub Release 只发现版本；npm registry 下载 tarball。
- 自动开启：限速下载 → 空闲一小时或主用户手动安装 → npm 安装/重注册/profile 切换/重启。
- 自动关闭：检查 → 第一次点击不限速下载 → 完成通知 → 第二次点击安装/重启。
- `.env`、`data/`、数据库、TLS、profile 等用户数据和配置不会被覆盖。

**步骤 2: 明确 Docker 文档**

写清楚支持的 Compose/image/version contract、宿主 Docker 权限和 socket 风险；写清楚 bundled 容器无法满足条件时必须手动执行 Compose，不会下载 npm tarball，也不会在页面声称已安装。

**步骤 3: 删除误导性错误文案**

“Git 工作区有未提交修改，已停止自动更新”只允许在仍然存在真实 Git 更新路径且检测到 dirty worktree 时出现；npm/native tarball 路径不应引用该旧错误。Docker 未配置时不要显示“等待自动下载”。

**步骤 4: 记录审计状态**

在 `PROCESS.md` 新增本轮条目，区分：方案已完成、代码修复已完成、测试通过、服务器部署通过、人工浏览器验证通过。未做的项保持未完成，不能用测试通过替代人工审查。

---

## 任务 7: 本地全量验证与人工逐行审查

**并行:** no  
**被阻塞:** 任务 2、任务 3、任务 4、任务 5、任务 6  
**拥有的文件:** 无新增代码；审查 `src/update.ts`, `src/plugin.ts`, `src/config.ts`, `src/gateway.ts`, `src/client/card.tsx`, `src/client/index.tsx`, `src/client/locales.ts`, `docker/*`, `test/*`

**步骤 1: 执行验证命令**

```bash
npm test
npm run build
git diff --check
```

预期：全部测试通过、TypeScript build 通过、无 whitespace 错误。开发环境缺少第三方类型声明时，记录诊断但以 build 结果为准，不删除有意义代码。

**步骤 2: 人工检查原生流程每条路径**

按代码调用顺序逐项核对：发现版本、metadata host 白名单、integrity、限速、断点/失败恢复、ready 状态、后台安装、staging 校验、数据保护、profile realpath/版本、备份/回滚、重启等待、重启失败恢复、冷却和重复点击。对每个 `return` 标注用户看到的 phase、HTTP code 和下一步动作。

**步骤 3: 人工检查 Docker 流程每条路径**

逐项核对：能力探测、Compose cwd/参数、目标版本传递、pull/up 顺序、pending 持久化、容器真实版本、服务名精确匹配、readyz/database、重试上限、旧进程被杀、恢复、失败再试、审计和 applied marker。确认没有“服务运行即版本成功”的路径。

**步骤 4: 形成阻断清单**

若发现任何路径无法证明版本、可能覆盖用户数据、可能永久 pending、可能 502 与成功并存，标记为未通过并继续修复；不得以 100% 测试通过直接批准。

---

## 任务 8: 部署到原生 systemd 测试服务器并人工验收

**并行:** no  
**被阻塞:** 任务 7  
**拥有的文件:** `Memory/PROCESS.md`

**文件:**
- 修改: `Memory/PROCESS.md` 部署与验收记录

**步骤 1: 生成并核对本地构建产物**

在 `D:\ais\server\local preview version` 执行 build；确认 local `package.json`/lockfile 为 2.6.3。准备同步清单，只包含 `src/`、`dist/`、必要 `scripts/`、package/README 和 Docker 源码，不包含 `.env`、`data/`、`node_modules/`、TLS、profile 或本地临时文件。

**步骤 2: 备份测试服务器并同步**

服务器 `/opt/dsh-passwords` 先备份源码和配置元信息；只覆盖代码和构建文件。服务器版本标识保持 2.6.2，不启动任何 Docker 容器，不改变 systemd 拓扑。

**步骤 3: 重启并做服务验证**

使用 HTTPS 443 验证，不把 SSH 16961 当 HTTP 端口：

```bash
systemctl is-active dsh-web.service
curl -k https://127.0.0.1/gateway/healthz
curl -k https://127.0.0.1/gateway/readyz
```

额外核对：`.env` inode/hash、`data/platform.db` 存在且大小/记录数未异常变化、`MCP_DB_PATH` 仍指向 `/opt/dsh-passwords/data/platform.db`、profile link 仍指向 `/opt/dsh-passwords`、无 Docker 容器、远端关键 dist hash 与本地一致。

**步骤 4: 浏览器人工验收原生更新**

在真实设置页以主用户执行：

- 自动关闭：检查新版 → 第一次立即安装下载，观察左侧进度从 indeterminate 到百分比/完成通知 → 第二次立即安装，确认后台安装、重启和用户数据仍在。
- 自动开启：检查新版 → 观察限速下载 → 设置页持续打开但 status 轮询不阻塞 idle → 推进/等待空闲窗或主用户手动安装，确认安装开始。
- 重复点击、刷新页面、安装失败/重启失败后重试，确认不会返回旧的 409/422 假错误或重复任务。
- 浅色/深色主题和窄屏确认进度条位于立即检查左侧且无溢出。

**步骤 5: Docker 只做可控环境验收**

不在原生测试服务器部署 Docker。若有独立、明确授权的 Docker 验收环境，再验证版本化镜像 pull/up、实际 image tag/digest、readyz、恢复和数据卷；没有该环境时只报告源码测试和拓扑限制，不声称 Docker 已实测通过。

**步骤 6: 更新 Memory**

在 `Memory/PROCESS.md` 记录本轮每个部署批次、服务器保留项、命令结果摘要、浏览器人工结果、未完成风险和最终是否批准。不得记录任何 token、密码或明文密钥。

---

## 完成标准

只有同时满足以下条件才可报告“人工审查通过”：

- npm/native 自动与手动两阶段流程状态转移完整，后台安装不会被 8 秒插件超时打断或误报。
- 下载/安装进度条始终在操作行最左侧；自动、手动和安装状态都有诚实反馈，不显示伪造 100%。
- 自动状态轮询不会重置一小时空闲计时。
- Docker 要么按版本化 Compose/image contract 完成真实版本和 ready 验证，要么明确 fail-closed 为手动更新；不能把不可执行路径标成自动可用。
- 安装成功和失败都不覆盖用户 `.env`、`data/`、数据库、TLS、profile；旧程序和 staging 文件只在成功后清理。
- Docker/native 恢复不会永久卡 pending，失败可重试，审计和 applied marker 只在真实成功后写入。
- `npm test`、`npm run build`、`git diff --check` 通过，并完成原生 systemd 测试服务器部署与浏览器人工验收。
- `Memory/PROCESS.md` 真实记录结果；未验证项明确标为未验证。

## 实施顺序与部署门槛

任务 1 → 任务 2/3/4 → 任务 5 → 任务 6 → 任务 7 → 任务 8。每完成一个有代码变化的任务组，都必须本地测试/build 后部署到原生测试服务器供人工观察；若部署后发现服务、数据路径或登录异常，立即停止后续任务，恢复该批次代码备份并先查明根因。不得只删除 Docker 容器来“恢复测试”，因为本轮测试服务器必须始终运行最新本地代码的原生 systemd 版本。
