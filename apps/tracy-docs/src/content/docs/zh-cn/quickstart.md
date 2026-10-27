---
title: 快速开始
description: 五次 curl 调用——创建密钥、检查它、列出 Site 的页面、修改一个标题，再撤销它。
---

你需要在一个 Tracy 托管的 Site 上持有席位（任何角色均可），以及 `curl`。下面每一次调用都发往
`https://api.tracy.ai`（开发环境为 `https://api.tracy.site`），并以 Bearer token 的形式携带
密钥。这里没有任何步骤使用浏览器会话。

## 1. 创建密钥

在 Tracy 中打开该 Site，进入 **Settings → API keys**，为这个 Site 创建一个密钥。选一个标签
（例如 `demo laptop`）以及它可以使用的 scope——对本页而言，`content` 就够了。

完整的密钥**只显示一次**：`trk_<16 characters>.<32 characters>`。把它存放在你保管其他机密的
地方；Tracy 只保留它的哈希值。密钥列表只显示每个密钥的提示片段，绝不显示密钥本身。

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. 检查密钥以谁的身份行事

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

一个密钥绑定到一个账户和一个 Site。`siteKey` 是该 Site 的规范名称，也是下面每条路径中
`{key}` 的取值。

## 3. 列出 Site 的页面

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

返回的是 Content API 的 `pages` 文档：每一个已发布的页面及其 `contentId`、`locale`、`url` 和
`revision`，外加整个列表的 `version`。响应带有一个等于该 version 的 `ETag`；把它作为
`If-None-Match` 发回来，在没有任何变动时，回答就是 `304 Not Modified`。

完整读取一个内容（块、字段，以及它来自的 CMS 数据行）：

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

每个内容都会给出它的 `native` 记录——文字实际所在的 CMS kind 和 id。下一步要修改的正是它。

## 4. 修改一个标题

记录（record）是 Site 自己的数据行：Joomla 的 `article`、WordPress 的 `post`，等等。一次
`PATCH` 写入一条记录的指定字段，并把撤销方法记录在一个由你选择的 `apply_id` 之下
（请求头 `Tracy-Apply-Id`；省略时 Tracy 会生成 `api-<keyId>-<timestamp>`）。

```bash
curl -s -X PATCH "$TRACY_API/sites/shop.example.com/records/post/42" \
  -H "Authorization: Bearer $TRACY_KEY" \
  -H "Content-Type: application/json" \
  -H "Tracy-Apply-Id: quickstart-title-1" \
  -H "Idempotency-Key: quickstart-title-1-try-1" \
  -d '{ "fields": { "post_title": "Fresh bread every morning" } }'
```

```json
{ "kind": "post", "id": 42, "created": false }
```

在 Joomla 上，同样的改动是 `records/article/<id>`，请求体为 `{ "fields": { "title": "…" } }`。
改动即时生效。若响应丢失后带着同一个 `Idempotency-Key` 重试，回答的是已保存的结果，而不会
写入第二次。

## 5. 撤销它

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

记录在 `quickstart-title-1` 之下的一切都会被恢复回去，从最新的开始。在恢复之前，`GET
…/applies/quickstart-title-1` 可以列出这份回执里记录了什么。

## 接下来读什么

- [身份认证](/zh-cn/authentication/)——密钥可以做什么，以及它永远不能做什么。
- [核心概念](/zh-cn/concepts/)——页面、内容、块、字段、槽位、记录、revision 和撤销。
- [指南](/zh-cn/guides/joomla/)——Joomla、WordPress 和 EmDash 各有什么不同。
- [API 参考](/zh-cn/reference/)——每一条路由、参数和响应，附带 **Test request**。
