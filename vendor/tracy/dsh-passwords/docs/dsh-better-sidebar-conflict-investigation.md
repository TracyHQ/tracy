# `dsh-better-sidebar` 冲突排查记录

> 状态：待排查，不作为已修复问题对外宣称。  
> 创建日期：2026-09-10  
> 目标环境：DSH `0.1.5` 系列、`dsh-passwords` `2.7.0`。

## 结论摘要

在安装 `dsh-better-sidebar` 后，本地 DSH 实例出现过明显不稳定；移除该扩展后，`dsh-passwords` 的基础登录、设置页和网关访问恢复正常。因此当前将问题界定为 **`dsh-better-sidebar` 终端侧功能与当前 DSH 运行环境或其依赖之间的待确认兼容性冲突**，而不是已证实由 `dsh-passwords` 的认证或子用户权限逻辑造成。

在完成最小复现、服务端日志比对和依赖树核验前，不应为适配该单一第三方扩展改变 `dsh-passwords` 的通用网关模型。

## 已观察到的现象

| 场景 | 观察结果 |
|---|---|
| 安装并启用 `dsh-better-sidebar` | DSH 页面/设置页有时加载缓慢；个别操作后侧边栏或页面发生重连。 |
| 打开扩展提供的终端 | 终端可能长期显示“加载中”。 |
| 终端建立或执行简单命令（如 `ls`） | 本地 DSH 进程曾退出，浏览器随后显示 `127.0.0.1` 拒绝连接。 |
| 终端 WebSocket | 曾出现连接反复失败或关闭码 `1006`；这些现象发生在扩展终端链路中。 |
| 移除 `dsh-better-sidebar` | 上述页面卡顿、`Failed to fetch` 与进程退出现象不再出现；基础 `dsh-passwords` 前后端恢复稳定。 |

## 当前归因边界

### 已确认

- `dsh-passwords` 不再内置、探测或自动放行任何 `dsh-better-sidebar` 专属路径。
- 通用第三方 SSH WebSocket 放行仅由主用户显式设置 `MCP_GATEWAY_SSH_ENDPOINTS` 决定；子用户还必须在权限页启用 SSH 端点权限。
- 主用户不受子用户 SSH 权限开关限制。
- 在移除 `dsh-better-sidebar` 的纯净环境中，`dsh-passwords` 的基础网关、登录和设置页可正常工作。

### 尚未确认

- DSH 进程退出是否由 `dsh-better-sidebar` 自身代码、其 `node-pty` 安装/ABI、DSH 的终端运行时，或插件组合造成。
- 关闭码 `1006` 是否发生在网关上游连接前、网关代理期间，还是 DSH/扩展进程退出后的浏览器侧结果。
- `dsh-better-sidebar` 的终端 bundle 是否适配 DSH `0.1.5-rc.1` 的插件/Sidebar API。
- 插件的安装脚本、`node-pty` 二进制和实际运行的 Node.js ABI 是否一致。

## 不应采取的处理方式

- 不因为该扩展而恢复已移除的插件专属 WebSocket 白名单、自动探测或隐式放行。
- 不向所有子用户开放未知第三方 WebSocket 路径。
- 不通过降低认证、会话授权、Cookie 隔离或 SSH 权限检查来“修复”扩展加载失败。
- 不将扩展终端的 `1006` 直接标记为 `dsh-passwords` bug，除非日志证明网关主动拒绝或异常关闭上游连接。

## 明日排查计划

### 1. 建立最小复现矩阵

使用独立 profile，保持 dsh-passwords 配置不变，逐项验证：

| 组合 | 预期用途 |
|---|---|
| 仅 DSH | 建立 DSH 基线。 |
| DSH + dsh-passwords | 验证网关基线。 |
| DSH + dsh-better-sidebar | 判断问题是否无需网关即可复现。 |
| DSH + dsh-passwords + dsh-better-sidebar | 验证是否存在真实交互问题。 |

每组至少检查：首页加载、设置页、打开终端、执行 `pwd` 与 `ls`、关闭终端、刷新页面。

### 2. 记录可比对证据

在每次复现时保存以下脱敏信息：

- DSH 服务日志与退出堆栈；
- dsh-passwords 网关日志（特别是目标 WebSocket 的连接、拒绝、上游关闭与状态码）；
- 浏览器控制台和 Network 中对应 WebSocket 的请求路径、响应状态、关闭码与关闭发起方；
- 实际 Node.js 版本、`node-pty` 版本和二进制 ABI；
- 插件版本、DSH 版本、profile 的 `package.json` 与 lockfile 摘要。

任何日志、截图或 issue 中不得包含生产地址、Cookie、Bearer token、API key、用户名密码或真实会话内容。

### 3. 判定规则

| 证据 | 初步结论 |
|---|---|
| “DSH + dsh-better-sidebar” 已能复现退出 | 优先归因 DSH / 扩展 / `node-pty`，dsh-passwords 不修改。 |
| 仅“DSH + dsh-passwords + dsh-better-sidebar”复现，且网关记录拒绝 | 检查显式 SSH 端点配置、用户权限和网关路径匹配。 |
| 仅组合环境复现，但网关未拒绝且上游先断开 | 优先检查 DSH/扩展运行时、bundle 与 `node-pty`。 |
| 网关在已授权路径上出现异常、可稳定最小复现 | 为网关建立回归测试，采用通用协议修复，不引入插件专属分支。 |

## 可能的修复方向（仅在证据成立后选择）

1. **扩展或运行时问题**：向 `dsh-better-sidebar` 维护者提交最小复现、DSH/Node/`node-pty` 版本和脱敏日志；不修改 dsh-passwords。
2. **显式 SSH 路径配置问题**：完善 README 的 `MCP_GATEWAY_SSH_ENDPOINTS` 示例和设置页权限说明；保持主用户显式配置模型。
3. **通用 WebSocket 代理问题**：在 dsh-passwords 中修复可复现的通用握手、头部、Cookie 或关闭传播逻辑，并补充回归测试。
4. **插件 API 变更问题**：等待/协助扩展适配 DSH `0.1.5` 的 Sidebar API，不把旧插件 API 兼容层带入网关。

## 回归要求

如后续修改 dsh-passwords，至少验证：

- 无第三方 Sidebar 插件时，主用户与子用户的登录、工作区、会话、设置页和普通 WebSocket 不回归；
- 未配置 `MCP_GATEWAY_SSH_ENDPOINTS` 时，子用户第三方 SSH 请求仍拒绝；
- 配置端点且授予 SSH 权限后，子用户可通过该显式端点连接；撤销权限后连接被拒绝；
- 非 SSH 的未知第三方 WebSocket 对子用户保持 fail-closed；
- 主用户的正常 DSH 功能不被子用户 SSH 授权模型影响。
