---
title: Authentifizierung
description: Sitzgebundene API-Schlüssel — was ein Schlüssel ist, was er darf, wie er gesendet, widerrufen und ratenbegrenzt wird und was der API-Host niemals akzeptiert.
---

## Ein Schlüssel ist ein Sitz, eingeengt

Jeder API-Schlüssel gehört zu **einem Konto und einer Site**. Wer ihn erstellt, muss einen aktiven Sitz auf
dieser Site halten, und der Schlüssel handelt **als diese Person**: jeder Lese- und Schreibvorgang wird
unter ihrem Namen autorisiert, mit einer Lease versehen und protokolliert. Es gibt keinen Schlüssel, der
„alle meine Sites“ erreicht — eine Site, ein Schlüssel.

Was der Schlüssel darf, ist die Schnittmenge zweier Dinge:

1. **Die effektiven Berechtigungen des Sitzes** — die Werkzeugsätze, die die Richtlinie der Site oder des
   Workspace der Rolle gewährt (`owner`, `admin`, `developer`, `editor`). Ein Owner hält jeden
   Werkzeugsatz; ein Editor standardmäßig nur `content`.
2. **Die Scopes des Schlüssels** — eine Teilmenge von `content`, `code`, `site`, `lifecycle`, gewählt beim
   Erstellen des Schlüssels.

Ein Schlüssel kann niemals mehr als der Sitz seines Inhabers. Wird eine Rolle in der Workspace-Richtlinie
eingeengt, engt das jeden Schlüssel ein, den diese Person erstellt hat; einem Schlüssel einen Scope zu
geben, den sein Inhaber nicht hat, gewährt nichts (der Aufruf antwortet mit `403 TOOLSET_NOT_GRANTED`).
Selbst der Schlüssel eines Owners mit `scopes: ["content"]` kann keinen Code ändern.

Lesevorgänge brauchen einen aktiven Schlüssel auf der richtigen Site mit mindestens einem Scope. Die
`records`-Routen sind eine rohe Oberfläche (die eigenen Zeilen des CMS); die Routen `pages`, `contents` und
`changes` sind die Content-API-Sicht auf dieselbe Site, und beide werden auf dieselbe Weise geprüft.

## Den Schlüssel senden

```http
GET /v1/sites/shop.example.com/pages HTTP/1.1
Host: api.tracy.ai
Authorization: Bearer trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

- Das Schema ist `Bearer`, der Header ist `Authorization`, und der Schlüssel ist die gesamte Zeichenkette
  `trk_<id>.<secret>`.
- **Nur Bearer, nur auf dem API-Host.** `api.tracy.ai` liest kein Sitzungs-Cookie: eine Browser-Sitzung
  auf `cowork.tracy.ai` ist hier kein Berechtigungsnachweis, und eine Anfrage, die das Cookie trägt, wird
  behandelt, als trüge sie nichts. Ein fehlender oder fehlerhafter Schlüssel antwortet mit
  `401 KEY_INVALID`.
- Ein Schlüssel, der an Tracys eigenen Hostnamen (`cowork.tracy.ai`) gesendet wird, wird ignoriert: diese
  Routen nehmen das Sitzungs-Cookie oder die signierte Zusicherung des Agenten, niemals einen Schlüssel.
- Header, mit denen der Tracy-Agent seine Konversation benennt (`x-tracy-session`, `x-tracy-actor`,
  `x-tracy-workspace-label`), werden aus `/v1`-Anfragen **entfernt**. Die Lease, die zwei Schreibende von
  einer Site fernhält, wird unter der eigenen Identität des Schlüssels (`key:<id>`) gehalten, festgelegt
  vom Server.

## Lebenszyklus

| Ereignis | Wirkung |
|---|---|
| Erstellt | Der vollständige Schlüssel wird einmal angezeigt. Tracy speichert einen Hash (HMAC-SHA256 mit einem serverseitigen Pepper); es kann das Secret nicht erneut anzeigen. |
| Verwendet | `last_used_at` bewegt sich, höchstens einmal pro Minute. |
| Abgelaufen (`expires_at`, optional) | Jeder Aufruf antwortet mit `401 KEY_EXPIRED`. |
| Vom Inhaber widerrufen | Jeder Aufruf antwortet mit `401 KEY_REVOKED`. **Ein Widerruf ist endgültig** — den Sitz später erneut zu gewähren, bringt den Schlüssel nicht zurück. |
| Sitz des Inhabers widerrufen | Jeder Aufruf antwortet sofort mit `403 SEAT_NOT_AUTHORIZED`; der Sitz wird bei jeder Anfrage geprüft, nicht gecacht. |
| Site gelöscht | Der Schlüssel wird mit ihr gelöscht. |

Schlüssel werden in Tracys Einstellungen verwaltet oder über die Konto-Türen auf Tracys eigenem Hostnamen
(`GET /api/me/keys`, `POST /api/me/keys`, `DELETE /api/me/keys/{id}`), die die Browser-Sitzung nehmen —
niemals einen Schlüssel.

## Schlüssel nicht in ein Frontend einbetten

Ein Schlüssel ist ein Secret mit der Reichweite deines Sitzes. Halte ihn auf einem Server, in einem
CI-Secret oder in einem lokalen Werkzeug; niemals in einer Seite, einer Mobile-App oder einem öffentlichen
Repository. Auf `/v1` antwortet die API einem Browser nur von einem einzigen Origin aus — dem dieser
Dokumentation, für den Button **Test request** in der [Referenz](/de/reference/) — und nie mit
Credentials, sodass eine Seite auf einem anderen Origin sie nicht einmal versehentlich mit einem
Schlüssel aufrufen kann. **Test request** speichert nichts: ein dort eingetippter Schlüssel lebt nur in
diesem Tab.

## Ratenbegrenzung

Die Limits gelten pro Schlüssel, in zwei Buckets, gezählt bevor der Aufruf die Site erreicht:

| Bucket | Limit | Was zählt |
|---|---|---|
| read | 6.000 pro Stunde | jede Route, die nichts ändert |
| write | 600 pro Stunde | jede Route, die die Site ändert (`PATCH`, `DELETE`, `POST …/contract/*`, `POST …/revert`) |

Über dem Limit lautet die Antwort `429 RATE_LIMITED` mit einem `Retry-After`-Header, der die Sekunden bis
zum nächsten Zeitfenster angibt. Der Zähler ist fail-closed: Kann er nicht gelesen werden, wird der Aufruf
abgelehnt, statt durchgelassen.

## Fehlercodes dieser Schicht

| Status | Code | Bedeutung |
|---|---|---|
| 401 | `KEY_INVALID` | Kein `Authorization: Bearer trk_…`, oder der Schlüssel existiert nicht oder sein Secret passt nicht. |
| 401 | `KEY_REVOKED` | Der Schlüssel wurde widerrufen. Erstelle einen neuen. |
| 401 | `KEY_EXPIRED` | Das `expires_at` des Schlüssels ist verstrichen. Erstelle einen neuen. |
| 403 | `SEAT_NOT_AUTHORIZED` | Der Inhaber des Schlüssels hält keinen aktiven Sitz auf dieser Site (der Sitz wurde widerrufen, oder der Pfad nennt eine andere Site). |
| 403 | `TOOLSET_NOT_GRANTED` | Die Aktion braucht einen Werkzeugsatz außerhalb von Scopes des Schlüssels ∩ Berechtigungen des Sitzes; die Antwort nennt `toolset` und `role`. |
| 429 | `RATE_LIMITED` | Über einem der beiden Buckets; warte `Retry-After` Sekunden. |

Jede andere Ablehnung — die eigenen Antworten der Site eingeschlossen — steht auf der Seite
[Fehler](/de/reference/errors/).
