---
title: Schnellstart
description: Fünf curl-Aufrufe — einen Schlüssel erstellen, ihn prüfen, die Seiten einer Site auflisten, einen Titel ändern und das Ganze rückgängig machen.
---

Du brauchst einen Sitz auf einer von Tracy gehosteten Site (jede Rolle genügt) und `curl`. Jeder Aufruf
unten geht an `https://api.tracy.ai` (in der Entwicklungsumgebung `https://api.tracy.site`) und trägt den
Schlüssel als Bearer-Token. Nichts hier verwendet eine Browser-Sitzung.

## 1. Einen Schlüssel erstellen

Öffne die Site in Tracy, geh zu **Settings → API keys** und erstelle einen Schlüssel für diese Site. Wähle
eine Bezeichnung (zum Beispiel `demo laptop`) und die Scopes, die er verwenden darf — `content` reicht für
diese Seite.

Der vollständige Schlüssel wird **einmal** angezeigt: `trk_<16 characters>.<32 characters>`. Bewahre ihn
dort auf, wo du deine Secrets hältst; Tracy speichert nur einen Hash davon. Die Schlüsselliste zeigt zu
jedem Schlüssel einen Hinweis, niemals das Secret.

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. Prüfen, als wer der Schlüssel handelt

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

Ein Schlüssel ist an ein Konto und eine Site gebunden. `siteKey` ist der kanonische Name der Site und der
Wert von `{key}` in jedem Pfad unten.

## 3. Die Seiten der Site auflisten

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

Die Antwort ist das `pages`-Dokument der Content API: jede veröffentlichte Seite mit ihrer `contentId`,
`locale`, `url` und `revision`, plus eine `version` der gesamten Liste. Die Antwort trägt einen `ETag`,
der dieser Version entspricht; schick ihn als `If-None-Match` zurück, und die Antwort lautet
`304 Not Modified`, wenn sich nichts bewegt hat.

Einen Inhalt vollständig lesen (Blöcke, Felder, die CMS-Zeilen, aus denen er stammt):

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

Jeder Inhalt nennt seinen `native`-Datensatz — die CMS-Art und -ID, in der die Wörter liegen. Genau das
ändert der nächste Schritt.

## 4. Einen Titel ändern

Datensätze sind die eigenen Zeilen der Site: ein Joomla-`article`, ein WordPress-`post` und so weiter. Ein
`PATCH` schreibt die angegebenen Felder eines Datensatzes und protokolliert, wie er rückgängig zu machen
ist, unter einer `apply_id`, die du wählst (Header `Tracy-Apply-Id`; Tracy erzeugt
`api-<keyId>-<timestamp>`, wenn du ihn weglässt).

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

Auf Joomla lautet dieselbe Änderung `records/article/<id>` mit `{ "fields": { "title": "…" } }`. Die
Änderung ist sofort live. Ein erneuter Versuch mit demselben `Idempotency-Key` nach einer verlorenen
Antwort liefert das gespeicherte Ergebnis, statt zweimal zu schreiben.

## 5. Rückgängig machen

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

Alles, was unter `quickstart-title-1` protokolliert wurde, wird wiederhergestellt, das Neueste zuerst. `GET
…/applies/quickstart-title-1` listet auf, was der Beleg enthält, bevor du ihn zurücknimmst.

## Was du als Nächstes lesen solltest

- [Authentifizierung](/de/authentication/) — was ein Schlüssel darf und was er niemals darf.
- [Konzepte](/de/concepts/) — Seiten, Inhalte, Blöcke, Felder, Slots, Datensätze, Revisionen und Rückgängigmachen.
- [Leitfäden](/de/guides/joomla/) — was sich auf Joomla, WordPress und EmDash unterscheidet.
- [API-Referenz](/de/reference/) — jede Route, jeder Parameter und jede Antwort, mit **Test request**.
