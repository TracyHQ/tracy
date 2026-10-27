---
title: 核心概念
description: Site 与 Site key、席位、角色与工具集、内容地图（content、block、field、slot、native）、revision 与 version、撤销，以及插件版本。
---

## Site 与 Site key

**Site** 是 Tracy 托管或导入的一个客户网站：一个拥有自己地址的 Joomla、WordPress 或 EmDash
安装。它的 **Site key** 是它的规范名称（例如 `shop.example.com`），出现在每一条路径中：
`/v1/sites/{key}/…`。一个 Site 也可以通过别名访问；Tracy 在授权之前会先规范化这个 key，所以
无论你用哪个名字，回答都相同。未知的 key 回答 `404`。

## 席位、角色与工具集

**席位**（seat）是一个人在一个 Site 上的成员身份，带有一个**角色**：`owner`、`admin`、
`developer` 或 `editor`。角色授予**工具集**（toolset）——每个动作都归属于以下四个家族之一：

| 工具集 | 涵盖 |
|---|---|
| `content` | 文字、图片和链接：记录、内容、契约应用、媒体上传、撤销 |
| `code` | 模板、模块、扩展、主题、插件以及它们定义的布局 |
| `site` | Site 的整体数据：数据库表、转储、快照 |
| `lifecycle` | 构建、发布、还原和删除 Site |

每个动作需要哪个工具集，写在 [API 参考](/zh-cn/reference/)中该动作的旁边。默认的下限是：
editor → `content`；developer → `content`、`code`；admin → `content`、`code`、`site`；
owner → 全部。Site 或 workspace 的策略可以把一个角色收窄到下限以下，但永远不能放宽。API key
再加一层收窄：它的 scope（见[身份认证](/zh-cn/authentication/)）。

## 内容地图

无论是哪种 CMS，Content API 都以同一种形态描述一个 Site。由外向内：

- **页面（Page）**——线上 Site 的一个地址，属于一种 locale，列出它所展示的内容。
  `GET /v1/sites/{key}/pages` 返回每一个已发布的页面，以及该列表的一个 `version`。
- **内容（Content）**——一个可编辑单元：一篇 post、一篇 article、一个菜单、一个共享区域。它有
  `id`、`type`（Site 的内容类型——Site 的 `describe` 会列出它们）、`locale`、`revision`、它的
  `blocks`，以及 `native`。
- **块（Block）**——内容的一个部分：一个标题、一个段落、一张图片、一个行动号召。块携带
  `fields`，以及一个 `visibility`（`visible`、`hidden`、`unknown`），说明线上页面是否显示它们。
- **字段（Field）**——块内的一个值：一段文字、一个链接、一个图片路径——文字在这一层被读取，并
  通过它们所属的记录被写入。
- **槽位（Slot）**——在由 Tracy quickstart 构建的 Site 上，一个由设计保持填充的命名位置
  （`hero.0`、`footer.contact`）。槽位是 `POST …/contract/apply` 的地址，该操作在写入任何东西
  之前，会对照 Site 的内容契约检查每一处改动。
- **`native`**——内容所来自的 CMS 数据行：记录的 `kind` 和 `id`（在 WordPress 上还有 `key`），
  即 `PATCH …/records/{kind}/{id}` 所修改的对象。它是从统一地图通往 Site 自身数据的桥梁；各
  指南列出了每种 CMS 的 kind。

`GET /v1/sites/{key}/contents` 列出内容（按 `type` 和 `locale` 过滤，用 `limit` 和 `cursor`
分页，用 `fields` 精简，用 `maxBytes` 限制响应大小）；`GET …/contents/{id}` 详细读取一个内容，
块用 `blockId` 和 `blocksCursor` 分页。

## 记录

**记录**（record）是 CMS 中按 Site 实际持有方式存放的一行数据——内容地图之下的那个表面。在
Joomla 上：`article`、`category`、`menuItem`、`module`、`templateStyle` 等；在 WordPress 上：
`post`、`postmeta`、`option`、`templatePart`、`term`、`menuItem`。`GET …/records/{kind}` 列出
一页，`GET …/records/{kind}/{id}` 读取一行（没有数字 id 的 WordPress kind 使用 `?key=`），
`PATCH` 写入字段，`DELETE` 把它移到回收站。记录没有 revision 检查——`PATCH` 写入的就是你发送
的内容；先读取，并且让写入保持小粒度。

## Revision、version 与 `changedSince`

- 内容的 **`revision`** 在该内容变化时改变。`GET …/contents/{id}` 以 `ETag` 的形式返回它；带着
  同一个值的 `If-None-Match` 会回答 `304`。
- 页面列表有一个 **`version`**。`GET …/changes?since=<version>` 返回自那以后的变动：被修改、
  新增或移除的内容，以及一个可以继续使用的新 `version`。把最后一个 `version` 作为
  `If-None-Match` 发回来，就能以很低的代价得知没有任何变动。
- **`changedSince` 的局限，直白地说。** Version 保存在 Tracy 进程的内存中，保留 **30 分钟**，
  最多 **500 次遍历**；它不是持久日志。当一个 version 太旧、来自重启之前、或来自另一个席位时，
  回答是 `409 CONTENT_SNAPSHOT_EXPIRED`——不带 `since` 重新读取 `/pages`，然后从它的新
  `version` 继续。
- **`If-Match`** 只在 Site 能保证该检查的地方生效：`POST …/contract/apply` 把它作为期望的内容
  revision 传递，过期的 revision 回答 `409` 和 `REVISION_STALE`。记录的 `PATCH`/`DELETE` 不
  接受 `If-Match`。

## 撤销：`apply_id` 与 revert

每一次写入都记录在一个 **`apply_id`** 之下——一份回执，你在 `Tracy-Apply-Id` 请求头中为它命名
（或者由 Tracy 替你命名：`api-<keyId>-<timestamp>`）。多次写入可以共用一份回执；`DELETE` 要求你
必须命名一个。

- `GET /v1/sites/{key}/applies`——该 Site 各次应用的审计轨迹。
- `GET …/applies/{id}`——记录在一份回执下的各个步骤（kind、id、媒体路径、created）。
- `POST …/applies/{id}/revert`——恢复每一个步骤，从最新的开始；一条正在 CMS 编辑器中打开的
  记录会拒绝恢复，回答中会说明谁持有它（`lockedBy`）。

契约应用（`POST …/contract/apply`）以同样的方式撤销；它们的回执以 `contract-` 开头。

## 幂等性

`PATCH …/records/{kind}/{id}` 接受 **`Idempotency-Key`** 请求头。在响应丢失后带着同一个值
重试，回答的是已保存的结果，而不会再次写入。它作为插件的 `request_id` 传递给 Site，因此只对
其插件会存储结果的动作有效——`content.update`（记录的 `PATCH`）以及 Joomla 上的
`content.batch`。其他路由不承诺幂等性。

## 插件版本

在 Joomla 和 WordPress 上，Site 通过安装在其上的 **Claude Cowork 插件**作答，每个动作都从该
插件的某个发布版本开始存在。`GET /v1/sites/{key}`（Site 的 `describe`）报告 Site 实际运行的
版本；[兼容性](/zh-cn/reference/compatibility/)页面列出每个动作所需的最低版本，各指南则
说明如何更新。已安装版本所缺少的动作回答 `400 bad_action`；在早于 Content API 的插件上进行
Content API 读取，回答 `501 CONTENT_ADAPTER_UNSUPPORTED`。

EmDash Site 没有插件：Tracy 通过自己的读取器读取它们（见
[EmDash 指南](/zh-cn/guides/emdash/)）。

## 设计系统

Tracy 构建的每个 Site 都使用一套**设计系统**：有名称的配色、字号层级和间距，以 CSS 自定义属性（token）保存。
`GET /v1/sites/{key}/design` 返回 Site 使用的是哪一套、它的来源（`source`：目录中的系统、客户自己的 `brand`、某个
`quickstart` 自带的 token、`template` 的 token，或 `none`），以及 Site 当前使用的 token 值。Tracy 在构建 Site 时
记录这些值，并在每次 `theme.style` 切换外观时重新记录，因此答案跟随 Site 本身，而不是它最初的模板。请用这些 token
让你写入的内容保持在 Site 的配色和字体之内——超出它们的颜色或字体，正是 Tracy 的设计检查会标记的内容。

```json
{
  "design": {
    "id": "apple",
    "name": "Apple",
    "source": "catalog",
    "platform": "wordpress",
    "tokens": { "--accent": "#0071e3", "--font-body": "\"SF Pro Text\", sans-serif" },
    "tokensFrom": "tracy-web:design-tokens.json",
    "updatedAt": "2026-09-29T12:00:00.000Z"
  }
}
```

`{"design": null}` 是一个答案，而不是错误：该 Site 没有使用 Tracy 已知的系统。ETag 跟随 `updatedAt`，
因此在外观改变之前，`If-None-Match` 都返回 `304`。
