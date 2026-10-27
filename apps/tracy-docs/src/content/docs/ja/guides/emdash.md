---
title: EmDash
description: EmDash サイトには Claude Cowork プラグインがありません — Tracy は独自のリーダーを通じて読み取り、書き込みはサイト自身の REST および MCP API を通じて行います。
---

## 呼び出しに応答するもの

**EmDash** サイトには Claude Cowork プラグインがありません。読み取りは **Tracy 自身のリーダー** を通じて行われます。
リーダーはサイトの EmDash API と通信し、他の 2 つの CMS と同じ Content API ドキュメントを応答します。
`GET /v1/sites/{key}`（describe）、`…/pages`、`…/contents`、`…/contents/{id}`、`…/changes` はすべて
動作し、`ETag`、`version`、`changedSince` の動作も同じです。

リーダーにはチェックすべき独自のリリースはありません。Tracy とともに出荷されるため、[互換性](/ja/reference/compatibility/)
表の EmDash 列には最小バージョンが表示されません。Tracy はサイトが保持しているものを読み取り、コレクションに
サイトモデルがない場合はその旨を伝えます。

## 書き込み：サイト自身の API

`records` ルート、`contract` 操作、取り消しのレシートは、Joomla と WordPress では Claude Cowork
プラグインが応答します。EmDash サイトにはプラグインがないため、EmDash ではこれらは
`501 CONTENT_ADAPTER_UNSUPPORTED`（リーダーが提供しない読み取り）または `unsupported` を返します。

EmDash サイトを変更するには、**サイト自身の REST および MCP API** を使用してください。これは EmDash によってサイト自身の
`/_emdash/api/openapi.json` に文書化されており、そのサイトが発行する資格情報を使います。Tracy エージェントも
そこでは同じように動作します。Tracy を通じて読み取り、EmDash の MCP を通じて書き込みます。

## Joomla および WordPress と異なる点

| | Joomla / WordPress | EmDash |
|---|---|---|
| 読み取り（`content.read`） | Claude Cowork プラグイン、リリース 0.18.0 / 0.14.0 以降 | Tracy リーダー、常に |
| `content.locate`（どのレコードが要素を出力したか） | あり | あり |
| レコードの `PATCH` / `DELETE`、コントラクト apply、取り消し | プラグイン | Tracy 経由ではない — サイト自身の API |
| コンテンツタイプ | プラグインによる CMS のマップ | コレクションごとに 1 タイプ、テンプレートの `content-api-map.json` から |
| `native` | CMS の kind + id | EmDash のコレクションとエントリ |

## 注意点

- サイトモデルを同梱していないテンプレートは、リーダーが推測できた内容で `describe` に応答し、
  その旨を伝えます。そのようなサイトでスロットを期待しないでください。
- `changedSince` には他のプラットフォームと同じ 30 分 / 500 回参照の制限があります。
  `409 CONTENT_SNAPSHOT_EXPIRED` の場合は `/pages` を再度読み取ってください。
