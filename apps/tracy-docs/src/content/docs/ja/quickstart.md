---
title: クイックスタート
description: 5 つの curl 呼び出し — キーの作成、確認、サイトのページ一覧、タイトルの変更、そして取り消し。
---

必要なのは、Tracy がホストするサイト上のシート（ロールは問いません）と `curl` です。以下のすべての呼び出しは
`https://api.tracy.ai`（開発環境では `https://api.tracy.site`）に送られ、キーを Bearer トークンとして
運びます。ここではブラウザーセッションは一切使いません。

## 1. キーを作成する

Tracy でサイトを開き、**Settings → API keys** に進んで、そのサイト用のキーを作成します。ラベル
（たとえば `demo laptop`）と、キーが使用できるスコープを選びます。このページでは `content` で十分です。

完全なキーは **一度だけ** 表示されます：`trk_<16 characters>.<32 characters>`。シークレットを保管している場所に
保存してください。Tracy はそのハッシュのみを保持します。キーの一覧には各キーのヒントが表示されますが、シークレットは決して表示されません。

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. キーが誰として動作するかを確認する

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

キーは 1 つのアカウントと 1 つのサイトに紐づいています。`siteKey` はサイトの正規名であり、以下のすべてのパスにおける
`{key}` の値です。

## 3. サイトのページを一覧する

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

応答は Content API の `pages` ドキュメントです。公開済みのすべてのページが、その `contentId`、
`locale`、`url`、`revision` とともに返され、さらに一覧全体の `version` が付きます。レスポンスにはそのバージョンと
等しい `ETag` が含まれます。それを `If-None-Match` として送り返すと、何も変わっていなければ応答は `304 Not Modified` になります。

1 つのコンテンツを完全な形（ブロック、フィールド、その元となる CMS の行）で読み取ります。

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

各コンテンツはその `native` レコード、つまり文言が実際に格納されている CMS の kind と id を示します。次のステップで
変更するのはこれです。

## 4. タイトルを 1 つ変更する

レコードはサイト自身の行です。Joomla の `article`、WordPress の `post` などです。`PATCH` は 1 つのレコードの
指定したフィールドを書き込み、その取り消し方法を、あなたが選ぶ `apply_id` の下に記録します
（ヘッダー `Tracy-Apply-Id`。省略すると Tracy が `api-<keyId>-<timestamp>` を生成します）。

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

Joomla では同じ変更は `records/article/<id>` に `{ "fields": { "title": "…" } }` を送ります。変更は
即時に反映されます。応答が失われた後に同じ `Idempotency-Key` で再試行すると、二重に書き込む代わりに保存済みの結果が
返されます。

## 5. 元に戻す

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

`quickstart-title-1` の下に記録されたすべてが、新しいものから順に元に戻されます。`GET
…/applies/quickstart-title-1` は、元に戻す前にそのレシートが保持している内容を一覧します。

## 次に読むもの

- [認証](/ja/authentication/) — キーができること、そして決してできないこと。
- [コンセプト](/ja/concepts/) — ページ、コンテンツ、ブロック、フィールド、スロット、レコード、リビジョン、取り消し。
- [ガイド](/ja/guides/joomla/) — Joomla、WordPress、EmDash で異なる点。
- [API リファレンス](/ja/reference/) — すべてのルート、パラメーター、応答。**Test request** 付き。
