---
title: 身份认证
description: 绑定席位的 API key——密钥是什么、可以做什么、如何发送、撤销与限流，以及 API 主机永远不接受什么。
---

## 密钥是一个被收窄的席位

每个 API key 都属于**一个账户和一个 Site**。创建它的人必须在该 Site 上持有有效的席位，而密钥
**以那个人的身份**行事：每一次读写都以其名义授权、加租约、记入审计。不存在能触达"我所有 Site"
的密钥——一个 Site，一个密钥。

密钥能做什么，是以下两者的交集：

1. **席位的有效权限**——Site 或 workspace 的策略授予该角色（`owner`、`admin`、`developer`、
   `editor`）的工具集（toolset）。Owner 拥有全部工具集；Editor 默认只有 `content`。
2. **密钥的 scope**——`content`、`code`、`site`、`lifecycle` 的一个子集，在创建密钥时选定。

密钥永远不能超出其所有者席位的能力。在 workspace 策略中收窄某个角色，就收窄了该人创建的每一个
密钥；给密钥授予其所有者并不具备的 scope，什么也授予不了（调用会回答
`403 TOOLSET_NOT_GRANTED`）。即便是 Owner 的密钥，只要 `scopes: ["content"]`，也无法修改代码。

读取需要一个在正确 Site 上、至少带有一个 scope 的有效密钥。`records` 路由是原始表面（CMS 自己的
数据行）；`pages`、`contents` 和 `changes` 路由是同一个 Site 的 Content API 视图，两者的检查
方式相同。

## 发送密钥

```http
GET /v1/sites/shop.example.com/pages HTTP/1.1
Host: api.tracy.ai
Authorization: Bearer trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

- 认证方案是 `Bearer`，请求头是 `Authorization`，密钥是完整的 `trk_<id>.<secret>` 字符串。
- **只接受 Bearer，且只在 API 主机上。** `api.tracy.ai` 不读取任何会话 cookie：`cowork.tracy.ai`
  上的浏览器会话在这里不是凭据，携带该 cookie 的请求会被视为什么都没带。缺失或格式错误的密钥
  回答 `401 KEY_INVALID`。
- 发送到 Tracy 自己主机名（`cowork.tracy.ai`）的密钥会被忽略：那些路由接受的是会话 cookie 或
  agent 的签名断言，绝不接受密钥。
- Tracy agent 用来标识其会话的请求头（`x-tracy-session`、`x-tracy-actor`、
  `x-tracy-workspace-label`）在 `/v1` 请求中会被**丢弃**。防止两个写入者同时操作一个 Site 的
  租约（lease），以密钥自身的身份（`key:<id>`）持有，由服务器决定。

## 生命周期

| 事件 | 效果 |
|---|---|
| 创建 | 完整密钥只显示一次。Tracy 存储一个哈希值（带服务端 pepper 的 HMAC-SHA256）；它无法再次显示密钥本身。 |
| 使用 | `last_used_at` 更新，每分钟最多一次。 |
| 过期（`expires_at`，可选） | 每次调用回答 `401 KEY_EXPIRED`。 |
| 被所有者撤销 | 每次调用回答 `401 KEY_REVOKED`。**撤销是永久性的**——之后重新授予席位也不会让密钥恢复。 |
| 所有者的席位被撤销 | 每次调用立即回答 `403 SEAT_NOT_AUTHORIZED`；席位在每次请求时都会检查，不做缓存。 |
| Site 被删除 | 密钥随之删除。 |

密钥在 Tracy 的 Settings 中管理，或通过 Tracy 自己主机名上的账户入口管理（`GET /api/me/keys`、
`POST /api/me/keys`、`DELETE /api/me/keys/{id}`），这些入口接受浏览器会话——绝不接受密钥。

## 不要把密钥嵌入前端

密钥是一个机密，其能力范围等同于你的席位。把它放在服务器、CI secret 或本地工具里；绝不要放进
网页、移动应用或公开仓库。在 `/v1` 上，API 只响应来自一个 origin 的浏览器请求——本文档站的 origin，供[参考](/zh-cn/reference/)页面的
**Test request** 按钮使用——而且从不携带凭据（credentials），因此其他 origin 上的页面即便误操作也无法带着密钥
调用它。**Test request** 不存储任何东西：在那里输入的密钥只存在于那个标签页里。

## 速率限制

限制按密钥计算，分两个桶，在调用到达 Site 之前计数：

| 桶 | 限制 | 计入的内容 |
|---|---|---|
| read | 每小时 6,000 次 | 每一条不改变任何东西的路由 |
| write | 每小时 600 次 | 每一条改变 Site 的路由（`PATCH`、`DELETE`、`POST …/contract/*`、`POST …/revert`） |

超过限制时回答 `429 RATE_LIMITED`，并附带 `Retry-After` 头，给出距离下一个窗口开启的秒数。
计数器是 fail-closed 的：如果无法读取计数器，调用会被拒绝，而不是放行。

## 本层的错误码

| 状态 | 代码 | 含义 |
|---|---|---|
| 401 | `KEY_INVALID` | 没有 `Authorization: Bearer trk_…`，或者密钥不存在，或者其 secret 不匹配。 |
| 401 | `KEY_REVOKED` | 密钥已被撤销。请创建一个新的。 |
| 401 | `KEY_EXPIRED` | 密钥的 `expires_at` 已过。请创建一个新的。 |
| 403 | `SEAT_NOT_AUTHORIZED` | 密钥的所有者在这个 Site 上没有有效席位（席位已被撤销，或路径指向了另一个 Site）。 |
| 403 | `TOOLSET_NOT_GRANTED` | 该动作需要的工具集不在密钥 scope ∩ 席位权限之内；回答中会给出 `toolset` 和 `role`。 |
| 429 | `RATE_LIMITED` | 超过了两个桶之一；等待 `Retry-After` 秒。 |

其他所有拒绝——包括 Site 自己的回答——都在[错误](/zh-cn/reference/errors/)页面上。
