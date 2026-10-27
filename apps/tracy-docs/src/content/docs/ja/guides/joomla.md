---
title: Joomla
description: Joomla サイトで応答するもの — Claude Cowork コンポーネント — その最小リリース、レコードの kind、そして Joomla だけが提供するもの。
---

## 呼び出しに応答するもの

Joomla サイトは、インストールされた **Claude Cowork コンポーネント**（パッケージ
`joomla-v…`）を通じて応答します。Tracy はあなたのキーとシートを認可し、その後サイト自身のドアを通じてアクションを
コンポーネントに中継します。コンポーネントは Joomla 自身の API を通じて Joomla のデータベースを読み書きし、
何が起きたかを応答します。それ以外の方法でサイトのファイルやデータベースに到達するものはありません。

このサイトの記述の基準となっているのはコンポーネントリリース **0.18.4** です。`GET /v1/sites/{key}`
（サイトの `describe`）は、サイトが実際に実行しているリリースを報告します。

## 最小リリース

完全な表は[互換性](/ja/reference/compatibility/)ページに生成されます。`/v1` ルートが
依存するものは次のとおりです。

| ルート | アクション | Joomla コンポーネント |
|---|---|---|
| `GET …/pages`、`…/contents`、`…/changes`、`GET /v1/sites/{key}` | `content.read` | 0.18.0（`native` は 0.18.2、1 回の読み取りで複数 id は 0.18.3） |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0（`If-Match` → `expected_content_revisions` は 0.18.0） |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

インストールされたリリースに存在しないアクションは `400 bad_action` を返します。コンポーネントは Tracy から
（エージェントは `extension.install` を通じて新しいリリースをインストールできます）、または Joomla 自身の拡張機能
マネージャーから更新してください。

## レコードの kind

`records` ルートの `{kind}` は、Joomla の書き込み可能な kind のいずれかです：`article`、`category`、`tag`、
`field`、`menuItem`、`menutype`、`redirect`、`banner`、`bannerClient`、`contact`、`newsfeed`、
`language`、`articleAssociation`、`menuAssociation`、`moduleAssignment`、`languageFilter`、
`module`、`templateStyle`、`user`、`extensionParams`。`content.list` のデフォルトは `article` です。

レコードは数値の `id` で指定します。フィールドはテーブルの列です：記事の `title`、
`introtext`、`fulltext`、`state`、`catid`、メニュー項目の `title`、`alias`、`parent_id`。既存の
メニュー項目、カテゴリー、タグでは、`parent_id` または `move_after` がその配下のすべてとともに移動させます。

## Joomla だけが提供するもの

- **トランザクション。** `content.batch` は、`expected` による事前チェック付きで、最大 100 レコードを 1 つの
  データベーストランザクションで書き込みます。すべてが反映されるか、何も反映されないかのいずれかです。これは Apply ドアの
  アクションであり、（まだ）`/v1` ルートではありません。
- **多言語およびデモトリムのコントラクト操作。** `POST …/contract/{operation}` の `multilingual.*`、`demoTrim.*`、
  `siteLanguage.*`、`sourceLanguage.*` のすべての操作は、サイトのクイックスタートがそのプロファイルを同梱している場合に
  応答します。WordPress は `multilingual.retire` と
  `multilingual.restore` のみに応答します。
- **データベーススナップショット**（`db.snapshot`、`db.rollback`）と **コアのアップグレード**（`core.upgrade`）は
  `site` および `code` ツールセット向けに Apply ドア上に存在します。`/v1` では公開されていません。

## 注意点

- **ロックされたレコード。** Joomla のエディターで開かれている（チェックアウトされている）レコードは、書き込みを `409
  locked` で拒否し、`lockedBy` を示します。その人に閉じてもらってください。上書きする方法はありません。
- **削除ではなくゴミ箱。** `DELETE …/records/{kind}/{id}` はその kind のゴミ箱状態を設定し、`revert` が
  元に戻します。ゴミ箱状態を持たない kind は拒否されます。
- **コントラクトサイト。** Tracy のクイックスタートから構築されたサイトはコンテンツコントラクトを持ちます。デザインの
  スロットには `POST …/contract/apply` を優先してください。書き込む前に制限、エビデンス、ロックをチェックし、
  全か無かで拒否します。
