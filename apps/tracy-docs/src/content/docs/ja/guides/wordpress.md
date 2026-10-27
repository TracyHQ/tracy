---
title: WordPress
description: WordPress サイトで応答するもの — Claude Cowork プラグイン — その最小リリース、レコードの kind と key、そして Joomla と異なる点。
---

## 呼び出しに応答するもの

WordPress サイトは、インストールされた **Claude Cowork プラグイン**（パッケージ
`wordpress-v…`）を通じて応答します。Tracy はあなたのキーとシートを認可し、その後サイト自身のドアを通じてアクションを
プラグインに中継します。プラグインは WordPress 自身の関数を通じて読み書きし、何が起きたかを
応答します。

このサイトの記述の基準となっているのはプラグインリリース **0.14.3** です。`GET /v1/sites/{key}`
（サイトの `describe`）は、サイトが実際に実行しているリリースを報告します。

## 最小リリース

完全な表は[互換性](/ja/reference/compatibility/)ページに生成されます。`/v1` ルートが
依存するものは次のとおりです。

| ルート | アクション | WordPress プラグイン |
|---|---|---|
| `GET …/pages`、`…/contents`、`…/changes`、`GET /v1/sites/{key}` | `content.read` | 0.14.0（`native` は 0.14.2、1 回の読み取りで複数 id は 0.14.3） |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0（`If-Match` → `expected_content_revisions` は 0.14.0） |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

インストールされたリリースに存在しないアクションは `400 bad_action` を返します。プラグインは Tracy から
（エージェントは `plugin.install` を通じて新しいリリースをインストールできます）、またはサイトのプラグイン画面から更新してください。

## レコードの kind と key

`{kind}` は `post`、`postmeta`、`option`、`templatePart`、`term`、`menuItem` のいずれかです。

- **`post`** はすべての投稿タイプ（固定ページ、投稿、カスタム投稿タイプ）を対象とします。`GET …/records/post` は
  投稿のみを一覧します。`?post_type=` で絞り込むか、`?name=` で 1 つのスラッグを検索してください。他の kind は 1 件ずつ読み取ります。
- **id と並ぶ key。** `option`（名前）と `templatePart`（スラッグ：`header`、`footer`）には数値 id が
  ありません。`{id}` に `0` を使い、key でレコードを指定します。`postmeta` エントリは `{id}` に投稿 ID、
  key にメタキーを取ります。`term` は `{id}` にターム ID、key にタクソノミーを取ります。`menuItem` は
  `{id}` に自身の ID、key に所属するメニュー（スラッグまたは名前）を取ります。`GET` と
  `DELETE` ではクエリの `?key=` で（`GET …/records/option/0?key=blogname`）、`PATCH` ではボディの
  `"key"` で指定します。
- **削除できるもの。** `DELETE` が受け付けるのは `post`、`templatePart`、`menuItem` です。`menuItem` を
  削除するときは、メニューを `?key=` で渡してください。渡さなくても削除は成功しますが、`revert` で
  エントリを書き戻せなくなります。`option` と `postmeta` エントリは削除できません。代わりに空の値を
  書き込んでください。`term` も削除できません。`PATCH` で編集するか、`{id}` に `0` を使い `name` を渡して新規作成します
  （フィールド：`name`、`slug`、`description`、`parent`）。
- フィールドは WordPress 自身のものです：投稿の `post_title`、`post_content`、`post_status`、`post_name`、
  オプションの `value`。

## Joomla と異なる点

- **トランザクションなし。** WordPress には `content.batch` がありません。複数の書き込みは複数のリクエストになり、
  1 回で取り消したい場合はそれぞれを同じ `apply_id` の下に記録します。1 つが失敗した場合、それ以前のものはレシートを
  revert するまで書き込まれたままです。
- **コントラクト操作。** `POST …/contract/{operation}` は `inspect`、`bind`、`apply`、
  `demoTrim.*`（`plan`、`apply`、`revert`）、`siteLanguage.*`、`sourceLanguage.*` に応答します。多言語系統のうちでは `multilingual.retire` と
  `multilingual.restore` のみです。`inspect`/`bind` は照合先のプロファイルである `contract` を受け取ります。
- **翻訳。** 言語はサイトの翻訳プラグイン（Polylang）によって、Apply ドアのアクション
  `content.language`（プラグイン 0.9.0）を通じて処理され、コアの翻訳は `language.install`
  （0.11.0）によって処理されます。どちらも現時点では `/v1` ルートではありません。
- **テーマ。** `theme.style` はアクティブなブロックテーマのスタイルバリエーションを 1 つ適用します（0.8.1）。テーマと
  プラグインはパッケージ URL からインストールされます。これらには `code` ツールセットが必要で、Apply ドアの
  アクションです。
- **致命的なエラー。** プラグイン内の PHP 致命的エラーは、ファイルと行番号とともに `500 fatal` を返します。
  呼び出しは部分的に実行された可能性があるため、再試行の前にサイトを読み取ってください。

## 注意点

- **ロックされたレコード。** ブロックエディターで開かれている投稿は、書き込みを `409 locked` で拒否し、
  `lockedBy` を示します。
- **ゴミ箱は投稿のみ。** `post` への `DELETE` は WordPress 自身のゴミ箱を使います。`templatePart` と
  `menuItem` は完全に削除され、`revert` は apply とともに保存されたコピーから書き戻します。
- `GET …/contents/{id}` の **`itemsCursor`** は WordPress では認識されますが、まだ提供されていません
  （`501 CONTENT_ADAPTER_UNSUPPORTED`）。代わりに `blocksCursor` でブロックをページングしてください。
