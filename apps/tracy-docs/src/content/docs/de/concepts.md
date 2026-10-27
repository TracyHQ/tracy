---
title: Konzepte
description: Sites und Site-Schlüssel, Sitze, Rollen und Werkzeugsätze, die Inhaltskarte (Inhalt, Block, Feld, Slot, native), Revisionen und Versionen, Rückgängigmachen und Plugin-Versionen.
---

## Site und Site-Schlüssel

Eine **Site** ist eine Kunden-Website, die Tracy hostet oder importiert hat: eine Joomla-, WordPress- oder
EmDash-Installation mit eigener Adresse. Ihr **Site-Schlüssel** ist ihr kanonischer Name (zum Beispiel
`shop.example.com`) und erscheint in jedem Pfad: `/v1/sites/{key}/…`. Eine Site kann auch über einen Alias
erreicht werden; Tracy normalisiert den Schlüssel vor der Autorisierung, sodass die Antwort dieselbe ist,
egal welchen Namen du verwendet hast. Ein unbekannter Schlüssel antwortet mit `404`.

## Sitze, Rollen und Werkzeugsätze

Ein **Sitz** ist die Mitgliedschaft einer Person auf einer Site, mit einer **Rolle**: `owner`, `admin`,
`developer` oder `editor`. Eine Rolle gewährt **Werkzeugsätze** — die vier Familien, zu denen jede Aktion
gehört:

| Werkzeugsatz | Umfasst |
|---|---|
| `content` | Wörter, Bilder und Links: Datensätze, Inhalte, Contract-Applies, Medien-Uploads, Rückgängigmachen |
| `code` | Templates, Module, Erweiterungen, Themes, Plugins und das Layout, das sie definieren |
| `site` | die Daten der Site als Ganzes: Datenbanktabellen, Dumps, Snapshots |
| `lifecycle` | Bauen, Veröffentlichen, Wiederherstellen und Löschen der Site |

Welchen Werkzeugsatz jede Aktion braucht, steht in der [API-Referenz](/de/reference/) direkt daneben.
Die Standarduntergrenze ist: Editor → `content`; Developer → `content`, `code`; Admin → `content`, `code`,
`site`; Owner → alles. Eine Site- oder Workspace-Richtlinie darf eine Rolle unter diese Untergrenze
einengen, niemals erweitern. Ein API-Schlüssel fügt eine weitere Einengung hinzu: seine Scopes (siehe
[Authentifizierung](/de/authentication/)).

## Die Inhaltskarte

Die Content API beschreibt eine Site in einer einzigen Form, egal welches CMS. Von außen nach innen:

- **Seite** — eine Adresse der Live-Site, in einer Locale, mit der Liste der Inhalte, die sie zeigt.
  `GET /v1/sites/{key}/pages` antwortet mit jeder veröffentlichten Seite und einer `version` der Liste.
- **Inhalt** — eine bearbeitbare Einheit: ein Beitrag, ein Artikel, ein Menü, ein geteilter Bereich. Er
  hat eine `id`, einen `type` (die Inhaltstypen der Site — das `describe` der Site listet sie auf), eine
  `locale`, eine `revision`, seine `blocks` und `native`.
- **Block** — ein Teil eines Inhalts: eine Überschrift, ein Absatz, ein Bild, ein Call-to-Action. Blöcke
  tragen `fields` und eine `visibility` (`visible`, `hidden`, `unknown`), die sagt, ob die Live-Seite sie
  zeigt.
- **Feld** — ein Wert innerhalb eines Blocks: ein Text, ein Link, ein Bildpfad — die Ebene, auf der Wörter
  gelesen und, über den Datensatz, zu dem sie gehören, geschrieben werden.
- **Slot** — auf einer Site, die aus einem Tracy-Quickstart gebaut wurde, eine benannte Position, die das
  Design gefüllt hält (`hero.0`, `footer.contact`). Slots sind die Adressen von `POST …/contract/apply`,
  das jede Änderung gegen den Content-Contract der Site prüft, bevor es irgendetwas schreibt.
- **`native`** — die CMS-Zeilen, aus denen ein Inhalt stammt: die `kind` und `id` des Datensatzes (und auf
  WordPress der `key`), die ein `PATCH …/records/{kind}/{id}` ändert. Es ist die Brücke von der
  einheitlichen Karte zu den eigenen Daten der Site; die Leitfäden listen die Arten jedes CMS auf.

`GET /v1/sites/{key}/contents` listet Inhalte auf (filtere nach `type` und `locale`, blättere mit `limit`
und `cursor`, kürze mit `fields`, begrenze die Antwort mit `maxBytes`); `GET …/contents/{id}` liest einen
im Detail, Blöcke geblättert mit `blockId` und `blocksCursor`.

## Datensätze

Ein **Datensatz** ist eine Zeile des CMS, so wie die Site sie hält — die Oberfläche unter der Inhaltskarte.
Auf Joomla: `article`, `category`, `menuItem`, `module`, `templateStyle` und mehr; auf WordPress: `post`,
`postmeta`, `option`, `templatePart`, `term`, `menuItem`. `GET …/records/{kind}` listet eine Seite auf,
`GET …/records/{kind}/{id}` liest eine Zeile (WordPress-Arten ohne numerische ID nehmen `?key=`), `PATCH`
schreibt Felder, `DELETE` verschiebt sie in den Papierkorb. Datensätze haben keine Revisionsprüfung — ein
`PATCH` schreibt, was du sendest; lies zuerst und halte Schreibvorgänge klein.

## Revisionen, Versionen und `changedSince`

- Die **`revision`** eines Inhalts ändert sich, wenn sich dieser Inhalt ändert. `GET …/contents/{id}`
  antwortet damit als `ETag`; `If-None-Match` mit demselben Wert antwortet mit `304`.
- Die Seitenliste hat eine **`version`**. `GET …/changes?since=<version>` antwortet mit dem, was sich
  seitdem bewegt hat: die geänderten, hinzugefügten oder entfernten Inhalte und eine neue `version`, von der
  aus du weitermachst. Schick die letzte `version` als `If-None-Match` zurück, um günstig zu erfahren, dass
  sich nichts bewegt hat.
- **Die Grenzen von `changedSince`, klar gesagt.** Versionen werden im Speicher des Tracy-Prozesses für
  **30 Minuten** und höchstens **500 Durchläufe** gehalten; sie sind kein dauerhaftes Log. Ist eine Version
  zu alt, stammt sie aus der Zeit vor einem Neustart oder von einem anderen Sitz, lautet die Antwort
  `409 CONTENT_SNAPSHOT_EXPIRED` — lies `/pages` erneut ohne `since` und mach von seiner neuen `version`
  aus weiter.
- **`If-Match`** wird nur dort beachtet, wo die Site die Prüfung garantiert: `POST …/contract/apply` gibt
  es als erwartete Inhaltsrevisionen weiter, und eine veraltete Revision antwortet mit `409` und
  `REVISION_STALE`. `PATCH`/`DELETE` auf Datensätzen nehmen kein `If-Match`.

## Rückgängigmachen: `apply_id` und Revert

Jeder Schreibvorgang wird unter einer **`apply_id`** protokolliert — ein Beleg, den du im Header
`Tracy-Apply-Id` benennst (oder Tracy benennt ihn für dich: `api-<keyId>-<timestamp>`). Mehrere
Schreibvorgänge dürfen sich einen Beleg teilen; ein `DELETE` verlangt, dass du einen benennst.

- `GET /v1/sites/{key}/applies` — die Prüfspur der Applies der Site.
- `GET …/applies/{id}` — die unter einem Beleg protokollierten Schritte (Art, ID, Medienpfad, erstellt).
- `POST …/applies/{id}/revert` — stellt jeden Schritt wieder her, das Neueste zuerst; ein Datensatz, der im
  CMS-Editor geöffnet ist, verweigert den Revert, und die Antwort nennt, wer ihn hält (`lockedBy`).

Contract-Applies (`POST …/contract/apply`) werden auf dieselbe Weise rückgängig gemacht; ihre Belege
beginnen mit `contract-`.

## Idempotenz

`PATCH …/records/{kind}/{id}` akzeptiert einen **`Idempotency-Key`**-Header. Ein erneuter Versuch mit
demselben Wert nach einer verlorenen Antwort liefert das gespeicherte Ergebnis, statt erneut zu schreiben.
Er wird als `request_id` des Plugins an die Site weitergegeben und existiert daher nur für die Aktionen,
deren Plugin Ergebnisse speichert — `content.update` (`PATCH` auf Datensätzen) und, auf Joomla,
`content.batch`. Keine andere Route verspricht das.

## Plugin-Versionen

Auf Joomla und WordPress antwortet die Site über das darauf installierte **Claude-Cowork-Plugin**, und jede
Aktion existiert ab einem bestimmten Release dieses Plugins. `GET /v1/sites/{key}` (das `describe` der
Site) meldet, was die Site ausführt; die Seite [Kompatibilität](/de/reference/compatibility/) listet
das Mindest-Release pro Aktion auf, und jeder Leitfaden sagt, wie du aktualisierst. Eine Aktion, die dem
installierten Release fehlt, antwortet mit `400 bad_action`; ein Content-API-Lesevorgang auf einem Plugin,
das älter ist als die Content API, antwortet mit `501 CONTENT_ADAPTER_UNSUPPORTED`.

EmDash-Sites haben kein Plugin: Tracy liest sie über seinen eigenen Reader (siehe den
[EmDash-Leitfaden](/de/guides/emdash/)).

## Designsystem

Jede Site, die Tracy baut, trägt ein **Designsystem**: eine benannte Farbpalette, Schriftskala und
Abstände, gespeichert als CSS-Custom-Properties (Tokens). `GET /v1/sites/{key}/design` sagt dir,
welches, woher es stammt (`source`: ein System aus dem Katalog, die eigene `brand` des Kunden, die
Tokens eines `quickstart`, die des `template` oder `none`) und welche Token-Werte die Site trägt.
Tracy hält sie beim Bau der Site fest und erneut, sobald `theme.style` das Aussehen wechselt – die
Antwort folgt also der Site, nicht der Vorlage, von der sie ausging. Nutze die Tokens, damit alles,
was du schreibst, in der Palette und den Schriften der Site bleibt: Eine Farbe oder Schrift außerhalb
davon ist genau das, was Tracys Designprüfung markiert.

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

`{"design": null}` ist eine Antwort, kein Fehler: Die Site trägt kein System, das Tracy kennt. Das
ETag folgt `updatedAt`, daher antwortet `If-None-Match` mit `304`, bis sich das Aussehen ändert.
