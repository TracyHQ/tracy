---
title: コンセプト
description: サイトとサイトキー、シート、ロールとツールセット、コンテンツマップ（content、block、field、slot、native）、リビジョンとバージョン、取り消し、そしてプラグインのバージョン。
---

## サイトとサイトキー

**サイト** は、Tracy がホストまたはインポートした 1 つの顧客ウェブサイトです。独自のアドレスを持つ Joomla、
WordPress、または EmDash のインストールです。その **サイトキー** はサイトの正規名（たとえば
`shop.example.com`）であり、すべてのパスに現れます：`/v1/sites/{key}/…`。サイトはエイリアスでも到達できます。
Tracy は認可の前にキーを正規化するため、どの名前を使っても応答は同じです。未知のキーは `404` を返します。

## シート、ロール、ツールセット

**シート** は 1 人の人物による 1 つのサイトへのメンバーシップであり、**ロール**（`owner`、`admin`、`developer`、
`editor`）を持ちます。ロールは **ツールセット** を付与します。ツールセットとは、すべてのアクションが属する 4 つの系統です。

| ツールセット | 対象 |
|---|---|
| `content` | 文言、画像、リンク：レコード、コンテンツ、コントラクト apply、メディアのアップロード、取り消し |
| `code` | テンプレート、モジュール、拡張機能、テーマ、プラグイン、およびそれらが定義するレイアウト |
| `site` | サイトのデータ全体：データベーステーブル、ダンプ、スナップショット |
| `lifecycle` | サイトのビルド、リリース、復元、削除 |

各アクションに必要なツールセットは、[API リファレンス](/ja/reference/)の各アクションの横に記載されています。
デフォルトの下限は次のとおりです：editor → `content`、developer → `content`、`code`、admin → `content`、`code`、
`site`、owner → すべて。サイトまたはワークスペースのポリシーはロールを下限より狭めることはできますが、広げることは
決してできません。API キーはさらにもう 1 段の絞り込みを加えます。それがスコープです（[認証](/ja/authentication/)を参照）。

## コンテンツマップ

Content API は、CMS が何であれサイトを 1 つの形で記述します。外側から内側へ：

- **Page（ページ）** — 公開サイトの 1 つのアドレス。1 つのロケールに属し、表示するコンテンツを列挙します。
  `GET /v1/sites/{key}/pages` は公開済みのすべてのページを、一覧の `version` とともに返します。
- **Content（コンテンツ）** — 編集可能な 1 つの単位：投稿、記事、メニュー、共有領域。`id`、
  `type`（サイトのコンテンツタイプ。サイトの `describe` が一覧します）、`locale`、`revision`、
  その `blocks`、そして `native` を持ちます。
- **Block（ブロック）** — コンテンツの 1 つの部分：見出し、段落、画像、コールトゥアクション。ブロックは
  `fields` と、公開ページがそれを表示するかどうかを示す `visibility`（`visible`、`hidden`、`unknown`）を
  持ちます。
- **Field（フィールド）** — ブロック内の 1 つの値：テキスト、リンク、画像パス。文言が読み取られ、そして
  それが属するレコードを通じて書き込まれるレベルです。
- **Slot（スロット）** — Tracy のクイックスタートから構築されたサイトにおいて、デザインが常に埋めておく名前付きの位置
  （`hero.0`、`footer.contact`）。スロットは `POST …/contract/apply` のアドレスであり、この操作は何かを書き込む前に
  すべての変更をサイトのコンテンツコントラクトと照合します。
- **`native`** — コンテンツの元となる CMS の行：`PATCH …/records/{kind}/{id}` が変更するレコードの `kind` と `id`
  （WordPress では加えて `key`）。統一されたマップからサイト自身のデータへの橋渡しです。各 CMS の kind は
  ガイドに列挙されています。

`GET /v1/sites/{key}/contents` はコンテンツを一覧します（`type` と `locale` で絞り込み、`limit` と
`cursor` でページング、`fields` で切り詰め、`maxBytes` で応答サイズを制限）。`GET …/contents/{id}` は 1 つを
詳細に読み取り、ブロックは `blockId` と `blocksCursor` でページングします。

## レコード

**レコード** は、サイトが保持するそのままの CMS の 1 行であり、コンテンツマップの下にあるサーフェスです。
Joomla では `article`、`category`、`menuItem`、`module`、`templateStyle` など。WordPress では
`post`、`postmeta`、`option`、`templatePart`、`term`、`menuItem`。`GET …/records/{kind}` は 1 ページを一覧し、
`GET …/records/{kind}/{id}` は 1 行を読み取り（数値 id を持たない WordPress の kind は `?key=` を取ります）、
`PATCH` はフィールドを書き込み、`DELETE` はゴミ箱に移動します。レコードにはリビジョンチェックがありません。`PATCH` は
送られたものをそのまま書き込みます。先に読み取り、書き込みは小さく保ってください。

## リビジョン、バージョン、`changedSince`

- コンテンツの **`revision`** は、そのコンテンツが変更されると変わります。`GET …/contents/{id}` はこれを
  `ETag` として返し、同じ値の `If-None-Match` は `304` を返します。
- ページ一覧には **`version`** があります。`GET …/changes?since=<version>` は、それ以降に動いたもの、
  すなわち変更・追加・削除されたコンテンツと、続きを取得するための新しい `version` を返します。最後の
  `version` を `If-None-Match` として送り返せば、何も動いていないことを低コストで知ることができます。
- **`changedSince` の限界を、率直に述べます。** バージョンは Tracy プロセスのメモリ内に **30 分間**、かつ
  最大 **500 回の参照** まで保持されます。永続的なログではありません。バージョンが古すぎる、再起動前のものである、
  または別のシートのものである場合、応答は `409 CONTENT_SNAPSHOT_EXPIRED` です。
  `since` なしで `/pages` を再度読み取り、その新しい `version` から続けてください。
- **`If-Match`** は、サイトがチェックを保証する場所でのみ尊重されます。`POST …/contract/apply` は
  これを期待されるコンテンツリビジョンとして渡し、古いリビジョンは `409` と
  `REVISION_STALE` を返します。レコードの `PATCH`/`DELETE` は `If-Match` を受け取りません。

## 取り消し：`apply_id` と revert

すべての書き込みは **`apply_id`** の下に記録されます。これは `Tracy-Apply-Id` ヘッダーであなたが名付けるレシート
（または Tracy が代わりに名付けます：`api-<keyId>-<timestamp>`）です。複数の書き込みが 1 つのレシートを共有できます。
`DELETE` では名前を指定する必要があります。

- `GET /v1/sites/{key}/applies` — サイトの apply の監査証跡。
- `GET …/applies/{id}` — 1 つのレシートの下に記録されたステップ（kind、id、メディアパス、created）。
- `POST …/applies/{id}/revert` — すべてのステップを新しいものから順に元に戻します。CMS のエディターで
  開かれているレコードは revert を拒否し、応答は誰が保持しているかを示します（`lockedBy`）。

コントラクト apply（`POST …/contract/apply`）も同じ方法で取り消されます。そのレシートは
`contract-` で始まります。

## べき等性

`PATCH …/records/{kind}/{id}` は **`Idempotency-Key`** ヘッダーを受け付けます。応答が失われた後に同じ値で
再試行すると、再度書き込む代わりに保存済みの結果が返されます。これはプラグインの `request_id` として
サイトに渡されるため、プラグインが結果を保存するアクション、すなわち
`content.update`（レコードの `PATCH`）と、Joomla では `content.batch` にのみ存在します。他のルートはこれを保証しません。

## プラグインのバージョン

Joomla と WordPress では、サイトはインストールされた **Claude Cowork プラグイン** を通じて応答し、
各アクションはそのプラグインの特定のリリース以降に存在します。`GET /v1/sites/{key}`（サイトの
`describe`）はサイトが実行しているものを報告します。[互換性](/ja/reference/compatibility/)ページは
アクションごとの最小リリースを一覧し、各ガイドは更新方法を説明します。インストールされたリリースに存在しない
アクションは `400 bad_action` を返します。Content API より古いプラグイン上での Content API 読み取りは
`501 CONTENT_ADAPTER_UNSUPPORTED` を返します。

EmDash サイトにはプラグインがありません。Tracy は独自のリーダーを通じてそれらを読み取ります
（[EmDash ガイド](/ja/guides/emdash/)を参照）。

## デザインシステム

Tracy が構築するすべてのサイトは、1 つの**デザインシステム**をまといます。名前の付いた配色、文字サイズの体系、
余白で、CSS カスタムプロパティ（トークン）として保持されます。`GET /v1/sites/{key}/design` は、どのシステムか、
その出どころ（`source`：カタログのシステム、顧客独自の `brand`、`quickstart` 独自のトークン、`template` のもの、
または `none`）、そしてサイトが現在使っているトークンの値を返します。Tracy はサイトの構築時と、`theme.style` が
見た目を切り替えるたびに記録するため、答えは最初のテンプレートではなくサイト自体に従います。書き込む内容をサイトの
配色とフォントの範囲に収めるためにトークンを使ってください。範囲外の色やフォントは、Tracy のデザインチェックが
指摘する対象です。

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

`{"design": null}` はエラーではなく答えです。サイトは Tracy が把握しているシステムを使っていません。ETag は
`updatedAt` に従うため、見た目が変わるまで `If-None-Match` は `304` を返します。
