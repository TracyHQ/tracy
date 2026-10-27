---
title: Joomla
description: 在 Joomla Site 上由什么作答——Claude Cowork 组件——它的最低版本、它的记录 kind，以及只有 Joomla 才提供的能力。
---

## 由什么响应调用

Joomla Site 通过安装在其上的 **Claude Cowork 组件**作答（包名 `joomla-v…`）。Tracy 先授权你的
密钥和席位，再通过 Site 自己的入口把动作转发给该组件；组件通过 Joomla 自己的 API 读写 Joomla
的数据库，并回答发生了什么。没有任何其他途径能触及 Site 的文件或数据库。

编写本站时所参照的组件版本是 **0.18.4**。`GET /v1/sites/{key}`（Site 的 `describe`）报告 Site
实际运行的版本。

## 最低版本

完整表格生成在[兼容性](/zh-cn/reference/compatibility/)页面上。`/v1` 路由所依赖的部分：

| 路由 | 动作 | Joomla 组件 |
|---|---|---|
| `GET …/pages`、`…/contents`、`…/changes`、`GET /v1/sites/{key}` | `content.read` | 0.18.0（`native` 0.18.2，一次读取多个 id 0.18.3） |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0（`If-Match` → `expected_content_revisions` 0.18.0） |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

已安装版本所缺少的动作回答 `400 bad_action`。可从 Tracy 更新组件（agent 可以通过
`extension.install` 安装更新的版本），或者从 Joomla 自己的扩展管理器更新。

## 记录 kind

`records` 路由中的 `{kind}` 是 Joomla 可写 kind 之一：`article`、`category`、`tag`、
`field`、`menuItem`、`menutype`、`redirect`、`banner`、`bannerClient`、`contact`、`newsfeed`、
`language`、`articleAssociation`、`menuAssociation`、`moduleAssignment`、`languageFilter`、
`module`、`templateStyle`、`user`、`extensionParams`。`content.list` 默认为 `article`。

记录通过其数字 `id` 定位。字段就是数据表的列：article 的 `title`、`introtext`、`fulltext`、
`state`、`catid`；菜单项的 `title`、`alias`、`parent_id`。在已有的菜单项、分类或标签上，
`parent_id` 或 `move_after` 会把它连同其下的所有内容一起移动。

## 只有 Joomla 才提供的能力

- **事务。** `content.batch` 在一个数据库事务中写入最多 100 条记录，并带有 `expected` 预检——
  要么全部落地，要么一条也不写。它是 Apply 入口的动作，（暂时）不是 `/v1` 路由。
- **多语言与 demo-trim 契约操作。** 当 Site 的 quickstart 附带相应 profile 时，
  `POST …/contract/{operation}` 的每一个 `multilingual.*`、`demoTrim.*`、`siteLanguage.*` 和
  `sourceLanguage.*` 操作都会得到响应；WordPress 只响应 `multilingual.retire` 和
  `multilingual.restore`。
- **数据库快照**（`db.snapshot`、`db.rollback`）和**核心升级**（`core.upgrade`）存在于 Apply
  入口上，属于 `site` 和 `code` 工具集；它们没有暴露在 `/v1` 上。

## 需要注意的事项

- **被锁定的记录。** 在 Joomla 编辑器中打开（已签出）的记录会以 `409 locked` 拒绝写入，并给出
  `lockedBy`。请那个人关闭它；没有办法强行覆盖写入。
- **回收站，而非删除。** `DELETE …/records/{kind}/{id}` 设置该 kind 的回收站状态；`revert`
  会把它恢复回去。没有回收站状态的 kind 会被拒绝。
- **契约 Site。** 由 Tracy quickstart 构建的 Site 带有一份内容契约。对于设计的槽位，优先使用
  `POST …/contract/apply`：它在写入之前检查限制、证据和锁，并且要么全部拒绝、要么全部通过。
