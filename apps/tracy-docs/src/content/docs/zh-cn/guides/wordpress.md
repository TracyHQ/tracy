---
title: WordPress
description: 在 WordPress Site 上由什么作答——Claude Cowork 插件——它的最低版本、它的记录 kind 与 key，以及它与 Joomla 的不同之处。
---

## 由什么响应调用

WordPress Site 通过安装在其上的 **Claude Cowork 插件**作答（包名 `wordpress-v…`）。Tracy 先
授权你的密钥和席位，再通过 Site 自己的入口把动作转发给该插件；插件通过 WordPress 自己的函数
读写，并回答发生了什么。

编写本站时所参照的插件版本是 **0.14.3**。`GET /v1/sites/{key}`（Site 的 `describe`）报告 Site
实际运行的版本。

## 最低版本

完整表格生成在[兼容性](/zh-cn/reference/compatibility/)页面上。`/v1` 路由所依赖的部分：

| 路由 | 动作 | WordPress 插件 |
|---|---|---|
| `GET …/pages`、`…/contents`、`…/changes`、`GET /v1/sites/{key}` | `content.read` | 0.14.0（`native` 0.14.2，一次读取多个 id 0.14.3） |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0（`If-Match` → `expected_content_revisions` 0.14.0） |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

已安装版本所缺少的动作回答 `400 bad_action`。可从 Tracy 更新插件（agent 可以通过
`plugin.install` 安装更新的版本），或者从 Site 的插件页面更新。

## 记录 kind 与 key

`{kind}` 是 `post`、`postmeta`、`option`、`templatePart`、`term`、`menuItem` 之一。

- **`post`** 涵盖所有 post type——页面、文章、自定义类型。`GET …/records/post` 只列出文章；
  用 `?post_type=` 缩小范围，或用 `?name=` 查找某个 slug。其他 kind 一次读取一条。
- **key 与 id 并用。** `option`（其名称）和 `templatePart`（其 slug：`header`、`footer`）没有数字
  id：`{id}` 用 `0`，并用 key 指定记录。`postmeta` 条目以文章 ID 作为 `{id}`、以 meta key 作为
  key；`term` 以 term ID 作为 `{id}`、以分类法作为 key；`menuItem` 以自身 ID 作为 `{id}`、以所属
  菜单（slug 或名称）作为 key。`GET` 和 `DELETE` 通过查询参数 `?key=`
  传 key（`GET …/records/option/0?key=blogname`）；`PATCH` 在请求体中用 `"key"` 传。
- **可以删除的内容。** `DELETE` 接受 `post`、`templatePart` 和 `menuItem`。删除 `menuItem` 时，
  请用 `?key=` 传入其所属菜单：不传的话删除照样成功，但 `revert` 无法把该条目写回。`option` 和
  `postmeta` 条目不能删除：请改为写入空值。`term` 同样不能删除：`PATCH` 可以编辑，
  或以 `0` 作为 `{id}` 并提供 `name` 来新建（字段：`name`、`slug`、`description`、`parent`）。
- 字段是 WordPress 自己的字段：post 的 `post_title`、`post_content`、`post_status`、
  `post_name`；option 的 `value`。

## 与 Joomla 的不同之处

- **没有事务。** WordPress 没有 `content.batch`：多次写入就是多次请求，若想一次撤销，就把它们
  记录在同一个 `apply_id` 之下。如果其中一次失败，之前的写入会保持原样，直到你恢复这份回执。
- **契约操作。** `POST …/contract/{operation}` 响应 `inspect`、`bind`、`apply`、
  `demoTrim.*`（`plan`、`apply`、`revert`）、`siteLanguage.*` 和 `sourceLanguage.*`；多语言家族中只响应 `multilingual.retire` 和
  `multilingual.restore`。`inspect`/`bind` 接受 `contract`，即用来对照检查的 profile。
- **翻译。** 语言由 Site 的翻译插件（Polylang）通过 Apply 入口动作 `content.language`
  （插件 0.9.0）处理，核心翻译则由 `language.install`（0.11.0）处理。目前两者都不是 `/v1`
  路由。
- **主题。** `theme.style` 应用当前区块主题的一个样式变体（0.8.1）；主题和插件从包 URL 安装。
  这些需要 `code` 工具集，并且是 Apply 入口的动作。
- **致命错误。** 插件内部的 PHP 致命错误回答 `500 fatal`，并附带文件和行号；调用可能已经部分
  执行——重试之前先读取 Site。

## 需要注意的事项

- **被锁定的记录。** 在区块编辑器中打开的 post 会以 `409 locked` 拒绝写入，并给出
  `lockedBy`。
- **只有文章进回收站。** 对 `post` 的 `DELETE` 使用 WordPress 自己的回收站。`templatePart` 和
  `menuItem` 会被永久删除；`revert` 会根据随 apply 保存的副本将其写回。
- `GET …/contents/{id}` 上的 **`itemsCursor`** 在 WordPress 上可以被识别，但尚未提供服务
  （`501 CONTENT_ADAPTER_UNSUPPORTED`）；请改用 `blocksCursor` 对块分页。
