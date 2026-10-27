---
title: EmDash
description: EmDash Site 没有 Claude Cowork 插件——Tracy 通过自己的读取器读取它，而写入则经由该 Site 自己的 REST 与 MCP API。
---

## 由什么响应调用

**EmDash** Site 不带 Claude Cowork 插件。读取经由 **Tracy 自己的读取器**，它与 Site 的 EmDash
API 对话，并返回与另外两种 CMS 相同的 Content API 文档：`GET /v1/sites/{key}`（describe）、
`…/pages`、`…/contents`、`…/contents/{id}` 和 `…/changes` 全都可用，并且 `ETag`、`version` 和
`changedSince` 的行为相同。

读取器没有自己的版本可供检查：它随 Tracy 一起发布，所以[兼容性](/zh-cn/reference/compatibility/)
表格的 EmDash 一列不显示最低版本。Tracy 读取 Site 所持有的内容，并在某个集合没有 site model
时如实说明。

## 写入：Site 自己的 API

`records` 路由、`contract` 操作和撤销回执，在 Joomla 和 WordPress 上由 Claude Cowork 插件
作答；EmDash Site 没有该插件，所以在 EmDash 上它们回答 `501 CONTENT_ADAPTER_UNSUPPORTED`
（读取器不提供的读取）或 `unsupported`。

要修改一个 EmDash Site，请使用**它自己的 REST 与 MCP API**，EmDash 在 Site 本身的
`/_emdash/api/openapi.json` 提供了文档，并使用该 Site 签发的凭据。Tracy agent 在那里也是
同样的工作方式：通过 Tracy 读取，通过 EmDash 的 MCP 写入。

## 与 Joomla 和 WordPress 的不同之处

| | Joomla / WordPress | EmDash |
|---|---|---|
| 读取（`content.read`） | Claude Cowork 插件，自 0.18.0 / 0.14.0 版本起 | Tracy 读取器，始终如此 |
| `content.locate`（哪条记录输出了某个元素） | 支持 | 支持 |
| 记录的 `PATCH` / `DELETE`、契约应用、撤销 | 插件 | 不经由 Tracy——使用 Site 自己的 API |
| 内容类型 | 插件对 CMS 的映射 | 每个集合一种类型，来自模板的 `content-api-map.json` |
| `native` | CMS kind + id | EmDash 的集合与条目 |

## 需要注意的事项

- 不附带 site model 的模板，其 `describe` 回答的是读取器能够推断出的内容，并会如实说明；不要
  期望这样的 Site 上有槽位。
- `changedSince` 与其他平台一样有 30 分钟 / 500 次遍历的限制；遇到
  `409 CONTENT_SNAPSHOT_EXPIRED` 时重新读取 `/pages`。
